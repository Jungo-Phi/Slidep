# UX Design Specification slidep

**Author:** Arnaud  
**Date:** 2026-01-10T13:38:37.164Z (Updated: 2026-01-13)

---

## 1\. Résumé exécutif & Vision

### Vision du projet

Slidep est une application web qui démocratise la conception mécanique en fusionnant le croquis intuitif avec la simulation dynamique en temps réel.

### Utilisateurs cibles

- **Ingénieurs mécaniques** : Prototypes rapides sans la lourdeur des outils CAO.
- **Étudiants** : Apprentissage intuitif des principes physiques.
- **Créatifs** : Exploration d'idées innovantes et partage communautaire.

### Défis & Opportunités

- **Interface intuitive** : Création sans expertise technique avancée.
- **Feedback immédiat** : Visualisation instantanée des contraintes (inspiration Polybridge).
- **Accessibilité** : MVP en 2D puis transition vers une version 3D dans un second temps.

---

## 2\. Expérience Utilisateur (UX) Core

### Définition de l'expérience

L'utilisateur dessine librement, et l'application révèle instantanément les contraintes physiques. C'est une transition "seamless" entre le dessin et la simulation.

### Principes d'expérience & Émotions

- **Magie accessible** : Transformer des gestes naturels en mécanismes vivants.
- **Confiance par transparence** : Feedback visuel immédiat (60 FPS) pour éliminer le doute.
- **Itération sans friction** : Modifier et voir l'impact instantanément.
- **Sécurité créative** : Sauvegarde automatique et exploration sans risque d'échec.

### Moments de succès critiques

- **\< 2 minutes** : Voir son premier dessin s'animer.
- **Compréhension intuitive** : Sentir les contraintes sans calculs manuels.

---

## 3\. Analyse & Inspiration

### Benchmarking

- **Onshape** : Pour le dessin 2D avec contraintes et la transition 2D→3D.
- **Blender** : Pour la manipulation directe sans historique complexe.
- **Polybridge** : Pour la visualisation ludique des forces et contraintes.
- **Figma** : Pour les outils contextuels et la collaboration fluide.

### Anti-Patterns à Éviter

- Arbres de construction complexes (CAO traditionnel).
- Délais entre l'action et le feedback physique.
- Installation lourde ou interfaces non-responsives.

---

## 4\. Mécaniques d'Interaction Détaillées

### Création & Placement

- **Aperçu Fantôme (Ghost Preview)** : Visualisation de l'élément avant validation.
- **Edges (Beam, Spring, etc.)** : Placement en 2 points avec connexion automatique aux Nodes.
- **Nodes (Pivot, Slider, etc.)** : Placement par clic, fusion intelligente (ex: Slider + Pivot = Slidep).
- **Fusion & Jointure** : Superposition automatique pour créer des fixations rigides.

### Manipulation & Feedback

- **Édition directe** : Drag-and-drop des Nodes ; modification longueur/angle des Edges.
- **Propriétés physiques** : Accès rapide (masse, raideur, amortissement).
- **Simulation continue** : Pas de mode séparé ; la physique réagit en temps réel aux changements.

---

## 5\. Système de Design & Identité Visuelle

### Fondation Technique

- **Base** : MUI (Material-UI) pour la rapidité et l'accessibilité (WCAG AA).
- **Direction** : "Moderne Web" (Direction 5) - Propre, responsive, focus sur le canvas.

### Palette Chromatique Sémantique

- **Canvas** : Crème doux #ffedc6 pour un environnement chaleureux.
- **Accent** : Bleu ciel #b7e2ff avec bordure Bleu nuit #001d59.
- **Nodes** : Orange doux #ffbe80 avec bordure Orange brûlé #db5000.
- **Feedback** : Rouge #f44336 pour les erreurs et actions destructives.

### Typographie & Grille

- **Police** : Roboto (MUI).
- **Espacement** : Base 8px.
- **Layout** : Canvas central dominant, panneaux latéraux contextuels.

---

## 6\. Spécifications de Rendu des Éléments (Canvas)

Le rendu visuel dans le canvas doit être cohérent avec l'identité visuelle définie (Section 5) et s'inspirer directement des icônes de la palette pour une reconnaissance immédiate.

### Charte Graphique de Rendu

- **Contours (Strokes)** : `#001D59` (Bleu Marine), épaisseur standard `2px`.
- **Remplissage (Fills)** : `#B7E2FF` (Bleu Ciel) pour les corps, `#FFEDC6` (Crème) pour les détails.
- **Points de Connexion (Nodes/Pivots)** : `#FFBE80` (Orange) avec contour `#001D59`.
- **Style de ligne** : Terminaisons arrondies (`round`), jointures arrondies.

### Détails par Élément

