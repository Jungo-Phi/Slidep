# Résumé de la structure du code source (src/)

> Ce document a pour but de servir de carte de repérage rapide dans le code du projet Slidep.  
> Il est structuré pour qu'on puisse, en quelques secondes, identifier quel fichier gère quelle responsabilité.  
> Il est complémentaire au document produit **« Slidep Architecture.md »** qui décrit la vision, les 4 modes/solvers, le workflow UX et la roadmap.

---

## Vision rapide (extraite de « Slidep Architecture.md »)

Slidep est une application web de conception mécanique (SPA) qui démocratise la simulation physique en fusionnant le croquis intuitif et l'analyse technique en temps réel.

**Philosophie :** « Dessiner, c'est déjà simuler ». L'outil privilégie l'intuition, le ressenti physique immédiat et l'itération rapide plutôt que la précision d'outils professionnels type CAO ou FEM.

**Architecture technique :** 4 modes opérationnels, chacun avec un solver dédié :

| Mode | Solver | Objectif | Comportement clé |
| :--- | :--- | :--- | :--- |
| **Édition** | **Géométrique** | Construction de la topologie | Dessin rigide, contraintes de position strictes, pas de physique |
| **Cinématique** | **Cinématique** | Analyse du mouvement pur | Pas de temps ni forces, trajectoires, vitesses, rapports de transmission |
| **Dynamique** | **PBD** | Simulation physique réelle | Temps, gravité, inertie, chocs, forces/couples en entrée |
| **Statique** | **Algébrique** | Calcul d'équilibre | Géométrie figée, $\sum F=0$, réactions aux appuis, efforts internes |

*Actuellement, l'implémentation couvre principalement le mode Édition avec le solver géométrique PBD. Les modes Cinématique, Dynamique et Statique sont en partie spécifiés dans l'UI mais pas encore pleinement implémentés (voir roadmap en fin de « Slidep Architecture.md »).*

---

---

## Vue d'ensemble

Slidep est une application **React + TypeScript + Vite** pour la conception et la simulation de mécanismes.  
Elle repose sur trois piliers :

1. **Un moteur de rendu Canvas 2D personnalisé** (pas de SVG ni WebGL).
2. **Un solveur géométrique interne** basé sur la *Position-Based Dynamics (PBD)*.
3. **Une interface Material-UI (MUI)** avec des panneaux flottants.

---

## Arborescence logique

