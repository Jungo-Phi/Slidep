/**
 * Runtime state types for slidep simulation
 */

import { ID, LoadElement, MechanicalElement } from "./element";

/**
 * Simulation speed presets
 */
export type SimulationSpeed = 0.1 | 0.25 | 0.5 | 1 | 2 | 4 | 10;

/** A constraint the solver could not satisfy at this frame (e.g. a blocked
 *  mechanism). `residual` mixes px (distance) and rad (angle) — a rough
 *  severity indicator, not a physical quantity. */
export interface ConstraintResidual {
  /** Owning element, to reference / highlight on the canvas. */
  owner: ID;
  /** Link type, for labeling (e.g. "Distance", "MotorBeam"). */
  type: string;
  residual: number;
}

/**
 * The force (or torque) a single constraint contributed at one of the solver keys it
 * touches, accumulated over a dynamic frame's whole sweep — see `PBD_solve`'s
 * `dynamics.reactions`.
 *
 * Two entries can share a `key` — the pivot a beam is grounded to and its gear mesh both
 * report AT the same node — and are never summed automatically: a consumer after "the total
 * reaction at this node" adds them itself, one after "just what the gear mesh contributes
 * here" (a gear's mesh contact) tells them apart by `type`/`owner`.
 *
 * `key` may be a fused key (comma-joined, see `compile_simulation_model`'s coincidence
 * fusion) when the dof it reports at is shared with another element — a consumer matching
 * against one element's own key must check membership in `key.split(",")`, not equality.
 */
export type LinkReaction =
  | {
      type: string;
      owner?: ID;
      key: string;
      /** Whether this dof was immovable in the solve (`w = 0`) — a support reaction
       *  (against the ground) rather than an internal one (between two mobile parts). */
      atAnchor: boolean;
      kind: "force";
      fx: number;
      fy: number;
    }
  | {
      type: string;
      owner?: ID;
      key: string;
      atAnchor: boolean;
      kind: "torque";
      torque: number;
    };

/**
 * Which key sits at which slot of a snapshot's arrays. Held once per recording and shared
 * by all its snapshots, so two snapshots may only be read against one another — or
 * interpolated — when they carry the very same layout object.
 *
 * Keys are solver keys: bare "${id}" for nodes/bodies, "${id}:start"/"${id}:end" for edges,
 * plus the reserved grab-bridge slots (`GRAB_KEYS`), which hold NaN on frames without a grab.
 */
export interface SnapshotLayout {
  keys: string[];
  index: Map<string, number>;
  /** Gear rotation keys — the first section of `angles`. */
  angleKeys: string[];
  angleIndex: Map<string, number>;
  /**
   * Belts, in the order their pulley slots follow the angles. Belt `r` owns the pulleys
   * `beltStart[r] … beltStart[r + 1]`, and each pulley has three slots: its wrap angle, at
   * `wrapBase + p`, its contact flag, at `detachBase + p`, and its arrival rim angle, at
   * `arrivalBase + p`.
   *
   * A belt's pulley count is fixed for the whole recording: detaching one raises its flag,
   * it never shortens the list.
   */
  belts: ID[];
  beltIndex: Map<ID, number>;
  beltStart: Int32Array;
  wrapBase: number;
  detachBase: number;
  arrivalBase: number;
}

/**
 * A recorded instant, whatever solver produced it — kinematic or dynamic. Everything the
 * timeline, the trajectories and the drawing need to read is here; only a caller that warm-
 * starts the NEXT frame of a specific mode needs to know which concrete subtype it has.
 */
export interface SimulationSnapshot {
  t: number;
  layout: SnapshotLayout;
  /** x and y interleaved, 2 per `layout.keys` entry. NaN = no value at this instant. */
  positions: Float64Array;
  /** Gear rotation angles (rad), one per `layout.angleKeys` entry. See the concrete
   *  subtype for what (if anything) follows past that. */
  angles: Float64Array;
  /** Constraints left unsatisfied at this frame (empty/undefined when all met). */
  unsatisfied?: ConstraintResidual[];
}

export interface KinematicSnapshot extends SimulationSnapshot {
  /**
   * Gear rotation angles (rad), then each belt's per-pulley continuous wrap angle — a
   * magnitude above 2π means the belt has wound onto that pulley — then a 1 per pulley that
   * lost belt contact, so the belt is drawn running straight past it, then each pulley's
   * continuous arrival rim angle, which the no-slip differential is written against. See
   * `SnapshotLayout`.
   */
  angles: Float64Array;
}

