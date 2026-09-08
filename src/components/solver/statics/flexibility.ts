import { ID, Point2 } from "../../../types";
import { BeamCohesionSpec } from "../dynamics/beam-cohesion";
import { Flexibility } from "./least-squares";
import { StaticsFrame, StaticsSystem } from "./equilibrium-model";
import { BeamState, abscissa, beam_state, cross } from "./equilibrium-solve";

/**
 * The complementary energy of a mechanism, as a quadratic form over the equilibrium unknowns — see docs/plan-efforts-interieurs.md phase 10.
 *
 * This is what answers a hyperstatic structure.
 * Equilibrium alone leaves a family of solutions; the real one is the member that stores the least strain energy (Menabrea), and that is a question about `E`, `A` and `I` rather than about the mechanism's shape.
 *
 * ``` U = ∫ N(s)²/(2EA) ds + ∫ Mf(s)²/(2EI) ds ```
 *
 * **No shear term.** `τ` needs `G`, hence Poisson's ratio, which `MaterialDef` does not carry — and inventing one would be a second unjustified number, the same reason `σ_adm = Re` carries no safety factor.
 * It also would not be an improvement: shear flexibility contributes at order `(h/L)²` on the slender beams this models, and every textbook figure these are checked against (`3wL/8`, `wL²/12`) is Euler-Bernoulli, so adding it would make the references disagree.
 */

/** Four-point Gauss-Legendre on `[-1, 1]`. `N²` reaches degree 4 and `Mf²` degree 6 between two
 * interfaces, and four points are exact through degree 7 — so the integrals below are exact, not approximated. */
const GAUSS_NODES = [
  -0.8611363115940526, -0.3399810435848563, 0.3399810435848563, 0.8611363115940526,
];
const GAUSS_WEIGHTS = [
  0.3478548451374538, 0.6521451548625461, 0.6521451548625461, 0.3478548451374538,
];

/** One interface's place along its beam, and where its three components live in the unknowns. */
interface Cut {
  s: number;
  columns: { fx: number; fy: number; m: number };
}

/**
 * `N` and `Mf` at one cut, as a row over the unknowns plus the part the known loads already fix.
 *
 * `R_coh(s) = Σ_{sⱼ<s} Fⱼ − W(s)` and `M_coh(s) = Σ_{sⱼ<s} [(sⱼ−s)·(x̂ × Fⱼ) + Mⱼ] − Mw(s)`, the plan's own cut convention with the upstream part `[0, s]`.
 * Both are affine in the unknowns, which is precisely why the energy comes out quadratic and this can be a matrix.
 */
function cut_rows(
  s: number,
  cuts: Cut[],
  state: BeamState,
  known: { force: Point2; moment: number },
  columns: number,
): { n: Float64Array; nConstant: number; m: Float64Array; mConstant: number } {
  const n = new Float64Array(columns);
  const m = new Float64Array(columns);
  const { xhat } = state;
  for (const cut of cuts) {
    if (cut.s >= s) continue;
    n[cut.columns.fx] += xhat.x;
    n[cut.columns.fy] += xhat.y;
    const arm = cut.s - s;
    m[cut.columns.fx] += arm * -xhat.y;
    m[cut.columns.fy] += arm * xhat.x;
    if (cut.columns.m >= 0) m[cut.columns.m] += 1;
  }
  return {
    n,
    nConstant: -(known.force.x * xhat.x + known.force.y * xhat.y),
    m,
    mConstant: -known.moment,
  };
}

/**
 * Build `F` and `g` for one frame.
 *
 * Returns `undefined` when no beam has a usable section — there is then nothing to minimise, and an all-zero form would silently make every hyperstatic split look equally good.
 */
