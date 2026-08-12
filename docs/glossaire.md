# Glossaire

Termes du code spécifiques à Slidep.

## Grands types d'éléments

**Node** — élément défini uniquement par une position (+ éventuellement un angle porté
séparément). Peut être posé aux extrémités d'un edge ou sur la longueur d'une poutre.
Ex : Pivot, Slider, Slidep, Join, Mass.

**Edge** — élément défini par les positions de ses deux extrémités (`positionStart` /
`positionEnd`). Ex : Beam, Spring, Damper, Belt.

**Body** — élément défini par une position **et** un angle qui lui est propre (contrairement
à un Node, dont l'angle — s'il existe — est porté par un Pivot/Slidep séparé). Un seul
élément aujourd'hui : Gear.

**Ground** — pas un élément à part entière : un paramètre (`isGrounded`) posé sur un node
pour bloquer sa position et son angle.

## Éléments mécaniques au nom non évident

**Slidep** — mot-valise Slider + Pivot. Résulte de la fusion d'un slider et d'un pivot posés
au même endroit : glisse le long d'une poutre comme un slider, et laisse tourner librement
les edges fixés dessus comme un pivot. Ne peut pas être posé directement depuis la palette.

## Courroies (Belt)

**Via** — un point de passage du chemin d'une courroie : soit une poulie qu'elle enveloppe,
soit une des deux extrémités libres (rayon 0). Le chemin complet d'une courroie est une
suite de vias.

**Wrap** — l'angle (en rad) sur lequel la courroie enveloppe une poulie donnée. Une valeur
continue (non repliée modulo 2π) : au-delà de 2π, la courroie s'est enroulée sur la poulie
(tours supplémentaires dessinés en spirale).

**Strand** (brin) — le segment de courroie tendu en ligne droite entre deux vias
consécutifs, par opposition à l'arc de contact sur une poulie.

**Terminal** — extrémité libre d'une courroie ouverte (non bouclée). Rayon 0 dans la liste
des vias.

**Junction** — pour une courroie fermée (`closed: true`), le point (souvent un Join) où les
deux extrémités de la courroie sont réunies pour former une boucle.

**Closed / open (loose)** — une courroie fermée (`closed`) forme une boucle sans extrémités
libres ; une courroie ouverte a deux terminals qui peuvent être tirés librement.

**No-slip** — la contrainte qui traduit l'absence de glissement entre la courroie et une
poulie : la longueur de courroie qui entre d'un côté doit égaler celle qui sort de l'autre.

**φ (phi)** — dans l'ancien modèle de courroie (« modèle φ »), le scalaire unique
représentant de combien la courroie a défilé, partagé par toutes les poulies. Remplacé par
le modèle « q » (un no-slip par brin) pour les cas où le défilement n'est pas uniforme
(voir `docs/belt-kinematic-solver/`).

## Solveur cinématique

**PBD** — Position Based Dynamics : méthode de résolution où chaque contrainte est une
petite fonction qui, à chaque itération, mesure de combien elle est violée et déplace les
points concernés pour réduire l'écart (~centaines d'itérations par frame, jamais résolu de
façon exacte en une passe).

**XPBD** — Extended PBD : variante de PBD prévue pour le futur mode dynamique (masses,
forces, ressorts avec vraie raideur). Pas encore implémentée.

**Link** — dans le solveur, une contrainte entre points/angles (ex : `Distance`,
`GearMeshing`, `BeltLength`). Ne pas confondre avec un élément mécanique : plusieurs Links
peuvent être générés à partir d'un seul élément (ex : un Slidep produit plusieurs Links).

**ddl** — degré de liberté retiré par un Link (ex : `ddl: 1` pour une distance, `ddl: 2`
pour une coïncidence). Champ du type `Link`, et racine du terme français DDL utilisé côté
UI (panneau d'analyse) pour la mobilité globale d'un mécanisme.

**posMasses / radMasses** — masse inverse (poids PBD) des positions / rayons dans le
solveur. `0` = point ancré (immobile), `1` = libre. Une contrainte déplace deux points
proportionnellement à leurs masses inverses relatives.

**residual** — à quel point une contrainte reste violée après résolution, convertie en
millimètres pour être comparable entre familles (distance, angle, ratio...). Sert au
panneau de diagnostic pour repérer les contraintes non satisfaites (mécanisme bloqué).

## Simulation & rendu

**Snapshot** — état figé du solveur (positions, angles) à un instant donné, enregistré
pendant la lecture d'une simulation pour permettre de rejouer/scruber sans recalculer.

**Probe** (sonde) — réglage porté par un élément pour afficher une courbe d'une grandeur
(position, vitesse, angle, force...) dans le temps. Une sonde n'est pas un élément à part
entière : elle vit dans `probes` de l'élément qu'elle observe.

**Overlay** — calque affiché sur le canvas pendant la simulation pour visualiser une
grandeur d'un élément (trajectoire, force, vitesse, contrainte/stress), indépendant des
sondes (qui tracent une courbe dans un panneau plutôt que sur le canvas).

**Frame** (`LoadFrame`) — référentiel dans lequel la direction d'une charge est exprimée :
`"world"` (direction absolue, fixe même si le support tourne) ou liée à un edge (tourne
avec lui, charge « suiveuse »).

## Divers

**ScreenPoint / WorldPoint** — deux espaces de coordonnées distincts pour un `Point2` :
écran (pixels, y vers le bas) et monde (millimètres, y vers le haut). Le viewport
(`scale`/`pan`) convertit de l'un à l'autre.

**Hit-box** — zone de tolérance autour d'un élément dans laquelle le curseur (ou un
élément en cours de placement) déclenche une connexion ou un survol.
