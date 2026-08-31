# Ratio de masse et convergence PBD en dynamique — pourquoi, et quoi faire

Ce doc reprend depuis le début la discussion sur `CP.slidep` : pourquoi le mode dynamique laisse
une erreur de position qui grandit avec la masse portée, pourquoi le mode cinématique n'a jamais
ce problème, ce que le fix déjà appliqué (élargissement du plafond de sweeps + sortie anticipée
par résidu, voir `PBD_kinematic_solver.ts:900-916` et `simulation-engine.ts:1256-1265`) a
réellement changé, et les options pour aller plus loin — pensées au-delà de ce seul cas de test.

**Deuxième passe.** L'expérience SSOR a été refaite avec un banc instrumenté
(`scratch/ssor/`), et elle renverse les conclusions de la première : le gain était sous-estimé
de quinze ordres de grandeur, la « régression inexpliquée » a une cause nommée, et la manip a
révélé un coût que personne n'avait cherché (les réactions se dégradent là où les positions
deviennent exactes). Les sections concernées portent la correction plutôt que de l'effacer. Sont
venues s'y ajouter deux causes qui ne sont pas des causes de solveur : la représentation des
poutres, et l'absence de raideur pour arbitrer une structure hyperstatique.

## Le vrai pourquoi

Il y a deux causes séparées, et il ne faut pas les confondre — l'une explique pourquoi le
cinématique est immunisé, l'autre explique pourquoi le dynamique ne l'est pas et ne peut pas
l'être facilement.

### 1. Le cinématique n'a jamais eu de vraie masse

`parsing.ts:142` (`get_sim_nodes`, ce que `step_simulation` utilise) :

```ts
posMasses.set(element.id, element.isGrounded ? 0 : 1);
```

Chaque nœud libre pèse **1**, quelle que soit la valeur `mass` tapée sur l'élément. Le champ
`mass` n'est lu nulle part dans cette branche. Il n'existe, numériquement, que dans
`compute_dynamic_mass_model` (`mass-model.ts`), consommé uniquement par
`step_dynamic_simulation`. Le cinématique n'esquive donc pas le problème par un algorithme plus
robuste : il n'a simplement **aucune donnée d'entrée** qui pourrait produire un ratio de masse.
Le champ que l'utilisateur remplit est décoratif tant qu'on reste en cinématique.

C'est une réponse structurelle, pas un hasard d'implémentation : tant qu'on veut que la masse
compte physiquement (poids, inertie, réactions) — ce qui est tout le but du mode dynamique — on
est obligé de l'injecter dans les poids de correction du solveur, et c'est exactement ce qui
ouvre la porte au problème.

### 2. Le dynamique EST mathématiquement sensible au ratio, et ce n'est pas un bug d'implémentation

`projectOnSegment` (`constraint-functions.ts:69-127`, ce que `FixedOnSegment` — la contrainte du
pivot — utilise) calcule, pour CETTE contrainte seule :

```ts
const denom = wNode + wStart * a * a + wEnd * t * t;
const lx = Cx * (stiffness / denom);
// ...répartition de la correction en proportion des wᵢ (masse inverse) de chaque nœud
```

C'est un multiplicateur de Lagrange local, résolu **exactement** pour cette contrainte prise
isolément — ce n'est pas une approximation grossière. Le point faible n'est pas cette formule,
c'est que le solveur global est un **Gauss-Seidel sur les contraintes** : chaque contrainte est
résolue exactement l'une après l'autre, en série, chacune ignorant que la précédente et la
suivante existent au moment où elle s'exécute. Un `sweep` = un passage sur toutes les contraintes.
Il en faut PLUSIEURS pour que l'ensemble converge vers un état conjointement cohérent, parce que
corriger la contrainte B dérange ce que la contrainte A venait de satisfaire.

Le taux de décroissance de cette convergence (le rayon spectral de l'itération) est justement ce
que le code documente déjà pour l'effet de longueur de chaîne :

> `PBD_kinematic_solver.ts:172-184` — *« r ≈ 1 − c/N² »* pour une chaîne de N liens.

Un ratio de masse extrême a exactement le même effet qu'une chaîne plus longue : sur
`CP.slidep`, la correction de la masse lourde doit être quasi entièrement absorbée par le pivot
(le nœud léger) à chaque passage — c'est physiquement correct localement (le lourd résiste) —
mais ce pivot est lui-même contraint par la poutre 1, elle-même contrainte par le joint ancré.
L'information « la masse lourde tire » doit faire l'aller-retour par ce chemin plusieurs fois
avant que tout le monde soit d'accord. Chaque aller-retour supplémentaire, c'est un sweep de
plus. C'est un fait numérique connu (le conditionnement d'un système de Gauss-Seidel/block
coordinate descent se dégrade avec le ratio des poids locaux), pas une négligence corrigible en
retouchant une formule.

### 3. Et une cause en amont du solveur : une poutre n'est pas un corps rigide

Les deux causes ci-dessus prennent le modèle pour acquis. Il ne devrait pas l'être. Une poutre
est représentée par **deux points indépendants reliés par un lien `Distance`**, pas par un corps
à trois DDL (x, y, θ). Deux conséquences directes sur tout ce que ce doc raconte :

- **Ça double la longueur de la chaîne de Gauss-Seidel.** Le `N` de `r ≈ 1 − c/N²` n'est pas le
  nombre de pièces, c'est le nombre de nœuds à traverser : une chaîne de 8 poutres, c'est ~16
  nœuds et 16 liens, pas 8. La moitié de la lenteur analysée plus haut est un choix de
  représentation, pas une fatalité de Gauss-Seidel.
- **L'inertie de rotation doit être reconstituée à la main.** `BEAM_END_MASS_FRACTION = 1/6`
  (`mass-model.ts`) plus un nœud milieu virtuel réépinglé par un `FixedOnSegment` à chaque
  substep, avec sa vitesse à réamorcer sinon la contrainte mange le bout de la poutre — le tout
  pour retrouver le `mL²/12` qu'une formulation corps rigide donne gratuitement. Le raisonnement
  est juste et documenté, mais c'est un nœud et une contrainte de plus par poutre, en dynamique
  uniquement, pour une propriété que le modèle aurait dû porter.

Passer les poutres en corps rigides divise `N` par ~2, donc `1 − r` par ~4, supprime le nœud
milieu et ses effets de bord, ne touche ni le noyau du solveur ni les courroies, et laisse
ouvert le choix de solveur pour plus tard. C'est le meilleur rapport gain/risque de tout ce
document, et il ne figure dans aucune des options ci-dessous parce qu'il n'est pas une option de
solveur.

### Donc, sur le fix déjà appliqué

Élargir le plafond de sweeps et ajouter la sortie anticipée par résidu (déjà fait) **achète plus
d'itérations du même processus lent** — ça ne change pas le taux de décroissance, seulement le
budget qu'on lui accorde. C'est pour ça que ça repousse le seuil (de ~100 kg à ~300 kg sur ce
mécanisme précis) sans jamais l'éliminer : à ratio suffisamment extrême, même un plafond
beaucoup plus haut coûte cher pour un gain de plus en plus faible (mesuré : 25 sweeps → 1.05e-2,
200 → 1.7e-3, 800 → 1.1e-2... la décroissance ralentit visiblement). Ce n'est pas un point
d'arrivée — c'est le sol sur lequel les options ci-dessous s'appuient.

## Expérience menée : l'ordre de sweep symétrique (SSOR) — mesurée deux fois

On a tenté l'alternance du sens de parcours des contraintes à chaque sweep (pair en ordre
normal, impair en ordre inversé — technique connue sous le nom de symmetric Gauss-Seidel/SSOR).
L'intuition : aujourd'hui `sort_links` produit un ordre BFS fixe depuis l'ancre
(`utils.ts:108`), parcouru à l'identique à chaque sweep — une correction ne peut avancer que
dans un sens par sweep, alors qu'elle doit faire l'aller-retour pour converger.

La première passe a conclu à une régression inexpliquée sur les courroies fermées et a annulé la
modification. La deuxième passe a repris la manip avec un interrupteur à quatre positions et des
mesures par horizon plutôt qu'un seul échantillon. **Les deux conclusions de la première passe
étaient fausses** : le gain était très largement sous-estimé, et la « fragilité mystérieuse » a
une cause identifiée. Banc rejouable : `scratch/ssor/` (README + patch).

### Le gain : ce n'est pas « la convergence s'améliore », c'est le problème qui disparaît

Résidu maximal du pivot de `CP.slidep` sur 40 frames, valeurs par défaut du solveur, en mètres :

| masse suspendue | sans alternance | avec alternance |
| --- | --- | --- |
| 1 kg | 1.12e-5 | 2.38e-21 |
| 100 kg | 1.57e-3 | 3.72e-19 |
| 300 kg | 5.47e-3 | 8.05e-19 |
| 1000 kg | 1.71e-2 | 3.41e-18 |
| 3000 kg | 6.37e-2 | 1.04e-17 |

