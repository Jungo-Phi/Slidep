import { Action, MechanicalElement } from "../../types";
import { can_collide, element_collides } from "../../utils/element-queries";

/** The elements that can collide — the denominator of the n/total counter. */
export function collision_targets(
  elements: MechanicalElement[],
): MechanicalElement[] {
  return elements.filter(can_collide);
}

/** How many of the collidable elements currently collide, out of how many. */
export function collision_count(
  elements: MechanicalElement[],
): { on: number; total: number } {
  const targets = collision_targets(elements);
  return {
    on: targets.filter((el) => element_collides(el)).length,
    total: targets.length,
  };
}

/** Toggle collisions on one element (the switch in the element's panel).
 * A parameter edit, so it applies at the current time without leaving simulation. */
export function set_collides(
  element: MechanicalElement,
  on: boolean,
): Action[] {
  return [
    {
      type: "SetElementCollides",
      elementID: element.id,
      newValue: on,
      oldValue: element_collides(element),
    },
  ];
}

/** Bulk command: set whether `on` for every collidable element whose state differs (a command, not a toggle). */
export function set_all_collides(
  elements: MechanicalElement[],
  on: boolean,
): Action[] {
  return collision_targets(elements)
    .filter((el) => element_collides(el) !== on)
    .map((el) => ({
      type: "SetElementCollides" as const,
      elementID: el.id,
      newValue: on,
      oldValue: element_collides(el),
    }));
}
