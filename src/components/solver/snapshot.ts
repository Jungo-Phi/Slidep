import { ID } from "../../types/element";
import { Point2 } from "../../types/point2";
import {
  DynamicSnapshot,
  SimulationSnapshot,
  SnapshotLayout,
} from "../../types/runtime-state";

/**
 * Reading a snapshot: it holds raw numbers, and the layout says which key sits where.
 *
 * The accessors below answer like the `Map` they replace — `undefined` when the snapshot carries no value for that key, whether because the key has no slot at all or because its slot holds NaN. Reading a slot directly (`positions[2 * i]`) is the fast path and is what hot loops do, but they own the NaN check then.
 */

/**
 * Bridge nodes a grab adds to the solve for one frame.
 * They have a reserved slot in every layout — their key set is fixed, unlike their presence — and hold NaN on frames without a grab.
 */
export const GRAB_BRIDGE_KEY = "grab_bridge";
export const GRAB_PERIMETER_KEY = "grab_perimeter";
export const GRAB_BELT_KEY = "grab_belt";
export const GRAB_KEYS = [GRAB_BRIDGE_KEY, GRAB_PERIMETER_KEY, GRAB_BELT_KEY];

/**
 * The layout of a recording, from the key sets of the model it was compiled from.
 * `keys` are the snapshot's own position keys — decoupled, one per part of a fused key — and the grab slots are appended here so no caller can forget them.
 */
export function make_snapshot_layout(
  keys: string[],
  angleKeys: string[],
  belts: BeltShape[] = [],
): SnapshotLayout {
  return snapshot_layout([...keys, ...GRAB_KEYS], angleKeys, belts);
}

/** A belt and how many pulleys it carries — fixed for the whole recording. */
export interface BeltShape {
  id: ID;
  pulleys: number;
}

/** A layout over exactly these slots, grab keys included: the form the wire carries, where
 * the reserved slots are already part of `keys`. */
export function snapshot_layout(
  keys: string[],
  angleKeys: string[],
  belts: BeltShape[] = [],
): SnapshotLayout {
  const index = new Map<string, number>();
  keys.forEach((key, i) => index.set(key, i));
  const angleIndex = new Map<string, number>();
  angleKeys.forEach((key, i) => angleIndex.set(key, i));

  const beltIndex = new Map<ID, number>();
  const beltStart = new Int32Array(belts.length + 1);
  belts.forEach((belt, r) => {
    beltIndex.set(belt.id, r);
    beltStart[r + 1] = beltStart[r] + belt.pulleys;
  });
  const wrapBase = angleKeys.length;
  const pulleys = beltStart[belts.length];
  return {
    keys,
    index,
    angleKeys,
    angleIndex,
    belts: belts.map((b) => b.id),
    beltIndex,
    beltStart,
    wrapBase,
    detachBase: wrapBase + pulleys,
    arrivalBase: wrapBase + 2 * pulleys,
  };
}

/** How long a snapshot's `angles` array is under this layout. */
export function angles_length(layout: SnapshotLayout): number {
  return layout.arrivalBase + (layout.detachBase - layout.wrapBase);
}

/**
 * One per-pulley block of a belt, or `undefined` when this snapshot carries none — the belt is unknown, or its state had not been seeded yet.
 *
 * Generic over `SimulationSnapshot`: kinematic and dynamic snapshots share the same wrap/detach/arrival layout past `angleKeys` (both compile through `compile_simulation_model`), so one body serves either.
 */
function belt_block<S extends SimulationSnapshot>(
  snapshot: S,
  belt: ID,
  base: number,
): number[] | undefined {
  const { beltIndex, beltStart } = snapshot.layout;
  const r = beltIndex.get(belt);
  if (r === undefined) return undefined;
  const out: number[] = [];
  for (let p = beltStart[r]; p < beltStart[r + 1]; p++) {
    const v = snapshot.angles[base + p];
    if (Number.isNaN(v)) return undefined;
    out.push(v);
  }
  return out;
}

