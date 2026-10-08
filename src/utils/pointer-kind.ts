import {
  HIT_TOLERANCE,
  TOUCH_HIT_TOLERANCE,
  type HitTolerance,
} from "../constants/interaction-specs";

/** What the canvas is being aimed with: a pen aims like a mouse. */
export type PointerKind = "mouse" | "touch";

let activeKind: PointerKind = "mouse";

/**
 * Records the pointer of the event about to be hit-tested.
 * Called by the canvas on every pointer event rather than once: a touchscreen laptop goes from finger to mouse without warning.
 */
export function set_pointer_kind(pointerType: string): void {
  activeKind = pointerType === "touch" ? "touch" : "mouse";
}

export function pointer_kind(): PointerKind {
  return activeKind;
}

/** The aiming tolerances of the pointer last used on the canvas. */
export function hit_tolerance(): HitTolerance {
  return activeKind === "touch" ? TOUCH_HIT_TOLERANCE : HIT_TOLERANCE;
}
