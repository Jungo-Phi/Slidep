# Logique d'Interaction des Éléments : Placement, Drag et Auto-Connexion

## Vue d'ensemble

Le système d'interaction des éléments mécaniques dans slidep gère trois opérations principales :

- **Placement** : Création d'éléments sur le canvas
- **Drag** : Déplacement d'éléments existants
- **Auto-Connexion** : Connexions automatiques entre éléments lors du placement ou drag

## Architecture

### Fichiers Clés

- `src/components/mechanical-canvas/MechanicalCanvas.tsx` : Composant principal du canvas, gère les événements souris
- `src/components/mechanical-canvas/canvas-interactions.ts` : Logique de création et connexion des éléments
- `src/lib/auto-connection.ts` : Fonctions de planification des connexions automatiques

### Flux de Données

```
Événement Souris → MechanicalCanvas.tsx → canvas-interactions.ts → auto-connection.ts → Store
```

## Placement d'Éléments

### Éléments Edge (Beam, Spring, Damper, Belt)

1. **Initiation** : Clic gauche pour premier point
2. **Placement** : Clic gauche pour second point
3. **Création** : `handleEdgePlacement()` crée l'élément via `element-factory`
4. **Auto-Connexion** : `planBeamPlacementConnections()` (ou équivalent) analyse proximité
5. **Application** : `applyAutoConnectionPlan()` met à jour le store

### Éléments Node (Pivot, Slider, etc.)

1. **Placement** : Clic gauche à la position désirée
2. **Création** : `handleNodePlacement()` crée l'élément
3. **Auto-Connexion** : Fonction de plan appropriée (`planPivotPlacementConnections`, etc.)
4. **Application** : `applyAutoConnectionPlan()` applique les changements

## Drag d'Éléments

### Logique Générale

1. **Début** : `handleClick()` détecte clic sur élément, stocke `draggedElementRef`
2. **Pendant** : `handleMouseMove()` met à jour position en temps réel
3. **Fin** : `handleMouseUp()` déclenche auto-connexion

### Auto-Connexion lors du Drag

- **Déclencheur** : Relâchement du bouton souris
- **Fonction** : `planDragConnections(element, newPosition, mechanism)`
- **Logique** : Même règles que le placement, appliquées à la nouvelle position
- **Application** : `applyAutoConnectionPlan()` met à jour connexions

## Auto-Connexion

### Principes

- **Symétrie** : Chaque connexion référence les deux éléments
- **Tolérance** : Distance maximale de 10 unités canvas pour connexion
- **Types** : Rigid (fixed), Pivot (rotating), Slider (translating)

### Fonctions de Planification

Chaque type d'élément a sa fonction de planification :

- `planBeamPlacementConnections()` : Connexions aux nodes proches, création de joins
- `planSliderPlacementConnections()` : Connexion aux beams, fusion avec pivot
- `planPivotPlacementConnections()` : Connexion aux edges, fusion avec slider
- `planDragConnections()` : Logique identique au placement avec nouvelle position

### Structure du Plan

```typescript
interface AutoConnectionPlan {
  updates: ElementMutation[]; // Modifications d'éléments existants
  additions: MechanicalElement[]; // Nouveaux éléments (joins, fusions)
  removals: string[]; // IDs à supprimer (fusions)
}
```

### Règles de Connexion

#### Beam + Node

- **Endpoint** : Node dans tolérance → connexion fixed/rotating via `fixedEdges`/`rotatingEdges`
- **Length** : Node sur ligne → connexion slider/pivot via `parentBeam` (relation hiérarchique pour glissement)
- **Join** : Edges se croisant → création join automatique

#### Slider + Pivot

- **Fusion** : Proximity → création slidep, suppression originaux

#### Ground

- **Node** : `isGrounded = true`
- **Edge** : Création join grounded

## Structure de Données des Updates

Les updates sont gérés via l'interface `AutoConnectionPlan`, qui encapsule toutes les modifications nécessaires lors des opérations de placement, drag et auto-connexion :

