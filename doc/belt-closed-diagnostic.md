# Diagnostic — gradient de `BeltLength` (courroie fermée)

Une seule question : **le gradient analytique de `BeltLength` dans le cas fermé est-il correct ?**

## Verdict

**Oui, le gradient est correct.** Sur 5 géométries (dont 3 asymétriques), l'écart relatif entre
le gradient analytique et les différences finies centrées est au pire **2.3 × 10⁻⁹** — c'est
l'ordre de grandeur de la troncature des différences finies elles-mêmes (ε = 0.02 px), pas une
erreur de gradient. Le théorème de l'enveloppe invoqué par la contrainte
(`∂L/∂centre = −Σ tangentes unitaires adjacentes`, les arcs ne contribuant pas au 1er ordre)
est vérifié numériquement, y compris avec des rayons inégaux, des centres non alignés et un
sens d'enroulement mixte (courroie croisée).

**Il n'y a donc pas de géométrie à réparer.** Et — deuxième résultat — il n'y a pas non plus de
problème de conditionnement _dans le cas fermé isolé_ : la contrainte converge en **1 à 3
balayages**, avec un résidu qui s'effondre de 8 px à 10⁻³ px puis 10⁻¹¹ px. C'est le
comportement d'une projection de Newton sur une contrainte quasi-linéaire, pas d'un glissement.

Si un glissement est observé en pratique sur une courroie fermée, il ne vient donc **ni du
gradient ni de la projection de `BeltLength` seule** : il faut chercher dans le couplage avec
les autres liens du balayage Gauss-Seidel — en particulier `BeltPin`, qui est le seul pont
entre les positions et les angles (section 4).

## Méthode

Harnais : [belt-closed-diagnostic.test.ts](src/components/solver/belt-closed-diagnostic.test.ts)
(vitest, convention du repo : fichier `.test.ts` à côté de la source).

