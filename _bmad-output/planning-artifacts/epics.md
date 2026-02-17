---
stepsCompleted: ["validate-prerequisites", "design-epics"]
inputDocuments:
  [
    "_bmad-output/planning-artifacts/prd.md",
    "_bmad-output/planning-artifacts/architecture.md",
    "_bmad-output/planning-artifacts/ux-design-specification.md",
    "_bmad-output/planning-artifacts/mechanical-elements-description.md",
  ]
---

# slidep - Epic Breakdown

## Aperçu

Ce document fournit la décomposition complète des épopées et des histoires pour slidep, en décomposant les exigences du PRD, de la conception UX, et des exigences d'architecture en histoires implémentables, en intégrant les interactions mécaniques mises à jour.

## Requirements Inventory

### Functional Requirements

FR1: Les utilisateurs peuvent créer des éléments mécaniques de base (Edge: Beam, Belt, Spring, Damper; Node: Slider, Pivot, Join, Gear, Mass)
FR2: Les utilisateurs peuvent sélectionner et modifier des éléments existants
FR3: Les utilisateurs peuvent supprimer des éléments du mécanisme
FR4: Les utilisateurs peuvent grouper des éléments en composants
FR5: Les utilisateurs peuvent sauvegarder leurs mécanismes localement
FR6: Les utilisateurs peuvent charger des mécanismes sauvegardés précédemment
FR7: Les utilisateurs peuvent lancer une simulation sur un mécanisme
FR8: Les utilisateurs peuvent arrêter et reprendre une simulation
FR9: Les utilisateurs peuvent ajuster la vitesse de simulation
FR10: Les utilisateurs peuvent visualiser les trajectoires de mouvement des éléments
FR11: Les utilisateurs peuvent identifier les points de blocage dans le mouvement
FR12: Les utilisateurs peuvent analyser les contraintes statiques d'un mécanisme
FR13: Les utilisateurs peuvent visualiser les forces et moments appliqués
FR14: Les utilisateurs peuvent identifier les degrés de liberté du mécanisme
FR15: Les utilisateurs peuvent détecter les sur-contraintes dans le système
FR16: Les utilisateurs peuvent accéder à tous les outils via une interface intuitive
FR17: Les utilisateurs peuvent naviguer dans l'espace de dessin (zoom, pan)
FR18: Les utilisateurs peuvent utiliser l'application sur desktop et mobile
FR19: Les utilisateurs peuvent accéder à l'aide contextuelle
FR20: Les utilisateurs peuvent personnaliser les paramètres d'affichage
FR21: Les utilisateurs peuvent exporter leurs mécanismes dans un format slidep
FR22: Les utilisateurs peuvent importer des mécanismes depuis le format slidep
FR23: Les utilisateurs peuvent organiser leurs projets dans des dossiers
FR24: Les utilisateurs peuvent rechercher dans leurs mécanismes sauvegardés
FR25: Les utilisateurs peuvent partager leurs mécanismes publiquement
FR26: Les utilisateurs peuvent explorer les mécanismes partagés par la communauté
FR27: Les contributeurs peuvent proposer des améliorations au code source
FR28: Les utilisateurs peuvent commenter et noter les mécanismes partagés
FR29: Les utilisateurs peuvent créer un profil personnel
FR30: Les utilisateurs peuvent suivre leurs statistiques d'utilisation
FR31: Les contributeurs peuvent accéder au repository du projet
FR32: Les utilisateurs peuvent signaler des problèmes techniques

### NonFunctional Requirements

NFR1: Simulations : 60 FPS minimum pour interactions fluides en temps réel
NFR2: Chargement initial : <3 secondes sur connexion 3G
NFR3: Calculs physiques : Mise à jour instantanée des contraintes sans lag perceptible
NFR4: Gestion mémoire : Support pour mécanismes complexes sans dégradation
NFR5: Conformité WCAG : Niveau AA pour fonctionnalités core
NFR6: Navigation clavier : Complète pour tous les outils
NFR7: Lecteurs d'écran : Support complet avec labels appropriés
NFR8: Contraste : Ratios conformes pour lisibilité
NFR9: Focus visible : Indicateurs clairs pour navigation
NFR10: Disponibilité : 99.9% uptime pour accès continu
NFR11: Persistance des données : Sauvegarde automatique locale sans perte
NFR12: Gestion d'erreurs : Récupération gracieuse sans crash
NFR13: Compatibilité navigateurs : Tests automatisés pour stabilité

