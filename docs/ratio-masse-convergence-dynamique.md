# Ratio de masse et convergence PBD en dynamique — compte rendu

Question tranchée et en production. Ce document garde le pourquoi, ce qui a été fait, ce que ça
coûte, et ce que la mesure a réfuté en chemin — pas le journal des cinq passes qui y ont mené.
Le banc reste rejouable dans `scratch/ssor/` (README + patches).

Trois questions en sont sorties et vivent ailleurs :

- **quel moteur de simulation** — `choix-du-moteur-de-simulation.md` ;
- **les poutres en corps rigides**, et le nœud sur-contraint qui en est le meilleur argument —
  `poutre-corps-rigide-dynamique.md` ;
- **les courroies en dynamique** — `courroie-dynamique.md`.

## Le problème

Deux causes distinctes, et il ne faut pas les confondre.

**Le cinématique n'a jamais eu de vraie masse.** `parsing.ts` (`get_sim_nodes`) donne 1 à tout
nœud libre et 0 à un nœud ancré, quelle que soit la valeur `mass` tapée sur l'élément. Aucun
ratio de masse ne peut y naître ; le champ que l'utilisateur remplit y est décoratif. Ce n'est
donc pas un algorithme plus robuste, c'est une absence de donnée d'entrée.

**Le dynamique est mathématiquement sensible au ratio, et ce n'est pas un bug
d'implémentation.** `projectOnSegment` résout exactement sa propre contrainte, mais le solveur
global est un **Gauss-Seidel sur les contraintes** : chacune est résolue en série, ignorant les
autres, et il faut plusieurs sweeps pour que l'ensemble se rejoigne. Un ratio extrême a le même
effet qu'une chaîne plus longue — l'information « le lourd tire » doit faire plusieurs
allers-retours par le chemin léger avant que tout le monde soit d'accord. C'est le
conditionnement de Gauss-Seidel, pas une formule à retoucher.

Le premier fix (plafond de sweeps élargi + sortie anticipée par résidu) achète donc **plus
d'itérations du même processus lent** : il repousse le seuil sans l'éliminer.

## Ce qui a été fait : alterner le sens de balayage

Un sweep pair en ordre normal, un sweep impair en ordre inversé (Gauss-Seidel symétrique). Sur
une chaîne sérielle, un aller-retour est une substitution avant/arrière — **donc un solve
direct.** Sur un arbre, ce n'est pas « la convergence s'améliore », c'est le problème qui
disparaît.

Résidu maximal du pivot de `CP.slidep` sur 40 frames, en mètres :

| masse suspendue | sans alternance | avec alternance |
| --------------- | --------------- | --------------- |
| 1 kg            | 1.12e-5         | 2.38e-21        |
| 100 kg          | 1.57e-3         | 3.72e-19        |
| 1000 kg         | 1.71e-2         | 3.41e-18        |
| 3000 kg         | 6.37e-2         | 1.04e-17        |

En production : `kinematics/sweep-order.ts` (`reversed_sweep_order`), branché dans `PBD_solve`.
Deux verrous — **pas dynamique uniquement**, et **chaîne non redondante uniquement**.

### Le critère n'est PAS l'acyclicité, et il a fallu deux corrections pour l'admettre

_Première._ Un cycle de graphe ne distingue pas une boucle cinématique d'une barre rigide
portant un cavalier : le `FixedOnSegment` qui épingle un nœud sur une poutre forme un triangle
avec le `Distance` de cette poutre, donc tout mécanisme à poutre chargée lit « cyclique » —
`CP.slidep` compris, c'est-à-dire le seul cas où le gain existe. Remplacé par un **comptage de
redondance** : une chaîne alterne si les lignes qu'elle porte (`Σ ddl`) ne dépassent pas ses
inconnues libres.

_Seconde._ **Le comptage ne voit pas une dépendance linéaire.** Une courroie porte un brin de
trop sur une boucle fermée, et un agrégat qui est la somme télescopée des lois qu'il couvre :
chacun ajoute une ligne ET une inconnue, donc aucun comptage ne les distingue d'une contrainte
utile. Le critère final **nomme** ces deux types de liens en plus du comptage. Le comptage reste
nécessaire de son côté : c'est lui qui épingle les treillis hyperstatiques et `Core XY`.

