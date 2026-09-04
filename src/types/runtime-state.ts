/**
 * Runtime state types for slidep simulation
 */

import { ConstraintElement, ID, LoadElement, MechanicalElement } from "./element";

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
      /** This reaction's emitting link's index in `step_dynamic_simulation`'s per-frame
       *  `links` array (Spring/MotorBeam/MotorAngle already dropped) — see
       *  `build_beam_cohesion_specs`. A plain number, not the link itself: this is written
       *  once per reaction in the solver's hot per-frame sweep, where an extra allocation
       *  (an array, an object) is the dominant cost. Undefined for a reaction with no single
       *  emitting link (there is none today, but the field stays optional for that case). */
      linkIndex?: number;
    }
  | {
      type: string;
      owner?: ID;
      key: string;
      atAnchor: boolean;
      kind: "torque";
      torque: number;
      /** See the `force` variant's `linkIndex`. */
      linkIndex?: number;
    };

/** One motorized pivot's own mechanical power this frame — τ·ω of the joint it drives,
 *  signed (negative when the load back-drives the motor rather than the other way round).
 *  See `motor-model.ts`'s `resolve_motor_torques`. */
export interface MotorPowerSample {
  pivotID: ID;
  watts: number;
}

/**
 * The whole mechanism's mechanical energy this frame, plus the instantaneous rate a damper
 * is bleeding it off at — everything `energy-balance.ts` needs to check the solver against
 * itself: kinetic + potential should only ever change by what a motor put in or a damper took
 * out, so a growing gap between the two is the PBD solver's own numerical drift, not a
 * mechanical property (see `docs/plan-analyse-ddl.md`'s ~0.98 spectral radius). Always
 * collected (cheap, one pass over the elements that carry mass/stiffness/damping — same
 * reasoning as `MotorPowerSample`), so undefined only where a snapshot predates this field.
 */
export interface EnergySample {
  /** J — Σ ½mv² over every free translational dof, + Σ ½Jω² over every gear's own angle. */
  kinetic: number;
  /** J — Σ −m·(gravity·position), gravity off reads a constant (irrelevant to the balance,
   *  which only ever compares a CHANGE against this frame's start). */
  potentialGravity: number;
  /** J — Σ ½k(L−L₀)² over every spring. */
  potentialSpring: number;
  /** W — Σ b·(closing speed)² over every damper: always ≥ 0, energy LEAVING the mechanism. */
  damperPower: number;
}

/**
 * A beam's own cohesion torsor at each end, and the point loads its attached nodes
 * transmit — see docs/plan-efforts-interieurs.md phase 3. Isolates what beam A itself
 * carries at a shared, coincidence-fused key from whatever ELSE is coincident there (another
 * beam, a support, a motor): `LinkReaction`/`force_at` alone cannot do that, since two
 * elements fused at the same key report under the very same `key` string.
 */
export interface BeamCohesion {
  beamID: ID;
  /**
   * What this beam's OWN rigidity (its length link, any welded-hub couple, any attached
   * body's pin) applies onto whatever is coincident at its start/end — the raw
   * `LinkReaction` sense, uniform at both ends, NOT `force_at`'s anchor-conditional
   * "classical support reaction". Deliberately not yet the cut torsor `R_coh`: the two ends
   * need opposite further treatment to become that (see `cohesion-field.ts`'s
   * `r_coh_start`/`r_coh_end`), an asymmetry inherent to the cut convention itself.
   */
  /** `atAnchor`: whether this dof was immovable in the solve (`w = 0`) — same sense as
   *  `LinkReaction.atAnchor`. `cohesion-field.ts` reads it to tell a genuine support reading
   *  apart from a free dof's own tautological cancellation of a directly-applied load. */
  start: { fx: number; fy: number; m: number };
  /** Same reading at the beam's OTHER end — independent of `start` (no integration along
   *  the span involved), so `cohesion-field.ts` can use it as the loop-residual reference. */
  end: { fx: number; fy: number; m: number };
  /**
   * Force each attached node (a join/mass/slider body pinned or sliding on this beam's
   * span) transmits TO the beam, at its CURRENT abscissa (0 = start, 1 = end, recomputed
   * every frame from live positions — a slider's abscissa moves, see
   * `Point2.parameter_on_segment`). Excludes the beam's own `:mid` inertia artifact
   * (`DynamicMassModel.beamMidpoints`): that reaction is not tagged into any beam's
   * `internalLinkIndices` in the first place, since the midpoint's `FixedOnSegment` is
   * built fresh every frame outside the compiled `model.links` this is precomputed from.
   */
  attachedNodes: { nodeID: ID; s: number; fx: number; fy: number }[];
  /**
   * Whether this torsor is a statement about the mechanism or the solver's own account of
   * how it got there.
   *
   * `true` — balanced off the CONVERGED STATE: the beam's own mass against gravity and its
   * acceleration, plus what rides on its span, plus the loads applied to it. Nothing is
   * transmitted at its far end, so the balance closes with no unknown and the reading is
   * exact (`resolve_beam_cohesion`).
   *
   * `false` — summed from the reactions each link reports, which is an ATTRIBUTION of the
   * correction path between the links that share it. Measured against the balanced reading
   * on the beams where both apply, that attribution differs by up to 100 %. A reader should
   * treat such a torsor as indicative, not as a figure.
   */
  determinate: boolean;
}

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
   * Gear rotation angles (rad), then each belt's per-pulley continuous wrap/detach/arrival
   * block — same layout as `KinematicSnapshot.angles`, see `SnapshotLayout`. Both engines
   * compile through the same `compile_simulation_model`, so the slots exist here whether or
   * not a given recording ever exercises them.
   */
  angles: Float64Array;
  /** vx and vy interleaved, 2 per `layout.keys` entry — same slotting as `positions`. */
  velocities: Float64Array;
  /**
   * ax and ay interleaved, 2 per `layout.keys` entry — same slotting as `positions`. The
   * frame's whole `(v_after − v_before) / dt`, taken where the frame itself is computed
   * (`step_dynamic_simulation`) rather than differentiated from these (decimated,
   * interpolated) snapshots afterward — see docs/plan-efforts-interieurs.md phase 2. A dof
   * with no velocity change reads 0, not NaN: an anchored dof never accelerates, and a dof
   * with no prior frame to warm-start from is taken as starting at rest.
   */
  accelerations: Float64Array;
  /** One per `layout.angleKeys` entry — same slotting as `angles`. */
  angleVelocities: Float64Array;
  unsatisfied?: ConstraintResidual[];
  /** Per-constraint reaction forces/torques this frame — see `LinkReaction`. Undefined when
   *  not collected (the same optionality as `unsatisfied`). */
  reactions?: LinkReaction[];
  /** Every motorized pivot's own power this frame — see `MotorPowerSample`. Always collected
   *  (cheap, one entry per motor, unlike `reactions`' per-link cost), so undefined only where
   *  a snapshot predates this field rather than under `collectDiagnostics`. */
  motorPower?: MotorPowerSample[];
  /** The mechanism's own energy balance this frame — see `EnergySample`. */
  energy?: EnergySample;
  /** Each beam's own cohesion torsor, resolved from `reactions` — see `BeamCohesion`.
   *  Undefined under the same `collectDiagnostics` gate as `reactions`. */
  beamCohesion?: BeamCohesion[];
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

