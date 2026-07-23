"""THROWAWAY: linear algebra for the q-model design note (doc/belt-q-model-design.md).

Reads scratch/data.json (written by scratch/belt-q.test.ts) and answers Q2 A-D
with a generic solver (numpy.linalg), never a PBD sweep.
"""

import json
import numpy as np

np.set_printoptions(precision=4, suppress=True)
OUT = []


def say(s=""):
    OUT.append(s)


def belt_matrix(n_via, segs, closed):
    """Rows: q_a − q_b = Δh_k, one per tangent segment. Columns: one q per via."""
    A = np.zeros((len(segs), n_via))
    for k, (a, b) in enumerate(segs):
        A[k, a] += 1.0
        A[k, b] -= 1.0
    return A


def report(name, A, rhs, fixed):
    """fixed: {via index: imposed q}. Returns the least-squares solution + residual."""
    # Eliminate the fixed columns into the right-hand side.
    free = [j for j in range(A.shape[1]) if j not in fixed]
    b = rhs - A[:, list(fixed)] @ np.array([fixed[j] for j in fixed]) if fixed else rhs.copy()
    Af = A[:, free]
    sol, _, rank, sv = np.linalg.lstsq(Af, b, rcond=None)
    res = Af @ sol - b
    q = np.zeros(A.shape[1])
    for j, v in fixed.items():
        q[j] = v
    for j, v in zip(free, sol):
        q[j] = v
    say(
        f"- **{name}** : {Af.shape[0]}×{Af.shape[1]}, rang {rank} "
        f"(défaut de rang {Af.shape[1] - rank}), ‖résidu‖∞ = {np.abs(res).max():.4f} px"
    )
    return q, np.abs(res).max(), rank, Af


data = json.load(open("scratch/data.json", encoding="utf-8"))

say("# Q2 — le système q, résolu par numpy.linalg (aucun solveur PBD)")

# ───────────────────────────────────────────────────────────────────────────
say("\n## A — non-régression : courroie fermée à 2 poulies, flux uniforme\n")
# Closed, 2 pulleys r = 40 / 25, both direction=false ⇒ ε = +1.
# Pure travel: the geometry does not move, so Δh ≡ 0.
segs2 = [(0, 1), (1, 0)]
A2 = belt_matrix(2, segs2, True)
rhs2 = np.zeros(2)
rank2 = np.linalg.matrix_rank(A2)
ns = np.linalg.svd(A2)[2][rank2:]
say(f"- matrice {A2.shape}, rang {rank2}, dim(noyau) = {A2.shape[1] - rank2}")
say(f"- vecteur du noyau : q = {ns[0] / ns[0][0]} → **q uniforme** (le voyage partagé)")
r = np.array([40.0, 25.0])
eps = np.array([1.0, 1.0])
delta = 14.8812  # the φ measured in belt-closed-diagnostic.md §4
theta = delta / (r * eps)
say(
    f"- pour un voyage δ = {delta} px : θ = {theta} rad, "
    f"rapport θ₂/θ₁ = {theta[1] / theta[0]:.6f} (attendu r₁/r₂ = {r[0] / r[1]:.6f})"
)
say(
    "- **Verdict A : identique au modèle actuel.** Sur une courroie fermée à flux uniforme,"
    " le noyau du système q EST exactement le φ partagé de `BeltPhaseGear` — le modèle q le"
    " contient comme cas particulier, il ne le contredit pas."
)

# ───────────────────────────────────────────────────────────────────────────
say("\n## B — Core XY : la poulie bloquée\n")
BLOCKED_BELT = "05cd7081"
BLOCKED_LABEL = "1fc55503"

for axis, label in [("y", "montée pure (116-118 px)"), ("x", "translation le long du rail")]:
    say(f"\n### Saisie {axis} — {label}\n")
    d = data["corexy"][axis]
    say(f"Déplacement réel du chariot : ({d['move'][0]:.1f}, {d['move'][1]:.1f}) px\n")
    for belt in d["belts"]:
        n = len(belt["labels"])
        segs = [(s["a"], s["b"]) for s in belt["segs"]]
        rhs = np.array([s["dH"] for s in belt["segs"]])
        A = belt_matrix(n, segs, False)
        # Boundary: both ends are dead ends (joined to the carriage) ⇒ q = 0.
        fixed = {0: 0.0, n - 1: 0.0}
        q, res, rank, Af = report(f"courroie {belt['owner']} — bords libres", A, rhs, fixed)
        say(
            "  - flux requis : "
            + ", ".join(f"{lab} = {q[i]:.2f}" for i, lab in enumerate(belt["labels"]))
        )
        if belt["owner"] == BLOCKED_BELT:
            j = belt["labels"].index(BLOCKED_LABEL)
            qb, resb, _, _ = report(
                f"courroie {belt['owner']} — **{BLOCKED_LABEL} bloquée (q = 0)**",
                A,
                rhs,
                {0: 0.0, n - 1: 0.0, j: 0.0},
            )
            say(
                f"  - flux exigé à travers {BLOCKED_LABEL} sans blocage : **{q[j]:.2f} px**."
                f" La contrainte impose 0 : **incompatibilité de {abs(q[j]):.2f} px**"
                f" (les moindres carrés l'étalent en 2 × {resb:.2f} px). Sans le blocage,"
                f" l'incompatibilité vaut ΣΔh = ΔL = {rhs.sum():.3f} px, c'est-à-dire zéro"
                " dès que `BeltLength` est active."
            )