Ce que ça laisse alterner sur la galerie : `CP`, les cantilevers, `Vilbrequin` (avec ou sans
masse), `Puente`, `Treillis` (6/7), `Line from rotation`, `Balance`, `Test slider`, `Petit`,
`Roues isolées`, `trac-comp`. Ce que ça épingle : tout ce qui porte une courroie, `Jansen`,
`Core XY`.

## Ce que ça coûte : la « taxe » de ~0.57 %, et ce qu'elle cachait

**Décision produit prise (Arnaud) : Slidep peut supporter de l'ordre de 1 % d'erreur sur la
lecture des efforts.** C'est à cette taxe-là qu'elle répondait — lire la section suivante avant
de s'y fier.

> **Plus dépensée PAR LA LECTURE depuis la phase 10 de `plan-efforts-interieurs.md`** : les
> efforts affichés ne viennent plus du chemin de correction du tout. Elle reste dépensée par la
> géométrie, qui n'a pas bougé — voir la fin de document.

La taxe elle-même est bien caractérisée, et ce n'est pas une perte d'équilibre : sur le
cantilever de référence, `start.fy = −100.571496` et `end.fy = +0.571496`, dont **la somme est
−100.000000 exactement**. C'est UNE quantité mal attribuée qui glisse d'une extrémité du membre
à l'autre. Les réactions d'appui restent donc justes, et ce sont les diagrammes N/T/Mf le long
d'une poutre (`recording/cohesion-field.ts`) qui la portent.

**Et ce n'est pas une propriété de l'alternance.** Mesuré en 2×2 sur le cantilever chargé à
mi-portée (`scratch/beam-body/midpoint-isolation.test.ts`) : l'erreur exige à la fois
l'alternance ET le nœud milieu virtuel de la poutre ; chacun seul donne exactement −100, au bit
près. C'est une interaction — l'alternance rend visible le chemin concurrent du nœud milieu —
et 1.142992 vaut exactement deux fois le 0.571496. Voir
[[poutre-corps-rigide-dynamique]].

## La lecture des efforts est cassée, bien au-delà de la « taxe »

> **Corrigé depuis, partout** : plus aucune lecture d'effort ne passe par le chemin de
> correction (`plan-efforts-interieurs.md` phase 10), donc les chiffres ci-dessous ne décrivent
> plus aucune poutre. Ils restent le constat qui a motivé le chantier, et le diagnostic du
> défaut lui-même — qui, lui, est toujours dans le solveur.

**Cette section remplace « ce que ça coûte : ~0.57 % ». Le chiffre était juste, sa portée non :
il avait été mesuré sur deux cantilevers sans gravité, c'est-à-dire les deux cas où le nœud
milieu de la poutre ne porte rien.** Dès que la poutre porte son propre poids, l'erreur change
d'ordre de grandeur.

Un cantilever encastré ne portant que lui-même. La vérité est la statique, sans choix de
modélisation ni tolérance : `m·g` de tranchant et `m·g·L/2` de moment à la racine. Mesuré aux
valeurs de production (`scratch/beam-body/self-weight.test.ts`) :

| longueur | alternance ON (production) | alternance OFF |
| -------- | -------------------------- | -------------- |
| 0.5 m    | exact                      | exact          |
| 1 m      | exact                      | exact          |
| 1.5 m    | **−16.67 %**               | **−10.74 %**   |
| 2 m      | **−16.67 %**               | exact          |
| 3 m      | **−33.33 %**               | exact          |
| 5 m      | **−33.33 %**               | exact          |

Trois choses à en tirer.

**1. L'erreur est quantifiée en parts de masse lumpée.** 16.67 % = 1/6, 33.33 % = 2/6 — soit
une ou deux fois `BEAM_END_MASS_FRACTION`. Elle ne se répartit pas continûment : elle manque par
paquets. Lue entrée par entrée sur une poutre de 3 m, elle est portée par `KeepOrientation`
(9.810 au lieu de 14.715) et par le `FixedOnSegment` du nœud milieu (9.810 au lieu de 19.620) —
c'est-à-dire par les liens INTERNES à la poutre, exactement ceux que le modèle corps supprime.

