import {
  Action,
  ConstraintElement,
  LoadElement,
  MechanicalElement,
  Point2,
  ViewportState,
} from "../types";

export type SerializedPoint2 = { x: number; y: number };

export type Serialized<T> = T extends Point2
  ? SerializedPoint2
  : T extends Map<infer K, infer V>
    ? [K, Serialized<V>][]
    : T extends Array<infer U>
      ? Serialized<U>[]
      : T extends object
        ? { [K in keyof T]: Serialized<T[K]> }
        : T;

export type SerializedMechanicalElement = Serialized<MechanicalElement>;
export type SerializedConstraintElement = Serialized<ConstraintElement>;
export type SerializedLoadElement = Serialized<LoadElement>;
export type SerializedViewportState = Serialized<ViewportState>;
export type SerializedAction = Serialized<Action>;