/** Continuous wrap angle per attached pulley of `belt`, in `attachedGearsIDs` order. */
export function snapshot_belt_wraps<S extends SimulationSnapshot>(
  snapshot: S,
  belt: ID,
): number[] | undefined {
  return belt_block(snapshot, belt, snapshot.layout.wrapBase);
}

/** Continuous arrival rim angle per attached pulley of `belt`, same order. */
export function snapshot_belt_arrivals<S extends SimulationSnapshot>(
  snapshot: S,
  belt: ID,
): number[] | undefined {
  return belt_block(snapshot, belt, snapshot.layout.arrivalBase);
}

/**
 * Indices, into `attachedGearsIDs`, of the pulleys `belt` has lost contact with.
 * Empty when it has lost none, `undefined` only when the snapshot does not know this belt: the two say different things, and a caller putting the state back needs to tell them apart.
 */
export function snapshot_belt_detached<S extends SimulationSnapshot>(
  snapshot: S,
  belt: ID,
): number[] | undefined {
  const { beltIndex, beltStart, detachBase } = snapshot.layout;
  const r = beltIndex.get(belt);
  if (r === undefined) return undefined;
  const out: number[] = [];
  for (let p = beltStart[r]; p < beltStart[r + 1]; p++)
    if (snapshot.angles[detachBase + p] === 1) out.push(p - beltStart[r]);
  return out;
}

/** The position recorded for `key`, or `undefined` when this snapshot has none. */
/**
 * Generic over `SimulationSnapshot`: `positions` is always exactly `2 * layout.keys.length` long on either concrete subtype, so a position slot is never out of bounds whichever kind this is called with.
 * The belt accessors above index past `angleKeys.length` on purpose — both concrete subtypes' `angles` array has room for it (see `SnapshotLayout`).
 */
export function snapshot_point<S extends SimulationSnapshot>(
  snapshot: S,
  key: string,
): Point2 | undefined {
  const i = snapshot.layout.index.get(key);
  if (i === undefined) return undefined;
  const x = snapshot.positions[2 * i];
  return Number.isNaN(x) ? undefined : new Point2(x, snapshot.positions[2 * i + 1]);
}

/** The angle (rad) recorded for `key`, or `undefined` when this snapshot has none. Generic
 * like `snapshot_point`, for the same reason — an angle slot never exceeds `layout.angleKeys.length`, which both concrete subtypes size their `angles` array to at least (and beyond, for the belt blocks that follow it). */
export function snapshot_angle<S extends SimulationSnapshot>(
  snapshot: S,
  key: string,
): number | undefined {
  const i = snapshot.layout.angleIndex.get(key);
  if (i === undefined) return undefined;
  const a = snapshot.angles[i];
  return Number.isNaN(a) ? undefined : a;
}

/** The velocity recorded for `key` in a dynamic-mode snapshot — see `snapshot_point`. */
export function snapshot_velocity(
  snapshot: DynamicSnapshot,
  key: string,
): Point2 | undefined {
  const i = snapshot.layout.index.get(key);
  if (i === undefined) return undefined;
  const x = snapshot.velocities[2 * i];
  return Number.isNaN(x) ? undefined : new Point2(x, snapshot.velocities[2 * i + 1]);
}

/** The acceleration recorded for `key` in a dynamic-mode snapshot — see `snapshot_point`. */
export function snapshot_acceleration(
  snapshot: DynamicSnapshot,
  key: string,
): Point2 | undefined {
  const i = snapshot.layout.index.get(key);
  if (i === undefined) return undefined;
  const x = snapshot.accelerations[2 * i];
  return Number.isNaN(x) ? undefined : new Point2(x, snapshot.accelerations[2 * i + 1]);
}

/** The angular velocity (rad/s) recorded for `key` in a dynamic-mode snapshot — see
 * `snapshot_angle`. */
export function snapshot_angle_velocity(
  snapshot: DynamicSnapshot,
  key: string,
): number | undefined {
  const i = snapshot.layout.angleIndex.get(key);
  if (i === undefined) return undefined;
  const v = snapshot.angleVelocities[i];
  return Number.isNaN(v) ? undefined : v;
}