/**
 * Running max magnitude of each physical "kind" of quantity found anywhere in the
 * mechanism, over the whole recording — the reference scale a value is judged negligible
 * against (`negligibility-pool.ts`'s `is_negligible`). A residual reaction of 1e-6 N next
 * to a real 500 N one, or a 0.1mm wobble on a 10m mechanism, needs SOME scale to be
 * negligible relative TO — never an arbitrary absolute floor, since a featherweight
 * mechanism's forces are all small and none of them should read as "nothing".
 */
export interface NegligibilityPool {
  /** Identity of the mechanism this pool was built from — an edit invalidates it (see
   *  `extend_negligibility_pool`'s `appendable` check). */
  elements: MechanicalElement[];
  constraints: ConstraintElement[];
  /** Snapshots folded in so far, and the last one — same rebuild-vs-append test
   *  `StressScaleCache` uses (`cohesion-field.ts`). */
  consumed: number;
  boundary: DynamicSnapshot | null;
  /** m — seeded from the mechanism's own bounding-box diagonal, then grown by any
   *  recorded displacement past it. */
  length: number;
  /** rad */
  angle: number;
  /** N */
  force: number;
  /** N·m */
  moment: number;
  /** m/s */
  linearVelocity: number;
  /** rad/s */
  angularVelocity: number;
  /** W */
  power: number;
  /** Per-kind floor these fields are seeded from and never fall below — the mechanism's own geometry where its dimension allows it, a fixed product constant otherwise (see `pool_floors` in `negligibility-pool.ts`).
   *  Recomputed only when the pool itself is rebuilt (a geometry change), not on every extend. */
  floors: NegligibilityFloors;
  /** Same shape as `floors`, but scaled for a direct comparison against a single reading rather than for seeding a running max — what `ProbeChart`'s `ownFloor` prop needs (see `own_floors` in `negligibility-pool.ts`).
   *  Recomputed alongside `floors`. */
  ownFloors: NegligibilityFloors;
}

export interface NegligibilityFloors {
  length: number;
  angle: number;
  force: number;
  moment: number;
  linearVelocity: number;
  angularVelocity: number;
  power: number;
}

export const EMPTY_NEGLIGIBILITY_POOL: NegligibilityPool = {
  elements: [],
  constraints: [],
  consumed: 0,
  boundary: null,
  length: 0,
  angle: 0,
  force: 0,
  moment: 0,
  linearVelocity: 0,
  angularVelocity: 0,
  power: 0,
  floors: {
    length: 0,
    angle: 0,
    force: 0,
    moment: 0,
    linearVelocity: 0,
    angularVelocity: 0,
    power: 0,
  },
  ownFloors: {
    length: 0,
    angle: 0,
    force: 0,
    moment: 0,
    linearVelocity: 0,
    angularVelocity: 0,
    power: 0,
  },
};

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

  /** Running per-kind scale, for hiding/flattening negligible reactions, velocities, and
   *  probe curves — see `NegligibilityPool`. */
  negligibilityPool: NegligibilityPool;
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
  negligibilityPool: EMPTY_NEGLIGIBILITY_POOL,
};
