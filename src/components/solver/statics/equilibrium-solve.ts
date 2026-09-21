import { ID, Point2 } from "../../../types";
import { BalanceSample } from "../../../types/runtime-state";
import { BeamCohesionSpec } from "../dynamics/beam-cohesion";
import { Matrix, add_at, zeros } from "./matrix";
import { Flexibility, minimise_energy, solve_least_squares } from "./least-squares";
import { StaticsFrame, StaticsInterface, StaticsSystem } from "./equilibrium-model";
import { BeltVia, belt_pieces } from "../../../utils/belt-path";

/**
 * One resolved interface torsor, in plain mechanics units: the force and the counter-clockwise couple the beam applies onto the node (or the frame onto the node, at a support).
 */
export interface StaticsTorsor {
  beamID?: ID;
  /** The gear applying this torsor, at its axle or at one of its rim pins. */
  gearID?: ID;
  nodeKey: string;
  /** Abscissa along the beam, in metres from its start. `NaN` for a support. */
  s: number;
  fx: number;
  fy: number;
  m: number;
  /**
   * Whether the solve fixes this torsor at this pose — by equilibrium alone when it was given no flexibility, by equilibrium plus minimum complementary energy when it was.
   *
   * Per component and not per beam, which matters: a beam between two pinned supports has an undetermined `N` and a perfectly determined `Mf`, and reporting the whole beam as unknown would throw away the bending diagram — the very case a reader most wants.
   */
  determined: { fx: boolean; fy: boolean; m: boolean };
  /** Carried through from `StaticsInterface.foreign`: this stands for a belt, a gear mesh or a contact the model does not describe, never for an answer. */
  foreign: boolean;
}

/** One tangent strand of a belt as it lay this frame, and the tension it carries. */
export interface StaticsStrand {
  beltID: ID;
  /** Where the strand leaves its via, and where it lands on the next one. */
  from: Point2;
  to: Point2;
  /** The pulleys at either end, absent at an open belt's terminal. */
  fromGear?: ID;
  toGear?: ID;
  /** Positive when the strand pulls its two ends towards each other. */
  tension: number;
  determined: boolean;
}

export interface StaticsSolution {
  torsors: StaticsTorsor[];
  /** Every strand of every belt the assembly carries, in path order within a belt. */
  strands: StaticsStrand[];
  /**
   * `dim ker(A)` — the degree of static indeterminacy at this pose.
   * Zero means every torsor above is exact.
   * Should agree with `ChainMobility.hyperstaticity` summed over the chains this covers, which is an independent route to the same number.
   */
  indeterminacy: number;
  /**
   * `‖A·x − b‖`.
   * Not a solver failure: it says the frame handed in is not itself in equilibrium, which on a moving mechanism is a d'Alembert term that did not quite close.
   */
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
    // For a body that really is rigid the two agree exactly — `a(σ) = a₀ + ŷ·α·σ − x̂·ω²·σ` is affine, so its mean over the span IS its midpoint value.
    // They part company when the frame's recorded accelerations do not satisfy rigidity, and then only the mean is usable: the node equations read those same measured accelerations, so extrapolating a different one for the beam makes the two halves of the system contradict each other.
    // Measured on a freely spinning beam whose ends had not yet settled onto their circular path, that contradiction reached 58 % of the equations' own scale and turned a pure tension into a compression.
    centreAcceleration: a0.lerp(a1, 0.5),
    angularVelocity: omega,
    angularAcceleration: alpha,
  };
}

/**
 * The whole movable system's force balance — see `BalanceSample`, which says what the three terms mean and why the support reactions are not among them.
 * One pass over the same bodies `solve_statics` writes rows for, reading the same figures those rows do, so the two can never describe different systems.
 */
