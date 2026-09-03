# Quel moteur de simulation pour Slidep

**La question que pose ce document n'est pas celle qui l'a fait naître.** Il est né du ratio de
masse en dynamique, question tranchée depuis et consignée ailleurs
(`ratio-masse-convergence-dynamique.md`) : le solveur actuel suffit. Ce qui reste, et qui se
pose à côté plutôt qu'à sa suite, c'est **de quelle famille de solveur Slidep veut être, et
quelle physique il doit savoir énoncer**. Les six options ci-dessous ne sont pas six façons de
corriger un bug ; ce sont six réponses à cette question-là, et elles gardent leur intérêt une
fois le bug parti.

Deux choses à lire avant les options :

- **le cadre d'évaluation** ci-dessous, dont un axe (la fidélité des réactions) a été appris à
  la dure : une option peut rendre les positions exactes au bit près ET dégrader les efforts
  lus, parce qu'une réaction se lit sur le CHEMIN de convergence et non sur son point
  d'arrivée ;
- **la question des réactions hyperstatiques**, qui n'est pas une question de solveur mais de
  physique représentée, et que le choix de famille conditionne.

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
`experimental/belt-aggregate.ts` : _« Sommer les lois de segment d'une courroie télescope ses q
intérieurs, laissant une équation purement positionnelle. »_ C'est une contrainte de **niveau
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

## Où en est le choix

L'expérience qui a produit ce document a déplacé plusieurs de ces options, sans en trancher une
seule :

- **Options 3 et 4 ont perdu leur meilleur argument.** L'exactitude sur les arbres, qui était
  tout l'argument des coordonnées réduites, s'obtient avec un tableau d'indices inversés
  (mesuré : 1e-17 sur `CP.slidep`). Il leur reste un argument propre — un vrai O(N) sans
  itération pour la 3, un traitement uniforme des arbres ET des boucles pour la 4 — mais c'est
  un argument de VITESSE, à mesurer, plus un argument de correction.
- **L'option 5 a gagné le sien, pas pour la raison qu'on croyait.** Ce n'est pas la convergence,
  c'est qu'elle est la seule de la liste à introduire une RAIDEUR, donc la seule qui réponde à la
  question hyperstatique ci-dessus. Et il en existe une version à 1 % du coût : donner une
  compliance aux liens `Distance` (vrai XPBD) sans rien changer d'autre.
- **L'option 0 est abandonnée.** Sa cible initiale est couverte par l'alternance ; sa cible de
  repli (les boucles) n'a pas de problème à résoudre — mesuré : une boucle chargée à 3000 kg
  reste vingt fois sous le seuil de signalement.
- **L'option 6 reste orthogonale à toutes les autres** et se combine avec n'importe laquelle.

Ce qui n'est PAS dans cette liste et passe devant elle : les poutres en corps rigides, qui ne
sont pas un choix de solveur mais un choix de MODÈLE, et qui ont leur propre document
([[poutre-corps-rigide-dynamique]]).

## La question qui compte pour un utilisateur

Que fait Slidep d'un mécanisme hyperstatique — c'est-à-dire du cas courant en RDM ?

Aujourd'hui il affiche un chiffre que l'ordre de parcours du solveur détermine. Refuser de
l'afficher est presque gratuit (`ChainMobility` sait déjà calculer `h = m − G`) ; le rendre juste
demande une raideur, donc la version bon marché de l'option 5.

Cette question-là ne dépend d'aucune des six options — elle dépend de ce que Slidep veut être :
un simulateur de mécanismes qui affiche des efforts en diagnostic secondaire, ou un outil de RDM
qui doit répondre juste. C'est probablement la seule décision de ce document qui vaille d'être
prise avant les autres, et c'est une décision produit, pas technique.