**2. La géométrie s'améliore pendant que la lecture se dégrade.** Sous alternance, la flèche du
bout libre vaut 1e-19 (la poutre est tenue exactement) contre 8e-7 sans. Le mode qui donne les
positions les plus justes donne les efforts les plus faux. C'est le découplage déjà annoncé,
mais à pleine échelle et sur le cas le plus simple qui soit : **une réaction est lue sur le
CHEMIN de correction, pas sur l'état** — et plus le solveur devient exact, moins ce chemin
contient d'information.

**3. Désactiver l'alternance ne serait pas un correctif.** Elle lit exact à 1, 2, 3 et 5 m mais
−10.74 % à 1.5 m. Aucun des deux modes n'est fiable ; ils se trompent seulement à des endroits
différents.

**Ce que ça fait à la décision produit.** « Slidep peut supporter ~1 % d'erreur sur la lecture
des efforts » a été tranché contre une taxe de 0.57 %. Le vrai chiffre sur le cas le plus banal
de la RDM est de 17 à 33 %, et il est en production aujourd'hui. La décision n'est pas invalidée
— elle n'a simplement jamais porté sur ce défaut-là, qui n'était pas connu. Elle est à
re-prendre une fois la lecture réparée, pas avant.

**Ce que ça fait à la priorité.** La « troisième voie » notée ici comme ouverte sans bloquer —
recalculer les réactions une fois convergé, plutôt que de les intégrer le long du chemin — n'est
plus une amélioration optionnelle : c'est la seule façon de rendre un chiffre juste, et elle ne
dépend d'aucun choix de modèle. Elle passe devant tout le reste, y compris devant
[[poutre-corps-rigide-dynamique]] — dont l'étape « réécrire la lecture des efforts » était déjà
identifiée comme la seule à concevoir plutôt qu'à porter, et qui supprimerait précisément les
liens sur lesquels la lecture actuelle s'appuie.

Test de garde : `behaviour/self-weight-reaction.test.ts`, la poutre courte passe, la longue est
`it.fails` avec les mesures ci-dessus.

## Recalculer la lecture depuis l'état convergé — diagnostic et conception

### Où l'erreur naît exactement

Sur la poutre de 3 m (masse 3 kg, lumps 0.5 / 2.0 / 0.5 kg), les réactions brutes lues à la
dernière substep :

| lien | à `start` | à `end` | à `mid` |
| ---- | --------- | ------- | ------- |
| `Distance` | ~0 | ~0 | — |
| `KeepOrientation` | −9.810 | +9.810 | — |
| `FixedOnSegment` (nœud milieu) | −4.905 | −4.905 | **+9.810** |
| `External` (lump ancré de `start`) | −4.905 | — | — |

Le nœud milieu pèse 2 kg, soit **19.620 N**. Son `FixedOnSegment` doit donc lui fournir
+19.620 et repousser autant vers les extrémités. Il en rapporte **exactement la moitié**. Le
total à `start` vaut −19.620 au lieu de −29.430, et l'écart est précisément la moitié manquante
du lump milieu.

La somme sur TOUTES les entrées est en revanche conservée (−4.905 dans les deux modes de
balayage) : ce n'est donc pas une perte, c'est une attribution — une part de l'impulsion qui
tient le nœud milieu n'est portée par aucune entrée lisible à `start`.

### Deux hypothèses formulées et RÉFUTÉES

À consigner, parce que chacune est plausible et qu'il ne faut pas les re-tenter :

1. **« C'est l'amorçage de la vitesse du nœud milieu. »** Le nœud milieu est réépinglé à chaque
   substep avec sa vitesse posée à `vs.lerp(ve, 0.5)` ; l'idée était qu'une partie de
   l'impulsion vienne de cette affectation plutôt que de la contrainte, donc échappe à la
   comptabilité. Mesuré en neutralisant l'amorçage : **chiffres identiques au bit près**.
   Réfuté.
2. **« C'est l'alternance du sens de balayage. »** Elle change bien la lecture (17 % à 33 %
   selon la longueur), mais la couper ne donne pas juste non plus : exact à 1, 2, 3 et 5 m,
   −10.74 % à 1.5 m. Ce n'est donc pas la cause, seulement un révélateur.

L'erreur est quantifiée en parts entières de `BEAM_END_MASS_FRACTION` (0, 1 ou 2 sixièmes selon
la longueur), ce qui ressemble à un lump entier mal attribué plutôt qu'à un défaut continu de
convergence — piste non élucidée à ce stade.

