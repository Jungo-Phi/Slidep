/**
 * Runtime state types for slidep simulation
 * Replaces the previous simulation.ts with a more comprehensive structure
 */

import { ID } from "./element";
import { Point2 } from "./point2";

/**
 * Simulation speed presets
 */
export type SimulationSpeed = 0.25 | 0.5 | 1 | 2 | 4;

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

export interface KinematicSnapshot {
  t: number;
  /** Solver-keyed positions: bare "${id}" for nodes/bodies, "${id}:start"/"${id}:end" for edges */
  positions: Map<string, Point2>;
  /** Solver-keyed gear rotation angles (rad), bare "${id}" */
  angles: Map<string, number>;
  /** Constraints left unsatisfied at this frame (empty/undefined when all met). */
  unsatisfied?: ConstraintResidual[];
  /** Belt id → indices (into attachedGearsIDs) of pulleys that lost belt contact
   *  during simulation, so the belt is drawn running straight past them. */
  disconnectedBeltGears?: Map<ID, number[]>;
  /** Belt id → continuous (unwrapped) wrap angle per attached pulley; magnitudes
   *  above 2π mean the belt has wound onto that pulley (drawn as extra turns). */
  beltWraps?: Map<ID, number[]>;
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
};
