# Plan d'Implémentation du Solveur de Contraintes Géométriques

Ce document synthétise la stratégie d'implémentation du système de résolution de contraintes géométriques et son intégration avec le système d'actions.

## 1\. Intégration avec le Système d'Actions (Undo/Redo)

Le solveur n'est pas un état à part, mais un **transformateur d'actions**. Il garantit que chaque action appliquée au mécanisme produit un état géométriquement cohérent.

### Stratégie : "Résolution par Action"

Le solveur de contraintes intervient dès qu'une action susceptible de modifier la géométrie est déclenchée.

1.  **Déclenchement** : Une action est initiée (ex: `MouseMove` pendant un drag, édition d'une valeur dans le panneau de propriétés, changement de liaison).
2.  **Résolution** : Le solveur prend l'action en entrée, l'applique virtuellement, puis résout les contraintes pour stabiliser le système.
3.  **Émission** : Une action enrichie (ou une liste d'actions) est envoyée au `actionReducer`. Cette action contient les positions finales de tous les éléments impactés (Nodes, extrémités de Beams, centres d'engrenages, etc.).
4.  **Undo/Redo** : Le système d'historique stocke ces actions "résolues". Le retour en arrière est donc instantané et mène toujours à un état valide.

## 2\. Gestion des Sur-Contraintes

### Détection et Prévention

La détection est effectuée par le solveur lors de la phase de relaxation. Si le système ne converge pas vers une solution respectant les seuils de tolérance :

- **Blocage** : L'action est rejetée ou limitée à la dernière configuration valide connue.
- **Feedback Visuel** : Les contraintes impliquées dans le conflit (celles dont l'erreur résiduelle est la plus élevée) sont marquées comme "en conflit" et affichées en rouge dans le canvas.

## 3\. Architecture du Solveur

### Signature du Solveur

Le solveur doit être capable de traiter différents types de perturbations basées sur l'action en cours. Le nom retenu est `resolveGeometricConstraints`.

```typescript
function resolveGeometricConstraints(
  mechanicalElements: MechanicalElement[],
  constraintElements: ConstraintElement[],
  triggerAction: Action,
): Action[]; // Retourne la liste des actions nécessaires pour atteindre l'état résolu
```

### Logique de Résolution Détaillée

Le solveur fonctionne en quatre phases :

#### **Phase A : Création du graphe de dépendances**

- **Identification des nœuds du graphe (positions)** :
  - Chaque Node
  - Les 2 extrémités des Edges
  - Le point de saisie de l'action (si il y en a un)
- **Identification des arêtes du graphe (contraintes)** :
  - Les liaisons entre éléments :
    - ConnectsParentBeam, ConnectsFixedNodesBody : Contrainte de position sur un segment définit par les 2 extrémités du beam
    - ConnectsFixedNodeStart, ConnectsFixedNodeEnd : Contrainte de coïncidence
    - ConnectsFixedEdges : Contrainte de coïncidence + angle(s) relatif(s)
    - ConnectsRotatingEdges, ConnectsFixedGears : Contrainte de coïncidence
    - ConnectsMeshedGears : Contrainte tangeance (distance des centres égale à la somme des rayons)
    - ConnectsAttachedBelt, ConnectsAttachedGears  : TODO
  - Une contrainte avec le point de saisie :
    - Sur un node : Contrainte de coïncidence
    - Sur une gear tooth : Contrainte d'ancrage de la gear au sol + contrainte de rayon égal à la distance au centre
    - Sur un beam body : Contrainte de position sur un segment définit par les 2 extrémités du beam
    - Sur une extrémité de beam : Contrainte de coïncidence
    - Autre : pas de point de saisie
  - Chaque élément contrainte

**Phase B : Adaptation du graphe de dépendances**

C'est ici qu'on détermine les variations de comportement du solveur. Les points suivants sont pensés pour maintenir à chaque mouvement le méchanisme majoritairement statique avec des changements essentiellement autour du point de saisie, tant que possible.

- **Fusion des éléments coincidents**
- **Calcul de l'ordre (élimine les éléments détachés)**
  - On commence par les points libres, puis dans l'ordre depuis l'opposé du point sélectionné jusqu'à l'atteindre (tri topologique) BFS.
- **Version simplifiée :**
  1.  Node sélectionné : si ancré ALORS enlever l'ancrage.
  2.  Beam body sélectionné : si joint ancré connecté ALORS enlever l'ancrage.
  3.  Beam extrémité sélectionné : ancrage de l'autre extrémité.
  4.  Maintien de la position (**ratio**) sur un beam : A moins de grab le node lui-meme, transformer \[OnSegment -> AtSegmentRatio\].
  5.  Beam sélectionné : si il y a **3 ou plus** degré de liberté ALORS contrainte de **parallélisme**.
  6.  Beam sélectionné : si il y a **3 ou plus** degré de liberté ALORS contrainte de **longueur**.
  7.  ChangingGearRadius sélectionné : si il y a **3 ou plus** degré de liberté ALORS contrainte de **position** de l'engrenage.
  8.  MovingGear sélectionné : si il y a **2 ou plus** degré de liberté ALORS contrainte de **rayon** de l'engrenage.
  9.  Autres beams (dans l'ORDRE) : si il y a **3 ou plus** degré de liberté ALORS contrainte de **parallélisme**.
  10. Autres beams (dans l'ORDRE) : si il y a **3 ou plus** degré de liberté ALORS contrainte de **longueur**.

#### **Phase C : Résolution PBD (Position Based Dynamics)**

- Pour chaque contrainte $C\_i$ :
  - Calculer le gradient de correction $\\Delta P$.
  - Appliquer $\\Delta P$ aux positions des points impliqués, pondéré par leur "masse" (0 pour les ancres, 1 pour les points libres).
- Répéter dans l'ordre inverse.
- Répéter $N$ fois (ex: 10 itérations).

#### **Phase D : Génération des Actions de Sortie**

- Comparaison de l'état final avec l'état initial.
- Génération d'une action groupée (ou liste d'actions) mettant à jour toutes les propriétés modifiées (`position`, `positionStart`, `positionEnd`, `angle`, etc.).

## 4\. Flux de données

1.  **Interaction** : L'utilisateur modifie un élément (Canvas ou Propriétés).
2.  **Interception** : Le `canvasStateReducer` (ou le composant de propriétés) prépare une action.
3.  **Simulation** : `resolveGeometricConstraints(elements, constraints, action)` est appelé.
4.  **Application** : Les actions résultantes (incluant les déplacements de propagation) sont envoyées à `updateMechanism`.
5.  **Rendu** : Le `actionReducer` met à jour le mécanisme, déclenchant le re-render du canvas.

## 6\. Fonctionnement de `resolveGeometricConstraints()` (Implémentation Actuelle)

La fonction suit un pipeline de transformation d'actions en 5 étapes clés :

### 1\. Initialisation de l'État Virtuel

Le solveur extrait les positions actuelles, les rayons et les angles de tous les éléments mécaniques. Il initialise également une carte des **masses** :

- **Masse 0 (Ancre)** : Éléments `Grounded` ou points cibles de l'action utilisateur.
- **Masse 1 (Libre)** : Tous les autres points.

### 2\. Application de l'Action Déclencheuse

L'action initiale (`triggerAction`) est appliquée à l'état virtuel.

- Si c'est un déplacement (`MoveNode`, `MoveEdgeStart`, etc.), le point concerné devient une ancre (masse 0) à sa nouvelle position.
- Si c'est une création (`CreateElement`) d'une contrainte, celle-ci est ajoutée temporairement à la liste de résolution pour stabiliser le système immédiatement.
- Si c'est un changement de rayon (`ChangeGearRadius`), la nouvelle valeur est fixée comme cible.

### 3\. Boucle de Relaxation PBD (Position Based Dynamics)

Le solveur exécute 20 itérations pour minimiser l'erreur globale du système. À chaque itération, il applique :

- **Contraintes Structurelles** :
  - **Coïncidence** : Force les nœuds et les extrémités d'arêtes connectés à partager la même position.
  - **Appartenance au Corps** : Projette les nœuds (sliders, etc.) sur le segment des beams parentes avec une marge de sécurité.
  - **Engrènement** : Maintient la tangence entre engrenages connectés ($Dist = R\_1 + R\_2$).
  - **Courroies** : Aligne les extrémités des courroies `tight` sur les tangentes des engrenages.
- **Contraintes Explicites** :
  - **Dimensions** : Distance (nœud-nœud, arête), Angle, Rayon, Distance point-arête.
  - **Alignements** : Horizontal/Vertical pour nœuds et arêtes.
  - **Géométrie** : Parallélisme, Perpendicularité, Égalité de longueur.
  - **Ratios** : Rapports de rayons entre engrenages.

### 4\. Détection des Conflits

Le solveur calcule l'erreur résiduelle maximale. Si après 20 itérations l'erreur reste supérieure à un seuil (ex: 1px), une alerte de sur-contrainte est logguée.

### 5\. Génération des Actions de Propagation

Le solveur compare l'état final résolu avec l'état initial. Pour chaque différence significative détectée, il génère une action de mise à jour (`MoveNode`, `MoveEdgeStart`, `ChangeGearRadius`, etc.). La liste finale retournée contient l'action initiale enrichie de toutes ses conséquences géométriques.
