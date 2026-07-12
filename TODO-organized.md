# TODO — trié par catégorie, priorité & simplicité

> Deux axes indépendants :
>
> - **Priorité** : 🔴 Haute · 🟡 Moyenne · 🟢 Basse
> - **Simplicité** : ⚡ Rapide · 🔨 Moyen · 🏗️ Gros chantier
>
> Les 3 catégories en focus (🎯) sont remontées en tête : **Courroies & engrenages**, **Stabilité/bugs**, **Contraintes & solveur DDL**.
> Colonne « ? » = point à clarifier avant de coder.

---

## ⭐ Quick wins (haute priorité + rapide) — à faire en premier

| Tâche                                                                 | Cat.        |
| --------------------------------------------------------------------- | ----------- |
| `ChangeGearRadius` ne met pas sa position sur le hover                | Engrenages  |
| Empêcher de placer une belt sur un gear avec le même `axisID`         | Courroies   |
| Ignorer `BeamBodyHover` lors du déplacement d'un beam                 | Bugs        |
| Click sur un élément dans une sélection multiple doit le sélectionner | Interaction |

---

## 🎯 🐛 Stabilité & Bugs

| Tâche                                                                                            | Priorité | Simplicité |  ?  |
| ------------------------------------------------------------------------------------------------ | :------: | :--------: | :-: |
| Comportement étrange dans `vectorInput` à régler                                                 |    🔴    |     🔨     |  ?  |
| `placer un gear sur un slidep reste en slidep`                                                   |    🟡    |     🔨     |  ?  |
| Update le hover quand on change de state                                                         |    🟡    |     🔨     |     |
| `MechanicalCanvas` : fiabiliser la détection du focus (input/dialog/…), `return true` provisoire |    🟡    |     🔨     |     |

---

## 🎯 🔗 Courroies & Engrenages

### Contraintes / logique

| Tâche                                                                           | Priorité | Simplicité |  ?  |
| ------------------------------------------------------------------------------- | :------: | :--------: | :-: |
| Créer la contrainte de courroie tendue (liée à une longueur ?)                  |    🔴    |     🏗️     |  ?  |
| Dans tous les cas, les courroies imposent un ratio aux engrenages connectés     |    🔴    |     🔨     |     |
| Contrainte de ratio non respectée                                               |    🔴    |     🔨     |     |
| Placer une courroie sur un engrenage en ayant déjà une doit briser la connexion |    🟡    |     🔨     |     |
| Empêcher de placer une belt sur un gear avec le même `axisID`                   |    🟡    |     ⚡     |     |
| `ground` sur gearTooth ?                                                        |    🟢    |     ⚡     |  ?  |

### Validations

| Tâche                                                                                                      | Priorité | Simplicité |  ?  |
| ---------------------------------------------------------------------------------------------------------- | :------: | :--------: | :-: |
| Une courroie ne peut être tendue que si ses 2 extrémités sont connectées **et** qu'il y a au moins 2 gears |    🟡    |     🔨     |     |
| Valider les positions des beltEnds par rapport aux gears                                                   |    🟡    |     🔨     |     |
| beltEnds sur des gears toujours de pair avec un `AttachedGearsIDs`                                         |    🟡    |     🔨     |     |

### Bugs / hover / visuel

| Tâche                                                                  | Priorité | Simplicité |  ?  |
| ---------------------------------------------------------------------- | :------: | :--------: | :-: |
| Belt hover (gear section) is not reliable                              |    🔴    |     🔨     |     |
| `ChangeGearRadius` ne met pas sa position sur le hover                 |    🟡    |     ⚡     |     |
| Dessin de courroie tendue prend en compte les extrémités               |    🟡    |     🔨     |     |
| Visuel belt sur gearTooth confusant                                    |    🟡    |     🔨     |  ?  |
| Visuel beltEnd sur gearTooth, enroulement à penser                     |    🟡    |     🏗️     |  ?  |
| Afficher le ratio avec une autre gear dans les connexions de l'élément |    🟡    |     ⚡     |     |
| `MovingBeltBody` doit highlight la belt                                |    🟢    |     ⚡     |     |

---

## 🎯 📐 Contraintes & Solveur DDL

