# A faire - Slidep

---

### À faire rapidement

**User Test**

- Drag & Drop de ElementPalette sur le canvas
- Hover en PlacingXXX ne doit pas afficher l'élément
- BUG SIMU avec le mécanisme "Poutre sur joint de courroie"
- BUG SIMU avec le mécanisme "Ressorts sur moteur"
- changer le label "Simulation" dans ElementPalette
- Clicker sur l'icon de ElementPalette sélectionné devrait le désélectionner
- Fermer la courroie en clickant sur le gearTooth de départ
- Ce n'est pas toujours clair quand un élément est placé ou en train d'être placé (transparence ?)
- Ce n'est pas toujours clair quand on est en simulation : curseur main
- Le nom par défaut "Nouveau mécanisme" est confusant (dans la top-bar comme dans la gallerie)
- Perdre le focus d'un NumberInput (ou autre input) devrait valider la valeur
- Ajouter un effet ressort sur l'amortisseur en simulation
- Click droit sur le canvas devrait proposer des choses (undo/redo, copy/paste, recentrer, etc.) (et sur un élément ?)
- Remplacer Edge par Edge devient une priorité
- Les mécanismes exemple sont à mettre en priorité
- Trajectoires sur les edges aussi à mettre en priorité
- La sélection multiple ne devrait pas afficher les contraintes

- Changer de frame en déplaçant un load ?
- grille "adaptative"

- BeambodyHover peut se faire à moveEdge sur un noeud inateignable et créer une connexion illégale, pareil pour déplacer un noeud sur un autre hors d'atteinte. Vérifier s'il n'y a pas d'autres cas du genre.

**Snapping**

- Snap _snap relatif et angulaire.md_:
  - Supprimer SNAP_MATCH_RAD pour ne garder que SNAP_TOLERANCE_RAD (et le mettre avec les autres constantes et en deg) OU utiliser "distance à droite" plutot qu'un angle ?
  - SnapToGrid adapté aux radius
  - Hover loads : angle de snap sur edge pas tout à fait aligné

- Taille minimale au placement à adapter à l'échelle, mais pour geometric-solver : La règle de taille minimale doit être traitée comme une contrainte interne au composant, qui ne s'active que lorsque le solveur tente d'écrire une nouvelle valeur pour ce composant.

- Snapping sur les dimensions (au milieu)

- Améliorer l'alignement d'éléments :
  - PROBLÉMATIQUE : En cinématique, quand l'alignement n'est juste pas parfait, le défaut ne s'affiche pas, mais le mécanisme "bouge tout seul".
  - Snap to grid devrait aussi se faire quand on hover déjà quelque chose
  - Connecter plusieurs éléments en même temps s'ils sont alignés ? (beamBodyHover)

**Repenser les "Contraintes non respectées"**

- Afficher uniquement les moteurs ? (OU sur la liste des moteurs déjà affichés ?)
- Afficher les contraintes non respectées en colorant les éléments (rouge ?)
- Distance d'attachement/détachement poulie/courroie doit dépendre de la vitesse relative
- Les changements de vitesse de moteurs en simulation doivent-il être enregistrés ?
- Afficher les changements de directions de moteurs (et autres) dans le panneau latéral en relecture ?
- La flèche du moteur doit changer de sens en simulation relecture
- Passer la simulation en Rust pour accélérer ?

**Panneau mesures**

- Remplacer les switchs d'ovelays par des icons "oeuil"/"oeuil barré"
- "Esc", "CTRL+Y/Z" et hover sur le canvas doit marcher avec le OnCanvasProbeMetricSelector
- À la fermeture du menu ProbeMetricSelector, on voit un petit rectangle sur 1 frame
- Ajouter l'icon "Probe" au dessus des check-box de mesure (et reprendre le même style que celui du canvas)
- Pas de sonde sur les courroies
- Mettre l'icon Probe dans la section Mesures
- Choisir x/y/norme pour les mesures superposées
- Possible de hover sur probe quand placingProbe (pareil pour gearRatio et Dimension)

**Trajectoires**

- Afficher les trajectoires des edges (les 2 extrémités)
- Afficher les trajectoires des gears (bords tangeants au mouvement) ?
- Ne PAS afficher les trajectoires des éléments ancrés.
- Option d'afficher la trajectoire avec des points
- Afficher les trajectoires anciennes de plus en plus transparentes

**Canvas**

- Accepter les valeurs négatives pour les loads sur le OnCanvasValueEditor
- Parsing loads : "150000 N" => "150 kN"
- Afficher valeur de masses sur le canvas
- Afficher le point grabbé en simulation
- Theme transition : certaines couleurs changent instantanément (grille + autres éléments spéciaux du canvas)
- Les couleurs des selected loads ne sont pas assez différenciée
- Parfois, la couleur de fond des mécanismes de gallerie n'est pas la bonne
- Changer une dimension fait apparaitre les autres contraintes, c'est bizzare
- Ajouter un délais (2s) avant d'afficher "mécanisme(s) exporté(s)"
- Afficher une snack-bar "Les forces ne sont pas prisent en compte en cinématique" là première fois qu'on ouvre un mécanisme avec un/des loads, par mécanisme. Ou pour les mesures de forces.
- MovingBeltBody sur un gear ne se fait pas avec le bon sens de rotation **quand les 2 sens sont possibles**
- Sélectionner une contrainte fait un shadow sur les probes
- Afficher hover-circle au hover du numberInput ?
- Hover une probe devrait hover l'élément aussi
- Mettre à jour le hover selon la vraie taille des éléments
- Changer le sens des moteurs en cliquant sur la flèche
- Ne pas afficher les LOADS en cinématique
- Sélectionner les dimensions (sur la flèche) ?
- Régler les TODOs de draw