```
src/
├── App.tsx                     ← Point d'entrée de l'application (état global, layout)
├── main.tsx                    ← Montage React
├── index.css                   ← Styles globaux
├── vite-env.d.ts               ← Types Vite
│
├── types/                      ← Toutes les définitions TypeScript
│   ├── index.ts                ← Barrel export
│   ├── element.ts              ← Hiérarchie des éléments mécaniques (nœuds, liens, contraintes)
│   ├── actions.ts              ← Actions undo/redo (discriminated union)
│   ├── canvas-state.ts         ← Machine à états d'interaction (~40 états)
│   ├── hovered-part.ts         ← Ce qui est survolé sous la souris
│   ├── mechanism.ts            ← Mécanisme, viewport, IndexedDB
│   ├── point2.ts               ← Classe Point2 (vecteur 2D, ~30 méthodes)
│   ├── serialized.ts           ← Types pour la sérialisation JSON
│   ├── simulation.ts           ← État et configuration de la simulation
│   └── kinematic-solver-links.ts ← Types pour le graphe du solveur
│
├── components/
│   ├── mechanical-canvas/      ← Moteur Canvas (cœur interactif)
│   │   ├── MechanicalCanvas.tsx  ← Composant Canvas principal (events, RAF loop)
│   │   ├── canvas-state-reducer.ts ← Machine à états réduite (~1500 lignes)
│   │   ├── draw-canvas.ts      ← Orchestration du rendu (z-order, sélection, hover)
│   │   ├── drawing-functions.ts← Fonctions de dessin primitives (grille, pivot, ressort, cote...)
│   │   ├── get-hover.ts        ← Hit detection (nœuds, liens, engrenages, courroies)
│   │   ├── connect-actions.ts  ← Logique de fusion/connexion entre éléments
│   │   ├── ConstraintEditor.tsx← Éditeur flottant de valeurs de contraintes
│   │   ├── viewport.ts         ← Conversion screen ↔ world
│   │   ├── utils.ts            ← Helpers canvas (nœud sur poutre, etc.)
│   │   └── index.ts            ← Barrel export
│   │
│   ├── mechanism/              ← Système d'actions et historique
│   │   ├── action-reducer.ts   ← Reducer pur des Actions sur un Mechanism
│   │   └── apply-actions.ts    ← Bundling d'actions + intégration du solveur
│   │
│   ├── solver/                 ← Solveur géométrique PBD
│   │   ├── geometric-solver.ts ← Orchestration du solveur (graphe, ancres, PBD)
│   │   ├── parsing.ts          ← Construction du graphe depuis les éléments
│   │   ├── PBD_kinematic_solver.ts ← Boucle PBD (300 itérations max)
│   │   ├── constraint-functions.ts ← Fonctions de projection par type de contrainte
│   │   └── utils.ts            ← DOF, tri des liens par BFS
│   │
│   ├── element-palette/        ← Palette d'outils à gauche
│   │   ├── ElementPalette.tsx  ← Palette flottante (édition / simulation)
│   │   ├── elementIcon.ts      ← Mapping type → icône SVG
│   │   └── index.ts
│   │
│   ├── properties-panel/       ← Panneau de propriétés à droite
│   │   ├── PropertiesPanel.tsx ← Panneau principal (simulation / élément / contraintes / projet)
│   │   ├── ElementProperties.tsx ← Propriétés d'un élément mécanique sélectionné
│   │   ├── ConnectionsProperties.tsx ← Rendu des connexions par type d'élément
│   │   ├── ConstraintsPanel.tsx ← Liste des contraintes
│   │   ├── ProjectInfoSection.tsx ← Métadonnées du projet + DOF
│   │   └── components/         ← Composants réutilisables du panneau
│   │       ├── ElementDisplay.tsx
│   │       ├── ConnectionComponent.tsx
│   │       ├── ConnectionsContainer.tsx
│   │       ├── GroundSwitch.tsx
│   │       ├── BeltTensionSwitch.tsx
│   │       ├── NumberInput.tsx
│   │       ├── RatioInput.tsx
│   │       └── VectorInput.tsx
│   │
│   ├── simulation-controls/    ← Contrôles de simulation
│   │   ├── SimulationControls.tsx ← Boutons play/pause/stop, vitesse, options
│   │   └── index.ts
│   │
│   └── mechanisms-gallery/     ← Galerie de mécanismes sauvegardés
│       └── MechanismsGallery.tsx ← Dialog IndexedDB avec thumbnails
│
├── constants/
│   └── rendering-specs.ts      ← Toutes les constantes visuelles (couleurs, tailles, z-order)
│
├── utils/
│   ├── index.ts                ← Barrel export
│   ├── serialization.ts        ← Sérialisation / désérialisation / clone / fichier .slidep
│   ├── storage.ts              ← Wrapper localStorage
│   ├── thumbnail-generator.ts  ← Génération de miniature JPEG depuis le canvas
│   ├── debounce.ts             ← Utilitaire debounce
│   ├── angle-math.ts           ← Quadrant pour cotation d'angle
│   ├── belt-geom.ts            ← Géométrie des courroies (tangentes, arcs)
│   └── string-math.ts          ← IDs lisibles, noms, ratios, dates
│
├── lib/
│   ├── mui-theme.ts            ← Thème MUI (light/dark/highContrast)
│   └── mui-theme copy.ts       ← Copie / brouillon du thème
│
├── test/
│   └── setup.ts                ← Setup Vitest (mocks localStorage, ResizeObserver, Canvas)
│
└── assets/
    └── icons/palette/          ← ~30 icônes SVG pour les outils et éléments
```

---

## Fichiers clés et leur rôle

> **Référence produit :** Pour la spécification détaillée de l'interface (Top Bar, Palette, Panneau latéral, comportements par mode, gestion des transitions et erreurs), voir **« Slidep Architecture.md »** (section 3 *Workflow UX et Navigation Globale*).  
> Ce qui suit se concentre sur l'implémentation technique dans `src/`.

### `App.tsx` — Cerveau de l'application

C'est le composant racine. Il gère :
- L'état global du mécanisme (`mechanism`) avec historique undo/redo.
- L'état du canvas (`canvasState`) : outil actif, sélection, mode d'interaction.
- L'état de simulation (`simulationState`, `simulationConfig`).
- La barre d'application (logo, menu fichier, undo/redo, langue, statut de sauvegarde).
- La zone canvas principale, les panneaux flottants (palette, propriétés), et le dialog de la galerie.
- La sauvegarde auto dans IndexedDB avec génération de miniature.

**Quand le modifier :** pour tout changement de layout global, d'état top-level, ou d'intégration entre les gros sous-systèmes.

---

### `MechanicalCanvas.tsx` — Fenêtre sur le monde mécanique

