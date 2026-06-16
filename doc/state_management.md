# Gestion d'États dans Slidep

## Introduction

Ce document décrit la gestion d'états dans l'application Slidep, en se concentrant sur les composants principaux `App.tsx` et `MechanicalCanvas.tsx`, ainsi que sur les étapes et variables importantes dans le placement d'un nouvel élément.

## Analyse de `App.tsx`

### États Principaux

Le composant `App.tsx` gère plusieurs états principaux pour l'application :

1. **canvasState** : Représente l'état actuel du canvas (par exemple, sélection, déplacement, placement d'un élément).
   - Type : `CanvasState`
   - Initialisation : `{ type: "Selecting" }`

2. **mechanism** : Contient tous les éléments mécaniques du mécanisme, ainsi que les métadonnées et l'historique des actions.
   - Type : `Mechanism`
   - Initialisation :
     ```typescript
     {
       metadata: DEFAULT_METADATA,
       viewport: DEFAULT_VIEWPORT,
       mechanical_elements: [],
       constraint_elements: [],
       history: [],
       future: [],
     }
     ```

3. **hoveredPart** : Représente la partie du mécanisme sur laquelle la souris est actuellement positionnée.
   - Type : `HoveredPart`
   - Initialisation : `{ type: "Void", position: ZERO }`

4. **simulationState** et **simulationConfig** : Gèrent l'état et la configuration de la simulation.
   - Types : `SimulationState` et `SimulationConfig`
   - Initialisation : `DEFAULT_SIMULATION_STATE` et `DEFAULT_SIMULATION_CONFIG`

### Fonctions Principales

- **updateMechanism** : Met à jour le mécanisme en appliquant une action. Utilise `actionReducer` pour traiter l'action et mettre à jour l'état du mécanisme.
  ```typescript
  const updateMechanism = (action: Action) => {
    console.log("A updateMechanism: ", mechanism.mechanical_elements.length);
    setMechanism((prevMechanism) => actionReducer(prevMechanism, action));
    console.log("B updateMechanism: ", mechanism.mechanical_elements.length);
  };
  ```

## Analyse de `MechanicalCanvas.tsx`

### États et Références

Le composant `MechanicalCanvas.tsx` gère les interactions utilisateur et les rendus du canvas :

1. **canvasRef** et **containerRef** : Références vers le canvas et son conteneur pour la manipulation du DOM.
2. **canvasOffsetRef** : Stocke l'offset du canvas pour le calcul des positions de la souris.
3. **mousePos** : Stocke la position actuelle de la souris sur le canvas.

### Gestion des Événements

Le composant gère plusieurs types d'événements utilisateur :

- **onMouseUpHandler** : Gère le relâchement du bouton de la souris.
- **onMouseDownHandler** : Gère l'appui sur le bouton de la souris et met le focus sur le canvas.
- **onMouseMoveHandler** : Gère le mouvement de la souris et met à jour la position de la souris.
- **onKeyDownHandler** : Gère les appuis sur les touches du clavier.
- **onContextMenuHandler** : Empêche l'affichage du menu contextuel par défaut.

### Fonction `handleEvent`

Cette fonction est responsable de la gestion des événements du canvas. Elle utilise `canvasStateReducer` pour mettre à jour l'état du canvas en fonction de l'événement.

```typescript
function handleEvent(event: CanvasEvent) {
  canvasStateReducer(
    canvasState,
    setCanvasState,
    hoveredPart,
    setHoveredPart,
    mechanism,
    updateMechanism,
    mousePos,
    event,
  );
}
```

## Placement d'un Nouvel Élément

### Étapes de Placement

Le placement d'un nouvel élément dans Slidep suit plusieurs étapes clés, gérées principalement par le `canvasStateReducer` :

1. **Initialisation du Placement** : L'utilisateur sélectionne un type d'élément à placer (par exemple, une poutre, un ressort, un amortisseur, etc.).
   - Exemple : `PlacingBeamStart`, `PlacingSpringStart`, etc.

2. **Début du Placement** : Lorsque l'utilisateur clique sur le canvas, l'état passe à l'étape de début de placement.
   - Exemple : `PlacingBeamEnd`, `PlacingSpringEnd`, etc.
   - Variables importantes : `startPos` (position de départ).

3. **Fin du Placement** : Lorsque l'utilisateur clique à nouveau, l'état passe à l'étape de fin de placement, et un nouvel élément est créé.
   - Exemple : Création d'une poutre avec `CreateEdge`, d'un pivot avec `CreateNode`, etc.
   - Variables importantes : `newElementId` (identifiant unique pour le nouvel élément), `mousePos` (position actuelle de la souris).

4. **Connexion des Éléments** : Après la création de l'élément, le système vérifie s'il peut être connecté à d'autres éléments existants.
   - Utilisation de `connect_element` pour établir les connexions.

5. **Réinitialisation de l'État** : L'état est réinitialisé pour permettre le placement d'un nouvel élément.
   - Exemple : Retour à `PlacingBeamStart` après avoir placé une poutre.

### Variables Importantes

- **newElementId** : Identifiant unique généré pour chaque nouvel élément.
- **startPos** : Position de départ pour les éléments qui nécessitent deux points (par exemple, les poutres, les ressorts).
- **mousePos** : Position actuelle de la souris, utilisée pour déterminer la position de fin ou le rayon (pour les engrenages).
- **connectedGearsIds** et **connectedGearsDirections** : Utilisés pour les courroies pour garder une trace des engrenages connectés.

### Exemple de Placement d'une Poutre

1. L'utilisateur sélectionne l'outil de placement de poutre.
2. L'état passe à `PlacingBeamStart`.
3. L'utilisateur clique sur le canvas pour définir le point de départ.
4. L'état passe à `PlacingBeamEnd` avec `startPos` défini.
5. L'utilisateur clique à nouveau pour définir le point de fin.
6. Une nouvelle action `CreateEdge` est créée avec les positions de départ et de fin.
7. L'état est réinitialisé à `PlacingBeamStart`.

## Conclusion

La gestion d'états dans Slidep est structurée autour de plusieurs composants clés qui interagissent pour fournir une expérience utilisateur fluide. Le composant `App.tsx` gère les états globaux de l'application, tandis que `MechanicalCanvas.tsx` et `canvasStateReducer` gèrent les interactions utilisateur et les mises à jour d'état spécifiques au canvas. Le placement d'un nouvel élément suit un flux clair et structuré, permettant aux utilisateurs de créer et de connecter des éléments mécaniques de manière intuitive.
