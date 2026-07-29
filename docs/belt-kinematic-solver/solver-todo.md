# Solveur & perf : ce qu'il reste à faire

État au 22/07/2026. Contexte détaillé dans `docs/contrainte-angle.md` et la mémoire perf.

## Prioritaire

- **Portage en index (`Nodes`).** Objet possédant des `Float64Array`, helpers (`addTo`, `x(i)`…), `Point2` gardé comme type d'échange pour les contraintes complexes. Gain mesuré : ×2,7 rien qu'en remplaçant les clés-chaînes par des index (le passage aux `Float64Array` n'ajoute que ×1,6 de plus). Découpage conseillé : infra + contraintes simples d'abord, courroies/engrenages via `point(i)` ensuite, pour garder la suite verte. Touche `compile_simulation_model`, `get_geom_nodes`, `parsing.ts`, traduction des grabs. Filet en place : `constraint-convergence.test.ts`.

- **Divergence de Core XY.** Non résolue. Après le passage des contraintes d'angle en projection PBD, les corrections partielles (un verrou d'angle par poutre ; cibles arrondies à 90°) laissent `BeltLength` comme pire lien → les courroies sont en cause en propre. Revalider après le portage.

- **Retravailler les contraintes de courroie** (`BeltLength`, `BeltPin`, `BeltFollowsTangent`, `BeltPhaseGear`, `BeltJunction`). Déjà signalées instables. Écrire leurs tests de convergence une fois stabilisées (exclues à dessein de `constraint-convergence.test.ts`).

## Secondaire

- **`applyParallelConstraint` / `applyNormalConstraint`** : vérifier qu'elles suivent bien la projection PBD comme `applyAngleConstraint` (même schéma « rotation autour du milieu » à l'origine). Les tests de convergence passent, mais relire.

- **Sur-relaxation (ω) sur les liens `Distance`.** ×2 sur le nombre d'itérations à convergence (Jansen). Mise en pause car risquée près des singularités et sur les sur-contraints — à ne reprendre qu'une fois Core XY stable, et à valider sur plusieurs mécanismes.

- **Passe de diagnostic en lecture seule.** `collectDiagnostics` est actif en permanence en simulation (~8 %) alors que `residuals` n'est lu qu'en fin de résolution. Une passe finale dédiée récupérerait presque tout.

## Fait

- Cache de la géométrie du conteneur (ResizeObserver), trajectoires incrémentales.
- Pondération de `applyAngleConstraint` corrigée (`w/totalW`), réécriture en projection PBD (+ `Parallel`, `Normal`, `OnSegment`, `EqualLength`).
- Seuils de diagnostic séparés px / rad / ratio.
- Mode debug du solveur (`solver-trace.ts`), inactif par défaut.
- Tests de convergence par contrainte (hors courroies).

## Non prioritaire

- Sortir `kinematicSnapshots` du state React : mesuré négligeable côté CPU (129 ms / 60 s), ne concerne que la pression mémoire et les re-renders.
- Réécriture complète du solveur en `Float64Array` sans `Point2` : le portage en index couvre l'essentiel du gain ; le reste ne vaut pas la perte de lisibilité.
