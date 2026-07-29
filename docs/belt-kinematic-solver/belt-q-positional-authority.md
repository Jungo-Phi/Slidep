# Autorité positionnelle du no-slip q : le banc qui infirme l'hypothèse

Suite de [belt-q-conditioning.md](./belt-q-conditioning.md) §Q4, qui avait montré que le no-slip
q en **option 1** (angles seuls) ne bloque pas la montée du Core XY : la contrainte demande
1.21 rad par application et il en survit 3.7e-10, écrasée par le `GearPerimeterPin` de la poulie
ancrée. Hypothèse testée ici : **donner au no-slip une autorité positionnelle** (écrire aussi les
centres/extrémités, gradients tangent + arc) permettrait au blocage de s'imposer.

**Verdict : l'hypothèse est infirmée. L'autorité positionnelle est contre-productive** — elle rend
le no-slip *complaisant* au lieu de résistant. Les gradients sont pourtant exacts (mesure 1) ; le
problème est structurel, pas numérique.

Banc jetable derrière `USE_Q_MODEL` (solveur intact à flag off, ajouts additifs), option 1 (Q2) +
la variante `authority: "full"` :
[experimental/belt-noslip-q.ts](../../src/components/solver/experimental/belt-noslip-q.ts)
(`segmentPositionalGradient`), harnais
[belt-q-positional-authority.bench.test.ts](../../src/components/solver/belt-q-positional-authority.bench.test.ts).

---

## Les cinq réponses

1. **Les gradients positionnels (tangent + arc) sont corrects.** `∂C/∂centre` analytique vs
   différences finies centrées, sur 3 géométries dont mixte-rayons et croisée (sens mixtes) :
   **écart relatif max 4.5e-11** — bien sous le repère 2.3e-9 de `BeltLength`. La composante
   normale (le terme d'**arc**, que l'option 2 de Q2 ignorait) est bien présente et exacte.

2. **NON — l'autorité positionnelle ne bloque pas la montée ; elle DÉBLOQUE tout.** Test contrôlé
   propre (courroie fermée, poulie gelée, moteur) : le blocage exact veut θ → 0. Option 1 tient
   à **θ = 0.118** (bloqué à 61 %) ; l'autorité complète **dérive à θ = 0.278** (bloqué à 7 %) et
   **empire avec les itérations** — elle converge vers la cible du moteur, c'est-à-dire *aucun*
   blocage. Sur le Core XY réel, elle laisse passer la montée (94.2 %) **et casse le blocage en x**
   que le φ-modèle tenait (94.2 % au lieu de 0.3 %). Aucun mouvement diagonal ne se forme : les
   deux axes deviennent libres. C'est l'**inverse** du comportement analytique attendu (§3.2 :
   poulie bloquée ⇒ seule la diagonale libre).

3. **La concurrence avec `BeltLength` est bénigne (elle converge) — ce n'est pas là qu'est le
   problème.** Sur une courroie saine, option 1 et autorité complète convergent **toutes deux en
   11 balayages** (résidu final 1e-13). Pas d'oscillation, pas de divergence : l'implémentation est
   saine, la complaisance du point 2 est un **vrai comportement**, pas un artefact numérique. Sous
   la montée Core XY, le résidu no-slip **plafonne** (~68 px), mais c'est la même compliance —
   le solveur trouve un point fixe où le no-slip est satisfaisable *par déformation*.

4. **`BeltLength` n'est pas redondante à convergence** (résidu ~0.06 px, non nul mais petit). Elle
   contraint encore la **longueur totale** que les no-slips par segment ne fixent pas à eux seuls.
   Mais ce point est **secondaire** : l'autorité positionnelle étant rejetée, la question de la
   redondance ne tranche rien pour la refonte.

5. **NON-RÉGRESSION ÉCHOUÉE.** L'autorité complète **casse** le blocage en x qui marchait : sous une
   saisie de translation, le chariot suit à **94.2 %** (Δx = −94.2/−100) alors que le φ-modèle le
   bloquait à 0.3 %. Le « remède » supprime le seul blocage correct existant.

---

## Pourquoi : l'autorité positionnelle rend le no-slip complaisant

Le no-slip `C = q_a − q_b − (h − h⁰)` dépend des angles (via `q`) **et** de la géométrie (via
`h = ℓ + u_a − v_b`). En option 1, la seule façon de satisfaire `C = 0` est de faire tourner les
poulies (`q`). Si une poulie est gelée, `C` ne peut pas être annulé → la contrainte **reste violée
et pousse** : c'est le blocage.

