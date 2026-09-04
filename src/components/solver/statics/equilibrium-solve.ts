import { ID, Point2 } from "../../../types";
import { BeamCohesionSpec } from "../dynamics/beam-cohesion";
import { Matrix, add_at, zeros } from "./matrix";
import { Flexibility, minimise_energy, solve_least_squares } from "./least-squares";
import { StaticsFrame, StaticsInterface, StaticsSystem } from "./equilibrium-model";

/** One resolved interface torsor, in plain mechanics units: the force and the counter-
 *  clockwise couple the beam applies onto the node (or the frame onto the node, at a support). */
export interface StaticsTorsor {
  beamID?: ID;
  nodeKey: string;
  /** Abscissa along the beam, in metres from its start. `NaN` for a support. */
  s: number;
  fx: number;
  fy: number;
  m: number;
  /**
   * Whether equilibrium alone fixes this torsor at this pose.
   *
   * Per component and not per beam, which matters: a beam between two pinned supports has an
   * undetermined `N` and a perfectly determined `Mf`, and reporting the whole beam as unknown
   * would throw away the bending diagram — the very case a reader most wants.
   */
  determined: { fx: boolean; fy: boolean; m: boolean };
  /** Carried through from `StaticsInterface.foreign`: this stands for a belt, a gear mesh or a
   *  contact the model does not describe, never for an answer. */
  foreign: boolean;
}

export interface StaticsSolution {
  torsors: StaticsTorsor[];
  /** `dim ker(A)` — the degree of static indeterminacy at this pose. Zero means every torsor
   *  above is exact. Should agree with `ChainMobility.hyperstaticity` summed over the chains
   *  this covers, which is an independent route to the same number. */
  indeterminacy: number;
  /** `‖A·x − b‖`. Not a solver failure: it says the frame handed in is not itself in
   *  equilibrium, which on a moving mechanism is a d'Alembert term that did not quite close. */
  residual: number;
  /** Largest right-hand side entry, to read `residual` against something. */
  scale: number;
}

/** A beam's frame and rigid-body kinematics at one instant. */
export interface BeamState {
  p0: Point2;
  p1: Point2;
  length: number;
  xhat: Point2;
  yhat: Point2;
  centre: Point2;
  /** Acceleration of the centre of mass, from the rigid-body field the endpoints define. */
  centreAcceleration: Point2;
  angularVelocity: number;
  angularAcceleration: number;
}

export function beam_state(spec: BeamCohesionSpec, frame: StaticsFrame): BeamState | undefined {
  const p0 = frame.positionOf(spec.k0);
  const p1 = frame.positionOf(spec.k1);
  if (!p0 || !p1) return undefined;
  const span = p1.sub(p0);
  const length = span.length();
  if (length < 1e-9) return undefined;
  const xhat = span.mul(1 / length);
  const yhat = xhat.perp();
  const a0 = frame.accelerationOf(spec.k0);
  const a1 = frame.accelerationOf(spec.k1);
  const omega = frame.velocityOf(spec.k1).sub(frame.velocityOf(spec.k0)).dot(yhat) / length;
  const alpha = a1.sub(a0).dot(yhat) / length;
  return {
    p0,
    p1,
    length,
    xhat,
    yhat,
    centre: p0.lerp(p1, 0.5),
    // The mean of the two ends, not the rigid-body field extrapolated from `a₀`.
    //
    // For a body that really is rigid the two agree exactly — `a(σ) = a₀ + ŷ·α·σ − x̂·ω²·σ` is
    // affine, so its mean over the span IS its midpoint value. They part company when the
    // frame's recorded accelerations do not satisfy rigidity, and then only the mean is usable:
    // the node equations read those same measured accelerations, so extrapolating a different
    // one for the beam makes the two halves of the system contradict each other. Measured on a
    // freely spinning beam whose ends had not yet settled onto their circular path, that
    // contradiction reached 58 % of the equations' own scale and turned a pure tension into a
    // compression.
    centreAcceleration: a0.lerp(a1, 0.5),
    angularVelocity: omega,
    angularAcceleration: alpha,
  };
}

/** Where along its beam an interface sits, as a length from the start. */
export function abscissa(
  face: StaticsInterface,
  spec: BeamCohesionSpec,
  state: BeamState,
  frame: StaticsFrame,
): number {
  if (face.nodeKey === spec.k0) return 0;
  if (face.nodeKey === spec.k1) return state.length;
  // A slider's abscissa moves; it is read from the live pose every frame, never from a `t`
  // frozen at compile time.
  const at = frame.positionOf(face.nodeKey);
  return at ? at.parameter_on_segment(state.p0, state.p1) * state.length : 0;
}

export const cross = (r: Point2, fx: number, fy: number) => r.x * fy - r.y * fx;

/**
 * Resultant of an affine load density over a whole beam, and its moment about mid-span.
 *
 * `∫(at0 + slope·σ)dσ` and `∫(σ − L/2)·(x̂ × q(σ))dσ`, both closed form. Only the density's
 * SLOPE contributes to the moment — a uniform load is balanced about the centre by
 * construction, so the whole term is `(x̂ × slope)·L³/12`.
 */
export function distributed_resultant(
  density: { at0: Point2; slope: Point2 },
  state: BeamState,
): { force: Point2; moment: number } {
  const { length, xhat } = state;
  return {
    force: density.at0.mul(length).add(density.slope.mul((length * length) / 2)),
    moment: (cross(xhat, density.slope.x, density.slope.y) * length ** 3) / 12,
  };
}

