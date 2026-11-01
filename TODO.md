# A faire - Slidep

- 🆕 Nouvelle feature
- 🔨 Feature à terminer
- 🤔 Réflexion
- 🚨 Bug
- ❇️ Refactor

---

**Roadmap**

- 🚨 Régler les bugs prioritaires
- 🤔 Répondre aux questions
- 🔨 Lisibilité
- 🔨 Tutos et onboarding
- 🔨 Solveur géométrique
- 🔨 DDL & hyperstatique
- 🔨 Graphiques
- 🔨 Terminer la physique
- 🆕 Nouvelles fonctionnalités

### Retours utilisateurs

**Bugs prioritaires**

- 🚨 Échec de l'enregistrement automatique et du chargement de fichiers sur Mac
- 🔨 Afficher un message d'erreur clair en cas d'échec d'enregistrement / de chargement
- 🚨 Mauvais résultats de la physique sur "Test Poulie sans masse/frottement.slidep"
- 🚨 Mauvais affichage des contraintes sur "Asymétrie.slidep"
- 🚨 Un snap sur la grille ne se fait pas toujours bien aux valeurs rondes, wtf !?
- 🚨 Supprimer la référence d'une force sur les courroies
- 🚨 Il manque des réactions aux appuis
- 🚨 On manque d'un moment de réaction d'appuis sur le slider de "Puente"
- 🚨 Les forces de réaction et efforts internes disparaissent après un grab dans "Hoist.slidep"

**Lisibilité**

- 🔨 Faire comprendre que l’engrenage à un double usage et fait aussi poulie
- 🔨 Mieux différencier visuellement les joins et les pivots
- 🔨 Donner des titres à toutes les sections du panneau latéral
- 🤔 Les mécaniciens on tendance à penser avec des conditions aux limites et sont donc confus par le slider ou slidep, car ce sont des liaisons. Faudrait-il faire quelque chose pour clarifier ça ? Créer de vraies conditions limites ? Ou ne rien faire ?
- 🔨 Rendre les hitbox exactes (contraintes, noeuds)
- 🔨 Finir les traits de DimensionAngle
- 🔨 Expliquer les différents "types" de contraintes, et mettre "Taux de travail" en évidence
- 🔨 Modifier les dimensions du profilé d'une poutre dans le panneau de la poutre elle-même
- 🔨 Pouvoir attraper les engrenages / poulies par le corps (pas seulement par le bord)
- 🔨 N’arrive pas bien à connecter une courroie (l’attrape par les bouts)
- 🆕 Placer une courroie en traçant un chemin
- 🆕 Placer une courroie en commençant par les engrenages (au lieu du vide)

**Découvrabilité et onboarding**

- 🆕 Ajouter des tutos dans un deuxième onglet de la gallerie
- 🤔 Utiliser les exemples comme tuto
- 🆕 Ajouter des tutos au hover long sur les élément de la palette et premières utilisations de fonctionnalités
- 🤔 Mieux distinguer les modes édition / simulation / simulation reset
- 🤔 Montrer qu'on peut interagir pendant la simulation
- 🤔 Faire apparaitre "un indice" qui pointe vers l'outil DDL quand il y a un blocage (ou au premier)
- 🆕 Ajouter une section qui explique le type de simulation et ses limites (et paramètres ?)

**Solveur géométrique**

- 🚨 En édition, bouger un élément d'un côté du mécanisme fait bouger l'autre bout (ex. fait tourner un slider ancré) :
  - 🔨 Maintenir les longueurs des beams si possible. Maintenir l'orientation ce celui modifié si possible.
  - 🔨 Ignorer des grounds si nécessaire.
  - 🚨 Généralement laisser les nodes sur les edges en "SlideOn"
  - Un mouvement à un bout du mécanisme ne devrait pas faire bouger l'autre bout
- 🤔 Que faire quand on entre une valeur dans le panneau latéral que les contraintes existantes ne permettent pas ?

**DDL & analyse hyperstatique**

