/**
 * When a belt left a pulley, or took one back, during a recording.
 *
 * These are the instants the mechanism's mobility changes without any geometry degenerating:
 * a strand law disappears with the pulley it named, and the freedom it was holding comes
 * back. The analysis accounts for them (see `apply_belt_disconnections`), but only for the
 * pose it is looking at — this says *when* they happened, over the whole recording.
 *
 * Free, and that is the point. The simulation decides contact itself, frame by frame, and
 * writes it into every snapshot; finding the events is reading those flags, never a solve
 * and never a model. Measured, one recorded frame already costs 0.3 to 11.5 ms — on the
 * heaviest mechanism the recording saturates real time on its own — so anything that
 * re-measured mobility per frame would have to be paid for by the recording itself.
 *
 * Singular configurations are the other half of the story, and they are NOT here: a rank
 * that drops needs the constraints, hence solves, hence a budget this has none of.
 */

import { ID } from "../../types";
import { KinematicSnapshot } from "../../types/runtime-state";
import { snapshot_belt_detached } from "./snapshot";

export type BeltEvent = {
  /** Simulated time of the first snapshot that records the change. */
  t: number;
  belt: ID;
  /** Index into the belt's `attachedGearsIDs`, whose length is fixed for the whole run. */
  gearIndex: number;
  kind: "detach" | "reattach";
};

/**
 * Every contact change along `snapshots`, in time order.
 *
 * Pure, and cheap enough to redo whenever the recording grows: memoise it on the snapshot
 * array rather than keeping a running state, which a scrub would have to unwind anyway.
 *
 * A belt absent from a snapshot's layout is skipped rather than read as "nothing detached":
 * an edit can add a belt mid-recording, and the frames before it knew nothing of it.
 */
export function belt_events(snapshots: KinematicSnapshot[]): BeltEvent[] {
  const events: BeltEvent[] = [];
  /** Detached indices per belt, as of the last snapshot that knew the belt. */
  const previous = new Map<ID, Set<number>>();

  for (const snapshot of snapshots)
    for (const belt of snapshot.layout.belts) {
      const detached = new Set(snapshot_belt_detached(snapshot, belt) ?? []);
      const before = previous.get(belt);
      previous.set(belt, detached);
      // First sight of a belt states no event: whatever it arrives with is its starting
      // condition, not something that just happened.
      if (before === undefined) continue;
      for (const gearIndex of detached)
        if (!before.has(gearIndex))
          events.push({ t: snapshot.t, belt, gearIndex, kind: "detach" });
      for (const gearIndex of before)
        if (!detached.has(gearIndex))
          events.push({ t: snapshot.t, belt, gearIndex, kind: "reattach" });
    }

  return events;
}
