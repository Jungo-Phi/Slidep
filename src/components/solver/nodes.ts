import { Point2 } from "../../types/point2";

/**
 * Solver node storage: parallel `Float64Array`s addressed by slot instead of by string key.
 * Keys are resolved to slots once per solve (see `link-slots.ts`); an unknown key resolves to `ABSENT`, which every constraint must treat as a missing node, the way it would read `Map.get()` returning `undefined`.
 */
export interface Nodes {
  x: Float64Array;
  y: Float64Array;
  /** Inverse mass: 0 = anchored. A node added without one gets 1. */
  w: Float64Array;
  /**
   * Velocity, in world units/s. Grown alongside `x`/`y`/`w` so a node added mid-solve (a grab bridge) stays in bounds, but only a dynamics step (see `PBD_solve`'s `dynamics` param) ever writes anything other than 0 into it — edition and kinematic solves leave it inert.
   */
  vx: Float64Array;
  vy: Float64Array;
  /**
   * External force (N), grown alongside `vx`/`vy` for the same reason.
   * A dynamics step folds it into the predict step's acceleration as `gx + fx·w` — force divided by mass, added to gravity — so it is meaningless without a real mass behind it (see `mass-model.ts`).
   */
  fx: Float64Array;
  fy: Float64Array;
  index: Map<string, number>;
  /** Slot → key, the inverse of `index`. */
  keys: string[];
  /** Slots in use. `x.length` is the allocated capacity, which is larger. */
  count: number;
}

/** Simulation nodes: gear angles are the extra DOF; radii are baked into the links. */
export interface SimNodes extends Nodes {
  angle: Float64Array;
  angleIndex: Map<string, number>;
  angleKeys: string[];
  /** Angular velocity (rad/s), one per `angle` slot — see `Nodes.vx`/`vy`. Angle nodes are
   * never grown mid-solve, so this is sized once and left there, unlike `vx`/`vy`. */
  vAngle: Float64Array;
  /**
   * Inverse rotational inertia (1/(kg·m²)), one per `angle` slot — the rotational analogue of `Nodes.w`.
   * A node added without one gets 1, same convention.
   */
  wAngle: Float64Array;
  /**
   * Whether `wAngle` holds real inertias, which a constraint coupling an angle to positions has to weigh through its lever arm (dynamics).
   * False, an angle weighs 1 against any position whatever the lever: the kinematic metric, which only has to converge, not to share momentum right.
   */
  inertialAngles: boolean;
  /** External torque (N·m), one per `angle` slot — the rotational analogue of `Nodes.fx`/`fy`,
   * folded into the predict step as `torque · wAngle`. */
  torque: Float64Array;
}

/** Edition nodes: gear radii are the extra DOF; there are no angles. */
export interface EditNodes extends Nodes {
  radius: Float64Array;
  /** Inverse mass of the radius DOF: 0 = dimensioned, hence fixed. */
  wRadius: Float64Array;
  /**
   * Smallest value each radius may be written to, one per slot — see `radiusFloor`.
   * Never zero: below `MIN_SOLVED_RADIUS`, meshing, belt geometry and ratios all divide into infinity.
   */
  minRadius: Float64Array;
  radIndex: Map<string, number>;
  radKeys: string[];
}

/**
 * How small a radius the solver may write, whatever the caller asks for.
 *
 * A numerical guard, not a size: nothing here says how small a gear may be, only that a zero one breaks the arithmetic downstream.
 */
export const MIN_SOLVED_RADIUS = 1e-6;

/** Slot of a key the node set does not know. */
export const ABSENT = -1;

const grow = (a: Float64Array, capacity: number) => {
  const next = new Float64Array(capacity);
  next.set(a);
  return next;
};

export function makeNodes(capacity: number = 16): Nodes {
  return {
    x: new Float64Array(capacity),
    y: new Float64Array(capacity),
    w: new Float64Array(capacity),
    vx: new Float64Array(capacity),
    vy: new Float64Array(capacity),
    fx: new Float64Array(capacity),
    fy: new Float64Array(capacity),
    index: new Map(),
    keys: [],
    count: 0,
  };
}

/**
 * Appends a node, or returns the existing slot if the key is already known (without touching its values).
 * Invalidates any `Float64Array` reference held across the call — growing reallocates.
 * Never call it during a sweep.
 */
