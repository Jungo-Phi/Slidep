---
stepsCompleted: [1, 2, 3, 4, 6, 7, 8, 9, 10, 11]
inputDocuments:
  [
    "_bmad-output/analysis/brainstorming-session-2026-01-09.md",
    "_bmad-output/planning-artifacts/mechanical-elements-description.md",
  ]
workflowType: "prd"
lastStep: 11
briefCount: 0
researchCount: 0
brainstormingCount: 1
projectDocsCount: 0
---

# Product Requirements Document - slidep

**Author:** humain
**Date:** 2026-01-10T10:31:04.218Z (Updated: 2026-01-12)

## Résumé Exécutif

Slidep est une web app de conception mécanique, fusionnant le croquis intuitif et la simulation dynamique en temps réel. Elle permet aux ingénieurs, étudiants et créatifs de transformer instantanément leurs idées en mécanismes interactifs, visualisant les contraintes et les mouvements pour itérer rapidement dans les premières phases de conception.

### Ce qui rend cela spécial

Slidep offre une liberté créative totale dans la conception de mécanismes, c'est une verion améliorée du dession sur papier avec une interaction immédiate et immersive. Les utilisateurs peuvent créer n'importe quel mécanisme simple en moins de deux minutes et observer instantanément les contraintes physiques et les mouvements générés. Le succès se mesurera par l'adoption habituelle de Slidep comme outil principal pour les schémas mécaniques, mesuré par des métriques d'engagement utilisateur.

## Classification du Projet

**Type Technique :** web_app
**Domaine :** scientific
**Complexité :** medium

## Critères de Succès

### Succès Utilisateur

Les utilisateurs peuvent créer n'importe quel mécanisme simple en moins de 2 minutes avec un retour visuel immédiat sur les contraintes et les mouvements. Le succès se mesure par un engagement élevé : temps passé sur la plateforme, nombre de fichiers créés, adoption habituelle et gains de temps dans la conception mécanique.

### Succès Business

Succès mesuré par l'adoption utilisateur élevée et l'engagement communautaire. Modèle de dons pour maintenir l'accessibilité gratuite. Métriques clés : croissance de la communauté, taux d'engagement, contributions volontaires.

### Succès Technique

Performance fluide pour les simulations en temps réel, calculs de contraintes fiables, et scalabilité pour les mécanismes complexes. Succès technique validé par la stabilité, la vitesse de réponse, et la capacité à gérer des simulations sophistiquées sans lag.

### Résultats Mesurables

- **Utilisateur :** >80% des utilisateurs créent leur premier mécanisme et le testent en <2 min ; temps moyen passé >10 min par session ; >50% d'utilisateurs reviennent régulièrement
- **Business :** 10,000+ utilisateurs actifs ; taux de rétention >70% ; dons suffisants pour couvrir les coûts opérationnels
- **Technique :** 99.9% disponibilité ; support pour mécanismes avec >100 éléments

## Portée du Produit

### MVP - Produit Minimum Viable

Dessin de base, simulation cinématique et statique, mécanismes simples avec éléments de base. Focus sur l'intuitivité et la rapidité de création.

### Fonctionnalités de Croissance (Post-MVP)

- Mécanismes complexes avec plus d'éléments
- Partage communautaire
- Outils d'analyse avancés
- Ajout d'outils de dessin et de construction
- Passage à la 3D
- Élargir le champ d'utilisation à la simulation de fluides ?

## Parcours Utilisateur

**Parcours 1 : Jean-Pierre Dubois - L'Ingénieur Mécanique Pressé**

Jean-Pierre est un ingénieur mécanique senior travaillant pour une entreprise de fabrication automobile. Il doit concevoir rapidement des prototypes de mécanismes pour des présentations clients, mais les outils CAO traditionnels sont trop lourds pour les phases d'idéation. Un collègue lui recommande Slidep lors d'une pause café.

Le lendemain, au lieu de passer 2 heures à configurer un logiciel CAO complexe, Jean-Pierre ouvre Slidep et dessine un mécanisme de suspension en 5 minutes. Il voit immédiatement les contraintes et les mouvements, ajustant les dimensions en temps réel. La présentation client est un succès - le prototype visuel convainc immédiatement.

Six mois plus tard, Jean-Pierre utilise Slidep pour toutes ses idées initiales, accélérant son workflow de 70%. Il contribue même des mécanismes à la communauté open-source de Slidep.

