# Story 1.2: Sélectionner et modifier des éléments - PLAN D'IMPLÉMENTATION

## Vue d'ensemble

Story 1.2 permet aux utilisateurs de sélectionner des éléments existants sur le canvas et de modifier leurs propriétés en temps réel via un panneau de propriétés intuitif.

## Acceptance Criteria

### AC1: Sélection d'un élément avec surbrillance

- **Given** plusieurs éléments sur le canvas
- **When** je clique sur un élément spécifique
- **Then** l'élément est mis en surbrillance
- **And** un panneau de propriétés s'affiche avec les paramètres modifiables

### AC2: Modification des propriétés en temps réel

- **Given** un élément sélectionné
- **When** je modifie une propriété (position, taille, angle)
- **Then** l'élément se met à jour visuellement en temps réel
- **And** les modifications sont sauvegardées automatiquement
- **And** les connexions avec d'autres éléments sont préservées

## Architecture de la Solution

### 1. Détection de Clic Améliorée

**Fichier:** `src/components/mechanical-canvas/MechanicalCanvas.tsx`

Implémentation d'une fonction `isElementClicked()` avec détection type-spécifique:

#### Éléments Ponctuels (node, pivot, join, pulley, gear)

- Détection basée sur la distance au centre
- Rayon de détection = rayon de l'élément + tolérance
- Formule: `distance < radius + tolerance`

#### Éléments Linéaires (beam, rope, spring, damper, belt)

- Détection basée sur la distance à la ligne segment
- Calcul du point le plus proche sur le segment
- Formule: `distance_to_line < tolerance`

#### Éléments Rectangulaires (slider, slidep, ground)

- Détection basée sur les limites du rectangle
- Formule: `dx < width/2 + tolerance AND dy < height/2 + tolerance`

### 2. Panneau de Propriétés Amélioré

**Fichier:** `src/components/properties-panel/PropertiesPanel.tsx`

Refonte complète avec:

#### Propriétés Communes

- Position X, Y (nombres)
- Rotation (degrés, conversion automatique)
- Verrouillage/Déverrouillage

#### Propriétés Type-Spécifiques

| Type   | Propriétés                  |
| ------ | --------------------------- |
| Node   | Rayon, Fixé                 |
| Beam   | Longueur, Largeur           |
| Slider | Plage min/max               |
| Pivot  | Rayon, Plage d'angle        |
| Ground | Largeur, Hauteur            |
| Slidep | Largeur, Hauteur, Direction |
| Spring | Raideur, Longueur au repos  |
| Damper | Coefficient d'amortissement |
| Rope   | Longueur, Tension           |
| Belt   | Largeur, Tension            |
| Join   | Rayon                       |
| Pulley | Rayon, Plage d'angle        |
| Gear   | Rayon, Dents, Plage d'angle |

### 3. Gestion de l'État

**Fichier:** `src/stores/mechanisms.ts`

Utilisation des actions existantes:

- `selectElement(id, multiSelect)` - Sélection simple ou multiple
- `deselectAll()` - Désélection
- `updateElement(id, updates)` - Mise à jour des propriétés
- `deleteElement(id)` - Suppression

### 4. Feedback Visuel

- **Surbrillance**: Changement de couleur au bleu primaire (#1976d2)
- **Contour**: Trait supplémentaire pour les éléments sélectionnés
- **Panneau**: Affichage/masquage automatique
- **Mise à jour**: Rendu immédiat des modifications

## Implémentation Détaillée

### Étape 1: Amélioration de la Détection de Clic

```typescript
const isElementClicked = (
  element: MechanicalElement,
  x: number,
  y: number
): boolean => {
  const tolerance = 15;
  const el = element as any;

  switch (element.type) {
    case "node":
    case "pivot":
    case "join":
    case "pulley":
    case "gear": {
      const dx = el.position.x - x;
      const dy = el.position.y - y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const radius = el.radius || 10;
      return distance < radius + tolerance;
    }
    // ... autres cas
  }
};
```

### Étape 2: Refonte du Panneau de Propriétés

```typescript
const renderTypeSpecificProperties = (element: MechanicalElement | null) => {
  if (!element) return null;

  switch (element.type) {
    case 'node':
      return (
        <>
          <TextField label="Rayon" ... />
          <FormControlLabel label="Fixé" ... />
        </>
      );
    // ... autres cas
  }
};
```

### Étape 3: Intégration avec le Canvas

```typescript
const handleClick = useCallback(
  (event: React.MouseEvent<HTMLCanvasElement>) => {
    // ... conversion des coordonnées

    const clickedElement = currentMechanism.elements.find((element) => {
      return isElementClicked(element, x, y);
    });

    if (clickedElement) {
      selectElement(clickedElement.id, event.shiftKey);
    } else {
      deselectAll();
    }
  },
  [...]
);
```

## Fichiers Modifiés

### 1. src/components/mechanical-canvas/MechanicalCanvas.tsx

- Ajout de `isElementClicked()` avec détection type-spécifique
- Amélioration de `handleClick()` pour utiliser la nouvelle détection
- Import de `MechanicalElement` type

### 2. src/components/properties-panel/PropertiesPanel.tsx

- Refonte complète avec propriétés type-spécifiques
- Ajout de `renderTypeSpecificProperties()`
- Support pour tous les 13 types d'éléments
- Interface utilisateur améliorée avec MUI

## Tests d'Acceptation

### Test 1: Sélection Simple

```
1. Créer 3 éléments différents
2. Cliquer sur le premier
3. Vérifier: surbrillance + panneau de propriétés
```

### Test 2: Modification de Position

```
1. Sélectionner un élément
2. Modifier X dans le panneau
3. Vérifier: élément se déplace immédiatement
```

### Test 3: Modification de Rotation

```
1. Sélectionner un élément
2. Modifier Rotation
3. Vérifier: élément tourne immédiatement
```

### Test 4: Propriétés Type-Spécifiques

```
1. Sélectionner différents types
2. Vérifier: propriétés correctes affichées
```

### Test 5: Sélection Multiple

```
1. Cliquer sur élément 1
2. Shift+Cliquer sur élément 2
3. Vérifier: les deux sélectionnés
```

### Test 6: Verrouillage

```
1. Sélectionner un élément
2. Cliquer sur verrouillage
3. Vérifier: champs désactivés
```

### Test 7: Suppression

```
1. Sélectionner un élément
2. Cliquer sur suppression
3. Vérifier: élément supprimé
```

### Test 8: Détection Précise

```
1. Créer un Beam
2. Cliquer près de la ligne
3. Vérifier: élément sélectionné
```

## Dépendances

- React 18+
- Material-UI (MUI)
- Zustand
- TypeScript

## Performance

- Détection de clic: O(n) où n = nombre d'éléments
- Acceptable pour < 1000 éléments
- Rendu optimisé avec useCallback
- Pas de re-renders inutiles

## Accessibilité

- Labels appropriés pour les champs
- Support clavier complet
- Contraste WCAG AA
- Aria-labels pour les boutons

## Prochaines Étapes

1. **Story 1.2b**: Créer et gérer les connexions entre éléments
2. **Story 1.2c**: Définir les éléments par leurs points caractéristiques
3. **Story 1.3**: Supprimer des éléments
4. **Story 1.4**: Grouper des éléments en composants