export function addNode(
  nodes: Nodes,
  key: string,
  x: number,
  y: number,
  w: number = 1,
): number {
  const existing = nodes.index.get(key);
  if (existing !== undefined) return existing;
  if (nodes.count === nodes.x.length) {
    const capacity = nodes.count * 2 || 16;
    nodes.x = grow(nodes.x, capacity);
    nodes.y = grow(nodes.y, capacity);
    nodes.w = grow(nodes.w, capacity);
    nodes.vx = grow(nodes.vx, capacity);
    nodes.vy = grow(nodes.vy, capacity);
    nodes.fx = grow(nodes.fx, capacity);
    nodes.fy = grow(nodes.fy, capacity);
  }
  const i = nodes.count++;
  nodes.x[i] = x;
  nodes.y[i] = y;
  nodes.w[i] = w;
  nodes.index.set(key, i);
  nodes.keys[i] = key;
  return i;
}

export const slotOf = (nodes: Nodes, key: string | undefined): number =>
  key === undefined ? ABSENT : (nodes.index.get(key) ?? ABSENT);

export const angleSlotOf = (nodes: SimNodes, key: string | undefined): number =>
  key === undefined ? ABSENT : (nodes.angleIndex.get(key) ?? ABSENT);

export const radSlotOf = (nodes: EditNodes, key: string | undefined): number =>
  key === undefined ? ABSENT : (nodes.radIndex.get(key) ?? ABSENT);

/** Exchange type for the geometry-heavy constraints (belts), as `Point2` still is. */
export const point = (nodes: Nodes, i: number): Point2 =>
  new Point2(nodes.x[i], nodes.y[i]);

export function setPoint(nodes: Nodes, i: number, p: Point2): void {
  nodes.x[i] = p.x;
  nodes.y[i] = p.y;
}

export function addTo(nodes: Nodes, i: number, dx: number, dy: number): void {
  nodes.x[i] += dx;
  nodes.y[i] += dy;
}

/**
 * Diagonal of the mechanism's bounding box — the scale its own tolerances are judged against (see `PBD_kinematic_solver`'s `DIAGNOSTIC_TOLERANCE_RATIO`/`REMAINING_RATIO`), the same role `model_extent` plays for a chain's swing.
 * `0` for an empty or single-point node set, which the caller floors.
 */
export function nodes_extent(nodes: Nodes): number {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let n = 0; n < nodes.count; n++) {
    if (nodes.x[n] < minX) minX = nodes.x[n];
    if (nodes.y[n] < minY) minY = nodes.y[n];
    if (nodes.x[n] > maxX) maxX = nodes.x[n];
    if (nodes.y[n] > maxY) maxY = nodes.y[n];
  }
  return Number.isFinite(minX) ? Math.hypot(maxX - minX, maxY - minY) : 0;
}

/** Same diagonal as `nodes_extent`, for callers still on the map-shaped API (model
 * compilation, collision detection) rather than the indexed solver storage. */
export function positions_extent(positions: Map<string, Point2>): number {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of positions.values()) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return Number.isFinite(minX) ? Math.hypot(maxX - minX, maxY - minY) : 0;
}

/**
 * Extent substitute for a mechanism with no measurable size — every node at the same point, or none at all.
 * There is no scale to be relative to, so every extent-relative tolerance in the solver (`PBD_kinematic_solver`'s `DIAGNOSTIC_TOLERANCE_RATIO`/`REMAINING_RATIO`, `collision-detection.ts`'s `CONTACT_EPS_RATIO`, `simulation-engine.ts`'s `beltContact.detachRatio`/`reattachRatio`) falls back to the same 1 mm they were all tuned at.
 */
export const MIN_EXTENT_M = 0.001;

// ─────────────────────────────────────────────────────────────────────────────
// Marshalling with the map-shaped API the callers and the measurement benches use
// ─────────────────────────────────────────────────────────────────────────────

function fillPositions(
  nodes: Nodes,
  positions: Map<string, Point2>,
  posMasses: Map<string, number>,
  velocities: Map<string, Point2>,
  forces: Map<string, Point2>,
): void {
  for (const [key, p] of positions) {
    const i = addNode(nodes, key, p.x, p.y, posMasses.get(key) ?? 1);
    const v = velocities.get(key);
    if (v) {
      nodes.vx[i] = v.x;
      nodes.vy[i] = v.y;
    }
    const f = forces.get(key);
    if (f) {
      nodes.fx[i] = f.x;
      nodes.fy[i] = f.y;
    }
  }
}