Composant React qui encapsule la balise `<canvas>`. Il :
- Expose le ref du canvas via `forwardRef`.
- Lance une boucle `requestAnimationFrame` pour le rendu.
- Écoute tous les événements souris (down, move, up, wheel) et clavier.
- Convertit les coordonnées écran/monde via `viewport.ts`.
- Délègue les transitions d'état à `canvas-state-reducer.ts`.
- Affiche l'overlay `ConstraintEditor` quand l'état est `EditingConstraint`.

**Quand le modifier :** pour ajouter un nouvel événement d'entrée, changer la boucle de rendu, ou ajouter un overlay.

---

### `canvas-state-reducer.ts` — Machine à états d'interaction

Reducer central (~1500 lignes) qui gère les transitions entre ~40 états de `CanvasState`. Il répond aux événements :
- `MouseLeftButtonDown`, `MouseMove`, `MouseButtonUp`, `KeyDown`.

Implémente :
- Sélection simple et multi-sélection (Shift).
- Déplacement de nœuds, d'extrémités de liens, de corps.
- Placement de tous les types d'éléments (poutre, ressort, engrenage, cote...).
- Effacement, dimensionnement, placement de contraintes.
- Raccourcis clavier (Delete, Escape, Enter, Ctrl+Z/Y).

**Quand le modifier :** pour ajouter un nouvel outil, un nouveau mode d'interaction, ou changer le comportement d'un clic/glisser.

---

### `draw-canvas.ts` — Orchestration du rendu

Fonction `drawMechanicalCanvas()` qui :
- Efface le canvas.
- Dessine la grille.
- Itère `DRAWING_ORDER` pour rendre tous les éléments dans le bon ordre z.
- Gère le halo de sélection (bleu), l'épaississement au survol, le fondu de suppression (rouge).
- Dessine les aperçus spécifiques à l'état (poutre en cours de placement, cote, rectangle de sélection).

**Quand le modifier :** pour changer l'ordre de rendu, ajouter un effet visuel global, ou modifier le fond/grille.

---

### `drawing-functions.ts` — Primitives de dessin

Fonctions individuelles pour chaque élément visuel :
- `draw_grid`, `draw_ground`, `draw_pivot`, `draw_slider`, `draw_slidep_bottom/rep`, `draw_join`, `draw_mass`, `draw_beam`, `draw_spring`, `draw_damper`, `draw_gear`, `draw_belt`.
- Cotations : `draw_dimention`, `draw_dimention_to_segment`, `draw_dimention_angle`, `draw_dimension_radius`, `draw_dimention_text`.
- Prévisualisations : `draw_start_edge_end`, `draw_hover_edge_end`, `draw_belt_end`.

**Quand le modifier :** pour changer l'apparence d'un élément, ajouter un nouveau type d'élément, ou modifier le style des cotations.

---

### `get-hover.ts` — Détection de collision

`get_hovered_part()` détermine ce qui est sous la souris pour chaque état. Gère :
- Nœuds, liens (début/fin/corps), dents d'engrenage, sections de courroie (arcs et segments droits), contraintes.
- Respecte l'ordre z inverse pour un picking correct.
- `get_hovered_elements_by_rect()` pour la sélection en rectangle.

**Quand le modifier :** pour ajuster la tolérance de clic, ajouter un nouveau type d'élément à la détection, ou corriger un problème de picking.

---

### `connect-actions.ts` — Logique de fusion

Gère le graphe de connexion entre éléments :
- `get_mechanical_element_from_id`, `get_constraint_element_from_id`.
- `get_connection_types`, `get_connections` : introspection des connexions.
- `disconnect_element`, `connect_element` : génération d'Action.
- `delete_element` : génère toutes les actions pour déconnecter puis supprimer.
- `connect_elements` : **logique de fusion centrale** (nœud sur nœud, nœud sur lien, lien sur lien, engrenage sur engrenage).
- `transfer_*_connections` : propagation des connexions lors d'une fusion.

**Quand le modifier :** pour changer la logique de fusion d'éléments, ajouter un nouveau type de connexion, ou corriger un bug de suppression.

---

### `action-reducer.ts` — Reducer pur des actions

Applique une `Action` (ou un tableau) sur un `Mechanism` de manière pure. Gère :
- `CreateElement`, `DeleteElement`.
- Tous les `ConnectsXxx` (splice dans les tableaux).
- `MoveNode`, `MoveEdgeStart/End/Body`, `MoveElements`.
- `ChangeGearRadius`, `ChangeEdgeLength`, `GroundNode`, `TightenBelt`.
- `SwitchAttachedGearDirection`, `ChangeMass/Stiffness/Damping`.
- `ChangeDimensionXxxValue`, `MoveConstraint`, `UpdateElementName`.
- `UpdatePositionsToValidState` : applique les positions/radii résolus par le solveur.