### Exigences supplémentaires

- Modèle de démarrage : Vite + React + TypeScript
- Gestion d'état : Zustand pour l'état complexe des simulations
- Persistance : LocalStorage pour la sauvegarde locale des projets
- Style : MUI comme système de design avec thème personnalisé
- Déploiement : GitHub Pages avec GitHub Actions
- Structure de données : `id`, `type`, `isSelected`, `createdAt`, `updatedAt`, `positionStart`, `positionEnd` (Edges) / `position` (Nodes)
- Interactions : Ghost Preview pendant le placement, Fusion Slider+Pivot = Slidep, Connexion auto sur Beam.

### Carte de couverture des FR

FR1: Épopée 1 - Création d'éléments mécaniques de base
FR2: Épopée 1 - Sélection et modification d'éléments
FR3: Épopée 1 - Suppression d'éléments
FR4: Épopée 1 - Groupement en composants
FR5: Épopée 1 - Sauvegarde locale
FR6: Épopée 1 - Chargement de mécanismes sauvegardés
FR7: Épopée 2 - Lancement de simulation
FR8: Épopée 2 - Contrôle arrêt/reprise simulation
FR9: Épopée 2 - Ajustement vitesse simulation
FR10: Épopée 2 - Visualisation trajectoires mouvement
FR11: Épopée 2 - Identification points blocage
FR12: Épopée 2 - Analyse contraintes statiques
FR13: Épopée 2 - Visualisation forces et moments
FR14: Épopée 2 - Identification degrés liberté
FR15: Épopée 2 - Détection sur-contraintes
FR16: Épopée 1 - Accès outils via interface intuitive
FR17: Épopée 1 - Navigation espace dessin (zoom, pan)
FR18: Épopée 3 - Utilisation desktop et mobile
FR19: Épopée 3 - Accès aide contextuelle
FR20: Épopée 3 - Personnalisation paramètres affichage
FR21: Épopée 4 - Export format slidep
FR22: Épopée 4 - Import format slidep
FR23: Épopée 4 - Organisation projets en dossiers
FR24: Épopée 4 - Recherche mécanismes sauvegardés
FR25: Épopée 5 - Partage public mécanismes
FR26: Épopée 5 - Exploration mécanismes communautaires
FR27: Épopée 5 - Proposition améliorations code source
FR28: Épopée 5 - Commentaires et notation mécanismes
FR29: Épopée 5 - Création profil personnel
FR30: Épopée 5 - Suivi statistiques utilisation
FR31: Épopée 5 - Accès repository projet
FR32: Épopée 5 - Signalement problèmes techniques

## Liste des Épopées

### Épopée 0: Configuration du Projet

Mettre en place l'environnement de développement initial avec le starter template et les dépendances de base.

**FRs couverts:** Aucun (prérequis technique)

### Histoire 0.1: Initialiser le projet avec Vite + React + TypeScript

En tant que développeur,
Je veux initialiser le projet avec le modèle de démarrage recommandé,
Afin d'avoir une base solide pour développer l'application.

**Critères d'acceptation:**

- Le projet est créé avec la structure Vite + React + TypeScript.
- Les dépendances de base sont installées.
- Le serveur de développement démarre avec `npm run dev`.

### Histoire 0.2: Installer les dépendances architecturales

En tant que développeur,
Je veux installer Zustand, MUI et autres bibliothèques architecturales,
Afin que l'architecture soit prête pour l'implémentation.

**Critères d'acceptation:**

- Zustand et MUI sont installés sans conflits.
- Les types TypeScript sont disponibles.
- Le projet compile sans erreurs.

### Épopée 1: Fondation de Conception Mécanique

Les utilisateurs peuvent créer et éditer des mécanismes mécaniques de base sur un canevas interactif en suivant les règles de types Edge et Node.
**FR couverts:** FR1, FR2, FR3, FR4, FR5, FR6, FR16, FR17