| Tâche                                                                                                             | Priorité | Simplicité |  ?  |
| ----------------------------------------------------------------------------------------------------------------- | :------: | :--------: | :-: |
| La contrainte d'angle (node on gearTooth) avec gear n'est pas respectée                                           |    🔴    |     🔨     |     |
| `geometric-solver` : maintenir longueurs des beams / orientation du modifié / ignorer grounds si nécessaire       |    🔴    |     🏗️     |     |
| `geometric-solver` : n'attribuer les `posMasses` que si la clé du lien est un join                                |    🟡    |     🔨     |     |
| `geometric-solver` : pour les autres beams (dans l'ordre), contrainte de parallélisme puis de longueur si ≥ 3 DDL |    🟡    |     🏗️     |     |
| `constraint-functions` : vérifier le risque d'oscillation de `totalW` avec `wEnd` bloqué                          |    🟡    |     🔨     |  ?  |
| Afficher les contraintes non respectées avec messages (Attention / Brisée) au lieu de `e=3.72`                    |    🔴    |     🔨     |     |
| Afficher les contraintes non respectées en couleur sur le canvas                                                  |    🟡    |     🔨     |     |
| Améliorer la contrainte d'angle (transformée en longueurs) pour les edges parallèles                              |    🟡    |     🔨     |     |
| Contraintes (et angle) aussi avec les forces                                                                      |    🟡    |     🔨     |     |
| Empêcher les contraintes sur le même élément (DDL analyser)                                                       |    🟡    |     ⚡     |     |
| Analyse des degrés de liberté en sous-parties                                                                     |    🟡    |     🏗️     |     |
| Panneau d'analyse : liste textuelle libertés/blocages + survol = surlignage canvas                                |    🟡    |     🏗️     |     |
| Pas de moteur + sur-contraint : on affiche quoi ?                                                                 |    🟡    |     🔨     |  ?  |
| Hover : interdire les éléments directement connectés et l'élément lui-même pour les dimensions                    |    🟡    |     ⚡     |     |

---

## ▶️ Simulation

| Tâche                                                                                             | Priorité | Simplicité |  ?  |
| ------------------------------------------------------------------------------------------------- | :------: | :--------: | :-: |
| Réinitialiser vitesse de simu, gravité, contacts au changement de mécanisme                       |    🔴    |     ⚡     |     |
| Attraper un point sur gearTooth et le tirer vers l'intérieur → roue tourne de façon incontrôlable |    🔴    |     🔨     |     |
| Attraper un élément quand le moteur tourne → simu n'avance que si on bouge la souris              |    🔴    |     🔨     |     |
| Revenir au dernier mode de simulation avec SPACE (sauvegarde)                                     |    🟡    |     ⚡     |     |
| Ajouter le choix du parent beam dans le moteur (afficher vitesse au lieu de ground en haut)       |    🟡    |     🔨     |     |
| Simulation moteur non grounded (`parentBeamID`)                                                   |    🟡    |     🏗️     |     |
| Afficher le temps total de simu sur la progressbar                                                |    🟢    |     ⚡     |     |
| Passer `lastSimulationMode` en `"dynamic"` quand le mode dynamique existera                       |    🟢    |     ⚡     |  ?  |

---

## 📊 Probes, Mesures & Graphiques

| Tâche                                                                                                                                                                                                                                                               | Priorité | Simplicité |  ?  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------: | :--------: | :-: |
| Afficher / cacher les probes                                                                                                                                                                                                                                        |    🟡    |     ⚡     |     |
| Hover et sélection des probes (= élément lié)                                                                                                                                                                                                                       |    🟡    |     🔨     |     |
| **Épic** Gestion des probes (mesures temporelles) : config par probe (métrique, toggle graphique) · zone de graphiques (courbes superposées/séparées, Valeur vs Temps, export CSV & image) · nomenclature « Contrainte » (MPa/matériau) vs contraintes géométriques |    🟡    |     🏗️     |  ?  |
| Zoom graphique (horizontal = dans le temps)                                                                                                                                                                                                                         |    🟢    |     🔨     |     |
| Pin graphique                                                                                                                                                                                                                                                       |    🟢    |     ⚡     |  ?  |
| Changer le curseur sur les graphiques                                                                                                                                                                                                                               |    🟢    |     ⚡     |     |

---

## 🖱️ Interaction Canvas (hover, sélection, placement)

| Tâche                                                                                   | Priorité | Simplicité |  ?  |
| --------------------------------------------------------------------------------------- | :------: | :--------: | :-: |
| Hover & Click sur les dimensions pour les éditer quand `state == placingStartDimension` |    🟡    |     🔨     |     |
| `get-hover` : calculer si le curseur est réellement à l'intérieur de la surface         |    🟡    |     🔨     |     |
| Placer un join à la jonction des Beams                                                  |    🟡    |     🔨     |     |
| Snap force / distributed force aux perpendiculaires lors du placement                   |    🟢    |     🔨     |     |
| Placing Edges/Force avec hold down                                                      |    🟢    |     🔨     |     |
| Placing beam series / only one if hold down (comme OnShape)                             |    🟢    |     🔨     |     |
| Bouton « Recentrer » calculé à partir des positions des éléments                        |    🟡    |     ⚡     |     |

---

## 📏 Dimensions

| Tâche                                                                            | Priorité | Simplicité |  ?  |
| -------------------------------------------------------------------------------- | :------: | :--------: | :-: |
| Finir les traits de `DimensionAngle`                                             |    🟡    |     🔨     |     |
| Ajouter « Angle » dans les edges                                                 |    🟡    |     ⚡     |     |
| Afficher la dimension dans le property panel d'un edge                           |    🟡    |     ⚡     |     |
| Polish `DimensionAngle` : arrondir 0°/180°, traits extérieurs pour petits angles |    🟢    |     🔨     |     |
| Éloigner les contraintes des éléments pour la lisibilité                         |    🟢    |     🔨     |  ?  |

---

## 🎛️ Property panel & UI

| Tâche                                                                                                           | Priorité | Simplicité |  ?  |
| --------------------------------------------------------------------------------------------------------------- | :------: | :--------: | :-: |
| Faire le panneau de paramètres propre                                                                           |    🟡    |     🔨     |     |
| Sélection multiple d'éléments du même type → modifier paramètres simultanément (UI adaptée + actions multiples) |    🟡    |     🏗️     |     |
| Sync tab/canvas : mettre aussi à jour l'état au changement d'`activeTab` (`App.tsx`)                            |    🟡    |     🔨     |     |
| Hover des inputs dans le property panel → highlight canvas                                                      |    🟢    |     🔨     |     |
| N'afficher QUE les éléments connectés dans `connectionProperties` ?                                             |    🟢    |     ⚡     |  ?  |
| Ajouter des « Blank » quand on change une valeur depuis les propriétés                                          |    🟢    |     ⚡     |     |
| Changer le curseur sur `ElementDisplay`                                                                         |    🟢    |     ⚡     |     |
| Afficher des « stand in » pendant que les icônes chargent                                                       |    🟢    |     ⚡     |     |

---

## 📋 Édition (copié-collé, transferts, remplacements)

| Tâche                                                                  | Priorité | Simplicité |  ?  |
| ---------------------------------------------------------------------- | :------: | :--------: | :-: |
| Copié-collé                                                            |    🟡    |     🏗️     |     |
| Remplacement d'un edge par un autre                                    |    🟡    |     🔨     |     |
| Transférer les propriétés de mesures au remplacement d'un node         |    🟡    |     🔨     |     |
| Enlever le drag & drop → boutons de transfert aux endroits spécifiques |    🟡    |     🔨     |     |

---

## 🎨 Visuel & Rendu

| Tâche                                                                  | Priorité | Simplicité |  ?  |
| ---------------------------------------------------------------------- | :------: | :--------: | :-: |
| Rewhole de `ElementDisplay` pour inclure d'autres éléments, fill, etc. |    🟡    |     🏗️     |     |
| Ajouter `motor` dans les `rendering-specs`                             |    🟡    |     ⚡     |     |
| Zoom sans scale les éléments eux-mêmes ?                               |    🟢    |     🔨     |  ?  |
| Mirror Y le canvas ?                                                   |    🟢    |     🔨     |  ?  |

---

## 📱 Responsive / Layout

| Tâche                                                                      | Priorité | Simplicité |  ?  |
| -------------------------------------------------------------------------- | :------: | :--------: | :-: |
| Responsive : top bar, element palette                                      |    🟡    |     🔨     |     |
| Centrer le viewport au resize (`MechanicalCanvas`)                         |    🟡    |     🔨     |     |
| Nettoyer le calcul de `condensed` (seuil `width < 1400` en dur, `App.tsx`) |    🟢    |     ⚡     |     |

---

## 🧹 Refactoring & Architecture

| Tâche                                                                                   | Priorité | Simplicité |  ?  |
| --------------------------------------------------------------------------------------- | :------: | :--------: | :-: |
| Séparer click de move _(voir aussi Bugs)_                                               |    🔴    |     🔨     |     |
| Créer une catégorie de `CanvasState` pour rendre le code plus lisible/maintenable       |    🟡    |     🔨     |     |
| Unifier les `excluded_elements` et les conditions au début de `get_hover`               |    🟡    |     🔨     |     |
| Fusionner les actions : mouvement + connexions                                          |    🟡    |     🔨     |     |
| `ConnectionsContainer` : retirer le code d'insertion temporaire (`// Remove this shit`) |    🟡    |     ⚡     |     |
| Refactor en enlevant le `actionBundleType` ?                                            |    🟡    |     🔨     |  ?  |
| `action-reducer` : vraie fonction `clone_load` au lieu du spread `{ ...l }`             |    🟢    |     ⚡     |     |

---

## 🛠️ Outils & Config

| Tâche                                                       | Priorité | Simplicité |  ?  |
| ----------------------------------------------------------- | :------: | :--------: | :-: |
| Ajouter un fichier config ESLint                            |    🟡    |     ⚡     |     |
| Adapter le thumbnail generator pour cadrer sur le mécanisme |    🟢    |     🔨     |     |
| Passer les thumbnails de la bibliothèque en AVIF lossless   |    🟢    |     ⚡     |     |
