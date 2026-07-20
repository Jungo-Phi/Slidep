# Matrice de survol — quel outil vise quoi

État de référence de `get_hovered_part_of_element` (`src/components/canvas/get-hover.ts`). Les trous
relevés à la première extraction ont été arbitrés ; ceux qui restent sont **voulus**, et dits comme
tels en fin de document. C'est le point de départ d'une éventuelle table déclarative, et en attendant
la seule description du comportement de survol par outil.

Légende :

| | |
|---|---|
| ✅ | cible, géométrie standard |
| ◆ | cible, **géométrie propre** à cet état (détaillée sous la table) |
| ❌ | pas une cible |
| — | sans objet |

Les six branches de l'élément : **nœud** (`pivot`/`slider`/`slidep`/`join`/`mass`), **engrenage**,
**edge** (`beam`/`spring`/`damper`), **courroie**, **contrainte**, **charge**.

---

## Sélection

| État | nœud | engrenage | edge | courroie | contrainte | charge |
|---|---|---|---|---|---|---|
| `Selecting` | ✅ | ✅ jante | ✅ bouts + corps | ✅ bouts + arcs + brins | ✅ | ✅ |
| `SelectedElement` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `SelectedMultiple` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `Erasing` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `EditingValue` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `PlacingValue` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `SelectingMultiple` | — | — | — | — | — | — |
| `ErasingMultiple` | — | — | — | — | — | — |

Les deux derniers sortent en `null` dès l'entrée de la fonction : une sélection au rectangle ne
survole rien. Le corps d'un edge est ici cible **quel que soit son type** (barre, ressort,
amortisseur), contrairement aux états de placement.

## Placement d'éléments mécaniques

| État | nœud | engrenage | edge | courroie |
|---|---|---|---|---|
| `PlacingBeamStart` | ✅ | ✅ | ✅ bouts + corps¹ | ✅ bouts |
| `PlacingBeamEnd` | ◆ a | ✅ | ✅ bouts + corps¹ | ✅ bouts |
| `PlacingSpringStart` / `End` | ✅ | ✅ | ✅ bouts + corps¹ | ✅ bouts |
| `PlacingDamperStart` / `End` | ✅ | ✅ | ✅ bouts + corps¹ | ✅ bouts |
| `PlacingBeltStart` | ✅ | ✅ | ✅ bouts + corps¹ | ✅ bouts |
| `PlacingBeltEnd` | ✅ | ✅ | ✅ bouts + corps¹ | ✅ bouts |
| `PlacingPivot` | ✅ | ✅ | ✅ bouts + corps¹ | ✅ bouts |
| `PlacingMotor` | ✅ | ✅ | ✅ bouts + corps¹ | ✅ bouts |
| `PlacingSlider` | ✅ | ✅ | ✅ bouts + corps¹ | ✅ bouts |
| `PlacingJoin` | ✅ | ✅ | ✅ bouts + corps¹ | ✅ bouts |
| `PlacingMass` | ✅ | ✅ | ✅ bouts + corps¹ | ✅ bouts |
| `PlacingGround` | ✅ | ✅ | ✅ bouts + corps¹ | ✅ bouts |
| `PlacingGearStart` | ✅ | ✅ | ✅ bouts + corps¹ | ✅ bouts |
| `PlacingGearRadius` | ✅ | ◆ b | ✅ **bouts seuls** | ◆ c brins |

¹ le corps n'est cible que si l'edge est une `beam` — jamais un ressort ni un amortisseur.

## Charges

| État | nœud | engrenage | edge | courroie |
|---|---|---|---|---|
| `PlacingForceStart` | ✅ | **❌** | ✅ bouts + corps¹ | ❌ |
| `PlacingForceEnd` | ❌ | ❌ | ❌ | ❌ |
| `PlacingDistributedForce` | ❌ | ❌ | ❌ | ❌ |
| `PlacingMomentStart` | ◆ d | ◆ e centre | ✅ corps (tout type) ◆ f | ❌ |
| `PlacingMomentEnd` | ❌ | ❌ | ❌ | ❌ |
| `PlacingProbe` | ✅ | ✅ | ✅ corps (tout type) | **❌** |
| `PlacingProbeMetrics` | ❌ | ❌ | ❌ | ❌ |

Les états « …End » et `PlacingDistributedForce` ne visent **rien** volontairement : le geste définit
un vecteur, pas une cible, et c'est `snap_load_hover` qui aimante la direction et la longueur sur le
survol `Void`. Même raison pour `MovingForce` / `MovingDistributedForce` / `MovingMoment` plus bas.

## Déplacement

