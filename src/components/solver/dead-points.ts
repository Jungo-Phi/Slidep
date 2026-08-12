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

/** How much the gaps between blocks may vary and still read as a rhythm rather than a list. */
const PERIOD_TOLERANCE = 0.25;

/** Blocks needed before a rhythm can be claimed at all. */
const MIN_RECURRENCES = 3;

export type DeadPointTuning = {
  minBlockedFrames?: number;
  periodTolerance?: number;
  minRecurrences?: number;
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
  /**
   * Seconds between recurrences, when the block comes back on a rhythm.
   *
   * A crank driven from its slider meets its dead points twice a turn: at three turns a
   * second over twenty seconds that is a hundred and twenty of them, and marking each one
   * buries the very fact it is trying to state. A recurrence is a property of the
   * mechanism, not of an instant, so only the first is reported and it carries the rhythm.
   */
  period?: number;
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
 * Collapse a rhythm into its first occurrence.
 *
 * The gaps are compared to their own mean, so a mechanism turning slowly and one turning
 * fast are judged the same way. Anything irregular is left as a list: an event that happens
 * once is exactly what a mark is for.
 */
function fold_recurrences(
  times: number[],
  tolerance: number,
  minRecurrences: number,
): { t: number; period?: number }[] {
  if (times.length < minRecurrences) return times.map((t) => ({ t }));
  const gaps = times.slice(1).map((t, i) => t - times[i]);
  const mean = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
  if (mean <= 0) return times.map((t) => ({ t }));
  const regular = gaps.every((gap) => Math.abs(gap - mean) / mean <= tolerance);
  return regular ? [{ t: times[0], period: mean }] : times.map((t) => ({ t }));
}

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
  const {
    minBlockedFrames = MIN_BLOCKED_FRAMES,
    periodTolerance = PERIOD_TOLERANCE,
    minRecurrences = MIN_RECURRENCES,
  } = tuning;

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
      for (const { t, period } of fold_recurrences(
        kinds[kind],
        periodTolerance,
        minRecurrences,
      ))
        found.push({ t, motor, kind, ...(period ? { period } : {}) });

  return found.sort(
    (a, b) => a.t - b.t || a.motor.localeCompare(b.motor) || a.kind.localeCompare(b.kind),
  );
}
