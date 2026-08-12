import { ID } from "../../types/element";
import { Point2 } from "../../types/point2";
import { KinematicSnapshot, SnapshotLayout } from "../../types/runtime-state";

/**
 * Reading a snapshot: it holds raw numbers, and the layout says which key sits where.
 *
 * The accessors below answer like the `Map` they replace — `undefined` when the snapshot
 * carries no value for that key, whether because the key has no slot at all or because its
 * slot holds NaN. Reading a slot directly (`positions[2 * i]`) is the fast path and is what
 * hot loops do, but they own the NaN check then.
 */

/**
 * Bridge nodes a grab adds to the solve for one frame. They have a reserved slot in every
 * layout — their key set is fixed, unlike their presence — and hold NaN on frames without
 * a grab.
 */
export const GRAB_BRIDGE_KEY = "grab_bridge";
export const GRAB_PERIMETER_KEY = "grab_perimeter";
export const GRAB_BELT_KEY = "grab_belt";
export const GRAB_KEYS = [GRAB_BRIDGE_KEY, GRAB_PERIMETER_KEY, GRAB_BELT_KEY];

/**
 * The layout of a recording, from the key sets of the model it was compiled from. `keys`
 * are the snapshot's own position keys — decoupled, one per part of a fused key — and the
 * grab slots are appended here so no caller can forget them.
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
 *  the reserved slots are already part of `keys`. */
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

/** One per-pulley block of a belt, or `undefined` when this snapshot carries none — the
 *  belt is unknown, or its state had not been seeded yet. */
function belt_block(
  snapshot: KinematicSnapshot,
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
export function snapshot_belt_wraps(
  snapshot: KinematicSnapshot,
  belt: ID,
): number[] | undefined {
  return belt_block(snapshot, belt, snapshot.layout.wrapBase);
}

/** Continuous arrival rim angle per attached pulley of `belt`, same order. */
export function snapshot_belt_arrivals(
  snapshot: KinematicSnapshot,
  belt: ID,
): number[] | undefined {
  return belt_block(snapshot, belt, snapshot.layout.arrivalBase);
}

/**
 * Indices, into `attachedGearsIDs`, of the pulleys `belt` has lost contact with. Empty when
 * it has lost none, `undefined` only when the snapshot does not know this belt: the two say
 * different things, and a caller putting the state back needs to tell them apart.
 */
export function snapshot_belt_detached(
  snapshot: KinematicSnapshot,
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
export function snapshot_point(
  snapshot: KinematicSnapshot,
  key: string,
): Point2 | undefined {
  const i = snapshot.layout.index.get(key);
  if (i === undefined) return undefined;
  const x = snapshot.positions[2 * i];
  return Number.isNaN(x) ? undefined : new Point2(x, snapshot.positions[2 * i + 1]);
}

/** The angle (rad) recorded for `key`, or `undefined` when this snapshot has none. */
export function snapshot_angle(
  snapshot: KinematicSnapshot,
  key: string,
): number | undefined {
  const i = snapshot.layout.angleIndex.get(key);
  if (i === undefined) return undefined;
  const a = snapshot.angles[i];
  return Number.isNaN(a) ? undefined : a;
}
