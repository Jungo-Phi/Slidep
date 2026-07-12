# Loose-belt terminals: a mode-free model (design)

Status: **proposal, to validate before coding.** Replaces the stateful winding
machinery (`startWind`/`endWind`, `external`, authoritative `pinWound`,
`WIND_TOL`/`DETACH_TOL`, the `gPhi` gate + `pullingFreeEnd`, `grabbedTerminal`,
and the two pre-sim "can't enter the gear" clamps) with **two constraints + one
tracked scalar**.

## Why

The bugs (non-fluid off-gear↔on-gearTooth transitions, conflicts when both ends
sit on gearTeeth, fragile unwind-to-detach limit, motor not blocking) all trace
to one thing: **"wound" is a discrete latched state** with hysteresis, plus
`pinWound` writing the gear angle authoritatively. Remove the state and the
transitions disappear; the behaviours become *emergent*.

## Variables (unchanged unless noted)

- `c_g` gear centre (position DOF, mobility `m_c`), `r_g` radius (baked in sim).
- `T` terminal position (DOF, mobility `m_T`). `m = 0` anchored, `1` free.
- `ε_g = directions[g] ? −1 : 1`.
- `φ` belt travel (one scalar per belt, `angles["<belt>:phi"]`, never anchored).
- `θ_g` gear angle, coupled to φ by **`BeltPhaseGear`** `r_g·ε_g·(θ_g−θ_g0)=φ`
  (unchanged).
- `w_g` **continuous** wrap per gear (tracked by `advance_continuous_wraps`,
  unwrapped, may exceed 2π when coiling). Arc length = `r_g·|w_g|`.

The *only* per-terminal state is a **contact reference** `ρ` (below), whose
lifecycle is tied to geometric contact — no tolerance band, no latch.

## The three pieces

### A — Radial non-penetration (SYMMETRIC), both solvers

Per terminal `T` and its path-adjacent gear (`gears[0]` for start, `gears[last]`
for end):

```
d = |T − c|;  u = (T − c)/d                      // arbitrary unit if d ≈ 0
active only when d < r          // one-sided (inequality)
C = r − d
total = m_T + m_c
T +=  u · C · (m_T/total) · stiffness
c -=  u · C · (m_c/total) · stiffness            // the gear is pushed away too
```

- Symmetric: pushing a terminal into a free gear moves **both** (by mobility),
  exactly your point. A grounded gear (`m_c=0`) → only the terminal moves.
- **Replaces**: `clamp_belt_terminal_outside_gear` (edition) **and** the
  `step_simulation` grab clamp. Because it lives in the solver (both edition and
  sim), the "can't drag a terminal into its gear" behaviour is now a real
  constraint, not a pre-filter — and it is symmetric.
- A join-pinned (winch) terminal already sits at `d=r` via its
  `GearPerimeterPin`; A is simply inactive there (no double control).

### B — No-slip co-rotation of a CONTACTING terminal (the delicate piece)

**Contact** = A is engaged this frame (the belt is pressing `T` against the rim,
`d ≤ r + tol_contact`). Contact is *geometric and instantaneous* — no
`WIND_TOL`/`DETACH_TOL` hysteresis. When `T` is pulled clear (`d > r`), contact
ends by itself.

While in contact, `T` is a material point on the rim, so it must **wind with the
belt travel**. Crucially it is referenced to **φ, not θ** (this is the fix for
the motor-block; see "Why φ not θ"):

```
On contact BEGIN:  ρ = angle(T−c) − φ/(r·ε)      // baked once; cleared on contact END
Ca = wrap( angle(T−c) − φ/(r·ε) − ρ )            // ∈ (−π, π]
```

Project in **belt-px space** (the `BeltEndTravel` lesson: weighting θ/φ in r²
makes them "free" and they fight the motor). Terminal tangential px-gradient = 1,
φ px-gradient = −ε:

```
denom = m_T + 1                                  // φ weight 1, never anchored
kpx   = −(r · Ca) / denom
dα    = (kpx · m_T) / r ;   T = c + (T−c).rotate(dα)      // orbit the terminal
φ    +=  −kpx · ε                                          // θ follows via BeltPhaseGear
```

- Non-authoritative: it corrects a *shared* φ, so the length (below) can resist
  it. `pinWound`'s old direct `θ` write is gone.
- The wound arc grows because `w_g` is tracked from the (now orbiting) geometry.

### L — Length (mostly as today), continuous wrap

```
L = Σ tangent runs + Σ r_g·|w_g|  =  L0
```