### Histoire 1.1: Créer des éléments de type Edge (Beam, Spring, Damper) ✅

En tant qu'utilisateur,
Je veux placer des éléments Edge en deux étapes (extrémités),
Afin de définir la structure de mon mécanisme.

_Référence : [mechanical-elements-description.md](_bmad-output/planning-artifacts/mechanical-elements-description.md)_

**Critères d'acceptation:**

- **Étant donné** l'outil Beam, Spring ou Damper sélectionné.
- **Quand** je clique pour définir la première extrémité, puis la seconde.
- **Alors** l'élément est créé entre les deux points.
- **Et** si une extrémité est dans la hit-box d'un Node existant, la connexion est automatique.
- **Et** pour un Beam, si un Node est sur sa longueur lors du placement, il est connecté automatiquement.

### Histoire 1.2: Créer des éléments de type Node (Slider, Pivot, Mass, Gear) ✅

En tant qu'utilisateur,
Je veux placer des éléments Node par un simple clic,
Afin d'ajouter des composants fonctionnels ou des masses.

_Référence : [mechanical-elements-description.md](_bmad-output/planning-artifacts/mechanical-elements-description.md)_

**Critères d'acceptation:**

- **Étant donné** un outil Node sélectionné.
- **Quand** je clique sur le canevas.
- **Alors** l'élément est placé à la position du curseur.
- **Et** si placé sur une extrémité d'Edge ou la longueur d'un Beam, la connexion est automatique.
- **Et** si un Slider est placé sur un Pivot (ou vice-versa), ils fusionnent en un **Slidep**.
- **Et** pour un Gear, le placement se fait en deux étapes : centre puis rayon/dents.

### Histoire 1.3: Manipulation et Déplacement des éléments 🔄

En tant qu'utilisateur,
Je veux déplacer les éléments selon leur type (Edge ou Node),
Afin d'ajuster mon design intuitivement.

_Référence : [mechanical-elements-description.md](_bmad-output/planning-artifacts/mechanical-elements-description.md)_

**Critères d'acceptation:**

- **Étant donné** un Edge (ex: Beam).
- **Quand** je le drag par sa longueur.
- **Alors** il se déplace en gardant son angle et sa longueur (translation).
- **Quand** je le drag par une extrémité.
- **Alors** seule cette extrémité bouge, modifiant longueur et angle.
- **Étant donné** un Node.
- **Quand** je le drag.
- **Alors** il se déplace et les Edges connectés suivent les contraintes.

### Histoire 1.4: Gestion des connexions automatiques et Joints ❌

En tant qu'utilisateur,
Je veux que les connexions se fassent naturellement lors du dessin,
Afin de ne pas avoir à configurer manuellement chaque lien.

_Référence : [mechanical-elements-description.md](_bmad-output/planning-artifacts/mechanical-elements-description.md)_

**Critères d'acceptation:**

**Définition des connexions symétriques :** Une connexion est symétrique quand les deux éléments se référencent mutuellement dans leurs propriétés de connexion (ex: quand on pose un pivot sur une poutre, le pivot ajoute la poutre à ses `rotatingEdges` et la poutre ajoute le pivot à ses `fixedNodes`).

#### Sous-tâche Beam

