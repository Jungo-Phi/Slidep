# Plan — déconnexion sur courroie fermée (tendue)

## Le bug

Quand une poulie se déconnecte d'une courroie **tendue** (perte de contact,
`wrap ≤ 0`), le **dessin** montre la boucle réduite (il filtre les gears
déconnectés), mais le **solveur** ne suit pas :

| Élément | Déconnexion prise en compte ? |
|---|---|
| Dessin (`draw_belt_loop`, spirale) | ✅ filtre les gears déconnectés |
| `BeltLength` (closed) | ✅ les saute |
| `rewire_belt_mesh` | ⚠️ retire seulement le `BeltPhaseGear` du gear déconnecté |
| `BeltPin` (jonction) | ❌ tracé sur **tous** les gears + `s0` figé sur l'ancienne boucle |
| `BeltFollowsTangent` (beam soudé) | ❌ pareil |

Résultat : la jonction (`BeltPin`) chevauche la boucle **complète** (poulie
fantôme incluse), en décalage avec la boucle réduite dessinée.

De plus, c'est **plus profond qu'un filtre** : la jonction voyage à
`s = s0 + rε·(θ_ref − θ_ref0)`, où `s0` est une abscisse curviligne sur la
boucle **d'origine**. Quand la boucle change (poulie déconnectée), sa longueur
change → `s0` devient faux → la jonction **saute**.

## Correction (3 parties)

1. **Filtrer** les gears déconnectés dans `applyBeltPinConstraint` et
   `applyBeltFollowsTangentConstraint` : construire le tracé (`belt_pieces`)
   depuis les gears **actifs**, avec un map `via-index → index-gear-original`
   pour remapper `best.gearIndex`/`gearIndexB`, `refIndex` et `wraps`.

2. **Re-baker** `s0`/`thetaRef0` au moment de la déconnexion (comme
   `rewire_belt_mesh` re-bake `θ0` pour le mesh) : re-projeter la jonction sur
   la boucle réduite (`belt_project(activeVias, J)` → nouveau `s0`,
   `thetaRef0 = θ_ref` courant), pour que la jonction reste en place.

3. **Plomberie** : ajouter `disconnected?: boolean[]` aux liens `BeltPin` et
   `BeltFollowsTangent` (type), le passer dans `PBD_kinematic_solver`, et le
   copier depuis `BeltLength` dans `step_simulation` (comme les `wraps`).

### Cas limite

Si c'est le gear de **référence** (`refIndex`) qui se déconnecte, la jonction
perd son couplage θ → il faut **réélire** une référence active (et re-baker
`s0`/`thetaRef0` en conséquence).

## Validation

Repro numérique (comme pour la courroie libre) : boucle fermée à ≥ 3 gears,
en déconnecter un, vérifier que la jonction reste sur la boucle **réduite** et
ne saute pas. Convertir en test d'assertion dans `belt-length.test.ts`.
