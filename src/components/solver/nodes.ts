import { Point2 } from "../../types/point2";

/**
 * Solver node storage: parallel `Float64Array`s addressed by slot instead of by string
 * key. Keys are resolved to slots once per solve (see `link-slots.ts`); an unknown key
 * resolves to `ABSENT`, which every constraint must treat as a missing node — the same
 * short-circuit `Map.get()` returning `undefined` used to give.
 */
export interface Nodes {
  x: Float64Array;
  y: Float64Array;
  /** Inverse mass: 0 = anchored. A node added without one gets 1. */
  w: Float64Array;
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
}

/** Edition nodes: gear radii are the extra DOF; there are no angles. */
export interface EditNodes extends Nodes {
  radius: Float64Array;
  /** Inverse mass of the radius DOF: 0 = dimensioned, hence fixed. */
  wRadius: Float64Array;
  radIndex: Map<string, number>;
  radKeys: string[];
}

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
    index: new Map(),
    keys: [],
    count: 0,
  };
}

/**
 * Appends a node, or returns the existing slot if the key is already known (without
 * touching its values). Invalidates any `Float64Array` reference held across the call —
 * growing reallocates. Never call it during a sweep.
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

// ─────────────────────────────────────────────────────────────────────────────
// Marshalling with the map-shaped API the callers and the measurement benches use
// ─────────────────────────────────────────────────────────────────────────────

function fillPositions(
  nodes: Nodes,
  positions: Map<string, Point2>,
  posMasses: Map<string, number>,
): void {
  for (const [key, p] of positions)
    addNode(nodes, key, p.x, p.y, posMasses.get(key) ?? 1);
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
 * The solver's internal node set: it carries both extra DOF families so one solver can
 * serve both modes. The constraints themselves declare `Nodes`, `SimNodes` or `EditNodes`
 * according to what they are allowed to touch.
 */
export type SolveNodes = SimNodes & EditNodes;

export function solveNodesFromMaps(
  positions: Map<string, Point2>,
  posMasses: Map<string, number>,
  angles: Map<string, number>,
  radii: Map<string, number>,
  radMasses: Map<string, number>,
): SolveNodes {
  const nodes = makeNodes(positions.size || 16) as SolveNodes;
  fillPositions(nodes, positions, posMasses);
  nodes.angle = new Float64Array(angles.size);
  nodes.angleIndex = new Map();
  nodes.angleKeys = [];
  fillScalars(nodes.angleIndex, nodes.angleKeys, nodes.angle, undefined, angles, undefined);
  nodes.radius = new Float64Array(radii.size);
  nodes.wRadius = new Float64Array(radii.size);
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

export function writeScalarsBack(
  index: Map<string, number>,
  values: Float64Array,
  target: Map<string, number>,
): void {
  for (const [key, i] of index) target.set(key, values[i]);
}
