# Simulation cinématique — Architecture et pipeline

## Vue d'ensemble

La simulation cinématique de Slidep calcule la position de chaque élément du mécanisme à chaque instant `t`. Elle ne simule **pas** les forces ou la dynamique — elle résout uniquement la géométrie : «&nbsp;si le moteur a tourné de θ, où se trouve chaque pièce ?&nbsp;»

L'approche utilisée est **PBD (Position-Based Dynamics)** : plutôt que d'intégrer des équations différentielles, on itère des corrections de position directes jusqu'à ce que toutes les contraintes soient satisfaites. C'est robuste, simple à déboguer, et converge bien pour des mécanismes rigides.

### Principe central : compiler une fois, itérer à chaque frame

À l'**entrée en simulation**, on **compile** un `SimulationModel` figé : les nœuds (positions + angles + masses) et la liste de liens, déjà fusionnés (Coincidence) et triés. Ce modèle **ne change plus** tant qu'on ne revient pas en édition (ou qu'on n'édite pas le mécanisme pendant la simulation, ce qui le recompile).

À **chaque frame**, on ne fait que :
1. warm-start depuis les dernières positions/angles ;
2. rafraîchir les cibles moteur et l'angle de la ligne des centres des engrenages ;
3. résoudre par PBD sur les liens figés ;
4. produire un snapshot.

C'est beaucoup plus simple et rapide que de tout reconstruire chaque frame.

---

## Carte des fichiers

```
src/
├── types/
│   ├── element.ts               ← définition de tous les types d'éléments
│   ├── kinematic-solver-links.ts ← GeomNodes, SimNodes, et types de liens
│   └── runtime-state.ts         ← état courant (snapshots, runtime)
│
├── components/solver/
│   ├── parsing.ts               ← mécanisme → nœuds + liens (2 variantes : édition / simulation)
│   ├── constraint-functions.ts  ← fonctions PBD : une par type de contrainte
│   ├── PBD_kinematic_solver.ts  ← boucle d'itération PBD (partagée édition / simulation)
│   ├── geometric-solver.ts      ← solveur d'édition (contraintes utilisateur)
│   ├── kinematic-simulation.ts  ← compile_simulation_model + step_simulation
│   └── utils.ts                 ← tri des liens, calcul des degrés de liberté
│
└── App.tsx                      ← boucle d'animation, enregistrement des snapshots, affichage
```

---

## Les concepts clés

### Nœud (node)
Un nœud est un **point** dont on suit la position. Clés :
- `"abc123"` → position d'un pivot, slider, join, masse, engrenage (clé **nue**)
- `"abc123:start"` / `"abc123:end"` → extrémités d'un edge (beam…)

Chaque position a une **masse** (`posMasses`) : `0` = fixé (ne bouge pas), `1` = libre. Les positions, rayons et angles vivent dans des **maps séparées**, donc la même clé nue `"abc123"` peut désigner la position, le rayon et l'angle d'un même engrenage sans collision.

### Angle (simulation)
En simulation, chaque engrenage a un **nœud d'angle** (`angles`, clé nue). Les angles forment une **couche passive** : ils sont pilotés par le moteur, l'engrènement et la coaxialité, lisent les positions (pour la ligne des centres) mais **n'écrivent pas** les positions. Un blocage d'engrenage se voit alors comme un résidu, jamais comme une explosion.

### Deux types de `Nodes`
- `GeomNodes { positions, posMasses, radii, radMasses }` — solveur d'édition : les rayons sont des variables.
- `SimNodes { positions, posMasses, angles }` — simulation : les rayons sont des **constantes** figées dans les liens, les angles sont des variables (jamais ancrées, donc pas de masse).

### Lien (link)
Une **contrainte** entre nœuds. Chaque type enlève 1 ou 2 degrés de liberté.

