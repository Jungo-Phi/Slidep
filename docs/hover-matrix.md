# Matrice de survol — quel outil vise quoi

État de référence de `get_hovered_part_of_element` (`src/components/canvas/get-hover.ts`). Les trous
relevés à la première extraction ont été arbitrés ; ceux qui restent sont **voulus**, et dits comme
tels en fin de document. C'est le point de départ d'une éventuelle table déclarative, et en attendant
la seule description du comportement de survol par outil.

Légende :

|     |                                                                  |
| --- | ---------------------------------------------------------------- |
| ✅  | cible, géométrie standard                                        |
| ◆   | cible, **géométrie propre** à cet état (détaillée sous la table) |
| ❌  | pas une cible                                                    |
| —   | sans objet                                                       |

Les six branches de l'élément : **nœud** (`pivot`/`slider`/`slidep`/`join`/`mass`), **engrenage**,
**edge** (`beam`/`spring`/`damper`), **courroie**, **contrainte**, **charge**.

---

## Sélection

| État                | nœud | engrenage | edge             | courroie                | contrainte | charge |
| ------------------- | ---- | --------- | ---------------- | ----------------------- | ---------- | ------ |
| `Selecting`         | ✅   | ✅ jante  | ✅ bouts + corps | ✅ bouts + arcs + brins | ✅         | ✅     |
| `SelectedElement`   | ✅   | ✅        | ✅               | ✅                      | ✅         | ✅     |
| `SelectedMultiple`  | ✅   | ✅        | ✅               | ✅                      | ✅         | ✅     |
| `Erasing`           | ✅   | ✅        | ✅               | ✅                      | ✅         | ✅     |
| `EditingValue`      | ✅   | ✅        | ✅               | ✅                      | ✅         | ✅     |
| `PlacingValue`      | ✅   | ✅        | ✅               | ✅                      | ✅         | ✅     |
| `SelectingMultiple` | —    | —         | —                | —                       | —          | —      |
| `ErasingMultiple`   | —    | —         | —                | —                       | —          | —      |

Les deux derniers sortent en `null` dès l'entrée de la fonction : une sélection au rectangle ne
survole rien. Le corps d'un edge est ici cible **quel que soit son type** (barre, ressort,
amortisseur), contrairement aux états de placement.

## Placement d'éléments mécaniques

| État                         | nœud | engrenage | edge               | courroie  |
| ---------------------------- | ---- | --------- | ------------------ | --------- |
| `PlacingBeamStart`           | ✅   | ✅        | ✅ bouts + corps¹  | ✅ bouts  |
| `PlacingBeamEnd`             | ◆ a  | ✅        | ✅ bouts + corps¹  | ✅ bouts  |
| `PlacingSpringStart` / `End` | ✅   | ✅        | ✅ bouts + corps¹  | ✅ bouts  |
| `PlacingDamperStart` / `End` | ✅   | ✅        | ✅ bouts + corps¹  | ✅ bouts  |
| `PlacingBeltStart`           | ✅   | ✅        | ✅ bouts + corps¹  | ✅ bouts  |
| `PlacingBeltEnd`             | ✅   | ✅        | ✅ bouts + corps¹  | ✅ bouts  |
| `PlacingPivot`               | ✅   | ✅        | ✅ bouts + corps¹  | ✅ bouts  |
| `PlacingMotor`               | ✅   | ✅        | ✅ bouts + corps¹  | ✅ bouts  |
| `PlacingSlider`              | ✅   | ✅        | ✅ bouts + corps¹  | ✅ bouts  |
| `PlacingJoin`                | ✅   | ✅        | ✅ bouts + corps¹  | ✅ bouts  |
| `PlacingMass`                | ✅   | ✅        | ✅ bouts + corps¹  | ✅ bouts  |
| `PlacingGround`              | ✅   | ✅        | ✅ bouts + corps¹  | ✅ bouts  |
| `PlacingGearStart`           | ✅   | ✅        | ✅ bouts + corps¹  | ✅ bouts  |
| `PlacingGearRadius`          | ✅   | ◆ b       | ✅ **bouts seuls** | ◆ c brins |

¹ le corps n'est cible que si l'edge est une `beam` — jamais un ressort ni un amortisseur.

## Charges