### La conception, qui ne dépend pas d'élucider ce défaut

C'est le point : **on arrête de lire les efforts sur le chemin de correction.** Quelle que soit
la cause de la mauvaise attribution, elle devient sans objet.

Le torseur de cohésion à une coupure est, par définition, le bilan du tronçon situé au-delà :

```
R_coh(s) = Σ_{corps au-delà de s} m_i·(a_i − g)  −  Σ charges ponctuelles au-delà de s
                                                 −  R_transmis(L)
```

Tout le membre de droite est disponible dans l'état convergé : masses (modèle de masse),
accélérations (`DynamicSnapshot.accelerations`), charges (`compiledLoads`), positions. Une seule
inconnue subsiste, `R_transmis(L)` — l'effort qui traverse le joint du bout opposé.

**Et pour toute poutre dont le bout opposé ne porte rien, cette inconnue est nulle.** Le torseur
est alors entièrement déterminé sans lire une seule réaction. C'est le cas des trois tests qui
échouent aujourd'hui, et c'est le cas le plus courant en RDM : le cantilever.

`recording/cohesion-field.ts` intègre DÉJÀ le poids propre net d'inertie le long de la travée
(`density_at_ends`, `μ·(g − a(s))`) ; ce qu'il reçoit de `beam-cohesion.ts` n'est que la valeur
au bord. C'est donc uniquement cette valeur au bord qu'il faut cesser de lire sur les liens.

### Étape 1, faite : le torseur au bord lu sur l'état convergé

`beam-cohesion.ts` calcule désormais le torseur par **bilan de corps libre** plutôt qu'en
sommant des réactions, partout où le bilan se referme sans inconnue. Ce que ça donne sur les
trois vérités analytiques disponibles :

| cas | avant | après |
| --- | ----- | ----- |
| cantilever sous son poids, 1.5 à 5 m | −16.67 % à −33.33 % | **exact** |
| cantilever à masse en mi-portée | −1.14 % | **exact** |
| cantilever à charge en bout | exact | exact (inchangé) |

Deux `it.fails` sont devenus des tests normaux (`self-weight-reaction.test.ts` et le cas à masse
en mi-portée de `beam-cohesion.test.ts`) ; la suite complète passe 948/1.

**Le critère d'éligibilité a demandé deux corrections, dont une trouvée par régression.**

_Première (prévue)._ Une charge répartie disqualifie la poutre : sa part est aujourd'hui
partagée entre le torseur au bord et la marche de `cohesion-field`, et les deux devraient
d'abord être réconciliées.

_Seconde (non prévue, attrapée par le treillis à deux barres de `beam-cohesion.test.ts`)._
« Aucun autre lien ne nomme `k1` » ne veut PAS dire « rien n'est transmis en `k1` » : un bout
**ancré** transmet sa réaction d'appui sans qu'aucun lien ne le nomme, puisque l'ancrage est
une masse nulle et non une ligne de contrainte. Le critère complet est donc « bout libre ET non
ancré », la seconde moitié étant évaluée à la résolution (`CohesionBalance.isAnchored`) et non à
la compilation.

**Un détail cinématique qui compte.** Prendre l'accélération du nœud milieu pour la moyenne de
celle des deux bouts laisse tomber le terme centripète, ce qu'une poutre en rotation libre lit
comme une compression fantôme (attrapé par `cohesion-field.test.ts`). Les trois lumps sont donc
évalués sur le **même champ d'accélération rigide** que la marche de `cohesion-field`
(`a(s) = a₀ + ŷ·α·s − x̂·ω²·s`), pour que le bord et la marche ne puissent pas être en désaccord
sur la cinématique propre de la poutre.

### Ce que ça couvre, et ce que ça ne couvre pas

Mesuré sur la galerie (`scratch/beam-body/balance-coverage.test.ts`) : **28 poutres sur 110**.

> **Périmé** : le bilan par poutre a été remplacé par un système d'équilibre global, qui couvre
> toutes les poutres sauf celles dont un nœud touche une courroie, un engrènement ou un contact.

