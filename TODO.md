# A faire - Slidep

- 🆕 Nouvelle feature
- 🔨 Feature à terminer
- 🤔 Réflexion
- 🚨 Bug
- ❇️ Refactor

---

**Priorités sur le plan général**

- 🚨 Supprimer les pics de couple (ex. "Jansen" ou dans les forces de "Hoist.slidep")
- Masse suspendue affiche plus de 150 J d’écart ?
- Pourquoi la non-convergence chronique de CP, Core XY et Puente ?
- Le choc en butée de glissière, sur Core XY et Test slider. Crée de l'instabilité
- (Clock, Jansen, Hoist, Huygens, Vilbrequin + masse lourde) : c’est le levier du chantier performance.

- 🔨 Régler problèmes DDL
- 🔨 Clean les graphiques
- 🤔 Clarifier le grab en dynamique (grab -> force ?)
- 🤔 Clarifier "qu'est-ce qui est simulé ?" pour **dt**. On affiche des positions interpolées, mais pas les forces, les overlays, ni les valeurs dans le panneau latéral.
- 🔨 Améliorer les performances en édition
- 🔨 Améliorer les performances en simulation
- 🆕 Ajouter une section qui explique le type de simulation et ses limites (et paramètres ?)
- 🔨 Supprimer poutre sur joint de courroie
- 🚨 Faire fonctionner les treuils
- 🆕 Mobile mode
- 🆕 Copié-collé
- 🆕 Ajouter contraintes de distance parallèle
- 🆕 Ajouter contraintes de coincidence (point - ligne)
- 🤔 Comment connecter ou non des engrenages sur le même axe ?
- 🤔 Revenir sur l'idée de pouvoir modifier le mécanisme en cours de simulation (ex. déconnecter 2 éléments) ?

**Rendre la physique exacte (cas faux)**

- 🔨 Finir le boulot de "ratio-masse-convergence-dynamique.md" sur CP.slidep
- 🤔 Pas plus fins près des points morts (ex. vilbrequin) ?

---

- 🚨 Un ctrl+y de remplacement d'élément n'a pas reset la simulation, wtf !?
- 🚨 Un snap sur la grille ne se fait pas toujours bien aux valeurs rondes, wtf !?

### À faire rapidement

**Very qwick fix**

- 🔨 Ne plus accepter les raccourcis quand la gallerie est ouverte
- 🔨 Afficher le point grabbé en simulation
- 🔨 Afficher les trajectoires anciennes de plus en plus transparentes
- 🚨 Les trais indicatifs des valeurs max dans les diagrammes des efforts (vu dans Mf) s'accumulent
- 🚨 En simulation, clicker sur l'icon force, puis esc, puis reprendre la simu nous remet sur l'icon force.
- 🔨 La barre de scroll devrait se cacher, ou au moins se réduire, si on n'a pas scrollé depuis un moment
- 🔨 Ne pas enregistrer un mécanisme vide

- 🔨 N'afficher un moteur qu'une seul fois au maximum dans les DDL
- 🔨 afficher en priorité les éléments avec une masse (ex. Mass-ressort) dans les DDL
- 🔨 On devrait afficher T/N au lieu de x/y pour les mesures des forces internes
- 🔨 Afficher la masse des gears
- 🔨 Afficher I avec les profilés
- 🔨 Afficher les graphiques à frame=0 (pas "en attente de données...")
- 🔨 La distance d'écartement à la séparation d'éléments devrait dépendre du zoom

**Qwick fixes :**

- 🤔 C'est quoi le dossier "scratch/" ?
- 🤔 Indiquer, quand on click sur un overlay pour la première fois, qu'il n'est visible qu'en simulation (comment ?)
- 🤔 Afficher le signe des moments
- 🔨 Ajouter accélération overlay

**UI**

- 🔨 Hover sur les graphs met en évidence les éléments concernés
- 🔨 Les contraintes ne devrait pas apparaitre au hover quand on est en train de placer un élément. En fait, elle ne devrait apparaitre que dans les états "Idle"
- 🔨 Ajouter l'énergie apportée par l'utilisateur dans le bilan énergétique
- 🆕 Ajouter des tooltips dans le menu "Afficher"
- 🆕 Dans SelectionInspector, quand un est overlay sélectionné, on devrait avoir un bouton pour afficher sa métrique dans un graph
- 🆕 Rendre visible les ctrl+y/z invisibles : clignottement dans l'onglet

