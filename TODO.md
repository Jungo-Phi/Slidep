# TODO List - Slidep

> Légende : `~tâche~` = terminée

---

## ✅ Terminées

### Édition & Canvas

- ~Bug Delete~
- ~Bug ChangingGearSize~
- ~add MovingBeltBody canvasState~
- ~Bouton : tendre courroie~
- ~Compléter les nouvelles actions de "TightenBelt"~
- ~if movingBelt : No hover on gear with connection to belt~
- ~Connecter les engrenages ensemble~
- ~Gear ratios pour engrenages~
- ~Compléter les connect-actions pour les engrenages et courroies~
- ~hover Belt~
- ~Belt placement direction of last gear is not reliable~
- ~Placer Ground sur des Edges et intersection d'edges~
- ~Créer des éléments de dimension~
- ~Créer des éléments de contrainte~
- ~Raccourcis qui fonctionnent même si le canvas est pas focus~
- ~Boutons Crtl+Z~
- ~Avec un click sans mouvement -> sélectionné, puis si mouvement, passer de sélectionné -> movingX~
- ~Supprimer contraintes quand on supprime élément~
- ~Qu'est-ce qui se passe si on appuie sur Crtl+Z alors qu'on a pas laché un élément ? mouseUp~
- ~Differentiate between drag and drop : ajouter un élément tampon à mouse release "Blank"~
- ~MoveEdgeBody : deltaStart -> t~
- ~ActionReducer : remove elements managed by "UpdatePositionsToValidState"~
- ~Sélection multiple doit ignorer les contraintes et dimensions~
- ~Toujours enlever le blank (Ajouter à la fin de lastAction**s**)~
- ~Rester dans dimension après en avoir placé une~
- ~Appliquer "UpdateToValidState" apres contrainte H/V~
- ~Enlever temps de chargement des icons contraintes dans le canvas~
- ~Afficher en "Selected" l'élément premier de "startPlacingX"~
- ~Régler le bordel de "connect-actions"~
- ~Connecter les "fixedGears"~
- ~Changer le mouseIcon quand PlacingConstraint (cross?)~
- ~Delete (eraser) ne fonctionne pas avec les contraintes~
- ~Refaire icon joint~
- ~group deletion should hilight constraints of hovered elements~
- ~Hover delete dans le controle panel applique le meme style que eraser~
- ~Hilight corresponding elements when hovering constraint~
- ~Change NumberInput instant update to -> delayed update~
- ~Change Focus on Undo~
- ~Unified Property pannel look with dimensions~
- ~Hover dimension~
- ~hover : ignorer contraintes when placing mechanical elements or movingEdge~
- ~Min Gear radius placing~
- ~slider angle placing~
- ~empecher de placer une belt sur un gear déjà connecté~
- ~Dimension Radius~
- ~Compléter le geometric-solver~
- ~bug : ctrl+Z déplacement contraintes~
- ~"applyHorizontalConstraint()" avec une extrémité ancrée ne fonctionne pas~
- ~Dimension sur des nodes ne marche pas~
- ~Mettre le counterID dans Mechanism~
- ~Compléter la contrainte d'angle~

### UX & UI

- ~Faire les nouveaux icons~
- ~Ajouter les sens de rotation des engrenages dans les connections~
- ~Ajouter les ratios des engrenages dans les connections~
- ~Faire les menus de fichiers, paramètres, langues et infos~
- ~Change CanvasState on delete element~
- ~Plus beau logo~
- ~Visuel des pivot/slider/slidep connecté = remplit~
- ~Arrondir le chiffre affiché des dimmensions~
- ~Reskin de conection container~
- ~Rendre les connections drag & drop plus propres~
- ~Hover Delete button / Element name~
- ~Hover en couleur ?~
- ~Limiter la longueur des edges au placement et déplacement~
- ~Déplacer les dimentions avec les élements associés~
- ~Draw Slideps rotating beams over slider~
- ~Pastille de sauvegarde : 🟢 Vert / ⟳ Spinner / 🔴 Rouge — _spinner et vert faits, rouge à tester_~

---