| État                      | nœud | engrenage  | edge                     | courroie |
| ------------------------- | ---- | ---------- | ------------------------ | -------- |
| `PlacingForceStart`       | ✅   | **❌**     | ✅ bouts + corps¹        | ❌       |
| `PlacingForceEnd`         | ❌   | ❌         | ❌                       | ❌       |
| `PlacingDistributedForce` | ❌   | ❌         | ❌                       | ❌       |
| `PlacingMomentStart`      | ◆ d  | ◆ e centre | ✅ corps (tout type) ◆ f | ❌       |
| `PlacingMomentEnd`        | ❌   | ❌         | ❌                       | ❌       |
| `PlacingProbe`            | ✅   | ✅         | ✅ corps (tout type)     | ❌       |
| `PlacingProbeMetrics`     | ❌   | ❌         | ❌                       | ❌       |

Les états « …End » et `PlacingDistributedForce` ne visent **rien** volontairement : le geste définit
un vecteur, pas une cible, et c'est `snap_load_hover` qui aimante la direction et la longueur sur le
survol `Void`. Même raison pour `MovingForce` / `MovingDistributedForce` / `MovingMoment` plus bas.

**L'edge de référence est mis en évidence.** Une charge aimantée sur l'axe (ou la normale) d'un edge
devient solidaire de lui — elle tournera avec. Rien dans le geste ne le dirait : c'est une direction,
pas une cible. L'edge que `snap_direction` a retenu est donc épaissi comme un survol ordinaire —
pendant le placement, et ensuite dès que la charge est survolée ou sélectionnée, le repère se posant
à la création et ne changeant plus qu'au panneau latéral. Une force ponctuelle peut viser n'importe
quel edge connecté ; une répartie n'a que sa propre barre comme référence possible.

Un edge l'emporte sur les axes du monde quand les deux conviennent : une force tirée le long d'une
barre verticale suit cette barre, elle ne reste pas verticale. C'est ce que le surlignage rend
lisible — sans lui, deux gestes identiques au pixel près donneraient deux charges différentes.

**Une barre quasi alignée sur un axe du monde garde sa propre cible, et c'est elle qui gagne.**
`snap_candidates` liste les edges avant les axes du monde, et la sélection ne déloge un candidat
retenu que si le suivant fait mieux de plus de `SNAP_SEPARATION` px. Deux rayons à un demi-degré l'un
de l'autre sont donc le même but, que l'ordre départage — sans quoi la direction basculerait de l'un
à l'autre d'un pixel au suivant. Conséquence recherchée : sur une barre à 89,5°, une charge visée sur
sa normale est stockée à exactement un quart de tour d'elle, et non aimantée sur la verticale du
monde puis reconnue « presque » perpendiculaire.

## Déplacement

| État                                                      | nœud | engrenage | edge                | courroie  |
| --------------------------------------------------------- | ---- | --------- | ------------------- | --------- |
| `MovingNode`                                              | ✅   | ✅        | ✅ bouts + corps¹   | ✅ bouts  |
| `MovingEdgeStartPoint`                                    | ◆ a  | ✅        | ✅ bouts + corps¹   | ✅ bouts  |
| `MovingEdgeEndPoint`                                      | ◆ a  | ✅        | ✅ bouts + corps¹   | ✅ bouts  |
| `MovingEdgeBody`                                          | ✅   | ✅        | ✅ **bouts seuls**² | ✅ bouts  |
| `MovingBeltBody`                                          | ❌   | ◆ g       | ❌                  | ❌        |
| `ChangingGearRadius`                                      | ✅   | ◆ h       | ✅ **bouts seuls**  | ◆ c brins |
| `MovingConstraint`                                        | ❌   | ❌        | ❌                  | ❌        |
| `MovingForce` / `MovingDistributedForce` / `MovingMoment` | ❌   | ❌        | ❌                  | ❌        |
| `MovingSelectionMultiple`                                 | ❌   | ❌        | ❌                  | ❌        |
| `SimulationDragging`                                      | ❌   | ❌        | ❌                  | ❌        |

² `MovingEdgeBody` sort aussi en `null` d'emblée si l'edge déplacé n'est pas une `beam`.

## Contraintes et cotations