export function build_flexibility(
  system: StaticsSystem,
  specs: BeamCohesionSpec[],
  frame: StaticsFrame,
): Flexibility | undefined {
  const size = system.columns;
  // Dense and symmetric.
  // Sized by the unknowns, which stay in the hundreds even on the whole gallery's largest mechanism, so the square never becomes the cost.
  const f = new Float64Array(size * size);
  const linear = new Float64Array(size);
  let any = false;

  for (const spec of specs) {
    const stiffness = frame.beamStiffness(spec.beamID);
    const state = beam_state(spec, frame);
    if (!stiffness || !state || stiffness.EA <= 0 || stiffness.EI <= 0) continue;
    any = true;

    const cuts: Cut[] = system.interfaces
      .filter((face) => face.beamID === spec.beamID)
      .map((face) => ({ s: abscissa(face, spec, state, frame), columns: face.columns }))
      .sort((a, b) => a.s - b.s);

    // The load the beam carries whatever the unknowns do: its distributed load plus its own weight against its own acceleration.
    // Affine in `s`, since the rigid-body acceleration field `a(σ) = a₀ + ŷ·α·σ − x̂·ω²·σ` is.
    const density = frame.distributedDensityOn(spec.beamID);
    const mu = frame.beamMass(spec.beamID) / state.length;
    const a0 = frame.accelerationOf(spec.k0);
    const q0 = density.at0.add(frame.gravity.sub(a0).mul(mu));
    const q1 = density.slope.add(
      state.xhat
        .mul(state.angularVelocity * state.angularVelocity)
        .sub(state.yhat.mul(state.angularAcceleration))
        .mul(mu),
    );
    const c0 = cross(state.xhat, q0.x, q0.y);
    const c1 = cross(state.xhat, q1.x, q1.y);
    /** `∫₀ˢ q` and `∫₀ˢ (σ−s)·(x̂ × q)`, both closed form on an affine density. */
    const known = (s: number) => ({
      force: q0.mul(s).add(q1.mul((s * s) / 2)),
      moment: (-c0 * s * s) / 2 - (c1 * s * s * s) / 6,
    });

    const bounds = [0, ...cuts.map((c) => c.s), state.length].sort((a, b) => a - b);
    for (let i = 0; i < bounds.length - 1; i++) {
      const lo = bounds[i];
      const hi = bounds[i + 1];
      const half = (hi - lo) / 2;
      if (half <= 0) continue;
      for (let g = 0; g < GAUSS_NODES.length; g++) {
        const s = lo + half * (1 + GAUSS_NODES[g]);
        const weight = half * GAUSS_WEIGHTS[g];
        const rows = cut_rows(s, cuts, state, known(s), size);
        // U = ∫ N²/2EA + Mf²/2EI, so F picks up rowᵀrow/EI and g picks up constant·row/EI.
        for (const [row, constant, rigidity] of [
          [rows.n, rows.nConstant, stiffness.EA],
          [rows.m, rows.mConstant, stiffness.EI],
        ] as const) {
          const gain = weight / rigidity;
          for (let a = 0; a < size; a++) {
            if (row[a] === 0) continue;
            linear[a] += gain * constant * row[a];
            for (let b = 0; b < size; b++)
              if (row[b] !== 0) f[a * size + b] += gain * row[a] * row[b];
          }
        }
      }
    }
  }

  if (!any) return undefined;
  return {
    applyF: (x) => {
      const out = new Float64Array(size);
      for (let i = 0; i < size; i++) {
        let sum = 0;
        for (let j = 0; j < size; j++) sum += f[i * size + j] * x[j];
        out[i] = sum;
      }
      return out;
    },
    linear,
  };
}

/** A beam's own id, for a caller wanting to know which members the form actually covers. */
export function flexible_beams(specs: BeamCohesionSpec[], frame: StaticsFrame): ID[] {
  return specs
    .filter((spec) => {
      const stiffness = frame.beamStiffness(spec.beamID);
      return stiffness !== undefined && stiffness.EA > 0 && stiffness.EI > 0;
    })
    .map((spec) => spec.beamID);
}
