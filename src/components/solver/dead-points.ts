/**
 * Where a driven mechanism stops going round: the instants a motor could not push through.
 *
 * The classic dead point — crank and rod aligned, a slider at the end of its stroke — where
 * the input turns and the mechanism does not follow. It is NOT a change of mobility: `m`
 * stays what it was, and the analysis panel keeps reporting it. What fails is the
 * *transmission*, and it is the fault a designer actually meets.
 *
 * The verdict is **read, not recomputed**. `step_simulation` compares each motor's achieved
 * advance against its commanded one at the frame it runs, and files the shortfall in the
 * snapshot's `unsatisfied` list. That verdict is dated: it belongs to the settings the frame
 * was recorded under. Deriving it here instead would mean dividing yesterday's motion by
 * today's commanded rate — and reversing a motor mid-run would flip the ratio on every past
 * frame at once, reading the whole recording as one block starting at zero.
 *
 * Free, therefore, and a pure function of the recording, like `belt_events`.
 */

import { ID } from "../../types";
import { KinematicSnapshot } from "../../types/runtime-state";

/** Frames a block must last to be reported, so one uneven frame is not an event. */
const MIN_BLOCKED_FRAMES = 2;

export type DeadPointTuning = {
  minBlockedFrames?: number;
};

export type DeadPoint = {
  /** Simulated time of the frame that carries the change, as the belt events are timed. */
  t: number;
  /** The motor that could not push through — the element the reader has a grip on. */
  motor: ID;
  /**
   * Going into the block, or coming out of it.
   *
   * Both are reported, as a belt reports leaving a pulley and taking it back: getting out of
   * a dead point is what reversing a motor is for, and a release with nothing to show for it
   * would leave the reader unsure whether the escape worked.
   */
  kind: "blocked" | "released";
};

const MOTOR_TYPES = new Set(["MotorBeam", "MotorAngle"]);

/** Motors the simulation reported blocked on this frame. */
const blocked_motors = (snapshot: KinematicSnapshot): Set<ID> => {
  const blocked = new Set<ID>();
  for (const residual of snapshot.unsatisfied ?? [])
    if (MOTOR_TYPES.has(residual.type)) blocked.add(residual.owner);
  return blocked;
};

/**
 * Every instant a motor stalls along `snapshots`, in time order.
 *
 * Pure, and cheap enough to redo whenever the recording grows: the per-frame work is
 * reading a list that is empty on almost every frame.
 */
export function dead_points(
  snapshots: KinematicSnapshot[],
  tuning: DeadPointTuning = {},
): DeadPoint[] {
  const { minBlockedFrames = MIN_BLOCKED_FRAMES } = tuning;

  /** Per motor: when the run in progress began, and how long it has lasted. */
  const running = new Map<ID, { since: number; frames: number }>();
  /** Reported instants, per motor and per kind. */
  const times = new Map<ID, { blocked: number[]; released: number[] }>();
  const listOf = (motor: ID) => {
    let held = times.get(motor);
    if (!held) times.set(motor, (held = { blocked: [], released: [] }));
    return held;
  };

  for (const snapshot of snapshots) {
    const blocked = blocked_motors(snapshot);
    for (const [motor, run] of running) {
      if (blocked.has(motor)) continue;
      running.delete(motor);
      // Only a run that was reported can be reported as over. A release stands on the
      // first free frame, the one that carries the change — the same convention as the
      // belt marks, and as the block's own start.
      if (run.frames >= minBlockedFrames) listOf(motor).released.push(snapshot.t);
    }
    for (const motor of blocked) {
      const run = running.get(motor) ?? { since: snapshot.t, frames: 0 };
      run.frames++;
      running.set(motor, run);
      // Reported on the frame it becomes certain, timed at the frame it began: the mark
      // must sit where the mechanism stopped, not where the count was reached.
      if (run.frames === minBlockedFrames) listOf(motor).blocked.push(run.since);
    }
  }
  // A recording that ends while still blocked has no release: nothing came out of it.

  const found: DeadPoint[] = [];
  for (const [motor, kinds] of times)
    for (const kind of ["blocked", "released"] as const)
      for (const t of kinds[kind]) found.push({ t, motor, kind });

  return found.sort(
    (a, b) => a.t - b.t || a.motor.localeCompare(b.motor) || a.kind.localeCompare(b.kind),
  );
}
