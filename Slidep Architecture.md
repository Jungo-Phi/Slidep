# Slidep : Architecture Produit & Spécifications UX

## 1. Vision et Identité

**Slidep** est une application web de conception mécanique (SPA) qui démocratise la simulation physique en fusionnant le croquis intuitif et l'analyse technique en temps réel.

- **Objectif :** Permettre à tout utilisateur (ingénieur, étudiant, créatif) de transformer une idée en mécanisme fonctionnel et simulé en moins de 2 minutes.
- **Philosophie :** "Dessiner, c'est déjà simuler". L'outil privilégie l'intuition, le ressenti physique immédiat et l'itération rapide plutôt que sur la précision d'outils professionnels type CAO ou FEM.
- **Cible :** Ingénieurs en phase d'idéation, étudiants en mécanique, makers et enseignants.
- **Modèle :** Open-source, gratuit, hébergé localement (calculs côté client), fonctionnant hors-ligne.

---

## 2. Architecture Technique : Les 4 Modes et Solvers

Slidep repose sur une architecture modulaire où chaque mode opérationnel utilise un moteur mathématique dédié pour garantir précision et performance.

| Mode               | Moteur (Solver)                   | Objectif Principal                     | Comportement Clé                                                                                                                                 |
| :----------------- | :-------------------------------- | :------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Édition**     | **Géométrique**                   | Construction de la topologie.          | Dessin rigide, contraintes de position strictes. Pas de physique (gravité/masses ignorées). Définition des hypothèses (masses, moteurs).         |
| **2. Cinématique** | **Cinématique**                   | Analyse du mouvement pur.              | Pas de temps, pas de forces. Calcul des trajectoires, vitesses et rapports de transmission. Détection des blocages géométriques.                 |
| **3. Dynamique**   | **PBD** (Position Based Dynamics) | Simulation physique réelle.            | Intègre le temps, la gravité, l'inertie, les chocs. Les entrées sont des forces/couples. Permet l'itération visuelle des efforts (MVP Statique). |
| **4. Statique**    | **Algébrique**                    | Calcul d'équilibre et dimensionnement. | Géométrie figée. Résolution automatique des inconnues ($\sum F=0$). Affichage précis des réactions aux appuis et efforts internes.               |

---

## 3. Workflow UX et Navigation Globale

L'interface est conçue pour minimiser la charge cognitive. La navigation entre les modes est fluide, et les comportements physiques sont strictement séparés pour éviter la confusion.

### A. La Top Bar (Barre Supérieure) : Le Cockpit de Navigation

La Top Bar est organisée en trois zones logiques pour séparer clairement la **gestion de fichier**, le **pilotage de la simulation** et les **outils d'interaction**. Elle suit un flux de travail naturel : de la gauche (Fichier/Contexte) vers la droite (Outils/Config).

#### Zone 1 : Projet & Fichier (Gauche)

_C'est la zone "Contexte et Données". Elle gère tout ce qui concerne la persistance et la navigation entre les projets._

- **Logo Slidep (Interactif)** :
  - **Comportement Visuel (Hover) :** Au survol de la souris, le logo se transforme brièvement en un mécanisme animé minimaliste (ex: engrenages qui tournent ou bielles qui oscillent) pendant 2-3 secondes, illustrant la nature dynamique de l'application. Retour au calme progressif au départ du curseur.
  - **Action au Clic** : Ouverture de la plateforme communautaire.
  - **Note Technique :** L'animation doit être légère (CSS ou SVG animé) pour ne jamais impacter la performance du canvas de simulation principal.
- **Menu "Fichier"** (Icône Dossier 📁) :
  - Point d'entrée unique pour la gestion documentaire.
  - **Contenu du menu :**
    - `Mes Mécanismes` : Ouvre la bibliothèque personnelle (liste des projets sauvegardés).
    - `Nouveau Projet` : Crée un canvas vide.
    - `Importer` : Charge un fichier (.slidep, .dxf, etc.).
    - `Exporter le mécanisme` : Sauvegarde locale (.slidep, .json).
    - `Exporter une animation` : Génère un fichier média (.gif, .mp4) de la simulation en cours (avec options de durée, FPS, zoom).
- **Nom du Projet + Pastille de Sauvegarde** :
  - Affiché juste à côté du menu Fichier pour un contexte immédiat.
  - **Indicateur pastille:**
    - 🟢 Vert : Sauvegardé localement.
    - ⟳ Spinner : Modifications en cours.
    - 🔴 Rouge : Erreur de persistance.

#### Zone 2 : Le Cockpit de Simulation (Centre)

_C'est la zone "Action et Temps". Elle est le cœur visuel de l'application et s'anime selon le mode actif._

