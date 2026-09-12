import { Action } from "./actions";
import { SimulationMode } from "./app-mode";
import { BeamStressLens, MechanicalElement, ConstraintElement, LoadElement } from "./element";
import { MaterialDef, ProfileDef } from "./material";
import { Point2 } from "./point2";
import {
  SerializedAction,
  SerializedConstraintElement,
  SerializedLoadElement,
  SerializedMaterialDef,
  SerializedMechanicalElement,
  SerializedProfileDef,
  SerializedViewportState,
} from "./serialized";
import { DBSchema } from "idb";

export interface MechanismMetadata {
  name: string;
  description: string;
  author: string;
  createdAt: number;
  modifiedAt: number;
  tags: string[];
  lastSimulationMode: SimulationMode;
}

export const DEFAULT_METADATA: MechanismMetadata = {
  name: "",
  description: "",
  author: "",
  createdAt: 0,
  modifiedAt: 0,
  tags: [],
  lastSimulationMode: "dynamic",
};

/** Screen space : Distances are expressed in pixels (px), y points down. */
export type ScreenPoint = Point2<"screen">;
/** World space : Distances are expressed in metres (SI), y points up. */
export type WorldPoint = Point2<"world">;

export type ViewportChange =
  | { type: "Pan"; delta: ScreenPoint }
  | { type: "Zoom"; deltaY: number; center: ScreenPoint };

export interface ViewportState {
  scale: number;
  pan: ScreenPoint;
}

/** An infinite line mechanisms can fall/roll onto — not the palette's fixed anchor
 * ("Sol"/`tool_ground`), a distinct, optional, draggable simulation surface. */
export interface FloorConfig {
  enabled: boolean;
  /** World-space height (metres) of a point on the line, along its own normal. */
  height: number;
  /** Radians. */
  angle: number;
}

export interface SimulationSettings {
  gravity: boolean;
  collisions: boolean;
  floor: FloorConfig;
  /** Which beam-fill reading the canvas colours every beam with — a property of this mechanism, like gravity, not a viewer preference: what is worth checking (bending, shear, utilization…) depends on the structure at hand. */
  beamStressLens: BeamStressLens;
  /** Whether the canvas marks the whole system's free body: applied loads and support reactions together, wherever they are, with no per-element flag to set. Mechanism-wide for the same reason as `beamStressLens` — whether the supports are the interesting part is a property of the structure. */
  supportReactions: boolean;
}

export const DEFAULT_FLOOR: FloorConfig = { enabled: false, height: 0, angle: 0 };

export const DEFAULT_SIMULATION: SimulationSettings = {
  gravity: true,
  collisions: false,
  floor: DEFAULT_FLOOR,
  beamStressLens: "none",
  supportReactions: false,
};

export interface Mechanism {
  metadata: MechanismMetadata;
  viewport: ViewportState;
  simulation: SimulationSettings;
  mechanicalElements: MechanicalElement[];
  constraintElements: ConstraintElement[];
  loads: LoadElement[];
  /** This mechanism's own materials and profiles — copied from the catalogue, never a live
   * reference to it.
   * A `BeamElement` names one of each by id. */
  materials: MaterialDef[];
  profiles: ProfileDef[];
  history: Action[][];
  future: Action[][];
}

export interface SerializedMechanism {
  /** File format version, raised by the migration chain on the way in. */
  formatVersion: number;
  metadata: MechanismMetadata;
  viewport: SerializedViewportState;
  simulation: SimulationSettings;
  mechanicalElements: SerializedMechanicalElement[];
  constraintElements: SerializedConstraintElement[];
  loads: SerializedLoadElement[];
  materials: SerializedMaterialDef[];
  profiles: SerializedProfileDef[];
  history: SerializedAction[][];
  future: SerializedAction[][];
}

export interface SlidepDB extends DBSchema {
  mechanisms: {
    key: number;
    value: SerializedMechanism;
    indexes: { "by-date": number };
  };
}
