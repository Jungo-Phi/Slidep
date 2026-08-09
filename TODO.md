# A faire - Slidep

- 🆕 Nouvelle feature
- 🔨 Feature à terminer
- 🤔 Réflexion
- 🚨 Bug
- ❇️ Refactor

---

### À faire rapidement

**Analyse**

- 🔨 Changer le terme "mobilité" par "degré de liberté".
- 🚨 Unifier l'usage des : ctx.globalAlpha, etc. Pour une règle unique de ctx.save/restore à chaque modification du contexte (plus un reset global au début du dessin).
- 🚨 Fixes visuels du hover-multiple, notament pour les "edge-end"
- 🤔 Changer d'onglet devrait changer le canvasState (ex: placingX -> analyse -> selecting)
- 🤔 Hover un élément sur le canvas devrait hover son/ses ElementDisplay correspondants
- A partir de 12 mécanismes, afficher les previews en plus petit.

- 🔨 Faire le tri dans le tableau de hover sur ce qui doit être ignoré ou rejeté
- 🆕 Sélectionner un élément (depuis le panneau latéral) recadre le canvas pour le rendre visible à l'écran
- 🚨 Supprimer le parentBeam du slider "Uvom" de "Vilbrequin double slider.slidep" génère une connexion non réciproque
- 🚨 Les dimensions sont prisent en compte pour le cadrage de la gallerie
- 🚨 Supprimer la contrainte sélectionnée dans le panneau latéral fait quitter l'onglet de contraintes
- 🔨 Bouton "Recentrer" calcul à partir des positions des éléments
- 🚨 SnapToGrid pas 100% fiable (nottament snapX + snapY)
- 🚨 Système d'undo/redo des déplacements n'est pas toujours fiable
- 🚨 Le ctrl+z de la création de dimension a 2 étapes lieu d'une
- 🚨 Ne pas ajouter une action à l'historique si elle ne change rien (ex: newValue = oldValue)
- 🚨 Ajouter une règle qui empèche un pivot d'avoir un gear comme RotatingEdges ET FixesGears + adapter le hover pour ne pas l'atteindre
- 🚨 Sélectionner une contrainte fait un shadow sur les probes
- 🚨 MovingBeltBody sur un gear ne se fait pas avec le bon sens de rotation **quand les 2 sens sont possibles**
- 🚨 Le sens de rotation gear/belt indiqué dans le panneau latéral est inversé
- 🚨 Le bouton dropDown pour changer le repère d'une force ne click pas sur toute la largeur de ElementDisplay
- 🚨 Click droit sur le canvas / esc en simulation devrait faire retourner au panneau d'analyse (comme en édition dans le panneau de propriétés)
- 🚨 Hover interdire les éléments directement connectés et l'élément lui-meme pour dimensions
- 🆕 Ajouter des méchanismes exemple dans la gallerie ("Jansen's linkage", "Slidep", "IK", "Horloge", "Dynamique (Huygens?)")

**Refactor des dossiers**

- ❇️ Refactor App.tsx (< 600 lignes)
- ❇️ Refactor draw-canvas.ts (< 600 lignes)
- ❇️ Refactor connect-actions.ts (< 600 lignes)
- 🤔 Refactor drawing-functions.ts ?
- 🤔 Refactor constraint-functions.ts ?
- ❇️ Refactor parsing.ts
- ❇️ Refactor kinematic-simulation.ts
- ❇️ Refactor ElementProperties.tsx
- ❇️ Refactor MechanicalCanvas.tsx
- ❇️ Refactor AnalysisPanel.tsx
- ❇️ Refactor canvas-state-reducer.ts
- ❇️ Refactor get-hover.ts
- ❇️ Refactor AnalysisPanel.tsx
- ❇️ Refactor belt-path.ts
- 🤔 Refactor placing-element-actions.ts ?
- 🤔 Refactor placing-constraint-actions.ts ?
- ❇️ Réorganisation des fichiers en sous-dossiers

**Clarifier l'édition en simulation (Hot-Reload), ce n'est pas clair si elle est sauvegardée ou temporaire**

- 🤔 Les changements de vitesse de moteurs en simulation doivent-il être enregistrés ?
- 🤔 Afficher les changements de directions de moteurs (et autres) dans le panneau latéral en relecture ?
- 🔨 La flèche du moteur doit changer de sens en simulation relecture
- 🆕 Champ clignote brièvement (bordure verte ?) pour confirmer la prise en compte par le solver