**Parcours 2 : Marie Leroy - L'Étudiante Curieuse**

Marie est étudiante en mécanique à l'université, passionnée par l'ingénierie mais souvent perdue dans les équations complexes. Elle découvre Slidep en cherchant des outils pédagogiques en ligne.

Au lieu de passer des heures sur des calculs manuels, Marie crée un mécanisme de pompe en 3 minutes et voit immédiatement pourquoi il ne fonctionne pas. Les visualisations intuitives l'aident à comprendre les principes physiques. Elle partage ses créations avec ses camarades de classe, créant un groupe d'étude actif.

Un an plus tard, Marie est devenue une référence pour ses projets innovants, utilisant Slidep pour explorer des idées folles sans crainte d'erreur coûteuse.

**Parcours 3 : Thomas Martin - Le Contributeur Open-Source**

Thomas est un développeur passionné par l'éducation et les outils open-source. Il découvre Slidep sur GitHub et décide de contribuer pour améliorer l'accessibilité de l'outil.

Après avoir exploré le code, Thomas ajoute une fonctionnalité de partage de mécanismes éducatifs. Il teste avec des étudiants, recueillant leurs retours pour améliorer l'interface. Ses contributions attirent d'autres développeurs, créant une communauté active.

Deux ans plus tard, Thomas coordonne la communauté open-source de Slidep, organisant des hackathons et des ateliers pour étendre les capacités de l'outil.

### Résumé des Exigences des Parcours

Ces parcours révèlent les capacités nécessaires :

- Création intuitive de mécanismes en <2 minutes
- Visualisation temps réel des contraintes et mouvements
- Partage communautaire et collaboration
- Accessibilité pour débutants et experts
- Support open-source pour contributions techniques

## Innovation & Nouveaux Modèles

### Domaines d'Innovation Détectés

Slidep innove principalement par son feedback instantané qui donne un "feeling" intuitif des mécanismes, permettant aux utilisateurs de ressentir physiquement le comportement des systèmes sans expertise avancée. Il démocratise l'accès à la simulation interactive. Et offre ainsi une nouvelle façon de travailler, en liant dans le même outil dessin et simulation avec un rendu visuel et tactile.

Plutôt que de remplacer les outils de CAO ou de FEM, Slidep se positionne comme un complément innovant qui rend la simulation accessible à un public plus large, combinant accessibilité avec puissance professionnelle.

### Contexte Marché & Paysage Concurrentiel

Les simulations FEM sont aujourd'hui principalement réservées aux experts avec logiciels coûteux. Slidep crée un segment intermédiaire : simulation intuitive accessible, permettant à amateurs et professionnels débutants d'explorer des mécanismes sans barrières techniques ou financières.

### Approche de Validation

Validation par ressenti utilisateur : enquêtes sur le "feeling" des mécanismes, tests d'utilisabilité pour mesurer l'intuition, comparaisons de temps d'apprentissage de l'outil Slidep pour des premières utilisations.

### Atténuation des Risques

Risque de sous-estimation par les experts. Mitigation : positionnement clair comme outil complémentaire, pas substitut, avec partenariats pour validation croisée.

## Modèle de Domaine : Éléments Mécaniques

### Types Fondamentaux

- **Edge (Lien) :** Défini par deux extrémités. Permet la connexion de nodes.
  - _Éléments :_ Beam (Poutre), Belt (Courroie), Spring (Ressort), Damper (Amortisseur).
  - _Spécificité Beam :_ Permet le placement de nodes sur toute sa longueur.
- **Node (Point/Composant) :** Défini par une position (et angle potentiel). Se place aux extrémités des edges ou sur les poutres.
  - _Éléments :_ Slider, Pivot, Slidep, Join (Joint), Gear (Engrenage), Mass (Masse).
- **Ground (Terre) :** Paramètre applicable à un élément pour bloquer sa position et son angle.

### Interactions et Comportements Core