**Quand le modifier :** pour ajouter un nouveau type d'action, ou changer la façon dont une action modifie le mécanisme.

---

### `apply-actions.ts` — Bundling et intégration du solveur

`apply_actions()` :
- Groupe les actions par `ActionBundleType`.
- Pour les bundles `MoveElement`, `ChangeDimension`, `Connects`, `CreateConstraint` : clone le mécanisme, applique l'action, lance `resolveGeometricConstraints`, et ajoute `UpdatePositionsToValidState`.
- Implémente la **compression d'historique** : mouvements consécutifs du même élément fusionnés ; idem pour masse/raideur/amortissement.

**Quand le modifier :** pour changer quand le solveur est invoqué, ajuster la compression d'historique, ou modifier le bundling.

---

### `geometric-solver.ts` — Orchestration du solveur

`resolveGeometricConstraints()` :
- Construit le graphe de dépendances depuis le mécanisme.
- Ajoute un lien `HandleGrab` pour le point d'interaction utilisateur.
- Fusionne les nœuds coïncidents.
- Adapte `OnSegment` → `AtSegmentRatio` pour les nœuds saisis.
- Ajoute `KeepOrientation` et `Distance` lors du déplacement de corps de poutre.
- Ancre le rayon d'engrenage si approprié.
- Trie les liens par BFS depuis les ancres.
- Lance `PBD_kinematic_solver`.
- Met à jour les positions des contraintes basées sur la géométrie résolue.

**Quand le modifier :** pour ajouter un nouveau type de contrainte au solveur, changer la logique d'ancrage, ou ajuster la préparation du graphe.

---

### `parsing.ts` — Construction du graphe

- `get_nodes()` : extrait positions/radii/masses depuis les éléments mécaniques.
- `get_constraint_nodes()` : extrait les positions des contraintes.
- `constraint_to_link()` : convertit chaque type de contrainte en sa représentation `Link`.
- `get_links()` : construit le graphe complet incluant les connexions mécaniques (coïncidence, on-segment, engrenage).

**Quand le modifier :** pour ajouter un nouveau type d'élément ou de contrainte au solveur.

---

### `PBD_kinematic_solver.ts` — Boucle PBD

- Itère jusqu'à 300 fois (ou jusqu'à ce que l'erreur < epsilon).
- Pour chaque lien, dispatche vers la fonction de contrainte appropriée.
- `HandleGrab` s'arrête après 20 itérations avec une raideur limitée pour éviter le sur-étirement.

**Quand le modifier :** pour ajuster la convergence, changer les critères d'arrêt, ou modifier le comportement du grab.

---

### `constraint-functions.ts` — Fonctions de projection PBD

Chaque fonction modifie les positions/radii pour réduire l'erreur d'une contrainte :
- `applyDistanceConstraint`, `applyDistanceToLineConstraint`, `applyOnSegmentConstraint`, `applyAtSegmentRatioConstraint`, `applyKeepOrientationConstraint`, `applyHorizontalConstraint`, `applyVerticalConstraint`, `applyParallelConstraint`, `applyNormalConstraint`, `applyAngleConstraint`, `applyEqualLengthConstraint`, `applyGearMeshingConstraint`, `applyGearRatioConstraint`, `applyHandleGrabConstraint`.

Toutes respectent le pondération par masse (ancré = immobile).

**Quand le modifier :** pour corriger un bug de résolution, ajouter une nouvelle contrainte, ou ajuster la pondération massique.

---

### `ElementPalette.tsx` — Palette d'outils

Panneau flottant à gauche qui :
- Affiche dynamiquement `EDITION_PALETTE` ou `SIMULATION_PALETTE` selon `canvasState`.
- Groupe les outils par catégorie (Interface, Liaisons, Structure, Dynamique, Contraintes).
- Chaque outil a une icône, un tooltip, un raccourci clavier, et une règle de mise en évidence.
- Calcule la mise en page responsive en colonnes selon la hauteur du viewport.

**Quand le modifier :** pour ajouter un nouvel outil, changer les catégories, ou ajuster les raccourcis.

---

### `PropertiesPanel.tsx` — Panneau de propriétés

Panneau rétractable à droite dont le contenu change selon le contexte :
- `SimulationControls` : quand on est en mode simulation.
- `ElementProperties` : quand un élément mécanique est sélectionné.
- `ConstraintsPanel` : quand une contrainte est sélectionnée.
- `ProjectInfoSection` : par défaut (métadonnées + DOF).