| Élément                  | Description du Rendu                           | Dimensions & Style                                                     |
| ------------------------ | ---------------------------------------------- | ---------------------------------------------------------------------- |
| **Beam (Poutre)**        | Rectangle aux extrémités arrondies.            | **Largeur : 8px**. Contour #001D59 (2px), Remplissage #B7E2FF.         |
| **Spring (Ressort)**     | Ligne en zigzag dynamique (min 5 spires).      | **Amplitude : 12px**. Trait #001D59 (2px).                             |
| **Damper (Amortisseur)** | Symbole de piston (cylindre en "U" et tige).   | **Largeur cylindre : 16px**. Contour #001D59, Remplissage #B7E2FF.     |
| **Mass (Masse)**         | Carré ou rectangle avec coins arrondis (rx=2). | **Min : 24x24px**. Contour #001D59, Remplissage #B7E2FF.               |
| **Pivot / Join**         | Double cercle concentrique.                    | **Diamètre : 12px**. Contour #001D59, Remplissage #FFBE80.             |
| **Slider (Glissière)**   | Rectangle creux avec une fente centrale.       | **Hauteur : 12px**. Contour #001D59, Remplissage #FFBE80.              |
| **Slidep**               | Pivot superposé sur un Slider.                 | **Mixte**. Pivot centré sur la fente du Slider.                        |
| **Ground (Ancrage)**     | Ligne horizontale avec hachures à 45°.         | **Épaisseur ligne : 4px**. Trait #001D59.                              |
| **Gear (Engrenage)**     | Cercle avec dents simplifiées et moyeu.        | **Dents : 4px**. Contour #001D59, Remplissage #B7E2FF, Centre #FFEDC6. |
| **Belt (Courroie)**      | Lignes tangentes reliant deux poulies.         | **Épaisseur : 2px**. Trait #001D59.                                    |

### Ordre de Rendu (Z-Index)

Pour garantir la lisibilité des mécanismes, l'ordre de superposition suivant est appliqué (du plus bas au plus haut) :

1.  **Background** : Grille du canvas.
2.  **Structure** : Beams (Poutres).
3.  **Connecteurs** : Springs, Dampers, Belts.
4.  **Corps** : Masses, Gears.
5.  **Contraintes** : Pivots, Sliders, Slideps, Grounds.
6.  **UI Overlay** : Indicateurs de sélection, labels de propriétés.

### États d'Interaction

#### Critique de la proposition initiale

- **Hover** : La lueur (glow) peut être floue sur des éléments fins comme les ressorts (Springs). L'opacité à 50% risque de manquer de contraste sur le fond crème.
- **Sélection** : L'augmentation de l'épaisseur du contour (2px -> 3px) est trop subtile pour une application de précision.
- **Supprimer** : L'état "Supprimer" n'est pas un état persistant mais une action. Changer les couleurs de l'élément avant suppression (hover sur bouton delete) est une bonne idée, mais l'élément lui-même ne devrait pas avoir un état "supprimé" visuel permanent.

#### Alternative proposée (Focus sur la clarté et la précision)

| État            | Effet Visuel                                                                                                                                                                                            |
| :-------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Hover**       | **Épaississement** : Le contour (stroke) de l'élément passe de `2px` à `3px`. Le curseur devient `grab` (corps) ou `crosshair` (extrémités).                                                            |
| **Sélection**   | **Halo** : L'élément gagne un halo bleu clair (#B7E2FF) de `6px` (opacité 70%).                                                                                                                         |
| **Suppression** | **Feedback d'intention** : Lors du survol de l'icône "Poubelle" ou via raccourci, l'élément ciblé prend un contour Rouge (#F44336) de `3px` et une opacité de `0.6` pour simuler sa disparition future. |

#### Comportement des éléments de type Edge (Beam, Spring, Damper, etc.)

- **Hover sur le corps** : Épaississement global du contour (2px -> 3px). Indique que le clic-glisser déplacera l'ensemble de l'élément (translation). Le curseur devient `grab`.
- **Hover sur une extrémité (Node)** : Le Node gagne un contour de `3px` et une légère augmentation de diamètre (+2px). Indique que le clic-glisser modifiera la géométrie (longueur ou angle) en déplaçant uniquement ce point d'ancrage. Le curseur devient `crosshair`.
- **Sélection** : Le halo bleu (#B7E2FF, 6px, 70%) englobe toute la structure (corps + nodes). Si un node est partagé entre plusieurs éléments, le halo s'étend à tous les éléments connectés pour confirmer visuellement la solidarité mécanique du nœud.

## 7\. Composants du Système

- **Canvas Mécanique** : Zone centrale HTML5/WebGL pour le dessin.
- **Palette d'Éléments** : Panel latéral pour le choix des composants (drag-to-canvas).
- **Panneau de Propriétés** : Édition contextuelle des paramètres physiques.
- **Contrôles de Simulation** : Toolbar (Play/Pause, Vitesse) avec indicateurs d'état.
- **Gallery Communautaire** : Exploration, fork et partage de designs.

---

## 7\. Responsive & Accessibilité (A11y)

### Stratégie Multi-dispositifs

- **Desktop** : Layout multi-colonnes, raccourcis clavier complets.
- **Mobile/Tablette** : Layout stacké, cibles tactiles (min 44px), gestes (pinch zoom).
- **Performance** : Fonctionnement offline pour les calculs locaux.

### Standards d'Accessibilité

- **Navigation** : Full clavier, focus visible (2px), skip links.
- **Contenu** : Contraste >4.5:1, labels ARIA, descriptions textuelles des éléments.
- **Validation** : Tests automatisés (Lighthouse, axe-core) et manuels (Screen readers).

---

## 8\. Parcours Utilisateurs (Flows)

1.  **Onboarding** : Accueil → Canvas vide → Inspiration via la Gallery → Premier dessin.
2.  **Cycle Créatif** : Dessin → Simulation auto → Ajustement des propriétés → Optimisation.
3.  **Partage** : Finalisation → Publication communautaire → Remix/Fork par d'autres.
