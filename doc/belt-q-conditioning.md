# Conditionnement PBD du modèle « q » : quatre mesures

Suite de [belt-q-model-design.md](doc/belt-q-model-design.md), qui a validé la **structure** du
no-slip par segment (forme de la loi, rang, solutions) mais laissait ouvert le **conditionnement
de la projection PBD** — « rang plein ≠ Gauss-Seidel qui converge vite ». Cette note mesure, dans
le **vrai solveur**, ce qui restait au conditionnel.

Banc jetable, derrière le flag `USE_Q_MODEL` (le solveur reste strictement intact à flag off) :
- [experimental/belt-noslip-q.ts](src/components/solver/experimental/belt-noslip-q.ts) — la loi
  de segment exécutable (`applyBeltSegmentNoSlip`, options 1 et 2) + le builder qui bake `h⁰`/`θ⁰` ;
- [experimental/belt-q-bench.ts](src/components/solver/experimental/belt-q-bench.ts) — géométries
  et mesures ;
- les harnais [belt-q-conditioning.test.ts](src/components/solver/belt-q-conditioning.test.ts)
  (Q1), [-q2](src/components/solver/belt-q-conditioning-q2.test.ts),
  [-q3](src/components/solver/belt-q-conditioning-q3.test.ts),
  [-q4](src/components/solver/belt-q-conditioning-q4.test.ts).

