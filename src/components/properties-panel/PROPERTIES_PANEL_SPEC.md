# Spécification du Panneau de Propriétés - Slidep

## Introduction

Le panneau de propriétés est un composant clé de l'interface utilisateur Slidep qui s'adapte dynamiquement selon l'état du canvas et la sélection de l'utilisateur. Son but est de fournir des informations contextuelles et des contrôles d'édition pour les éléments sélectionnés, ainsi que des informations générales sur le projet et la simulation.

## Panneaux Principaux

### 1\. Vue Générale du Projet

Quand l'utilisateur n'a rien sélectionné ou quand un autre panneau ne s'applique pas.

**Metadonnées du projet**

- Nom du projet
- Description
- Auteur
- Version (non éditable)
- Date de création (non éditable)
- Date de modification (non éditable)

**Statistiques du canvas**

- Nombre total d'éléments mécaniques

---

### 2\. Élément Sélectionné

Le panneau le plus important, affichant des informations spécifiques pour chaque type d'élément. Il est composé de 3 parties.

#### **Partie A: Informations Générales pour tous les éléments:**

- Identification de l'élément (icône + texte + ID unique)
- Action: Supprimer
- Nodes:
  - Position (Verrouiller = Grounded)
- Edges:
  - startPosition et endPosition
  - Longueur (Verrouiller = Dimension)

---

#### **Partie B: Propriété Spécifique le l'élément**

##### 5\. Mass

- Masse (kg)

##### 6\. Gear

- Rayon

##### 8\. Spring

- Stiffness (N/m)

##### 9\. Damper

- Damping (N·s/m)

---

#### **Partie C: Connexions de l'élément**

##### 1\. Pivot

- Rotating edges (liste)

##### 2\. Slider

- Parent beam
- Fixed edges (liste)

##### 3\. Slidep

- Parent beam
- Rotating edges (liste)

##### 4\. Join

- Fixed edges (liste)

##### 5\. Mass

- Fixed edges (liste)

##### 6\. Gear

- Connected gears + transmission ratio (calculé automatiquement) (Verrouiller = ContrainteRatio)
- Connected belts + direction (sens horaire/anti-horaire)
- Parent beam
- Fixed edges (liste)

##### 7\. Beam

- Fixed node start
- Fixed node end
- Fixed nodes body (liste)

##### 8\. Spring

- Fixed node start
- Fixed node end

##### 9\. Damper

- Fixed node start
- Fixed node end

##### 10\. Belt

- Fixed node start
- Fixed node end
- Connected gears + direction (sens horaire/anti-horaire)

---

### 3\. Panneau de Simulation

Ce panneau affiche les données de simulation et des contrôles spécifiques.

#### Données Générales

- Temps écoulé (secondes)
- Passer au frame suivant (pas à pas)
- Afficher les contraintes
- Afficher/cacher les forces (forces de réaction)
- Afficher/cacher les moments (moments de réaction) 
- Afficher/cacher les trajectoires
- Clear les trajectoires

#### Graphiques

- Traquer un élément
- Liste des éléments traqués
  - Elément
  - Afficher/cacher la trajectoires
  - Type de métrique de l'élément (position, angle, vitesse, etc.)
  - Graphique (métrique/temps)

#### Analyse des degrés de libertés (libertés / blocages)

- Si le méchanisme peut être séparé en plusieurs parties indépendantes, alors afficher les points suivants pour chaque partie.
- Nombre de degrés de liberté (DOF)
- Si (DOF = 0) : Écrire: "Parfaitement contraint"
- Si (DOF \< 0) : Listes des bloquages, on hover afficher une animation de la déformation de l'élément bloqué dans le canvas
- Si (DOF > 0) : Listes de degrés de libertés, on hover afficher une animation du mouvement dans le canvas

Note pour plus tard: Le nombre de degrés de libertés par partie n'est pas un indicateur suffisant (On pourrait avoir une sur-contrainte et une sous-contrainte qui "s'annulent"). Il faudra ajouter un algorithme qui peut détecter les sur-contrainte/sous-contrainte au sein d'une partie.

---

## Design UI/UX

### Principles

1.  **Visibilité**: Les informations pertinentes doivent être immédiatement accessibles
2.  **Simplicité**: Ne pas surcharger l'utilisateur d'informations inutiles
3.  **Consistance**: Même structure pour les types d'éléments similaires
4.  **Feedback**: Affiche les changements en temps réel
5.  **Accessibilité**: Utiliser des couleurs contrastées, des polices lisibles

### Layout

- Header avec titre et bouton de collaps/expand
- Scroll vertical pour les sections longues

### Interactions