| Élément    | Type | Comportement Placement                                                    | Comportement Déplacement                                                        | Simulation                                         |
| :--------- | :--- | :------------------------------------------------------------------------ | :------------------------------------------------------------------------------ | :------------------------------------------------- |
| **Beam**   | Edge | Connexion auto si node présent à l'extrémité ou sur la longueur.          | Déplacement global (garde angle/longueur) ou par extrémité (longueur variable). | Rigide. Supporte des nodes sur sa longueur.        |
| **Slider** | Node | Lié à une poutre si placé sur sa longueur. Fusionne avec Pivot en Slidep. | Déplacement linéaire le long de la poutre. Bloqué aux extrémités.               | Glisse le long du Beam.                            |
| **Pivot**  | Node | Fixé à un edge si placé dessus. Fusionne avec Slider en Slidep.           | Entraîne les éléments liés selon les contraintes.                               | Rotation libre des edges liés.                     |
| **Slidep** | Node | Résultat d'une fusion Slider + Pivot.                                     | Déplacement linéaire + rotation libre.                                          | Mixte Slider/Pivot.                                |
| **Join**   | Node | Créé auto lors de la superposition d'extrémités d'edges.                  | Déplacement coordonné des edges liés.                                           | Fixation rigide entre edges.                       |
| **Gear**   | Node | Placement centre puis rayon/dents. Liaison auto si tangent à Gear/Belt.   | Réglage rayon/dents ou déplacement centre.                                      | Transmission de mouvement par contact ou courroie. |
| **Belt**   | Edge | Sélection des engrenages à relier lors du placement.                      | Ajustement par les extrémités ou engrenages.                                    | Longueur fixe, reste tendue.                       |

## Exigences Spécifiques à l'Application Web

### Vue d'Ensemble du Type de Projet

Slidep est une Single Page Application (SPA) optimisée pour les interactions fluides et les simulations en temps réel. L'architecture privilégie les performances locales avec synchronisation communautaire optionnelle.

### Considérations d'Architecture Technique

Application monopage avec calculs de simulation côté client pour temps réel immédiat. Architecture modulaire permettant l'extension future vers fonctionnalités serveur (partage communautaire, sauvegarde cloud).

### Matrice des Navigateurs

- **Navigateurs principaux :** Chrome (dernières 2 versions), Firefox (dernières 2 versions), Safari (dernières 2 versions)
- **Navigateurs secondaires :** Edge (support de base)
- **Mobile :** Support iOS Safari et Chrome Android
- **Anciennes versions :** Non supportées - focus sur navigateurs modernes

### Design Réactif

- **Responsive design :** Interface adaptative pour desktop, tablette et mobile
- **Breakpoints :** Mobile (<768px), tablette (768-1024px), desktop (>1024px)
- **Touch interactions :** Support complet pour appareils tactiles
- **Orientation :** Support portrait et paysage

### Cibles de Performance

- **Chargement initial :** <3 secondes sur connexion 3G
- **Simulations temps réel :** 60 FPS minimum pour interactions fluides
- **Mémoire :** Optimisé pour mécanismes complexes sans crash
- **Offline :** Fonctionnement complet hors ligne (calculs locaux)

### Stratégie SEO

- **Priorité :** Faible pour MVP - focus sur découverte communautaire
- **Futur :** Meta tags dynamiques, URLs partageables pour mécanismes
- **Indexation :** Contenu généré dynamiquement non critique initialement

### Niveau d'Accessibilité

- **Conformité WCAG :** Niveau AA pour fonctionnalités core
- **Support clavier :** Navigation complète au clavier
- **Lecteurs d'écran :** Labels et descriptions appropriés
- **Contraste :** Ratios de contraste conformes
- **Focus visible :** Indicateurs de focus clairs

### Considérations d'Implémentation

Canvas HTML5 pour rendu graphique, WebGL pour performances 3D si nécessaire. Architecture modulaire pour extensions futures (partage, cloud). Tests automatisés pour compatibilité navigateurs.

## Définition de la Portée & Développement Phasé

### Stratégie MVP & Philosophie

**Approche MVP :** Hybride résolution de problème + plateforme - résoudre le besoin core de simulation intuitive tout en construisant une fondation extensible pour fonctionnalités communautaires futures. Démarrage en 2D pour rapidité, architecture préparée pour extension 3D.

**Exigences Ressources :** Équipe de 2-3 développeurs (frontend, backend optionnel), designer UX, testeur. Timeline MVP : 3-4 mois.

### Ensemble Fonctionnel MVP (Phase 1)

**Parcours Utilisateur Core Supportés :**

- Ingénieur mécanique : création rapide de mécanismes simples pour présentations
- Étudiante : apprentissage intuitif des principes physiques
- Contributeur : exploration du code pour contributions basiques

**Capacités Essentielles :**

- Dessin intuitif de mécanismes 2D (Edges et Nodes)
- Simulation statique/cinématique (mouvement et forces)
- Visualisation temps réel des contraintes
- Interface responsive pour desktop/mobile
- Fonctionnement hors ligne (calculs locaux)
- Architecture modulaire pour extension future (3D, partage)