- **Sélecteur de Mode** : Boutons segmentés `[Édition] [Statique] [Cinématique] [Dynamique]`.
- **Contrôles Temporels** :
  - Boutons : `|<` (Reset), `⏯` (Play/Pause - central et proéminent), `>|` (Fin).
  - Affichage : `t = 12.4 s`.
  - Timeline : Curseur horizontal pour naviguer manuellement dans le temps.
  - Vitesse (0.25x, 0.5x, 1x, 2x, 4x).
- **Réglages de Simulation** :
  - Toggles rapides (selon le mode) : `Gravité`, `Collisions`.

#### Zone 3 : Outils, Navigation & Historique (Droite)

_C'est la zone "Interaction et Configuration". Elle regroupe les outils de manipulation du canvas, l'historique et les paramètres globaux._

- **Bouton "Recentrer"** (Icône Cible `🎯` ou Maison `🏠`) :
  - Action : Reset immédiat de la caméra (Zoom 100%, Centré sur le mécanisme).
- **Historique** (Icônes `↩️` Annuler et `↪️` Rétablir)
- **Langues** (Icône Globe `🌐`)
- **Menu "Paramètres"** (Icône Engrenage `⚙️`) :
  - `Vue` (Aimanter à la grille, Afficher la grille, Afficher les contraintes (géométriques)).
  - `Thème` (Clair / Sombre / Auto).
  - `Style des éléments` (Fil de fer, Plein, Couleurs).
  - `Préférences` (Unités par défaut, précision du solver, raccourcis clavier).
- **Bouton "Info"** (Icône `i`) :
  - Ouvre une modale avec les crédits et les liens pour contribuer ou soutenir le projet.

---

### Résumé Visuel de la Top Bar

```text
[Logo] [📁 Fichier] [Nom Projet 🟢]       [MODE: DYNAMIQUE ⚠️] [⏯] [t=12s] [1x]       [# Vue] [🎯] [↩️] [↪️] [⚙️] [i]
     (Zone 1: Contexte)                            (Zone 2: Simulation)                  (Zone 3: Outils & Historique)
```

### B. La Barre d'Outils Gauche : La Palette de Création

- **Sections :**
  - **Interface** (Sélection, Gomme)
  - **Liaisons** (Glissière, Pivot, Courroie, Engrenage)
  - **Structure** (Join, Poutre, Sol)
  - **Dynamique** (Amortisseur, Ressort, Masse, Moteur)
  - **Contraintes** (Dimension, Ratio, Égale, Alignement, Perpendiculaire, Parallèle)
  - **Simulation** (Force, Force répartie, Moment, Balise)
- **Comportement Intelligent en Simulation :**
  - Les outils de **Simulation** (Forces, Moteurs) : Restent actifs pour permettre l'ajustement en temps réel sans pause.
  - Les autres outils : Leur clic déclenche une **Pause Automatique** et un retour temporaire en contexte "Édition" pour permettre la modification topologique en toute sécurité.

### C. Le Panneau Latéral Droit : Le Centre de Contrôle Contextuel

Un panneau unique à 4 onglets qui s'adapte dynamiquement au mode actif et à la sélection.

#### Onglet 1 : "Projet" (Vue Globale)

- **Affiché par défaut** si rien n'est sélectionné.
- **Contenu :** Métadonnées (Nom, Description, Auteur), Statistiques (Dates de Création et de Modification, Nb éléments).

#### Onglet 2 : "Élément"

- **Activation :** S'ouvre automatiquement lors de la sélection d'un élément dans le canvas.
- **Structure Contextuelle :**
  - **Section "Titre" :**
    - Affiche l'icon et le nom de l'élément (éditable) et un bouton supprimer.
  - **Section "Géométrie & Connexions" :**
    - Affiche la position, longueur, angle (éditable en Édition), en simulation : en grisé non éditable (Position au temps t de la simulation), affiche aussi la vitesse actuelle.
    - Liste des connexions (Éléments liés, possibilité de déconnecter en tout temps).
  - **Section "Propriétés Physiques" :**
    - Champs éditables (Masse, Raideur, Couple, Frottement).
    - **Hot-Reload :** Modification possible en temps réel pendant la simulation.
  - **Section "Visualisation" (Overlays Légers) :**
    - Toggles simples pour l'affichage temporaire sur le canvas (Forces, Vitesses, etc.).
  - **Section "Mesures & Graphiques" (Création de Balises) :**
    - Bouton d'action : `[+ Ajouter une mesure]`.
    - **Action :** Ouvre un sélecteur de métrique (Force, Vitesse, Position, Angle).
    - **Résultat :** Crée une **Balise** visible sur le canvas et ajoute un "Jetons" (Chips) actifs.
    - **Action :** Cliquer sur le ✕ supprime cette mesure spécifique. Si on supprime la dernière, la balise visuelle disparaît du canvas.

  Visuel :
  Titre : Mesures actives
  [📈 Vitesse ✕] [📈 Force ✕]
  Bouton : [+ Ajouter une mesure]

