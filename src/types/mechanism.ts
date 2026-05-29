/**
 * Types for mechanisms in slidep
 * A mechanism is a collection of elements and connections
 */

import { Action } from "./actions";
import { MechanicalElement, ConstraintElement } from "./element";
import {
  SerializedAction,
  SerializedConstraintElement,
  SerializedMechanicalElement,
} from "./serialized";

/**
 * Mechanism metadata
 */
export interface MechanismMetadata {
  name: string;
  description: string;
  author: string;
  createdAt: string;
  modifiedAt: string;
  version: string;
  tags: string[];
}

/**
 * Default mechanism metadata
 */
export const DEFAULT_METADATA: MechanismMetadata = {
  name: "Nouveau mécanisme",
  description: "",
  author: "",
  createdAt: new Date().toISOString(),
  modifiedAt: new Date().toISOString(),
  version: "1.0.0",
  tags: [],
};

/**
 * Mechanism viewport state
 */
export interface ViewportState {
  zoom: number;
  panX: number;
  panY: number;
  gridVisible: boolean;
  gridSize: number;
  constraintsVisible: boolean;
}

/**
 * Default viewport state
 */
export const DEFAULT_VIEWPORT: ViewportState = {
  zoom: 1,
  panX: 0,
  panY: 0,
  gridVisible: true,
  gridSize: 20,
  constraintsVisible: true,
};

/**
 * Complete mechanism representation
 */
export interface Mechanism {
  metadata: MechanismMetadata;
  viewport: ViewportState;
  mechanicalElements: MechanicalElement[];
  constraintElements: ConstraintElement[];
  history: Action[][];
  future: Action[][];
}

/**
 * Mechanism file format for export/import
 */
export interface SlidepFile {
  version: string;
  mechanism: SerializedMechanism;
  exportedAt: string;
}

export interface SerializedMechanism {
  metadata: MechanismMetadata;
  viewport: ViewportState;
  mechanicalElements: SerializedMechanicalElement[];
  constraintElements: SerializedConstraintElement[];
  history: SerializedAction[][];
  future: SerializedAction[][];
}
