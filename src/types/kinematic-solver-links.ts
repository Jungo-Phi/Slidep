import { Point2 } from "./point2";

export type Nodes = {
  positions: Map<string, Point2>;
  radii: Map<string, number>;
  posMasses: Map<string, number>;
  radMasses: Map<string, number>;
};

/** Kinds of (non oriented) connections between points. */
export type Link =
  | { type: "Coincidence"; ddl: 2; key1: string; key2: string }
  | { type: "Distance"; ddl: 1; key1: string; key2: string; distance: number }
  | {
      type: "DistanceToLine";
      ddl: 1;
      key1: string;
      key2: string;
      key3: string;
      distance: number;
    }
  | { type: "OnSegment"; ddl: 1; key1: string; key2: string; key3: string }
  | {
      type: "AtSegmentRatio";
      ddl: 2;
      key1: string;
      key2: string;
      key3: string;
      t: number;
    }
  | {
      type: "KeepOrientation";
      ddl: 1;
      key1: string;
      key2: string;
      direction: Point2;
    }
  | {
      type: "Angle";
      ddl: 1;
      key1: string;
      key2: string;
      key3: string;
      key4: string;
      angle: number;
    }
  | { type: "Radius"; ddl: 1; key1: string; radius: number }
  | { type: "Horizontal"; ddl: 1; key1: string; key2: string }
  | { type: "Vertical"; ddl: 1; key1: string; key2: string }
  | {
      type: "Normal";
      ddl: 1;
      key1: string;
      key2: string;
      key3: string;
      key4: string;
    }
  | {
      type: "Parallel";
      ddl: 1;
      key1: string;
      key2: string;
      key3: string;
      key4: string;
    }
  | {
      type: "EqualLength";
      ddl: 1;
      key1: string;
      key2: string;
      key3: string;
      key4: string;
    }
  | { type: "GearMeshing"; ddl: 1; key1: string; key2: string }
  | { type: "GearRatio"; ddl: 1; key1: string; key2: string; ratio: number }
  | { type: "HandleGrab"; ddl: 1; grabbedKey: string; value: Point2 | number };