Quinze ordres de grandeur, et une dépendance à la masse qui subsiste seulement au niveau de
l'arrondi machine. Ce n'est pas une convergence accélérée, c'est une **résolution exacte** : sur
une chaîne sérielle, un aller-retour de Gauss-Seidel est une substitution avant/arrière, donc un
solve direct. `CP.slidep` est un arbre — d'où l'exactitude.

C'est un résultat important au-delà de ce cas : **l'alternance donne gratuitement, sur les
mécanismes arborescents, ce que l'option 3 (coordonnées réduites, Featherstone) promet au prix
de plusieurs semaines de travail.** Le tableau ci-dessous est à lire en gardant ça en tête.

### Le coût : une cause identifiée, et un résidu qui ne vient pas d'où on croyait

Écart d'angle entre deux listages de `Huygen's chain drive`, rapporté au trajet parcouru (le
test échoue au-delà de 1 %) :

| frames | sans alternance | alternance totale | alternance sauf conditionnement courroie |
| --- | --- | --- | --- |
| 30 | 0.40 % | 3.5 % | 0.29 % |
| 60 | 1.00 % | 27 % | 1.7 % |
| 120 | 0.41 % | 43 % | 4.1 % |
| 240 | 0.45 % | **72 %** | 0.85 % |
| 360 | 0.46 % | 33 % | 0.65 % |
| 480 | 1.22 % | 30 % | 1.1 % |

Trois lectures, dans l'ordre d'importance :

**1. L'alternance totale diverge, et la cause est la redondance délibérée des courroies.** Une
courroie fermée porte un jeu de contraintes volontairement surdéterminé — un
`BeltSegmentNoSlip` de trop par boucle, plus `BeltSubChainAggregate` — et `analysis-model.ts`
le dit noir sur blanc : *« le solveur veut chaque brin pour le conditionnement, le compte de
rang ne doit pas tous les avoir »*. Sur un système redondant, Gauss-Seidel converge vers un
point du noyau **choisi par l'ordre de parcours** ; le point fixe du balayage avant et celui du
balayage arrière ne sont pas le même, et alterner ne converge donc vers ni l'un ni l'autre.
Épingler ce seul jeu de liens (ils gardent leurs créneaux et leur ordre avant, tout le reste
alterne) supprime la divergence : 72 % → 0.85 %, et `recorder-rewind.test.ts` repasse. Ce
n'était donc pas une fragilité inexpliquée des courroies, mais la conséquence prévisible d'une
redondance assumée ailleurs dans le modèle.

**2. Mais ce n'est pas toute l'histoire, et l'hypothèse « c'est la courroie » est réfutée pour
le reste.** Il subsiste une erreur 2 à 4× la ligne de base, et elle ne vient PAS des liens de
courroie : épingler *toute* la machinerie courroie au lieu du seul jeu redondant donne 5.63°
contre 5.41°, soit rien. Elle vient de l'alternance des liens ordinaires, et elle a le même
caractère que l'erreur déjà présente sans alternance — bornée, oscillante, jamais croissante.
À noter d'ailleurs : la ligne de base elle-même atteint 1.00 % à 60 frames et 1.22 % à 480,
donc frôle et dépasse le seuil du test à d'autres horizons que les 120 frames qu'il
échantillonne. Le seuil de 1 % n'est pas une propriété convergée du mécanisme.

**3. `Poulie bloqueuse` est insensible dans les trois modes** (l'écart tombe à 0 exactement sans
alternance, à ~1e-3 degré avec, trois ordres sous la tolérance). Le problème est spécifique aux
boucles fermées portant réellement le mode de circulation libre.

### Coût inattendu : les réactions, pas les positions

Suite complète sous alternance-sauf-courroies : **5 échecs sur 851**.

- `bit-exact.test.ts` — par construction, tout changement de solveur le casse. Non significatif.
- `belt-closed-determinism.test.ts` et `falsify-constraint.test.ts` — les deux points ci-dessus.
  Pour `falsify` le mécanisme est explicite : `resistance` compare un résidu à 10 % d'un
  `SMALL_LIE` de 0.002, donc au bruit de convergence lui-même ; celui-ci ayant grossi d'un
  facteur 2 à 4, une contrainte indépendante passe pour résistante. Le même test avec
  `BIG_LIE` (25× plus gros) passe dans tous les modes — c'est un rapport signal/bruit, pas une
  redondance structurelle inventée.
- **`beam-cohesion.test.ts` et `reaction-forces.test.ts` — les deux nouveaux, et les plus
  instructifs.** Deux cantilevers, deux lectures RDM qui se dégradent d'environ 0.5 % :
  −100.571 N au lieu de −100 (tolérance 0.5), et 0.0081 au lieu de 0 (tolérance 0.005).

Ce dernier point est le vrai enseignement de la manip, et personne ne l'avait anticipé : sur
`CP.slidep`, l'alternance rend les **positions** exactes au bit près — et elle dégrade quand
même les **réactions**. Les deux qualités sont découplées, parce qu'une réaction n'est pas lue
sur l'état final mais sur le CHEMIN qui y mène (`PBD_solve` divise le Δ accumulé par lien sur
tout le balayage). Changer l'ordre change le chemin sans changer le point d'arrivée. Toute
option qui touche à la façon dont les sweeps se déroulent — 1, 2, 3 et 4 comprises — paiera
cette taxe-là, et aucune ne s'en apercevra en regardant seulement la géométrie.

### Où ça laisse cette option

Ni « correction facile et sans risque », ni « régression inexpliquée à écarter ». C'est une
option **très rentable sur les arbres et interdite en l'état sur les boucles fermées
redondantes** — et cette frontière est exactement celle que `analysis-model.ts` sait déjà
tracer, puisqu'il calcule les chaînes indépendantes, leur compte de Grübler et leur
hyperstaticité. La forme raisonnable n'est donc pas « on alterne » ou « on n'alterne pas », mais
**alterner par chaîne, seulement là où la chaîne est un arbre**. Reste à décider ce qu'on fait
de la taxe de 0.5 % sur les réactions, qui elle ne dépend pas de la topologie.

### Troisième passe : l'alternance par chaîne, prototypée et mesurée

Prototype dans `scratch/ssor/solver-ssor-perchain.patch` (mode `perchain`), classification
calculée à la compilation par `tag_ssor_tree_links` — `analysis-model.ts` est inatteignable
depuis le solveur (il importe `simulation-engine.ts`, qui importe le solveur : cycle garanti),
donc un union-find sur les clés libres remplace l'analyse existante, et le résultat est porté
par un champ ad hoc `link.ssorTree` plus un `SimulationModel.ssorTreeKeys` pour les liens
reconstruits à chaque substep.

**Ça marche, et c'est vérifié indépendamment** (mesures rejouées, pas reprises du rapport) :

- exactitude sur les arbres **intégralement conservée** — `CP.slidep` donne 1.04e-17 à 3000 kg,
  au bit près comme l'alternance totale ;
- écart de listage sur `Huygen's chain drive` de retour **exactement** sur la ligne de base, à
  trois chiffres significatifs, à chacun des six horizons ;
- suite complète : 3 échecs sur 848, contre 5 sous `nobelt`. `belt-closed-determinism` et
  `falsify-constraint` repassent ; restent `bit-exact` (par construction) et les deux tests de
  réaction.

Deux choses que la mesure a apprises et que le prototype ne dit pas.

**1. La taxe sur les réactions est une REDISTRIBUTION, pas une perte.** Sur le cantilever à
charge à mi-portée, la sonde donne `start.fy = −100.571496` et `end.fy = +0.571496` là où la
vérité est −100 et 0. Leur somme fait −100.000000 exactement. Le même 0.571496 se retrouve sur
`start.m`. Ce n'est donc pas une erreur d'équilibre — la résultante est juste — c'est UNE
quantité mal attribuée qui glisse d'une extrémité du membre à l'autre. Conséquence produit,
qui change la question posée plus haut : **les réactions d'appui restent bonnes ; ce sont les
diagrammes d'efforts intérieurs le long d'un membre (`cohesion-field.ts`) qui portent l'erreur**,
puisque c'est exactement le partage entre les deux extrémités qu'ils tracent.

**2. La granularité « par chaîne » n'est exercée par aucun mécanisme de la galerie.** Mesuré sur
les 21 fichiers de `test-mechanisms/` (`scratch/ssor/ssor-coverage.test.ts`) : **tout mécanisme
portant une courroie est épinglé en entier — 0 lien alterné sur 43 pour `Core XY`, 0 sur 19 pour
Huygens, 0 sur 14 pour `Poulie bloqueuse`** ; tous les autres sont alternés en totalité (ou à un
lien inerte près). Aucun cas mixte. Sur la galerie actuelle, « par chaîne » est donc
opérationnellement identique à un booléen « ce modèle contient-il de la machinerie de courroie »,
et l'union-find, le champ `ssorTree` et `ssorTreeKeys` sont une assurance pour des mécanismes
qu'on ne dessine pas encore — pas une valeur mesurée. À garder ou non les yeux ouverts, mais pas
à justifier par les chiffres ci-dessus.

