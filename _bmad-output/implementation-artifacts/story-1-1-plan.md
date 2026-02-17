# Story 1.1: Créer des éléments mécaniques de base

## Contexte

**Epic:** Fondation de Conception Mécanique  
**Story ID:** 1.1  
**Priorité:** Critique (première story de l'epic)  
**Dépendances:** Aucune (prérequis pour les autres stories)

## Objectif

Permettre aux utilisateurs de créer des éléments mécaniques de base (noeud, poutre, curseur, pivot, etc.) sur un canvas interactif.

## Acceptance Criteria

### AC1: Placement d'un élément simple

**Given** un canvas vide dans l'application  
**When** je sélectionne un élément dans la palette et je clique sur le canvas  
**Then** l'élément apparaît à la position cliquée  
**And** l'élément est sélectionnable et modifiable

### AC2: Coexistence de plusieurs éléments

**Given** un élément placé sur le canvas  
**When** je sélectionne un autre type d'élément et je le place  
**Then** les deux éléments coexistent sur le canvas  
**And** je peux les connecter entre eux

## Analyse Technique

### Éléments mécaniques à supporter

1. **Node (Noeud)** - Point de connexion simple
2. **Beam (Poutre)** - Élément linéaire avec deux extrémités
3. **Slider (Curseur)** - Élément avec mouvement linéaire contraint
4. **Pivot (Pivot)** - Point de rotation
5. **Slidep** - Élément spécifique du domaine
6. **Join (Jointure)** - Connexion entre éléments
7. **Ground (Sol)** - Référence fixe
8. **Pulley (Poulie)** - Élément rotatif
9. **Rope (Corde)** - Élément flexible
10. **Gear (Engrenage)** - Élément rotatif avec transmission
11. **Belt (Courroie)** - Transmission par courroie
12. **Spring (Ressort)** - Élément élastique
13. **Damper (Amortisseur)** - Élément d'amortissement

### Architecture Requise

#### 1. Types et Interfaces

- `Element` - Interface de base pour tous les éléments
- `ElementType` - Enum des types d'éléments
- `ElementProperties` - Propriétés communes (position, rotation, etc.)
- `ElementState` - État de l'élément (sélectionné, etc.)

#### 2. Store Zustand (mechanisms.ts)

- `addElement(type: ElementType, position: Vector2)` - Ajouter un élément
- `selectElement(id: string)` - Sélectionner un élément
- `deselectElement()` - Désélectionner
- `getSelectedElement()` - Récupérer l'élément sélectionné
- `elements` - Liste des éléments du mécanisme actuel

#### 3. Composants React

**ElementPalette.tsx**

- Affiche la liste des types d'éléments disponibles
- Permet la sélection d'un type
- Gère l'état "mode création"

**MechanicalCanvas.tsx**

- Affiche le canvas (HTML5 Canvas ou SVG)
- Gère les événements de clic pour placer les éléments
- Affiche les éléments avec leur représentation visuelle
- Gère la sélection visuelle (surbrillance)

**ElementRenderer**

- Composant pour rendre chaque type d'élément
- Styles visuels distincts par type
- Indicateurs visuels pour la sélection

#### 4. Logique de Placement

- Déterminer les coordonnées du clic sur le canvas
- Créer un nouvel élément avec ID unique
- Ajouter au store
- Mettre à jour le rendu

### Considérations de Design

#### Représentation Visuelle

- Chaque type d'élément a une icône/forme distinctive
- Couleurs cohérentes avec le thème MUI
- Taille adaptée à la lisibilité
- Indicateur visuel clair pour la sélection

#### Interaction Utilisateur

- Palette d'éléments accessible (panneau flottant)
- Feedback immédiat lors du placement
- Curseur change lors de la sélection d'un type
- Confirmation visuelle du placement

#### Performance

- Rendu efficace avec Canvas ou SVG
- Pas de re-rendu inutile
- Gestion optimale des événements

### Dépendances Existantes

- ✅ MUI pour le design
- ✅ Zustand pour l'état
- ✅ React pour les composants
- ✅ TypeScript pour la typage

### Fichiers à Créer/Modifier

#### À Créer

1. `src/types/element.ts` - Types et interfaces pour les éléments
2. `src/components/element-renderer/ElementRenderer.tsx` - Rendu des éléments
3. `src/utils/element-factory.ts` - Factory pour créer les éléments

#### À Modifier

1. `src/stores/mechanisms.ts` - Ajouter les actions pour les éléments
2. `src/components/element-palette/ElementPalette.tsx` - Implémenter la palette
3. `src/components/mechanical-canvas/MechanicalCanvas.tsx` - Implémenter le canvas
4. `src/types/mechanism.ts` - Ajouter les types d'éléments

## Critères d'Acceptation Détaillés

### Fonctionnalité

- [ ] Tous les 13 types d'éléments peuvent être créés
- [ ] Les éléments apparaissent à la position cliquée
- [ ] Les éléments sont sélectionnables
- [ ] Plusieurs éléments peuvent coexister
- [ ] Les éléments ont des IDs uniques

### Interface Utilisateur

- [ ] Palette d'éléments visible et accessible
- [ ] Feedback visuel lors de la sélection d'un type
- [ ] Éléments rendus avec des styles distincts
- [ ] Sélection visuelle claire (surbrillance)
- [ ] Responsive sur desktop

### Code Quality

- [ ] TypeScript strict sans erreurs
- [ ] Composants bien structurés
- [ ] Pas de console errors/warnings
- [ ] Code documenté

### Performance

- [ ] Placement instantané (< 100ms)
- [ ] Pas de lag lors du rendu
- [ ] Gestion mémoire efficace

## Risques et Mitigations

| Risque                               | Probabilité | Impact | Mitigation                             |
| ------------------------------------ | ----------- | ------ | -------------------------------------- |
| Complexité du rendu Canvas           | Moyenne     | Moyen  | Utiliser SVG si Canvas trop complexe   |
| Gestion des coordonnées              | Moyenne     | Moyen  | Tests unitaires pour conversion coords |
| Performance avec beaucoup d'éléments | Basse       | Moyen  | Optimisation Canvas/SVG                |

## Prochaines Étapes

1. Implémenter les types et interfaces
2. Implémenter le store Zustand
3. Implémenter la palette d'éléments
4. Implémenter le canvas et le rendu
5. Tests et validation

## Notes

- Cette story est critique car elle pose les fondations pour toutes les autres
- La qualité du code ici affectera la maintenabilité future
- Les décisions architecturales (Canvas vs SVG) doivent être bien pensées