- **Étant donné** un Beam en cours de placement.
- **Quand** je place la seconde extrémité sur un Node existant.
- **Alors** la connexion automatique se fait (le Node est ajouté aux `fixedNodes` du Beam, et le Beam est ajouté aux propriétés appropriées du Node).
- **Quand** je place la seconde extrémité et qu'un Node se trouve sur la longueur du Beam.
- **Alors** il se connecte automatiquement au Beam (même logique de références croisées).
- **Et** les connexions sont symétriques (chaque élément référence l'autre dans ses propriétés de connexion).

#### Sous-tâche Slider

- **Étant donné** un Slider en cours de placement.
- **Quand** je le place sur la longueur d'un Beam.
- **Alors** il se connecte automatiquement.
- **Quand** je le place sur une extrémité de Beam.
- **Alors** il est fixé rigidement.
- **Quand** je le place sur un Pivot.
- **Alors** ils fusionnent en Slidep.
- **Et** les connexions sont symétriques.

#### Sous-tâche Pivot

- **Étant donné** un Pivot en cours de placement.
- **Quand** je le place sur un Edge.
- **Alors** il se fixe automatiquement (le Pivot ajoute l'Edge à ses `rotatingEdges`, et l'Edge ajoute le Pivot à ses `fixedNodes`).
- **Quand** je le place sur un Slider.
- **Alors** ils fusionnent en Slidep.
- **Et** les connexions sont symétriques (chaque élément référence l'autre dans ses propriétés de connexion).

#### Sous-tâche Slidep

- **Étant donné** un Slidep (fusion uniquement).
- **Alors** les connexions héritent des règles Slider+Pivot.
- **Et** les connexions sont symétriques.

#### Sous-tâche Ground

- **Étant donné** l'outil Ground.
- **Quand** je clique sur un Node.
- **Alors** isGrounded = true.
- **Quand** je clique sur un Edge.
- **Alors** un Join mis à terre est créé automatiquement.
- **Et** les connexions sont symétriques.

#### Sous-tâche Join

- **Étant donné** deux Edges dont les extrémités se superposent.
- **Quand** je relâche le clic.
- **Alors** un Join est créé automatiquement.
- **Étant donné** un Node à l'intersection de deux Beams.
- **Alors** il se lie aux deux Beams simultanément.
- **Et** les connexions sont symétriques.

#### Sous-tâche Gear

- **Étant donné** un Gear en cours de placement.
- **Quand** je place son centre puis règle le rayon contre un autre Gear ou Belt.
- **Alors** la liaison se fait automatiquement.
- **Et** les connexions sont symétriques.

#### Sous-tâche Belt

- **Étant donné** une Belt en cours de placement.
- **Quand** je place les extrémités et sélectionne les Gears à relier.
- **Alors** les connexions se font automatiquement.
- **Et** les connexions sont symétriques.

#### Sous-tâche Spring

- **Étant donné** un Spring (règles Edge standard).
- **Alors** pas de connexions spéciales.
- **Et** les connexions sont symétriques.

#### Sous-tâche Damper

- **Étant donné** un Damper (règles Edge standard).
- **Alors** pas de connexions spéciales.
- **Et** les connexions sont symétriques.

#### Sous-tâche Mass

- **Étant donné** une Mass (règles Node standard).
- **Alors** pas de connexions spéciales.
- **Et** les connexions sont symétriques.

#### Sous-tâche Drag

- **Étant donné** un élément en cours de déplacement (drag).
- **Quand** je le relâche sur un autre élément.
- **Alors** la même logique de connexion que lors du placement s'applique (ex: drag Pivot sur Beam → connexion automatique, drag Slider sur Pivot → fusion Slidep).

### Histoire 1.5: Application du paramètre Ground (Terre) ✅

En tant qu'utilisateur,
Je veux fixer des éléments au référentiel fixe,
Afin de stabiliser mon mécanisme.

_Référence : [mechanical-elements-description.md](_bmad-output/planning-artifacts/mechanical-elements-description.md)_

**Critères d'acceptation:**

- **Étant donné** l'outil Ground.
- **Quand** je clique sur un Node.
- **Alors** sa position et son angle sont bloqués (`isGrounded: true`).
- **Quand** je clique sur un Edge.
- **Alors** un Join mis à la terre est créé automatiquement à cet endroit.

### Histoire 1.6: Sélection, Modification et Suppression ✅

En tant qu'utilisateur,
Je veux gérer le cycle de vie de mes éléments,
Afin d'itérer sur mon design.

_Référence : [mechanical-elements-description.md](_bmad-output/planning-artifacts/mechanical-elements-description.md)_

**Critères d'acceptation:**

- La sélection individuelle ou groupée affiche les propriétés dans le panneau latéral.
- La suppression d'un élément retire également ses connexions orphelines.
- Les modifications de propriétés (ex: raideur k, masse m) sont prises en compte immédiatement.

### Histoire 1.7: Outils de Cotation et Dimensions (UX)

En tant qu'utilisateur,
Je veux définir des dimensions précises pour mes éléments,
Afin de créer des mécanismes rigoureux conformes à mes besoins techniques.

_Référence : [mechanical-elements-description.md](_bmad-output/planning-artifacts/mechanical-elements-description.md)_

**Critères d'acceptation:**

- **Étant donné** l'outil "Dimension" (Cotation) sélectionné.
- **Quand** je clique sur un Edge ou entre deux Nodes.
- **Alors** une ligne de cote apparaît et permet de saisir une valeur numérique fixe.
- **Et** la longueur de l'élément ou la distance entre les nodes est verrouillée à cette valeur.

### Histoire 1.8: Outils de Contraintes Géométriques (UX)

En tant qu'utilisateur,
Je veux appliquer des relations logiques entre les éléments via des outils dédiés (type CAO),
Afin de structurer mon mécanisme sans calculs manuels.

_Référence : [mechanical-elements-description.md](_bmad-output/planning-artifacts/mechanical-elements-description.md)_

**Critères d'acceptation:**

- **Étant donné** les boutons d'outils de contrainte individuels (Parallélisme, Perpendicularité, Égalité, Alignement).
- **Quand** je sélectionne un outil (ex: Parallélisme) puis deux Edges.
- **Alors** la contrainte est appliquée et maintenue lors des déplacements.
- **Et** une icône sémantique spécifique à la contrainte est affichée sur les éléments concernés.
- **Et** l'outil "Alignement" permet de forcer des Nodes à rester sur une même ligne ou un même axe.

### Histoire 1.9: Système de Déplacement - Phase 1 : Propagation (BFS)

En tant qu'utilisateur,
Je veux que les éléments connectés suivent le mouvement de l'élément que je déplace,
Afin de maintenir l'intégrité structurelle simple de mon mécanisme pendant l'édition.

_Référence : [mechanical-elements-description.md](_bmad-output/planning-artifacts/mechanical-elements-description.md)_

**Critères d'acceptation:**

- **Étant donné** un élément (Node ou Edge) en cours de déplacement.
- **Quand** je le déplace sur le canevas.
- **Alors** un parcours en largeur (BFS) propage le mouvement aux voisins directs.
- **Et** les Beams maintiennent leur longueur par projection géométrique simple.
- **Et** les Sliders sont contraints sur l'axe de leur Beam parente.
- **Et** les éléments `isGrounded` bloquent la propagation du mouvement.

### Histoire 1.10: Système de Déplacement - Phase 2 : Relaxation (PBD Lite)

En tant qu'utilisateur,
Je veux que les mécanismes complexes (boucles fermées, treillis) restent cohérents lors du déplacement,
Afin d'éviter les déconnexions visuelles dans les structures hyperstatiques.

_Référence : [mechanical-elements-description.md](_bmad-output/planning-artifacts/mechanical-elements-description.md)_

**Critères d'acceptation:**

- **Étant donné** un mécanisme comportant des cycles (boucles fermées).
- **Quand** la propagation initiale (BFS) laisse des incohérences de distance.
- **Alors** un algorithme de relaxation (PBD Lite) effectue 2 à 5 itérations de correction.
- **Et** les contraintes de distance et de coïncidence sont satisfaites.
- **Et** l'élément sous le curseur (Source) et les éléments Ground conservent une masse infinie (immobiles).

### Histoire 1.11: Sauvegarde et Navigation

En tant qu'utilisateur,
Je veux naviguer dans mon espace de travail et conserver mes créations,
Afin de travailler sur des projets complexes.

_Référence : [mechanical-elements-description.md](_bmad-output/planning-artifacts/mechanical-elements-description.md)_

**Critères d'acceptation:**

- Le zoom (molette) et le pan (clic-droit/drag) sont fluides.
- La sauvegarde automatique vers LocalStorage est active.
- L'import/export au format `.slidep` (JSON) fonctionne sans perte de données.

### Histoire 1.12: Harmoniser le style visuel Canvas

En tant que développeur UI Canvas,
Je veux appliquer la procédure décrite dans [procedure_visual_changes.md](procedure_visual_changes.md)
Afin d'offrir un rendu cohérent entre les anciennes et nouvelles fonctions de dessin.

_Référence : [mechanical-elements-description.md](_bmad-output/planning-artifacts/mechanical-elements-description.md)_

**Critères d'acceptation:**

- **Étant donné** la procédure détaillée, **Quand** j'analyse les fonctions `draw_external.ts`, **Alors** je cartographie chaque appel Canvas, constante de couleur/épaisseur et transformation vers les abstractions modulaires utilisées dans `drawing-functions.ts`.
- **Quand** j'adapte la structure modulable, **Alors** les couleurs proviennent de `COLORS`, les largeurs de `STROKE_WIDTHS`, les dimensions de `ELEMENT_DIMENSIONS`, et toute nouvelle constante nécessaire est ajoutée dans les fichiers de specs appropriés.
- **Quand** j'actualise `drawBeam`, **Alors** la double-trait (bordure + remplissage) et `ctx.lineCap = "square"` reflètent fidèlement la version historique.
- **Quand** j'actualise `drawPivot`, **Alors** les deux cercles concentriques gèrent les états `fill` et `transparent` avec les couleurs équivalentes `MY_ORANGE` / `MY_BLUE` / fond.
- **Quand** j'actualise `drawSlider` et `drawSlidep`, **Alors** les rectangles arrondis, rotations et tracés `overDirs` reproduisent les interactions décrites tout en respectant `DrawingOptions`.
- **Quand** je synchronise `drawGroundSymbol`, **Alors** la ligne verticale, les hachures et l'orientation suivent `draw_ground`.
- **Quand** j'intègre les cotations, **Alors** de nouvelles fonctions (dimension linéaire, décalée, angulaire) sont ajoutées et invoquées dans le flux de dessin pour couvrir les usages décrits.

### Épopée 2: Simulation Dynamique

Les utilisateurs peuvent lancer et contrôler des simulations de leurs mécanismes, visualisant mouvements et contraintes en temps réel.
**FR couverts:** FR7, FR8, FR9, FR10, FR11, FR12, FR13, FR14, FR15

### Histoire 2.1: Moteur de Simulation Temps Réel (60 FPS)

En tant qu'utilisateur,
Je veux voir mon mécanisme s'animer selon les lois de la physique,
Afin de valider mon concept.

**Critères d'acceptation:**

- La simulation tourne à 60 FPS.
- Les Beams gardent une longueur fixe.
- Les Sliders glissent le long de leur Beam parent et sont bloqués aux extrémités.
- Les Gears tournent selon leur rapport de dents.
- Les Belts restent tendues et transmettent le mouvement entre Gears.

### Histoire 2.2: Visualisation des Contraintes et Trajectoires

En tant qu'utilisateur,
Je veux identifier visuellement les efforts et les chemins parcourus,
Afin d'optimiser mon mécanisme.

**Critères d'acceptation:**

- Les forces et moments sont affichés (vecteurs/arcs).
- Les trajectoires peuvent être activées pour chaque Node.
- Les points de blocage (mécanisme bloqué) sont mis en évidence en rouge.

### Épopée 3: Interface Avancée et Accessibilité

Les utilisateurs peuvent naviguer, personnaliser et accéder à l'aide avec support complet d'accessibilité.
**FR couverts:** FR18, FR19, FR20

### Histoire 3.1: Responsive Design et Touch

En tant qu'utilisateur mobile/tablette,
Je veux manipuler mes mécanismes au doigt,
Afin de concevoir partout.

**Critères d'acceptation:**

- Support du pinch-to-zoom.
- Cibles tactiles de 44px minimum.
- L'interface s'adapte (stack vertical) sur mobile.

### Épopée 4: Gestion des Données et Organisation

Les utilisateurs peuvent sauvegarder, charger, exporter et organiser leurs mécanismes.
**FR couverts:** FR21, FR22, FR23, FR24

### Épopée 5: Fonctionnalités Communautaires

Les utilisateurs peuvent partager, explorer et interagir avec les mécanismes communautaires.
**FR couverts:** FR25, FR26, FR27, FR28, FR29, FR30, FR31, FR32