```typescript
interface AutoConnectionPlan {
  updates: ElementMutation[]; // Modifications d'éléments existants
  additions: MechanicalElement[]; // Nouveaux éléments à ajouter
  removals: string[]; // IDs des éléments à supprimer
}

interface ElementMutation {
  id: string;
  updates: Partial<MechanicalElement>; // Propriétés partielles à modifier
}
```

### Fonctionnement des Updates

#### 1. **Génération du Plan**

Chaque opération (placement ou drag) déclenche une fonction de planification spécifique :

- `planBeamPlacementConnections()` pour les beams
- `planPivotPlacementConnections()` pour les pivots
- `planSliderPlacementConnections()` pour les sliders
- `planDragConnections()` pour le drag de n'importe quel élément

Ces fonctions analysent :

- La proximité spatiale (distance < 10 unités canvas)
- Les règles de connexion par type d'élément
- Les fusions possibles (slider + pivot → slidep)

#### 2. **Types d'Updates**

Les updates modifient les propriétés des éléments existants :

**Pour les beams :**

- `fixedNodes` : liste des nodes connectés
- Ajout de joins dans `fixedNodes` lors de croisements

**Pour les nodes (pivot/slider) :**

- `rotatingEdges` / `fixedEdges` : listes des edges connectés (pour connexions fixes aux extrémités)
- `parentBeam` / `parentBeamConnection` : relation hiérarchique (pour glissement le long de la poutre, connexion "length")
- `angle` : orientation pour les sliders
- `position` : mise à jour lors du drag

**Pour les edges :**

- `fixedNodes` : nodes connectés

#### 3. **Application des Updates**

La fonction `applyAutoConnectionPlan()` applique séquentiellement :

1. **Updates** : `useMechanismsStore.getState().updateElement(id, updates)`
2. **Additions** : `useMechanismsStore.getState().addElement(element)`
3. **Removals** : `useMechanismsStore.getState().deleteElement(id)`

#### 4. **Règles de Connexion Automatique**

**Beam + Node :**

- Endpoint (< 10 unités) → connexion fixed/rotating via `fixedEdges`/`rotatingEdges` (pas de `parentBeam`)
- Sur la longueur → connexion slider/pivot avec `parentBeam` (glissement proportionnel)

**Croisement de beams :**

- Création automatique de `JoinElement` avec `fixedEdges: [beam1.id, beam2.id]`

**Fusion slider + pivot :**

- Création de `SlidepElement`
- Suppression des éléments originaux

**Ground :**

- Nodes : `isGrounded = true`
- Edges : création de join grounded

#### 5. **Optimisations**

- Filtrage précoce par type d'élément
- Calculs de distance optimisés
- Mise à jour sélective du store (seules les propriétés modifiées)

## Intégration Store

### Mises à Jour

- `updateElement(id, updates)` : Modification propriétés
- `addElement(element)` : Ajout nouveau élément
- `deleteElement(id)` : Suppression élément

### État Global

- `useMechanismsStore` : Gestion éléments et mécanisme
- `useUIStore` : État interface (outil actif, mode placement)

## Gestion des Événements

### Mouse Events

- `onMouseDown` : handleClick (sélection/début drag/placement)
- `onMouseMove` : handleMouseMove (drag/ghost preview)
- `onMouseUp` : handleMouseUp (fin drag/auto-connexion)

### États Locaux

- `draggedElementRef` : Élément en cours de drag
- `dragModeRef` : Type de drag (normal/start-point/end-point)
- `selectionBox` : Zone de sélection multiple

## Optimisations

### Performance

- Filtrage précoce des éléments par type
- Calculs de distance optimisés
- Mise à jour sélective du store

### UX

- Ghost preview pendant placement
- Snap aux edges existants
- Feedback visuel (hover, sélection)

## Extension

### Nouveaux Types d'Éléments

1. Ajouter type dans `ElementType`
2. Implémenter fonction de plan dans `auto-connection.ts`
3. Intégrer dans `handleNodePlacement` ou `handleEdgePlacement`
4. Ajouter rendu dans `drawElements`

### Nouvelles Règles de Connexion

- Modifier fonctions de plan existantes
- Respecter principe de symétrie
- Maintenir performance</content>
  </xai:function_call">The file has been created successfully at element-interaction-logic.md.
