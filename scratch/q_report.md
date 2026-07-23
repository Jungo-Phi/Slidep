# Q2 — le système q, résolu par numpy.linalg (aucun solveur PBD)

## A — non-régression : courroie fermée à 2 poulies, flux uniforme

- matrice (2, 2), rang 1, dim(noyau) = 1
- vecteur du noyau : q = [1. 1.] → **q uniforme** (le voyage partagé)
- pour un voyage δ = 14.8812 px : θ = [0.372  0.5952] rad, rapport θ₂/θ₁ = 1.600000 (attendu r₁/r₂ = 1.600000)
- **Verdict A : identique au modèle actuel.** Sur une courroie fermée à flux uniforme, le noyau du système q EST exactement le φ partagé de `BeltPhaseGear` — le modèle q le contient comme cas particulier, il ne le contredit pas.

## B — Core XY : la poulie bloquée


### Saisie y — montée pure (116-118 px)

Déplacement réel du chariot : (0.0, -118.0) px

- **courroie ba6255f4 — bords libres** : 6×5, rang 5 (défaut de rang 0), ‖résidu‖∞ = 0.0175 px
  - flux requis : S = 0.00, 49f7cd61 = -0.00, 2dce1f85 = 118.10, 41ca57be = 118.08, 7ecfed8a = 118.06, f2eb95e4 = 0.02, E = 0.00
- **courroie 05cd7081 — bords libres** : 6×5, rang 5 (défaut de rang 0), ‖résidu‖∞ = 0.0175 px
  - flux requis : S = 0.00, ce6252dd = 0.02, 1fc55503 = -118.08, 344a2f5a = -118.06, 94d82b46 = -118.05, e69a0061 = -0.00, E = 0.00
- **courroie 05cd7081 — **1fc55503 bloquée (q = 0)**** : 6×4, rang 4 (défaut de rang 0), ‖résidu‖∞ = 59.0585 px
  - flux exigé à travers 1fc55503 sans blocage : **-118.08 px**. La contrainte impose 0 : **incompatibilité de 118.08 px** (les moindres carrés l'étalent en 2 × 59.06 px). Sans le blocage, l'incompatibilité vaut ΣΔh = ΔL = 0.105 px, c'est-à-dire zéro dès que `BeltLength` est active.

### Saisie x — translation le long du rail

Déplacement réel du chariot : (-119.3, 0.0) px

- **courroie ba6255f4 — bords libres** : 6×5, rang 5 (défaut de rang 0), ‖résidu‖∞ = 0.0940 px
  - flux requis : S = 0.00, 49f7cd61 = -119.23, 2dce1f85 = -118.80, 41ca57be = -118.71, 7ecfed8a = -118.61, f2eb95e4 = -118.75, E = 0.00
- **courroie 05cd7081 — bords libres** : 6×5, rang 5 (défaut de rang 0), ‖résidu‖∞ = 0.5209 px
  - flux requis : S = 0.00, ce6252dd = -118.80, 1fc55503 = -118.62, 344a2f5a = -118.10, 94d82b46 = -117.57, e69a0061 = -116.83, E = 0.00
- **courroie 05cd7081 — **1fc55503 bloquée (q = 0)**** : 6×4, rang 4 (défaut de rang 0), ‖résidu‖∞ = 59.8290 px
  - flux exigé à travers 1fc55503 sans blocage : **-118.62 px**. La contrainte impose 0 : **incompatibilité de 118.62 px** (les moindres carrés l'étalent en 2 × 59.83 px). Sans le blocage, l'incompatibilité vaut ΣΔh = ΔL = 3.126 px, c'est-à-dire zéro dès que `BeltLength` est active.

### Le mouvement qui reste permis

- déplacement x de -11.3 px : q(1fc55503) = -11.36 px → **1.0030 px de flux par px** (linéaire : à -119 px le flux vaut -119.7 px)
- déplacement y de -10.1 px : q(1fc55503) = -10.11 px → **1.0043 px de flux par px** (linéaire : à -118 px le flux vaut -118.5 px)

La condition q(1fc55503) = 0 s'écrit 1.0030·Δx + 1.0043·Δy = 0, soit **Δy = -0.999·Δx** : une DROITE dans le plan (Δx, Δy), pas l'origine. Une poulie bloquée retire exactement UN degré de liberté sur deux — la montée pure et la translation pure sont interdites, la diagonale reste permise. C'est le comportement attendu d'un Core XY dont un moteur est immobilisé.

## C — unicité sur une courroie ouverte

- 2 poulies : matrice 3×2, rang 2 → **rang plein en colonnes**, dim(noyau) = 0, solution UNIQUE. 1 équation surnuméraire = la compatibilité ΣΔh = ΔL = 0, que `BeltLength` impose déjà.
- 3 poulies : matrice 4×3, rang 3 → **rang plein en colonnes**, dim(noyau) = 0, solution UNIQUE. 1 équation surnuméraire = la compatibilité ΣΔh = ΔL = 0, que `BeltLength` impose déjà.
- 5 poulies : matrice 6×5, rang 5 → **rang plein en colonnes**, dim(noyau) = 0, solution UNIQUE. 1 équation surnuméraire = la compatibilité ΣΔh = ΔL = 0, que `BeltLength` impose déjà.
- 8 poulies : matrice 9×8, rang 8 → **rang plein en colonnes**, dim(noyau) = 0, solution UNIQUE. 1 équation surnuméraire = la compatibilité ΣΔh = ΔL = 0, que `BeltLength` impose déjà.

## D — courroie fermée : le mode circulaire

- 2 poulies : matrice 2×2, rang 1, **dim(noyau) = 1** ; vecteur nul = [1. 1.] → q uniforme.
  avec UNE équation d'ancrage (q₀ imposé) : 3×2, rang 2 → **rang plein, solution unique**.
- 3 poulies : matrice 3×3, rang 2, **dim(noyau) = 1** ; vecteur nul = [1. 1. 1.] → q uniforme.
  avec UNE équation d'ancrage (q₀ imposé) : 4×3, rang 3 → **rang plein, solution unique**.
- 5 poulies : matrice 5×5, rang 4, **dim(noyau) = 1** ; vecteur nul = [1. 1. 1. 1. 1.] → q uniforme.
  avec UNE équation d'ancrage (q₀ imposé) : 6×5, rang 5 → **rang plein, solution unique**.

Le mode nul est exactement le § 3 du diagnostic précédent : le même mécanisme admet une famille à un paramètre de rotations, toutes à résidu nul, la géométrie étant identique. Le modèle q ne le crée pas — il le NOMME.