/**
 * Assemble and solve one frame's equilibrium.
 *
 * `flexibility` applies `F` to a vector of unknowns — the block-diagonal member flexibility
 * of the minimum-complementary-energy formulation. Omit it and an indeterminate system falls
 * back to the minimum-norm solution, which is **not** an answer: read `determined` and report
 * the rest as unknown rather than showing it.
 */
export function solve_statics(
  system: StaticsSystem,
  specs: BeamCohesionSpec[],
  frame: StaticsFrame,
  flexibility?: Flexibility,
): StaticsSolution | undefined {
  const specOf = new Map(specs.map((s) => [s.beamID, s]));
  const states = new Map<ID, BeamState>();
  for (const spec of specs) {
    const state = beam_state(spec, frame);
    if (state) states.set(spec.beamID, state);
  }

  const a: Matrix = zeros(system.rows, system.columns);
  const b = new Float64Array(system.rows);
  const rowOfBeam = new Map<ID, number>();
  const rowOfNode = new Map<string, number>();
  for (const body of system.bodies) {
    if (body.kind === "beam" && body.beamID !== undefined) rowOfBeam.set(body.beamID, body.row);
    if (body.kind === "node" && body.nodeKey !== undefined) rowOfNode.set(body.nodeKey, body.row);
  }

  // ── Right-hand sides: everything already known about each body ──
  for (const spec of specs) {
    const state = states.get(spec.beamID);
    const row = rowOfBeam.get(spec.beamID);
    if (!state || row === undefined) continue;
    const mass = frame.beamMass(spec.beamID);
    const distributed = distributed_resultant(frame.distributedDensityOn(spec.beamID), state);
    // Σ Fᵢ = m·g + W − m·a_G, the beam's own equilibrium with the node actions moved across.
    b[row] = mass * frame.gravity.x + distributed.force.x - mass * state.centreAcceleration.x;
    b[row + 1] = mass * frame.gravity.y + distributed.force.y - mass * state.centreAcceleration.y;
    // A uniform straight bar about its own centre. The solver's own three lumps reproduce
    // exactly this (`2·(m/6)·(L/2)² = mL²/12`), so taking the continuum figure changes no
    // physics — only which of the two models the reading belongs to.
    const inertia = (mass * state.length * state.length) / 12;
    b[row + 2] = distributed.moment - inertia * state.angularAcceleration;
  }

  for (const [key, row] of rowOfNode) {
    const mass = frame.nodeMassAt(key);
    const external = frame.externalForceAt(key);
    const acceleration = frame.accelerationOf(key);
    // Σ Fᵢ = m·(a − g) − ext.
    b[row] = mass * (acceleration.x - frame.gravity.x) - external.x;
    b[row + 1] = mass * (acceleration.y - frame.gravity.y) - external.y;
    b[row + 2] = 0; // a point carries no rotational inertia
  }

  // ── Coefficients: where each unknown appears ──
  for (const face of system.interfaces) {
    const { fx, fy, m } = face.columns;
    const nodeRow = rowOfNode.get(face.nodeKey);
    if (nodeRow !== undefined) {
      // The node receives the torsor as reported.
      add_at(a, nodeRow, fx, 1);
      add_at(a, nodeRow + 1, fy, 1);
      if (m >= 0) add_at(a, nodeRow + 2, m, 1);
    }
    if (face.beamID === undefined) continue;

    const spec = specOf.get(face.beamID);
    const state = states.get(face.beamID);
    const beamRow = rowOfBeam.get(face.beamID);
    if (!spec || !state || beamRow === undefined) continue;
    const s = abscissa(face, spec, state, frame);
    const arm = state.p0.add(state.xhat.mul(s)).sub(state.centre);
    add_at(a, beamRow, fx, 1);
    add_at(a, beamRow + 1, fy, 1);
    // Moment about the beam's own centre of mass: (P − G) × F, plus the couple itself.
    add_at(a, beamRow + 2, fx, cross(arm, 1, 0));
    add_at(a, beamRow + 2, fy, cross(arm, 0, 1));
    if (m >= 0) add_at(a, beamRow + 2, m, 1);
  }

  const solved = solve_least_squares(a, b);
  const x = flexibility
    ? minimise_energy(solved.x, solved.nullSpace, flexibility.applyF, flexibility.linear)
    : solved.x;

  // A component is settled by equilibrium when no direction of the solution family moves it.
  // The null vectors are unit-norm, so this compares a share of one against a share of one.
  const FIXED = 1e-8;
  const varies = (column: number) =>
    column >= 0 && solved.nullSpace.some((n) => Math.abs(n[column]) > FIXED);

  let scale = 0;
  for (const value of b) scale = Math.max(scale, Math.abs(value));

  return {
    torsors: system.interfaces.map((face) => {
      const spec = face.beamID !== undefined ? specOf.get(face.beamID) : undefined;
      const state = face.beamID !== undefined ? states.get(face.beamID) : undefined;
      return {
        beamID: face.beamID,
        nodeKey: face.nodeKey,
        s: spec && state ? abscissa(face, spec, state, frame) : Number.NaN,
        fx: x[face.columns.fx],
        fy: x[face.columns.fy],
        m: face.columns.m >= 0 ? x[face.columns.m] : 0,
        determined: {
          fx: !varies(face.columns.fx),
          fy: !varies(face.columns.fy),
          // A hinge passes no couple: that zero is a certainty, not an unknown left over.
          m: face.columns.m < 0 || !varies(face.columns.m),
        },
        foreign: face.foreign,
      };
    }),
    indeterminacy: solved.nullSpace.length,
    residual: solved.residual,
    scale,
  };
}