- Clic sur une section pour l'éditer (si applicable)
- Hover pour mettre en évidence l'élément dans le canvas

---

## Composants React à Créer

### 1\. Composant VectorInput - Champ de Position X/Y

**Description**: Composant pour afficher et éditer les coordonnées X et Y d'un élément.

**Fonctionnalités**:

- Affiche deux champs de saisie numérique (X et Y) l'un au dessus de l'autre (comme un vecteur)
- Supporte la saisie directe des valeurs
- Permet la modification des positions en temps réel
- Affiche les unités en pixels

**Props**:

```typescript
interface VectorInputProps {
  x: number;
  y: number;
  onChange: (x: number, y: number) => void;
  label: string;
  unit: string;
}
```

---

### 2\. Composant LockableNumberInput - Champ Numérique avec Verrouillage

**Description**: Champ numérique avec un switch en forme d'icône de cadenas pour verrouiller/déverrouiller la valeur.

**Fonctionnalités**:

- Champ de saisie numérique
- Icône de cadenas pour indiquer l'état verrouillé/déverrouillé
- Switch interactif pour activer/désactiver le verrouillage
- Styles différents pour les états verrouillé/déverrouillé
- Permet la modification de la variable liée en temps réel
- Affiche les unités

**Props**:

```typescript
interface LockableNumberInputProps {
  value: number;
  onChange: (value: number) => void;
  locked: boolean;
  onLockedChange: (locked: boolean) => void;
  label: string;
  unit: string;
}
```

---

### 3\. Composant GroundSwitch - Switch avec Icône de Terre

**Description**: Switch avec une icône de "ground" (terre) pour indiquer si un élément est fixé au sol.

**Fonctionnalités**:

- Switch avec icône de terre
- Affiche l'état "Grounded" (fixé) ou "Free" (libre)
- Permet la modification de grounded en temps réel

**Props**:

```typescript
interface GroundSwitchProps {
  grounded: boolean;
  onChange: (grounded: boolean) => void;
}
```

---

### 4\. Composant ElementIdItem - Élément avec Icône, Nom et ID

**Description**: Composant affichant une représentation compacte d'un élément avec icône, nom et ID unique. Utilisé pour les titres d'éléments et les éléments connectés.

**Fonctionnalités**:

- Affiche l'icône de l'élément (selon son type)
- Affiche le nom de l'élément
- Affiche l'ID unique en petite police
- Style cohérent avec la palette d'éléments

**Props**:

```typescript
interface ElementIdItemProps {
  element: Element;
  size: "small" | "large";
}
```

---

### 5\. Composant ConnectedElementIdItem - Élément Connecté avec Interactions Canvas

**Description**: Composant spécialisé pour les éléments connectés, avec interactions hover/clic synchronisées avec le canvas.

**Fonctionnalités**:

- Hérite de ElementIdItem mais en plus petit
- Lors du hover: Met en évidence l'élément correspondant dans le canvas
- Lors du clic: Sélectionne l'élément correspondant dans le canvas
- Bouton "Déconnecter" pour rompre la liaison avec symbole "lien brisé"
- Feedback visuel clair lors des interactions

**Props**:

```typescript
interface ConnectedElementItemProps {
  element: Element;
  size: "small";
  onSelect?: () => void;
  onHover?: () => void;
  onHoverEnd?: () => void;
  onDisconnect: () => void;
}
```

---

### 6\. Composant SimulationGeneralData - Données Générales de Simulation

**Description**: Composant affichant les informations générales de la simulation et les contrôles de base.
**Fonctionnalités**:

- Affiche le temps écoulé de la simulation
- Bouton "Passer au frame suivant" pour contrôler la simulation pas à pas
- Switches pour activer/désactiver l'affichage des contraintes
- Switches pour activer/désactiver l'affichage des forces de réaction
- Switches pour activer/désactiver l'affichage des moments de réaction
- Switches pour activer/désactiver l'affichage des trajectoires
- Bouton "Clear les trajectoires" pour réinitialiser les trajectoires
  **Props**:

```typescript
interface SimulationGeneralDataProps {
  elapsedTime: number;
  onNextFrame: () => void;
  showConstraints: boolean;
  onShowConstraintsChange: (show: boolean) => void;
  showForces: boolean;
  onShowForcesChange: (show: boolean) => void;
  showMoments: boolean;
  onShowMomentsChange: (show: boolean) => void;
  showTrajectories: boolean;
  onShowTrajectoriesChange: (show: boolean) => void;
  onClearTrajectories: () => void;
}
```

---

### 7\. Composant SimulationGraphs - Graphiques de Simulation

