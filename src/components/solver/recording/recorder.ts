import { LoadElement, Mechanism } from "../../../types";
import { ZERO } from "../../../types/point2";
import {
  DynamicSnapshot,
  KinematicSnapshot,
  SimulationSnapshot,
  SnapshotLayout,
} from "../../../types/runtime-state";
import { GRAVITY } from "../../../constants/physics-specs";
import {
  FRAME_BUDGET_MS,
  MAX_RECORDING_TIME,
  RECORD_DT,
  RewireState,
  recording_full,
  restore_belt_state,
  restore_rewire_state,
  rewire_belts,
  SimGrab,
  SimulationModel,
  compile_simulation_model,
  is_retained,
  max_recording_time,
  step_dynamic_simulation,
  step_simulation,
} from "../dynamics/simulation-engine";
import { compile_loads } from "../dynamics/load-model";
import { RecorderMode } from "./recorder-protocol";

/**
 * How far back a rewind may reach, in simulated seconds.
 * Well past the worker's lead, which is what a rewind actually undoes, and the flip journal is pruned to it so a long run cannot accumulate one entry per belt flip forever.
 */
const REWIND_WINDOW = 5;

/**
 * The recording engine: it owns a compiled model and turns "advance the simulated clock to T" into snapshots, within a wall-clock budget.
 *
 * Deliberately free of React, of the DOM and of any notion of frames — it is the piece that moves into a Web Worker, so it may only depend on the solver.
 * What it keeps between calls is the model, whose links carry per-frame belt state, and the last snapshot handed out.
 *
 * Serves both `RecorderMode`s on the same scheduling shell: `mode` picks which of `step_simulation`/`step_dynamic_simulation` `advance` calls, and everything else here — the budget, the retained-instant thinning, the rewind journal's bookkeeping — knows nothing about which one it is.
 * The belt-topology journal and `restore_belt_state` ARE kinematic-only (dynamic mode tracks no belt contact yet), and stay guarded by `mode`.
 */
export class Recorder {
  private model: SimulationModel | null = null;
  /** The mechanism `model` was compiled from — kept only for `setLoads`, which recompiles
   * `compiledLoads` against it without touching anything else the model bakes in. */
  private mechanism: Mechanism | null = null;
  private mode: RecorderMode = "kinematic";
  /** Dynamic mode only: whether the predict step integrates `GRAVITY`. */
  private gravityOn = true;
  /** Both modes: whether the next steps detect and resist collisions. */
  private collisionsOn = false;
  /** Both modes: whether the next steps detect and resist the floor. Gated independently
   * from `collisionsOn` — see `collision_links`. */
  private floorOn = false;
  private grab: SimGrab | null = null;
  /** Last snapshot handed out, to warm-start the next step from. */
  private last: SimulationSnapshot | null = null;
  /** How long this load may record: what its instants cost sets it. */
  private limit = MAX_RECORDING_TIME;
  /**
   * The model state each belt topology change overwrote, and when.
   * Kinematic-only: dynamic mode never pushes onto this, since `step_dynamic_simulation` tracks no belt topology.
   *
   * Everything else a frame touches is either recomputed from the state it starts on (motor targets, mesh angles) or carried by the snapshot (positions, angles, belt contact), so this is the whole of what a rewind cannot otherwise put back.
   * The contact hysteresis is what keeps it short: entries are written on a flip, not on a frame.
   */
  private journal: { t: number; state: RewireState }[] = [];

  /**
   * Adopt a mechanism, discarding whatever the previous one left.
   * `resumeFrom` is the snapshot the recording continues from — it carries the simulated state, so motor angles and belt travel stay continuous across an edit.
   */
  load(
    mode: RecorderMode,
    mechanism: Mechanism,
    resumeFrom: SimulationSnapshot | null,
  ): void {
    this.mode = mode;
    this.mechanism = mechanism;
    this.model = compile_simulation_model(mechanism, mode === "dynamic", true);
    this.limit = max_recording_time(this.model.layout);
    this.last = resumeFrom;
    this.journal = [];
    // The compile reads the belt's whole pulley list from the mechanism; the run may have taken it off some of them.
    // Dynamic mode never disconnects a belt, so there is nothing to re-bake against.
    if (mode === "kinematic" && resumeFrom)
      rewire_belts(
        this.model,
        restore_belt_state(this.model, resumeFrom as KinematicSnapshot),
      );
  }

  /** Dynamic mode only: whether the next steps integrate gravity. */
  setGravity(on: boolean): void {
    this.gravityOn = on;
  }

  /** Both modes: whether the next steps detect and resist collisions. */
  setCollisions(on: boolean): void {
    this.collisionsOn = on;
  }

  /** Both modes: whether the next steps detect and resist the floor. */
  setFloor(on: boolean): void {
    this.floorOn = on;
  }

  /**
   * Swap in new load values (magnitude, direction…) without recompiling the model: targets and solver keys are unchanged, so `compile_loads` alone — cheap, just the loads array — is all a value edit needs.
   * A topology change (a load's target, a new/deleted load) still goes through `load`.
   */
  setLoads(loads: LoadElement[]): void {
    if (!this.model || !this.mechanism) return;
    this.mechanism = { ...this.mechanism, loads };
    this.model.compiledLoads = compile_loads(this.mechanism, this.model.keyMap);
  }

