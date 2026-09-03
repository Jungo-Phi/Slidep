# A faire - Slidep

- 🆕 Nouvelle feature
- 🔨 Feature à terminer
- 🤔 Réflexion
- 🚨 Bug
- ❇️ Refactor

---

### À faire rapidement

**Qwick fix**

- La puissance affichée devrait être celle que le moteur peut fournir (et pas la puissance instantanée), on devrait donc ensuite pouvoir comparer la puissance du moteur à la puissance instantanée. Le calcul devrait aussi être revu pour prendre en compte ce qu'apporte vraiment le moteur et ce qui tient de l'inertie.

- 🔨 Afficher la masse des gears
- 🔨 Afficher les contraintes dans les joins
- 🔨 Afficher "déplacez ce mécanisme à la main" uniqument un cinématique ?
- 🔨 Afficher les graphiques à frame=0 (pas "en attente de données...")
- 🚨 Hot-reload des masses, ressorts et amortisseurs en simulation
- 🚨 Rendre les dimensions non-éditables en simulation

**UI**

- 🔨 Clean cette putain de section "élément en simulation
- 🔨 Travailler les couleurs, avec les thèmes

- 🔨 Hover sur les graphs met en évidence les éléments concernés
- 🔨 Les contraintes ne devrait pas apparaitre au hover quand on est en train de placer un élément. En fait, elle ne devrait apparaitre que dans les états "Idle"
- Ajouter l'énergie apportée par l'utilisateur dans "Travil net" (Bilan énergétique)

**Informations fausses**

- 🚨 Angle affiché dans les mesures "Balance.slidep" est faux. L'angle du graph ne correspond pas à celui de l'élément

- 🚨 Différencier "Forces de réaction" et "Efforts internes"

**Simulation**

