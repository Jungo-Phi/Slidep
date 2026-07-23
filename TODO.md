# A faire - Slidep

---

### À faire rapidement

- Afficher une snack-bar "Les forces ne sont pas prisent en compte en cinématique" là première fois qu'on ouvre un mécanisme avec un/des loads, par mécanisme.
- Donner aux ressorts la même "élasticité" en cinématique.
- On confond toujours les boutons "reset" et "retour au départ", et de changement de vitesse de simulation. En déplacer vers la timeline ?

**Hover et connections**

- Pas de sonde sur les courroies
- Hover de suppression du pivot devrait le faire pour les gears connectés + suppression en chaine
- Afficher le edge hovered au placement de force sur une référence avec snap
- snap des forces : les edges prennent la priorité sur la grille
- Pourquoi les contraintes réapparaissent au hover ?
- Faire le tri dans le tableau de hover sur ce qui doit être ignoré ou rejeté

**Canvas**

- Afficher les trajectoires des edges (les 2 extrémités)
- Theme transition : certaines couleurs changent instantanément (grille + autres éléments spéciaux du canvas)
- Les couleurs des selected loads ne sont pas assez différenciée
- Parfois, la couleur de fond des mécanismes de gallerie n'est pas la bonne

**Panneaux et UI**

- Changer couleur (icon + texte) de la contrainte sélectionnée au lieu du bord dans panneau contextuel
- Escape de placingProbe ne fait pas sortir de l'onglet analyse
- ENTER et ESCAPE dans "auteur.ice" ou "nom de projet" devrait quitter la textBox
- Unifier l'usage des tooltips
- Ajouter disableInteractive à tous les tooltip
- OnCanvasValueEditor trop large avec des points
- Afficher vitesse au lieu de ground en haut du moteur
- Utiliser le "bouton dropDown pour changer le repère d'une force" pour choisir l'ancrage d'un moteur
- Ajouter boutons pour changer le parentBeam des slider et slideps
- Le bouton dropDown pour changer le repère d'une force ne click pas sur toute la largeur de ElementDisplay
- Courroie fermée : refléter "déconnecter = ouvrir" (icône ou affichage de la Jonction) — le bouton Tendue/Libre du panneau n'a plus de sens
- Visuel belt hovered sur gearTooth confusant
- Scroll dans NumberInput
- Scroll-bar plus discrète

**Simulation**

- Simuler un moteur non grounded (parentBeamID)
- default damper length moves on simulation start
- Ajuster les hitbox du "Stepper de vitesse de simulation"
- La simulation se met parfois en pause pour on ne sait quoi

**Analyse**

- Analise des degrés de libertés en sous-parties

### À faire plus tard

**Architecture et refactor**

