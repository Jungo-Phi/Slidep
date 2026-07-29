import { Mechanism } from "../../types";
import { KinematicSnapshot } from "../../types/runtime-state";
import { constraint_severity } from "./PBD_kinematic_solver";
import {
  FRAME_BUDGET_MS,
  SimGrab,
  SimulationModel,
  compile_simulation_model,
  recording_step,
  step_ceiling,
  step_simulation,
} from "./kinematic-simulation";

/**
 * The recording engine: it owns a compiled model and turns "advance the simulated clock to
 * T" into snapshots, within a wall-clock budget.
 *
 * Deliberately free of React, of the DOM and of any notion of frames — it is the piece that
 * moves into a Web Worker, so it may only depend on the solver. What it keeps between calls
 * is what cannot be recomputed: the model (whose links carry per-frame belt state), the
 * measured cost of a step, and the coarsest step this mechanism tolerates.
 */
export class Recorder {
  private model: SimulationModel | null = null;
  private grab: SimGrab | null = null;
  /** Smoothed wall-clock cost of one step (ms); 0 until a step has been timed. */
  private stepCost = 0;
  /** Coarsest step that does not tear a constraint; infinite until one is torn. */
  private ceiling = Infinity;
  /** Last snapshot handed out, to warm-start the next step from. */
  private last: KinematicSnapshot | null = null;

  /**
   * Adopt a mechanism, discarding everything measured about the previous one. `resumeFrom`
   * is the snapshot the recording continues from — it carries the simulated state, so motor
   * angles and belt travel stay continuous across an edit.
   */
  load(mechanism: Mechanism, resumeFrom: KinematicSnapshot | null): void {
    this.model = compile_simulation_model(mechanism);
    this.stepCost = 0;
    this.ceiling = Infinity;
    this.last = resumeFrom;
  }

  /** The grab the next steps pull on, or `null` to let go. */
  setGrab(grab: SimGrab | null): void {
    this.grab = grab;
  }

  /** Where the recording currently ends, or `null` when nothing is recorded. */
  frontier(): number | null {
    return this.last?.t ?? null;
  }

  /** Whether a mechanism has been loaded — nothing can be recorded before that. */
  ready(): boolean {
    return this.model !== null;
  }

  /**
   * Steps until the simulated clock reaches `targetTime`, or until the budget runs out.
   *
   * `simDt` is what the caller asked to advance this round — it sizes the step, whereas
   * `targetTime` says where to stop. They differ once the recording has fallen behind:
   * the step must stay sized for one round's worth of work, not for the whole backlog.
   */
  advance(
    targetTime: number,
    simDt: number,
    budgetMs: number = FRAME_BUDGET_MS,
  ): { snapshots: KinematicSnapshot[]; stepDt: number; reached: number } {
    // The budget says how coarse we can afford to go; the ceiling says how coarse this
    // mechanism can take without tearing. The stricter of the two wins.
    const stepDt = Math.min(
      recording_step(simDt, this.stepCost),
      this.ceiling,
    );
    // One step back from the first instant to record, so a fresh recording starts at t = 0
    // whatever the step.
    const frontier = this.last?.t ?? -stepDt;
    const snapshots: KinematicSnapshot[] = [];
    if (!this.model) return { snapshots, stepDt, reached: frontier };

    const startedAt = performance.now();
    let produced = 0;
    // A step is due while its instant is not past where the cursor is headed, to within the
    // half-step the cursor is allowed to lead by. At least one runs per call when any is
    // due: a mechanism whose single step outlasts the whole budget must still advance.
    const dueUntil = targetTime + stepDt / 2;
    while (frontier + produced + stepDt <= dueUntil) {
      const prev = snapshots.length > 0 ? snapshots[snapshots.length - 1] : this.last;
      produced += stepDt;
      snapshots.push(
        step_simulation(
          this.model,
          frontier + produced,
          prev?.positions ?? null,
          prev?.angles ?? null,
          stepDt,
          this.grab ?? undefined,
        ),
      );
      if (performance.now() - startedAt >= budgetMs) break;
    }

    if (snapshots.length > 0) {
      // What a step costs, smoothed: it sizes the next round's step, and a single round is
      // a noisy sample (the early exit makes the sweep count vary). Overestimating only
      // costs one step of coarseness; underestimating is caught by the budget break above,
      // so the loop is stable either way.
      const measured = (performance.now() - startedAt) / snapshots.length;
      this.stepCost =
        this.stepCost === 0 ? measured : 0.8 * this.stepCost + 0.2 * measured;
      // Worst of the round, not of its last step: one torn step is enough to say the step
      // is too coarse for this mechanism.
      let severity = 0;
      for (const s of snapshots)
        severity = Math.max(severity, constraint_severity(s.unsatisfied));
      this.ceiling = step_ceiling(stepDt, severity);
      this.last = snapshots[snapshots.length - 1];
    }

    return { snapshots, stepDt, reached: frontier + produced };
  }
}
