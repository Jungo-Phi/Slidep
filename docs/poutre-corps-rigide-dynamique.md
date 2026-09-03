# Poutre = corps rigide, en dynamique seulement

Note d'intention. Rien n'est implémenté.

## L'idée

Aujourd'hui une poutre est **deux points indépendants reliés par un lien `Distance`**, et la
dynamique lui ajoute un troisième nœud virtuel en son milieu, réépinglé par un `FixedOnSegment`
à chaque substep, pour retrouver son inertie de rotation (`BEAM_END_MASS_FRACTION`,
`dynamics/mass-model.ts`).

La proposition : **en mode dynamique uniquement**, une poutre devient **un corps** à trois DDL
(x, y, θ). Pas de contrainte interne, pas de nœud milieu, une masse et une inertie.

## Pourquoi en dynamique seulement

Parce que les deux modes n'ont pas le même problème ni la même économie.

- **La cinématique n'a que des masses binaires 0/1** (`parsing.ts`) : aucun ratio de masse ne
  peut y naître, donc rien à corriger. Et la fusion des nœuds coïncidents y est réellement
  économique : une articulation est **gratuite** (un nœud partagé) là où un corps rigide la
  paierait deux lignes de contrainte.
- **La dynamique paie l'inverse.** Chaîne de 8 poutres articulées :

|                                                  | DDL | lignes |
| ------------------------------------------------ | --- | ------ |
| cinématique — modèle actuel                      | 18  | 8      |
| cinématique — corps rigides                      | 24  | 14     |
| dynamique — modèle actuel (nœuds milieux inclus) | 34  | 24     |
| dynamique — corps rigides                        | 24  | 14     |

Le rapport s'inverse dès que chaque poutre doit porter son inertie.

## Ce que ça corrige, et qui n'est pas cosmétique

Mesuré sur `CP.slidep` (envergure 3 cm, membre le plus fin 5 mm, masse portée 100 kg — ratio
~40 000:1), pire erreur géométrique en dynamique :

|                                      | sans alternance | avec alternance |
| ------------------------------------ | --------------- | --------------- |
| allongement de la poutre             | 0.002 %         | **58 %**        |
| glissement du cavalier sur sa poutre | **5.2 %**       | 0.000 %         |

L'erreur ne disparaît pas, **elle se déplace** d'une contrainte à l'autre selon l'ordre de
résolution : ~5 % de l'envergure du mécanisme dans les deux cas. C'est la signature d'un modèle,
pas d'un réglage de solveur — et sur le reste de la galerie l'erreur reste sous 0.04 %, ce qui
isole bien `CP.slidep` comme le cas où le modèle craque.

**Un corps rigide ne peut ni s'allonger ni laisser glisser ce qui lui est soudé.** Les deux
modes de défaillance disparaissent par construction, ils ne sont pas atténués. La cause — une
contrainte de distance entre deux masses ponctuelles très inégales — n'existe plus : la masse
devient une propriété du corps.

Gains secondaires : le nœud milieu et son `FixedOnSegment` par substep disparaissent ; une
soudure entre deux poutres devient **une seule pièce** (zéro DDL, zéro ligne) au lieu de
demander des liens de rigidité ; les efforts intérieurs se lisent sur un torseur de corps, ce
qui est leur forme naturelle.

## Ce que ça coûte

- **`kinematics/constraint-functions.ts` est à réécrire, pas à porter** : une contrainte sur
  corps rigide fait intervenir le bras de levier dans son gradient (`r × n`).
- **Modèle hybride obligé** : sliders, courroies et engrenages restent point/angle. Chaque type
  de contrainte a donc deux variantes tant que la frontière existe, et il faut décider où elle
  passe.
- **Un DDL angulaire par poutre**, là où seuls les engrenages en ont. Touche la comptabilité des
  réactions, `residual_scale`, la disposition des snapshots, `beam-cohesion`.
- **Les collisions sont concernées** : chaque poutre est un segment de collision contre chaque
  point et chaque engrenage (`collision-candidates.ts`), avec le même besoin de bras de levier.