| État                                                               | nœud | engrenage  | edge     | courroie                           |
| ------------------------------------------------------------------ | ---- | ---------- | -------- | ---------------------------------- |
| `DimensionStart`                                                   | ✅   | ✅         | ✅ corps | ✅ arcs + brins, **pas les bouts** |
| `DimensionNode`                                                    | ✅   | ❌         | ✅ corps | ❌                                 |
| `DimensionEdge`                                                    | ✅   | ❌         | ✅ corps | ❌                                 |
| `DimensionNodeToNode` / `EdgeToNode` / `Angle` / `Radius` / `Belt` | ❌   | ❌         | ❌       | ❌                                 |
| `HorizontalVerticalConstraintStart`                                | ✅   | ❌         | ✅ corps | ❌                                 |
| `HorizontalVerticalConstraintNode`                                 | ✅   | ❌         | ❌       | ❌                                 |
| `NormalConstraintStart` / `Edge`                                   | ❌   | ❌         | ✅ corps | ❌                                 |
| `ParallelConstraintStart` / `Edge`                                 | ❌   | ❌         | ✅ corps | ❌                                 |
| `EqualConstraintStart`                                             | ❌   | ◆ e centre | ✅ corps | ❌                                 |
| `EqualConstraintEdge`                                              | ❌   | ❌         | ✅ corps | ❌                                 |
| `EqualConstraintGear`                                              | ❌   | ◆ e centre | ❌       | ❌                                 |
| `GearRatioConstraintStart` / `Gear`                                | ❌   | ◆ e centre | ❌       | ❌                                 |

Les cinq états `Dimension…` qui ne visent rien ont déjà leurs deux opérandes : il ne reste qu'à
poser l'étiquette, il n'y a plus de cible à désigner.

`DimensionNode` et `DimensionEdge` refusent en plus, de façon transparente, l'élément que leur
premier opérande **termine** : un nœud coté contre une arête dont il est une extrémité mesurerait sa
distance à une droite sur laquelle il se trouve déjà, et la réponse serait zéro quoi qu'il arrive.
La règle vaut pour l'arête entière, corps compris — ce n'est pas une extrémité qu'on refuse, c'est
la paire.

## Les overlays

Contraintes et charges se déclarent à part, par `overlays`, parce qu'ils ne sont pas des cibles
mécaniques : on les désigne pour les sélectionner ou les éditer, jamais pour s'y attacher.

| Valeur          | contrainte | charge | états                                    |
| --------------- | ---------- | ------ | ---------------------------------------- |
| `"all"`         | ✅         | ✅     | les huit états de sélection (`SELECT_ALL`) |
| `"constraints"` | ✅         | ❌     | `DimensionStart`                         |
| absent          | ❌         | ❌     | tous les autres                          |

`DimensionStart` voit les cotations déjà posées pour qu'on puisse en **éditer une sans désarmer
l'outil** : un clic dessus ouvre `EditingValue`, et la sortie de la saisie réarme `DimensionStart`
plutôt que de laisser l'élément sélectionné (`rearm` sur l'état de saisie). Il ne voit pas les
charges — une force n'est pas une chose que l'outil de cotation manipule.

---

## Les géométries propres

- **a — `beamBodyHover`.** En plus du centre du nœud, la barre tirée _au-delà_ de lui l'attrape :
  le nœud finit sur son corps et non à sa pointe. Position renvoyée = la projection du curseur sur
  l'axe. Trois états seulement : `PlacingBeamEnd`, `MovingEdgeStartPoint`, `MovingEdgeEndPoint`.

  **C'est le survol de dernier recours.** Il ne demande au nœud que d'être quelque part le long de la
  ligne, donc toute une rangée de nœuds alignés y répond d'un coup — et sans précaution, le premier
  balayé l'emporterait sur celui que le curseur touche vraiment. Il est donc mis de côté jusqu'à la
  fin du balayage : n'importe quelle cible **sous le curseur** passe devant, et entre plusieurs
  « au-delà », c'est le nœud le plus proche du curseur qui gagne.
- **b — `PlacingGearRadius` sur engrenage.** Point de contact sur la jante, dans la direction du
  centre en cours de pose (`startHover`), pas du curseur : c'est le point de tangence des deux
  dentures.
- **c — engrenage sur brin de courroie.** Le brin n'est cible que si la **projection du centre de
  l'engrenage** tombe dans le segment ; la position renvoyée est cette projection décalée de
  `GEAR_ON_BELT_GROW`. C'est le snap de tangence, et il vaut pour `PlacingGearRadius` comme pour
  `ChangingGearRadius`.
