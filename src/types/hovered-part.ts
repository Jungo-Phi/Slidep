import { ID } from "./element";
import { Point2 } from "./point2";

/** The element and which part of that element of the mechanism that is currently hovered */
export type HoveredPart =
  | { type: "Void"; position: Point2 }
  | {
      type: "Node";
      position: Point2;
      id: ID;
      beamBodyHover: boolean;
    }
  | {
      type: "Edge";
      position: Point2;
      id: ID;
      part: "start" | "end" | "body";
    }
  | {
      type: "GearTooth";
      position: Point2;
      id: ID;
    }
  | {
      type: "BeltBody";
      position: Point2;
      id: ID;
      section: number;
    }
  | { type: "Constraint"; position: Point2; id: ID };
