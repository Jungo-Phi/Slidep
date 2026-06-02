# TODO List - Slidep

## Features fonctionnelles importantes

- Bug Delete
- ~Bug ChangingGearSize~
- ~add MovingBeltBody canvasState~
- ~Bouton : tendre courroie~
- ~Compléter les nouvelles actions de "TightenBelt"~
- Hover : beltHover state + beams intersection
- if movingBelt : ~No hover on gear with connection to belt~ + hover start
- ~Connecter les engrenages ensemble~
- ~Gear ratios pour engrenages~
- ~Compléter les connect-actions pour les engrenages et courroies~
- ~hover Belt~
- Belt hover (gear section) is not reliable
- ~Belt placement direction of last gear is not reliable~
- ~Placer Ground sur des Edges et intersection d'edges~
- Placer join à la jonction des Beams
- ~Créer des éléments de dimension~
- ~Créer des éléments de contrainte~
- ~Raccourcis qui fonctionnent même si le canvas est pas focus~
- ~Boutons Crtl+Z~
- ~Avec un click sans mouvement -> sélectionné, puis si mouvement, passer de sélectionné -> movingX~
- Supprimer contraintes quand on supprime élément
- Qu'est-ce qui se passe si on appuie sur Crtl+Z alors qu'on a pas laché un élément ?
- ~TODO : Differentiate between drag and drop : ajouter un élément tampon à mouse release "Blank"~
- MoveEdgeBody : deltaStart -> t
- ~ActionReducer : remove elements managed by "UpdatePositionsToValidState"~
- ~Sélection multiple doit ignorer les contraintes et dimensions~
- ~Toujours enlever le blank (Ajouter à la fin de lastAction**s**)~
- Ajouter "repelDistance" pour éloigner les contraintes détachées : move apart disconnected elements
- ~Rester dans dimension après en avoir placé une~
- ~Appliquer "UpdateToValidState" apres contrainte H/V~
- ~Enlever temps de chargement des icons contraintes dans le canvas~
- ~Afficher en "Selected" l'élément premier de "startPlacingX"~
- Régler de bordel de "connect-actions"
- Connecter les "fixedGears"
- (Click dans le vide quand state==placingConstraint -> state=Selecting ?)
- Click dans Dimension quand state==placingStartDimension -> Editing
- Changer le mouseIcon quand PlacingConstraint (cross?)
- (Ajouter InputBox lors du placement des beams ?)
- Placing beam series / only one if hold down when placing (like in OnShape)
- "Undo" connection (Join) ne s'est pas appliqué en bidirectionnel !
- ~Delete (eraser) ne fonctionne pas avec les contraintes~
- ~Refaire icon joint~
- Dimension edge to node bug
- ~group deletion should hilight constraints of hovered elements~
- ~Hover delete dans le controle panel applique le meme style que eraser~
- geometric-solver : distanceConstraint est en conflit avec AtEdgeRatio vraisemblablement
- ~Hilight corresponding elements when hovering constraint~
- ~Change NumberInput instant update to -> delayed update~
- ~Change Focus on Undo~
- ~Unified Property pannel look with dimensions~
- Change edge length ne fonctionne pas + devrais changer la contrainte associées s'il y en a une
- ~Hover dimension~
- Connecter une courroie à un engrenage avec une extrémité (en plus de la longueur)
- hover des inputs dans le property pannel
- hover : ignorer contraintes when placing mechanical elements or movingEdge
- ~Min Gear radius placing~
- ~slider angle placing~
- empecher de placer une belt sur un gear déjà connecté
- ~Dimension Radius~
- ~Compléter le geometric-solver~
- geometric solver - radius constraint
- "applyHorizontalConstraint()" avec une extrémité ancrée ne fonctionne pas
- hilight element on hover "disconnect" on element panel
- Empecher les contraintes sur le même élément (DDL analyser)
- Sauvgarder / Charger méchanisme
- Movement et zoom de la grille
- Afficher / cacher les contraintes
- Implémenter algorithme de cinématique (reprendre geometric-solver)
- Implémenter algorithme de statique (matrices)
- Implémenter algorithme de dynamique PBD

## Features UX secondaires

- ~Faire les nouveaux icons~
- ~Ajouter les sens de rotation des engrenages dans les connections~
- ~Ajouter les ratios des engrenages dans les connections~
- (Ignorer BeamBodyHover lors du déplacement d'un beam ?)
- Faire que drop une connection dans un container simple échange les connections
- (Supprimer les joints quand ils ne sont connectés qu'à 1 élément ?)
- ~Change CanvasState on delete element~

## Features visuelles nice to have

- ~Plus beau logo~
- ~Visuel des pivot/slider/slidep connecté = remplit~
- ~Arrondir le chiffre affiché des dimmensions~
- ~Reskin de conection container~
- ~Rendre les connections drag & drop plus propres~
- ~Hover Delete button / Element name~
- Hover en couleur ?
- Limiter la longueur des edges au placement et déplacement
- Rejeter la position des dimensions des éléments pour la lisibilité
- Déplacer les dimentions avec les élements associés