- **d — `PlacingMomentStart` sur un nœud** ne renvoie **pas** un nœud mais la `GearTooth` du premier
  engrenage que l'axe porte, centrée. Viser le centre d'un engrenage est la façon naturelle de le
  désigner ; l'axe lui-même ne prend pas de moment. Un nœud sans engrenage n'est pas cible.
- **e — engrenage désigné en entier.** Position = le centre, pas un point de jante : la contrainte
  (ou le moment) porte sur l'engrenage, pas sur un endroit de sa denture.
- **f — `PlacingMomentStart` sur un edge** renvoie le **milieu** de l'edge, pas la projection du
  curseur — c'est là que l'arc sera centré.
- **g — `MovingBeltBody` sur engrenage.** Point de jante dans la direction du curseur.
- **h — `ChangingGearRadius` sur engrenage.** Point de contact dans la direction de l'engrenage
  _déplacé_, pas du curseur. Le geste pose le rayon **sur ce point** : le survol aimante la
  denture sur ce qu'elle rencontre, et ne retombe sur le curseur libre que sur du vide. Les nœuds
  que l'engrenage porte (`fixedNodesBodyIDs`) et son axe sont exclus du survol pour cette raison —
  ils suivent la jante, et répondraient avec le rayon courant, le figeant sur sa propre valeur.

Toute la face intérieure d'un engrenage est morte : la branche exige que le curseur soit à
`HIT_TOLERANCE.NODE / 2` près de la jante. Seul le cas **d** perce ce trou, et uniquement en passant
par l'axe.

---

## Les bornes du curseur

`clamp_to_bounds` (`src/components/canvas/hover-bounds.ts`) borne le curseur **avant** que quoi que
ce soit ne le lise, de sorte que le survol et le geste partagent le même point. Ce n'est pas du
survol à proprement parler, mais ça décide de ce qui est atteignable — donc de ce que les tables
ci-dessus peuvent réellement produire.

| État                                         | borne                                                             |
| -------------------------------------------- | ----------------------------------------------------------------- |
| `PlacingBeamEnd` / `SpringEnd` / `DamperEnd` | à `MIN_EDGE_LENGTH` du départ                                     |
| `PlacingBeltEnd`, aucune poulie posée        | à `MIN_EDGE_LENGTH` du départ                                     |
| `PlacingBeltEnd`, au moins une poulie        | hors du disque de la dernière poulie                              |
| `PlacingGearRadius`                          | à `MIN_GEAR_RADIUS` du centre                                     |
| `ChangingGearRadius`                         | à `min(MIN_GEAR_RADIUS, rayon courant)` du centre                 |
| `MovingEdgeStartPoint` / `EndPoint`          | à `min(MIN_EDGE_LENGTH, longueur courante)` du bout opposé, et hors de la poulie enroulée |
| `MovingNode`                                 | la même, une fois par bout d'edge que le nœud porte               |

Une courroie fait exception au minimum de longueur **dès qu'elle porte une poulie** : ses deux bouts
doivent pouvoir se rejoindre, c'est la fermeture de la boucle.

Tous ces minima sont des distances **écran**, converties par le viewport : ce qu'ils protègent est la
capacité à voir et à attraper ce qu'on dessine, qui se compte en pixels. Zoomé, une barre de dix
unités monde devient une chose qu'on a le droit de tracer ; dézoomé, une de mille est la plus courte
qu'on puisse encore viser.

Le solveur répond aux **mêmes** bornes, parce qu'un rayon et une longueur ne sont pas écrits que par
le geste : l'engrènement, un rapport et la longueur d'une courroie écrivent des rayons, et n'importe
quelle contrainte peut rapprocher deux extrémités. `resolveGeometricConstraints` lit donc le viewport
que porte le mécanisme et transmet les deux planchers, avec le même cliquet qu'ici. La forme diffère
selon la grandeur : un rayon est une valeur que le solveur **stocke**, donc son plancher est un
`Math.max` dans son écrivain unique ; une longueur n'est stockée nulle part — c'est une distance
entre deux nœuds — donc son plancher est un lien `MinDistance`, une inégalité qui ne dit rien tant
que la barre est plus longue. Dans les deux cas la correction refusée revient au balayage suivant et
part aux degrés de liberté restants : c'est ce qui fait que deux engrenages qu'on pousse l'un dans
l'autre arrêtent leurs centres au lieu de s'effondrer.