Couvert intégralement : les cantilevers, `CP`, `Huygens`, `Test slider`. Presque pas couvert :
les tringleries — `Jansen` 0/10, `Line from rotation` 0/9, `Puente` 1/18 — parce que chaque
poutre y transmet à ses deux bouts.

C'est la forme attendue, et elle situe la suite : l'étape 2 (remonter la chaîne depuis les
feuilles) gagne les chaînes ouvertes comme `Double Cantilever` ou `Puente`, mais **pas `Jansen`
ni `Line from rotation`, dont les poutres sont toutes dans une boucle** — celles-là relèvent de
l'étape 3, où l'effort transmis est une vraie inconnue de contrainte, et où la question
hyperstatique de `choix-du-moteur-de-simulation.md` reprend la main.

Là où le bilan ne s'applique pas, la lecture par réaction reste en place, inchangée — donc le
défaut mesuré plus haut y subsiste. Il n'est pas corrigé partout, il est corrigé là où il est
démontrable.

### Le découpage, et où il en est

> **Périmé en entier — voir la fin de document.** L'étape 1 a été livrée
> puis retirée ; les étapes 2 et 3 n'ont pas été faites de cette façon, et la lecture par
> réaction n'a survécu nulle part, boucles comprises.

1. ~~**Poutres à bout libre** : `R_coh` calculé par bilan, sans aucune réaction.~~ **Fait** —
   voir ci-dessus. Le critère a demandé une moitié de plus que prévu (« non ancré »).
2. **Poutres en chaîne** : `R_transmis` obtenu en remontant l'arbre depuis les feuilles, toujours
   sans réaction. Juge : `Double Cantilever bis`, dont la lecture dépend aujourd'hui de l'ordre
   de balayage d'un facteur ~1.9.
3. **Boucles** : le bilan ne suffit plus, l'effort transmis y est une vraie inconnue de
   contrainte. C'est là — et seulement là — que la lecture par réaction reste nécessaire, et
   c'est aussi là que la question hyperstatique de `choix-du-moteur-de-simulation.md` reprend
   la main.

L'étape 1 est autonome et livrable seule.

## Ce que la mesure a réfuté

Consigné parce que chacune de ces croyances a coûté une passe, et qu'aucune n'est intuitivement
fausse :

- **« L'alternance est bonne partout sauf sur les courroies fermées. »** Non. Elle est exacte
  sur un ARBRE, contre-productive sur une BOUCLE QUI SATURE SON BUDGET (`Core XY` : résidu
  1.7 à 2.1× pire à budget égal, vérifié contre l'artefact de parité du dernier sweep), et
  divergente sur une boucle à mode libre (courroie fermée).
- **« Le ratio de masse est un problème général. »** Non, c'est un problème d'ARBRE. Rapporté à
  l'envergure de chaque mécanisme, `CP.slidep` à 3000 kg laisse une erreur de **212 %** de sa
  propre taille, là où un vilbrequin également chargé reste à **0.005 %** — vingt fois sous le
  seuil à partir duquel Slidep signale seulement une contrainte comme non satisfaite. Le pathos
  naît du bout libre chargé : grue, bras, pendule, balance.
- **« Positions exactes et réactions justes vont ensemble. »** Non, elles se découplent : une
  réaction se lit sur le CHEMIN de convergence, pas sur son point d'arrivée. Changer l'ordre
  change le chemin sans changer le point d'arrivée. Toute option qui touche au déroulé des
  sweeps paiera cette taxe, et aucune ne s'en apercevra en regardant la géométrie.
- **« Le resserrement aux courroies ouvertes débloquera `Core XY`. »** Non — c'était une
  extrapolation d'un comptage de liens, pas une mesure. `Core XY` sature déjà ses 200 sweeps
  sans alternance ; il n'y a aucune marge où « moins de sweeps » puisse se mesurer.

## La lecture des efforts sort de ce document — le ratio de masse, non

**Ce qui est clos ici est un sous-chantier, pas le sujet.** Le problème de ce document est une
GÉOMÉTRIE fausse sous ratio de masse, et il est entier. Rien de ce qui suit n'y touche.

Ce qui est clos, c'est la branche « la lecture des efforts est cassée » ouverte plus haut. Elle
avait été rattachée à ce document parce que le même défaut d'attribution la portait ; elle en
sort par une porte qui ne mène pas au reste.

Le découpage ci-dessus prévoyait trois étapes : bilan pour les poutres à bout libre, remontée de
l'arbre pour les chaînes, et lecture par réaction conservée dans les boucles faute de mieux. Les
étapes 2 et 3 n'ont pas été faites ainsi. **La lecture par réaction a disparu en entier**, y
compris dans les boucles — voir `plan-efforts-interieurs.md` phase 10.

Ce qui a changé le plan, c'est une mesure. Sur `Masse suspendue` (un treillis en boucle chargé à
5 t) et sur `Double Cantilever`, les deux lectures qui cohabitaient alors ont été confrontées au
calcul à la main :