  /**
   * Go back to an instant already recorded, keeping the compiled model.
   *
   * What pausing needs: the worker is aimed past the cursor on purpose, so a pause always leaves instants that were solved and never shown, and dropping them must not cost the run everything it had accumulated.
   * Reloading would recompile a mechanism that has not changed — and reset the belt contact state, which is what made a paused simulation diverge from an uninterrupted one.
   */
  rewind(resumeFrom: SimulationSnapshot): void {
    if (!this.model) return;
    // The OLDEST flip still ahead of the target: its captured state is the one that was in force from the previous flip up to it, so it is the one covering the target.
    // Anything after it describes a future this rewind has just cancelled.
    const undone = this.journal.find((entry) => entry.t > resumeFrom.t);
    if (undone) restore_rewire_state(this.model, undone.state);
    this.journal = this.journal.filter((entry) => entry.t <= resumeFrom.t);
    // The rest comes back from the snapshot.
    // No re-bake: the journal has just put the recorded state back, and measuring a new one would replace it with a near miss.
    if (this.mode === "kinematic")
      restore_belt_state(this.model, resumeFrom as KinematicSnapshot);
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
   * Solves instants spaced by `RECORD_DT` until the simulated clock reaches `targetTime`, or until the budget runs out, and hands back the ones worth keeping (`is_retained`).
   * Falling behind costs time, never fidelity: the recording simply ends short of the target and the next call picks it up.
   *
   * `solved` counts every step taken, kept or not — a call can advance the clock while returning nothing, so it is progress, not `snapshots.length`, that says whether there is more to do.
   */
  advance(
    targetTime: number,
    budgetMs: number = FRAME_BUDGET_MS,
  ): { snapshots: SimulationSnapshot[]; reached: number; solved: number } {
    // One step back from the first instant to record, so a fresh recording starts at t = 0.
    const frontier = this.last?.t ?? -RECORD_DT;
    const snapshots: SimulationSnapshot[] = [];
    if (!this.model) return { snapshots, reached: frontier, solved: 0 };

    const startedAt = performance.now();
    let produced = 0;
    let solved = 0;
    // The warm start follows every step, kept or not: what is thinned is the recording, not the simulation.
    let latest = this.last;
    // A step is due while its instant is not past where the cursor is headed, to within the half-step the cursor is allowed to lead by.
    // At least one runs per call when any is due: a mechanism whose single step outlasts the whole budget must still advance.
    // Never past the recording's full length: what bounds a session's memory is that no instant beyond it is ever solved, not that the display stops asking for one.
    const dueUntil = Math.min(targetTime, this.limit) + RECORD_DT / 2;
    while (frontier + produced + RECORD_DT <= dueUntil) {
      produced += RECORD_DT;
      const t = frontier + produced;
      // The very first step of a fresh load has nothing to warm-start from — `latest` is still `null` here.
      // Stepping it with `dt = 0` instead of `RECORD_DT` makes this instant a plain re-projection of the edition geometry onto the constraints (motors don't advance their target, forces integrate nothing), so `t = 0` is genuinely the edition state rather than one step past it.
      const stepDt = latest === null ? 0 : RECORD_DT;
      if (this.mode === "kinematic") {
        latest = step_simulation(
          this.model,
          t,
          latest as KinematicSnapshot | null,
          stepDt,
          this.grab ?? undefined,
          undefined,
          undefined,
          (state) => this.journal.push({ t, state }),
          this.collisionsOn,
          this.floorOn,
        );
      } else {
        const gravity = this.gravityOn ? GRAVITY : ZERO;
        let dynamicSnapshot = step_dynamic_simulation(
          this.model,
          t,
          latest as DynamicSnapshot | null,
          stepDt,
          gravity,
          this.grab ?? undefined,
          undefined,
          undefined,
          this.collisionsOn,
          this.floorOn,
        );
        // The re-projection above has no elapsed time, so it reports no reactions (see `step_dynamic_simulation`) — a zero dt cannot be turned into a force.
        // A probe step, real dt but warm-started from that very same edition state, reads the forces actually in play at t = 0; only its efforts are kept, its pose is discarded, so the frame everyone sees still stays the exact edition geometry above.
        // Its accelerations travel with them, being an effort themselves here: the cohesion field marches on the d'Alembert density `μ·(g − a)` (`cohesion-field.ts`), so the re-projection's zeros would make a body in free fall carry its own weight as an internal effort.
        if (stepDt === 0) {
          const probe = step_dynamic_simulation(
            this.model,
            t,
            null,
            RECORD_DT,
            gravity,
            this.grab ?? undefined,
            undefined,
            undefined,
            this.collisionsOn,
            this.floorOn,
          );
          dynamicSnapshot = {
            ...dynamicSnapshot,
            reactions: probe.reactions,
            accelerations: probe.accelerations,
            angleAccelerations: probe.angleAccelerations,
            beamCohesion: probe.beamCohesion,
            beltStrands: probe.beltStrands,
            // `m·a` travels with the accelerations it is built from: read from the re-projection instead, it would be zero while the reactions beside it already carry the forces that produce it, and the free body's `ΣF = m·a` would fail to close by the whole of `ΣF`.
            balance: probe.balance,
          };
        }
        latest = dynamicSnapshot;
      }
      solved++;
      // Every instant is kept while the user is holding the mechanism: the display sits on the frontier then, so an instant dropped there is one the grabbed part is drawn a step behind the mouse at.
      // A drag is short and the time axis is searched, never divided, so the denser stretch it leaves costs nothing beyond its own bytes.
      if (this.grab !== null || is_retained(t)) snapshots.push(latest);
      if (performance.now() - startedAt >= budgetMs) break;
    }

    if (latest) this.last = latest;
    // Past what any rewind can reach, so a long run does not keep every flip it ever made.
    const reached = frontier + produced;
    if (this.journal.length > 0 && this.journal[0].t < reached - REWIND_WINDOW)
      this.journal = this.journal.filter((e) => e.t >= reached - REWIND_WINDOW);

    return { snapshots, reached, solved };
  }
}