Cette même mesure fait apparaître un manque à gagner que personne n'avait vu : **`Core XY` ne
gagne rien alors qu'il n'a aucune courroie FERMÉE.** Ses 43 liens sont épinglés parce que
`BeltSubChainAggregate` est émis pour toute courroie, ouverte comprise, et que le critère
l'assimile à une boucle. C'est défendable (un agrégat est redondant par construction, ouvert ou
fermé) mais peut-être trop prudent : la divergence mesurée sur Huygens tient au **mode de
circulation libre** d'une boucle fermée, qu'une courroie ouverte n'a pas. Si le critère peut être
resserré aux seules courroies fermées, le plus gros mécanisme de la galerie — celui-là même que
`PBD_kinematic_solver.ts` cite comme référence de convergence lente (r ≈ 0.98) — passe de zéro à
tout. C'est la mesure suivante la plus rentable de tout ce document.

**3. Correction : « boucle sans courroie » est massivement exercé, et ça affine la théorie.**
Une version antérieure de cette section affirmait le contraire — c'était faux, mesuré depuis
(colonne `boucle` de `ssor-coverage`, cycle détecté par union-find sur le graphe des clés
libres). **Sept mécanismes de la galerie portent une boucle fermée, aucune courroie, et sont
alternés en totalité** : `Vilbrequin`, `Vilbrequin double slider`, les deux `Jansen`,
`Line from rotation`, `Puente`, `Test slider` — et `Treillis`, qui est un treillis, donc
hyperstatique, donc porteur de contraintes redondantes. Tous passent.

Un treillis hyperstatique qui alterne proprement, c'est en apparence contre la théorie
« la redondance casse l'alternance ». En réalité ça la précise, et c'est le résultat le plus
utile de cette passe :

- **redondance à positions déterminées** (treillis hyperstatique) — les lignes de contrainte sont
  dépendantes, mais la configuration solution reste un point unique. L'alternance y converge
  comme n'importe quoi d'autre ; seul le PARTAGE DES EFFORTS est indéterminé, et c'est exactement
  la taxe de 0.57 % mesurée plus haut. Sans danger pour la géométrie.
- **redondance couplée à un mode libre** (courroie fermée) — la circulation de la courroie est un
  mode neutre : toutes les poulies tournant d'autant laissent la géométrie inchangée. Là, des
  ordres différents sélectionnent des points DIFFÉRENTS le long de ce mode, et rien ne les
  rappelle. D'où la dérive à 72 %.

Le bon critère n'est donc ni « machinerie de courroie », ni même « courroie fermée » : c'est
**« redondance couplée à un mode libre »**, dont la circulation d'une courroie fermée est le seul
cas connu dans le code. Ça prédit directement que le resserrement proposé ci-dessus doit
marcher — une courroie OUVERTE a ses deux extrémités tenues, donc pas de mode de circulation,
donc elle relève du premier cas, celui que `Treillis` valide déjà.

Enfin, un détail de nommage qui trompera le prochain lecteur : `ssorTree` ne dit pas « arbre ».
Un lien dont toutes les clés sont ancrées n'est pas taggé non plus, et un quadrilatère articulé
ordinaire — une boucle fermée, sans courroie — EST taggé « arbre » (et à raison, cf. ci-dessus).
Le contenu réel du champ est « touche une clé libre dans une composante sans machinerie de
courroie ». À renommer avant toute mise en production.

### Quatrième passe : resserrer aux courroies fermées — sûr, mais sans le gain espéré

Patch `scratch/ssor/solver-ssor-closedbelt.patch` (remplace `solver-ssor-perchain.patch`,
même mode `perchain`). Le seul changement de logique : `BeltSubChainAggregate` n'épingle plus
sa chaîne à lui seul, seulement quand `link.closed` (il porte déjà ce champ, comme
`BeltSegmentNoSlip`). Champ renommé au passage comme annoncé ci-dessus : `ssorTree` →
`ssorAlternate`, `ssorTreeKeys` → `ssorAlternateKeys`, `tag_ssor_tree_links` →
`tag_ssor_alternate_links` — il ne dit plus « arbre », il dit « peut alterner ».

**Sûreté : l'hypothèse tient, mesurée indépendamment de la couverture.**

- `ssor-coverage` : `Core XY` 0/43 → 41/43 liens alternés, `Core XY - 2 moteurs` 0/46 → 44/46.
  Les quatre mécanismes à courroie FERMÉE (`Huygens`, `Poulie bloqueuse`, `Déconnexion
  courroie`, `Poutre sur joint de courroie`) restent épinglés à 0 alterné, sans changement.
- Non-régression bit-exacte sur tout le reste : `ssor-probe` donne des gaps identiques à
  trois chiffres significatifs sur `Huygens`/`Poulie bloqueuse` aux six horizons,
  `ssor-reaction-probe` redonne exactement 0.571496 (la même taxe qu'en troisième passe), et
  `ssor-mass-probe` redonne 1.04e-17 sur `CP.slidep` à 3000 kg. Le resserrement ne touche
  rien de ce qui marchait déjà — cohérent avec la théorie : une courroie ouverte n'a pas de
  mode de circulation, donc pas de raison de diverger, et c'est bien ce qui est mesuré.

**Le gain sur `Core XY` : nul, et légèrement négatif au budget que la production paie
réellement.** Aucune sonde n'existait pour ça ; `scratch/ssor/ssor-corexy-convergence-probe.test.ts`
en ajoute une, sur deux quantités :

- **Sweeps avant sortie anticipée** — la quantité que `PBD_kinematic_solver.ts` cite déjà
  lui-même pour parler de vitesse de convergence sur ce mécanisme. Elle ne discrimine rien
  ici : dès la deuxième frame entraînée, `Core XY` épuise déjà le budget de 200 sweeps EN
  MODE `off`, alternance ou pas (seule la frame 0, un démarrage à froid depuis la pose
  exacte, sort tôt : 92 sweeps). `r ≈ 0.98` documenté dans le solveur n'est pas une
  hypothèse : ce mécanisme sature déjà son budget en régime établi, donc il n'y a aucune
  marge où « moins de sweeps » puisse se mesurer.
- **Pire résidu au budget fixe (200 sweeps)** — la quantité qui reste, puisque le budget est
  identique des deux côtés. Mesurée à quatre frames (1, 5, 10, 15) : sous `perchain`
  resserré, le résidu est systématiquement 1.4× à 2× celui de la ligne de base. Alterner les
  41 liens nouvellement libérés ne rapproche pas la solution plus vite à budget égal — ça la
  dégrade légèrement. `constraint_severity` reste à 0 dans les deux modes sur 60 frames
  entraînées, donc rien de tout ça n'est visible à l'utilisateur — mais ce n'est pas non plus
  le gain promis.

Cause probable, lue sur la trace (`collect_solver_trace`) : `Core XY` porte une vraie boucle
cinématique sans aucune courroie (le parallélogramme du chariot — `boucle=OUI` dans
`ssor-coverage` même sans belt), donc une redondance au sens `Treillis`. Mais contrairement à
une simple chaîne en arbre, l'alternance sur ce genre de boucle n'est pas une substitution
avant/arrière exacte en un aller-retour : le résidu maximum par sweep OSCILLE d'un sweep à
l'autre sous alternance (5.1e-6 / 1.0e-5 en fin de budget, contre une décroissance quasi
monotone sous `off`) — le même caractère « bornée, oscillante » déjà noté en deuxième passe
pour les liens ordinaires de `Huygens`, ici assez large pour effacer le gain espéré plutôt
que de rester anecdotique.

**`falsify-constraint.test.ts` — le faux ami annoncé, vérifié, et affiné.** Resserrer remet
`Core XY` en alternance et le test recommence à échouer : une assertion sur cinq, « aucune
taille de mensonge ne sépare partout » (`small.invented` non vide, un `FixedOnSegment`
accusé à tort). L'explication de la deuxième passe (signal/bruit de `resistance()` contre le
seuil `RESISTED`) a été vérifiée plutôt que reprise, en faisant varier la taille du mensonge
de `SMALL_LIE` à `BIG_LIE` — et elle ne suffit PAS ici :

- `resistance()` du lien accusé est quasiment identique en `off` et en `perchain` resserré, à
  chaque taille de mensonge testée (écart de quelques % à 30 % près, jamais un basculement de
  part et d'autre de `RESISTED = 0.1`) — donc ce n'est pas `resistance()` qui devient plus
  bruitée.
- Ce qui bascule, c'est la classification de RANG elle-même : `find_redundant_links` et
  `probe_chain_mobility` (`mobility-probe.ts`) appellent aussi `PBD_solve`, donc
  `SLIDEP_SSOR` les affecte tout autant que la simulation. Sur la chaîne de `Core XY`,
  `h = 6` avec 33 à 34 liens sur 43 jugés interchangeables par leave-one-out — un ensemble
  énorme et dégénéré. Un seul lien bascule dedans/dehors entre les deux modes (34 → 33),
  exactement le genre de bascule attendue au bord d'un ensemble aussi dégénéré, sous un
  solveur dont le résidu au budget fixe bouge déjà de 1.4-2× (mesure ci-dessus).

Donc : toujours du bruit, pas une redondance réellement mal résolue — mais un mécanisme
différent de celui identifié en deuxième passe. L'oracle de rang lui-même (pas seulement
`resistance()`) est sensible à l'ordre de balayage. Sans conséquence sur la simulation
(positions et sévérité inchangées, voir ci-dessus) ; conséquence potentielle sur l'OUTIL de
diagnostic de redondance (`redundant-links.ts`, le panneau des contraintes dispensables) si
l'alternance devait un jour tourner en dehors de ce banc — hors sujet de cette passe, à
garder en tête pour la suivante.

