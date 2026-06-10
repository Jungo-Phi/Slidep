import { Action } from "./actions";
import { MechanicalElement, ConstraintElement } from "./element";
import {
  SerializedAction,
  SerializedConstraintElement,
  SerializedMechanicalElement,
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
  thumbnail: string; // DataURL (ex: "data:image/png;base64,...")
}

export const DEFAULT_METADATA: MechanismMetadata = {
  name: "Nouveau mécanisme",
  description: "",
  author: "",
  createdAt: 0,
  modifiedAt: 0,
  version: "1.0.0",
  tags: [],
  thumbnail: "",
};

export interface ViewportState {
  zoom: number;
  panX: number;
  panY: number;
}

export const DEFAULT_VIEWPORT: ViewportState = {
  zoom: 1,
  panX: 0,
  panY: 0,
};

export interface Mechanism {
  metadata: MechanismMetadata;
  viewport: ViewportState;
  mechanicalElements: MechanicalElement[];
  constraintElements: ConstraintElement[];
  history: Action[][];
  future: Action[][];
}

export interface SerializedMechanism {
  metadata: MechanismMetadata;
  viewport: ViewportState;
  mechanicalElements: SerializedMechanicalElement[];
  constraintElements: SerializedConstraintElement[];
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