- Afficher le point de contact pour placingGearRadius sur belt
- Wrap VS windings ?

**Panneaux et UI**

- On confond toujours les boutons "reset" et "retour au départ" (et un peu de changement de vitesse de simulation). En déplacer vers la timeline ?
- Est-ce que le contrôle de vitesse de simulation ne devrait-il pas être éditable en édition ?
- Comment faire comprendre que la gravité n'est pas prise en compte en cinématique ?
- Changer couleur (icon + texte) de la contrainte sélectionnée au lieu du bord dans panneau contextuel
- Unifier l'usage des tooltips
- OnCanvasValueEditor trop large avec des points
- Afficher vitesse au lieu de ground en haut du moteur
- Le sens de rotation gear/belt indiqué dans le panneau latéral est inversé
- Utiliser le "bouton dropDown pour changer le repère d'une force" pour choisir l'ancrage d'un moteur
- Ajouter boutons pour changer le parentBeam des slider et slideps
- Le bouton dropDown pour changer le repère d'une force ne click pas sur toute la largeur de ElementDisplay
- Courroie fermée : refléter "déconnecter = ouvrir" (icône ou affichage de la Jonction) — le bouton Tendue/Libre du panneau n'a plus de sens
- Afficher le ratio avec une autre gear dans les connections de l'élément
- Éditer la longueur de repos d'un ressort (pas forcément égale à celle affichée en édition)
- Scroll dans NumberInput
- Click droit sur le canvas / esc en simulation devrait faire retourner au panneau d'analyse (comme en édition dans le panneau de propriétés)

**Simulation**

- DimensionBelt ne met pas à jour la dimension de belt _open_
- Simuler un moteur non grounded (parentBeamID)
- default damper length moves on simulation start
- La simulation se met parfois en pause pour on ne sait quoi
- Donner a tous les ressorts en cinématique la même "élasticité".

**Analyse**

- Analise des degrés de libertés en sous-parties

### À faire plus tard

**Architecture et refactor**