| lecture | treillis en boucle | cantilever soudé |
| --- | --- | --- |
| réactions sommées (λ) | `N` à ~1 % | `T` faux de 60 %, `Mf` perdu en entier |
| bilan de corps libre | perd 100 % de la charge (7.7 N pour 49 kN) | exacte |

**Aucune des deux n'était bonne partout, et la seconde — celle que l'étape 1 venait de livrer —
était la fausse sur le cas le plus lourd.** Son corps libre bâtissait l'équilibre sur la masse
propre de la poutre et sur les seuls `LoadElement` : une masse fusionnée sur `k1` n'est ni un
lien ni une charge, elle sortait du bilan sans rien signaler. Le résidu de bouclage de
`cohesion-field.ts` ne pouvait pas l'attraper — il compare la marche d'une poutre à sa propre
lecture au bout, deux grandeurs issues du même torseur, donc il bouclait à 0.002 N sur une
réponse fausse de 49 kN. Le contrôle qui l'attrape est le bilan **aux nœuds** (`node-balance.ts`),
qui confronte une poutre à tout ce qui lui est coïncident.

À la place des étapes 2 et 3 : un système d'équilibre global, trois équations par corps,
l'inertie en d'Alembert, résolu par image. Isostatique exact sans aucune hypothèse de matériau ;
hyperstatique tranché par l'énergie complémentaire minimale (Menabrea) à partir des `E`/`A`/`I`
déjà présents, vérifié contre `3wL/8`, `wL²/8`, `wL²/12` et `wL²/24`.

### Ce que ça fait aux constats de ce document

**La décision produit « ~1 % d'erreur sur la lecture des efforts » n'est plus dépensée PAR LA
LECTURE.** Les efforts affichés ne viennent plus du chemin de correction, donc ni la taxe de
0.57 %, ni les 17 à 33 % du cantilever sous son poids, ni le facteur ~1.9 de `Double Cantilever
bis` ne les touchent.

**Elle reste dépensée par la géométrie**, et c'est le point à ne pas perdre. La passe de statique
résout l'équilibre de la pose qu'on lui donne : elle n'a aucun moyen de savoir que cette pose est
fausse, et elle en rend fidèlement les efforts. Sur `CP`, où la poutre s'allonge de 58 % ou le
cavalier glisse de 5.2 % selon l'ordre de balayage, les `N`/`T`/`Mf` affichés décrivent
exactement ce mécanisme-là — cohérents avec eux-mêmes, et faux de la même façon que lui. Le
budget d'erreur sur les efforts a donc changé de consommateur, il n'a pas été libéré.

**« On arrête de lire les efforts sur le chemin de correction » était la bonne conception**, et
elle valait plus large que ce qui était annoncé : elle ne dépendait pas d'élucider le défaut
d'attribution, et elle n'a finalement pas eu besoin non plus de la remontée d'arbre. Le
diagnostic du nœud sur-contraint, lui, est confirmé et mesuré une fois de plus — cette fois sur
une BOUCLE réelle et plus seulement sur le cantilever-jouet. Résidu de marche en multiples du
poids propre de chaque poutre, `Masse suspendue` à densité réelle :

| balayage | avec nœud milieu | sans (invalide : −2/3 de masse) |
| --- | --- | --- |
| alternance **ON** | **0.9 – 2.8 ×** | ~0.67 × |
| alternance **OFF** | **0.002 – 0.2 ×** | ~0.67 × |

À `rho = 0`, donc sans nœud milieu compilé du tout, le résidu de force est exactement 0.000 dans
les quatre cases. **L'erreur exige bien les deux**, exactement comme ce document le dit. Et
couper l'alternance n'est toujours pas une porte de sortie : `Epan` passe alors de 113.65 à
113.21 kN contre 114.5 attendu — l'alternance est ce qui fait du balayage un solve direct.