- Supprimer des fonctions simples de load-utils
- Supprimer les duplications de code entre du placement d'éléments le canvas state reducer et draw-canvas
- Créer un CanvasState "PlacingElement", elementType (fusion de 15 états)
- unifier la méthode de catégories de canvasState dans get-hover et placing-element-actions
- Créer uns catégories de CanvasState pour rendre le code plus lisible et maintenable
- Unifier les "excluded_elements" et les conditions au début de "get_hover"
- Fusionner les actions : placement/mouvement + connexions
- enlever les undefined de "SelectedElement"
- Refactor en enlevant le actionBundleType ?
- Reste 2 usages de la sentinelle "----" : gears fantômes du preview (draw-canvas) et `parentAxleID` détaché (action-reducer, connect-actions). Même piège que la fermeture : invisible au typage
- Fuzzer : pas de seed fixe, donc un échec ne se rejoue pas. Ajouter un FUZZ_SEED (fast-check l'affiche déjà dans le rapport)

**Engrenages**

- ChangeGearRadius ne met pas sa position sur le hover
- placer un gear sur un slidep reste en slidep
- Afficher le ratio avec une autre gear dans les connections de l'élément

**Charges**

- Placer force on gearTooth
- Force ref : ajouter gear et belt en plus des edges
- Fusionner "force" et "distributed-force" dans le panneau d'éléments
- Snap force et distributed force aux perpendiculaires lors du placement

**Contraintes et dimensions**

- Hover et Click dans sur les dimension pour les éditer quand state==placingStartDimension
- Hover interdire les éléments directement connectés et l'élément lui-meme pour dimensions
- Empecher les contraintes sur le même élément (DDL analyser)
- le hover delete de contrainte prend le meme style que le ghost de ctrl+y de supression
- Finir les traits de DimensionAngle
- Polish de dimensionAngle: arrondir les angles de 0° / 180°, traits extérieurs pour les petits angles
- Éloigner les contraintes des éléments pour la lisibilité (à préciser)
- Améliorer la contrainte d'angle (transformée en longueurs) pour les edges parallèles
- Afficher les contraintes non respectées avec des messages (Attention / Brisée) au lieu de e=3.72
- Afficher les contraintes non respectées en couleur sur le canvas
- Remplacement d'une contrainte/dimension par une autre

**Placement et remplacement d'éléments**

- Transférer les propriétées de mesures au remplacement d'un node
- Remplacemend d'un edge par un autre
- Placing Edges/Force avec hold down
- Placing beam series / only one if hold down when placing (like in OnShape)
- Placer join à la jonction des Beams
- Enlever le système de drag and drop, passer à des boutons de transfer aux endroits spécifiques

**Canvas, hover et snap**

- Alt pour désactiver le snapping ?
- update le hover quand on change de state ?
- Ajouter la probe au hover de l'élément ?
- hover des inputs dans le property pannel -> hilight canvas
- Option d'afficher la trajectoire avec des points
- Afficher les couches de trajectoires (plus foncé ?)
- Zoom sans scale les éléments eux-même ?
- Mirror Y le canvas ?
- Bouton "Recentrer" calcul à partir des positions des éléments
- Preview des éléments déconnectés au hover de déconnexion (après le chantier courroie : réutiliser le mécanisme d'état visé porté par le canvasState et retiré du tracé de preview)
- Preview de la courroie explusée d'un gear ?

**Sélection**

- Click sur un élément dans une sélection multiple doit le séléctionner
- Penser le panneau de : plusieurs éléments sélectionnés
- Sélection multiple d'éléments du même type -> modifier paramètres simultanément (IU adaptée + actions multiples)
- Clicker sur l'onglet "éléments" quand un élément est sélectionné le désélectionne et passe à l'affichage en liste
- Ajouter le copié-collé

**Panneaux et UI**

- Choisir quels éléments sont : disabled={simulating}
- Filtre du numberInput à vérifier + accepter (-) selon le type de valeur
- Permettre des calculs dans numberInput
- Ajouter un title="xxx" à tous les trailing controls
- S'assurer qu'aucun élément du panneau de propriétés n'aie le focus (pas de "space = switch")
- Ajouter des "Blank" quand on change une valeur depuis les propriétés
- Bouton "Play" sur moteur en simu ?
- Ajouter les éléments interactifs (vitesse moteur, etc.) dans la liste d'éléments mécaniques
- Ajouter "Angle" dans les edges
- Afficher des "stand in" pendant que les icons chargent
- Faire le panneau de paramètre propre
- Unifier les tailles des éléments UI

**Historique (ctrl+z / ctrl+y)**

- le "ghost" de contrainte en rouge pour un ctrl+z devrait être barré
- Le ctrl+z de la création de dimensions à revoir

**Simulation**

- se déplacer dans le temps de la simu avec les flèches
- En simulation, en attrapant un point sur gearTooth et en le tirant vers l'intérieur, la roue tourne de façon incontrôlable
- En simulation, attraper un élément alors qu'on moteur tourne fait que la simulation n'avance que si on bouge la souris.
- Revenir au dernier mode de simulation avec SPACE (sauvegarde)

**Probes et graphiques**

- Afficher / Cacher les probes
- hover et sélection des probes (= élément lié)
- export CSV / image des graphiques
- changer le curseur sur les graphiques
- pin graphique ?
- zoom graphique (horizontal = dans le temps)

**Analyse**

- Pas de moteur + sur-contraint, on affiche quoi ?
- Panneau d'analyse : Liste textuelle des libertés/blocages avec interaction (survol = surlignage canvas)

**Solveur géométrique**

- geometric-solver : Maintenir les longueurs des beams si possible. Maintenir l'orientation ce celui modifié si possible. Ignorer des grounds si nécessaire.

### [ Simulation dynamique ]

**Physique**

- Collisions
- Frottements dans les pivots et sliders
- Moteurs de couple

**Visualisation**

- Afficher les vitesses
- Afficher les forces
- Afficher les contraintes (à partir des déformations ?)

**Feedback et cas d'erreur**

- Hot-Reload : champ clignote brièvement (bordure verte) pour confirmer la prise en compte par le solver
- Instabilité physique (solver PBD diverge / explosion) : pause auto + snackbar d'erreur
- Conflit cinématique (deux moteurs incompatibles) : surlignage rouge des éléments conflictuels, panneau contextuel bascule sur onglet Analyse avec message explicatif

### À faire quand tout le reste est fait

**Robustesse et erreurs**

- Une erreur de sauvegarde -> pop-up "voulez-vous supprimer ce mécanisme ?"
- Erreur/Crash -> message d'erreur + proposer de créer un nouveau mécanisme ?

**Code**

- Refactor App.tsx (make shorter)
- Code review

**Contraintes et dimensions**

- Changer la contrainte same length gears -> ratio 1:1 en une vraie contrainte same lengths
- Contrainte de distance entre edges parallèles (qui fait aussi contrainte de parallélisme ?)
- Contrainte de symétrie ?
- Contrainte de milieu/centre ?
- Dimension verticale/horizontale (choisie au placement) ?
- Dimension sur edges/gears/loads au placement ?
- Traits de construction ?
- Système de variables et/ou de calculs pour les dimensions ?
- Ajouter "repelDistance" pour éloigner les contraintes détachées : move apart disconnected elements

**Visuel des éléments**

- Afficher les positions (vecteurs) et longueurs des ressorts et amortisseurs en simulation (disabled)
- Mettre l'icon sélectionné en bord blanc au lieu de full blanc ?
- Changer l'apparence des extrémités de spring et damper comme pour beam
- afficher ground avec les 4 directions cardinales
- afficher le sens de rotation du moteur sur une des 4 directions cardinales (seulement au hover ?)
- Prefered force direction : afficher les forces en 2 modes (toe to head / head to toe)
- Option de colorer les éléments
- Style des éléments : fil de fer, plein, couleurs
- Ajouter engrenage couronne pour train épicycloïdal

**Interactions et UI**

- Comment rendre visible les ctrl+y/z invisibles ? Ou on s'en fout ?
- Afficher "shown_name d'un élément au hover de celui-ci ?
- Ajouter InputBox lors du placement des beams ? (définir sa longueur)
- Uniformiser MIN gearRadius/edgeLength, placement, pas déplacement ?
- S'assurer que la police est toujours la même
- Changer les textes avec les langues

**Paramètres et unités**

- Créer un système d'unités (zoom de base : 1px = 1mm) à mettre dans les paramètres

**Responsive**

- responsive : element palette
- responsive : mobile mode

**Gallerie et projet**

- Ajouter un tag editor (property pannel + gallerie)
- Suggestion de tags "Statique", "Cinématique", "Dynamique"
- Afficher le nombre de pièces comme un tag
- Rendre les previews de la gallerie interactives
- Afficher des méchanismes exemple dans la gallerie
- Dupliquer le mécanisme

**Export et divers**

- Exporter une animation : générer .gif, .mp4 de la simulation (options durée, FPS, zoom)
- Logo animé

### [ Simulation STATIQUE ]

- Implémenter algorithme de statique (matrices, ΣF=0)
- Solver Statique algébrique (résolution d'inconnues)
- Modification topologie en simulation : pause auto + bascule temporaire Édition