**Suite complète, une fois, sous `perchain` resserré : 4 échecs sur 848** — les trois déjà
identifiés en troisième passe (`bit-exact`, la taxe de réactions inchangée sur
`beam-cohesion.test.ts` et `reaction-forces.test.ts`) plus `falsify-constraint.test.ts`
ci-dessus. Rien d'autre.

**Verdict.** L'hypothèse (« c'est la redondance couplée à un mode libre, pas la redondance
seule ») est confirmée sur la sûreté : resserrer aux courroies fermées ne casse rien, et une
courroie ouverte se comporte comme `Treillis` l'a déjà montré. Mais la valeur qui motivait
cette mesure — « le plus gros retour sur investissement restant » — était une extrapolation
du comptage de liens de la troisième passe, pas une mesure, et la mesure la contredit : à
budget de sweeps constant, le resserrement ne rapporte rien sur `Core XY`, et coûte
légèrement en précision de résidu pour ce même budget. Le resserrement reste correct à
adopter EN MÊME TEMPS que l'alternance par chaîne elle-même (il corrige un vrai bug de
critère, sans lui aucune courroie ouverte n'a jamais sa chance) — mais il ne change rien à
l'arbitrage de la section suivante, et ne doit plus être vendu comme le levier qui débloque
`Core XY`.

**Contre-vérification de l'anti-résultat, et ce qu'elle révèle.** `finalMaxResidual` est lu sur
le DERNIER sweep seulement, donc toujours à la même parité — alors que le résidu OSCILLE d'un
facteur 2 d'un sweep à l'autre sous alternance. Soupçon légitime d'artefact de mesure : la
« dégradation » pouvait n'être que l'amplitude de l'oscillation, échantillonnée du mauvais côté.
Mesuré en ajoutant l'avant-dernier sweep et en prenant le MINIMUM de la paire (comparaison
sans parité) :

| frame | `off` | `perchain` | rapport |
| --- | --- | --- | --- |
| 1 | 8.26e-6 | 1.71e-5 | 2.07× |
| 5 | 4.70e-5 | 8.20e-5 | 1.75× |
| 10 | 1.07e-4 | 1.86e-4 | 1.75× |
| 15 | 1.80e-4 | 3.02e-4 | 1.68× |

**Soupçon réfuté, anti-résultat confirmé** : même à la parité favorable, l'alternance reste 1.7 à
2.1× moins bonne à budget égal. L'oscillation est bien réelle (sous `off`, dernier et
avant-dernier sont quasi égaux ; sous alternance, exactement 2×) mais elle s'ajoute à une
enveloppe réellement plus haute, elle ne l'explique pas.

**Et ça change la conclusion générale, au-delà de `Core XY`.** L'alternance n'est pas « bonne
partout sauf sur les courroies fermées ». Elle est :

- **exacte sur un ARBRE** (`CP.slidep`, 1e-17) — c'est une substitution avant/arrière ;
- **contre-productive sur une BOUCLE** (`Core XY`, 1.7-2× de résidu en plus à budget égal) — un
  aller-retour n'y est plus une résolution directe, et l'oscillation qu'il installe coûte plus
  qu'elle ne rapporte ;
- **divergente sur une boucle à mode libre** (courroie fermée, 72 %).

Or le critère actuel ne distingue que le troisième cas. Il laisse donc l'alternance tourner sur
`Jansen`, `Puente`, `Treillis`, `Vilbrequin`, `Core XY` — tous `boucle=OUI` dans
`ssor-coverage` — c'est-à-dire précisément là où elle est un coût net. **Le critère devrait être
l'acyclicité réelle**, ce que `ssorTree` prétendait nommer sans jamais le calculer. La détection
de cycle existe déjà (union-find sur le graphe des clés libres, colonne `boucle` de
`ssor-coverage`) : c'est une quinzaine de lignes, déjà écrites, à déplacer dans le classificateur.
Seul `CP.slidep` et les vrais arbres alterneraient alors — exactement là où le gain est mesuré.

### Cinquième passe : le problème est-il un problème d'ARBRE ? Oui, et ça ferme le sujet

Quatre passes n'avaient mesuré le ratio de masse que sur `CP.slidep`, qui est un arbre. Toute
la valeur de l'alternance en dépendait, sans que personne ait vérifié si les boucles souffrent
du même mal. `Vilbrequin + masse lourde.slidep` (un système bielle-manivelle — boucle
cinématique fermée, aucune courroie — portant une masse sur sa bielle) répond, via
`scratch/ssor/ssor-loop-mass-probe.test.ts`.

Métrique : pire erreur géométrique laissée par le solveur sur les contraintes lisibles
directement sur les positions (longueur d'une poutre, place d'un nœud rigidement fixé sur sa
poutre — la contrainte même qui lâche sur `CP.slidep`). En mètres, donc comparable, **et
rapportée à l'échelle propre de chaque mécanisme**, qui n'est pas la même : `CP.slidep` fait
3 cm d'envergure, le vilbrequin 63 cm.

| masse | `CP.slidep` (ARBRE, 3 cm) | | `Vilbrequin` (BOUCLE, 63 cm) | |
| --- | --- | --- | --- | --- |
| | absolu | % de l'envergure | absolu | % de l'envergure |
| 1 kg | 1.12e-5 | 0.04 % | 3.08e-7 | 0.00005 % |
| 100 kg | 1.57e-3 | 5.2 % | 1.23e-6 | 0.0002 % |
| 1000 kg | 1.71e-2 | 57 % | 9.91e-6 | 0.0016 % |
| 3000 kg | 6.37e-2 | **212 %** | 3.30e-5 | **0.005 %** |

**La boucle est immunisée, à quatre ordres de grandeur près.** À 3000 kg l'arbre est disloqué
(l'erreur dépasse deux fois sa propre taille) tandis que la boucle reste **vingt fois sous le
seuil à partir duquel Slidep signale seulement une contrainte comme non satisfaite**
(`DIAGNOSTIC_TOLERANCE_RATIO`, 0.1 % de l'envergure). L'erreur croît bien avec la masse dans les
deux cas, mais sur la boucle elle part de si bas qu'elle n'arrive nulle part.

L'hypothèse tient donc, et elle a une explication simple : une boucle se referme sur elle-même,
donc chaque nœud est tenu par plusieurs chemins et la correction n'a pas à remonter toute la
chaîne. Le pathos naît du bout libre chargé — grue, bras, pendule, balance — c'est-à-dire d'un
arbre.

**Conséquence directe : l'alternance restreinte aux arbres est une réponse COMPLÈTE, pas la
moitié d'une.** Il n'y a pas de second chantier à prévoir pour les boucles, parce qu'il n'y a pas
de problème à y résoudre. L'option 0 (agrégat), que la quatrième passe recadrait « sur ce que
l'alternance ne peut pas toucher », perd du même coup sa dernière justification dans ce
document.

Mesuré au passage, sur le même mécanisme sous alternance : 1.31e-7 / 8.60e-7 / 8.67e-6 / 3.37e-5
aux mêmes masses — c'est-à-dire **légèrement meilleur à faible masse, identique à forte masse**.
L'alternance n'est donc pas nocive sur toute boucle, contrairement à ce que la quatrième passe
laissait croire : `Core XY` la paie parce qu'il SATURE son budget de sweeps (43 liens, 200 sweeps
épuisés à chaque frame), pas parce qu'il est une boucle. Le critère d'acyclicité reste le bon
choix — conservateur, il n'abandonne rien de mesurable — mais pour cette raison-là, pas pour
celle qu'on croyait.

## DÉCISION PRODUIT — PRISE : ~1 % d'erreur sur les efforts est acceptable

**Tranché par Arnaud.** Slidep peut supporter de l'ordre de 1 % d'erreur sur la lecture des
efforts. La taxe de 0.57 % mesurée ci-dessous n'est donc pas un blocage : l'alternance peut
passer en production. En parallèle, et sans bloquer la mise en production, on cherchera comment
corriger la lecture elle-même (voir « la troisième voie » plus bas).

### Ce que ça donne comme forme de mise en production

La décision, combinée à la cinquième passe, réduit beaucoup le chantier — trois observations
qui se cumulent :

1. **Le problème est dynamique.** La cinématique n'a que des masses binaires 0/1 (`parsing.ts`,
   cause 1 du « vrai pourquoi ») : aucun ratio de masse ne peut y naître, donc rien à y corriger.