# Local sensitivities (12 px runs) → the admissible motion direction.
say("\n### Le mouvement qui reste permis\n")
sens = {}
for axis, key in [("x", "x12"), ("y", "y12")]:
    d = data["corexy"][key]
    move = d["move"][0] if axis == "x" else d["move"][1]
    for belt in d["belts"]:
        if belt["owner"] != BLOCKED_BELT:
            continue
        n = len(belt["labels"])
        segs = [(s["a"], s["b"]) for s in belt["segs"]]
        rhs = np.array([s["dH"] for s in belt["segs"]])
        A = belt_matrix(n, segs, False)
        free = [j for j in range(n) if j not in (0, n - 1)]
        sol = np.linalg.lstsq(A[:, free], rhs, rcond=None)[0]
        j = belt["labels"].index(BLOCKED_LABEL)
        qb = sol[free.index(j)]
        big = data["corexy"][axis]
        sens[axis] = (qb / move, big["belts"][0]["dTotal"], big["belts"][1]["dTotal"])
        say(
            f"- déplacement {axis} de {move:.1f} px : q({BLOCKED_LABEL}) = {qb:.2f} px"
            f" → **{qb / move:.4f} px de flux par px** (linéaire : à {big['move'][0] if axis == 'x' else big['move'][1]:.0f} px"
            f" le flux vaut {qb / move * (big['move'][0] if axis == 'x' else big['move'][1]):.1f} px)"
        )
ax, ay = sens["x"][0], sens["y"][0]
say(
    f"\nLa condition q({BLOCKED_LABEL}) = 0 s'écrit {ax:.4f}·Δx + {ay:.4f}·Δy = 0,"
    f" soit **Δy = {-ax / ay:.3f}·Δx** : une DROITE dans le plan (Δx, Δy), pas l'origine."
    " Une poulie bloquée retire exactement UN degré de liberté sur deux — la montée pure"
    " et la translation pure sont interdites, la diagonale reste permise. C'est le"
    " comportement attendu d'un Core XY dont un moteur est immobilisé."
)

# ───────────────────────────────────────────────────────────────────────────
say("\n## C — unicité sur une courroie ouverte\n")
for n_pulley in (2, 3, 5, 8):
    n = n_pulley + 2
    segs = [(i, i + 1) for i in range(n - 1)]
    A = belt_matrix(n, segs, False)
    free = [j for j in range(1, n - 1)]
    Af = A[:, free]
    rank = np.linalg.matrix_rank(Af)
    say(
        f"- {n_pulley} poulies : matrice {Af.shape[0]}×{Af.shape[1]}, rang {rank} →"
        f" **rang plein en colonnes**, dim(noyau) = {Af.shape[1] - rank}, solution UNIQUE."
        f" {Af.shape[0] - rank} équation surnuméraire = la compatibilité ΣΔh = ΔL = 0,"
        " que `BeltLength` impose déjà."
    )

# ───────────────────────────────────────────────────────────────────────────
say("\n## D — courroie fermée : le mode circulaire\n")
for n in (2, 3, 5):
    segs = [(i, (i + 1) % n) for i in range(n)]
    A = belt_matrix(n, segs, True)
    rank = np.linalg.matrix_rank(A)
    ns = np.linalg.svd(A)[2][rank:]
    say(
        f"- {n} poulies : matrice {n}×{n}, rang {rank}, **dim(noyau) = {n - rank}** ;"
        f" vecteur nul = {np.round(ns[0] / ns[0][0], 6)} → q uniforme."
    )
    Aa = np.vstack([A, np.eye(n)[0]])  # one anchor row: q of via 0 imposed
    say(
        f"  avec UNE équation d'ancrage (q₀ imposé) : {Aa.shape[0]}×{n}, rang"
        f" {np.linalg.matrix_rank(Aa)} → **rang plein, solution unique**."
    )
say(
    "\nLe mode nul est exactement le § 3 du diagnostic précédent : le même mécanisme"
    " admet une famille à un paramètre de rotations, toutes à résidu nul, la géométrie"
    " étant identique. Le modèle q ne le crée pas — il le NOMME."
)

print("\n".join(OUT))
open("scratch/q_report.md", "w", encoding="utf-8").write("\n".join(OUT))