| État | nœud | engrenage | edge | courroie |
|---|---|---|---|---|
| `MovingNode` | ✅ | ✅ | ✅ bouts + corps¹ | ✅ bouts |
| `MovingEdgeStartPoint` | ◆ a | ✅ | ✅ bouts + corps¹ | ✅ bouts |
| `MovingEdgeEndPoint` | ◆ a | ✅ | ✅ bouts + corps¹ | ✅ bouts |
| `MovingEdgeBody` | ✅ | ✅ | ✅ **bouts seuls**² | ✅ bouts |
| `MovingBeltBody` | ❌ | ◆ g | ❌ | ❌ |
| `ChangingGearRadius` | ✅ | ◆ h | ✅ **bouts seuls** | ◆ c brins |
| `MovingConstraint` | ❌ | ❌ | ❌ | ❌ |
| `MovingForce` / `MovingDistributedForce` / `MovingMoment` | ❌ | ❌ | ❌ | ❌ |
| `MovingSelectionMultiple` | ❌ | ❌ | ❌ | ❌ |
| `SimulationDragging` | ❌ | ❌ | ❌ | ❌ |

² `MovingEdgeBody` sort aussi en `null` d'emblée si l'edge déplacé n'est pas une `beam`.

## Contraintes et cotations

| État | nœud | engrenage | edge | courroie |
|---|---|---|---|---|
| `DimensionStart` | ✅ | ✅ | ✅ corps | ✅ arcs + brins, **pas les bouts** |
| `DimensionNode` | ✅ | ❌ | ✅ corps | ❌ |
| `DimensionEdge` | ✅ | ❌ | ✅ corps | ❌ |
| `DimensionNodeToNode` / `EdgeToNode` / `Angle` / `Radius` / `Belt` | ❌ | ❌ | ❌ | ❌ |
| `HorizontalVerticalConstraintStart` | ✅ | ❌ | ✅ corps | ❌ |
| `HorizontalVerticalConstraintNode` | ✅ | ❌ | ❌ | ❌ |
| `NormalConstraintStart` / `Edge` | ❌ | ❌ | ✅ corps | ❌ |
| `ParallelConstraintStart` / `Edge` | ❌ | ❌ | ✅ corps | ❌ |
| `EqualConstraintStart` | ❌ | ◆ e centre | ✅ corps | ❌ |
| `EqualConstraintEdge` | ❌ | ❌ | ✅ corps | ❌ |
| `EqualConstraintGear` | ❌ | ◆ e centre | ❌ | ❌ |
| `GearRatioConstraintStart` / `Gear` | ❌ | ◆ e centre | ❌ | ❌ |

Les cinq états `Dimension…` qui ne visent rien ont déjà leurs deux opérandes : il ne reste qu'à
poser l'étiquette, il n'y a plus de cible à désigner.

---

## Les géométries propres

- **a — `beamBodyHover`.** En plus du centre du nœud, la barre tirée *au-delà* de lui l'attrape :
  le nœud finit sur son corps et non à sa pointe. Position renvoyée = la projection du curseur sur
  l'axe. Trois états seulement : `PlacingBeamEnd`, `MovingEdgeStartPoint`, `MovingEdgeEndPoint`.
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
  *déplacé*, pas du curseur.

Toute la face intérieure d'un engrenage est morte : la branche exige que le curseur soit à
`HIT_TOLERANCE.NODE / 2` près de la jante. Seul le cas **d** perce ce trou, et uniquement en passant
par l'axe.

---

## Les bornes du curseur

`clamp_to_bounds` (`src/components/canvas/hover-bounds.ts`) borne le curseur **avant** que quoi que
ce soit ne le lise, de sorte que le survol et le geste partagent le même point. Ce n'est pas du
survol à proprement parler, mais ça décide de ce qui est atteignable — donc de ce que les tables
ci-dessus peuvent réellement produire.

| État | borne |
|---|---|
| `PlacingBeamEnd` / `SpringEnd` / `DamperEnd` | à `MIN_EDGE_LENGTH` du départ |
| `PlacingBeltEnd`, aucune poulie posée | à `MIN_EDGE_LENGTH` du départ |
| `PlacingBeltEnd`, au moins une poulie | hors du disque de la dernière poulie |
| `PlacingGearRadius` / `ChangingGearRadius` | à `MIN_GEAR_RADIUS` du centre |
| `MovingEdgeStartPoint` / `EndPoint` | à `MIN_EDGE_LENGTH` du bout opposé, et hors de la poulie enroulée |
| `MovingNode` | la même, une fois par bout d'edge que le nœud porte |

Une courroie fait exception au minimum de longueur **dès qu'elle porte une poulie** : ses deux bouts
doivent pouvoir se rejoindre, c'est la fermeture de la boucle.

Ces bornes sont une aide au survol, pas un invariant : la tolérance de clic et l'aimantation à la
grille passent après et peuvent ramener le point de quelques pixels vers l'intérieur.

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
