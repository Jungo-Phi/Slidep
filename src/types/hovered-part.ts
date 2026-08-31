import type { StringKey } from "../i18n";
import { ID } from "./element";
import { WorldPoint } from "./mechanism";

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
   *  `FloorAngle` is the drag handle; `FloorAngleValue` is its displayed value, a separate
   *  click-to-edit target the same way a load's `"value"` part is separate from its body. */
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
  | (HoveredElement & { type: "Moment"; part: "body" | "value" });

/**
 * Whether the cursor is on an element rather than on empty space or on a belt's
 * closing terminal, which names none.
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
> {
  return (
    part.type !== "Void" &&
    part.type !== "BeltClosure" &&
    part.type !== "FloorHeight" &&
    part.type !== "FloorAngle" &&
    part.type !== "FloorAngleValue"
  );
}

/** Whether the given hover names this element, e.g. to highlight its ElementDisplay(s). */
export function is_hovered(part: HoveredPart, id: ID): boolean {
  return names_element(part) && part.id === id;
}

/** Whether the hover is a load's displayed value (magnitude), a click-to-edit
 *  target distinct from its body/handles. */
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
 * An abscissa hovered along one beam's own N/T/Mf diagram (docs/plan-efforts-interieurs.md
 * phase 5bis), for the canvas to mark on the beam itself. Deliberately its own channel
 * rather than a `HoveredPart` case: `HoveredPart` doubles as interaction/hit-testing state
 * (drag handles, deletion), and this is purely informational — panel → canvas only.
 */
export interface HoveredAbscissa {
  beamID: ID;
  /** 0 at the beam's own `positionStart`, `length` at `positionEnd`. */
  s: number;
}