- 🔨 N'afficher un moteur qu'une seul fois au maximum dans les DDL
- 🔨 afficher en priorité les éléments avec une masse (ex. Mass-ressort) dans les DDL
- 🤔 Pour "débuger" un mécanisme, les DDL sont plus utiles que les hyperstatismes. L'indication visuelle et le message d'hyperstatisme actuel sont confusants. Voir comment MSC Adams affiche les mobilité et signale les liaisons redondantes.
- 🔨 Le ra-mappage des contraintes "angle -> longueur -> angle" ne met pas en évidence les bons éléments
- 🔨 Symboles angles vers l'intérieur
- 🔨 Symbole longueur de courroie
- 🚨 Mauvaise mesure des hyperstatismes dans le cas d'une simple barre ancrée aux 2 bouts
- 🚨 Sur le mécanisme "Poulie.slidep", je ne comprend pas les hyperstatismes "Non-glissement de courroie"
- 🚨 Quid des doubles contraintes (ex: "2 x Longueur") ?
- 🤔 Animer les éléments (en plus/au lieu) des symboles ?

**Graphiques**

- 🚨 Les trais indicatifs des valeurs max dans les diagrammes des efforts (vu dans Mf) s'accumulent
- 🆕 Lire les valeurs à l'instant t sur les graphiques
- 🆕 zoom graphique (horizontal = dans le temps, et scaling vertical qui suit)
- 🆕 Voir comment fait Working Model pour les mesures "des courbes branchables sur n'importe quelle grandeur au cours du temps"
- 🆕 Pouvoir épingler les graphiques en grand
- 🆕 export CSV / image des graphiques
- 🔨 Afficher les graphiques à frame=0 (pas "en attente de données...")
- 🔨 Le nom des graphiques est affiché au dessus, mais en dessous quand fusionné
- 🔨 Les couleurs des graphiques ne changent pas en thème sombre et ne sont pas les mêmes que les trajectoires dessinées
- 🆕 Afficher la force équivalente d'une force linéique
- 🆕 Mesures d'accélération, jerk ?

**Terminer la physique**

