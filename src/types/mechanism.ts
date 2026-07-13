import { Action } from "./actions";
import { SimulationMode } from "./app-mode";
import { MechanicalElement, ConstraintElement, LoadElement } from "./element";
import { Point2 } from "./point2";
import {
  SerializedAction,
  SerializedConstraintElement,
  SerializedLoadElement,
  SerializedMechanicalElement,
  SerializedViewportState,
} from "./serialized";
import { DBSchema } from "idb";

export interface MechanismMetadata {
  name: string;
  description: string;
  author: string;
  createdAt: number;
  modifiedAt: number;
  version: string;
  tags: string[];
  lastSimulationMode: SimulationMode;
}

export const DEFAULT_METADATA: MechanismMetadata = {
  name: "Nouveau mécanisme",
  description: "",
  author: "",
  createdAt: 0,
  modifiedAt: 0,
  version: "1.0.0",
  tags: [],
  lastSimulationMode: "kinematic", // TODO : passer en "dynamic" quand le mode existe
};

export type ScreenPoint = Point2;
export type WorldPoint = Point2;

export type ViewportChange =
  | { type: "Pan"; delta: ScreenPoint }
  | { type: "Zoom"; deltaY: number; center: ScreenPoint };

export interface ViewportState {
  zoom: number;
  pan: ScreenPoint;
}

export interface Mechanism {
  metadata: MechanismMetadata;
  viewport: ViewportState;
  mechanicalElements: MechanicalElement[];
  constraintElements: ConstraintElement[];
  loads: LoadElement[];
  history: Action[][];
  future: Action[][];
}

export interface SerializedMechanism {
  metadata: MechanismMetadata;
  viewport: SerializedViewportState;
  mechanicalElements: SerializedMechanicalElement[];
  constraintElements: SerializedConstraintElement[];
  loads: SerializedLoadElement[];
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