**Description**: Composant pour le suivi d'éléments et l'affichage des graphiques de métriques temporelles.
**Fonctionnalités**:

- Sélection d'éléments à traquer
- Gestion de la liste des éléments traqués
- Configuration des métriques à afficher (position, angle, vitesse, etc.)
- Affichage des graphiques de métrique/temps
- Contrôles d'affichage/masquage des trajectoires pour chaque élément traqué
  **Props**:

```typescript
interface SimulationGraphsProps {
  trackedElements: TrackedElement[];
  onAddTrackedElement: (element: Element) => void;
  onRemoveTrackedElement: (elementId: string) => void;
  onToggleTrajectory: (elementId: string) => void;
  onMetricChange: (elementId: string, metric: MetricType) => void;
}
type MetricType =
  | "position"
  | "angle"
  | "velocity"
  | "angularVelocity"
  | "acceleration";
interface TrackedElement {
  element: Element;
  showTrajectory: boolean;
  metric: MetricType;
}
```

---

### 8\. Composant SimulationDOFAnalysis - Analyse des Degrés de Liberté

**Description**: Composant affichant l'analyse des degrés de liberté (DOF) du mécanisme.
**Fonctionnalités**:

- Affichage du nombre de DOF par partie du mécanisme
- Indication de l'état de contrainte (parfaitement contraint, sur-contraint, sous-contraint)
- Liste des bloquages avec hover pour animation de déformation
- Liste des degrés de liberté avec hover pour animation de mouvement
- Liste des parties indépendantes du mécanisme
  **Props**:

```typescript
interface SimulationDOFAnalysisProps {
  mechanismParts: MechanismPart[];
  onHoverDOC: (constraint: DegreeOfConstraint) => void;
  onHoverDOF: (dof: DOF) => void;
  onHoverEnd: () => void;
}
interface MechanismPart {
  dof_number: number;
  constraints: DegreeOfConstraint[];
  freedoms: DegreeOfFreedom[];
}
interface DegreeOfConstraint {
  type: string;
  element: Element;
}
interface DegreeOfFreedom {
  type: string;
  element: Element;
}
```

---

## Implémentation Technique

### État Gestion

- Le panneau utilise `canvasState` pour déterminer le contenu à afficher
- Il utilise `mechanism` pour accéder aux éléments et leurs propriétés
- Pour la simulation, il utilise `simulationState`
- Les modifications sont propagées à travers les callbacks
- Les interactions hover sur les ConnectedElementItem utilisent les mécanismes de hoveredPart du canvas et les clics utilisent canvasState

### Données à Passer en Props

```typescript
interface PropertiesPanelProps {
  setCanvasState: (state: CanvasState) => void;
  canvasState: CanvasState;
  setMechanism: (mechanism: Mechanism) => void;
  mechanism: Mechanism;
  setHoveredPart: (hoveredPart: HoveredPart) => void;
  hoveredPart: HoveredPart;
  setSimulationState: (state: SimulationState) => void;
  simulationState: SimulationState;
  setSimulationConfig: (config: SimulationConfig) => void;
  simulationConfig: SimulationConfig;
}
```

### Structure des Fichiers

```
src/components/properties-panel/
├── PropertiesPanel.tsx                      // Composant principal
├── ProjectInfoSection.tsx                   // Vue générale
├── element-properties/                      // Propriétés par type d'élément
│   ├── ElementPropertiesSection.tsx         // Composant générique
│   ├── NodeProperties.tsx
│   ├── EdgeProperties.tsx
├── components/                              // Composants réutilisables
│   ├── VectorInput.tsx                      // Champ de position X/Y
│   ├── LockableNumberInput.tsx              // Champ numérique avec verrouillage
│   ├── GroundSwitch.tsx                     // Switch avec icône de terre
│   ├── ElementItem.tsx                      // Élément avec icône, nom et ID
│   ├── ConnectedElementItem.tsx             // Élément connecté avec interactions canvas
│   └── ConnectedElementItem.css
├── simulation-components/                   // Composants de simulation
│   ├── SimulationSection.tsx                // Panneau de simulation principal
│   ├── SimulationGeneralData.tsx            // Données générales de simulation
│   ├── SimulationGraphs.tsx                 // Graphiques de simulation
│   └── SimulationDOFAnalysis.tsx            // Analyse des degrés de liberté
```

---

## Conclusion

Ce panneau de propriétés est conçu pour être **intuitif et puissant**, offrant à l'utilisateur toutes les informations nécessaires dans le contexte approprié. Il s'adapte dynamiquement aux états du canvas et fournit des détails spécifiques pour chaque type d'élément, ce qui améliore l'expérience utilisateur et réduit la charge cognitive.
