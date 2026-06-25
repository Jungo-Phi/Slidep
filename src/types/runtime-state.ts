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
// Overlays
// ─────────────────────────────────────────────────────────────

export interface OverlayConfig {
  showTrajectory: boolean;
  showForce: boolean;
  showVelocity: boolean;
  showMoment: boolean;
  showReactionForce: boolean;
  showStress: boolean;
}

export interface OverlayState {
  global: OverlayConfig;
  perElement: Map<ID, Partial<OverlayConfig>>;
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

export interface KinematicSnapshot {
  t: number;
  /** Solver-keyed positions: "${id}:pos", "${id}:start", "${id}:end" */
  positions: Map<string, Point2>;
  /** Solver-keyed radii: "${id}:rad" */
  radii: Map<string, number>;
  /** Cumulative rotation angle (rad) for each gear ID */
  gearAngles: Map<ID, number>;
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

  // Overlays
  overlays: OverlayState;
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

export const DEFAULT_OVERLAY_STATE: OverlayState = {
  global: {
    showTrajectory: false,
    showForce: false,
    showVelocity: false,
    showMoment: false,
    showReactionForce: false,
    showStress: false,
  },
  perElement: new Map(),
};

export const DEFAULT_RUNTIME_STATE: RuntimeState = {
  isPlaying: false,
  time: 0,
  speed: 1,
  current: null,
  history: [],
  kinematicSnapshots: [],
  overlays: DEFAULT_OVERLAY_STATE,
};

// ─────────────────────────────────────────────────────────────
// Legacy default (for gradual migration)
// ─────────────────────────────────────────────────────────────

export interface SimulationState {
  status: SimulationStatus;
  speed: SimulationSpeed;
  currentTime: number;
  deltaTime: number;
  frameCount: number;
  fps: number;
  elementStates: Map<ID, ElementPhysicsState>;
  trajectories: TrajectoryPoint[];
  showTrajectories: boolean;
  showForces: boolean;
  showMoments: boolean;
  blockages: BlockageInfo[];
  staticAnalysis: StaticAnalysisResult | null;
}

export const DEFAULT_SIMULATION_STATE: SimulationState = {
  status: "stopped",
  speed: 1,
  currentTime: 0,
  deltaTime: 0,
  frameCount: 0,
  fps: 0,
  elementStates: new Map(),
  trajectories: [],
  showTrajectories: false,
  showForces: false,
  showMoments: false,
  blockages: [],
  staticAnalysis: null,
};
