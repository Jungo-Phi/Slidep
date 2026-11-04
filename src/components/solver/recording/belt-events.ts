/**
 * When a belt left a pulley, or took one back, during a recording.
 *
 * These are the instants the mechanism's mobility changes without any geometry degenerating: a strand law disappears with the pulley it named, and the freedom it was holding comes back.
 * The analysis accounts for them (see `apply_belt_disconnections`), but only for the pose it is looking at — this says *when* they happened, over the whole recording.
 *
 * Free, and that is the point.
 * The simulation decides contact itself, frame by frame, and writes it into every snapshot; finding the events is reading those flags, never a solve and never a model.
 * Measured, one recorded frame already costs 0.3 to 11.5 ms — on the heaviest mechanism the recording saturates real time on its own — so anything that re-measured mobility per frame would have to be paid for by the recording itself.
 *
 * Singular configurations are the other half of the story, and they are NOT here: a rank that drops needs the constraints, hence solves, hence a budget this has none of.
 */

import { ID } from "../../../types";
import { SimulationSnapshot } from "../../../types/runtime-state";
import { belt_contact_switch } from "../dynamics/simulation-engine";
import { snapshot_belt_detached } from "../snapshot";
import { extends_recording } from "./recording-growth";

export type BeltEvent = {
  /**
   * Simulated time of the change, found between the two snapshots that frame it the way the playback draws it (`belt_contact_switch`).
   * Where they cannot tell, a detachment sits at the earlier one and a reattachment at the later one, as the playback draws those too.
   */
  t: number;
  belt: ID;
  /** Index into the belt's `attachedGearsIDs`, whose length is fixed for the whole run. */
  gearIndex: number;
  kind: "detach" | "reattach";
};

/**
 * Every contact change along `snapshots`, in time order.
 *
 * A belt absent from a snapshot's layout is skipped rather than read as "nothing detached": an edit can add a belt mid-recording, and the frames before it knew nothing of it.
 *
 * Generic over `SimulationSnapshot`: kinematic and dynamic recordings carry the same detach block (see `SnapshotLayout`), so this reads either — unlike dead-point events, which stay kinematic-only (a mechanism driven by an imposed-position motor has no dynamic-mode equivalent).
 */
export function belt_events<S extends SimulationSnapshot>(snapshots: S[]): BeltEvent[] {
  return extend_belt_events(snapshots, null).events;
}

/** A scan with what it takes to resume it — see {@link extend_belt_events}. Its arrays grow in place when it is resumed. */
export interface BeltEventScan {
  events: BeltEvent[];
  source: readonly SimulationSnapshot[];
  count: number;
  /** Detached indices per belt, as of the last snapshot that knew the belt. */
  previous: Map<ID, Set<number>>;
  /** That snapshot itself, per belt: the earlier end of the interval a change is placed in. */
  previousSnapshot: Map<ID, SimulationSnapshot>;
}

/**
 * {@link belt_events}, reading only the frames `scan` has not seen when `snapshots` is the same recording grown since (see `extends_recording`), and from the start otherwise.
 * What the timeline calls at every mirror tick, where a full pass would cost more the longer the recording runs.
 */
export function extend_belt_events<S extends SimulationSnapshot>(
  snapshots: S[],
  scan: BeltEventScan | null,
): BeltEventScan {
  const resumes = scan !== null && extends_recording(snapshots, scan.source, scan.count);
  const events = resumes ? scan.events : [];
  const previous = resumes ? scan.previous : new Map<ID, Set<number>>();
  const previousSnapshot = resumes ? scan.previousSnapshot : new Map<ID, SimulationSnapshot>();

  for (let i = resumes ? scan.count : 0; i < snapshots.length; i++) {
    const snapshot = snapshots[i];
    for (const belt of snapshot.layout.belts) {
      const detached = new Set(snapshot_belt_detached(snapshot, belt) ?? []);
      const before = previous.get(belt);
      const earlier = previousSnapshot.get(belt);
      previous.set(belt, detached);
      previousSnapshot.set(belt, snapshot);
      // First sight of a belt states no event: whatever it arrives with is its starting condition, not something that just happened.
      if (before === undefined || earlier === undefined) continue;
      /** When the change happened between `earlier` and `snapshot`; `fallback` is the share of the interval used where the two cannot tell. */
      const at = (gearIndex: number, fallback: number) => {
        const r = snapshot.layout.beltIndex.get(belt);
        const u =
          earlier.layout === snapshot.layout && r !== undefined
            ? belt_contact_switch(earlier, snapshot, r, gearIndex)
            : undefined;
        return earlier.t + (u ?? fallback) * (snapshot.t - earlier.t);
      };
      for (const gearIndex of detached)
        if (!before.has(gearIndex))
          events.push({ t: at(gearIndex, 0), belt, gearIndex, kind: "detach" });
      for (const gearIndex of before)
        if (!detached.has(gearIndex))
          events.push({ t: at(gearIndex, 1), belt, gearIndex, kind: "reattach" });
    }
  }

  return { events, source: snapshots, count: snapshots.length, previous, previousSnapshot };
}
