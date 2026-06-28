# TODO List - Slidep

---

### À faire rapidement

- Fixation de nodes/beams sur les gears perimeter
- Afficher selected quand moving force
- Ajouter des "Blank" avec les forces
- Adapter snap to grid aux états adéquats
- Les contraintes et dimensions ne suivent pas lors des déplacements de groupe d'éléments
- Comportement étrange dans vectorInput à régler
- Déboguer le modificateur "ligne" pour la force répartie
- probe ajoutée 2 par 2 quand il y en a déjà une ???
- Ouverture du sélecteur de métriques (Force, Vitesse, Position, Angle) au placement d'un probe
- Afficher les trajectoires
- Click dans le vide quand state==placingConstraint/placingForce -> state=Selecting
- Sélection multiple doit hilight les contraintes liées aux éléments sélectionnés (comme group deletion)
- hover des inputs dans le property pannel -> hilight canvas
- Ne pas update le nom si on ne l'a pas changé
- Afficher les trajectoires
- Analise des degrés de libertés en sous-parties
- Remplacer un node par un autre doit transféfer le ground
- Refactor en enlevant le actionBundleType ?

### À faire plus tard

- Zoom sans scale les éléments eux-même ?
- Mirror Y le canvas ?
- Contraintes (et angle) aussi avec les forces
- N'afficher QUE les éléments connectés dans connectionProperties ?
- responsive : top bar, element palette
- Snap force et distributed force aux perpendiculaires lors du placement
- Revenir au dernier mode de simulation avec SPACE (sauvegarde)
- Afficher / Cacher les probes
- hover et sélection des probes (= élément lié)
- Gestion des probes (Mesures Temporelles) :
  - Configuration par probe : métrique, toggle graphique
  - Zone de graphiques : courbes superposées ou séparées (Valeur vs Temps), export CSV, export image
  - Nomenclature : distinguer "Contrainte" (MPa / Matériau) des contraintes géométriques
- Faire le panneau de paramètre propre
- placer un gear sur un slidep reste en slidep
- Ajouter le choix du parent beam dans le moteur (afficher vitesse au lieu de ground en haut)
- Simulation moteur non grounded (parentBeamID)
- Belt hover (gear section) is not reliable
- Empecher de placer une belt sur un gear avec le même axisID
- Hover et Click dans sur les dimension pour les éditer quand state==placingStartDimension
- Ignorer BeamBodyHover lors du déplacement d'un beam
- Move element en 2 frames n'est pas fiable
- Placing Edges/Force avec hold down
- Placing beam series / only one if hold down when placing (like in OnShape)
- Sélection multiple d'éléments du même type -> modifier paramètres simultanément (IU adaptée + actions multiples)
- Finir les traits de DimensionAngle
- ChangingGearSize devrait aussi la faire bouger (fake gear + tangeancy constraint)
- Enlever le système de drag and drop, passer à des boutons de transfer aux endroits spécifiques
- Polish de dimensionAngle: arrondir les angles de 0° / 180°, traits extérieurs pour les petits angles
- Hover interdire les éléments directement connectés et l'élément lui-meme pour dimentions
- Empecher les contraintes sur le même élément (DDL analyser)
- geometric-solver : Maintenir les longueurs des beams si possible. Maintenir l'orientation ce celui modifié si possible. Ignorer des grounds si nécessaire.
- Pas de moteur + sur-contraint, on affiche quoi ?
- Panneau d'analyse : Liste textuelle des libertés/blocages avec interaction (survol = surlignage canvas)
- Ajouter des "Blank" quand on change une valeur depuis les propriétés
- Connect belt ends
- Connecter une courroie à un engrenage avec une extrémité (en plus de la longueur)
- Les courroies sont de 2 types :
  - Extrémités connectées : Doivent avoir minimum 2 engrenages connectés, peuvent fairent des tours à l'infinis, UN élément peut être connecté sur le "pseudo-edge" allant du point tangeant de l'engrenage côté start du point tangeant de l'engrenage côté end.
  - Extrémités distinctes : un élément peut être connecté sur chaque "pseudo-edge" allant du point tangeant de l'engrenage adjascent à start/end.
- Dans tous les cas, les courroies impose un ratio aux engrenages connectés
- On ne peut PAS connecter des extrémités de courroies différents ensemble
- Placer join à la jonction des Beams
- Éloigner les contraintes des éléments pour la lisibilité (à préciser)
- Améliorer la contrainte d'angle (transformée en longueurs) pour les edges parallèles
- Panneau d'explications "Statique/Cinématique/Dynamique"
- Adapter le thumbnail generator pour cadrer sur le mécanisme
- Passer les thumbnail dans la bibliothèque en AVIF lossless
- Copié collé
- Rewhole de ElementDisplay pour inclure d'autres éléments, fill, etc.

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

- Code review
- Afficher les positions (vecteurs) et longueurs des ressorts et amortisseurs en simulation (disabled)
- Afficher les erreurs non respectées avec des messages (Attention / Brisée) au lieu de e=3.72
- Mettre l'icon sélectionné en bord blanc au lieu de full blanc ?
- Changer l'apparence des extrémités de spring et damper comme pour beam
- Passage en PWA (progressive web app)
- Ajouter "repelDistance" pour éloigner les contraintes détachées : move apart disconnected elements
- hilight element on hover "disconnect" on element panel ?
- afficher ground avec les 4 directions cardinales
- changer le style du ground sur le moteur
- Prefered force direction
- afficher les forces en 2 modes (toe to head / head to toe)
- Ajouter "Angle" dans les edges
- Afficher la dimension dans le panneau de propriétés d'un edge
- Afficher le ratio avec une autre gear dans les connections de l'élément
- Paremètre "Afficher les cercles" (trajectoires)
- Option de colorer les éléments
- Créer un système d'unités (zoom de base : 1px = 1mm) à mettre dans les paramètres
- taille des forces log autour d'un longueur de base Lb=100 ?
- afficher le sens de rotation du moteur sur une des 4 directions cardinales (seulement au hover ?)
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
