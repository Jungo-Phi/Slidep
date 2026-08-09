import {
  Action,
  ConstraintElement,
  LoadElement,
  MechanicalElement,
  Point2,
  ViewportState,
} from "../types";

/** `JSON.stringify` has no spelling for `NaN` or `Infinity` and writes `null`, so a stored coordinate is not always a number. */
export type SerializedPoint2 = { x: number | null; y: number | null };

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