DOFs: free centres and free terminal positions (envelope-theorem gradients as
today). φ enters the length **only through B** (B couples each contacting
terminal's tangential position to φ). So when the belt is fed and a terminal is
clamped (can't move in) while the other end can't feed, L has no positional slack
→ it pushes back through B → φ → θ → the motor **jams**. When the other end *can*
feed, L uses it and φ just follows the transmission. **No `gPhi` gate.**

The existing `C_diff` (free-run differential ↔ φ) stays for two free ends; it is
simply the non-contact case of the same no-slip.

## Why φ, not θ, in B (the crux)

The current `pinWound` references **θ** (`angle−θ−windRef`), so a contacting
terminal follows θ. Under a motor, θ is externally driven, so the terminal winds
regardless and the belt stretches (θ settles at a balance, ~target/3). Referencing
**φ** makes the terminal wind with the *belt travel that the length controls*:
`L → move terminal → B → φ → BeltPhaseGear → θ`. Blocking φ therefore blocks θ →
the motor jams and the length holds. (`θ0` isn't available inside the length link,
so `ρ` is baked φ-relative at contact, not θ-relative.)

## Behaviours become emergent (no modes)

| Situation | Mechanism | Result |
|---|---|---|
| Terminal reaches the rim | A clamps, contact begins, B activates | smooth, no transition |
| Motor winds, other end feeds | B winds via φ; L feeds the free end | turns freely, length held |
| Motor winds, other end **anchored** | B ties terminal to φ; L has no slack → resists φ | **motor jams**, no stretch |
| Drag a wound terminal **tangentially** | stays in contact; B → φ → θ | gear turns (was test 772) |
| Pull a wound terminal **radially** | `d > r` → contact ENDS geometrically | lifts off, no spin (was test 759) |
| Unwind to the limit | `w_g → 0`, terminal lifts off as contact ends | smooth; `update_belt_disconnects` still sheds at `w≤0` |
| Both ends toward one gear | both clamp + co-rotate; belt can't feed both | over-constrained → **blocks** (not a conflict) |

Note the radial/tangential split **is** what distinguishes 759 from 772 — with no
`grabbedTerminal` flag. That flag, and the cause/effect ambiguity that forced it,
**should disappear**: a radial pull ends contact (geometry), a tangential drag
drives φ.

## What gets deleted vs kept

**Deleted**: `startWind`/`endWind` (as a latched mode), `startExternal`/`endExternal`
(a winch = a join holding `T` at the rim; same path as bare contact), authoritative
`pinWound`, `WIND_TOL`/`DETACH_TOL`, the `gPhi`/`pullingFreeEnd`/`Cproj` gate,
`grabbedTerminal`, `clamp_belt_terminal_outside_gear`, the `step_simulation` grab clamp.

**Kept**: `BeltPhaseGear` (θ↔φ), `w_g` continuous-wrap tracking + disconnect at
`w≤0`, `C_diff` (two-free-ends no-slip), the belt-px projection discipline.

**New state**: `ρ` per contacting terminal (baked on contact-begin, cleared on
contact-end). One scalar, clean lifecycle — this is the *only* residue of "wound",
and it carries no hysteresis.

## Honest risks / open points

1. **B's px-space weighting** is the piece I have not yet stabilised in code
   (my earlier attempt kept θ-reference and only wound to a balance). The φ-
   reference is the intended fix; it must be validated numerically (motor-block +
   772 + 759 as the acceptance trio).
2. **Contact stability**: A is one-sided, so contact = "the belt presses inward".
   Should be stable, but if `d` chatters at exactly `r` we may need a tiny
   contact band or to weight B by penetration depth. Prefer depth-weighting over a
   tolerance to stay mode-free.
3. **`belt_pieces` representation switch** (tangent-stub → arc) at the rim is a
   *separate* ~1.5px jump source, independent of state. This model reduces the
   visible transition but doesn't kill that geometric discontinuity; a continuous
   terminal geometry in `belt_pieces` is a follow-up if it still shows.
4. **Multi-turn coiling** still needs `w_g` (a point can't encode turns) — kept,
   as a tracked scalar, not a mode.
5. **Edition**: adding A to the geometric solver changes drag behaviour near a
   gear (terminal/gear now push apart symmetrically). Intended, but re-check the
   belt-tightening/junction flows.

## Migration & tests

- Land A first (both solvers), delete the two clamps, verify drag + sim still
  place terminals sensibly.
- Land B (φ-referenced) + contact lifecycle; delete the winding-mode fields and
  the `gPhi` gate incrementally, keeping the suite green at each step.
- Acceptance trio for B: **motor+anchored-end jams** (new), **tangential drag
  turns the gear** (≈772), **radial pull lifts off without spinning** (≈759) —
  all **without** `grabbedTerminal`. Re-pose 759/772 as the radial/tangential
  decomposition test.
- Keep the capstan (>2π), winch-no-block, launch-no-drift, gearless-holds-length
  tests as physical acceptance criteria.
