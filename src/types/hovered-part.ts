import type { StringKey } from "../i18n";
import { PhysicsOverlayKind } from "../constants/physics-display-specs";
import { ID } from "./element";
import { WorldPoint } from "./mechanism";

/**
 * Which measured reading is named: the quantity, the element it is read from, and — for a reaction, the one kind an edge carries two of — which of its own points.
 * A reading is not an element: it has no id of its own.
 * A reaction is ONE reading, resultant and couple together: that is what the solver computes at a point (`ElementReaction`), and what the two glyphs drawn there stand for.
 * The same identity a click keeps hold of, which is why `FocusedOverlay` is this very type.
 */
export type HoveredReading = {
  elementID: ID;
  kind: PhysicsOverlayKind;
  which?: "node" | "start" | "end";
};

type HoveredElement = {
  position: WorldPoint;
  id: ID;
  deleting: boolean;
};

/** The element and which part of that element of the mechanism that is currently hovered */
export type HoveredPart =
  | {
      type: "Void";
      position: WorldPoint;
      /** Named rather than written out, so hovering says nothing about the language it is read in. */
      rejected?: StringKey;
      rejectedVars?: Record<string, string | number>;
    }
  | (HoveredElement & { type: "Node"; beamBodyHover: boolean })
  | (HoveredElement & { type: "Edge"; part: "start" | "end" | "body" })
  | (HoveredElement & { type: "GearTooth" })
  | (HoveredElement & { type: "BeltBody"; section: number })
  | { type: "BeltClosure"; position: WorldPoint }
  /** The floor's handles — no `id`, like `BeltClosure`: it names no `MechanicalElement`.
   * `FloorAngle` is the drag handle; `FloorAngleValue` is its displayed value, a separate click-to-edit target the same way a load's `"value"` part is separate from its body. */
  | { type: "FloorHeight"; position: WorldPoint }
  | { type: "FloorAngle"; position: WorldPoint }
  | { type: "FloorAngleValue"; position: WorldPoint }
  | (HoveredElement & { type: "Probe" })
  | (HoveredElement & { type: "MotorArrow" })
  | (HoveredElement & { type: "Constraint" })
  | (HoveredElement & { type: "Force"; part: "body" | "value" })
  | (HoveredElement & {
      type: "DistributedForce";
      part: "start" | "end" | "body" | "start-value" | "end-value";
      t?: number;
    })
  | (HoveredElement & { type: "Moment"; part: "body" | "value" })
  /** A measured reading drawn over the mechanism — no `id`, since it names no element of its own: `reading.elementID` is the element it is read FROM, which the canvas lights up alongside it.
   * In the same register as everything else here, so a reading and an element can never be hovered at once. */
  | { type: "Overlay"; position: WorldPoint; reading: HoveredReading };

/**
 * Whether the cursor is on an element rather than on empty space or on a belt's closing terminal, which names none.
 */
export function names_element(
  part: HoveredPart,
): part is Exclude<
  HoveredPart,
  | { type: "Void" }
  | { type: "BeltClosure" }
  | { type: "FloorHeight" }
  | { type: "FloorAngle" }
  | { type: "FloorAngleValue" }
  | { type: "Overlay" }
> {
  return (
    part.type !== "Void" &&
    part.type !== "BeltClosure" &&
    part.type !== "FloorHeight" &&
    part.type !== "FloorAngle" &&
    part.type !== "FloorAngleValue" &&
    part.type !== "Overlay"
  );
}

/** Whether the given hover names this element, e.g. to highlight its ElementDisplay(s). */
export function is_hovered(part: HoveredPart, id: ID): boolean {
  return names_element(part) && part.id === id;
}

/** Whether the hover is a load's displayed value (magnitude), a click-to-edit
 * target distinct from its body/handles. */
export function is_load_value_label(
  part: HoveredPart,
): part is Extract<
  HoveredPart,
  { type: "Force" | "Moment" | "DistributedForce" }
> & { part: "value" | "start-value" | "end-value" } {
  return (
    ((part.type === "Force" || part.type === "Moment") &&
      part.part === "value") ||
    (part.type === "DistributedForce" &&
      (part.part === "start-value" || part.part === "end-value"))
  );
}

/**
 * An abscissa hovered along one beam's own N/T/Mf diagram (docs/plan-efforts-interieurs.md phase 5bis), for the canvas to mark on the beam itself.
 * Deliberately its own channel rather than a `HoveredPart` case: `HoveredPart` doubles as interaction/hit-testing state (drag handles, deletion), and this is purely informational — panel → canvas only.
 */
export interface HoveredAbscissa {
  beamID: ID;
  /** 0 at the beam's own `positionStart`, `length` at `positionEnd`. */
  s: number;
}