/**
 * A dynamic-mode instant: everything `SimulationSnapshot` carries, plus the velocity XPBD
 * derives from the frame's whole displacement (see `PBD_solve`'s `dynamics` param) — a
 * kinematic instant has no such thing, since motors drive position directly and nothing
 * ever integrates a force. Kept as its own type rather than an optional field on
 * `KinematicSnapshot`: a mode that never populates it would otherwise carry a dead
 * zero-filled array across the worker boundary on every frame for nothing. The two are
 * siblings under `SimulationSnapshot`, neither extending the other.
 *
 * Shares `layout` with `KinematicSnapshot` — same keys, same slots — so the two only differ
 * in which extra arrays they carry.
 */
export interface DynamicSnapshot extends SimulationSnapshot {
  /**
   * Gear rotation angles (rad), one per `layout.angleKeys` entry — and nothing past it.
   * Unlike `KinematicSnapshot.angles`, there is no belt-wrap/detach/arrival block: dynamic
   * mode does not track belt contact (yet), so `layout.wrapBase` and beyond do not apply
   * here.
   */
  angles: Float64Array;
  /** vx and vy interleaved, 2 per `layout.keys` entry — same slotting as `positions`. */
  velocities: Float64Array;
  /** One per `layout.angleKeys` entry — same slotting as `angles`. */
  angleVelocities: Float64Array;
  unsatisfied?: ConstraintResidual[];
  /** Per-constraint reaction forces/torques this frame — see `LinkReaction`. Undefined when
   *  not collected (the same optionality as `unsatisfied`). */
  reactions?: LinkReaction[];
}

/**
 * The motor/load configuration in effect from `t` onward, until the next entry (or the end
 * of the recording). One entry per parameter edit made during a simulation — sparse, unlike
 * `KinematicSnapshot`'s per-frame sampling — plus one seeded at `t: 0` when the recording
 * starts, so a lookup always has something at or before any `t` it is asked about.
 *
 * Carries the full arrays (as they stood at `t`) rather than a diff: cheap here since entries
 * are rare, and it reuses the same "whole state, keyed by id" shape `KinematicSnapshot`'s
 * consumers already know how to read.
 */
export interface ParameterSnapshot {
  t: number;
  mechanicalElements: MechanicalElement[];
  loads: LoadElement[];
}

// ─────────────────────────────────────────────────────────────
// Main runtime state
// ─────────────────────────────────────────────────────────────

export interface RuntimeState {
  // Playback controls
  isPlaying: boolean;
  time: number;
  speed: SimulationSpeed;

  /**
   * Recorded simulation snapshots (incremental, sampled at 30 fps of sim-time) — kinematic
   * or dynamic depending on `appMode`, never a mix within one recording. Typed to the base
   * so the timeline/drawing code that only reads `t`/`positions`/`angles` does not have to
   * care which; a consumer that needs the concrete subtype (e.g. `apply_snapshot_to_mechanism`
   * for a warm start) narrows it itself from `appMode`.
   */
  simulationSnapshots: SimulationSnapshot[];

  /** The motor/load configuration history, truncated and appended to in lockstep with
   *  `simulationSnapshots` — see `ParameterSnapshot`. */
  parameterSnapshots: ParameterSnapshot[];

  /**
   * The cursor was placed by hand — a timeline drag, a click on a chart — and has not
   * caught up with the recording since.
   *
   * Held as intent rather than derived from `time` against the frontier: while recording,
   * the frontier legitimately runs ahead of the cursor, by a step and by the worker's own
   * lead, so any comparison of the two eventually reads a live recording as a replay.
   * Playing from here re-reads what exists instead of extending it, and a grab is refused
   * because it would pull on frames the solver is not computing.
   */
  scrubbed: boolean;
}

// ─────────────────────────────────────────────────────────────
// Simulation configuration (kept, used by solvers)
// ─────────────────────────────────────────────────────────────

export interface SimulationConfig {
  maxIterations: number;
  convergenceTolerance: number;
}

// ─────────────────────────────────────────────────────────────
// Defaults
// ─────────────────────────────────────────────────────────────

export const DEFAULT_SIMULATION_CONFIG: SimulationConfig = {
  maxIterations: 100,
  convergenceTolerance: 0.001,
};

export const DEFAULT_RUNTIME_STATE: RuntimeState = {
  isPlaying: false,
  time: 0,
  speed: 1,
  simulationSnapshots: [],
  parameterSnapshots: [],
  scrubbed: false,
};
