# Courroies (belts) — logique, concepts et fichiers clés

Document de référence pour la logique des courroies dans slidep : géométrie,
contraintes, solveurs, et l'historique des décisions de conception.

> État : le cas courant (courroie libre, longueur conservée, transmission) marche.
> Les cas limites d'**enroulement** (winding) restent imparfaits — voir la section
> [Problèmes ouverts](#problèmes-ouverts).

---

## 1. Vue d'ensemble

Une courroie relie plusieurs poulies (gears). Deux notions transverses :

| Notion | Sens |
|---|---|
| **tendue / libre** (`belt.tight`) | tendue = boucle fermée continue (avec une *jonction* qui voyage) ; libre = chaîne ouverte entre deux **extrémités** (terminaux) |
| **édition vs simulation** | deux solveurs PBD partagés : le **géométrique** (édition, positions + rayons variables) et le **cinématique** (simulation, positions + angles ; rayons *bakés*) |

Les contraintes de courroie sont majoritairement **simulation-only** (la longueur ne
doit PAS contraindre l'édition — décision utilisateur). Exception : `BeltJunction`
tourne dans les deux solveurs, et la longueur peut être imposée en édition à la
demande (dimension / champ propriété).

Le solveur est **quasi-statique** : pas de masse, pas d'inertie. PBD = projection de
contraintes itérée. « masse » = masse inverse (0 = ancré/fixe, 1 = libre).

---

## 2. Fichiers clés

| Fichier | Rôle |
|---|---|
| `src/utils/belt-path.ts` | **Géométrie pure** (module feuille, sans dépendance solveur). Reconstruit le tracé, les pièces, les tangentes, les wraps. |
| `src/utils/belt-geom.ts` | `measure_belt_length`, `get_belt_vias`. |
| `src/types/kinematic-solver-links.ts` | Type union `Link` : toutes les contraintes (belt + autres). |
| `src/components/solver/constraint-functions.ts` | Les `apply*Constraint` (une projection PBD par contrainte). |
| `src/components/solver/PBD_kinematic_solver.ts` | Boucle du solveur + `switch` sur `link.type`. |
| `src/components/solver/parsing.ts` | Construit les `Link[]` à partir des éléments (`belt_*_link`). |
| `src/components/solver/kinematic-simulation.ts` | `compile_simulation_model`, `step_simulation`, fusion, disconnect, wraps. |
| `src/components/solver/geometric-solver.ts` | Solve d'édition + remap de fusion. |
| `src/components/solver/utils.ts` | `keys_of` (clés d'un lien, pour le tri/fusion), `sort_links`. |
| `src/components/canvas/drawing-functions.ts` | `draw_belt`, `draw_belt_loop`, `draw_belt_winding`. |
| `src/components/solver/belt-length.test.ts` | Tests (géométrie + contraintes). |

---

## 3. Géométrie (`belt-path.ts`)

Un **via** = un point du tracé : une poulie (`radius > 0`, `direction` = sens
d'enroulement) ou un **terminal** (`radius = 0`). La courroie va
`terminal départ → poulies… → terminal fin`.

```ts
type BeltVia = { pos: Point2; radius: number; direction: boolean };
// direction : false = horaire, true = anti-horaire (même convention que ctx.arc)
```

### Fonctions

| Fonction | Retour / rôle |
|---|---|
| `compute_belt_path(vias)` | `{ length, outPoints, inPoints, wrapAngles }`. Tangentes entre vias consécutifs (`Point2.circles_link`) + arc par via interne. **C'est la géométrie du dessin.** |
| `belt_pieces(vias, closed?, wraps?)` | Liste ordonnée de **pièces** (`segment` \| `arc`), chacune avec `gearIndex`/`gearIndexB`, `startS`, `from`/`to`, etc. `closed` = boucle (tendue). `wraps?` = override l'arc par `r·|wrap|` (wrap continu, pour l'enroulement). |
| `belt_point_tangent(vias, s, closed?, wraps?)` | `{ point, tangent, curvature }` à l'abscisse curviligne `s`. `curvature = ±1/r` sur un arc, 0 sur un segment. |
| `belt_project(vias, p, closed?, wraps?)` | `{ s, point, tangent }` du point le plus proche du tracé (clampé à l'extent réel de chaque pièce). |
| `belt_wraps(vias, closed?)` | wrap brut ∈ [0, 2π) par via. |
| `advance_continuous_wraps(vias, prev, closed?)` | wrap **continu** (dé-wrappé) : passe **négatif** quand le contact est perdu, **> 2π** quand ça s'enroule — au lieu de sauter à la couture 0/2π. |
| `belt_arc_sweep(a, b, direction)` | angle positif balayé (convention `direction`). |
| `nearest_point_on_piece(p, piece)` | point le plus proche, clampé au **secteur enroulé** d'un arc (jamais sur la face libre). |

### `circles_link` (dans `Point2`)

`Point2.circles_link(c1, r1, dir1, c2, r2, dir2)` → `{ start, end }` = offsets des
points de tangence de la ligne tangente entre deux cercles. **Attention : le point
de tangence dépend de l'ordre des arguments et des flags `dir`.** Un terminal =
cercle de rayon 0. `compute_belt_path` appelle `circles_link(a, ra, da, b, rb, db)`
pour la paire `a→b` — donc pour le segment `terminal→gear` l'ordre est
`(terminal, 0, false, gear, r, dir)`. Toute contrainte qui recalcule une tangence
de terminal **doit reproduire cet ordre** sinon elle diverge du dessin (c'était la
cause de la « rotation bizarre » — voir §7).

### Enroulement terminal (winch)
Dans `belt_pieces` (open only) : si un terminal (r=0) est **sur** sa poulie adjacente
(`distance ≤ radius + 1`, `onGear`), cette poulie fait un **arc jusqu'au terminal**
(le segment tangent dégénéré est sauté). Son wrap suit alors l'angle enroulé → peut
dépasser 2π (capstan / winch).

---

## 4. Concepts du solveur

### PBD (projection)
Pour une contrainte scalaire `C(q) = 0` : gradient `∇C`, `denom = Σ wᵢ·|∇ᵢC|²`,
correction `Δqᵢ = −C · wᵢ · ∇ᵢC / denom · stiffness`. Un DDL ancré (`w = 0`) ne bouge
pas et absorbe toute la contrainte sur les autres.

### Fusion (coïncidence)
En simulation, une poulie **fusionne** avec son pivot → sa clé de **position**
devient `"pivot,gear"`, mais son nœud d'**angle** reste l'**id nu du gear** (la map
des angles n'est jamais fusionnée). `rewrite_position_keys` (dans
`kinematic-simulation.ts`) réécrit les champs de position (`startKey`, `endKey`,
`nodeKey`, `gearPosKeys[]`, …) mais **jamais** les clés d'angle (`gearAngleKeys`,
`phaseKey`, `refAngleKey`).
> **Piège** : tout lien qui lit un angle doit utiliser une clé de gear **nue**
> (non fusionnée). D'où les champs séparés `refAngleKey` / `gearAngleKeys`.

### Voyage partagé φ (belt travel)
Scalaire par courroie dans la map des angles, clé `` `${beltId}:phi` ``. **Toutes**
les couplages (transmission + extrémités + jonction) le référencent :
```
r · ε · (θ − θ0) = φ      avec ε = dir ? −1 : 1
```
Chaque poulie se couple au **même** φ → la transmission passe par lui. Projeté en **espace belt-px** (denom = 2, correction θ
divisée par `rε`) — pas en `r²+1` (trop lent) ni pondéré `rε²` (θ trop « bon marché »,
bloque le moteur).

### Wraps continus (état de simulation)
`BeltLength.wraps[]` suit le wrap **continu** par poulie, avancé chaque frame par
`update_belt_disconnects`. Copié chaque frame vers `BeltPin.wraps` (tendue) et
`BeltFreeEnds.wraps` (libre) dans `step_simulation`. `wrap ≤ 0` → déconnexion
(perte de contact) ; `wrap > 2π` → enroulement (dessin en spirale).

---

## 5. Les contraintes (liens)

Toutes dans le `switch` de `PBD_kinematic_solver.ts`, définies dans
`kinematic-solver-links.ts`, appliquées dans `constraint-functions.ts`, construites
dans `parsing.ts`.

| Lien | Quand | Rôle |
|---|---|---|
| **`BeltLength`** | sim (tendue + libre) | Longueur totale inextensible = `L0`. Un scalaire global : bouger une poulie redistribue la boucle. Gradient `∂L/∂centre = −(Σ tangentes unitaires adjacentes)`. Pour une courroie **libre**, EXCLUT les terminaux du gradient (ils appartiennent à `BeltFreeEnds`) → il n'agit que sur les poulies (ex. idler libre). Param `wraps?` (arc = `r·|wrap continu|` → longueur lisse au passage 2π), `disconnected?` (saute les poulies déconnectées). |
| **`BeltPhaseGear`** | sim (toutes) | No-slip : `r·ε·(θ−θ0) = φ`. Un par poulie enroulée. Transmission via φ. N'écrit que des angles (θ, φ). |
| **`BeltFreeEnds`** | sim (libre) | **UN lien par courroie** gérant les DEUX terminaux (voir §6). |
| **`BeltPin`** | sim (tendue) | La jonction fusionnée (start==end) chevauche la boucle fermée à `s = s0 + r_ref·ε_ref·(θ_ref − θ_ref0)` → voyage en tournant. Bidirectionnel. `wraps?` pour voyager autour d'une poulie enroulée. |
| **`BeltJunction`** | **édition + sim** | La jonction se pose sur la pièce la plus proche du cycle fermé (segment ou arc). Symétrique (J + poulies bordantes bougent). Utilisé en édition ; `BeltPin` le remplace en sim. |
| **`BeltFollowsTangent`** | sim (tendue) | Un beam soudé à la jonction garde `angle(driven−pivot) = tangentAngle(s) + offset`. Pondéré par la courbure locale (`curvature·r_ref·ε_ref`). |

Autres liens utilisés par les courroies-winch : **`GearPerimeterPin`** (un nœud/join
épinglé sur une jante orbite avec l'angle du gear) et **`BeamFollowsAngle`**.

---

## 6. `BeltFreeEnds` en détail (courroie libre)

Le cœur de la logique « extrémités libres ». **Un seul lien par courroie** parce
que la longueur fixe la **somme** des deux brins libres tandis que φ fixe leur
**différence** — impossible à faire avec deux liens indépendants.

Notations : `fsStart`, `fsEnd` = longueurs des deux brins tangents terminaux ;
`middle` = tout le reste (arcs + segments inter-gears) ; `L0` = longueur totale.

### Deux contraintes scalaires projetées, chaque itération

1. **`C_sum = longueur_totale − L0`** *(toujours active)*
   Bouge les deux bouts le long de leur **vraie tangente** (`belt_pieces`, cohérente
   avec le dessin). Bouger un bout de δ le long de sa tangente change la longueur de
   δ **sans** déplacer son point de tangence (donc l'arc ne bouge pas) → gradient 1.
   Conserve la longueur même quand un bout est enroulé (l'arc enroulé qui grandit est
   compensé par l'autre bout qui rentre).

2. **`C_diff = (fsStart − fsEnd) − (diff0 − 2φ)`** *(seulement si les deux bouts sont libres)*
   φ pilote le différentiel (∂/∂fsStart = +1, ∂/∂fsEnd = −1, ∂/∂φ = +2 ; poids DDL
   de φ = 1). Bidirectionnel : tirer un bout libre fait avancer φ (les poulies
   tournent). **Abandonné dès qu'un bout est enroulé/externe** : c'est alors l'arc
   enroulé (via l'orbite θ) qui porte φ, et le bout libre devient un pur *esclave de
   longueur* — garder C_diff le ferait dérouler à l'infini et exploser la longueur.

### Modes d'enroulement

- Un brin s'**enroule** quand il est (presque) épuisé — déclencheur sur le segment
  **réel** court (`fsTarget < 1.5`, ou terminal déjà sur la poulie) pour que φ ne
  bloque pas contre une courroie tendue. Il s'épingle à un angle relatif fixe
  (`startWind`/`endWind`) et **orbite avec θ** (position autoritaire, exclu de la
  projection). Dé-enroulement quand `fsTarget > 4`.
- Un bout **externe** (`startExternal`/`endExternal`) = terminal épinglé sur une
  jante via un join (`GearPerimeterPin`). `BeltFreeEnds` ne le positionne **jamais**
  (c'est le `GearPerimeterPin` qui le fait), il le lit seulement pour la longueur.
  Baké au parsing : `belt.fixedNodeStart/EndID ∈ un gear.fixedNodesBodyIDs`.

### Champs du lien
`startKey`, `endKey`, `gearPosKeys[]`, `gearAngleKeys[]` (nus), `radii[]`,
`directions[]`, `phaseKey`, `length` (L0), `diff0` (fsStart−fsEnd initial),
`startExternal?`/`endExternal?`, `startWind?`/`endWind?` (état), `wraps?` (état).
Construit par `belt_free_ends_link` dans `parsing.ts`.

---

## 7. Flux d'une frame de simulation (`step_simulation`)

1. Boucle par lien : `update_belt_disconnects(beltLength, positions)` avance les
   wraps continus et marque les poulies déconnectées (`wrap ≤ 0`, sauf la dernière
   active ou une poulie où un bout est épinglé).
2. Si nouvelle déconnexion : `rewire_belt_mesh` retire le `BeltPhaseGear` de la
   poulie déconnectée (les autres restent sur le même φ → transmission continue).
3. Copie des wraps continus : `BeltLength.wraps` → `BeltPin.wraps` / `BeltFreeEnds.wraps`.
4. Grab (transitoire).
5. `PBD_kinematic_solver(...)` : N itérations de projection sur tous les liens.
6. Snapshot : `beltWraps`, `disconnectedBeltGears` → appliqués au mécanisme pour le
   dessin (`belt.gearWraps`, `belt.disconnectedGearIndices`).

Le modèle sim est **compilé** (`compile_simulation_model`) à l'entrée en simulation
et **remis à zéro au recompile** (reset / retour édition) — les états mutables
(wraps, disconnected, wind) sont donc éphémères pour un run.

---

## 8. Historique des discussions et décisions

Ordre chronologique condensé (détail complet dans la mémoire projet
`belt-constraints-plan.md`).

1. **Mesure de longueur** (`measure_belt_length`) basée sur le dessin (`belt_pieces`).
2. **Tendue/libre + jonction** : courroie tendue = boucle fermée continue, jonction
   qui se pose sur le tracé (`BeltJunction`) et **voyage** en tournant (`BeltPin`),
   ré-oriente un beam soudé (`BeltFollowsTangent`). Décision : la longueur contraint
   la **simulation**, pas l'édition. Contraintes **symétriques** (toutes les parties
   concernées bougent, réparties par masse).
3. **Modèle paramétrique tendue** : cycle fermé de gears ; l'offset `+BELT_WIDTH/2`
   est **cosmétique** (dessin), les contraintes utilisent le rayon brut.
4. **Déconnexion en cours de sim** (perte de contact) : wrap continu → négatif →
   déconnexion, irréversible pour le run, restaurée au reset. Winch (Option A) :
   bout épinglé sur une jante, enroulement > 2π rendu en spirale.
5. **Refactor φ (voyage partagé)** — *décision clé approuvée* : un scalaire φ par
   courroie que tout référence, pour tuer le double-contrôle entre `BeltLength` et
   l'ancien `BeltEndTravel`.
6. **`BeltFreeEnds` remplace `BeltEndTravel`** — *décision clé*. Cause racine trouvée
   par repro numérique du cas « n » (un gear motorisé, deux bouts libres) :
   - L'ancien modèle `lfree = lfree0 + sign·φ` conservait la **somme** des brins
     libres, mais la vraie longueur = `fsStart + arc + fsEnd` et **l'arc migre**
     quand les bouts bougent (les points de tangence bougent — c'est physique). →
     la longueur gonflait (~+4 % et accélérait).
   - « Rotation bizarre » : l'ancienne contrainte ne fixait que la **distance** du
     bout (pas sa position angulaire → DDL libre) et calculait la tangente avec un
     `circles_link` **incohérent avec le dessin**.
   - Solution : un lien combiné, `C_sum` (somme = longueur) + `C_diff` (différentiel
     = φ), positionnant les bouts sur la **vraie tangente**. Longueur conservée à
     0 % (moteur les deux sens, drag → φ, enroulement).
7. **Round 2 (tests app)** :
   - **#2 winch/join bloquait** (régression) → bouts `external` exclus du
     positionnement (le `GearPerimeterPin` les pilote). Corrigé.
   - **#1 saut à 1 tour** → wraps continus branchés dans le calcul de longueur.
     Gros saut supprimé ; reste une oscillation en enroulement profond (dégénéré).

---

## 9. Problèmes ouverts

À reprendre (l'utilisateur investigue) :

- **#1b — courroie trop courte pour un tour complet** : le bout sur la poulie bloque.
  Sur-contrainte réelle (les deux bouts veulent s'enrouler avec une seule poulie).
- **Enroulement profond (> 2π) mono-gear** : la longueur oscille encore — cas
  dégénéré (un bout s'enroule plusieurs tours pendant que l'autre déroule sur une
  seule poulie). Le wrap continu suit mal ici.
- **#3 — détachement** : un bout enroulé qui orbite jusqu'à rejoindre la tangence de
  l'autre bout ne se détache pas. Idée retenue : utiliser le wrap continu **négatif**
  pour déclencher une déconnexion — mais les garde-fous `pinnedOn(gi)` et
  `activeIdx.length > 1` (dernière poulie) bloquent ça pour le gear d'un terminal.
  → il faut une **règle de détachement spécifique aux terminaux** (distincte de la
  déconnexion de poulie générique).
- **EDGE** : déconnexion en cours de sim d'une poulie adjacente à un terminal sur une
  courroie libre — `BeltFreeEnds` la garde dans sa liste de vias.

### Pistes de débogage
- Les repros numériques (harnais Vitest jetables) ont été très efficaces : instancier
  positions/masses/angles, piloter θ (moteur) ou tirer un bout (drag), itérer la
  contrainte, mesurer `compute_belt_path(...).length`. `console.log` est avalé par
  Vitest → écrire dans un fichier (`writeFileSync`).
- Vérifier d'abord la **cohérence tangente contrainte ↔ dessin** (`circles_link`
  ordre/`dir`), puis la **conservation de longueur** image par image, puis les
  transitions d'enroulement.