Ce défaut reste donc entier **dans le solveur**, et il continue de compter pour la géométrie et
pour [[poutre-corps-rigide-dynamique]]. Il ne compte simplement plus pour ce qui est affiché.

### Une note de ce document est contredite par la mesure

« Prendre l'accélération du nœud milieu pour la moyenne de celle des deux bouts laisse tomber le
terme centripète, ce qu'une poutre en rotation libre lit comme une compression fantôme. »

Mesuré à nouveau en montant le champ des deux façons, c'est **l'inverse** sur ce cas. Le champ
rigide `a(σ) = a₀ + ŷ·α·σ − x̂·ω²·σ` est affine, donc sa moyenne sur la portée EST sa valeur à
mi-portée : les deux constructions coïncident exactement dès que les accélérations enregistrées
satisfont la rigidité. Quand elles ne la satisfont pas, ancrer sur `a₀` hérite de toute l'erreur
d'un seul bout, tandis que la moyenne n'en porte que la moitié de chacune. Sur la poutre en
rotation libre de `cohesion-field.test.ts`, dont un bout lisait **27× moins** que son
accélération centripète, l'ancrage sur `a₀` produisait une compression monotone là où la physique
demande une traction symétrique — et la moyenne rend le résultat exact, pic à mi-portée et zéro
machine aux deux bouts libres.

Les deux ancrages ont été ramenés au centre (`equilibrium-solve.ts` pour l'équation de la poutre,
`cohesion-field.ts` pour la marche). L'ancienne note reste consignée telle quelle plus haut :
elle avait raison sur le fond — le bord et la marche ne doivent pas être en désaccord sur la
cinématique de la poutre — et seulement tort sur laquelle des deux constructions le garantit.

## Ce qui reste ouvert : le sujet lui-même

Pour mémoire, puisque la branche « efforts » a occupé la moitié de ce document et qu'elle est
partie :

- **`CP.slidep` a toujours une géométrie non réaliste**, mesuré à nouveau sur le code actuel
  (`scratch/statics/cp-geometry.test.ts`), donc APRÈS la pose de la compliance axiale sur les
  liens `Distance` :

  | image | allongement du membre de 5 mm | en part de l'envergure (30 mm) |
  | --- | --- | --- |
  | 30 | **+54.5 %** | 9.1 % |
  | 200 | +22.8 % | 3.8 % |
  | 600 | **+19.7 %** | 3.3 % |

  Le membre de 30 mm, lui, tient exactement, et les nœuds restent exactement sur leur poutre
  (l'alternance est active — sans elle, l'erreur repasse dans le glissement du cavalier, 5.2 %).
  **Ce n'est pas la compliance qui travaille** : 20 % de déformation, c'est deux ordres au-delà
  de tout domaine élastique, et ça ne se résorbe pas — 600 images plus tard le membre est encore
  un cinquième trop long. C'est la signature d'un MODÈLE, pas d'un réglage de solveur, et c'est
  ce que ce document a ouvert.
- **La cause reste celle identifiée ici** : une contrainte de distance entre deux masses
  ponctuelles très inégales. Aucune option de balayage ne la retire ; seule la disparition de
  cette contrainte le fait, c'est-à-dire [[poutre-corps-rigide-dynamique]].
- **Le nœud sur-contraint** est confirmé sur une boucle réelle (mesures ci-dessus) et continue
  de peser sur la géométrie.
- **`epsilon`, seuil absolu résiduel** — voir la section suivante.

## Relevé en marge, non corrigé

**`epsilon` est le dernier seuil absolu d'un solveur devenu relatif partout ailleurs.**
`kinematics/PBD_kinematic_solver.ts:320` et `:374`, valeur 1e-6, jamais passé par aucun
appelant, comparé à un `maxError` qui mélange mètres et radians. Sur un mécanisme au plancher
`MIN_EXTENT_M` (1 mm), il vaut 1e-3 de l'extent — soit exactement `DIAGNOSTIC_TOLERANCE_RATIO` :
la sortie « plus rien ne bouge » se déclencherait au niveau que les diagnostics appellent
« violé ».
