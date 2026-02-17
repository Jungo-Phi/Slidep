# Critique et Amélioration du Solveur Géométrique

## 1. Critique de la Solution Actuelle

L'implémentation actuelle de `geometric-solver.ts` et le plan décrit dans `geometric-constraints-solver-implementation-plan.md` reposent sur une approche **PBD (Position Based Dynamics)**. C'est un excellent choix pour la stabilité et la performance (60 FPS), mais plusieurs points critiques limitent son efficacité pour un système mécanique précis :

### Points Faibles Identifiés :

1.  **Convergence Lente pour les Systèmes Rigides** : Le PBD "mou" (relaxation) peine à maintenir des distances exactes (ex: longueur d'un Beam) sans un grand nombre d'itérations, surtout quand les chaînes cinématiques sont longues.
2.  **Gestion des Masses Simpliste** : L'utilisation binaire (0 ou 1) pour les masses empêche de simuler des priorités de mouvement plus fines ou de gérer correctement les éléments "lourds" vs "légers".
3.  **Absence de "Sub-stepping"** : Pour les mouvements rapides ou les contraintes fortes, 20 itérations globales peuvent ne pas suffire.
4.  **Incohérence des Actions de Sortie** : Le solveur génère une liste d'actions (`MoveNode`, etc.) en comparant l'état final. Si une action initiale est `MoveNode`, le résultat contient à la fois l'action originale et ses conséquences, ce qui peut créer des doublons ou des conflits dans le `actionReducer`.
5.  **Contraintes Unilatérales** : Les fonctions comme `applyBodyConstraint` utilisent des projections directes qui ne respectent pas le principe de conservation du moment/centre de masse du PBD (bien que moins critique en CAO qu'en physique, cela crée des "sauts" visuels).
6.  **Dépendance à l'Ordre** : L'ordre dans lequel `forEach` parcourt les éléments influence le résultat final à chaque itération.

---

## 2. Proposition de Nouvelle Solution : "PBD Hiérarchique & Stable"

L'idée est de conserver le PBD mais de l'améliorer pour garantir le "zéro erreur" sur les liaisons critiques (pivots, longueurs de beams) tout en permettant la flexibilité sur les dimensions.

### Améliorations Clés :

#### A. Système de Priorités (Masses Étendues)

Au lieu de 0 ou 1, on utilise une échelle :

- `0` : Ancre (Immobile).
- `0.1` : Élément "Directement Manipulé" (très forte priorité).
- `1.0` : Élément libre standard.
- `10.0` : Élément "esclave" ou contrainte faible.

#### B. Pré-calcul de Propagation (Arborescence)

Avant la relaxation, effectuer une passe de propagation directe (BFS) depuis le point manipulé. Cela place le système dans une configuration "proche" de la solution, réduisant drastiquement le travail du PBD.

#### C. Contraintes "Hard" vs "Soft"

- **Hard** : Coïncidence (Pivots), Longueur de Beam. Celles-ci doivent être résolues avec une tolérance quasi nulle.
- **Soft** : Dimensions (Distance, Angle), Alignements. Celles-ci peuvent avoir une "élasticité" si le système est sur-contraint.

#### D. Sortie Consolidée

Au lieu de retourner une liste d'actions atomiques, retourner une action unique de type `UpdateMechanismGeometry` contenant un snapshot complet des positions modifiées. Cela évite de polluer l'historique Undo/Redo avec 50 actions `MoveNode`.

---

## 3. Plan de Modification de `geometric-solver.ts`

1.  **Refactoriser l'initialisation** : Créer une structure de données `SolverState` plus robuste.
2.  **Implémenter le BFS de propagation** : Pour "pousser" les éléments connectés avant la relaxation.
3.  **Améliorer les fonctions `apply...Constraint`** :
    - Utiliser des gradients de correction plus précis.
    - Ajouter un paramètre de `stiffness` (rigidité).
4.  **Optimiser la boucle de relaxation** :
    - Ajouter un critère de sortie anticipée si `maxError < epsilon`.
    - Stabiliser l'ordre de traitement.
5.  **Changer le format de sortie** : Vers une action de mise à jour globale.

## 4. Algorithme de Résolution Révisé

```typescript
// Pseudo-code de la boucle améliorée
for (let i = 0; i < iterations; i++) {
  // 1. Résoudre les contraintes structurelles (Pivots, Beams) - Rigidité 1.0
  // 2. Résoudre les contraintes géométriques (Dimensions) - Rigidité 0.5 à 0.8
  // 3. Résoudre les limites (Sliders, Engrenages)

  if (maxError < 0.01) break; // Convergence rapide
}
```