**Simulation**

- 🤔 Qu'est-ce qu'on fait pour afficher les hyperstatismes en dynamique (contraintes) ?
- 🚨 En cinématique, quand l'alignement n'est juste pas parfait (alors que le défaut peut ne même pas s'afficher), le mécanisme bouge tout seul (voir "Le mécanisme qui bouge tout seul.slidep").
- 🔨 Donner a tous les ressorts en cinématique la même "élasticité".

**Physique**

- ❇️ Voir ce que fait "LinkReaction" exactement, et dessiner les forces de réaction de gears au point de contact.
- 🤔 Afficher les loads (charges) en dynamique ?
- Interpoler sub snapshot les overlays à l'affichage en x0.1 (notamment les forces de réaction)
- 🆕 Ajouter ressort de couple
- 🆕 Ajouter les constantes de frottement / rebond des collisions (CONTACT_EPS ?)

**Collisions**

- 🔨 Vérifier que les contacts "émettent" des force dans les 2 sens
- 🚨 Vérifier ce que fait la bande de contact (0.5 unité) des collisions (et l'enlever ?)
- 🔨 Ajouter un filtre géométrique grossier (bounding box, grille spatiale) pour les collisions (recalculé peu souvent)
- 🔨 Vérifier les éléments exclus des collisions
- 🆕 Indiquer les collisions sur le canvas (point de contact)

**Solveur géométrique**

- 🔨 Maintenir les longueurs des beams si possible. Maintenir l'orientation ce celui modifié si possible.
- 🔨 Ignorer des grounds si nécessaire.
- 🚨 Généralement laisser les nodes sur les edges en "SlideOn"
- 🤔 Que faire quand on entre une valeur dans le panneau latéral que les contraintes existantes ne permettent pas ?

**Feedback et cas d'erreur**

- 🆕 Instabilité physique (solver PBD diverge / explosion) : pause auto + snackbar d'erreur
- 🆕 Conflit cinématique (deux moteurs incompatibles) : surlignage rouge des éléments conflictuels, panneau contextuel bascule sur onglet Analyse avec message explicatif

### À faire plus tard

**Mobile mode**

- 🆕 Suivre le plan _plan-mobile.md_ pour téléphone
- 🤔 Faire un nouveau plan pour tablette
- 🆕 Ajouter la feature dans les points clés de "A propos"

**Analyse hyperstatique**

- 🔨 Le ra-mappage des contraintes "angle -> longueur -> angle" ne met pas en évidence les bons éléments
- 🔨 Symboles angles vers l'intérieur
- 🔨 Symbole longueur de courroie
- 🚨 Mauvaise mesure des hyperstatismes dans le cas d'une simple barre ancrée aux 2 bouts
- 🚨 Sur le mécanisme "Poulie.slidep", je ne comprend pas les hyperstatismes "Non-glissement de courroie"
- 🚨 Quid des doubles contraintes (ex: "2 x Longueur") ?
- 🤔 Animer les éléments (en plus?) des symboles ?

**Panneau mesures**

- 🔨 À la fermeture du menu ProbeMetricSelector, on voit un petit rectangle sur 1 frame
- 🔨 Ajuster la position des sondes sur les courroies
- 🔨 Sur de combo ressort+amortisseur, ajuster la position des sondes et overlays
- 🔨 La transparence de deletion des probes est inconsistante
- 🔨 Choisir x/y/norme pour les mesures superposées
- 🔨 Possible de hover sur probe quand placingProbe (pareil pour gearRatio et Dimension)

**Canvas**

- 🚨 Ne pas ajouter un remplacement d'élément identique à l'historique
- 🆕 Ajouter un nouvel élément "Commentaire" sur le canvas
- 🔨 Theme transition : certaines couleurs changent instantanément (grille + autres éléments spéciaux du canvas)
- 🔨 Les couleurs de la top-bar et du canvas ne sont pas assez différenciée
- 🔨 Ajouter un délais (2s) avant d'afficher "mécanisme(s) exporté(s)"
- 🔨 Dessiner un join avec le ground à PlacingGround (quand c'est approprié)
- 🆕 Afficher des syboles au hover des numberInput start, end, longueur et angle
- 🆕 Afficher des syboles au hover des connexion (ex. beam end = anneau)
- 🔨 Hover une probe devrait hover l'élément aussi
- 🆕 Sélectionner les dimensions (sur la flèche)
- 🆕 Pouvoir mesurer et coter depuis les axes x/y
- 🔨 Rendre les hitbox exactes (contraintes, noeuds)
- 🤔 Caméra qui suit le mécanisme en simulation ?
- 🤔 Ajouter un mode d'édition pour déconnecter les éléments (ce qu'on ne peut faire actuellement que par le panneau contextuel) ?

- 🔨 Afficher le point de contact pour placingGearRadius sur belt
- ❇️ Wrap VS windings ?

**Panneaux et UI**

- 🔨 OnCanvasValueEditor trop large avec des points "."
- 🆕 Afficher le ratio avec une autre gear dans les connections de l'élément
- 🔨 Donner des couleurs aux tags
- 🆕 Scroll dans NumberInput
- 🆕 Rendre TRAJECTORY_DOT_STEP éditable
- 🆕 Ajouter des réglages généraux pour les types d'unités affichées (Tr/min VS s-1) ?

**Refactor des dossiers**

- ❇️ Renommer "titre" et "label" de ElementDisplay (confusant)
- ❇️ Unifier l'usage des séparateurs en pleine largeur (mx: -1, qui annule la marge du conteneur)
- ❇️ Trier le dossier "utils"

- ❇️ Refactor connect-actions.ts (< 600 lignes)
- 🤔 Refactor drawing-functions.ts ?
- 🤔 Refactor constraint-functions.ts ?
- ❇️ Refactor parsing.ts
- ❇️ Refactor kinematic-simulation.ts
- ❇️ Refactor MechanicalCanvas.tsx
- ❇️ Refactor AnalysisPanel.tsx
- ❇️ Refactor canvas-state-reducer.ts
- ❇️ Refactor get-hover.ts
- ❇️ Refactor AnalysisPanel.tsx
- ❇️ Refactor belt-path.ts
- 🤔 Refactor placing-element-actions.ts ?
- 🤔 Refactor placing-constraint-actions.ts ?

**Architecture et refactor**

- ❇️ Supprimer des fonctions simples de load-utils
- ❇️ Expliciter _ScreenPoint_ et _WorldPoint_ partout
- ❇️ Créer un CanvasState "PlacingElement", elementType (fusion de 15 états)
- ❇️ unifier la méthode de catégories de canvasState dans get-hover, placing-element-actions et autres / Créer uns catégories de CanvasState pour rendre le code plus lisible et maintenable
- ❇️ enlever les undefined de "SelectedElement"
- ❇️ Enlever tous les commentaires redondants
- ❇️ Fusionner les termes qui se répètent dans les traductions

**Refs ou frames sur gears**

- 🔨 Placer force on gearTooth
- 🔨 Moteurs ancrés sur gears
- 🔨 Force ref : ajouter gear et belt (join de courroie) en plus des edges

**Contraintes et dimensions**

- 🔨 Finir les traits de DimensionAngle
- 🔨 Polish de dimensionAngle: arrondir les angles de 0° / 180°, traits extérieurs pour les petits angles
- 🔨 Le dessin preview de DimensionAngle devrait tendre vers l'angle le plus petit

**Placement et remplacement d'éléments**

- 🔨 Transférer les propriétées de mesures et overlays au remplacement d'un node / edge
- 🆕 Placements en 2 étapes (Edges, Loads, etc.) avec down + drag + up
- 🆕 Placing beam series / only one if hold down when placing (like in OnShape)
- 🆕 Placer join à la jonction des Beams

**Preview de hover**

- 🤔 Ce n'est pas toujours clair quand un élément est placé ou en train d'être placé : transparence de l'élément en train d'être placé ?
- 🤔 Preview des éléments déconnectés au hover de déconnexion (après le chantier courroie : réutiliser le mécanisme d'état visé porté par le canvasState et retiré du tracé de preview)
- 🤔 Preview de la courroie explusée d'un gear ?
- 🔨 Le hover d'un edge lors du placement d'un objet sur une de ses extrémités devrait mettre en évidence tout l'edge

**Sélection multiple**

- 🚨 Shift + Click sur l'unique élément sélectionné ne le désélectionne pas
- 🆕 Ajouter le copié-collé
- 🤔 Symétrie / Rotation / Scale d'éléments multiples.
- 🤔 Click droit sur le canvas devrait proposer des choses (undo/redo, copy/paste, recentrer, etc.) (et sur un élément ?)
- 🚨 Le déplacement d'une sélection multiple devrait conserver les positions relatives des éléments déplacés
- 🔨 Le déplacement d'une sélection multiple doit snap à la grille

**Panneaux et UI**

- 🆕 Changer le nom de l'onglet du browser en "Mon mécanisme - Slidep"
- ❇️ Unifier les tailles des éléments UI
- ❇️ S'assurer que la police est toujours la même
- 🆕 Se déplacer dans le temps de la simu avec les flèches du clavier
- 🆕 Afficher les couleurs des thèmes dans le menu paramètres

**Probes et graphiques**

- 🆕 Ajouter paramètre : Afficher / Cacher les probes
- 🔨 Le nom des graphiques est affiché au dessus, mais en dessous quand fusionné
- 🔨 Les couleurs des graphiques ne changent pas en thème sombre et ne sont pas les mêmes que les trajectoires dessinées
- 🆕 Lire les valeurs à l'instant T sur les graphiques
- 🆕 export CSV / image des graphiques
- 🤔 pin graphique en grand ?
- 🆕 Mesures d'accélération, jerk ?
- 🆕 zoom graphique (horizontal = dans le temps, et scaling vertical qui suit)

### À faire quand tout le reste est fait

**Code**

- ❇️ Refactor Mechanism.tsx (make shorter)
- ❇️ Code review

**Contraintes et dimensions**

- 🔨 Changer la contrainte same length gears -> ratio 1:1 en une vraie contrainte same lengths
- 🆕 Contrainte de distance entre edges parallèles (à la place de contrainte d'angle) (fait aussi contrainte de parallélisme)
- 🆕 Contrainte de symétrie ?
- 🆕 Contrainte de milieu/centre ?
- 🆕 Dimension verticale/horizontale (choisie au placement) ?
- 🆕 Dimension verticale/horizontale sur les courroies ?
- 🤔 Dimension sur edges/gears/loads au placement ?
- 🤔 Traits de construction ?
- 🆕 Nouvel élément : Cliquet anti-retour sur gear
- 🤔 Système de variables et/ou de calculs pour les dimensions / dans numberInput ?

**Élements de simulation**

- 🆕 Motorisation de sliders (verins)
- 🆕 Limites d'angle des pivots
- 🆕 On devrait pouvoir choisir plusieurs ancrages pour un moteur (ex: "Vélo.slidep")

**Export et divers**

- 🆕 Boucler le replay (et choisir le temps de rebouclage)
- 🆕 Exporter une animation : générer .gif, .mp4 de la simulation (options durée, FPS, zoom)
- 🆕 Logo animé
- 🆕 Animer un mécanisme qui arrive sur l'écran après 10 min d'inactivité
- 🔨 Relire les traductions

**Visuel des éléments**

- 🔨 Changer l'apparence des extrémités de spring et damper comme pour beam
- 🆕 Afficher ground avec les 4 directions cardinales
- 🆕 Afficher le sens de rotation du moteur sur une des 4 directions cardinales
- 🆕 Prefered force direction : afficher les forces en 2 modes (toe to head / head to toe)
- 🆕 Option de colorer les éléments
- 🆕 Style des éléments : fil de fer, plein, couleurs
- 🆕 Ajouter engrenage couronne (extérieur) pour train épicycloïdal
- 🆕 Dessin gear stylisé

### [ Simulation STATIQUE ]

- 🆕 Implémenter algorithme de statique (matrices, ΣF=0)
- 🆕 Solver Statique algébrique (résolution d'inconnues)
- 🤔 Modification topologie en simulation : pause auto + bascule temporaire Édition ?

### [ Slidep 3D ]

- 🆕 Changer la boucle de rendu
- 🆕 Ajouter un cube d'orientation
- 🆕 Créer l'objet "plan"
- 🆕 Ajouter les noeuds "pivot glissant", "rotule", "rotule à doigt", "cardan", "linéaire annulaire", "hélicoïdale"

### [ Préparer pour les contributions ]

- 🆕 README.md
- 🆕 Documentation
- 🆕 Design guidelines