**Quand le modifier :** pour ajouter un nouveau type de contenu au panneau, ou changer la logique d'affichage contextuel.

---

### `ElementProperties.tsx` — Propriétés d'un élément

Affiche pour l'élément sélectionné :
- `ElementDisplay` (icône + nom éditable).
- `GroundSwitch` (si ancrable).
- `BeltTensionSwitch` (si courroie).
- `NumberInput` pour masse / raideur / amortissement.
- `VectorInput` pour la position.
- `NumberInput` pour rayon d'engrenage ou longueur de lien.
- `ConnectionsProperties` pour toutes les connexions.
- Bouton de suppression avec aperçu au survol.

**Quand le modifier :** pour ajouter une nouvelle propriété éditable à un type d'élément.

---

### `SimulationControls.tsx` — Contrôles de simulation

Panneau de contrôle avec :
- Chip de statut (RUNNING / PAUSED / STOPPED).
- Affichage du temps et des FPS.
- Boutons play / pause / stop / reset.
- Slider de vitesse (0.25x – 4x).
- Toggles pour trajectoires, forces, et moments.

*(Actuellement en état local, non encore branché au solveur physique.)*

**Quand le modifier :** pour brancher les contrôles à la simulation réelle, ou ajouter de nouvelles options.

---

### `MechanismsGallery.tsx` — Galerie de mécanismes

Dialog affichant les mécanismes sauvegardés dans IndexedDB :
- Grille de cartes avec miniature, nom, date de modification, nombre d'éléments, tags.
- Carte "Nouveau mécanisme" en haut.
- Clic pour charger, icône de suppression.
- Tri par date de modification décroissante.

**Quand le modifier :** pour ajouter des filtres, changer l'affichage, ou ajouter des métadonnées.

---

### `rendering-specs.ts` — Constantes visuelles

Définit :
- `COLORS` : fond, grille, traits, remplissage, sélection, suppression.
- `STROKE_WIDTHS` et `HIT_TOLERANCE`.
- `INTERACTION_SPECS` : tailles de halo, opacité de suppression, rayons d'interaction.
- `DIM` : dimensions de tous les éléments (largeur de poutre, spires de ressort, cylindre d'amortisseur, rayon d'engrenage...).
- `DIMENSION_SPECS` : tailles de flèches, police de texte.
- `DRAWING_ORDER` : ordre z de superposition des 22 types d'éléments.

**Quand le modifier :** pour changer les couleurs, les tailles, les tolérances de clic, ou l'ordre de rendu.

---

### `serialization.ts` — Sauvegarde / Chargement

- `serialize_mechanism` / `deserialize_mechanism` : conversion entre `Mechanism` (Point2, Map) et `SerializedMechanism` (JSON pur).
- `clone_mechanism` : clone par round-trip de sérialisation.
- `save_to_file` / `load_from_file` : gestion des fichiers `.slidep`.

**Quand le modifier :** pour ajouter un champ à la sauvegarde, ou changer le format de fichier.

---

### `string-math.ts` — Utilitaires textuels

- `legible_id()` : convertit les UUIDs en codes de 3 lettres (ex: "Abc").
- `shown_element_name()` : génère des noms lisibles.
- `value_to_ratio_parts()` : convertit les décimaux en ratios entiers (ex: 0.5 → ["1","2"]).
- `format_date()` : formatage de dates en français.

**Quand le modifier :** pour ajuster le formatage des noms, IDs, ou dates.

---

## Patterns architecturaux clés

1. **Actions Undo/Redo** : Chaque opération utilisateur génère un tableau `Action[]`. Le `mechanism` stocke `history: Action[][]` et `future: Action[][]`. Le `actionReducer` applique les actions de manière idempotente ; `apply_actions` les groupe et compresse.

2. **Intégration solveur** : Pour toute action modifiant la géométrie (déplacement, connexion, changement de cote), `apply_actions` clone le mécanisme, applique l'action, lance `resolveGeometricConstraints`, et ajoute `UpdatePositionsToValidState` pour aligner tout sur une configuration valide.

3. **Machine à états Canvas** : `CanvasState` est une union discriminée très fine (~40 états). `canvas-state-reducer.ts` est la source unique de vérité pour toute la logique d'interaction.

4. **Rendu personnalisé** : Pas de SVG ni WebGL — uniquement l'API Canvas 2D avec fonctions de dessin manuelles, ordre z explicite, et hit-testing personnalisé.

5. **Solveur PBD** : Solveur Position-Based Dynamics maison avec pondération par masse, tri des liens par proximité des ancres, et convergence itérative.

---

*Document généré le 2026-06-18 pour servir de référence rapide lors des modifications futures du code.*