2. **Le problème est arborescent.** Cinquième passe : une boucle chargée à 3000 kg reste vingt
   fois sous le seuil de signalement.
3. Donc la règle de production tient en une ligne : **alterner l'ordre de balayage uniquement
   pour les liens d'une chaîne ACYCLIQUE, et uniquement dans un pas DYNAMIQUE.**

Le gain est intégralement conservé (le seul cas mesuré où il existe est `CP.slidep`, un arbre en
dynamique) et le rayon d'impact s'effondre :

- **Plus aucune logique spécifique aux courroies.** Une courroie fermée boucle par construction ;
  une courroie ouverte aussi, via l'arête de raccourci qu'ajoute `BeltSubChainAggregate`. Le
  critère d'acyclicité les exclut toutes les deux sans les nommer. `BELT_MACHINERY`, le test
  `closed`, la distinction ouverte/fermée des passes 2 à 4 : tout disparaît.
- **La conséquence 2 disparaît.** `mobility-probe.ts` appelle `PBD_solve` sans `dynamics`
  (`mobility-probe.ts:275`) : l'oracle de rang, donc le panneau des contraintes dispensables, ne
  voit jamais l'alternance.
- **Les tests cinématiques ne bougent plus.** `bit-exact`, `belt-closed-determinism`,
  `recorder-rewind`, `falsify-constraint` passent tous par `step_simulation` ou par l'analyse,
  jamais par `step_dynamic_simulation`.

Restent donc exactement les deux tests qui portent la taxe acceptée — `beam-cohesion.test.ts` et
`reaction-forces.test.ts` — à re-baseliner en exprimant la tolérance qu'ils admettent plutôt
qu'en recopiant les nouvelles valeurs.

### Le détail de la taxe, pour mémoire

Deux conséquences avaient été identifiées. Le gate « dynamique seulement » ci-dessus en annule
une ; l'autre est celle qu'Arnaud a acceptée. Les deux restent consignées ici : si le gate devait
sauter un jour, la seconde revient.

### Conséquence 2 — le panneau des contraintes dispensables change ce qu'il affiche

`probe_chain_mobility` et `find_redundant_links` (`mobility-probe.ts`) appellent `PBD_solve`
comme oracle — c'est le principe même de l'analyse par sondage, et sa qualité (voir l'en-tête de
`mobility-probe.ts` : « rien ici ne réimplémente une contrainte »). Le revers : **l'ordre de
balayage affecte l'oracle exactement comme il affecte la simulation.** Mesuré sur `Core XY` en
quatrième passe : `h = 6`, 33 à 34 liens sur 43 jugés interchangeables par leave-one-out, et
**un lien bascule dedans/dehors** selon le mode (34 → 33).

Sans conséquence sur la simulation (positions et sévérité inchangées). Mais `redundant-links.ts`
alimente le panneau qui dit à l'utilisateur QUELLES contraintes il peut retirer — donc cette
liste changerait. Sur un ensemble aussi dégénéré (34 candidats équivalents), n'importe quel
choix est défendable et aucun n'est « le bon » ; ça reste un affichage qui bouge sans que rien
n'ait changé dans le dessin.

**Annulée par la forme retenue** : `mobility-probe.ts:275` appelle `PBD_solve` sans `dynamics`,
donc l'oracle de rang n'alterne jamais. Le critère d'acyclicité l'aurait de toute façon écartée
de son côté (`Core XY` est une boucle). Deux verrous indépendants plutôt qu'un.

### Conséquence 1 — la taxe de 0.57 % sur les efforts intérieurs

**Ce qui est en jeu, précisément.** Activer l'alternance fait disparaître le problème de ratio de
masse (résidu 6.4e-2 → 1.0e-17 sur `CP.slidep` à 3000 kg) et coûte, en échange, une erreur de
0.57 % sur les efforts intérieurs. Cette erreur est bien caractérisée :

- ce n'est **pas** une perte d'équilibre — la résultante est exacte au bit près
  (`start.fy + end.fy = −100.000000` sur le cantilever de référence) ;
- c'est **une** quantité mal attribuée qui glisse d'une extrémité d'un membre à l'autre ;
- donc les **réactions d'appui restent justes**, et ce sont les **diagrammes N/T/Mf le long d'une
  poutre** (`cohesion-field.ts`) qui portent l'erreur, puisqu'ils tracent exactement ce partage ;
- elle est indépendante de la topologie et du mode d'alternance (identique dans `all`, `nobelt`
  et `perchain`) : c'est le prix de l'alternance elle-même, pas de la façon de la restreindre.

**Ce qu'il faudrait savoir avant de trancher, et qui n'est pas mesuré.** Est-ce que le
`−100.000000` de la ligne de base est ROBUSTE, ou un heureux hasard du budget de sweeps actuel ?
Autrement dit : la lecture d'effort d'aujourd'hui est-elle exacte, ou déjà entachée d'une erreur
du même genre que l'alternance ne ferait qu'agrandir ? Se mesure en faisant varier le nombre de
sweeps sur `scratch/ssor/ssor-reaction-probe`, sans alternance. Une demi-heure.

**Les trois issues possibles :**

1. **La ligne de base est exacte et 0.57 % est inacceptable** → l'alternance ne passe pas en
   production telle quelle. Il faut alors soit corriger la lecture des réactions (les recalculer
   après convergence plutôt que de les intégrer sur le chemin), soit y renoncer.
2. **La ligne de base est exacte et 0.57 % est acceptable** → adoption, en documentant la
   précision des diagrammes RDM.
3. **La ligne de base n'est pas exacte non plus** → l'arbitrage change de nature : ce n'est plus
   « introduire une erreur » mais « en agrandir une qui existe déjà et n'est pas annoncée ». Ça
   déplace la priorité vers la fiabilisation de la lecture d'efforts elle-même, indépendamment de
   l'alternance.

À rapprocher de la section « une question qui n'est pas de convergence » plus haut : sur une
structure HYPERSTATIQUE, le partage des efforts est de toute façon choisi par l'ordre de
résolution et non par la physique. L'alternance ne crée donc pas ce problème — elle le rend
visible sur un cas isostatique, où on peut enfin le chiffrer.

## Cadre d'évaluation

Chaque option ci-dessous est pesée sur cinq axes, pas seulement « est-ce que ça règle
`CP.slidep` ». `CP.slidep` est un révélateur, pas le problème en soi : n'importe quel mécanisme
avec une pièce lourde au bout d'un membre léger touche la même limite à des degrés divers.

- **Performance générale** — pas juste « converge-t-il sur CE cas », mais est-ce que ça coûte
  plus ou moins cher, en moyenne, sur la bibliothèque de mécanismes existante.
- **Précision générale** — au-delà du résidu du pivot : dérive accumulée sur une simulation
  longue, exactitude des réactions affichées (`LinkReaction`, `beam-cohesion.ts`).
- **Déterminisme / risque de régression** — l'expérience SSOR ci-dessus donne la forme précise de
  ce risque, et elle est moins effrayante mais plus large qu'on ne l'avait écrit : ce n'est pas
  « toucher un solveur itératif casse des choses sans rapport », c'est **là où le modèle porte
  des contraintes redondantes, l'ordre de résolution CHOISIT la solution** — donc le changer la
  change. Se vérifie en regardant qui est redondant (courroies fermées, structures
  hyperstatiques), pas en priant.
- **Fidélité des réactions** — axe distinct de la précision géométrique, et la manip a montré
  qu'ils se découplent : une option peut rendre les positions exactes au bit près ET dégrader les
  efforts lus, parce qu'une réaction est lue sur le CHEMIN de convergence et pas sur son point
  d'arrivée. À mesurer séparément, systématiquement.
- **Coût de maintenance** — surface de code touchée, complexité ajoutée pour la suite.
- **Effort d'implémentation** — ordre de grandeur (jours / semaines / mois).

## Une question qui n'est pas de convergence : les réactions hyperstatiques

À isoler avant de comparer les options, parce qu'aucune ne la traite et que deux d'entre elles
prétendent le contraire.

`PBD_solve` n'a **pas de compliance** : `stiffness = 1.0` partout, pas de α, pas d'accumulateur
λ. Malgré le nom XPBD dans les commentaires, le tour XPBD ne sert qu'à la relecture de vitesse ;
les contraintes, elles, sont rigides. Sur un mécanisme isostatique c'est sans conséquence — la
statique seule détermine la répartition. Sur un mécanisme **hyperstatique**, la répartition
réelle dépend des raideurs, et un solveur à contraintes rigides n'en a aucune :
`cohesion-field.ts` l'admet déjà (« XPBD répartit alors l'effort selon la compliance et l'ordre
d'itération plutôt que la vraie raideur »).

Or Slidep **affiche** ces valeurs : réactions d'appui, N/T/Mf le long d'une poutre, contrainte
maximale. Sur un treillis hyperstatique — c'est-à-dire le cas courant en RDM — le partage entre
appuis est déterminé par l'ordre de parcours du solveur. L'expérience SSOR vient de le montrer
expérimentalement : des positions rendues exactes au bit près, et des réactions dégradées de
0.5 % dans le même mouvement.