## 🚧 En cours / Partiellement fait

### Architecture & Modes

- Séparer `AppMode` (édition/statique/cinématique/dynamique) de `CanvasState` — _types créés, propagation en cours_
- Implémenter `RuntimeState` (remplace `SimulationState`) — _types créés, à brancher_

### Top Bar

- Sauvegarder / Charger mécanisme — _IndexedDB ok, fichier .slidep ok, import .dxf non_

### Panneau latéral

- Analyse DDL basique : indicateur global — _partiellement fait dans ProjectInfoSection_
- Onglets au panneau de propriétés — _structure prête, à implémenter_

---

## 📋 Édition — Fonctionnelles

### Éléments & Connexions

- Connect belt ends
- Placer join à la jonction des Beams
- Connecter une courroie à un engrenage avec une extrémité (en plus de la longueur)
- Change edge length ne fonctionne pas + devrais changer la contrainte associées s'il y en a une
- Ajouter "Angle" dans les edges
- Placing beam series / only one if hold down when placing (like in OnShape)
- "Undo" connection (Join) ne s'est pas appliqué en bidirectionnel !
- (Ajouter InputBox lors du placement des beams ?)
- (Ignorer BeamBodyHover lors du déplacement d'un beam ?)
- (Supprimer les joints quand ils ne sont connectés qu'à 1 élément ?)

### Contraintes & Solver géométrique

- Ajouter "repelDistance" pour éloigner les contraintes détachées : move apart disconnected elements
- geometric-solver : distanceConstraint est en conflit avec AtEdgeRatio vraisemblablement
- geometric solver - radius constraint
- Interdire les angles de 0° 180° et -180°
- Empecher les contraintes sur le même élément (DDL analyser)

### Interactions Canvas

- Click dans Dimension quand state==placingStartDimension -> Editing
- Dimension edge to node bug
- Belt hover (gear section) is not reliable
- shift+click on single element doesnt work
- Hover interdire les éléments directement connectés et l'élément lui-meme pour dimentions
- Click dans le vide quand state==placingConstraint -> state=Selecting
- hilight element on hover "disconnect" on element panel

### Données & Persistance

- Reset CanvasState quand on change de mécanisme
- Movement et zoom de la grille
- Afficher / cacher les contraintes
- Créer un système d'unités (zoom de base : 1px = 1mm)
- Ajouter un bouton "Recentrer la vue"

---

## 📋 Simulation — Solvers & Modes

### Phase 1 (MVP)

- Implémenter algorithme de cinématique (reprendre geometric-solver)
- Implémenter algorithme de dynamique PBD (temps, gravité, inertie, chocs)
- Interface Top Bar avec contrôles temporels complets (timeline, speed, play/pause)
- Panneau latéral : onglet **Analyse**

### Phase 2

- Implémenter algorithme de statique (matrices, ΣF=0)
- Solver Statique algébrique (résolution d'inconnues)
- Onglet "Analyse" avancé (détail des sous-systèmes)
- Overlays visuels riches (vecteurs, cartes de contraintes)

---

## 📋 Top Bar — Spécifié dans Architecture.md

### Zone 2 : Cockpit de Simulation

- Sélecteur de Mode : boutons segmentés [Édition] [Statique] [Cinématique] [Dynamique]
- Timeline : curseur horizontal pour naviguer manuellement dans le temps
- Réglages de simulation : toggles Gravité, Collisions

### Zone 3 : Outils, Navigation & Historique

- Menu "Paramètres" (⚙️) avec sous-menus complets :
  - Vue : aimanter à la grille, afficher la grille, afficher les contraintes géométriques
  - Thème : Clair / Sombre / Auto
  - Style des éléments : fil de fer, plein, couleurs
  - Préférences : unités par défaut, précision du solver, raccourcis clavier
- Bouton "Info" (i) : modale crédits + liens contribution

### Logo

- Hover : transformation en mécanisme animé minimaliste (engrenages, bielles) pendant 2-3s
- Clic : ouverture plateforme communautaire

---

## 📋 Panneau latéral — Spécifié dans Architecture.md

### Onglet "Élément" — Sections manquantes

- Section "Géométrie & Connexions" : afficher vitesse actuelle en mode simulation
- Section "Propriétés Physiques" : champs Couple, Frottement (en plus de Masse, Raideur)
- Section "Visualisation" (Overlays Légers) : toggles Forces, Vitesses sur le canvas
- Section "Mesures & Graphiques" (Balises) :
  - Bouton "+ Ajouter une mesure"
  - Sélecteur de métrique : Force, Vitesse, Position, Angle
  - Création d'une Balise visible sur le canvas + chips actifs
  - Suppression individuelle des mesures, disparition de la balise si dernière supprimée

### Onglet "Analyse" (onglet 4, entièrement non implémenté)

- Infos générales : énergie totale du système, bilan des forces externes
- Contrôles globaux des overlays : afficher/cacher tous les overlays d'un type
  - Types : Forces de Réaction, Vitesses, Contraintes (poutres colorées), Path
- Degrés de Liberté (DDL) :
  - Indicateur global (ex: "DDL = 0 : Isostatique")
  - Décomposition par sous-systèmes indépendants
  - Liste textuelle des libertés/blocages avec interaction (survol = surlignage canvas)
- Gestion des Balises (Mesures Temporelles) :
  - Afficher/cacher toutes les balises
  - Liste des balises actives
  - Configuration par balise : métrique, toggle graphique, toggle sonde visuelle
  - Zone de graphiques : courbes superposées ou séparées (Valeur vs Temps), export CSV, export image
  - Nomenclature : distinguer "Contrainte" (MPa / Matériau) des contraintes géométriques

---

## 📋 Palette de Simulation — Spécifié dans Architecture.md

- Outils Simulation : Force, Moment, Moteur, Balise
- Comportement intelligent en simulation :
  - Outils Simulation restent actifs pendant la simulation (ajustement temps réel sans pause)
  - Autres outils : clic → pause auto + bascule temporaire en contexte Édition

---

## 📋 Interactions Avancées — Spécifié dans Architecture.md

### Transitions

- Retour au mode Édition : les pièces reprennent la position qu'elles avaient avant la simulation
- Modification topologie en simulation : pause auto + bascule temporaire Édition
- Modification paramètres en simulation : Hot-Reload sans pause (même en cours de simulation)
- Feedback visuel Hot-Reload : champ clignote brièvement (bordure verte) pour confirmer la prise en compte par le solver

### Erreurs et Conflits

- Instabilité physique (solver PBD diverge / explosion) : pause auto + snackbar d'erreur
- Conflit cinématique (deux moteurs incompatibles) : surlignage rouge des éléments conflictuels, panneau contextuel bascule sur onglet Analyse avec message explicatif

---

## 📋 Import / Export

- Importer : fichiers .dxf, etc.
- Exporter une animation : générer .gif, .mp4 de la simulation (options durée, FPS, zoom)

---

## 🎨 UX Secondaires & Visuelles

- Changer les textes avec les langues
- Mettre les infos du projet (métadonnées complètes)
- Faire le panneau des paramètres (dialog existant mais vide)
- bug : les infos du projet doivent se mettre à jour au chargement d'un nouveau méchanisme
- Enlever le système de drag and drop des connections pour passer à des boutons de transfer aux endroits spécifiques
- La sélection multiple d'éléments du même type permet de modifier leurs paramètres simultanément
- Renommer les éléments (inline editing du nom)
- Éloigner les contraintes des éléments pour la lisibilité
- Changer l'apparence des extrémités de spring et damper comme pour beam
- Ajouter un tag editor (property pannel + gallery)
- Adapter le thumbnail generator pour cropper sur le mécanisme
- Remove flicked on "Lancer la simulation" button hover
- Enlever scroll de la barre d'outils
- Passer les previews dans la bibliothèque en AVIF lossless
- hover des inputs dans le property pannel
- Les dimension ne se déplaces pas lors des déplacements de groupe
- interdire les charactères et symbole spéciaux (et signe - selon l'input) dans number input

---

_Document réorganisé le 2026-06-18_
