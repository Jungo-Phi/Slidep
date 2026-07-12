# TODO List - Slidep

---

### À faire rapidement

- Ajouter un fichier config ESLint
- Comportement étrange dans vectorInput à régler

- Analise des degrés de libertés en sous-parties

- Highlight de la flèche sur le canvas (tu t'en charges)
- Afficher les valeurs des forces sur le canvas

- Déconnecter un join de courroie fermée doit l'ouvrir.
- Créer une validation : une courroie ne peut être tendue que si ses 2 extrémitées sont connectées et qu'il y a au moins 2 gears
- Créer une validation : une extrémité de courroie ne peut pas être à l'intérieur du gear adjascent
- Le rayon à l'intérieur doit être empecher aussi si on déplace gear sur belt
- Placer une courroie sur un engrenage en ayant déjà une doit briser la connection
- Fusionner les connections start/end dans belt quand tendue
- Preview quand placingBeltEnd ou on joit les 2 bouts
- Placer une courroie en la fermant devrait bouger le join et pas la courroie (position du nouveau join = nearest_on_belt)
- Placer moment on gearTooth
- Hover on closed belt est inconcistant

- C'est quoi le vite.config.ts Manifest ?
- De temps en temps, le snap to grid ne marche pas
- Placer un engrenage sur un moteur laisse le moteur
- Placer beltEnd après beltStart sur gear fait pas le attached

- Contraintes (et angle) aussi avec les forces

### À faire plus tard

- unifier la méthode de catégories de canvasState dans get-hover et placing-element-actions

- Changer les noms "MoveForceVector" et "MoveDistributedForceVector"
- enlever les undefined de "SelectedElement"
- Ajouter la probe au hover de l'élément ?
- Fusionner "force" et "distributed-force" dans le panneau d'éléments
- Alt pour désactiver le snapping ?
- Option d'afficher la trajectoire avec des points
- le hover delete de contrainte prend le meme style que le ghost de ctrl+y de supression
- Clicker sur l'onglet éléments quand un élément est sélectionné le désélectionne
- Unifier les "excluded_elements" et les conditions au début de "get_hover"
- ground sur gearTooth ?
- S'assurer qu'aucun élément du panneau de propriétés n'aie le focus (pas de "space = switch")
- Transférer les propriétées de mesures au remplacement d'un node
- Remplacemend d'un edge par un autre
- Visuel belt sur gearTooth confusant
- Visuel beltEnd sur gearTooth, enroulement à penser
- Ajouter une validation pour les positions des beltEnds par rapport aux gears
- Ajouter une validation pour que les beltEnds sur des gears aillent toujours de pair avec un "AttachedGearsIDs"
- Click sur un élément dans une sélection multiple doit le séléctionner
- MovingBeltBody doit hilight la belt
- Afficher des "stand in" pendant que les icons chargent
- Créer uns catégories de CanvasState pour rendre le code plus lisible et maintenable
- ChangeGearRadius ne met pas sa position sur le hover
- update le hover quand on change de state ?
- Fusionner les actions : mouvement + connections
- se déplacer dans le temps de la simu avec les flèches & afficher autre chose que 30s quand vide
- le "ghost" de contrainte en rouge pour un ctrl+z devrait être barré
- hover des inputs dans le property pannel -> hilight canvas
- geometric-solver : Maintenir les longueurs des beams si possible. Maintenir l'orientation ce celui modifié si possible. Ignorer des grounds si nécessaire.
- En simulation, en attrapant un point sur gearTooth et en le tirant vers l'intérieur, la roue tourne de façon incontrôlable
- En simulation, attraper un élément alors qu'on moteur tourne fait que la simulation n'avance que si on bouge la souris.
- Zoom sans scale les éléments eux-même ?
- Mirror Y le canvas ?
- N'afficher QUE les éléments connectés dans connectionProperties ?
- responsive : top bar, element palette
- Snap force et distributed force aux perpendiculaires lors du placement
- Revenir au dernier mode de simulation avec SPACE (sauvegarde)
- Afficher / Cacher les probes
- hover et sélection des probes (= élément lié)
- export CSV / image des graphiques
- changer curseur sur ElementDisplay
- changer le curseur sur les graphiques
- pin graphique ?
- zoom graphique (horiznotal = dans le temps)
- Afficher temps total de simu sur la progressbar
- Faire le panneau de paramètre propre
- placer un gear sur un slidep reste en slidep
- Ajouter le choix du parent beam dans le moteur (afficher vitesse au lieu de ground en haut)
- Simulation moteur non grounded (parentBeamID)
- Belt hover (gear section) is not reliable
- Empecher de placer une belt sur un gear avec le même axisID
- Hover et Click dans sur les dimension pour les éditer quand state==placingStartDimension
- Placing Edges/Force avec hold down
- Placing beam series / only one if hold down when placing (like in OnShape)
- Sélection multiple d'éléments du même type -> modifier paramètres simultanément (IU adaptée + actions multiples)
- Finir les traits de DimensionAngle
- Enlever le système de drag and drop, passer à des boutons de transfer aux endroits spécifiques
- Polish de dimensionAngle: arrondir les angles de 0° / 180°, traits extérieurs pour les petits angles
- Hover interdire les éléments directement connectés et l'élément lui-meme pour dimentions
- Empecher les contraintes sur le même élément (DDL analyser)
- Pas de moteur + sur-contraint, on affiche quoi ?
- Panneau d'analyse : Liste textuelle des libertés/blocages avec interaction (survol = surlignage canvas)
- Ajouter des "Blank" quand on change une valeur depuis les propriétés
- Placer join à la jonction des Beams
- Éloigner les contraintes des éléments pour la lisibilité (à préciser)
- Améliorer la contrainte d'angle (transformée en longueurs) pour les edges parallèles
- Adapter le thumbnail generator pour cadrer sur le mécanisme
- Passer les thumbnail dans la bibliothèque en AVIF lossless
- Copié collé
- Rewhole de ElementDisplay pour inclure d'autres éléments, fill, etc.
- Ajouter "Angle" dans les edges
- Afficher la dimension dans le panneau de propriétés d'un edge
- Afficher le ratio avec une autre gear dans les connections de l'élément
- Afficher les contraintes non respectées avec des messages (Attention / Brisée) au lieu de e=3.72
- Afficher les contraintes non respectées en couleur sur le canvas
- Bouton "Recentrer" calcul à partir des positions des éléments

- Refactor en enlevant le actionBundleType ?

### [ Simulation dynamique ]

- Collisions
- Afficher les vitesses
- Afficher les forces
- Afficher les contraintes
- Frottements dans les pivots et sliders
- Moteurs de couple
- Hot-Reload : champ clignote brièvement (bordure verte) pour confirmer la prise en compte par le solver
- Instabilité physique (solver PBD diverge / explosion) : pause auto + snackbar d'erreur
- Conflit cinématique (deux moteurs incompatibles) : surlignage rouge des éléments conflictuels, panneau contextuel bascule sur onglet Analyse avec message explicatif

### À faire quand tout le reste est fait

- Une erreur de sauvegarde -> pop-up "voulez-vous supprimer ce mécanisme ?"
- Erreur/Crash -> message d'erreur + proposer de créer un nouveau mécanisme ?
- Refactor App.tsx (make shorter)
- Code review
- Afficher les positions (vecteurs) et longueurs des ressorts et amortisseurs en simulation (disabled)
- Mettre l'icon sélectionné en bord blanc au lieu de full blanc ?
- Changer l'apparence des extrémités de spring et damper comme pour beam
- Ajouter "repelDistance" pour éloigner les contraintes détachées : move apart disconnected elements
- hilight element on hover "disconnect" on element panel ?
- afficher ground avec les 4 directions cardinales
- changer le style du ground sur le moteur
- Prefered force direction
- afficher les forces en 2 modes (toe to head / head to toe)
- Paramètre "Afficher les cercles" (trajectoires)
- Option de colorer les éléments
- Créer un système d'unités (zoom de base : 1px = 1mm) à mettre dans les paramètres
- taille des forces log autour d'un longueur de base Lb=100 ?
- afficher le sens de rotation du moteur sur une des 4 directions cardinales (seulement au hover ?)
- S'assurer que la police est toujours la même
- Afficher "shown_name d'un élément au hover de celui-ci ?
- Ajouter InputBox lors du placement des beams ? (définir sa longueur)
- Changer les textes avec les langues
- Theme uniformisation
- Ajouter les thèmes clair / sombre
- Style des éléments : fil de fer, plein, couleurs
- responsive : mobile mode
- Tendre la courroie
- Uniformiser MIN gearRadius/edgeLength, placement, pas déplacement ?
- Ajouter un tag editor (property pannel + gallerie)
- Sugesstion de tags "Statique", "Cinématique", "Dynamique"
- Afficher des méchanismes exemple dans la gallerie
- Afficher le nombre de pièces comme un tag
- Logo animé
- Exporter une animation : générer .gif, .mp4 de la simulation (options durée, FPS, zoom)
- Ajouter engrenage couronne pour train épicycloïdal
- Traits de construction ?
- Contrainte de symétrie ?
- Est-ce que les forces doivent tourner avec les éléments ?

### [ Simulation STATIQUE ]

- Implémenter algorithme de statique (matrices, ΣF=0)
- Solver Statique algébrique (résolution d'inconnues)
- Modification topologie en simulation : pause auto + bascule temporaire Édition