Ce n'est pas un problème de convergence et aucune quantité de sweeps ne le règle. Deux réponses
possibles, indépendantes du choix de solveur :

- **détecter et refuser** — l'infrastructure existe déjà, `ChainMobility` sait calculer
  `h = m − G` ; on peut marquer une lecture d'effort comme non déterminée plutôt que d'afficher
  un chiffre choisi par l'ordre BFS ;
- **donner une vraie raideur** — vrai XPBD, `α = 1/(EA/L)` sur les liens `Distance`, calculable
  depuis `section-properties`. Ça rend le partage physique sans changer de famille de solveur, et
  c'est une fraction infime du coût de l'option 5.

## Options

### 0. Agrégat de sous-chaîne rigide (le trick des courroies, généralisé)

Absent de la liste initiale, et pourtant déjà en production ici — pour les courroies seulement.
`experimental/belt-aggregate.ts` : *« Sommer les lois de segment d'une courroie télescope ses q
intérieurs, laissant une équation purement positionnelle. »* C'est une contrainte de **niveau
grossier** : impliquée par les contraintes fines, donc elle ne déplace pas le point fixe, mais
elle propage l'information d'un bout à l'autre de la sous-chaîne en UN sweep au lieu de N.

Généraliser aux sous-chaînes sérielles rigides — un lien agrégé entre les deux extrémités d'une
chaîne de poutres, télescopant les nœuds intérieurs — attaque directement `r ≈ 1 − c/N²`.

**Performance** : bénéfice sur toute chaîne longue, indépendamment du ratio de masse.

**Précision** : le point fixe est INCHANGÉ, puisque la contrainte ajoutée est impliquée par
celles qui existent déjà. C'est la propriété qui distingue cette option de la 1 (qui biaise le
chemin) et de SSOR (qui change la sélection dans le noyau).

**Déterminisme** : le piège est identifié et il est le même que celui que SSOR vient de révéler
— ajouter une contrainte impliquée, c'est ajouter de la redondance. D'où le critère de coupe que
les courroies appliquent déjà : une sous-chaîne s'arrête dès qu'un tiers a son mot à dire sur un
DDL intérieur. Applicable seulement aux sous-chaînes sérielles sans boucle.

**Maintenance / effort** : le patron existe et tourne ; il s'agit de l'instancier sur une autre
famille de liens. Jours.

**Mon avis** : à essayer avant tout le reste, avec l'alternance par chaîne (voir la manip
SSOR) — les deux attaquent le même terme et se mesurent avec le même banc.

### 1. Préconditionnement du ratio de masse

Clamper le ratio EFFECTIF utilisé par `projectOnSegment`/`applyDistanceConstraint` pour répartir
une correction — par exemple ne jamais laisser le nœud le plus léger absorber plus de, disons,
95 % d'une correction, même si son poids réel en justifierait 99.99 %. Technique connue (Bullet,
Rapier l'utilisent sous des noms voisins).

**Performance** : accélère la convergence de tout ratio de masse déséquilibré dans la
bibliothèque — un petit écrou sur une grosse poutre, un point de masse isolé sur une structure
légère — pas seulement `CP.slidep`.

**Précision** : la position finale (une fois convergé) reste correcte ; c'est le CHEMIN vers la
convergence qui est biaisé. Problème réel : si l'early-exit (déjà en place) se déclenche tôt, la
réaction lue peut porter la trace de ce biais plutôt que de la vraie répartition physique — il
faudrait soit ne jamais clamper sur le dernier sweep (celui dont les réactions sont
comptabilisées), soit démontrer que l'écart reste négligeable.

**Déterminisme** : la formule de répartition change, donc la trajectoire aussi — mais
contrairement à SSOR, le point fixe bouge lui aussi (le clamp n'est pas impliqué par les
contraintes, il les falsifie). À tester sur les courroies fermées ET sur les réactions.

**Maintenance** : touche une fonction PARTAGÉE par `Distance`, `FixedOnSegment` et d'autres. Un
paramètre de plus à choisir (le seuil de clamp) sans données de référence pour le fixer.

**Effort** : petit à moyen (jours), avec la complication des réactions ci-dessus à traiter
proprement, et la revalidation déterminisme à ne pas sauter.

**Mon avis** : passe derrière l'option 0, qui vise le même symptôme sans déplacer le point fixe.
Un clamp reste un mensonge assumé sur la répartition ; un agrégat est une conséquence des
contraintes existantes. À garder en réserve si l'agrégat ne suffit pas.

### 2. Bloc-résolution locale directe pour petits clusters raides

Au lieu de résoudre chaque contrainte une à une (Gauss-Seidel), détecter les petits groupes de
nœuds très fortement couplés (2-4 nœuds reliés par plusieurs liens rigides, avec un fort
déséquilibre de masse ou une redondance locale — exactement la forme du triplet pivot / poutre 1
/ masse lourde) et les résoudre comme UN système linéaire (inversion d'une petite matrice 3×3 ou
4×4) plutôt qu'en plusieurs passages successifs. Le sweep global n'a plus qu'à faire propager
l'info ENTRE clusters, sur une chaîne effective bien plus courte.

**Performance** : bénéfice qui dépasse le cas masse lourde — toute sous-structure rigide dense
(triangulations, treillis comme `Treillis.slidep`) convergerait en moins de sweeps globaux.

**Précision** : meilleure dans les mêmes cas, pour la même raison qu'un solve direct bat toujours
un solve itératif sur le sous-système qu'il couvre exactement.

**Déterminisme** : risque élevé et différent du précédent — ce n'est plus un simple
réordonnancement, c'est un chemin de résolution entièrement différent pour les liens concernés.