### Fonctionnalités Post-MVP

**Phase 2 (Croissance) :**

- Extension 3D (si adoption validée)
- Mécanismes complexes
- Partage communautaire
- Sauvegarde locale des projets

**Phase 3 (Expansion) :**

- Plateforme communautaire complète
- Simulations physiques avancées
- Analyse de données de simulation
- Export d'animations et données

### Stratégie d'Atténuation des Risques

**Risques Techniques :** Complexité des calculs physiques et transition 2D→3D - mitigation par algorithmes éprouvés, architecture modulaire, tests de performance précoces.

**Risques Marché :** Adoption par communauté mécanique - mitigation par focus open-source et partenariats éducatifs.

**Risques Ressources :** MVP conçu pour ressources minimales, fonctionnalités prioritaires clairement définies.

## Exigences Fonctionnelles

### Création et Édition de Mécanismes

- **FR1: Création d'éléments mécaniques**
  - FR1.1: Création d'éléments de type **Edge** (Beam, Belt, Spring, Damper) en deux étapes (début/fin).
  - FR1.2: Création d'éléments de type **Node** (Slider, Pivot, Join, Gear, Mass) par positionnement simple ou sur élément existant.
  - FR1.3: Application du paramètre **Ground** sur les nodes pour fixer position/angle.
- **FR2: Connexions Automatiques**
  - FR2.1: Connexion automatique d'un Edge à un Node si l'extrémité est placée dans sa hit-box.
  - FR2.2: Connexion automatique d'un Node à un Edge (ou sur la longueur d'un Beam) lors du placement.
  - FR2.3: Fusion automatique Slider + Pivot en **Slidep**.
  - FR2.4: Création automatique d'un **Join** lors de la superposition d'extrémités d'edges.
- **FR3: Manipulation des Éléments**
  - FR3.1: Sélection d'éléments individuels ou groupés.
  - FR3.2: Déplacement d'un Edge par sa longueur (translation rigide).
  - FR3.3: Déplacement d'un Edge par une extrémité (modification de longueur/angle).
  - FR3.4: Déplacement d'un Node par drag-and-drop avec mise à jour des contraintes liées.
  - FR3.5: Suppression d'éléments.
- **FR4: Propriétés Physiques**
  - FR4.1: Définition des propriétés (masse, raideur k, amortissement b, nombre de dents/rayon pour Gear).
- **FR5: Gestion de Fichiers**
  - FR5.1: Sauvegarde locale des mécanismes.
  - FR5.2: Chargement de mécanismes sauvegardés.
  - FR5.3: Export/Import au format `.slidep`.

### Simulation

- FR7: Lancement de la simulation en temps réel (60 FPS).
- FR8: Arrêt et reprise de la simulation.
- FR9: Ajustement de la vitesse de simulation.
- FR10: Visualisation des trajectoires de mouvement.
- FR11: Identification visuelle des points de blocage.
- FR12: Analyse des contraintes statiques.
- FR13: Visualisation des forces et moments.
- FR14: Détection des degrés de liberté et sur-contraintes.

### Interface Utilisateur

- FR16: Interface intuitive avec barre de composants.
- FR17: Navigation (zoom, pan) fluide.
- FR18: Support Desktop et Mobile (Touch).
- FR19: Aide contextuelle sur les éléments.

### Fonctionnalités Communautaires (Post-MVP)

- FR25: Partage public des mécanismes.
- FR26: Exploration et notation des mécanismes communautaires.

## Exigences Non-Fonctionnelles

### Performance

- Simulations : 60 FPS minimum pour interactions fluides en temps réel.
- Chargement initial : <3 secondes sur connexion 3G.
- Calculs physiques : Mise à jour instantanée (<16ms) des contraintes.
- Gestion mémoire : Support pour mécanismes avec >100 éléments sans dégradation.

### Accessibilité

- Conformité WCAG : Niveau AA pour fonctionnalités core.
- Navigation clavier : Complète pour tous les outils.
- Lecteurs d'écran : Support complet avec labels appropriés.
- Contraste : Ratios conformes pour lisibilité.

### Fiabilité

- Disponibilité : 99.9% uptime.
- Persistance : Sauvegarde automatique locale.
- Gestion d'erreurs : Récupération gracieuse sans crash de l'onglet.
