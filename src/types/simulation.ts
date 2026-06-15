/**
 * Types for simulation state in slidep
 */

import { ID } from "./element";
import { Point2 } from "./point2";

/**
 * Simulation status
 */
export type SimulationStatus = "stopped" | "running" | "paused";

/**
 * Simulation speed presets
 */
export type SimulationSpeed = 0.25 | 0.5 | 1 | 2 | 4;

/**
 * Physical state of an element during simulation
 */
export interface ElementPhysicsState {
  elementId: ID;
  position: Point2;
  velocity: Point2;
  acceleration: Point2;
  rotation: number;
  angularVelocity: number;
  angularAcceleration: number;
}

/**
 * Force vector applied to an element
 */
export interface ForceVector {
  elementId: ID;
  point: Point2;
  magnitude: number;
  direction: number;
  type: "applied" | "reaction" | "internal";
}

/**
 * Moment (torque) applied to an element
 */
export interface Moment {
  elementId: ID;
  point: Point2;
  magnitude: number;
  direction: "clockwise" | "counterClockwise";
}

/**
 * Trajectory point for motion visualization
 */
export interface TrajectoryPoint {
  elementId: ID;
  position: Point2;
  timestamp: number;
}

/**
 * Blockage detection result
 */
export interface BlockageInfo {
  elementId: ID;
  position: Point2;
  reason: string;
  severity: "warning" | "error";
}

/**
 * Degrees of freedom analysis
 */
export interface DegreesOfFreedom {
  total: number;
  translational: number;
  rotational: number;
  isOverConstrained: boolean;
  isUnderConstrained: boolean;
  constraintDetails: ConstraintDetail[];
}

export interface ConstraintDetail {
  elementId: ID;
  constraintType: string;
  degreesRemoved: number;
}

/**
 * Static analysis result
 */
export interface StaticAnalysisResult {
  isStable: boolean;
  forces: ForceVector[];
  moments: Moment[];
  reactions: ForceVector[];
  degreesOfFreedom: DegreesOfFreedom;
}

/**
 * Complete simulation state
 */
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

/**
 * Simulation configuration
 */
export interface SimulationConfig {
  maxIterations: number;
  convergenceTolerance: number;
  gravity: Point2;
}

/**
 * Default simulation configuration
 */
export const DEFAULT_SIMULATION_CONFIG: SimulationConfig = {
  maxIterations: 100,
  convergenceTolerance: 0.001,
  gravity: new Point2(0, 9.81),
};

/**
 * Default simulation state
 */
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
