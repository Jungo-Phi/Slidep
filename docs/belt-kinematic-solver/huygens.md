# Huygens — étape B du plan avant-prod

Une question : les résidus de 2.4 à 3.5 px que Huygens laissait au q-modèle sont-ils de la
lenteur ou un point fixe déchiré ?

**Ni l'un ni l'autre : ils n'existent pas.** Ils avaient été mesurés **sans agrégats**. Avec
les agrégats, Huygens converge à **1.04e-3 px**, tandis que la production φ y reste déchirée à
**2.93 px** avec son moteur bloqué à **58 %** de sa consigne. Huygens n'est pas un obstacle à la
mise en production, c'est un argument pour.

Banc : [belt-huygens.bench.test.ts](../../src/components/solver/belt-huygens.bench.test.ts).

---

## 0. Le mécanisme

Une courroie **fermée**, 4 poulies de rayons 100, 200, 100, 399.9, dont **2 centres sur 4 sont
libres** — c'est le seul banc réel du dossier qui soit une boucle fermée à géométrie mobile.
12 nœuds de position dont 3 ancrés, 5 angles.

Deux coupures, et elles ne viennent pas de la même chose :

| angle | intéressé |
| --- | --- |
| `61d943` | `MotorAngle` (ω = 1.0472 rad/s) |
| `6aa96f` | `GearMeshAngle` |

C'est le seul mécanisme du dossier où une coupure est portée par un **engrènement** et non par un
moteur.

---

## 1. D'où venait le chiffre

Le 2.4–3.5 px vient de
[belt-angle-metric.bench.test.ts](../../src/components/solver/belt-angle-metric.bench.test.ts),
écrit à l'étape A du chantier métrique — donc **avant** l'agrégat, et son harnais installe le
q-modèle **sans agrégats**. Rejoué à l'identique : `BeltSegmentNoSlip = 2.45`,
`GearMeshAngle = 2.16` en métrique `rim` ; `3.51` et `2.69` en `unit`.

Ce banc rapporte par ailleurs le **maximum sur tous les balayages** de la frame, pas la valeur au
dernier balayage. Sur une résolution qui converge, ce maximum est la **première correction** de la
frame — c'est-à-dire le mouvement de la frame, pas un résidu. Les deux lectures sont à distinguer
partout où ce chiffre réapparaît.

---

## 2. Lent ou bloqué — point fixe, mais convergé

Depuis l'état à 200 frames, une frame de plus en faisant varier le nombre de balayages :

| balayages | agrégat | no-slip | `BeltLength` |
| --- | --- | --- | --- |
| 300 | 7.96e-4 | 5.29e-4 | 1.06e-3 |
| 1000 | 7.96e-4 | 5.29e-4 | 1.06e-3 |
| 3000 | 7.96e-4 | 5.29e-4 | 1.06e-3 |
| 10000 | 7.95e-4 | 5.28e-4 | 1.06e-3 |

Le résidu d'agrégat descend monotonement — 6.27e-2 au balayage 25, 3.97e-3 à 50, 7.90e-4 à 100 —
puis se pose. Multiplier les balayages par 33 gagne le troisième chiffre significatif. La course
complète à 3000 balayages donne le même état qu'à 300, pour 17.7 s contre 1.5 s.

C'est donc un point fixe, mais à un niveau **sous le bruit de bakage connu** (≈ 0.06 px au repos).
Rien à réparer.

---

## 3. Le résidu est porté par `BeltLength`

| configuration | pire résidu au dernier balayage | dérive longueur |
| --- | --- | --- |
| q + agrégats | **1.04e-3** (`BeltLength`) | 0.0000 |
| q seul | **1.49** (`GearMeshAngle`), 1.42 (no-slip) | 0.0000 |
| agrégats seuls, sans no-slip | 9.88e-4 (`BeltLength`) | 0.0000 |
| q + agrégats, **sans** `BeltLength` | **9.96e-7** | 0.0000 |
| agrégats seuls, sans `BeltLength` | **9.69e-7** | 0.0000 |

