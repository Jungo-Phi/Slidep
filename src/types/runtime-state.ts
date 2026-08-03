/**
 * Runtime state types for slidep simulation
 * Replaces the previous simulation.ts with a more comprehensive structure
 */

import { ID } from "./element";
import { Point2 } from "./point2";

/**
 * Simulation speed presets
 */
export type SimulationSpeed = 0.1 | 0.25 | 0.5 | 1 | 2 | 4 | 10;

// ─────────────────────────────────────────────────────────────
// Physics state per element category
// ─────────────────────────────────────────────────────────────

export interface NodePhysics {
  position: Point2;
  velocity: Point2;
  acceleration: Point2;
  force: Point2; // resultant force applied
  reactionForce: Point2; // reaction force (supports, joints)
}

export interface EdgePhysics {
  axialForce: number; // normal effort
  shearForce: number; // shear effort
  bendingMoment: number; // bending moment
  tension: number; // for springs/dampers
}

export interface GearPhysics {
  angle: number;
  angularVelocity: number;
  angularAcceleration: number;
  torque: number;
}

// ─────────────────────────────────────────────────────────────
// Snapshot of the world at a given time
// ─────────────────────────────────────────────────────────────

export interface PhysicsSnapshot {
  timestamp: number;
  nodes: Map<ID, NodePhysics>;
  edges: Map<ID, EdgePhysics>;
  gears: Map<ID, GearPhysics>;
}

// ─────────────────────────────────────────────────────────────
// Legacy types kept for compatibility (will be migrated)
// ─────────────────────────────────────────────────────────────

export type SimulationStatus = "stopped" | "running" | "paused";

export interface ElementPhysicsState {
  elementId: ID;
  position: Point2;
  velocity: Point2;
  acceleration: Point2;
  rotation: number;
  angularVelocity: number;
  angularAcceleration: number;
}

export interface ForceVector {
  elementId: ID;
  point: Point2;
  magnitude: number;
  direction: number;
  type: "applied" | "reaction" | "internal";
}

export interface Moment {
  elementId: ID;
  point: Point2;
  magnitude: number;
  direction: "clockwise" | "counterClockwise";
}

export interface TrajectoryPoint {
  elementId: ID;
  position: Point2;
  timestamp: number;
}

export interface BlockageInfo {
  elementId: ID;
  position: Point2;
  reason: string;
  severity: "warning" | "error";
}

export interface ConstraintDetail {
  elementId: ID;
  constraintType: string;
  degreesRemoved: number;
}

export interface DegreesOfFreedom {
  total: number;
  translational: number;
  rotational: number;
  isOverConstrained: boolean;
  isUnderConstrained: boolean;
  constraintDetails: ConstraintDetail[];
}

export interface StaticAnalysisResult {
  isStable: boolean;
  forces: ForceVector[];
  moments: Moment[];
  reactions: ForceVector[];
  degreesOfFreedom: DegreesOfFreedom;
}

// ─────────────────────────────────────────────────────────────
// Kinematic snapshot: raw solver positions at a given pseudo-time
// ─────────────────────────────────────────────────────────────

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
   * `beltStart[r] … beltStart[r + 1]`, and each pulley has two slots: its wrap angle, at
   * `wrapBase + p`, and its contact flag, at `detachBase + p`.
   *
   * A belt's pulley count is fixed for the whole recording: detaching one raises its flag,
   * it never shortens the list.
   */
  belts: ID[];
  beltIndex: Map<ID, number>;
  beltStart: Int32Array;
  wrapBase: number;
  detachBase: number;
}

export interface KinematicSnapshot {
  t: number;
  layout: SnapshotLayout;
  /** x and y interleaved, 2 per `layout.keys` entry. NaN = no value at this instant. */
  positions: Float64Array;
  /**
   * Gear rotation angles (rad), then each belt's per-pulley continuous wrap angle — a
   * magnitude above 2π means the belt has wound onto that pulley — then a 1 per pulley that
   * lost belt contact, so the belt is drawn running straight past it. See `SnapshotLayout`.
   */
  angles: Float64Array;
  /** Constraints left unsatisfied at this frame (empty/undefined when all met). */
  unsatisfied?: ConstraintResidual[];
}

// ─────────────────────────────────────────────────────────────
// Main runtime state
// ─────────────────────────────────────────────────────────────

export interface RuntimeState {
  // Playback controls
  isPlaying: boolean;
  time: number;
  speed: SimulationSpeed;

  // Physics state at current time (null when not simulating)
  current: PhysicsSnapshot | null;

  // History for timeline (sampled, e.g. every 10ms)
  history: PhysicsSnapshot[];

  /** Recorded kinematic snapshots (incremental, sampled at 30 fps of sim-time) */
  kinematicSnapshots: KinematicSnapshot[];

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
  gravity: boolean;
  collisions: boolean;
}

// ─────────────────────────────────────────────────────────────
// Defaults
// ─────────────────────────────────────────────────────────────

export const DEFAULT_SIMULATION_CONFIG: SimulationConfig = {
  maxIterations: 100,
  convergenceTolerance: 0.001,
  gravity: true,
  collisions: false,
};

export const DEFAULT_RUNTIME_STATE: RuntimeState = {
  isPlaying: false,
  time: 0,
  speed: 1,
  current: null,
  history: [],
  kinematicSnapshots: [],
  scrubbed: false,
};