- 🤔 Qu'est-ce qu'on fait pour afficher les hyperstatismes en dynamique (contraintes) ?
- 🔨 Mettre à jour le hover en simulation quand le mécanisme bouge sans grab
- 🚨 En cinématique, quand l'alignement n'est juste pas parfait (alors que le défaut peut ne même pas s'afficher), le mécanisme bouge tout seul (voir "Le mécanisme qui bouge tout seul.slidep").
- 🔨 Donner a tous les ressorts en cinématique la même "élasticité".
- 🚨 Bug avec le mécanisme "Poutre sur joint de courroie"
- 🚨 Bug avec le mécanisme "Ressorts sur moteur"
- Passer la simulation en Rust WASM pour accélérer ?

---

- 🚨 Le moteur se bloque avec "Jansen", wtf !?
- 🚨 Hover sur des contraintes cachées, wtf !?
- Le hover des éléments depuis le panneau latéral ne devrait pas faire apparaitre les contraintes
- 🚨 Hover des loads sous les edges, wtf !?
- 🚨 Un snap sur la grille ne se fait pas toujours bien aux valeurs rondes, wtf !?

**Physique**

- ❇️ Voir ce que fait "LinkReaction" exactement, et dessiner les forces de réaction de gears au point de contact.
- 🤔 Afficher les loads (charges) en dynamique ?
- Interpoler sub snapshot les overlays à l'affichage en x0.1 (notamment les forces de réaction)

- 🆕 Frottements dans les pivots et sliders
- 🆕 Ajouter ressort de couple
- 🆕 Ajouter les constantes de frottement / rebond des collisions (CONTACT_EPS ?)

**Cas test à régler**

- Jansen a le moteur qui bloque mais rien n'est indiqué et le couple n'y change rien
- Qu'est-ce qui change entre "Double Cantilever.slidep" et "Double Cantilever bis.slidep" pour que "Double Cantilever bis.slidep" oscille ?

---

- Écart assumé dans 5bis : pas d'avertissement d'hyperstatisme affiché, seulement le résidu de bouclage (ChainMobility.hyperstaticity pas branché — jugé pas prioritaire pour ce premier passage).

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

- 🆕 Ajouter des méchanismes exemple dans la gallerie ("Jansen's linkage", "Slidep", "IK", "Horloge", "Dynamique (Huygens?)")

**Mobile mode**

- 🆕 Suivre le plan _plan-mobile.md_ pour téléphone
- 🤔 Faire un nouveau plan pour tablette
- 🆕 Ajouter la feature dans les points clés de "A propos"

**Repenser les "Contraintes non respectées"**

- 🤔 Afficher uniquement les moteurs ? (OU sur la liste des moteurs déjà affichés ?)
- 🤔 Afficher les contraintes non respectées en colorant les éléments (rouge) ?

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
- 🔨 Pas de sonde sur les courroies
- 🔨 Ajuster la position des sondes sur ressort+amortisseur
- 🔨 La transparence de deletion des probes est inconsistante
- 🔨 Choisir x/y/norme pour les mesures superposées
- 🔨 Possible de hover sur probe quand placingProbe (pareil pour gearRatio et Dimension)
- 🆕 Mesurer la masse totale d'un mécanisme

**🔨 Trajectoires**

- 🔨 Afficher les trajectoires des edges (les 2 extrémités)
- 🔨 Afficher les trajectoires des gears (bords tangeants au mouvement ?)
- 🔨 Ne PAS afficher les trajectoires des éléments ancrés.
- 🔨 Option d'afficher la trajectoire avec des points
- 🔨 Afficher les trajectoires anciennes de plus en plus transparentes

**Canvas**

- 🚨 SnapToGrid pas 100% fiable (nottament snapX + snapY) ?
- 🚨 Ne pas ajouter un remplacement d'élément identique à l'historique
- 🆕 Ajouter un nouvel élément "Commentaire" sur le canvas
- 🔨 Afficher le point grabbé en simulation
- 🔨 Theme transition : certaines couleurs changent instantanément (grille + autres éléments spéciaux du canvas)
- 🔨 Les couleurs des selected loads ne sont pas assez différenciée
- 🔨 Ajouter un délais (2s) avant d'afficher "mécanisme(s) exporté(s)"
- 🔨 Dessiner un join avec le ground à PlacingGround (quand c'est approprié)
- 🆕 Afficher des syboles au hover des numberInput start, end, longueur et angle
- 🔨 Hover une probe devrait hover l'élément aussi
- 🆕 Sélectionner les dimensions (sur la flèche)
- 🔨 Rendre les hitbox exactes (contraintes, noeuds)

- 🔨 Afficher le point de contact pour placingGearRadius sur belt
- ❇️ Wrap VS windings ?

**Panneaux et UI**

- 🤔 On confond toujours les boutons "reset" et "retour au départ" (et un peu de changement de vitesse de simulation). En déplacer vers la timeline ?
- 🔨 OnCanvasValueEditor trop large avec des points "."
- 🆕 Ajouter boutons pour changer le parentBeam des slider et slideps
- 🆕 Afficher le ratio avec une autre gear dans les connections de l'élément
- 🔨 Donner des couleurs aux tags
- 🆕 Scroll dans NumberInput
- 🆕 Rendre TRAJECTORY_DOT_STEP éditable
- 🆕 Ajouter des réglages généraux pour les types d'unités affichées (Tr/min VS s-1) ?

**Refactor des dossiers**

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
- 🚨 Shift + Click sur l'unique élément sélectionné ne le désélectionne pas
- 🤔 Shift + Click de sélection multiple sur les ElementDisplay de l'onglet éléments aussi
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
- 🆕 Se déplacer dans le temps de la simu avec les flèches du clavier
- 🆕 Afficher les couleurs des thèmes dans le menu paramètres

**Probes et graphiques**

- 🆕 Ajouter paramètre : Afficher / Cacher les probes
- 🔨 Le nom des graphiques est affiché au dessus, mais en dessous quand fusionné
- 🔨 Les couleurs des graphiques ne changent pas en thème sombre et ne sont pas les mêmes que les trajectoires dessinées
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

**Interactions et UI**

- 🆕 Rendre visible les ctrl+y/z invisibles : clicgnottement dans l'onglet
- 🤔 Bundler les actions avec un debounce ?
- 🔨 Ajouter des "Blank" quand on change une valeur depuis les propriétés ?
- 🤔 Afficher "shown_name d'un élément au hover de celui-ci ?
- 🤔 Test utilisateur : "ESCAPE" doit-il faire revenir en édition en 1/2 clicks ?

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
- 🆕 Modification topologie en simulation : pause auto + bascule temporaire Édition

### [ Slidep 3D ]

- 🆕 Changer la boucle de rendu
- 🆕 Ajouter un cube d'orientation
- 🆕 Créer l'objet "plan"
- 🆕 Ajouter les noeuds "pivot glissant", "rotule", "rotule à doigt", "cardan", "linéaire annulaire", "hélicoïdale"
