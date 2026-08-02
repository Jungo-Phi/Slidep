import { ID } from "./element";
import { WorldPoint } from "./mechanism";

type HoveredElement = {
  position: WorldPoint;
  id: ID;
  deleting: boolean;
};

/** The element and which part of that element of the mechanism that is currently hovered */
export type HoveredPart =
  | { type: "Void"; position: WorldPoint; rejected?: string }
  | (HoveredElement & { type: "Node"; beamBodyHover: boolean })
  | (HoveredElement & { type: "Edge"; part: "start" | "end" | "body" })
  | (HoveredElement & { type: "GearTooth" })
  | (HoveredElement & { type: "BeltBody"; section: number })
  | { type: "BeltClosure"; position: WorldPoint }
  | (HoveredElement & { type: "Probe" })
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
): part is Exclude<HoveredPart, { type: "Void" } | { type: "BeltClosure" }> {
  return part.type !== "Void" && part.type !== "BeltClosure";
}
