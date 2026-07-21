import { ID } from "./element";
import { Point2 } from "./point2";

/** The element and which part of that element of the mechanism that is currently hovered */
export type HoveredPart =
  /** `rejected` carries why an opaque element refused the gesture, so the canvas
   *  can say so; absent when the cursor is simply over nothing. */
  | { type: "Void"; position: Point2; rejected?: string }
  | {
      type: "Node";
      position: Point2;
      id: ID;
      deleting: boolean;
      beamBodyHover: boolean;
    }
  | {
      type: "Edge";
      position: Point2;
      id: ID;
      deleting: boolean;
      part: "start" | "end" | "body";
    }
  | {
      type: "GearTooth";
      position: Point2;
      id: ID;
      deleting: boolean;
    }
  | {
      type: "BeltBody";
      position: Point2;
      id: ID;
      deleting: boolean;
      section: number;
    }
  /** A belt's own terminal, offered as the target that closes it into a loop.
   *  It names no element: while the belt is being placed it does not exist yet,
   *  and once placed the target is the belt itself. */
  | { type: "BeltClosure"; position: Point2 }
  | { type: "Constraint"; position: Point2; id: ID; deleting: boolean }
  | {
      type: "Force";
      position: Point2;
      id: ID;
      part: "body" | "value";
      deleting: boolean;
    }
  | {
      type: "DistributedForce";
      position: Point2;
      id: ID;
      part: "start" | "end" | "body" | "start-value" | "end-value";
      deleting: boolean;
      /** Only for `part: "body"`: where along the beam the crest line was
       *  grabbed, so the drag can move that very point under the cursor. */
      t?: number;
    }
  | {
      type: "Moment";
      position: Point2;
      id: ID;
      part: "body" | "value";
      deleting: boolean;
    };

/** A hovered part that designates an element, and so carries an `id`. */
export type ElementHover = Exclude<
  HoveredPart,
  { type: "Void" } | { type: "BeltClosure" }
>;

/**
 * Whether the cursor is on an element rather than on empty space or on a belt's
 * closing terminal, which names none.
 */
export function names_element(part: HoveredPart): part is ElementHover {
  return part.type !== "Void" && part.type !== "BeltClosure";
}