- 🚨 Faire fonctionner les treuils "Treuil court.slidep"
- 🚨 Régler le blocage/déblocage sur Poulie bloqueuse en dynamique
- 🚨 Comment est-ce qu'on peut avoir des réactions d'appuis "moment" sur un pivot, wtf !?
- 🚨 L'erreur sur le bilan des forces est de presque 100% pour "Pendulum clock.slidep"
- 🤔 Pas plus fins près des points morts (ex. vilbrequin) ?
- 🤔 Donner une élasticité aux courroies ?
- 🤔 Passer la cinématique et édition en solver direct ?
- 🆕 Ajouter les constantes de frottement / rebond des collisions (CONTACT_EPS ?)
- 🔨 Vérifier que les contacts "émettent" des force dans les 2 sens
- 🚨 Vérifier ce que fait la bande de contact (0.5 unité) des collisions (et l'enlever ?)
- 🔨 Ajouter un filtre géométrique grossier (bounding box, grille spatiale) pour les collisions (recalculé peu souvent)
- 🔨 Rendre le grab plus stable (cinématique et dynamique)

**Nouvelles fonctionnalités**

- 🆕 Placer join à la jonction des Beams
- 🆕 Ajouter un paramètre pour mettre des enroulements en édition (treuil)
- 🆕 Copié-collé
- 🆕 Ajouter contraintes de distance parallèle
- 🆕 Ajouter contraintes de coincidence (point - ligne)
- 🔨 Supprimer l'interdiction "une masse ne peut pas être ancrée"
- 🆕 Pouvoir imposer une vitesse
- 🆕 Pouvoir mesurer et coter depuis les axes x/y
- 🆕 Mesure d'angle avec 3 points

---

### À faire rapidement

**Very qwick fix**

- 🚨 Un ctrl+y de remplacement d'élément n'a pas reset la simulation, wtf !?
- 🚨 Le point sur la timeline n'est pas attrapable quand il est sur un marqueur
- 🚨 Clicker sur le canvas après avoir sélectionné un élément ne doit pas afficher la sélection multiple (ou seulement après avoir commencé le drag).
- 🔨 Transférer les propriétées de mesures et overlays au remplacement d'un node / edge
- 🔨 Hover le bilan des moments ne doit pas faire apparitre le cg, seulement à la sélection. Et n'afficher la croix que si on n'affiche pas de moment à sa position
- 🔨 Bords tags en thème blueprint
- 🔨 Afficher les contraintes d'un élément sélectionné
- 🔨 Afficher le point grabbé en simulation
- 🔨 Afficher les trajectoires anciennes de plus en plus transparentes
- 🔨 Dans les diagrammes des efforts, la directions des flèches au hover doit suivre le graph
- 🔨 Afficher les unités des efforts internes
- 🔨 Mieux afficher les unités des graphs globaux
- 🚨 En simulation, clicker sur l'icon force, puis esc, puis reprendre la simu nous remet sur l'icon force.
- 🔨 La barre de scroll devrait se cacher, ou au moins se réduire, si on n'a pas scrollé depuis un moment
- 🔨 Ne pas enregistrer un mécanisme vide
- 🔨 Afficher l'angle total ET modulo 360

- 🔨 On devrait afficher T/N au lieu de x/y pour les mesures des forces internes
- 🔨 Afficher la masse des gears
- 🔨 Afficher I avec les profilés
- 🔨 Afficher les contraintes (ou juste "contrainte max") dans SelectionInspector des poutres
- 🔨 La distance d'écartement à la séparation d'éléments devrait dépendre du zoom
- 🔨 Faire apparaitre les contraintes à l'écran même si on est zoomé
- 🔨 Le ressort de grab n'est pas aligné sur la force de hover, son texte est mal placé, et le dessin n'est pas raccord entre proche et éloigné.

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
- 🆕 Ajouter paramètre : Afficher / Cacher les probes

**Simulation**

- 🚨 En cinématique, quand l'alignement n'est juste pas parfait (alors que le défaut peut ne même pas s'afficher), le mécanisme bouge tout seul (voir "Le mécanisme qui bouge tout seul.slidep").
- 🔨 Donner a tous les ressorts en cinématique la même "élasticité".

**Physique**

- ❇️ Dessiner les forces de réaction de gears au point de contact.
- 🆕 Ajouter ressort de couple

**Feedback et cas d'erreur**

- 🆕 Instabilité physique (solver PBD diverge / explosion) : pause auto + snackbar d'erreur
- 🆕 Conflit cinématique (deux moteurs incompatibles) : surlignage rouge des éléments conflictuels, panneau contextuel bascule sur onglet Analyse avec message explicatif



### À faire plus tard

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
- 🆕 Cacher les joins qui ne sont connectés qu'à un segment
- 🆕 Afficher des syboles au hover des numberInput start, end, longueur et angle
- 🆕 Afficher des syboles au hover des connexion (ex. beam end = anneau)
- 🔨 Hover une probe devrait hover l'élément aussi
- 🆕 Sélectionner les dimensions (sur la flèche)
- 🤔 Caméra qui suit le mécanisme en simulation ?
- 🤔 Ajouter un mode d'édition pour déconnecter les éléments (ce qu'on ne peut faire actuellement que par le panneau contextuel) ?

- 🔨 Afficher le point de contact pour placingGearRadius sur belt
- ❇️ Wrap VS windings ?

**Panneaux et UI**

- 🔨 OnCanvasValueEditor trop large avec des points "."
- 🆕 Afficher le ratio avec une autre gear dans les connections de l'élément
- 🔨 Donner des couleurs aux tags
- 🔨 Ajouter un tag "exemple"
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
- 🔨 Force ref : ajouter gear en plus des edges

**Contraintes et dimensions**

- 🔨 Polish de dimensionAngle: arrondir les angles de 0° / 180°, traits extérieurs pour les petits angles
- 🔨 Le dessin preview de DimensionAngle devrait tendre vers l'angle le plus petit

**Preview de hover**

- 🤔 Ce n'est pas toujours clair quand un élément est placé ou en train d'être placé : transparence de l'élément en train d'être placé ?
- 🤔 Preview des éléments déconnectés au hover de déconnexion (après le chantier courroie : réutiliser le mécanisme d'état visé porté par le canvasState et retiré du tracé de preview)
- 🤔 Preview de la courroie explusée d'un gear ?
- 🔨 Le hover d'un edge lors du placement d'un objet sur une de ses extrémités devrait mettre en évidence tout l'edge

**Sélection multiple**

- 🚨 Shift + Click sur l'unique élément sélectionné ne le désélectionne pas
- 🆕 Ajouter le copié-collé
- 🤔 Symétrie / Rotation / Scale d'éléments multiples.
- 🤔 Click droit sur le canvas devrait proposer des choses (undo/redo, copy/paste, recentrer, etc.) (et sur un élément : activer/désactiver les collisions, supprimer, ajouter des mesures, etc.)
- 🚨 Le déplacement d'une sélection multiple devrait conserver les positions relatives des éléments déplacés
- 🔨 Le déplacement d'une sélection multiple doit snap à la grille

**Panneaux et UI**

- 🆕 Changer le nom de l'onglet du browser en "Mon mécanisme - Slidep"
- ❇️ Unifier les tailles des éléments UI
- ❇️ S'assurer que la police est toujours la même
- 🆕 Se déplacer dans le temps de la simu avec les flèches du clavier
- 🆕 Afficher les couleurs des thèmes dans le menu paramètres
- 🆕 Ajouter un paramètre pour cacher les unités de la grille

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

---

### Pistes d'amélioration

**Questions demandées**
Pour répondre aux questions qui suivent, définir l'objectif et la vision de l'application.

- 🤔 Définir l'ordre des grands chantiers. Priorités exprimées par les testeurs : partage/collaboration, robotique et automatisation (voir ThinkerCAD), puis 3D
- 🤔 Mettre en place un versionning ?
- 🤔 Comment connecter ou non des engrenages sur le même axe ?
- 🚨 Masse sur plan incliné : difficile à placer et mauvais résultats
- 🤔 Revenir sur l'idée de pouvoir modifier le mécanisme en cours de simulation (ex. déconnecter 2 éléments, ou contraintes) ?
- 🆕 Pouvoir appliquer une fonction / commande au moteur pendant la simulation
- 🆕 Case à cocher pour ignorer masses et frottements
- 🤔 Ajouter un élément depuis les connexions du panneau latéral ?
- Pistes d'amélioration exprimées par des utilisateurs:
  - 🤔 Formes pleines
  - 🤔 Placer des forces normales au plan 2D
  - 🤔 Déformée de plaques planes

### [ Simulation STATIQUE ]

- 🆕 Solver Statique algébrique (résolution d'inconnues)
- 🆕 Déformée des poutres
- 🤔 Modification topologie en simulation : pause auto + bascule temporaire Édition, ou alors : statique = édition -> feedback instantané ?

### [ Slidep 3D ]

- 🔨 Combiner les alignements (ex: sur corps + parallèle)
- 🔨 Après s'être aligné sur une direction, "attendre" la première sélection avant de "bloquer" le plan
- 🔨 Rendre plus clair pourquoi l'alignement se fait dans le plan le plus proche de l'orientation de la caméra
- 🔨 Rendre les hitbox exactes
- 🔨 Afficher un repère d'origine plus propre que le plan horizontal infini
- 🤔 Créer un objet "plan" ?
- 🤔 Différencier poutres et traits de construction
- 🆕 Une indication d'onboarding sur les touches de la navigation 3D
- 🆕 Ajouter les noeuds "pivot glissant", "rotule", "rotule à doigt", "cardan", "linéaire annulaire", "hélicoïdale"

### [ Partage et collaboration ]

- 🆕 Bibliothèque communautaire
- 🆕 Édition collaborative

### [ Robotique ]

- 🆕 Cinématique inverse (contrôle par position de l'outil)
- 🆕 Visualisation de l'espace de travail (zones atteignables)
- 🆕 Planification de trajectoire

### [ Automatisation ]

- 🆕 Blocs de régulation (PID, Tout-Ou-Rien)
- 🆕 Capteurs de fin de course et de distance
- 🆕 Blocs logiques (ET, OU, Temporiseurs) pour créer des séquences automatiques

### [ Préparer pour les contributions ]

- 🆕 README.md
- 🆕 Documentation
- 🆕 Design guidelines