#### Onglet 3 : "Contraintes & Dimensions"

- **Contenu :** Liste toutes les **contraintes géométriques** (Relations de parallélisme, perpendicularité, égalité, coïncidence, etc.) et les **dimensions** (longueurs, angles, rayons) du mécanisme.
- **Édition :** Permet de modifier les valeurs des dimensions ou de supprimer des contraintes à tout moment.

#### Onglet 4 : "Analyse"

- **Infos générales :** (Énergie totale du système, bilan des forces externes)
- **Contrôles Globaux des Overlays :**
  - Deux boutons permettant d'Afficher / Cacher un type d'overlay sur tous les éléments.
  - **Types d'overlay :**
    - **Forces de Réaction** (flèches)
    - **Vitesses** (flèches)
    - **Contraintes** (Poutres colorées : Rouge=fort, Bleu=faible)
    - **Path** (Courbe colorée du chemin parcouru, dessiner sous les éléments du canvas)
- **Degrés de Liberté (DDL) :**
  - Indicateur global (ex: "DDL = 0 : Isostatique")
  - Décomposition par sous-systèmes indépendants.
  - Liste textuelle des libertés/blocages avec interaction (survol = surlignage canvas).
- **Gestion des Balises (Mesures Temporelles) :**
  - Deux boutons permettant d'Afficher / Cacher toutes les balises.
  - **Liste des Balises Actives :** Affiche les éléments placé via la barre d'outils où ceux où l'utilisateur a cliqué sur "Suivre cette valeur" dans l'onglet Élément.
  - **Configuration par Balise :**
    - Sélection de la métrique (Déplacement X/Y, Vitesse, Force, Contrainte).
    - Toggle d'affichage du graphique correspondant.
    - Toggle d'affichage de la sonde visuelle sur le canvas.
  - **Zone de Graphiques :**
    - Affichage superposé ou séparé des courbes (Valeur en fonction du Temps).
    - Options d'export des données (CSV) et de l'image du graphique.
  - **Précision Nomenclature :** Toute mention de "Contrainte" dans cet onglet est systématiquement accompagnée de l'unité **(MPa)** ou du qualificatif **"Matériau"** pour la distinguer des contraintes géométriques de l'onglet 3

---

## 4. Principes d'Interaction Clés

### Gestion des Transitions

On va généralement changer de mode (Édition, Statique, Cinématique, Dynamique) avec les boutons segmentés de la top bar. Quand on revient à l'édition, les pièces reprennent la position qu'elles avaient avant la simulation.

- **Clic sur la Barre d'outils pendant la Simulation :**
  - Modifier la **topologie** (ajouter/supprimer une poutre) $\rightarrow$ Pause automatique de la simulation + Bascule en contexte Édition.
  - Modifier les **paramètres** (changer un couple, une masse) $\rightarrow$ Application immédiate (Hot-Reload) sans pause, même en cours de simulation.
- **Feedback Visuel :** Lors d'une modification Hot-Reload, le champ concerné clignote brièvement (ex: bordure verte) pour confirmer la prise en compte par le solver.

### Gestion des Erreurs et Conflits

- **Instabilité Physique :** Si le solver PBD diverge (explosion du mécanisme), la simulation se met en pause automatiquement et une snackbar apparait pour indiquer l'erreur.
- **Conflit Cinématique :** Si deux moteurs imposent des mouvements incompatibles, le système surligne les éléments conflictuels en rouge, passe le panneau contextuel dans l'onglet "Analyse" et y affiche un message d'erreur explicatif.

---

## 5. Roadmap d'Implémentation

1.  **Phase 1 (MVP) :**
    - Édition et Solver Cinématique opérationnels.
    - Solver Dynamique (PBD) de base (gravité, collisions, moteurs simples).
    - Interface Top Bar avec contrôles temporels.
    - Panneau latéral adaptatif (Onglets : Projet, Élément, Contraintes).
    - Analyse DDL basique (indicateur global).
    - _Note :_ La statique peut est approchée par itération manuelle en mode Dynamique.

2.  **Phase 2 (Approfondissement) :**
    - Solver Statique algébrique (résolution d'inconnues).
    - Onglet "Analyse" avancé (détail des sous-systèmes).
    - Overlays visuels riches (vecteurs, cartes de contraintes).