Ajouts au solveur, **additifs et morts à flag off** : la variante `BeltSegmentNoSlip` de l'union
`Link`, son cas dans `keys_of` ([utils.ts:79](src/components/solver/utils.ts#L79)) et un cas de
dispatch dans [PBD_kinematic_solver.ts](src/components/solver/PBD_kinematic_solver.ts). Aucune
signature existante changée, aucune contrainte courroie modifiée en place.

---

## Les quatre verdicts

1. **La chaîne converge en O(1) balayage avec le bon ordre — et le tri existant produit déjà cet
   ordre.** Sur une courroie **ouverte** (propagation pure), `sort_links` reconstruit l'ordre le
   long de la courroie même depuis une liste mélangée : **1 balayage** pour N = 3/5/8, contre
   **9/60/118** en ordre inversé. Mais sur une courroie **fermée**, aucun ordre ne donne O(1) :
   c'est **~O(N)** (7/11/44 balayages) quel que soit l'ordre, parce qu'une boucle est un cycle et
   que `BeltLength` re-perturbe la géométrie à chaque balayage. Le tri n'a donc rien à apprendre ;
   le levier n'est pas là pour les courroies fermées.

2. **Angles seuls (option 1).** Les deux options convergent au **même nombre de balayages**
   (fermée 7/11/44 identiques ; ouverte 6/53/117 vs 118), et l'option 2 introduit une
   **concurrence réelle avec `BeltLength` sur tous les centres** (3/5/8 clés partagées, jusqu'à
   224 balayages en conflit) sans le moindre gain. L'option 1 gagne : plus simple, zéro
   concurrence, même vitesse.

3. **Oui : sans le pilote `BeltPin`, le mode circulaire reste non excité, et le facteur 31
   disparaît.** (a) au repos, 500 balayages : `max|θ| = 0`, voyage `q̄ = 0` — aucune dérive
   spontanée. (b) un moteur seul fixe le voyage : `q = r·ε·θ = 6.600000` **uniforme** sur toutes
   les poulies. (c) le même mécanisme listé depuis 3 vias différents donne des θ identiques à
   **3.6e-14 rad** — le facteur 31 du diagnostic précédent a disparu. Le pilote parasite était
   bien le bug.

4. **Non : le modèle q seul ne suffit pas à Core XY, et il reste un couplage angle↔courroie.**
   Le baseline « 1630 » est **périmé** — la contrainte `Angle` a été réécrite en vraie projection
   PBD (arbre de travail), et le φ-modèle actuel est sain (pire résidu **0.21 px**). Branché dans
   le vrai solveur, le q-modèle **ne bloque pas** la montée du Core XY (le chariot suit à 96.7 %
   comme le φ-modèle) : son résidu no-slip **plafonne à 6.79 px** (point fixe dès le balayage 50,
   pas une convergence lente) pendant que la courroie glisse. La projection par segment est trop
   **molle** sur ces longues courroies ouvertes. Les verrous d'angle **doublent** le résidu
   courroie (10.84 avec `Angle` vs 5.36 sans) : le couplage angle↔courroie subsiste. **Un 5ᵉ
   chantier est justifié** — sur la force/conditionnement du no-slip, pas seulement sur son
   algèbre.

---

## Q1 — vitesse de convergence de la chaîne, et rôle du tri

### La fonction de tri existante

C'est [`sort_links`](src/components/solver/utils.ts#L89), appelée en simulation
([kinematic-simulation.ts:308](src/components/solver/kinematic-simulation.ts#L308)) et en édition
([geometric-solver.ts:390](src/components/solver/geometric-solver.ts#L390)). Ce qu'elle optimise
aujourd'hui : un **BFS depuis le bâti**. Elle indexe clé→liens, amorce sur le premier lien
touchant une clé ancrée (`posMass === 0`), propage en largeur par DOF partagés, et rejette les
`HandleGrab` en fin de liste. But : placer les liens dans l'ordre où l'information part du sol vers
la saisie. Ce n'est **pas** un parcours explicitement « le long de la courroie », mais sur une
chaîne ancrée à un bout, le BFS le reconstruit (voir ci-dessous).

### Propagation pure, courroie ouverte (géométrie figée, Δh ≡ 0)

θ(g0) perturbé de 1 rad, terminaux `q = 0` : la solution unique est θ ≡ 0, et on mesure la
diffusion de la correction. Balayages jusqu'à résidu no-slip < 1e-6 :

| N   | le long de la courroie | `sort_links` (entrée **mélangée**) | ordre **inversé** |
| --- | ---------------------- | ---------------------------------- | ----------------- |
| 3   | **1**                  | **1**                              | 9                 |
| 5   | **1**                  | **1**                              | 60                |
| 8   | **1**                  | **1**                              | 118               |

**O(1) avec le bon ordre, O(N) avec le mauvais.** Et `sort_links`, même nourri d'une liste
mélangée, retrouve l'ordre le long de la courroie (BFS depuis le terminal ancré) — donc **le tri
existant suffit** pour les no-slips d'une courroie ouverte.

### Courroie fermée réaliste (`BeltLength` + chaîne q, un centre +5 px)

Balayages jusqu'à résidu no-slip < 1e-6 :

| N   | ordre `sort_links` | ordre le long de la boucle |
| --- | ------------------ | -------------------------- |
| 3   | 7                  | 7                          |
| 5   | 11                 | 15                         |
| 8   | 44                 | 41                         |

**~O(N), et l'ordre ne change quasiment rien.** Deux causes : une boucle fermée est un **cycle**
(le dernier segment referme sur le premier — aucun ordre linéaire n'est causal dans les deux sens),
et `BeltLength` **déplace les centres à chaque balayage**, si bien que la chaîne q poursuit une
géométrie mobile. Le tri n'est pas le levier ici.

---

## Q2 — DOF écrits : angles seuls vs angles + positions

Option 1 : la contrainte n'écrit que θ_a, θ_b (géométrie figée dans le résidu, corrigée par
`BeltLength`). Option 2 : elle écrit **aussi** les deux centres le long de la tangente du brin (le
gradient de ℓ, terme d'enveloppe — les mêmes DOF que `BeltLength`).

### Courroie fermée, un centre +5 px

| N   | opt 1 balayages | opt 2 balayages | opt 2 : balayages en concurrence `BeltLength` | clés partagées |
| --- | --------------- | --------------- | --------------------------------------------- | -------------- |
| 3   | 7               | 7               | 12                                            | 3 (toutes)     |
| 5   | 11              | 11              | 20                                            | 5 (toutes)     |
| 8   | 44              | 44              | 67                                            | 8 (toutes)     |

### Courroie ouverte, un centre +5 px

| N   | opt 1 balayages | opt 2 balayages | opt 1 concurrence | opt 2 concurrence  |
| --- | --------------- | --------------- | ----------------- | ------------------ |
| 3   | 6               | 6               | **0**             | 12 (3 clés)        |
| 5   | 53              | 53              | **0**             | 98 (5 clés)        |
| 8   | 118             | 117             | **0**             | 224 (5 clés)       |

**Vitesse identique** entre les deux options (à ±1 balayage), et l'option 2 écrit **exactement les
mêmes centres que `BeltLength`** à chaque balayage — une concurrence Gauss-Seidel réelle et
mesurée, pour zéro bénéfice. L'option 1 n'a **aucune** concurrence de position. **Recommandation
chiffrée : option 1.**

---

## Q3 — le mode circulaire sans le pilote `BeltPin`

Courroie fermée à 5 poulies, aucune contrainte n'ancre le voyage.

**(a) au repos, 500 balayages, aucun pilote :** `max|θ| = 0.000e+0 rad`, voyage `q̄ = 0.000e+0`.
Le mode nul (q uniforme) n'est **pas excité** — un mode qu'aucune contrainte ne pousse reste où il
est, comportement PBD attendu. Aucune dérive spontanée.

**(b) un moteur sur g0 (cible 0.3 rad) :** θ(g0) = 0.300000, et le flux est **uniforme** —

| poulie | θ        | q = r·ε·θ    |
| ------ | -------- | ------------ |
| g0     | 0.300000 | **6.600000** |
| g1     | 0.220490 | **6.600000** |
| g2     | 0.330733 | **6.600000** |
| g3     | 0.452257 | **6.600000** |
| g4     | 0.254307 | **6.600000** |

Une seule source fixe tout le voyage, exactement comme le prédit l'algèbre (`test motor.py` du
design).

**(c) le même mécanisme listé depuis 3 vias différents** (moteur sur g0, g1 déplacé) :

| poulie | θ (départ 0) | θ (départ 1) | θ (départ 2) |
| ------ | ------------ | ------------ | ------------ |
| g0     | 0.300000     | 0.300000     | 0.300000     |
| g1     | 0.321626     | 0.321626     | 0.321626     |
| g2     | 0.272134     | 0.272134     | 0.272134     |
| g3     | 0.402541     | 0.402541     | 0.402541     |
| g4     | 0.244428     | 0.244428     | 0.244428     |

Écart max entre listages : **3.6e-14 rad**. Le facteur 31 (0.0234 vs 0.1277 selon le listage,
diagnostic précédent §3) a **disparu** — il était bien créé par le pilote `BeltPin`, pas par la
cinématique.

**(contrôle) le blocage est correct mais MOU.** Courroie fermée au repos (flux uniforme obligé),
g2 gelée par un `GearPerimeterPin` ancré (centre sur le bâti), moteur sur g0 (cible 0.3). Le
blocage exact voudrait θ(g0) → 0 (q uniforme avec q(g2) = 0 ⇒ q ≡ 0). Mesuré : **θ(g0) = 0.118**
(bloqué à 61 %), θ(g2) = 0.040 (la poulie « gelée » fuit). La projection résiste dans le **bon
sens** mais n'impose pas un blocage dur — ce qui annonce Q4.

---

## Q4 — interaction avec les verrous d'angle (Core XY)

### Le baseline 1630 est périmé

`applyAngleConstraint` a été **réécrite en vraie projection PBD** dans l'arbre de travail (le
correctif que [contrainte-angle.md](doc/contrainte-angle.md) recommandait : `λ = −C/Σwᵢ‖∇ᵢC‖²`,
`∇_{s}C = +perp(v)/‖v‖²`). Le pire résidu « 1630 avec les `Angle`, 1.9 sans » appartient à
l'**avant-correctif**. Baseline actuel du φ-modèle, saisie type, pire résidu par lien
(balayages ≥ 250) :

| φ-modèle              | pire résidu | pire lien courroie |
| --------------------- | ----------- | ------------------ |
| moteur, avec `Angle`  | **0.21**    | BeltPhaseGear 0.21 |
| moteur, sans `Angle`  | 0.21        | BeltPhaseGear 0.21 |
| grab, avec `Angle`    | 0.21        | BeltPhaseGear 0.21 |

Le φ-modèle est **sain** aujourd'hui — parce qu'il laisse la courroie **glisser** (la montée passe
sans que rien ne proteste, cf. diagnostic §4).

### Le q-modèle ne bloque pas la montée

Suivi du chariot, cible 100 px (30 frames) :

| axe                                  | φ-modèle              | q-modèle              |
| ------------------------------------ | --------------------- | --------------------- |
| **montée** (flux via poulie bloquée) | −96.8 (passe, le bug) | **−96.7 (passe aussi)** |
| **translation x** (flux uniforme)    | 1.1 (bloqué)          | 96.1 (passe)          |

Le q-modèle **devrait** interdire la montée (§3.2 du design : incompatibilité 118 px). Or le
chariot monte à 96.7 % — presque autant que le φ-modèle. Pire résidu par lien après montée +
translation :

| q-modèle           | BeltSegmentNoSlip | BeltLength | pire non-courroie | overall   |
| ------------------ | ----------------- | ---------- | ----------------- | --------- |
| grab, avec `Angle` | **10.84**         | 2.37       | Distance 1.69     | **10.84** |
| grab, sans `Angle` | **5.36**          | 0.57       | FixedOnSegment 0.34 | **5.36** |

Et le résidu no-slip **plafonne** — sur une montée de 10 px, il est constant à partir du
balayage 50 :

| balayage | 0     | 10    | 50    | 100   | 200   | 299   |
| -------- | ----- | ----- | ----- | ----- | ----- | ----- |
| résidu q | 6.064 | 6.480 | 6.786 | 6.787 | 6.787 | 6.787 |

Ce n'est **pas** une convergence lente : c'est un **point fixe** où le no-slip est violé de ~6.8 px
en permanence tandis que la courroie glisse. La projection par segment est trop molle pour
l'emporter contre `BeltLength` + le grab + les `GearPerimeterPin` sur ces longues courroies
ouvertes (brins > 1000 px). Le blocage à 61 % du contrôle Q3 se dégrade à ~3 % ici.

### Le couplage angle↔courroie subsiste

Les verrous d'angle **doublent** le résidu courroie du q-modèle : **10.84 avec `Angle` vs 5.36
sans**. Même avec la contrainte `Angle` corrigée, elle rend la courroie plus difficile à
converger. Ce n'est donc pas seulement un problème de courroie isolée.

### Verdict

Le q-modèle **seul ne suffit pas** à ramener Core XY à un blocage sain : sa projection PBD par
segment est **trop faible / mal conditionnée** sur les longues courroies ouvertes réelles (elle
plafonne violée à ~6.8 px pendant que la montée passe). Il **reste un couplage angle↔courroie**
(résidu ×2). **Un 5ᵉ chantier est justifié**, portant sur la force du no-slip — par exemple un
couplage plus raide, une sous-résolution de la courroie, ou l'écriture des positions par le
no-slip d'une façon qui ne concurrence pas `BeltLength` (l'option 2 telle quelle ne le fait pas).

---

## Limites de cette note (à ne pas m'attribuer au-delà)

- **Le blocage faible du Core XY est en partie imputable au banc**, pas seulement au modèle : pour
  isoler le q, j'ai **neutralisé le `simFeed` de `BeltLength`** (`phaseKey = undefined`), ce qui
  retire aussi le blocage en x que `C_diff` fournissait. Aucun réglage de raideur n'a été tenté.
  Le contrôle Q3 confirme que l'`apply` résiste dans le bon sens ; c'est la **force**, pas la
  direction, qui manque.
- **Résidu q au repos = 0.064 px** (devrait être 0) : un petit défaut de baking/continuité sur les
  courroies fusionnées, 100× plus petit que le plafond de 6.8 px — il ne change pas le verdict mais
  reste à nettoyer dans l'implémentation finale.
- **Option 2 mesurée sur le seul gradient de ℓ** (terme d'enveloppe). Les termes d'arc ne sont pas
  écrits en position — ils restent portés exactement par le résidu d'angle. Une option 2 « complète »
  (gradients d'arc en position) n'a pas été testée ; vu que l'option 2 partielle n'apporte déjà rien
  et ne fait qu'ajouter de la concurrence, ça n'a pas paru justifié.
- **Le plafond de 6.8 px n'a pas été décomposé** entre « incompatibilité correctement détectée » et
  « projection trop molle ». Les deux coexistent probablement ; le fait tranchant est que le chariot
  **bouge** (glissement réel), donc le blocage n'est pas effectif quelle qu'en soit la part.