- Ne pas ajouter une action à l'historique si elle ne change rien (ex: newValue = oldValue)
- Supprimer des fonctions simples de load-utils
- Expliciter _ScreenPoint_ et _WorldPoint_ partout
- Supprimer les duplications de code entre du placement d'éléments le canvas state reducer et draw-canvas
- Créer un CanvasState "PlacingElement", elementType (fusion de 15 états)
- unifier la méthode de catégories de canvasState dans get-hover et placing-element-actions
- Créer uns catégories de CanvasState pour rendre le code plus lisible et maintenable
- Unifier les "excluded_elements" et les conditions au début de "get_hover"
- Fusionner les actions : placement/mouvement + connexions
- enlever les undefined de "SelectedElement"
- Refactor en enlevant le actionBundleType ?
- Système d'undo/redo pas toujours fiable
- Ajouter des "Blank" quand on change une valeur depuis les propriétés
- Reste 2 usages de la sentinelle "----" : gears fantômes du preview (draw-canvas) et `parentAxleID` détaché (action-reducer, connect-actions). Même piège que la fermeture : invisible au typage
- Fuzzer : pas de seed fixe, donc un échec ne se rejoue pas. Ajouter un FUZZ_SEED (fast-check l'affiche déjà dans le rapport)

**Charges**

- Placer force on gearTooth
- Force ref : ajouter gear et belt en plus des edges

**Contraintes et dimensions**

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

- Faire le tri dans le tableau de hover sur ce qui doit être ignoré ou rejeté
- Remplacemend d'un edge par un autre
- Transférer les propriétées de mesures et overlays au remplacement d'un node
- Placements en 2 étapes (Edges, Loads, etc.) avec hold down
- Placing beam series / only one if hold down when placing (like in OnShape)
- Placer join à la jonction des Beams
- Enlever le système de drag and drop, passer à des boutons de transfer aux endroits spécifiques

**Canvas, hover et snap**

- Bouton "Recentrer" calcul à partir des positions des éléments
- Preview des éléments déconnectés au hover de déconnexion (après le chantier courroie : réutiliser le mécanisme d'état visé porté par le canvasState et retiré du tracé de preview)
- Preview de la courroie explusée d'un gear ?

**Sélection**

- Penser le panneau : plusieurs éléments sélectionnés (même/différent type)
- Sélection multiple d'éléments du même type -> modifier paramètres simultanément (IU adaptée + actions multiples)
- Clicker sur l'onglet "éléments" quand un élément est sélectionné le désélectionne et passe à l'affichage en liste
- Ajouter le copié-collé
- Symétrie / Rotation / Scale d'éléments multiples.

**Panneaux et UI**

- Changer le nom de l'onglet en "Mon mécanisme - Slidep"
- Choisir quels éléments sont : disabled={simulating}
- Filtre du numberInput à vérifier + accepter (-) selon le type de valeur
- Permettre des calculs dans numberInput
- Ajouter un title="xxx" à tous les trailing controls
- S'assurer qu'aucun élément du panneau de propriétés n'aie le focus (pas de "space = switch")
- Bouton "Play" sur moteur en simu ?
- Ajouter les éléments interactifs (vitesse moteur, etc.) dans la liste d'éléments mécaniques
- Ajouter "Angle" dans les edges
- Afficher des "stand in" pendant que les icons chargent
- Faire le panneau de paramètre propre
- Unifier les tailles des éléments UI
- Ajouter bouton(s) loupe pour zoomer

**Propriétés du mécanisme, tags et imports**

- Import de mécanismes en drag & drop depuis l'explorateur de fichiers
  - Édition du nom du mécanisme dans la gallerie
  - Afficher la description du mécanisme dans la gallerie en lecture seule sur 2 ou 3 lignes (... si trop long)
  - Créer l'éditeur de tags, le même dans la gallerie que dans le panneau de propriétés
  - Suggestion de tags "Statique", "Cinématique", "Dynamique"
  - Afficher le nombre de pièces comme un tag
  - Exporter le mécanisme depuis le panneau de propriétés ?

**Historique (ctrl+z / ctrl+y)**

- le "ghost" de contrainte en rouge pour un ctrl+z devrait être barré
- Le ctrl+z de la création de dimensions à revoir

**Simulation**

- se déplacer dans le temps de la simu avec les flèches du clavier
- En simulation, un grab fait que la simulation n'avance que si on bouge la souris.

**Probes et graphiques**

- Afficher / Cacher les probes
- export CSV / image des graphiques
- changer le curseur sur les graphiques
- pin graphique en grand ?
- Mesures d'accélération, jerk ?
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
- Ajouter ressort de couple.
- Ajouter des commentaires dans le canvas.
- Motorisation de sliders (verins)

**Visualisation**

- Afficher les vitesses
- Afficher les forces de réaction
- Afficher les contraintes (à partir des déformations ?)
- Afficher puissance et énergie

**Feedback et cas d'erreur**

- Hot-Reload : champ clignote brièvement (bordure verte) pour confirmer la prise en compte par le solver
- Instabilité physique (solver PBD diverge / explosion) : pause auto + snackbar d'erreur
- Conflit cinématique (deux moteurs incompatibles) : surlignage rouge des éléments conflictuels, panneau contextuel bascule sur onglet Analyse avec message explicatif

### À faire quand tout le reste est fait

**Code**

- Refactor App.tsx (make shorter)
- Refactor Mechanism.tsx (make shorter)
- Code review

**Contraintes et dimensions**

- Changer la contrainte same length gears -> ratio 1:1 en une vraie contrainte same lengths
- Contrainte de distance entre edges parallèles (qui fait aussi contrainte de parallélisme ?)
- Ajouter contrainte de tangeance (gear + edge) ?
- Contrainte de symétrie ?
- Contrainte de milieu/centre ?
- Dimension verticale/horizontale (choisie au placement) ?
- Dimension verticale/horizontale sur les courroies ?
- Dimension sur edges/gears/loads au placement ?
- Traits de construction ?
- Ajouter un cliquet anti-retour sur gear ?
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
- Ajouter engrenage couronne (extérieur) pour train épicycloïdal
- Dessin gear stylisé

**Interactions et UI**

- Comment rendre visible les ctrl+y/z invisibles ? Ou on s'en fout ?
- Afficher "shown_name d'un élément au hover de celui-ci ?
- Ajouter InputBox lors du placement des beams ? (définir sa longueur)
- Uniformiser MIN gearRadius/edgeLength, placement, pas déplacement ?
- S'assurer que la police est toujours la même
- Changer les textes avec les langues
- Test utilisateur : "ESCAPE" doit-il faire revenir en édition en 1/2 clicks ?

**Paramètres et unités**

- Créer un système d'unités (zoom de base : 1px = 1mm) à mettre dans les paramètres

**Responsive**

- responsive : element palette
- responsive : mobile mode

**Gallerie et projet**

- Rendre les previews de la gallerie interactives
- Afficher des méchanismes exemple dans la gallerie
- Ajouter bouton "Dupliquer le mécanisme"

**Export et divers**

- Boucler le replay (et choisir le temps de rebouclage)
- Exporter une animation : générer .gif, .mp4 de la simulation (options durée, FPS, zoom)
- Logo animé
- Animer un mécanisme qui arrive sur l'écran après 10 min d'inactivité

### [ Simulation STATIQUE ]

- Implémenter algorithme de statique (matrices, ΣF=0)
- Solver Statique algébrique (résolution d'inconnues)
- Modification topologie en simulation : pause auto + bascule temporaire Édition
