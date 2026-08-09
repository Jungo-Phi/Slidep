import { Mechanism } from "../../types";
import { KinematicSnapshot, SnapshotLayout } from "../../types/runtime-state";
import {
  FRAME_BUDGET_MS,
  MAX_RECORDING_TIME,
  RECORD_DT,
  recording_full,
  SimGrab,
  SimulationModel,
  compile_simulation_model,
  is_retained,
  max_recording_time,
  step_simulation,
} from "./kinematic-simulation";

/**
 * The recording engine: it owns a compiled model and turns "advance the simulated clock to
 * T" into snapshots, within a wall-clock budget.
 *
 * Deliberately free of React, of the DOM and of any notion of frames — it is the piece that
 * moves into a Web Worker, so it may only depend on the solver. What it keeps between calls
 * is the model, whose links carry per-frame belt state, and the last snapshot handed out.
 */
export class Recorder {
  private model: SimulationModel | null = null;
  private grab: SimGrab | null = null;
  /** Last snapshot handed out, to warm-start the next step from. */
  private last: KinematicSnapshot | null = null;
  /** How long this load may record: what its instants cost sets it. */
  private limit = MAX_RECORDING_TIME;

  /**
   * Adopt a mechanism, discarding whatever the previous one left. `resumeFrom` is the
   * snapshot the recording continues from — it carries the simulated state, so motor
   * angles and belt travel stay continuous across an edit.
   */
  load(mechanism: Mechanism, resumeFrom: KinematicSnapshot | null): void {
    this.model = compile_simulation_model(mechanism);
    this.limit = max_recording_time(this.model.layout);
    this.last = resumeFrom;
  }

  /** The longest this load records, in simulated seconds. */
  maxTime(): number {
    return this.limit;
  }

  /** The grab the next steps pull on, or `null` to let go. */
  setGrab(grab: SimGrab | null): void {
    this.grab = grab;
  }

  /** Where the recording currently ends, or `null` when nothing is recorded. */
  frontier(): number | null {
    return this.last?.t ?? null;
  }

  /** Whether the recording has run its full length and will produce nothing more. */
  full(): boolean {
    return recording_full(this.last?.t ?? -RECORD_DT, this.limit);
  }

  /** Whether a mechanism has been loaded — nothing can be recorded before that. */
  ready(): boolean {
    return this.model !== null;
  }

  /** The slot layout the snapshots of this load are written in, or `null` before one. */
  layout(): SnapshotLayout | null {
    return this.model?.layout ?? null;
  }

  /**
   * Solves instants spaced by `RECORD_DT` until the simulated clock reaches `targetTime`, or
   * until the budget runs out, and hands back the ones worth keeping (`is_retained`).
   * Falling behind costs time, never fidelity: the recording simply ends short of the target
   * and the next call picks it up.
   *
   * `solved` counts every step taken, kept or not — a call can advance the clock while
   * returning nothing, so it is progress, not `snapshots.length`, that says whether there is
   * more to do.
   */
  advance(
    targetTime: number,
    budgetMs: number = FRAME_BUDGET_MS,
  ): { snapshots: KinematicSnapshot[]; reached: number; solved: number } {
    // One step back from the first instant to record, so a fresh recording starts at t = 0.
    const frontier = this.last?.t ?? -RECORD_DT;
    const snapshots: KinematicSnapshot[] = [];
    if (!this.model) return { snapshots, reached: frontier, solved: 0 };

    const startedAt = performance.now();
    let produced = 0;
    let solved = 0;
    // The warm start follows every step, kept or not: what is thinned is the recording, not
    // the simulation.
    let latest = this.last;
    // A step is due while its instant is not past where the cursor is headed, to within the
    // half-step the cursor is allowed to lead by. At least one runs per call when any is
    // due: a mechanism whose single step outlasts the whole budget must still advance.
    // Never past the recording's full length: what bounds a session's memory is that no
    // instant beyond it is ever solved, not that the display stops asking for one.
    const dueUntil = Math.min(targetTime, this.limit) + RECORD_DT / 2;
    while (frontier + produced + RECORD_DT <= dueUntil) {
      produced += RECORD_DT;
      const t = frontier + produced;
      latest = step_simulation(
        this.model,
        t,
        latest,
        RECORD_DT,
        this.grab ?? undefined,
      );
      solved++;
      // Every instant is kept while the user is holding the mechanism: the display sits on
      // the frontier then, so an instant dropped there is one the grabbed part is drawn a
      // step behind the mouse at. A drag is short and the time axis is searched, never
      // divided, so the denser stretch it leaves costs nothing beyond its own bytes.
      if (this.grab !== null || is_retained(t)) snapshots.push(latest);
      if (performance.now() - startedAt >= budgetMs) break;
    }

    if (latest) this.last = latest;

    return { snapshots, reached: frontier + produced, solved };
  }
}