Une barre dont la longueur est **cotée** n'a pas de plancher : la cote gagne, si courte soit-elle,
sinon les deux tireraient le même couple de points en sens inverse et la cote serait silencieusement
fausse.

### Un minimum ne fait jamais grandir

D'où le `min(…)` sur les états qui redimensionnent : un geste qui reprend un élément existant répond
à la borne écran **ou** à la taille qu'il a déjà, la plus petite des deux. Un engrenage de rayon 4
dessiné à zoom 8 est un engrenage voulu ; dézoomer jusqu'à ce qu'il fasse dix pixels ne doit pas le
faire bondir à trente au premier contact avec sa jante. Le plancher interdit de rétrécir davantage,
il ne pousse jamais vers l'extérieur, et zoomer le rabaisse — c'est ainsi qu'on récupère les petites
tailles. Les états de **pose** n'ont rien à cliqueter : il n'y a pas encore d'élément.

### Une cible trop proche n'est pas une cible

Une cible garde sa propre position — c'est ce qui en fait une cible — donc la borne ne peut pas lui
être appliquée sans mentir sur le point de contact affiché. Sous `PlacingGearRadius` et
`ChangingGearRadius`, une cible plus proche du centre que le rayon minimal ci-dessus cesse donc
simplement d'être offerte (`out_of_sizing_reach`), en silence, comme tout ce qu'un geste ne peut pas
atteindre. Sans quoi une cible posée sur l'axe — la jante d'un grand engrenage qui passe par ce
centre, un nœud, un brin de courroie — dimensionnerait l'engrenage à zéro, là où l'engrènement, la
géométrie de courroie et les rapports divisent tous par le rayon.

Ces bornes sont une aide au survol, pas un invariant : la tolérance de clic et l'aimantation à la
grille passent après et peuvent ramener le point de quelques pixels vers l'intérieur.

## La pastille de sonde

Une sonde n'est pas un élément : c'est un réglage que son hôte porte (`probes: ProbeConfig[]`), sans
identité propre. Sa pastille est pourtant dessinée **à côté** de lui, `PROBE_OFFSET` au-dessus — donc
elle occupe des pixels qui n'appartiennent à personne d'autre, et mérite d'être une cible.

Le survol la rend comme `{ type: "Probe", id }` où **`id` est l'élément porteur**. La désigner, c'est
donc désigner cet élément : la sélection tombe naturellement dessus, sans qu'aucun objet nouveau
n'existe. Elle est piquée **avant le balayage des éléments**, comme la fermeture d'une courroie et
pour la même raison : elle est dessinée par-dessus tout, et l'élément dessous répondrait sinon.

| Valeur              | états                                                        |
| ------------------- | ------------------------------------------------------------ |
| `probeBadge: true`  | `Selecting`, `SelectedElement`, `SelectedMultiple`, `PlacingValue`, `EditingValue` |
| absent              | tous les autres, **`Erasing` compris**                       |

**La gomme ne vise jamais la pastille**, et c'est une décision, pas un oubli : elle sert à démonter
la machine, pas à retirer une mesure. Si viser la pastille supprimait la pièce, la cible décalée
serait un piège ; si elle supprimait la sonde seule, la gomme aurait deux sens selon le pixel visé.
Elle traverse donc, et attrape l'élément dessous — qui emporte sa sonde. La pastille prend malgré
tout le style de suppression quand son hôte est condamné : elle disparaît avec lui, elle doit rougir
avec lui.

Survoler la pastille ne met en évidence **que la pastille**. `is_hovered` écarte explicitement ce
type : allumer aussi l'élément porteur donnerait deux cibles pour un seul geste.

Cliquer dessus ouvre le choix des grandeurs mesurées — **la même boîte qu'à la pose**, au même
endroit, et bâtie sur la même liste que celle du panneau latéral (`ProbeMetricList`). Chaque métrique
s'applique dès qu'elle est cochée : il n'y a rien à valider, donc fermer la boîte ne fait jamais
perdre un choix. `PlacingProbeMetrics` distingue les deux provenances par son drapeau `armed` : venue
de l'outil sonde elle le réarme en sortie, venue d'un clic sur la pastille elle retombe sur
`Selecting`. Dans les deux cas le panneau bascule sur l'analyse, où vivent les mesures et leurs
courbes.