- Aucune fonction de contrainte n'a été modifiée, aucune signature touchée, rien de nouveau
  exporté. Le gradient analytique est **transcrit** dans le harnais depuis
  [constraint-functions.ts:1129-1154](src/components/solver/constraint-functions.ts#L1129-L1154)
  (l'accumulateur est inliné dans la contrainte, il n'est pas appelable).
- La longueur est lue par la **même chaîne** que la contrainte :
  `belt_pieces(vias, true).reduce((a, p) => a + p.length, 0)` — segments tangents + arcs.
- Le lien `BeltLength` est fabriqué d'après le site de construction réel,
  [parsing.ts:549-563](src/components/solver/parsing.ts#L549-L563) (`belt_length_link`, branche
  `belt.closed` → `base` seul, sans `phaseKey`/`diff0`/`wound`).
- Le mode trace n'est activé que dans le test, via `collect_solver_trace`.

### Cas testés

| cas | poulies | rayons     | centres                           | sens    | masses      |
| --- | ------- | ---------- | --------------------------------- | ------- | ----------- |
| A   | 2       | 40, 40     | (−100, 0), (100, 0)               | ff      | 1, 1        |
| B   | 2       | 40, 40     | (−100, 0), (100, 0)               | ff      | **0**, 1    |
| C   | 3       | 50, 30, 20 | (−120, −30), (140, 20), (10, 160) | fff     | **0**, 1, 1 |
| D   | 2       | 55, 22     | (−73, −41), (118, 87)             | ff      | 1, 1        |
| E   | 3       | 45, 25, 35 | (−130, 0), (60, −110), (90, 95)   | f**t**f | 1, 1, 1     |

D et E sont les cas qui comptent : obliques, rayons inégaux, et pour E un sens d'enroulement
inversé sur la poulie du milieu. Une erreur de gradient s'y verrait ; A et B, symétriques, ne
prouveraient rien seuls.

## 1. Gradient numérique vs analytique

ε = 1e-4 × 200 px = **0.02 px**, différences centrées.

| cas | centre | grad_num               | grad_analytique        | ‖Δ‖      | écart relatif |
| --- | ------ | ---------------------- | ---------------------- | -------- | ------------- |
| A   | gA     | (−2.000000, 0.000000)  | (−2.000000, 0.000000)  | 1.82e-12 | 9.09e-13      |
| A   | gB     | (2.000000, 0.000000)   | (2.000000, 0.000000)   | 1.82e-12 | 9.09e-13      |
| B   | gA     | (−2.000000, 0.000000)  | (−2.000000, 0.000000)  | 1.82e-12 | 9.09e-13      |
| B   | gB     | (2.000000, 0.000000)   | (2.000000, 0.000000)   | 1.82e-12 | 9.09e-13      |
| C   | gA     | (−1.632351, −1.007173) | (−1.632351, −1.007173) | 2.50e-9  | 1.30e-9       |
| C   | gB     | (1.682810, −0.433685)  | (1.682810, −0.433685)  | 2.48e-9  | 1.43e-9       |
| C   | gC     | (−0.050458, 1.440858)  | (−0.050458, 1.440858)  | 3.37e-9  | 2.34e-9       |
| D   | gA     | (−1.644218, −1.101884) | (−1.644218, −1.101884) | 3.46e-9  | 1.75e-9       |
| D   | gB     | (1.644218, 1.101884)   | (1.644218, 1.101884)   | 3.47e-9  | 1.75e-9       |
| E   | gA     | (−1.913815, −0.158827) | (−1.913815, −0.158827) | 6.40e-10 | 3.33e-10      |
| E   | gB     | (0.554869, −1.104080)  | (0.554869, −1.104080)  | 2.55e-9  | 2.06e-9       |
| E   | gC     | (1.358947, 1.262907)   | (1.358947, 1.262907)   | 2.69e-9  | 1.45e-9       |

**Pire écart relatif : 2.338 × 10⁻⁹.**

Deux vérifications de cohérence au passage : sur le cas à 2 poulies le gradient vaut exactement
(∓2, 0) — écarter les centres de 1 px allonge les _deux_ brins de 1 px chacun, ce que la formule
donne bien ; et sur chaque cas Σ gradients ≈ 0, la longueur étant invariante par translation
globale (visible sur A/B/D, exact sur C/E aux arrondis près).

Note : la masse (`posMass = 0`) n'entre pas dans le gradient, seulement dans la projection —
c'est pourquoi B donne les mêmes gradients que A. C'est correct.

## 2. Traces de convergence

Départ : état de repos, puis **gB déplacé de +5 px sur x**. `stiffness = 1`.
Σw‖∇‖² est le dénominateur de la projection, recalculé dans le harnais à partir des gradients
analytiques de l'état pré-balayage (aucun log ajouté dans la contrainte).

**A — 2 poulies, rayons égaux, centres libres** — L₀ = 651.3274 px

| balayage | \|C\| (px) | Σw‖∇‖² | déplacement max (px) |
| -------- | ---------- | ------ | -------------------- |
| 0        | 1.0000e+1  | 8.0000 | 2.500000             |
| 1        | 0.0000e+0  | 8.0000 | 0.000000             |

**B — 2 poulies, rayons égaux, gA ancré** — L₀ = 651.3274 px

| balayage | \|C\| (px) | Σw‖∇‖² | déplacement max (px) |
| -------- | ---------- | ------ | -------------------- |
| 0        | 1.0000e+1  | 4.0000 | 5.000000             |
| 1        | 0.0000e+0  | 4.0000 | 0.000000             |

**C — 3 poulies, rayons inégaux, gA ancré** — L₀ = 906.7867 px

| balayage | \|C\| (px) | Σw‖∇‖² | déplacement max (px) |
| -------- | ---------- | ------ | -------------------- |
| 0        | 8.4484e+0  | 5.1017 | 2.896299             |
| 1        | 9.9214e-3  | 5.0777 | 0.003414             |
| 2        | 1.3841e-8  | 5.0777 | 0.000000             |
| 3        | 0.0000e+0  | 5.0777 | 0.000000             |

**D — 2 poulies, rayons inégaux, oblique** — L₀ = 706.4950 px

| balayage | \|C\| (px) | Σw‖∇‖² | déplacement max (px) |
| -------- | ---------- | ------ | -------------------- |
| 0        | 8.2554e+0  | 7.8410 | 2.084665             |
| 1        | 1.5178e-3  | 7.8352 | 0.000383             |
| 2        | 5.3092e-11 | 7.8352 | 0.000000             |
| 3        | 1.1369e-13 | 7.8352 | 0.000000             |

**E — 3 poulies, rayons inégaux, sens mixtes** — L₀ = 968.6454 px

| balayage | \|C\| (px) | Σw‖∇‖² | déplacement max (px) |
| -------- | ---------- | ------ | -------------------- |
| 0        | 2.8287e+0  | 8.6649 | 0.627357             |
| 1        | 7.5662e-5  | 8.6639 | 0.000017             |
| 2        | 2.2737e-13 | 8.6639 | 0.000000             |

Lecture : décroissance **quadratique** (8.25 → 1.5e-3 → 5.3e-11 sur D), pas de stagnation, pas
d'oscillation. Le dénominateur est stable d'un balayage à l'autre (5.10 → 5.08 ; 7.84 → 7.835)
et d'ordre 4–9, c'est-à-dire O(1) par centre : gradients unitaires, aucun mauvais
conditionnement intrinsèque. La contrainte fermée, **seule**, est saine.

Le cas A illustre au passage la mécanique attendue : les deux centres se partagent la correction
(2.5 px chacun) ; en B, gA étant ancré, gB encaisse les 5 px. Σw‖∇‖² passe de 8 à 4 en
conséquence, ce qui est exactement le rôle de la mobilité dans le dénominateur.

## 3. DOF partagés entre `BeltLength` et `BeltPhaseGear`

Cas A, résolu par `PBD_kinematic_solver` avec un `HandleGrab` sur gA, plus les deux
`BeltPhaseGear` que le parseur émet pour toute courroie
([parsing.ts:650-674](src/components/solver/parsing.ts#L650-L674) — les courroies fermées en
reçoivent aussi). Relevé via `collect_solver_trace` sur 20 balayages :

| lien            | DOF écrits         |
| --------------- | ------------------ |
| `BeltLength`    | `pos:gA`, `pos:gB` |
| `BeltPhaseGear` | _(aucun)_          |
| `HandleGrab`    | `pos:gA`           |

**Intersection `BeltLength` ∩ `BeltPhaseGear` : vide.** Il n'y a pas de vol mutuel de correction
entre ces deux liens — et il ne peut pas y en avoir par construction : la branche fermée de
`BeltLength` n'écrit que dans `positions` (et `radii` en édition), jamais dans `angles`
([constraint-functions.ts:1274-1285](src/components/solver/constraint-functions.ts#L1274-L1285)),
tandis que `BeltPhaseGear` n'écrit que dans `angles`
([constraint-functions.ts:1699-1700](src/components/solver/constraint-functions.ts#L1699-L1700)).
Les clés `gearPosKeys` et `gearAngleKeys` sont pourtant _la même chaîne_ (l'id de la poulie),
mais dans deux maps distinctes — la collision est nominale, pas réelle.

En revanche `BeltLength` et `HandleGrab` se partagent bien `pos:gA` : c'est le couplage normal
d'un Gauss-Seidel, et c'est là qu'il faudra regarder si un glissement apparaît sur un mécanisme
réel.

Dans ce relevé `BeltPhaseGear` n'a **rien écrit du tout** : son résidu `C = r·ε·(θ − θ₀) − φ`
part de 0 et rien ne l'en fait sortir. C'est normal — mais uniquement parce qu'il manquait un
lien à ce montage. Voir la section suivante.

## 4. Qui fait tourner les poulies : `BeltPin`

`BeltLength` fermé n'écrit jamais un angle. La question est donc : par où passe la rotation
quand on déplace un centre ?

Réponse mesurée : par **`BeltPin`**. Toute courroie fermée en reçoit un
([parsing.ts:331-335](src/components/solver/parsing.ts#L331-L335)), inconditionnellement dès
qu'elle a une poulie — son `nodeKey` est le nœud de jonction `${belt.id}:start` (départ et
arrivée fusionnés). Ce lien pose le nœud de jonction à l'abscisse curviligne
`s = s₀ + r·ε·(θ_ref − θ_ref0)` sur la boucle, et partage l'écart tangentiel entre _glisser le
nœud_ et _avancer θ_ref_
([constraint-functions.ts:1545-1551](src/components/solver/constraint-functions.ts#L1545-L1551)).
Déplacer une poulie déforme la boucle, donc déplace le point cible sous le nœud, donc génère un
écart tangentiel, donc tourne la poulie de référence.

Cas A, gB tiré de x = 100 à x = 160 (jeu de liens complet : `BeltLength` + `BeltPin` +
2 × `BeltPhaseGear`), 200 balayages :

| montage        | θ_gA     | θ_gB     | φ          |
| -------------- | -------- | -------- | ---------- |
| sans `BeltPin` | 0.000000 | 0.000000 | 0.0000 px  |
| avec `BeltPin` | 0.372030 | 0.372030 | 14.8812 px |

Rotation cumulée écrite, par lien (montage avec `BeltPin`) :

| lien            | DOF écrits                         | rotation cumulée                                   |
| --------------- | ---------------------------------- | -------------------------------------------------- |
| `BeltLength`    | `pos:gA`, `pos:gB`                 | — (n'écrit pas d'angle)                            |
| `BeltPin`       | `pos:belt:start`, **`ang:gA`**     | 1.116091 rad sur gA                                |
| `BeltPhaseGear` | `ang:belt:phi`, `ang:gA`, `ang:gB` | 44.64 px sur φ, 0.744 rad sur gA, 0.372 rad sur gB |
| `HandleGrab`    | `pos:gB`                           | —                                                  |

La chaîne de transmission est donc, dans l'ordre :

1. `HandleGrab` / un moteur déplace un centre ;
2. `BeltLength` redistribue les centres pour conserver L₀ (positions seules) ;
3. `BeltPin` lit la boucle déformée et convertit l'écart tangentiel du nœud de jonction en
   **rotation de la poulie de référence** (`refIndex: 0`) — c'est l'unique pont
   positions → angles du cas fermé ;
4. `BeltPhaseGear` convertit θ_ref en φ (`r·ε·θ = φ`), puis φ en θ pour **chaque autre**
   poulie : c'est lui, et lui seul, qui transmet d'une poulie à l'autre.

Le résultat est mécaniquement juste : rayons égaux et même sens → θ_gA = θ_gB = 0.372 rad, et
φ = 40 × 0.372 = 14.88 px.

Deux conséquences pour la suite :

- **Sans jonction, pas de rotation.** Tout passe par `refIndex: 0` et par le nœud de jonction.
  Si une courroie fermée se retrouvait sans `BeltPin` (poulies absentes au parsing, lien
  filtré…), la courroie tiendrait sa longueur mais ne transmettrait plus rien — silencieusement.
  Je n'ai pas cherché si ce cas peut réellement survenir.
- **Le pont est asymétrique.** `BeltPin` n'écrit que `ang:gA` (la poulie de référence) ; les
  autres poulies ne reçoivent leur rotation qu'au second temps, via φ. Dans un balayage
  Gauss-Seidel cela introduit un retard d'un lien entre la géométrie et les poulies non
  référence. C'est le premier endroit où je regarderais un glissement — mais je n'ai pas mesuré
  ce retard, c'est une piste, pas un résultat.

Enfin, sur ce montage complet l'intersection des DOF reste vide entre les trois liens de
courroie : ils communiquent par l'**état** (la géométrie de la boucle), pas par des DOF partagés.

## Portée de ce diagnostic

Ce qui est mesuré : gradient positionnel de la longueur, cas fermé, `wraps` géométriques,
configurations non dégénérées. Ce qui ne l'est pas et resterait à vérifier séparément :

- le gradient au voisinage d'une **dégénérescence** (poulies presque tangentes, arc proche de 0
  ou de 2π) — `belt_pieces` y change de régime et le wrap géométrique ∈ [0, 2π) y est
  discontinu ;
- le gradient quand `wraps` (enroulement continu) est fourni : l'arc devient `r·|wrap|` et ne
  dépend plus des positions, ce qui change `∂L/∂centre` — non couvert ici ;
- le gradient par rapport aux **rayons** en édition (`∂L/∂r = wrap`), non testé ;
- les branches terminaux libres / treuil / `gearTooth`, hors périmètre ;
- le gradient de `BeltPin` (le pont positions → angles) : non vérifié ici, alors que c'est
  désormais le suspect n° 1.