**Retirer `BeltLength` fait tomber tout le reste de trois ordres de grandeur.** Sur ce mécanisme
elle n'est pas neutre, elle est légèrement nuisible.

C'est précisément le cas que [solidite-agregat.md](./solidite-agregat.md) §5 listait comme non
mesuré : le verdict « pur préconditionneur » y valait pour le Core XY (courroies ouvertes), pas
pour une **boucle fermée à géométrie mobile** — le cas qui avait motivé de la garder. Huygens en
est une. Le trou est comblé, et dans le sens de la décision déjà prise : en présence d'une coupure,
les agrégats remplacent `BeltLength`.

Le no-slip par brin, lui, **n'apporte rien ici** : les agrégats seuls font aussi bien. À ne pas
généraliser — avec 2 coupures sur une boucle de 4 poulies, les 2 agrégats suffisent probablement à
déterminer le système.

---

## 4. Ni sur-contraint, ni défaut de bakage

Témoin tous moteurs à ω = 0, 200 frames : production φ à **4.8e-13**, q + agrégats à **1.05e-12**.
La géométrie au repos n'a rien d'incompatible et le bakage est sain ; le résidu est entièrement
produit par le mouvement.

Le comptage DOF donne une marge positive partout (φ : 18 + 6 contre 20 ; q + agrégats : 18 + 5
contre 22). Il ne porte pas la conclusion : un comptage naïf ne voit pas la redondance, donc une
marge positive ne prouve pas l'absence de sur-contrainte. C'est le témoin à ω = 0 qui tranche.

---

## 5. Contre la production — le retournement

| | pire résidu au dernier balayage |
| --- | --- |
| **production φ** | `BeltPhaseGear` = **2.93** px, `GearMeshAngle` = **1.54** px |
| **q + agrégats** | 1.04e-3 px |

C'est la **production** qui est déchirée sur Huygens. Et le moteur le dit : ω = 1.0472 rad/s sur
200 frames à dt = 1/60 commande exactement 200.0°.

| angle | φ | q + agrégats |
| --- | --- | --- |
| `61d943` (**moteur**) | 116.54° | **200.00°** |
| `41d77d` (poulie 0) | −231.39° | −201.26° |
| `6be72d` (poulie 2) | −232.23° | −201.26° |
| `6aa96f` (poulie 3, r = 400) | −57.86° | −0.63° |
| `c15c0b` (engrenage lié) | 230.38° | 2.52° |

En production le moteur n'atteint que **58 %** de sa consigne. Avec les agrégats il tourne
exactement comme commandé.

Les centres mobiles finissent jusqu'à **914 px** l'un de l'autre entre les deux modèles. Ce chiffre
ne se lit pas comme « deux solutions valides » : comparer deux géométries dont l'une ne satisfait
pas ses contraintes n'a pas de sens.

---

## 6. Limites

- **La justesse mécanique de la géométrie du q-modèle n'est pas établie.** Résidu nul veut dire
  « les contraintes sont satisfaites », pas « c'est ce que ferait la machine ». La poulie de 400 px
  de rayon qui reste immobile pendant que le moteur fait 200°, et l'engrenage lié qui ne bouge que
  de 2.5°, demandent une vérification visuelle qu'aucun banc ne remplace.
- **Aucune saisie n'a été testée**, seulement le moteur libre.
- Les résidus sont ceux de la **frame 200** seule : le traçage ne couvre que la dernière frame,
  une frame intermédiaire pourrait être pire.
- Le fait que `BeltLength` nuise est mesuré sur **un** mécanisme.
- Le banc a demandé un paramètre `sweeps` optionnel sur `step_simulation` (défaut 300, production
  inchangée) — exception assumée à la règle « aucune signature publique changée ».