**L'élément mesuré est dessiné sélectionné tant que la boîte est ouverte** (`is_selected` traite
`PlacingProbeMetrics` comme les autres états qui désignent un élément), et sa pastille reste
allumée. Le curseur a quitté le canvas pour la boîte : rien d'autre ne dirait ce qu'on est en train
de mesurer. À la fermeture, l'élément reste sélectionné — sauf après une pose, où l'outil sonde se
réarme pour en poser une autre.

Pour retirer une mesure sans toucher à la pièce : décocher la métrique, ici ou dans le panneau.

## Ce que la gomme met en rouge

Pas seulement l'élément visé : **toute la cascade** qu'il entraîne. Supprimer un pivot emporte les
engrenages que son axe porte, et de proche en proche leurs cotations et leurs charges — le survol le
montre avant le clic, faute de quoi on désigne un élément et on en perd trois.

L'ensemble vient de `deletion_closure` (`connect-actions.ts`), qui **rejoue `delete_element` et n'en
garde que les identifiants supprimés**. C'est la seule garantie qui compte : l'affiché et l'exécuté
ne peuvent pas diverger, puisqu'ils sortent de la même fonction. `HoveredPart` n'en sait rien et
continue de ne nommer qu'un élément — la cascade est une affaire d'affichage.

Une charge simplement *encadrée* sur l'edge supprimé n'en fait pas partie : elle survit en
coordonnées monde. Le calcul tourne à chaque frame sous le curseur, donc il retombe sur l'élément
seul plutôt que de lever si une référence est pendante ; c'est le clic qui signalera l'échec.

## Quand le survol est recalculé

À chaque événement souris ou clavier, et **à chaque changement d'état** — un clic qui termine un
placement, un raccourci qui change d'outil, `Escape`. Sans cela le survol resterait celui qu'avait
calculé la table de l'outil précédent, faux jusqu'au prochain pixel parcouru : prendre la gomme au
clavier ne teintait rien tant que la souris ne bougeait pas.

Le recalcul relit la dernière position connue du curseur et n'appelle **pas** le reducer : c'est un
rafraîchissement, pas un geste. Rejouer le reducer y déclencherait des transitions parasites.

## Les absences voulues

Ce qui reste vide l'est par décision, pas par oubli.

- **Une courroie ne se mesure pas** — ni sonde, ni cotation contre autre chose. `PlacingProbe` ne la
  voit pas, et aucun état `Dimension…` autre que `DimensionStart` (sur son corps, qui mène à
  `DimensionBelt`) ne la voit non plus. Une courroie se cote **en entier ou pas du tout**.
  > Le reste du code n'a pas encore suivi : la courroie porte toujours de quoi accueillir des sondes.
  > À nettoyer.
- **`HorizontalVerticalConstraintNode` ne voit ni edge ni courroie.** Une fois le premier nœud
  choisi, la contrainte relie deux nœuds ; seul `…Start` peut viser un edge, pour l'alignement d'un
  edge sur lui-même.
- **Aucun état de contrainte ne vise une courroie**, `…Start` compris : une courroie prend la forme
  que ses poulies lui imposent, l'aligner n'a pas de sens. `element-refs.ts` le dit aussi —
  `ALIGNABLE_EDGE_TYPES` exclut la courroie des cibles d'un alignement.
- **Toute la face intérieure d'un engrenage est morte**, sauf par le cas **d**.
- **Les états « …End » des charges et `PlacingDistributedForce` ne visent rien** : le geste définit
  un vecteur, pas une cible. Idem pour les `Moving…` de charges et de contraintes.
- **Une courroie sans poulie ne se referme pas sur son départ**, mais ce n'est pas un refus : la
  borne de longueur minimale l'en tient à distance, comme n'importe quel autre edge. Le garde-fou
  `belt_can_close` reste dans `get-hover` pour les deux gestes de traction (`MovingEdgeStartPoint` /
  `EndPoint`), au cas où un snap ramènerait le point ; l'utilisateur n'est pas censé le rencontrer.

## Manque connu, pas encore implémenté

**Une force ponctuelle devrait pouvoir se poser sur une denture.** `PlacingMomentStart` voit les
engrenages, `PlacingForceStart` non — et rien ne le justifie sur le fond. Ce n'est pas qu'une case de
survol : il faut d'abord que le reste du chemin sache traiter une force ancrée sur un engrenage
(`force_base_position` la ramènerait aujourd'hui au centre, pas au point de jante visé). Ouvrir le
survol seul fabriquerait une cible qui produit une force au mauvais endroit, en silence.