function fillScalars(
  index: Map<string, number>,
  keys: string[],
  values: Float64Array,
  masses: Float64Array | undefined,
  source: Map<string, number>,
  massSource: Map<string, number> | undefined,
): void {
  let n = 0;
  for (const [key, v] of source) {
    index.set(key, n);
    keys[n] = key;
    values[n] = v;
    if (masses) masses[n] = massSource?.get(key) ?? 1;
    n++;
  }
}

/**
 * The solver's internal node set: it carries both extra DOF families so one solver can serve both modes.
 * The constraints themselves declare `Nodes`, `SimNodes` or `EditNodes` according to what they are allowed to touch.
 */
export type SolveNodes = SimNodes & EditNodes;

export function solveNodesFromMaps(
  positions: Map<string, Point2>,
  posMasses: Map<string, number>,
  angles: Map<string, number>,
  radii: Map<string, number>,
  radMasses: Map<string, number>,
  /**
   * Smallest radius this solve may shrink a gear to, in world units — the caller's, since only it knows the zoom the bound answers to.
   * A gear already under it keeps its own radius as its floor: a solve may hold a small gear where it is, never blow it out to a size nobody asked for.
   * Omitted, only `MIN_SOLVED_RADIUS` applies.
   */
  radiusFloor: number = 0,
  /** Warm-started into `vx`/`vy`/`vAngle` — read only by a dynamics step (see
   * `PBD_solve`'s `dynamics` param); every other caller leaves these empty. */
  velocities: Map<string, Point2> = new Map(),
  angleVelocities: Map<string, number> = new Map(),
  /**
   * Populates `wAngle` and turns `inertialAngles` on — see their doc on `SimNodes`.
   * Omitted, every angle gets 1, same as `posMasses`/`radMasses` when omitted.
   */
  angleMasses?: Map<string, number>,
  /** Populates `fx`/`fy` — read only by a dynamics step, like `velocities`. */
  forces: Map<string, Point2> = new Map(),
  /** Populates `torque` — read only by a dynamics step, like `angleVelocities`. */
  torques: Map<string, number> = new Map(),
): SolveNodes {
  const nodes = makeNodes(positions.size || 16) as SolveNodes;
  fillPositions(nodes, positions, posMasses, velocities, forces);
  nodes.angle = new Float64Array(angles.size);
  nodes.angleIndex = new Map();
  nodes.angleKeys = [];
  nodes.vAngle = new Float64Array(angles.size);
  nodes.wAngle = new Float64Array(angles.size);
  nodes.torque = new Float64Array(angles.size);
  nodes.inertialAngles = angleMasses !== undefined;
  fillScalars(nodes.angleIndex, nodes.angleKeys, nodes.angle, nodes.wAngle, angles, angleMasses);
  for (const [key, i] of nodes.angleIndex) {
    nodes.vAngle[i] = angleVelocities.get(key) ?? 0;
    nodes.torque[i] = torques.get(key) ?? 0;
  }
  nodes.radius = new Float64Array(radii.size);
  nodes.wRadius = new Float64Array(radii.size);
  nodes.minRadius = new Float64Array(radii.size);
  nodes.radIndex = new Map();
  nodes.radKeys = [];
  fillScalars(
    nodes.radIndex,
    nodes.radKeys,
    nodes.radius,
    nodes.wRadius,
    radii,
    radMasses,
  );
  for (let i = 0; i < nodes.radius.length; i++)
    nodes.minRadius[i] = Math.max(
      MIN_SOLVED_RADIUS,
      Math.min(radiusFloor, nodes.radius[i]),
    );
  return nodes;
}

/** Writes the solved values back into the caller's maps, preserving their key order. */
export function writePositionsBack(
  nodes: Nodes,
  positions: Map<string, Point2>,
): void {
  for (const [key, i] of nodes.index)
    if (i < nodes.count) positions.set(key, new Point2(nodes.x[i], nodes.y[i]));
}

/** Same as `writePositionsBack`, for the velocities a dynamics step produced. */
export function writeVelocitiesBack(
  nodes: Nodes,
  velocities: Map<string, Point2>,
): void {
  for (const [key, i] of nodes.index)
    if (i < nodes.count) velocities.set(key, new Point2(nodes.vx[i], nodes.vy[i]));
}

export function writeScalarsBack(
  index: Map<string, number>,
  values: Float64Array,
  target: Map<string, number>,
): void {
  for (const [key, i] of index) target.set(key, values[i]);
}