- **Toutes les trajectoires dynamiques changent** — re-baselining général.
- Pas de migration de fichiers : le format stocke de la géométrie, pas de l'état solveur.

Ordre de grandeur : voir « Sur l'estimation « des mois » » plus bas — l'estimation initiale
(des mois) est probablement trop haute, mais elle n'a pas encore été remplacée par autre chose
qu'un raisonnement.

## Le comptage sur la galerie réelle — fait, et il déplace l'argument

Compté par `scratch/beam-body/count.test.ts` sur les 24 mécanismes de `test-mechanisms/`, avec
des hypothèses toutes penchées du même côté — celui du modèle corps (une poutre absorbe ce
qu'un `FixedOnSegment` lui soude, et un bout de poutre où ne se rejoint qu'une seule poutre ne
paie aucune ligne pour le pignon ou le glisseur qui s'y accroche). Les vrais chiffres sont donc
un peu moins bons que ceux-là.

|                    | poutres | dyn. actuel ddl/lignes | corps ddl/lignes |
| ------------------ | ------- | ---------------------- | ---------------- |
| `Jansen`           | 10      | 34/36                  | 32/33            |
| `Puente`           | 18      | 59/59                  | 55/54            |
| `Line from rotation` | 9     | 30/30                  | 27/26            |
| `Treillis`         | 6       | 20/20                  | 18/18            |
| `Core XY`          | 9       | 58/67                  | 29/38            |
| `Huygen's chain drive` | 4   | 31/30                  | 19/18            |
| `CP`               | 2       | 8/8                    | 4/4              |
| `Vilbrequin`       | 2       | 11/11                  | 7/6              |
| `Cantilever`       | 1       | 2/3                    | 3/4              |

**L'exemple à 8 poutres n'est pas représentatif de la galerie, et il annonce un gain que les
mécanismes qui ont le plus de poutres n'obtiennent pas.** Il suppose une chaîne SÉRIELLE, où
chaque articulation joint exactement deux poutres. Un vrai mécanisme articulé fusionne bien
plus : `Jansen` porte 10 poutres pour 6 nœuds libres, soit ~3 poutres par nœud. Renoncer à la
fusion y coûte trois corps à 3 ddl là où le nœud partagé en valait 2, et le gain retombe à
5-10 % — sur `Jansen`, 34 ddl deviennent 32.

Le gain réel est ailleurs, et il est net : **les mécanismes qui portent des charges soudées**.
`Core XY` (58→29), `CP` (8→4), `Huygens` (31→19) gagnent 35 à 50 %, parce que chaque masse
soudée sur une poutre disparaît dans son corps au lieu de coûter deux inconnues et une
contrainte. Sur une poutre seule, le modèle corps est en revanche perdant (2/3 → 3/4).

Ce n'est pas l'argument que ce document avançait — « diviser `N` par ~2 donc `1 − r` par ~4 » ne
tient pas sur les mécanismes articulés, qui sont justement ceux dont la chaîne est longue. Mais
c'est le bon découpage : le modèle corps rend exactement ce que le ratio de masse attaque, une
masse lourde soudée à une poutre fine, et ne rend presque rien sur une tringlerie — qui n'a de
toute façon pas le problème (cf. la cinquième passe de
`ratio-masse-convergence-dynamique.md` : une boucle chargée reste vingt fois sous le seuil).

Reste à décider si les deux modes de défaillance qui disparaissent PAR CONSTRUCTION
(allongement de la poutre, glissement du cavalier) plus la fin du nœud sur-contraint justifient
des mois à eux seuls. Le comptage, lui, ne les justifie pas.

## L'argument le plus fort : un nœud rigide est sur-contraint au niveau du graphe de liaisons

Trouvé en creusant la lecture de T/Mf en bout de poutre (`beam-cohesion.ts`), et détaché ici de
`ratio-masse-convergence-dynamique.md` : ce n'est pas un problème de convergence, c'est la
conséquence directe de la représentation que ce document propose de changer.

**Le cas** : un cantilever encastré (`join` `isGrounded`, `fixedEdgesIDs`) avec une masse
`fixedNodesBodyIDs` posée exactement à mi-portée, `dynamicRigidity: true`. Cas-jouet de
`beam-cohesion.test.ts` (« un cantilever avec une masse en cours de portée... »), sans gravité.
Statique classique : réaction d'appui = −P exactement, aucune ambiguïté possible (un seul appui,
un seul chemin de charge). Le solveur donne −101,143 au lieu de −100 (1,14 % d'écart) — stable au
bit près, pas un résidu qui se réduit.

**Vérifié, deux pistes exclues** :
- Pas un problème de convergence Gauss-Seidel : identique de 200 à 100 000 sweeps.
- Pas le "reaction-leak" de `DYNAMIC_SUBSTEPS` (déplacement de predict trop grand pour la
  lecture au premier ordre) : identique de 16 à 8192 substeps (dt ÷ ~500). Ce défaut-là se
  résorbe avec plus de substeps ; celui-ci ne bouge pas d'un bit, donc ce n'est pas la même
  famille.

**Cause identifiée** : `k1` (`beam:end`) est repositionné par QUATRE liaisons indépendantes au
lieu de 2 — `Distance` (longueur), `KeepOrientation` (angle), et les DEUX `FixedOnSegment`
(masse attachée + point milieu virtuel de l'inertie de rotation, `BEAM_END_MASS_FRACTION`).
`applyFixedOnSegmentConstraint` → `projectOnSegment` (`constraint-functions.ts:110-124`) ne
déplace pas que le nœud épinglé : il redistribue sa correction sur `(start, end, node)` au
prorata de leur masse inverse — donc CHAQUE `FixedOnSegment` bouge aussi `k1`, exactement comme
`Distance`+`KeepOrientation` le font déjà séparément. Comptage brut des ddl : 4 inconnues (k1,
mid), 4 équations → a l'air isostatique. Mais le graphe de contraintes a un vrai doublon : deux
chemins concurrents (`Distance`+`KeepOrientation` d'un côté, les `FixedOnSegment` de l'autre)
peuvent chacun, seuls, repositionner `k1`. Gauss-Seidel converge vers la bonne position finale,
mais la façon dont il attribue "qui a fait quoi" entre les quatre liaisons dépend de l'ordre de
résolution — d'où un résidu stable, reproductible, insensible à toute itération.

**Un cas plus parlant, où le même défaut ne se contente plus d'un biais fixe mais oscille** :
`test-mechanisms/Double Cantilever bis.slidep` — deux poutres encastrées bout à bout (un `join`
non-ancré les soude, `Angle` à 180° pour rester droites, l'autre bout encastré au sol), chargées en
bout. Le graphe de liaisons compilé montre le nœud de soudure touché par **SIX** liaisons pour 2
ddl : `Distance`+`Angle` de la première poutre, `KeepOrientation` de l'encastrement, `Distance` de
la seconde poutre, plus les DEUX `FixedOnSegment` des points milieux virtuels (un par poutre) — le
même doublon que ci-dessus, mais empilé deux fois. En simulant 24 frames : la position du bout
libre reste statique à 6 microns près (`y` entre −0,000039 et −0,000045 m, du bruit), mais la
réaction lue en cohésion entre en **cycle limite de période 3, non amorti** : `start.fy` de la
première poutre oscille de −16,9 à −30,5 (quasi ×2), son moment de 4,3 à 23,5 (×5), et la seconde
poutre voit son `start.fy` **changer de signe** entre +3,4 et −65,3. Rien de tout ça n'est
physique — le mécanisme ne bouge quasiment pas ; c'est la conversion impulsion→force en 1/dt²
(`PBD_kinematic_solver.ts:1030-1031`) qui amplifie à l'extrême une répartition de crédit
déjà instable entre les six chemins concurrents, et qui boucle sur elle-même via la vitesse
warm-startée d'une frame à l'autre au lieu de se stabiliser sur un seul biais fixe comme dans le
cas à un seul nœud sur-contraint.

**Pourquoi ce n'est pas un correctif de `beam-cohesion.ts`** : la lecture des réactions est fidèle
à ce que le solveur calcule réellement ; le problème est en amont, dans la création des liaisons.
Une fusion `Distance`+`KeepOrientation` en une seule contrainte "soudure rigide" à 2 ddl
supprimerait un des deux chemins concurrents, mais pas l'autre (les `FixedOnSegment`
continueraient à re-toucher `k1` indépendamment juste après) — un mieux partiel, pas une
correction. La suppression complète du doublon demande que la rigidité de la poutre ne soit plus
une contrainte séparée du tout — c'est-à-dire ce que propose ce document : un
corps à 3 ddl n'a rien à disputer avec un `FixedOnSegment`, puisqu'il n'y a plus deux chemins, un
seul corps qui encaisse toutes les forces généralisées d'un coup.

## Par où commencer : promouvoir le nœud milieu, pas le supprimer

**Mesuré, et ça tranche.** Le cantilever chargé à mi-portée de `beam-cohesion.test.ts` (celui
qui porte l'`it.fails`), en 2×2 — `scratch/beam-body/midpoint-isolation.test.ts` :

| alternance | nœud milieu | `start.fy` (vérité −100) |
| ---------- | ----------- | ------------------------ |
| ON         | OUI         | **−101.142992**          |
| ON         | NON         | −100.000000              |
| OFF        | OUI         | −100.000000              |
| OFF        | NON         | −100.000000              |

**L'erreur exige les deux.** Chacun seul donne exactement −100, au bit près. Le nœud milieu
n'est donc pas « un des deux chemins concurrents » parmi d'autres : sur ce cas, c'est le seul,
et `Distance`+`KeepOrientation` ne sont pas en cause.

Conséquence qui dépasse ce document : ce que
`ratio-masse-convergence-dynamique.md` appelle « la taxe de l'alternance » n'est pas une
propriété de l'alternance. C'est une INTERACTION — l'alternance rend visible le chemin
concurrent du nœud milieu — et 1.142992 vaut exactement deux fois le 0.571496 consigné là-bas.
**La concession produit (« ~1 % d'erreur sur les efforts est acceptable ») est donc peut-être
récupérable** en réglant le modèle de poutre, au lieu d'être le prix permanent de l'alternance.
Vérifié sur ce cas seulement : l'autre cantilever (`reaction-forces.test.ts`) lit exact dans les
quatre combinaisons, sa tolérance à 1 % n'est pas exercée aujourd'hui.

### Mais « supprimer le nœud milieu » n'est PAS l'étape

Le nœud milieu porte **les 2/3 de la masse de la poutre** (`BEAM_END_MASS_FRACTION = 1/6` à
chaque bout). Le retirer fait perdre les deux tiers de son poids — invisible dans ces tests sans
gravité, faux partout ailleurs. Et c'est structurel : deux masses ponctuelles aux extrémités ne
peuvent pas satisfaire à la fois `m` et `mL²/12`. C'est exactement pour ça que ce nœud existe.

### Ce qui est réellement l'étape 1

**Le nœud milieu EST déjà le centre de masse du corps.** Il existe, c'est déjà un nœud, il porte
déjà la bonne part de la masse. Le passage au corps rigide consiste à :

1. lui donner un ddl angulaire portant `I = mL²/12` ;
2. y rapatrier les masses d'extrémité (le corps pèse `m` en son centre) ;
3. rendre `start`/`end` DÉRIVÉS de (centre, θ), au lieu de nœuds indépendants tenus par
   `FixedOnSegment` + `Distance` + `KeepOrientation`.

Les trois chemins concurrents disparaissent ensemble, sans rien inventer — et le bilan
masse/inertie est identique à celui d'aujourd'hui (`2·(m/6)·(L/2)² = mL²/12`), donc la
migration ne change pas la physique représentée, seulement sa représentation.

Le juge reste le même : l'`it.fails` de `beam-cohesion.test.ts` doit passer, et
`reaction-forces.test.ts` doit pouvoir resserrer sa tolérance de 1 % à quelque chose d'exact.

## Sur l'estimation « des mois »

L'estimation initiale supposait une réécriture. Elle est trop haute pour une raison concrète :
**le patron existe déjà et tourne.** Un engrenage EST un corps — une clé de position pour son
centre, une clé d'angle qui partage son id — et `applyGearPerimeterPinConstraint` est déjà une
contrainte « point rigidement placé sur un corps tournant » : centre, angle, bras de levier,
correction répartie sur les trois.

Deux réserves qui vont dans l'autre sens :

- cette contrainte-là est écrite dans la métrique CINÉMATIQUE — son dénominateur est `wN + 1`,
  l'inertie angulaire réelle n'y entre pas (`residual_scale` ne la liste pas non plus, signe que
  ce chemin n'a jamais eu à porter une vraie masse). Le patron est à reprendre pour la dynamique,
  pas à copier ;
- chaque étape de migration change TOUTES les trajectoires dynamiques, donc étaler en petites
  étapes fait payer le re-baselining à chaque fois. C'est l'argument pour peu d'étapes, grosses.

## L'inventaire : ce que ça touche vraiment

Recensement du code, avec les points porteurs re-vérifiés à la main. ~15 fichiers de production
dans le solveur, ~3 côté affichage/sondes, plus les tests dynamiques à re-baseliner.

### Deux choses que ce document ne budgétait pas du tout

**1. Les collisions sont un front entier.** `dynamics/collision-candidates.ts:88-130` construit
un candidat `pointSegment` sur `:start`/`:end` de CHAQUE poutre contre chaque point, et un
`circleSegment` contre chaque engrenage. `applyPointSegmentContactConstraint`
(`constraint-functions.ts:218`) et le partage de vitesse par `t` de
`collision-restitution.ts:76-127` traitent ce segment exactement comme `projectOnSegment` —
même besoin de bras de levier. Une poutre-corps qui touche quelque chose relève donc de la même
famille « point sur corps » que les liaisons déjà listées, sur trois fichiers de plus.

**2. La lecture des efforts n'est pas un portage, et ça se voit dès sa première ligne.**
`build_beam_cohesion_specs` (`dynamics/beam-cohesion.ts:104`) s'ancre sur
`links.find(l => l.type === "Distance" && l.owner === beam.id)` et fait `continue` s'il ne le
trouve pas. Or ce `Distance` est précisément ce que le modèle corps supprime. Ce n'est donc pas
une lecture qui se dégraderait : **toutes les poutres seraient sautées et la cohésion ne
renverrait plus rien.** Tout l'algorithme est bâti sur l'idée qu'il existe des liaisons internes
réelles dont on peut lire la réaction ; un corps rigide n'en a aucune, par construction.

Il faut donc un algorithme différent — vraisemblablement une réduction (d'Alembert) des actions
extérieures au corps en un torseur à son origine, puis l'intégration le long de l'abscisse que
`recording/cohesion-field.ts` sait déjà faire. Couplage à surveiller, non documenté ailleurs :
`load-model.ts::resolve_load_forces` et `cohesion-field.ts::direct_point_actions` dupliquent
volontairement la même synthèse charge→force, en lock-step manuel. Le passage au corps touche
les deux et casse en silence si une seule est mise à jour.

### Trois choses qui deviennent PLUS simples

- **Une charge de type `couple` est aujourd'hui synthétisée en paire de forces** ±k·ŷ aux deux
  extrémités (`load-model.ts:173-187`), faute d'un ddl angulaire où la poser. Avec un corps,
  c'est un couple, point.
- **`MotorBeam` porte `armInertia` et `armEndMass`** (`kinematic-solver-links.ts:322-332`), une
  correction analytique bricolée pour la même raison. Le lien se rapproche de `MotorAngle`.
- **`probe-series.ts::read_angular_velocity` et `motor-model.ts::arm_angular_velocity` dérivent
  ω de deux vitesses ponctuelles** faute de vrai ddl. Ils le liraient directement.

### Ce qui est confirmé sain

L'infrastructure bas niveau n'a pas besoin d'être restructurée : `nodes.ts` porte déjà `angle`,
`angleIndex`, `wAngle`, `torque`, tous génériques par clé — un ddl angulaire par poutre y entre
sans rien changer. Et la comptabilité de réactions de `PBD_kinematic_solver` sait déjà lire une
réaction sur un slot d'angle, puisque c'est ce qui fait marcher `GearPerimeterPin`.

Confirmé aussi que la cinématique est hors périmètre, structurellement et pas seulement par
hypothèse : `analysis-model.ts:327` appelle `compile_simulation_model(mechanism)` à un seul
argument, donc `dynamicRigidity` y reste `false` ; seul `recording/recorder.ts:92` passe `true`.

### Découpage proposé

| étape | contenu | ce que ça casse |
| ----- | ------- | --------------- |
| 1 | poutre ISOLÉE (rien de soudé dessus) devient un corps à 3 ddl, `start`/`end` dérivés | son `Distance` et son `KeepOrientation` disparaissent ; `beam-inertia`, les deux `Cantilever` |
| 2 | masses/joins soudés en cours de portée + réécriture de `beam-cohesion` et `cohesion-field` | toute lecture N/T/Mf — `beam-cohesion`, `cohesion-field`, `reaction-forces`, `beam-cohesion-diagnostic` |
| 3 | frontière hybride : moyeu-engrenage, jonction-courroie, pivot-moteur soudés à une poutre | `Vilbrequin*`, `Core XY*`, `Huygens`, `Jansen`, `motor-beam-anchor`, `gear-moment` |
| 4 | collisions contre une poutre-corps | `collision-candidates`, `dynamic-collision`, `collision-simulation` |
| 5 | re-baseline général et sondes | `bit-exact-reference.json`, trajectoires enregistrées |

L'étape 2 est celle à ne pas sous-estimer : c'est la seule qui demande de concevoir, pas de
porter.

### L'estimation, révisée une fois de plus

Ni « des mois » (la première estimation, faite sans lire le code), ni « des semaines » (la
révision faite en voyant que `GearPerimeterPin` existait déjà). La partie contraintes est bien
un portage de quelques semaines ; la partie efforts est une conception, et les collisions un
quatrième front. **Plusieurs semaines à environ deux mois**, avec l'étape 2 comme principal
risque de dépassement.

## Écarté en chemin, et corrigé — une contrainte à 4 points dont deux clés coïncident

Corrigé, et consigné ici parce que c'est le suspect qu'on croit trouver en cherchant le
précédent, et qu'il faut savoir qu'il a été écarté. Trouvé sur le même fichier
(`Double Cantilever bis.slidep`) en creusant pourquoi T/Mf ne sont PAS continus à la jonction entre
les deux poutres, et pourquoi `Mf` reste bloqué à exactement 0 en début de seconde poutre à
chaque frame. Cause distincte de celle du dessus, plus précise et plus largement actionnable :
elle touche a priori toute soudure poutre-à-poutre via un `join`, pas seulement les nœuds
sur-contraints.

**Le mécanisme** : le `join` non-ancré qui soude les deux poutres crée un lien `Angle` à 4 points
(`key1..key4`, `constraint-functions.ts` / `link-slots.ts:62-70`) où `key2` (fin de la première
poutre) et `key3` (début de la seconde) sont le **même nœud physique** — les deux poutres se
rejoignent exactement là. `projectAngleC` (`constraint-functions.ts:429-436`) traite les 4 clés
comme 4 points indépendants :
```
setPoint(nodes, e1, pe1.add(g_e1.mul(lambda * w_e1)));  // correction "vue depuis poutre 1"
setPoint(nodes, s2, ps2.add(g_s2.mul(lambda * w_s2)));  // e1 et s2 = même case mémoire → écrase
```
`g_e1` et `g_s2` sont des gradients géométriquement différents (perpendiculaires aux deux segments
respectifs) : le second `setPoint` écrase silencieusement le premier, un seul déplacement survit
réellement sur ce nœud. Mais la lecture des réactions dans `PBD_kinematic_solver` continue de
rapporter une réaction *par slot nommé du lien* plutôt que par nœud physique unique — vérifié sur
les données brutes : les deux entrées `"Angle"` à la clé de soudure sont **rigoureusement
identiques** à chaque frame (même `fx`, même `fy` à la précision flottante près), signature d'une
lecture avant/après faite deux fois sur la même case mémoire plutôt que de deux corrections
réellement distinctes. `beam-cohesion.ts` (`resolve_beam_cohesion`) additionne ensuite les deux
sans dédoublonner par `linkIndex`, d'où un double comptage de cette contribution dans la cohésion
de CHAQUE poutre adjacente — et donc une vraie discontinuité de T/Mf au lieu d'une lecture
cohérente de part et d'autre du même point de coupe.

**Corrigé, et la mesure a précisé ce qui était en jeu.** Les deux moitiés annoncées ont été
faites : `projectAngleC` somme désormais les gradients par NŒUD au lieu d'écrire par clé, et la
lecture des réactions ne compte une clé qu'une fois par lien. Trois choses apprises en le
faisant :

- **Ce n'était pas seulement une erreur de lecture.** Le double `setPoint` rendait la projection
  elle-même fausse : la correction appliquée n'est ni celle du gradient somme ni de la bonne
  amplitude. La propriété qui le montre est physique — un angle est interne à la chaîne, donc
  sa projection peut la faire tourner mais jamais la POUSSER, et l'écrasement laissait
  exactement cette poussée derrière lui (mesuré : un quart de la correction demandée, sur une
  chaîne de deux segments à masses égales). C'est un candidat direct pour le cycle limite non
  amorti relevé plus haut sur `Double Cantilever bis` : une quantité de mouvement inventée à
  chaque sweep n'a aucune raison de s'amortir. Le test est
  `behaviour/welded-angle.test.ts`, écrit sur cette propriété-là et pas sur des valeurs.
- **Balayé sur la galerie, l'aliasage n'existe qu'à deux endroits** : `Angle[key2==key3]` sur
  `Double Cantilever` et `Double Cantilever bis` (donc bien la soudure poutre-à-poutre), et les
  liens de courroie, dont les slots répétés sont voulus (une même poulie est le via d'arrivée
  d'un brin et le via de départ du suivant). `Normal`, `Parallel` et `EqualLength` partagent la
  projection corrigée, donc sont couverts d'avance ; aucun mécanisme ne les alias aujourd'hui.
- **La correction est neutre partout ailleurs, au bit près.** Le chemin fusionné n'est pris que
  si deux extrémités coïncident réellement ; sinon le dénominateur en forme fermée d'origine est
  conservé tel quel, et `bit-exact.test.ts` passe sans recapture.

Ce que ça ne corrige pas : le nœud sur-contraint de la section précédente. Sur
`Double Cantilever bis`, les chiffres de cohésion sont inchangés au dernier chiffre — le lien
`Angle` de la soudure y est satisfait presque toutes les frames, donc il ne projette pas, et
c'est bien la concurrence entre `Distance`, `KeepOrientation` et les `FixedOnSegment` qui porte
l'erreur. Les deux défauts sont indépendants, et seul celui-ci était local.

**Décision actée** : pas de desserrage de la tolérance du test pour faire passer ce cas — le test
qui échoue reste un indicateur volontaire d'un problème non résolu, pas un faux positif à
maquiller. Marqué `it.fails` dans `beam-cohesion.test.ts` avec renvoi à cette section, plutôt que
laissé rouge en continu ou skippé sans trace.