export function compute_balance_sample(
  system: StaticsSystem,
  specs: BeamCohesionSpec[],
  frame: StaticsFrame,
): BalanceSample {
  let applied = new Point2(0, 0);
  let weight = new Point2(0, 0);
  let inertia = new Point2(0, 0);
  let appliedM = 0;
  let weightM = 0;
  let inertiaM = 0;
  // Every moment is taken about the world origin, which is what makes the three of them addable at all — and what the reader sees the resultant drawn at.
  const carry = (mass: number, centre: Point2 | undefined, acceleration: Point2) => {
    const w = frame.gravity.mul(mass);
    const ma = acceleration.mul(mass);
    weight = weight.add(w);
    inertia = inertia.add(ma);
    if (!centre) return;
    weightM += cross(centre, w.x, w.y);
    inertiaM += cross(centre, ma.x, ma.y);
  };

  for (const body of system.bodies) {
    if (body.kind === "beam" && body.beamID !== undefined) {
      const spec = specs.find((s) => s.beamID === body.beamID);
      const state = spec && beam_state(spec, frame);
      if (!state) continue;
      const mass = frame.beamMass(body.beamID);
      carry(mass, state.centre, state.centreAcceleration);
      // A rod's own `I·α` about its centre, the same `mL²/12` the beam's own moment row balances.
      inertiaM +=
        ((mass * state.length * state.length) / 12) * state.angularAcceleration;
      // An affine density's own resultant over the span, the shape `distributedDensityOn` is defined to hold, and its moment about the origin integrated the same way rather than reduced to a centroid first.
      const { at0, slope } = frame.distributedDensityOn(body.beamID);
      const L = state.length;
      applied = applied.add(at0.mul(L).add(slope.mul(0.5 * L * L)));
      appliedM +=
        cross(state.p0, at0.x, at0.y) * L +
        cross(state.p0, slope.x, slope.y) * 0.5 * L * L +
        cross(state.xhat, at0.x, at0.y) * 0.5 * L * L +
        cross(state.xhat, slope.x, slope.y) * (L * L * L) / 3;
    } else if (body.kind === "gear" && body.gearID !== undefined) {
      const gear = system.gears.find((g) => g.id === body.gearID);
      if (!gear) continue;
      carry(
        gear.mass,
        frame.positionOf(gear.centreKey),
        frame.accelerationOf(gear.centreKey),
      );
      inertiaM += gear.inertia * frame.gearAngularAcceleration(gear.id);
    } else if (body.kind === "node" && body.nodeKey !== undefined) {
      const at = frame.positionOf(body.nodeKey);
      carry(
        frame.nodeMassAt(body.nodeKey),
        at,
        frame.accelerationOf(body.nodeKey),
      );
      const external = frame.externalForceAt(body.nodeKey);
      applied = applied.add(external);
      if (at) appliedM += cross(at, external.x, external.y);
    }
  }

  return {
    appliedX: applied.x,
    appliedY: applied.y,
    appliedM,
    weightX: weight.x,
    weightY: weight.y,
    weightM,
    inertiaX: inertia.x,
    inertiaY: inertia.y,
    inertiaM,
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
  // A slider's abscissa moves; it is read from the live pose every frame, never from a `t` frozen at compile time.
  const at = frame.positionOf(face.nodeKey);
  return at ? at.parameter_on_segment(state.p0, state.p1) * state.length : 0;
}

export const cross = (r: Point2, fx: number, fy: number) => r.x * fy - r.y * fx;

/**
 * Resultant of an affine load density over a whole beam, and its moment about mid-span.
 *
 * `∫(at0 + slope·σ)dσ` and `∫(σ − L/2)·(x̂ × q(σ))dσ`, both closed form.
 * Only the density's SLOPE contributes to the moment — a uniform load is balanced about the centre by construction, so the whole term is `(x̂ × slope)·L³/12`.
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
 * Below this, a component of a unit vector is numerical dust rather than a coupling.
 * Read both when splitting the null space and when asking whether a direction moves a column, so the two never disagree over whether a vector touches something.
 */
const COUPLING_EPSILON = 1e-8;

/**
 * Orthonormalise in order, dropping whatever the vectors before it already span.
 * Plain modified Gram-Schmidt: these live in `ker(A)`'s own coordinates, a handful of dimensions even on the most redundant mechanism in the gallery.
 */
function orthonormalise(vectors: Float64Array[], size: number): Float64Array[] {
  const basis: Float64Array[] = [];
  for (const vector of vectors) {
    const v = Float64Array.from(vector);
    for (const b of basis) {
      let dot = 0;
      for (let i = 0; i < size; i++) dot += b[i] * v[i];
      for (let i = 0; i < size; i++) v[i] -= dot * b[i];
    }
    let norm = 0;
    for (let i = 0; i < size; i++) norm += v[i] * v[i];
    norm = Math.sqrt(norm);
    if (norm <= COUPLING_EPSILON) continue;
    for (let i = 0; i < size; i++) v[i] /= norm;
    basis.push(v);
  }
  return basis;
}

/**
 * Split the redundancies into the ones the model owns and the ones it does not.
 *
 * A `foreign` unknown stands for a belt, a gear mesh or a contact this model has no term for, and it costs no energy — so left in the minimisation it is a free lunch: the energy hands it every newton it can, because a beam that carries nothing stores nothing.
 * That answer is arbitrary, and worse than arbitrary in that it looks settled.
 * Menabrea is therefore allowed to choose only along `owned`, the directions that leave every unmodelled action where it is; whatever `unowned` touches is reported as unknown, however far from the belt it sits.
 */
function split_null_space(
  system: StaticsSystem,
  nullSpace: Float64Array[],
): { owned: Float64Array[]; unowned: Float64Array[] } {
  const h = nullSpace.length;
  const foreignColumns: number[] = [];
  for (const face of system.interfaces)
    if (face.foreign)
      for (const column of [face.columns.fx, face.columns.fy, face.columns.m])
        if (column >= 0) foreignColumns.push(column);
  if (h === 0 || foreignColumns.length === 0)
    return { owned: nullSpace, unowned: [] };

  // One row per unmodelled component, read across the null basis: its span is exactly the directions that move that component, and its orthogonal complement the ones that do not.
  const unowned = orthonormalise(
    foreignColumns.map((column) => Float64Array.from(nullSpace, (n) => n[column])),
    h,
  );
  const axes = Array.from({ length: h }, (_, i) => {
    const e = new Float64Array(h);
    e[i] = 1;
    return e;
  });
  const owned = orthonormalise([...unowned, ...axes], h).slice(unowned.length);

  /** Back from the null space's coordinates to the unknowns'. Orthonormal in, orthonormal out: `nullSpace` is itself orthonormal. */
  const lift = (weights: Float64Array): Float64Array => {
    const out = new Float64Array(nullSpace[0].length);
    for (let i = 0; i < h; i++)
      for (let k = 0; k < out.length; k++) out[k] += weights[i] * nullSpace[i][k];
    return out;
  };
  return { owned: owned.map(lift), unowned: unowned.map(lift) };
}

/**
 * Settle each belt's pretension: shift `x` in place along the free direction that moves its strands, until its slackest strand reads zero.
 *
 * Between rigid supports that pretension is a redundancy no member's flexibility reaches, so without this the commonest drive there is would read as unknown.
 * A belt can only pull, and of every tension equilibrium allows this keeps the least — what the drive needs to transmit its load, and no more.
 *
 * `belts` holds each belt's strand columns; returns `free` without the directions it used.
 * A belt that several free directions move, or one along which its strands do not all stretch together, is left open and keeps reading as unknown.
 */
function slacken_belts(
  x: Float64Array,
  belts: number[][],
  free: Float64Array[],
): Float64Array[] {
  let remaining = free;
  for (const columns of belts) {
    if (columns.length === 0 || remaining.length === 0) continue;
    const touches = remaining.map((n) => columns.map((c) => n[c]));
    const reference = touches.reduce((a, b) => (norm(b) > norm(a) ? b : a));
    const referenceNorm = norm(reference);
    if (referenceNorm <= COUPLING_EPSILON) continue;
    const unit = reference.map((v) => v / referenceNorm);
    const weights = touches.map((t) => t.reduce((s, v, k) => s + v * unit[k], 0));
    const oneDirection = touches.every((t, i) =>
      t.every((v, k) => Math.abs(v - weights[i] * unit[k]) <= COUPLING_EPSILON),
    );
    if (!oneDirection) continue;

    const direction = new Float64Array(x.length);
    const weightNorm = norm(weights);
    remaining.forEach((n, i) => {
      for (let k = 0; k < x.length; k++) direction[k] += (weights[i] / weightNorm) * n[k];
    });
    const sign = unit[0] < 0 ? -1 : 1;
    if (!columns.every((c) => sign * direction[c] > COUPLING_EPSILON)) continue;
    for (let k = 0; k < x.length; k++) direction[k] *= sign;

    let shift = -Infinity;
    for (const c of columns) shift = Math.max(shift, -x[c] / direction[c]);
    for (let k = 0; k < x.length; k++) x[k] += shift * direction[k];
    remaining = orthonormalise([direction, ...remaining], x.length).slice(1);
  }
  return remaining;
}

const norm = (v: ArrayLike<number>): number => {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  return Math.sqrt(s);
};

/**
 * Assemble and solve one frame's equilibrium.
 *
 * `flexibility` applies `F` to a vector of unknowns — the block-diagonal member flexibility of the minimum-complementary-energy formulation, which is what gives a hyperstatic structure an answer.
 * Omit it and an indeterminate system falls back to the minimum-norm solution, which is **not** an answer: read `determined` and report the rest as unknown rather than showing it.
 */
export function solve_statics(
  system: StaticsSystem,
  specs: BeamCohesionSpec[],
  frame: StaticsFrame,
  flexibility?: Flexibility,
): StaticsSolution | undefined {
  const specOf = new Map(specs.map((s) => [s.beamID, s]));
  const gearOf = new Map(system.gears.map((g) => [g.id, g]));
  const states = new Map<ID, BeamState>();
  for (const spec of specs) {
    const state = beam_state(spec, frame);
    if (state) states.set(spec.beamID, state);
  }

  const a: Matrix = zeros(system.rows, system.columns);
  const b = new Float64Array(system.rows);
  const rowOfBeam = new Map<ID, number>();
  const rowOfGear = new Map<ID, number>();
  const rowOfNode = new Map<string, number>();
  for (const body of system.bodies) {
    if (body.kind === "beam" && body.beamID !== undefined) rowOfBeam.set(body.beamID, body.row);
    if (body.kind === "gear" && body.gearID !== undefined) rowOfGear.set(body.gearID, body.row);
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
    // A uniform straight bar about its own centre.
    // The solver's own three lumps reproduce exactly this (`2·(m/6)·(L/2)² = mL²/12`), so taking the continuum figure changes no physics — only which of the two models the reading belongs to.
    const inertia = (mass * state.length * state.length) / 12;
    b[row + 2] = distributed.moment - inertia * state.angularAcceleration;
  }

  for (const gear of system.gears) {
    const row = rowOfGear.get(gear.id);
    const centre = frame.positionOf(gear.centreKey);
    if (row === undefined || !centre) continue;
    const acceleration = frame.accelerationOf(gear.centreKey);
    // The same shape as a beam's, one term shorter: a disc carries no distributed load, and gravity works at its centre so it makes no moment there.
    b[row] = gear.mass * (frame.gravity.x - acceleration.x);
    b[row + 1] = gear.mass * (frame.gravity.y - acceleration.y);
    b[row + 2] = -gear.inertia * frame.gearAngularAcceleration(gear.id);
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
    if (face.gearID !== undefined) {
      const gearRow = rowOfGear.get(face.gearID);
      const gear = gearOf.get(face.gearID);
      const centre = gear && frame.positionOf(gear.centreKey);
      const at = frame.positionOf(face.nodeKey);
      if (gearRow === undefined || !centre || !at) continue;
      // Same convention as a beam's: the unknown is what the GEAR applies onto the node, and its moment is taken about the gear's own centre.
      const arm = at.sub(centre);
      add_at(a, gearRow, fx, 1);
      add_at(a, gearRow + 1, fy, 1);
      add_at(a, gearRow + 2, fx, cross(arm, 1, 0));
      add_at(a, gearRow + 2, fy, cross(arm, 0, 1));
      if (m >= 0) add_at(a, gearRow + 2, m, 1);
      continue;
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

  const strands: (Omit<StaticsStrand, "tension" | "determined"> & { column: number })[] = [];
  const beltColumns: number[][] = [];
  for (const belt of system.belts) {
    // The belt as it actually lies this frame: a pulley it has left touches nothing, so it drops out of the path and the strand runs straight on to the next one it still holds.
    const contact: { via: BeltVia; index: number }[] = [];
    belt.viaKeys.forEach((key, i) => {
      const gone =
        belt.viaGears[i] !== undefined &&
        belt.length.disconnected?.[belt.closed ? i : i - 1] === true;
      const pos = frame.positionOf(key);
      if (gone || !pos) return;
      contact.push({
        via: { pos, radius: belt.radii[i], clockwise: belt.clockwise[i] },
        index: i,
      });
    });
    if (contact.length < 2) continue;

    /** One end of a strand pulling on whichever body its via stands for: a pulley takes it at its rim, with the arm that turns it; a terminal is a bare point. */
    const pull = (viaIndex: number, at: Point2, u: Point2, sign: number, column: number) => {
      const gearID = belt.viaGears[viaIndex];
      if (gearID !== undefined) {
        const gearRow = rowOfGear.get(gearID);
        const gear = gearOf.get(gearID);
        const centre = gear && frame.positionOf(gear.centreKey);
        if (gearRow === undefined || !centre) return;
        // A body row reads `Σ (what it applies) = … − (what is applied to it)`, hence the flip.
        const arm = at.sub(centre);
        add_at(a, gearRow, column, -sign * u.x);
        add_at(a, gearRow + 1, column, -sign * u.y);
        add_at(a, gearRow + 2, column, -sign * cross(arm, u.x, u.y));
        return;
      }
      const nodeRow = rowOfNode.get(belt.viaKeys[viaIndex]);
      if (nodeRow === undefined) return;
      // A node row reads `Σ (what is applied onto it)`, so a strand enters it as it pulls.
      add_at(a, nodeRow, column, sign * u.x);
      add_at(a, nodeRow + 1, column, sign * u.y);
    };

    const columns: number[] = [];
    beltColumns.push(columns);
    for (const piece of belt_pieces(
      contact.map((c) => c.via),
      belt.closed,
    )) {
      if (piece.kind !== "segment") continue;
      const span = piece.to.sub(piece.from);
      if (span.length_squared() < 1e-18) continue;
      const u = span.normalize();
      const from = contact[piece.gearIndexA].index;
      const to = contact[piece.gearIndexB].index;
      const column = belt.columns[from];
      if (column === undefined) continue;
      columns.push(column);
      strands.push({
        beltID: belt.beltID,
        from: piece.from,
        to: piece.to,
        fromGear: belt.viaGears[from],
        toGear: belt.viaGears[to],
        column,
      });
      // A tension pulls both of its ends towards each other: `+T·u` where it leaves, `−T·u` where it lands.
      pull(from, piece.from, u, 1, column);
      pull(to, piece.to, u, -1, column);
    }
  }

  for (const coupling of system.couplings) {
    const rowA = rowOfGear.get(coupling.gearA);
    const rowB = rowOfGear.get(coupling.gearB);
    if (rowA === undefined || rowB === undefined) continue;
    const column = coupling.column;
    if (coupling.kind === "coaxial") {
      // `θ₁ − θ₂ = offset` passes a couple `+C` to one and `−C` to the other, and no force: their centres are the same point.
      // Both rows read `Σ (what the gear applies) = … − (what is applied TO it)`, hence the flip.
      add_at(a, rowA + 2, column, -1);
      add_at(a, rowB + 2, column, 1);
      continue;
    }
    const centreA = gearOf.get(coupling.gearA);
    const centreB = gearOf.get(coupling.gearB);
    const pa = centreA && frame.positionOf(centreA.centreKey);
    const pb = centreB && frame.positionOf(centreB.centreKey);
    if (!pa || !pb) continue;
    const span = pb.sub(pa);
    if (span.length_squared() < 1e-18) continue;
    // The teeth push along the common tangent, at the pitch point on the line of centres.
    // One unknown: `GearMeshAngle` corrects `r₁θ₁ + r₂θ₂`, so its multiplier reaches the two gears with arms `r₁` and `r₂` of the SAME sign — external meshing, which is the only kind that `+` describes.
    const tangent = span.normalize().perp();
    add_at(a, rowA, column, -tangent.x);
    add_at(a, rowA + 1, column, -tangent.y);
    add_at(a, rowA + 2, column, -coupling.radiusA);
    add_at(a, rowB, column, tangent.x);
    add_at(a, rowB + 1, column, tangent.y);
    add_at(a, rowB + 2, column, -coupling.radiusB);
  }

  const solved = solve_least_squares(a, b);
  const split = split_null_space(system, solved.nullSpace);
  const minimum = flexibility
    ? minimise_energy(solved.x, split.owned, flexibility.applyF, flexibility.linear)
    : undefined;
  const x = minimum ? minimum.x : solved.x;
  // Only among the redundancies the model owns: a direction that also moves an unmodelled action is not this model's to settle, belt or not.
  const free = slacken_belts(x, beltColumns, minimum ? minimum.residualNull : split.owned);

  // A component is settled when nothing the answer is still free to move along touches it.
  // With a flexibility that is NOT `ker(A)`: Menabrea picks one member of the redundancies the model owns, so a plain over-constrained frame is an answer rather than an unknown.
  // What stays open is what it may not choose within (`unowned`) and what neither it nor the belts' pretension could (`free`).
  // The vectors are unit-norm throughout, so this compares a share of one against a share of one.
  const open = [...split.unowned, ...free];
  const varies = (column: number) =>
    column >= 0 && open.some((n) => Math.abs(n[column]) > COUPLING_EPSILON);

  let scale = 0;
  for (const value of b) scale = Math.max(scale, Math.abs(value));

  return {
    torsors: system.interfaces.map((face) => {
      const spec = face.beamID !== undefined ? specOf.get(face.beamID) : undefined;
      const state = face.beamID !== undefined ? states.get(face.beamID) : undefined;
      return {
        beamID: face.beamID,
        gearID: face.gearID,
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
    strands: strands.map(({ column, ...strand }) => ({
      ...strand,
      tension: x[column],
      determined: !varies(column),
    })),
    indeterminacy: solved.nullSpace.length,
    residual: solved.residual,
    scale,
  };
}