**Simulation**

- 🔨 Mettre à jour le hover en simulation quand le mécanisme bouge sans grab
- 🚨 En cinématique, quand l'alignement n'est juste pas parfait (alors que le défaut peut ne même pas s'afficher), le mécanisme bouge tout seul (voir "Le mécanisme qui bouge tout seul.slidep").
- 🔨 DimensionBelt ne met pas à jour la dimension de belt _open_
- 🔨 Simuler un moteur non grounded (parentBeamID)
- 🔨 Donner a tous les ressorts en cinématique la même "élasticité".
- 🚨 avec le mécanisme "Poutre sur joint de courroie"
- 🚨 avec le mécanisme "Ressorts sur moteur"
- Passer la simulation en Rust WASM pour accélérer ?

**Solveur géométrique**

- 🔨 Maintenir les longueurs des beams si possible. Maintenir l'orientation ce celui modifié si possible.
- 🔨 Ignorer des grounds si nécessaire.
- 🚨 Généralement laisser les nodes sur les edges en "SlideOn"
- 🤔 Que faire quand on entre une valeur dans le panneau latéral que les contraintes existantes ne permettent pas ?

---

### [ Simulation dynamique ]

**Physique**

- 🆕 Créer les fonctions de containte PBD dynamiques
- 🆕 Collisions
- 🆕 Frottements dans les pivots et sliders
- 🆕 Propriétés de poutre (hauteur, largeur, matériau)
- 🆕 Moteurs de couple
- 🆕 Ajouter ressort de couple.

**Visualisation**

- 🆕 Afficher les vitesses
- 🆕 Afficher les forces de réaction
- 🆕 Afficher les contraintes (à partir des déformations ?)
- 🆕 Afficher puissance et énergie

**Feedback et cas d'erreur**

- 🆕 Instabilité physique (solver PBD diverge / explosion) : pause auto + snackbar d'erreur
- 🆕 Conflit cinématique (deux moteurs incompatibles) : surlignage rouge des éléments conflictuels, panneau contextuel bascule sur onglet Analyse avec message explicatif

### À faire plus tard

**Mobile mode**

- 🆕 Suivre le plan _plan-mobile.md_ pour téléphone
- 🤔 Faire un nouveau plan pour tablette
- 🆕 Ajouter la feature dans les points clés de "A propos"

**Repenser les "Contraintes non respectées"**

- 🤔 Afficher uniquement les moteurs ? (OU sur la liste des moteurs déjà affichés ?)
- 🤔 Afficher les contraintes non respectées en colorant les éléments (rouge) ?

**Panneau mesures**

- 🔨 "Esc", "CTRL+Y/Z" et hover sur le canvas doit marcher avec le OnCanvasProbeMetricSelector
- 🔨 À la fermeture du menu ProbeMetricSelector, on voit un petit rectangle sur 1 frame
- 🤔 Ajouter l'icon "Probe" au dessus des check-box de mesure ?
- 🔨 Pas de sonde sur les courroies
- 🔨 Le ProbeMetricSelector devrait apparaitre au dessus de la sonde si elle est en bas de l'écran
- 🔨 La couleur de la sonde n'est pas la bonne au placement
- 🔨 La transparence de deletion des probes est inconsistante
- 🔨 Choisir x/y/norme pour les mesures superposées
- 🔨 Possible de hover sur probe quand placingProbe (pareil pour gearRatio et Dimension)

**🔨 Trajectoires**

- 🔨 Afficher les trajectoires des edges (les 2 extrémités)
- 🔨 Afficher les trajectoires des gears (bords tangeants au mouvement ?)
- 🔨 Ne PAS afficher les trajectoires des éléments ancrés.
- 🔨 Option d'afficher la trajectoire avec des points
- 🔨 Afficher les trajectoires anciennes de plus en plus transparentes

**Canvas**

- 🆕 Ajouter les graduations à la grille (_grille adaptative.md_)
- 🔨 PlacingBeltEnd : clicker sur le gearTooth de départ devrait fermer la courroie
- 🆕 Parsing loads : "150000 N" => "150 kN"
- 🔨 Afficher le point grabbé en simulation
- 🔨 Theme transition : certaines couleurs changent instantanément (grille + autres éléments spéciaux du canvas)
- 🔨 Les couleurs des selected loads ne sont pas assez différenciée
- 🤔 Changer une dimension fait apparaitre les autres contraintes, c'est bizzare
- 🔨 Les contraintes ne devrait pas apparaitre au hover quand on est en train de placer un élément. En fait, elle ne devrait apparaitre que dans les états "Idle"
- 🔨 Ajouter un délais (2s) avant d'afficher "mécanisme(s) exporté(s)"
- 🔨 Dessiner un join avec le ground à PlacingGround (quand c'est approprié)
- 🤔 Afficher hover-circle au hover du numberInput ?
- 🔨 Hover une probe devrait hover l'élément aussi
- 🆕 Sélectionner les dimensions (sur la flèche)

- 🔨 Afficher le point de contact pour placingGearRadius sur belt
- ❇️ Wrap VS windings ?

**Panneaux et UI**

- 🤔 On confond toujours les boutons "reset" et "retour au départ" (et un peu de changement de vitesse de simulation). En déplacer vers la timeline ?
- 🤔 Est-ce que le contrôle de vitesse de simulation ne devrait-il pas être éditable en édition ?
- 🔨 Changer couleur (icon + texte) de la contrainte sélectionnée au lieu du bord dans panneau contextuel
- 🔨 Unifier l'usage des tooltips
- 🔨 Séparer snap "grille" et "angles"
- 🆕 Ajouter des tooltips sur les onglets
- 🔨 OnCanvasValueEditor trop large avec des points "."
- 🔨 Afficher vitesse au lieu de ground en haut du moteur
- 🆕 Utiliser le "bouton dropDown pour changer le repère d'une force" pour choisir l'ancrage d'un moteur
- 🆕 Ajouter boutons pour changer le parentBeam des slider et slideps
- 🤔 Courroie fermée : refléter "déconnecter = ouvrir" (icône ou affichage de la Jonction) — le bouton Tendue/Libre du panneau n'a plus de sens
- 🆕 Afficher le ratio avec une autre gear dans les connections de l'élément
- 🆕 Éditer la longueur de repos d'un ressort (pas forcément égale à celle affichée en édition)
- 🆕 Scroll dans NumberInput

**Architecture et refactor**

- ❇️ Supprimer des fonctions simples de load-utils
- ❇️ Expliciter _ScreenPoint_ et _WorldPoint_ partout
- ❇️ Créer un CanvasState "PlacingElement", elementType (fusion de 15 états)
- ❇️ unifier la méthode de catégories de canvasState dans get-hover, placing-element-actions et autres / Créer uns catégories de CanvasState pour rendre le code plus lisible et maintenable
- ❇️ enlever les undefined de "SelectedElement"
- ❇️ Refactor en enlevant le actionBundleType ?
- 🔨 Ajouter des "Blank" quand on change une valeur depuis les propriétés
- 🆕 Ajouter un nouvel élément "Commentaire" sur le canvas

**Charges**

- 🔨 Placer force on gearTooth
- 🔨 Force ref : ajouter gear et belt (join de courroie) en plus des edges

**Contraintes et dimensions**

- 🔨 Finir les traits de DimensionAngle
- 🔨 Polish de dimensionAngle: arrondir les angles de 0° / 180°, traits extérieurs pour les petits angles
- 🔨 Afficher les contraintes non respectées avec des messages (Attention / Brisée) au lieu de e=3.72
- 🆕 Afficher les contraintes non respectées en couleur sur le canvas

**Placement et remplacement d'éléments**

- 🔨 Transférer les propriétées de mesures et overlays au remplacement d'un node / edge
- 🆕 Placements en 2 étapes (Edges, Loads, etc.) avec down + drag + up
- 🆕 Placing beam series / only one if hold down when placing (like in OnShape)
- 🆕 Placer join à la jonction des Beams

**Preview de hover**

- 🤔 Ce n'est pas toujours clair quand un élément est placé ou en train d'être placé : transparence de l'élément en train d'être placé
- 🤔 Preview des éléments déconnectés au hover de déconnexion (après le chantier courroie : réutiliser le mécanisme d'état visé porté par le canvasState et retiré du tracé de preview)
- 🤔 Preview de la courroie explusée d'un gear ?
- 🔨 Le hover d'un edge lors du placement d'un objet sur une de ses extrémités devrait mettre en évidence tout l'edge

**Sélection multiple**

- 🤔 Penser le panneau : plusieurs éléments sélectionnés (même/différent type)
- 🆕 Sélection multiple d'éléments du même type -> modifier paramètres simultanément (IU adaptée + actions multiples)
- 🆕 Ajouter le copié-collé
- 🤔 Symétrie / Rotation / Scale d'éléments multiples.
- 🤔 Click droit sur le canvas devrait proposer des choses (undo/redo, copy/paste, recentrer, etc.) (et sur un élément ?)
- 🚨 Le déplacement d'une sélection multiple devrait conserver les positions relatives des éléments déplacés
- 🔨 Le déplacement d'une sélection multiple doit snap à la grille

**Panneaux et UI**

- 🆕 Changer le nom de l'onglet du browser en "Mon mécanisme - Slidep"
- 🔨 Choisir quels éléments sont : disabled={simulating}
- 🔨 Ajouter un title="xxx" à tous les trailing controls
- 🤔 Bouton "Play" sur moteur en simu ?
- 🔨 Ajouter "Angle" dans les edges
- ❇️ Unifier les tailles des éléments UI
- ❇️ S'assurer que la police est toujours la même
- 🆕 Ajouter bouton(s) loupe pour zoomer
- 🆕 Se déplacer dans le temps de la simu avec les flèches du clavier
- 🆕 Afficher les couleurs des thèmes dans le menu paramètres

**Propriétés du mécanisme, tags et imports**

- 🆕 Import de mécanismes en drag & drop depuis l'explorateur de fichiers
- 🔨 Édition du nom du mécanisme dans la gallerie
- 🔨 Afficher la description du mécanisme dans la gallerie en lecture seule sur 2 ou 3 lignes (... si trop long)
- 🆕 Créer l'éditeur de tags, le même dans la gallerie que dans le panneau de propriétés
- 🆕 Suggestion de tags "Statique", "Cinématique", "Dynamique"
- 🔨 Afficher le nombre de pièces comme un tag
- 🔨 Exporter le mécanisme depuis le panneau de propriétés ?

**Probes et graphiques**

- 🆕 Ajouter paramètre : Afficher / Cacher les probes
- 🆕 export CSV / image des graphiques
- 🆕 pin graphique en grand ?
- 🆕 Mesures d'accélération, jerk ?
- 🆕 zoom graphique (horizontal = dans le temps)

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

**Visuel des éléments**

- 🔨 Changer l'apparence des extrémités de spring et damper comme pour beam
- 🆕 Afficher ground avec les 4 directions cardinales
- 🆕 Afficher le sens de rotation du moteur sur une des 4 directions cardinales
- 🆕 Prefered force direction : afficher les forces en 2 modes (toe to head / head to toe)
- 🆕 Option de colorer les éléments
- 🆕 Style des éléments : fil de fer, plein, couleurs
- 🆕 Ajouter engrenage couronne (extérieur) pour train épicycloïdal
- 🆕 Dessin gear stylisé

**Interactions et UI**

- 🤔 Comment rendre visible les ctrl+y/z invisibles ? Ou on s'en fout ?
- 🤔 Afficher "shown_name d'un élément au hover de celui-ci ?
- 🤔 Test utilisateur : "ESCAPE" doit-il faire revenir en édition en 1/2 clicks ?

**Paramètres et unités**

- 🆕 Créer un système d'unités (zoom de base : 1px = 1mm) à mettre dans les paramètres

**Gallerie et projet**

- 🆕 Ajouter bouton "Dupliquer le mécanisme"
- 🆕 Rendre les previews de la gallerie interactives

**Export et divers**

- 🆕 Boucler le replay (et choisir le temps de rebouclage)
- 🆕 Exporter une animation : générer .gif, .mp4 de la simulation (options durée, FPS, zoom)
- 🆕 Logo animé
- 🆕 Animer un mécanisme qui arrive sur l'écran après 10 min d'inactivité
- 🔨 Relire les traductions

### [ Simulation STATIQUE ]

- 🆕 Implémenter algorithme de statique (matrices, ΣF=0)
- 🆕 Solver Statique algébrique (résolution d'inconnues)
- 🆕 Modification topologie en simulation : pause auto + bascule temporaire Édition