**Maintenance** : significative. Il faut (a) un algorithme de détection de clusters (une forme de
partitionnement de graphe, non trivial en soi) et (b) une résolution de système N×N générique à
côté des formules fermées actuelles, propres à chaque type de contrainte
(`constraint-functions.ts` est aujourd'hui un cas par type). C'est un changement d'architecture
localisé mais réel.

**Effort** : moyen à gros (semaines).

**Mon avis** : intéressant sur le papier, mais la détection automatique de clusters est le genre
de chantier qui déborde facilement de son estimation initiale, pour un gain qui recoupe
largement ce que l'option 1 donnerait déjà à moindre coût — et sujet au même risque de
régression sur les courroies qu'on vient de mesurer concrètement.

### 3. Solveur en coordonnées réduites (Featherstone / articulated body) pour les sous-arbres sériels

`CP.slidep` est une chaîne cinématique arborescente (aucune boucle fermée). C'est exactement la
classe de problème pour laquelle les moteurs physiques sérieux (robotique, jeux vidéo) utilisent
un solveur en coordonnées réduites plutôt qu'un solveur à contraintes maximales itératif : pour
un arbre, ça se résout en un seul passage O(N), **exact, et totalement insensible au ratio de
masse** — pas d'itération du tout sur cette partie-là.

**Performance** : potentiellement le plus gros gain de TOUS pour les mécanismes purement
arborescents (un bras articulé, une grue, un système à un seul point d'ancrage sans boucle) — pas
seulement plus robuste au ratio de masse, souvent aussi plus RAPIDE dans l'absolu, puisque O(N)
exact bat O(N·sweeps) itératif. C'est un axe de performance générale, pas juste un correctif de
robustesse.

**Précision** : exacte sur la partie couverte, par construction — pas une histoire de tolérance.

**Déterminisme** : change fondamentalement la trajectoire numérique de tout mécanisme
arborescent — pas un risque de régression, une refonte assumée qui redemande une revalidation
complète des mécanismes concernés.

**Maintenance** : élevée et durable. Il faut FAIRE COHABITER deux solveurs et décider où passe la
frontière, mécanisme par mécanisme — potentiellement dynamique, puisque cette frontière peut
bouger en cours de simulation (une courroie qui se détache change la topologie, comme
`update_belt_disconnects` le gère déjà pour le PBD actuel). C'est d'ailleurs la même frontière
« arbre vs boucle » que l'alternance par chaîne demanderait de tracer — à ceci près qu'elle ne
coûte là qu'un tableau d'indices, contre un second solveur ici. Tout le raisonnement sur les
réactions (`LinkReaction`, `beam-cohesion.ts`,
`plan-efforts-interieurs.md`) serait à repenser pour la partie en coordonnées réduites.

**Effort** : gros (plusieurs semaines à quelques mois pour une version solide).

**Mon avis** : largement dévalué par la manip SSOR. L'exactitude sur les arbres, qui est tout
l'argument de cette option, s'obtient avec un tableau d'indices inversés (voir le tableau
`CP.slidep` plus haut : 1e-17) au lieu de plusieurs semaines et d'un second solveur à faire
cohabiter. Il resterait à cette option un avantage propre — un vrai O(N) sans itération du tout,
donc un gain de VITESSE et pas seulement de robustesse — mais c'est un argument de performance à
mesurer, plus l'argument de correction qu'il était.

### 4. Solveur global direct/préfactorisé (type Projective Dynamics)

Remplacer Gauss-Seidel par une approche où on assemble la matrice globale (linéarisée) de TOUTES
les contraintes, on la factorise UNE FOIS (Cholesky/LU) tant que la topologie ne change pas, puis
chaque frame se résume à une résolution bon marché (substitution) plus quelques passages locaux
pour la non-linéarité. C'est la famille d'algorithmes derrière « Projective Dynamics » et ses
dérivés — connue pour converger nettement plus vite et plus robustement que Gauss-Seidel, y
compris sur des ratios de masse extrêmes, et — contrairement à l'option 3 — traite UNIFORMÉMENT
les arbres ET les boucles fermées (pas de frontière à gérer entre deux solveurs).

**Correction, depuis la deuxième passe SSOR** : ce paragraphe affirmait aussi qu'il n'y aurait
« pas de risque spécifique aux courroies ». C'est faux. Le jeu de contraintes d'une courroie
fermée est délibérément surdéterminé (voir la manip) ; assembler la matrice globale d'un système
de rang déficient donne une matrice **singulière**, qu'il faudra traiter par pseudo-inverse ou
régularisation — c'est-à-dire par un choix explicite du point dans le noyau, et ce choix ne sera
pas celui que fait Gauss-Seidel aujourd'hui. Les courroies changeront donc de comportement ici
aussi. Le progrès réel de cette option n'est pas l'immunité, c'est que le choix devient explicite
et documenté au lieu d'être un effet de bord de l'ordre BFS de `sort_links`.

**Performance** : potentiellement le plus gros gain de robustesse ET de vitesse parmi toutes les
options, sur TOUS les mécanismes — la factorisation amortit son coût sur toute la durée où la
topologie ne change pas.

**Précision** : meilleure convergence générale, y compris sur les cas déjà bien gérés
aujourd'hui.

**Point dur spécifique à Slidep** : un grab pendant une interaction ajoute un lien `HandleGrab`
TRANSITOIRE à chaque frame (`grab_links` dans `simulation-engine.ts`) — la matrice change donc à
chaque frame dès qu'on interagit à la souris, ce qui mange une bonne partie de l'intérêt de la
préfactorisation, sauf à la mettre à jour incrémentalement (méthode de Woodbury / mise à jour de
rang faible) plutôt que de tout refactoriser.

**Déterminisme** : refonte complète, pas une régression à surveiller — tout mécanisme existant
change de trajectoire numérique.

**Maintenance** : la plus lourde des options « solveur de contraintes » — refactor quasi total de
`PBD_kinematic_solver.ts` et `constraint-functions.ts`, gestion de la (re)factorisation à chaque
changement de topologie, et toute la comptabilité de réactions à reconstruire.

**Effort** : gros (mois).

**Mon avis** : le potentiel le plus élevé parmi les options qui gardent la même famille de
solveur (contraintes maximales) — mais c'est un remplacement de moteur, pas un chantier, et la
correction ci-dessus lui retire son argument le plus vendeur. À garder comme horizon, pas comme
prochaine étape.

### 5. FEM (éléments finis) — les poutres deviennent déformables

Aujourd'hui une poutre est un corps RIGIDE relié par des liaisons idéales ; sa flexion/contrainte
est calculée À PART, en post-traitement, par `beam-cohesion.ts` (torseur d'interface, voir
`plan-efforts-interieurs.md`) — jamais réinjectée dans le mouvement. Une approche FEM changerait
ça en profondeur : chaque poutre devient un élément déformable avec sa propre matrice de raideur
(éléments de poutre Euler-Bernoulli, standard en FEM structurel), et le mouvement du mécanisme
entier se résout comme UN système FEM — déplacements ET déformations ensemble, pas l'un puis
l'autre.

**Performance** : dépend fortement de l'intégrateur temporel choisi à côté (voir option 6) — un
FEM explicite hérite des mêmes limites de pas de temps qu'aujourd'hui ; un FEM implicite serait
robuste aux ratios de raideur/masse extrêmes par construction, mais beaucoup plus cher par pas de
temps (assemblage + résolution d'un système bien plus gros qu'aujourd'hui, une inconnue par DOF
d'élément plutôt que par nœud rigide).

**Précision** : la plus grande potentiellement de toutes les options — plus besoin de choisir
entre « rigide + overlay RDM » et « mouvement » : la flexion réelle influence le mouvement, et
réciproquement. Un ressort ou une poutre fine qui se déforme sous charge se comporterait
correctement de façon native, pas approximée après coup.

**Ce que ça change pour Slidep, au-delà du solveur** : c'est le changement le plus profond de
tous — pas un solveur différent pour le même modèle, un MODÈLE différent. `beam-cohesion.ts`,
tout le chantier `plan-efforts-interieurs.md`, l'idée même qu'une poutre a une position rigide
distincte de sa charge interne, seraient à repenser ou fusionner. Les mécanismes existants (des
liaisons idéalisées, pas des structures à faire fléchir) n'ont pas forcément besoin de ça — c'est
plutôt le bon outil si Slidep veut un jour couvrir la résistance des matériaux comme discipline à
part entière plutôt que comme diagnostic secondaire d'une simulation de mécanisme.

**Déterminisme/maintenance/effort** : le plus gros chantier de cette liste, sans exception — un
solveur FEM, sa discrétisation, son intégration temporelle, sont un domaine en soi. Mois à
années selon l'ambition (une poutre 1D FEM linéaire est abordable ; un FEM 2D/3D général ne
l'est pas pour un projet de cette taille).

**Mon avis** : hors de proportion pour résoudre CP.slidep — mais c'est la seule option qui ouvre
une porte produit vraiment différente (RDM et mouvement unifiés) plutôt que de mieux résoudre le
modèle actuel. À évaluer sur ce que Slidep veut être, pas sur ce problème.

À noter cependant : cette option est la seule de la liste qui réponde à la question des
réactions hyperstatiques posée plus haut, parce qu'elle est la seule à introduire une raideur. Et
il en existe une version à 1 % du coût — donner une compliance aux liens `Distance` (vrai XPBD)
sans rien changer d'autre. Si l'ambition RDM se confirme, c'est par là qu'il faut commencer, pas
par un maillage.

### 6. Intégration temporelle implicite

Un axe différent de toutes les options précédentes : elles portent toutes sur COMMENT les
contraintes de position sont résolues à un instant donné ; celle-ci porte sur COMMENT le temps
avance. Aujourd'hui, gravité/forces sont intégrées explicitement (position prédite = position +
vitesse·dt + accélération·dt², voir `PBD_solve`'s predict step) puis projetées sur les
contraintes. Un intégrateur implicite (Euler implicite / Newmark / generalized-α, standards en
dynamique des systèmes multi-corps) résout à la place un système où la position ET la vitesse au
pas SUIVANT apparaissent des deux côtés de l'équation — non-linéaire, donc résolu par Newton à
chaque pas plutôt que projeté directement.

**Performance** : c'est l'axe qui répond le plus directement au symptôme d'origine sans changer
la nature du solveur de contraintes — un intégrateur implicite est INCONDITIONNELLEMENT stable
pour un système raide (justement ce qu'un grand ratio de masse produit), ce que l'intégration
explicite actuelle n'est pas — c'est structurellement pour ça qu'un pas de temps trop grand ou un
ratio trop extrême fait diverger un intégrateur explicite quel que soit le nombre de sweeps
qu'on lui donne. Le prix : chaque pas de temps devient plus cher (résoudre un système, pas
juste avancer une formule), potentiellement compensé par la possibilité de prendre des pas plus
grands (moins de substeps nécessaires) sans perdre en stabilité.

**Précision** : robustesse numérique plutôt que précision au sens strict — un intégrateur
implicite introduit son propre amortissement numérique (il « aplatit » artificiellement les
hautes fréquences pour rester stable), ce qui peut légèrement biaiser une dynamique rapide et
fine si on n'y prend pas garde — un compromis à régler, pas un gain pur.

**Déterminisme** : refonte du cœur de `step_dynamic_simulation`, pas juste de `PBD_solve` —
tout ce qui lit `DynamicSnapshot` (vitesses, accélérations, réactions) changerait de sémantique
numérique.

**Maintenance/effort** : gros — Newton par pas de temps veut un jacobien (au moins approché) des
forces de contrainte, que rien dans l'architecture actuelle ne fournit ; c'est un composant
nouveau, pas une modification de l'existant. Semaines à mois.

**Mon avis** : orthogonal aux options 1-4 (combinable avec n'importe laquelle — un solveur de
contraintes qu'on rend plus rapide/robuste bénéficie quand même d'un intégrateur plus stable) et
plus directement justifié par le symptôme d'origine que l'option 5 (FEM) — mais reste un
investissement du même ordre de grandeur que 3/4, pas une retouche.

## Mon avis d'ensemble

La deuxième passe SSOR renverse la conclusion de la première. Ce solveur n'est pas
« mystérieusement fragile » : il réagit exactement comme la théorie le prédit pour un
Gauss-Seidel sur un système contenant, par construction et volontairement, des contraintes
redondantes. Ce n'est donc plus un argument pour remplacer le moteur — c'en est un pour rendre
explicite ce que le modèle laisse implicite, et pour exploiter le fait que ce même solveur
devient EXACT dès qu'on lui donne un aller-retour sur une chaîne sérielle.

Ce que ça change concrètement : les options 3 et 4 perdent leur meilleur argument (voir leurs
avis corrigés), l'option 5 gagne le sien mais pas pour la raison qu'on croyait (les réactions
hyperstatiques, pas la convergence), et deux directions bien moins chères passent devant.

Ordre que je propose (état au terme de la cinquième passe, décision réactions prise) :

1. ~~**Prototyper l'alternance par chaîne.**~~ **Fait et mesuré** — exacte sur les arbres,
   neutre sur les courroies, 3 échecs sur 848 dont 2 sont la taxe sur les réactions. Prototype
   dans `scratch/ssor/`, pas en production.
2. ~~**Trancher la question des réactions.**~~ **Tranché** : Slidep peut supporter ~1 %
   d'erreur sur la lecture des efforts, la taxe de 0.57 % n'est donc pas un blocage. Reste
   ouvert, sans bloquer : chercher comment corriger la lecture elle-même (la troisième voie —
   recalculer les réactions une fois convergé plutôt que de les intégrer le long du chemin).
3. ~~**Resserrer le critère aux courroies FERMÉES** et remesurer `Core XY`.~~ **Fait et
   mesuré** — sûr (aucune régression), mais sans le gain espéré : `Core XY` sature déjà son
   budget de sweeps sans alternance, et le résidu au même budget est 1.4-2× PIRE sous
   alternance, pas meilleur. Patch dans `scratch/ssor/solver-ssor-closedbelt.patch`. La
   phrase « le plus gros retour sur investissement restant » ci-dessus était une
   extrapolation du comptage de liens, pas une mesure — voir la quatrième passe.
4. ~~**Mise en production.**~~ **Faite.** `src/components/solver/sweep-order.ts`
   (`reversed_sweep_order`), branché dans `PBD_solve`. Deux verrous : pas dynamique
   uniquement, et chaîne non redondante uniquement. Suite complète 848/848, et les deux
   seuls tests déplacés (`beam-cohesion`, `reaction-forces`) re-baselinés en exprimant la
   tolérance qu'ils admettent — une part de la charge lue, pas une valeur recopiée.

   **Le critère n'est PAS l'acyclicité, contrairement à ce qui avait été convenu**, et il a
   fallu deux corrections pour arriver au bon.

   *Première* : un cycle de graphe ne distingue pas une boucle cinématique d'une barre rigide
   portant un cavalier — le `FixedOnSegment` qui épingle un nœud sur une poutre forme un
   triangle avec le `Distance` de cette poutre, donc tout mécanisme à poutre chargée lit
   « cyclique », `CP.slidep` compris, c'est-à-dire le seul cas où le gain existe. Remplacé par
   un comptage de redondance : une chaîne alterne si les lignes de contrainte qu'elle porte
   (`Σ ddl`) ne dépassent pas ses inconnues libres.

   *Seconde, et c'est la leçon* : **le comptage ne voit pas une dépendance linéaire.** Une
   courroie porte un brin de trop sur une boucle fermée, et un agrégat qui est la somme
   télescopée des lois qu'il couvre — chacun ajoute une ligne ET une inconnue, donc aucun
   comptage ne les distingue d'une contrainte utile. `Huygens` passait ainsi 18 liens sur 19
   en alternance, et la suite ne l'attrapait pas : `belt-closed-determinism` est cinématique,
   et la cinématique n'alterne plus. Mesuré en écrivant la sonde qui manquait
   (`scratch/ssor/ssor-belt-dynamic-probe.test.ts`, deux listages du même mécanisme en
   dynamique) : **écart de 30.8° à 30 frames, 3.2e7° à 120, 1.8e8° à 240.** Pas une dérive,
   une explosion — et un bug qui partait en production. Le critère final nomme donc ces deux
   types de liens en plus du comptage, en reprenant la connaissance que `analysis-model.ts`
   porte déjà (`closed_loop_surplus`). Le comptage reste nécessaire de son côté : c'est lui
   qui épingle les treillis hyperstatiques et `Core XY`.

   Ce que ça laisse alterner, sur la galerie : `CP.slidep`, les cantilevers, `Vilbrequin`
   (avec ou sans masse), `Puente`, `Treillis` (6/7), `Line from rotation`, `Balance`,
   `Test slider`, `Petit`, `Roues isolées`, `trac-comp`. Ce que ça épingle : tout ce qui porte
   une courroie, `Jansen`, `Core XY`.
5. ~~**Agrégat de sous-chaîne (option 0)**~~ — **abandonné**. Sa cible initiale (les chaînes
   sérielles) est couverte par l'alternance ; sa cible de repli (les boucles) n'a pas de problème
   à résoudre, la cinquième passe l'a mesuré. Plus rien dans ce document ne la motive. Si elle
   revenait un jour, retenir l'interaction identifiée en quatrième passe : un agrégat rigide est
   redondant par construction, donc exactement ce que le critère de l'alternance doit épingler.
6. **Poutres en corps rigides** (cause 3 du « vrai pourquoi »). Le gain structurel, indépendant
   de tout choix de solveur — et le seul point de cette liste que quatre passes de mesure
   n'ont pas entamé.
7. **Compliance sur les liens `Distance`**, si la lecture des efforts sur structure hyperstatique
   doit rester affichée telle quelle.

Les options 4 et 6 restent des horizons légitimes, mais plus rien dans ce document ne justifie
de les ouvrir maintenant.

## Question ouverte

Deux, et elles ne se posent plus au même niveau qu'avant.

**La technique** : est-ce qu'on cantonne l'alternance aux chaînes arborescentes (`analysis-model`
sait déjà les identifier) et on accepte la taxe de ~0.5 % sur les réactions, ou est-ce que cette
taxe est rédhibitoire tant que les efforts affichés ne sont pas eux-mêmes fiabilisés ?

**Le produit** : que fait Slidep d'un mécanisme hyperstatique ? Aujourd'hui il affiche un chiffre
que l'ordre de parcours du solveur détermine. Refuser de l'afficher est presque gratuit ; le
rendre juste demande une raideur. Cette question-là ne dépend d'aucune des six options, et c'est
probablement celle qui compte le plus pour un utilisateur.

## Défauts constatés en marge de la manip

Sans rapport avec la convergence, relevés en lisant, non corrigés :

- ~~**`slidingFriction` / `rotationalFriction` sont des champs morts.**~~ **Faux départ** :
  saisis dans l'UI, migrés, édités par le reducer, portés par les types et lus par aucun fichier
  de `src/components/solver/` — c'est exact, mais c'est un **chantier en cours**, pas un défaut.
  Rien à corriger ici.
- **`epsilon` est le dernier seuil absolu d'un solveur devenu relatif partout ailleurs.**
  `PBD_kinematic_solver.ts:319` et `:373`, valeur 1e-6, jamais passé par aucun appelant, comparé
  à un `maxError` qui mélange mètres et radians. Sur un mécanisme au plancher `MIN_EXTENT_M`
  (1 mm), il vaut 1e-3 de l'extent — soit exactement `DIAGNOSTIC_TOLERANCE_RATIO` : la sortie
  « plus rien ne bouge » se déclencherait au niveau que les diagnostics appellent « violé ».
- **Trois commentaires périmés**, dont deux trompeurs :
  - `simulation-engine.ts:1488` — « *Ignored: `dynamics` overrides the exit criterion with a
    fixed sweep count* ». Plus vrai depuis le fix ratio-de-masse : `PBD_solve` n'a plus aucun
    garde `dynamics` autour de la sortie anticipée. Le commentaire dit l'inverse du code sur
    précisément le point que ce doc analyse.
  - `kinematic-solver-links.ts:400` et `:455` — `BeltSegmentNoSlip` et `BeltSubChainAggregate`
    sont annotés « EXPERIMENTAL […] never emitted by the parser — only the measurement bench
    builds these ». Faux : `parsing.ts:677` (`belt_q_links`) les émet pour toute courroie en
    simulation. Ce sont des liens de production, et ce sont eux que la manip incrimine.
  - `dynamic-mass-ratio.test.ts` — en-tête toujours rédigé comme si le test devait échouer
    « until dynamics gets an equivalent residual-based exit », en citant un garde `if (!dynamics)`
    qui n'existe plus. Le test passe.
- **Les 16 substeps et les diagnostics sont payés à chaque frame** : `recorder.ts:242` laisse
  `collectDiagnostics` à son défaut `true`, donc réactions et cohésion de poutre sont calculées
  même quand aucun panneau ne les regarde. Attention au piège si on optimise : conditionner
  `substeps` à l'état de l'UI ferait dépendre la trajectoire simulée de ce que l'utilisateur a
  ouvert. Conditionner `collectDiagnostics` est en revanche gratuit et sans effet sur le
  mouvement.
