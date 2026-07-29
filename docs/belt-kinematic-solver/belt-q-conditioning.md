# Conditionnement PBD du modèle « q » : quatre mesures

Suite de [belt-q-model-design.md](./belt-q-model-design.md), qui a validé la **structure** du
no-slip par segment (forme de la loi, rang, solutions) mais laissait ouvert le **conditionnement
de la projection PBD** — « rang plein ≠ Gauss-Seidel qui converge vite ». Cette note mesure, dans
le **vrai solveur**, ce qui restait au conditionnel.

Banc jetable, derrière le flag `USE_Q_MODEL` (le solveur reste strictement intact à flag off) :
- [experimental/belt-noslip-q.ts](../../src/components/solver/experimental/belt-noslip-q.ts) — la loi
  de segment exécutable (`applyBeltSegmentNoSlip`, options 1 et 2) + le builder qui bake `h⁰`/`θ⁰` ;
- [experimental/belt-q-bench.ts](../../src/components/solver/experimental/belt-q-bench.ts) — géométries
  et mesures ;
- les harnais [belt-q-conditioning.bench.test.ts](../../src/components/solver/belt-q-conditioning.bench.test.ts)
  (Q1), [-q2](../../src/components/solver/belt-q-conditioning-q2.bench.test.ts),
  [-q3](../../src/components/solver/belt-q-conditioning-q3.bench.test.ts),
  [-q4](../../src/components/solver/belt-q-conditioning-q4.bench.test.ts).

Ajouts au solveur, **additifs et morts à flag off** : la variante `BeltSegmentNoSlip` de l'union
`Link`, son cas dans `keys_of` ([utils.ts:79](../../src/components/solver/utils.ts#L79)) et un cas de
dispatch dans [PBD_kinematic_solver.ts](../../src/components/solver/PBD_kinematic_solver.ts). Aucune
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

4. **Le q-modèle ne bloque pas la montée du Core XY — et la cause est l'ARBITRAGE, pas la
   raideur ni l'échelle.** Le baseline « 1630 » est **périmé** (la contrainte `Angle` a été
   réécrite en vraie projection PBD ; le φ-modèle actuel est sain, pire résidu **0.21 px**).
   Banc **dé-biaisé** (mesure 1) : même sans rien démonter (q + `BeltLength` complet), la montée
   ne bloque qu'à **13 %** (86.9/100) ; en longueur-seule, ~3 %. La mollesse est donc **réelle**,
   pas un artefact — mais le banc biaisé en avait **gonflé la sévérité** (3 % → 13 %). La sonde
   survie/demande (mesure 2) tranche : le pire q-lien **demande 1.21 rad** par application et il
   en **survit 3.7e-10** (survie/demande = **0.000**), sur l'angle de la poulie **bloquée** — le
   no-slip pousse fort dans le bon sens et se fait **écraser à chaque balayage** par le
   `GearPerimeterPin` ancré qui épingle cet angle. Ce n'est **pas** un effet d'échelle des brins
   longs (mesure 3 : `denom = rEpsA²+rEpsB²` = 800 pour un brin de 106 px comme de 1001 px,
   ratio 1.0000). **Un 5ᵉ chantier est justifié, mais sur l'ARBITRAGE** — la concurrence entre le
   no-slip et les contraintes qui épinglent l'angle (et l'absence d'autorité positionnelle de
   l'option 1 pour résister au chariot), **pas** sur « rendre le no-slip plus raide » (la demande
   est déjà énorme, la raccroître ne change rien tant que la survie est nulle).

---

## Q1 — vitesse de convergence de la chaîne, et rôle du tri

### La fonction de tri existante