| Type | Rôle |
|------|------|
| `Coincidence` | Deux nœuds fusionnés (même position). Résolu par fusion de clés. |
| `Distance` | Distance fixe entre deux nœuds. |
| `SlideOnSegment` | Un nœud reste sur un segment, ratio libre (sliders, points groundés). |
| `FixedOnSegment` | Un nœud reste à un ratio `t` fixe sur un segment (joins/masses sur corps de beam). |
| `KeepOrientation` | Un segment garde une direction fixe (verrou d'orientation). |
| `Angle` | Angle orienté fixe entre deux segments (rigidité, sliders). |
| `GearMeshing` | Distance centres = somme des rayons (édition, ajuste les rayons). |
| `MotorBeam` | Moteur : fait tourner un beam vers un angle cible autour du pivot. |
| `MotorAngle` | Moteur : pousse un nœud d'angle d'engrenage vers une cible. |
| `GearMeshAngle` | Engrènement épicycloïdal en espace d'angles (ligne des centres). |
| `CoaxialAngle` | Engrenages coaxiaux : même rotation (offset constant). |
| `GearPerimeterPin` | Nœud (join/pivot) fixé au périmètre d'un engrenage : `N = centre + R·u(θ+offset)` (couple position ↔ angle). |
| `BeamFollowsAngle` | Beam attaché à un join fixé sur un engrenage : son orientation suit `θ`. |
| `HandleGrab` | Tire un nœud vers une position cible (interaction souris). |

### Snapshot
Une **photo** de l'état à un instant `t` : `{ t, positions, angles }`. La simulation produit une suite de snapshots à `RECORD_DT = 1/120 s` de temps simulé.

---

## `parsing.ts`

### `get_geom_nodes` / `get_sim_nodes`
- `get_geom_nodes` : positions (clé nue pour nœuds) + rayons d'engrenages (variables).
- `get_sim_nodes` : positions + angles d'engrenages (variables). Pas de rayons (constants).

### `get_links_geometric` (édition)
Contraintes **utilisateur** appliquées (dimension, parallèle…), `Coincidence`, `SlideOnSegment` sur les corps de beam, `GearMeshing`, coïncidence des engrenages fixés. Longueurs d'edges et rayons **non** contraints (on peut redimensionner).

### `get_links_simulation` (simulation)
- **Aucune** contrainte utilisateur (ce sont des aides d'édition).
- Longueurs de beams figées en `Distance` ; rayons figés (constantes).
- Corps de beam → `FixedOnSegment` (joins/masses) ou `SlideOnSegment` (sliders/slideps, ou points groundés).
- Engrènement : `Distance` centres = r₁+r₂ + `GearMeshAngle` (angle) ; coaxiaux → `CoaxialAngle`.
- Rigidités (voir ci-dessous) et moteurs (`MotorBeam`, `MotorAngle`).
- Clés pré-fusion ; `compile_simulation_model` réécrit les clés en fusionnant les `Coincidence`.

### Rigidités (`add_rigidity_links`)
- **join/mass non groundé** : **triangulation par `Distance`** entre extrémités libres des beams soudés (réutilise les paires déjà contraintes ; corde quasi-colinéaire → repli sur `Angle`). Préserve les angles relatifs.
- **join/mass groundé** (welded au sol) : **ancrage** (masse 0) des extrémités des beams connectés (extrémité libre pour un beam endpoint ; les deux extrémités pour un beam de corps). Fixe tout, sans triangulation ni verrou.
- **Slider non groundé** : `Angle` rail↔beams attachés (il translate sans tourner).
- **Slider groundé** : rail glisse (`SlideOnSegment` + `KeepOrientation`) ; les beams attachés (corps fixe) sont **ancrés**.

`get_links_simulation` reçoit `nodes: SimNodes` pour poser les masses d'ancrage (clés pré-fusion ; la fusion prend le `min`).

### Engrenages → nœuds (gear drives linkage)
`GearElement.fixedNodesIDs` (join/pivot fixés au **périmètre**) : chaque nœud orbite avec l'engrenage via `GearPerimeterPin` (couplage **actif** position ↔ angle). Si le nœud est un **join**, ses beams attachés tournent avec l'engrenage (`BeamFollowsAngle`) ; un **pivot** est une charnière libre sur le point qui orbite. *(Modèle + solveur implémentés ; placement UI à venir.)*

---

## `kinematic-simulation.ts`

### `compile_simulation_model(mechanism): SimulationModel`
1. `get_sim_nodes` + `get_links_simulation`.
2. Fusion des `Coincidence` : `abc` + `def:start` → `abc,def:start`, masse = min des deux. Réécrit **uniquement** les champs de clés de position (`key1..4`, `pivotKey`, `drivenKey`, `posKey1/2`, `grabbedKey`) — pas les clés d'angle (couche séparée). Mémorise une `keyMap` (clé d'origine → clé fusionnée) pour traduire le grab.
3. `sort_links` (ancres en premier).

Retourne `{ nodes, links, keyMap }`.

### `step_simulation(model, t, prevPositions, prevAngles, dt, grab?): KinematicSnapshot`
1. Warm-start : copie des positions/angles initiaux du modèle, écrasés par `prev*` (une clé fusionnée prend la position d'une de ses parties).
2. Rafraîchit, **en place**, les liens d'état de simulation :
   - `MotorBeam` / `MotorAngle` : `cible = angle réel courant + ω·dt` (basé sur l'angle réel précédent → **pas de backlog** : si bloqué, l'angle stagne ; au déblocage, reprise sur place).
   - `GearMeshAngle` : met à jour l'angle **continu** de la ligne des centres (déroulé pour éviter les sauts de 2π des planétaires).
3. Ajoute un `HandleGrab` transitoire si grab (clé traduite via `keyMap`).
4. PBD (300 itérations) sur les liens figés + grab.
5. Découple les clés fusionnées et renvoie `{ t, positions, angles }`.

### `apply_snapshot_to_mechanism(mechanism, snapshot)`
Applique positions + angles d'engrenages à une copie du mécanisme pour l'affichage. Les rayons restent ceux de l'édition (inchangés en simulation).

---

## `PBD_kinematic_solver.ts`

Boucle PBD partagée. Pour `i` de 0 à 300, applique chaque lien (correction de position / rayon / angle), s'arrête si l'erreur max < ε. Les `HandleGrab` ne s'appliquent que sur les 20 premières itérations. Signature commune : reçoit positions/posMasses + (rayons et/ou angles selon le solveur).

Le moteur **ajoute une contrainte** (`MotorBeam`/`MotorAngle`) à priorité normale ; il **n'impose pas** une position à masse 0. Ainsi, si le mécanisme est bloqué, la contrainte reste insatisfaite (résidu) mais le mécanisme ne peut **jamais** arriver dans un état invalide.

---

## `App.tsx` — La boucle d'animation

À l'entrée en simulation, on **compile** le `SimulationModel` (ref) et on remet l'état à zéro. À chaque tick de `requestAnimationFrame` :

1. Calcul du temps simulé écoulé (`simDt = realDt × vitesse`).
2. **Mode replay** : si des snapshots couvrent déjà le futur, on avance juste le curseur.
3. **Mode calcul** : sinon on appelle `step_simulation` en boucle (pas `RECORD_DT`) pour combler les snapshots manquants, chaque appel recevant le snapshot précédent comme warm-start.

**Édition pendant la simulation** (changement de vitesse moteur, undo/redo, etc.) : un `useEffect` sur `mechanism` recompile le modèle à partir de l'état **simulé courant** (`apply_snapshot_to_mechanism` du dernier snapshot) — ce qui re-fige les références d'angle/longueur sans discontinuité — et tronque les snapshots futurs. Plus de `MotorPhase` : l'angle incrémental rend la continuité automatique.

**Interaction (`grab`)** : l'utilisateur peut tirer un nœud, une extrémité d'edge, ou un edge **sur son corps** pendant la simulation (`SimGrab` = clé de nœud, ou `{ edgeID, t }`). Un snapshot interactif immédiat est calculé via `step_simulation` ; pour un grab de corps, un nœud-pont `grab_bridge` au ratio `t` est tiré vers la souris (`FixedOnSegment` + `HandleGrab`).

---

## Résumé du flux de données

```
Entrée en simulation
    │
    ▼ compile_simulation_model(mechanism)
    │     parsing.ts : get_sim_nodes + get_links_simulation
    │     → fusion Coincidence + tri  → SimulationModel figé
    │
App.tsx (boucle animation), à chaque frame :
    │
    ▼ step_simulation(model, t, prevPositions, prevAngles, dt, grab?)
    │     warm-start ← snapshot précédent
    │     maj cibles moteur (angle réel + ω·dt) + alpha continu des engrenages
    │     PBD_kinematic_solver (300 itérations) → constraint-functions.ts
    │
    └── KinematicSnapshot { t, positions, angles }
            │
            ▼ apply_snapshot_to_mechanism → mécanisme affiché
```