En donnant les DOF de position, on ouvre une **seconde voie** pour annuler `C` : bouger les centres
et les extrémités pour ramener `h` — c'est-à-dire **déformer la courroie**. Le solveur prend cette
voie (moins « chère » que forcer l'angle gelé), satisfait `C` par redistribution géométrique, et
**cesse de résister**. Or cette redistribution des brins **est exactement le glissement** que le
diagnostic §4 avait identifié (« 116 px de courroie changent de camp entre deux brins ») et que le
no-slip était censé interdire. L'autorité positionnelle donne donc à la contrainte les moyens de
**réaliser le glissement qu'elle devait empêcher**.

Le point est structurel, pas de signe : les gradients sont exacts (mesure 1), la projection est le
PBD standard `λ = −C/Σwᵢ‖∇ᵢC‖²`, et sur une courroie saine tout converge (mesure 3). Plus il y a de
DOF dans la somme, plus la contrainte a de directions pour se satisfaire **sans** contraindre le
mouvement — c'est le contraire de ce qu'on voulait.

---

## Mesures brutes

### 1. Validité des gradients — `∂C/∂centre` analytique vs différences finies (ε = 1e-3)

Dérivation : `h_ab = ℓ + u_a − v_b` ne dépend que des deux centres du segment (les demi-arcs sont
fixés par la tangente a→b seule). En différentiant l'équation implicite de la tangente `d·n̂ = μ` :
`∂φ_t/∂c = ∓n̂/ℓ`, et comme `ψ_dep, ψ_arr = φ_t + const`, on obtient

$$\frac{\partial C}{\partial c_a} = \frac{d + (s_a - s_b)\,\hat n}{\ell}, \qquad \frac{\partial C}{\partial c_b} = -\frac{\partial C}{\partial c_a}$$

avec `d = c_b − c_a`, `n̂ = perp(t̂)`, `s_k = ε_k r_k` (0 pour un terminal). La composante
tangentielle vaut exactement `t̂` (le terme ℓ) ; la composante normale est le terme d'arc.

| géométrie              | segments testés | écart relatif max |
| ---------------------- | --------------- | ----------------- |
| A symétrique           | 3               | 2.5e-11           |
| B rayons mixtes        | 3               | 4.1e-11           |
| C sens mixtes (croisée) | 4              | 4.5e-11           |

**Pire écart : 4.5e-11.** Exemple (B, seg2) : analytique (0.9463, −0.3232) vs FD (0.9463,
−0.3232) — la composante −0.3232 est le terme d'arc, absent d'une autorité tangent-seule.

### 2. Blocage — test contrôlé (poulie gelée + moteur, cible 0.3, 0 = bloqué)

| itérations | option 1 (angles) | autorité complète |
| ---------- | ----------------- | ----------------- |
| 500        | 0.1176            | 0.1924            |
| 2000       | **0.1176**        | **0.2781**        |

Option 1 : blocage **stable à 61 %**. Autorité complète : blocage qui **se dégrade** vers la cible
du moteur (36 % → 7 %) à mesure que la courroie déforme.

### 2bis. Blocage — Core XY réel (saisie 100 px, 30 frames)

| saisie                 | φ-modèle       | option 1       | autorité complète |
| ---------------------- | -------------- | -------------- | ----------------- |
| montée (y)             | 96.8 (passe)   | 96.7 (passe)   | 94.2 (passe)      |
| translation (x)        | **0.3 (bloqué)** | —            | **94.2 (passe !)** |

Moteur seul, sans grab, 120 frames : chariot quasi immobile dans tous les modèles (φ 1.6 px,
option 1 0.0, complet 0.5) — le moteur est sur-contraint sur ce mécanisme, test peu discriminant ;
c'est la saisie qui révèle le (non-)blocage.

### 3. Santé de convergence (courroie fermée saine, centre +5 px)

| modèle             | balayages → résidu < 1e-6 | résidu final |
| ------------------ | ------------------------- | ------------ |
| option 1           | 11                        | 1.6e-13      |
| autorité complète  | 11                        | 8.9e-13      |

Identique — l'autorité complète n'est ni cassée ni instable.

### 3bis / 4. Concurrence et redondance sous la montée Core XY (autorité complète)

| balayage | résidu no-slip | résidu `BeltLength` |
| -------- | -------------- | ------------------- |
| 0        | 65.6           | 0.064               |
| 50       | 70.4           | 0.036               |
| 150      | 69.4           | 0.061               |
| 299      | 68.0           | 0.067               |

`BeltLength` reste **petit mais non nul** (~0.06 px, pas redondante : elle tient la longueur
totale). Le no-slip **plafonne** (~68 px) sans osciller : compliance, pas pathologie de
concurrence.

---

## Conséquence pour le 5ᵉ chantier

L'autorité positionnelle **n'est pas** la solution au blocage — elle l'aggrave. Le chantier doit
donc chercher ailleurs, en gardant l'**option 1** (angles seuls) qui, elle, bloque (partiellement)
en restant *rigide*. Le défaut de Q4 (le no-slip violé est écrasé par le `GearPerimeterPin` de la
poulie ancrée, sans propager de résistance) n'est **pas** un manque de DOF : c'est un problème
d'**arbitrage / propagation de l'incompatibilité**. Deux directions restent ouvertes, non testées
ici :

- traiter la chaîne no-slip d'une courroie comme un **sous-système résolu plus fortement** (bloc
  rigide) plutôt que segment-par-segment molasse, pour qu'une incompatibilité (poulie gelée)
  bloque au lieu de se diluer ;
- faire remonter l'incompatibilité détectée comme une **résistance** au moteur/à la saisie, sans
  donner à la contrainte la liberté de déformer la courroie.

Ce qu'il ne faut PAS faire est maintenant établi par la mesure : ni « rendre le no-slip plus
raide » (Q4), ni « lui donner de l'autorité positionnelle » (ici).

---

## Limites de cette note

- **Le test moteur-sans-grab est peu discriminant** sur « Core XY modifié » (moteur sur-contraint,
  chariot quasi immobile dans tous les modèles). Le blocage est mesuré par la saisie et par le test
  contrôlé synthétique, qui eux tranchent nettement.
- **Le free-relax (cran 5 px, relâché)** est dominé par la rigidité géométrique (sliders/poutres
  absorbent le cran dans toutes les directions) : il ne sépare pas non plus le rôle courroie. Seuls
  la saisie et le contrôle synthétique isolent le blocage — et concordent.
- **Résidu q au repos ~0.06 px** (hérité du tour précédent, baking) : négligeable devant les effets
  mesurés ici, mais à nettoyer dans l'implémentation finale.