C'est [`sort_links`](../../src/components/solver/utils.ts#L89), appelée en simulation
([kinematic-simulation.ts:308](../../src/components/solver/kinematic-simulation.ts#L308)) et en édition
([geometric-solver.ts:390](../../src/components/solver/geometric-solver.ts#L390)). Ce qu'elle optimise
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
correctif que [contrainte-angle.md](./contrainte-angle.md) recommandait : `λ = −C/Σwᵢ‖∇ᵢC‖²`,
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
chariot monte à 96.7 % — presque autant que le φ-modèle.

### Mesure 1 — dé-biaiser le banc

Le premier chiffre était biaisé : neutraliser le `simFeed` de `BeltLength` retire aussi le
no-slip terminal `C_diff`, donc démonte une pièce du blocage avant de mesurer. On refait le suivi
de la montée (cible 100 px) **sans** ce démontage :

| configuration                                         | montée du chariot | résidu no-slip |
| ----------------------------------------------------- | ----------------- | -------------- |
| φ-modèle (référence)                                  | 96.8 / 100        | 0.00           |
| **(a)** q + `BeltLength` **complet** (`simFeed` actif) | **86.9 / 100**    | 80.80          |
| **(b)** q + `BeltLength` longueur-seule (cible refonte) | 96.7 / 100        | 72.53          |

Le « ~3 % de blocage » d'origine **était** en partie un artefact : rien démonté (a), le blocage
monte à **13 %** (86.9/100). Mais 13 % reste « ça passe » — la mollesse est **réelle**, le banc
n'en avait gonflé que la sévérité. (b) est l'état cible post-refonte, et il ne bloque presque pas.

### Mesure 2 — l'arbitrage, pas la raideur

Sonde survie/demande sur le **pire** q-lien de la montée (celui qui straddle la poulie bloquée,
angle `695de818`) : par application, le Δθ qu'il **demande** vs le Δθ qui **survit** au reste du
balayage.

| balayage | Δθ demandé | Δθ survivant (fin de balayage) | survie/demande |
| -------- | ---------- | ------------------------------ | -------------- |
| 250      | 1.21 rad   | 3.7e-10                        | **0.000**      |
| …        | 1.21 rad   | 3.7e-10                        | **0.000**      |
| 257      | 1.21 rad   | 3.7e-10                        | **0.000**      |

Verdict sans ambiguïté : le no-slip **pousse fort** (1.21 rad par application, dans le bon sens) et
il est **entièrement écrasé** chaque balayage (survie ~0). C'est un problème d'**arbitrage**, pas
de raideur — la poulie visée est **gelée par un `GearPerimeterPin` ancré** (poulie sur le bâti),
qui réécrit l'angle aussitôt. L'option 1 n'écrivant que cet angle épinglé, elle n'a **aucune
autorité positionnelle** pour retenir le chariot : le no-slip constate la violation mais ne peut
pas l'empêcher.

### Mesure 3 — pas d'effet d'échelle

Les « brins > 1000 px » ne sont pas en cause. Le dénominateur de la projection (option 1) vaut
`rEpsA² + rEpsB²`, fonction des **rayons seuls** :

| brin           | ℓ       | denom |
| -------------- | ------- | ----- |
| court          | 106 px  | 800.0 |
| long           | 1001 px | 800.0 |

Ratio long/court = **1.0000**. Le denom est insensible à la longueur du brin — l'hypothèse « trop
mou à cause des brins longs » **tombe**. La cause est l'arbitrage (mesure 2), pas l'échelle.

### Le couplage angle↔courroie subsiste

Les verrous d'angle **doublent** le résidu courroie du q-modèle (pire résidu par lien, saisie
type, balayages ≥ 250) : **10.84 avec `Angle` vs 5.36 sans**. Même corrigée, la contrainte `Angle`
rend la courroie plus difficile à converger — cohérent avec la mesure 2 (une contrainte de plus qui
se dispute l'angle).

### Verdict

Le q-modèle **seul ne suffit pas** à ramener Core XY à un blocage sain, et la cause est nommée : un
**arbitrage** perdu, pas une raideur ni une échelle. Le no-slip demande la bonne correction
(1.21 rad) mais elle ne survit pas au balayage (0.000), écrasée par le `GearPerimeterPin` qui
épingle la poulie bloquée ; et l'option 1, en n'écrivant que des angles, n'a pas de levier pour
retenir le chariot. **Un 5ᵉ chantier est justifié — sur l'arbitrage, pas sur la raideur** :

- **ne pas** « rendre le no-slip plus raide » — la demande est déjà de 1.21 rad, la survie de 0 ;
- donner au no-slip une **autorité positionnelle** (une forme d'option 2) pour qu'une violation
  résiste au chariot au lieu de ne toucher qu'un angle épinglé — à mettre en balance avec la
  concurrence `BeltLength` mesurée en Q2, **non testée ici pour le blocage** ;
- ou traiter l'**arbitrage** entre le no-slip et le `GearPerimeterPin` sur une poulie ancrée, pour
  que l'incompatibilité remonte comme résistance plutôt que d'être annulée en silence.

---

## Limites de cette note (à ne pas m'attribuer au-delà)

- **La mollesse est réelle mais l'autorité positionnelle n'a pas été testée pour le blocage.** La
  mesure 2 désigne l'arbitrage et l'absence de levier positionnel (option 1) ; savoir si l'option 2
  bloquerait effectivement reste à mesurer — Q2 ne l'a comparée que sur la **vitesse**, pas sur la
  capacité à bloquer.
- **Résidu q au repos = 0.064 px** (devrait être 0) : un petit défaut de baking/continuité sur les
  courroies fusionnées, 100× plus petit que le plafond de 6.8 px — il ne change pas le verdict mais
  reste à nettoyer dans l'implémentation finale.
- **Option 2 mesurée sur le seul gradient de ℓ** (terme d'enveloppe). Les termes d'arc ne sont pas
  écrits en position — ils restent portés exactement par le résidu d'angle. Une option 2 « complète »
  (gradients d'arc en position) n'a pas été testée ; c'est un candidat pour le 5ᵉ chantier (autorité
  positionnelle), pas pour le choix de Q2.
