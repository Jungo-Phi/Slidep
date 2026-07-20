/**
 * Tool keyboard shortcuts: the single source, read by the palette (tooltips) and by the canvas reducer (KeyDown).
 */

import { CanvasState, CanvasStateType } from "../types";

/** The payload-free canvas states, the only ones a key can arm. */
type PayloadFree<S> = S extends { type: CanvasStateType }
  ? keyof S extends "type"
    ? S["type"]
    : never
  : never;

export type ToolStateType = PayloadFree<CanvasState>;

/**
 * Which key(s) arm which tool, in palette order. Raw `KeyboardEvent.key` values, hence case-sensitive: a lowercase letter only matches without Shift.
 */
export const TOOL_SHORTCUTS = {
  Selecting: ["Escape"],
  Erasing: ["a"],

  PlacingSlider: ["s"],
  PlacingPivot: ["p"],
  PlacingBeltStart: ["t"],
  PlacingGearStart: ["g"],

  PlacingJoin: ["j"],
  PlacingBeamStart: ["b"],
  PlacingGround: ["r"],

  PlacingDamperStart: ["c"],
  PlacingSpringStart: ["k"],
  PlacingMass: ["w"],
  PlacingMotor: ["m"],

  DimensionStart: ["d"],
  GearRatioConstraintStart: ["q"],
  EqualConstraintStart: ["e"],
  HorizontalVerticalConstraintStart: ["h", "v"],
  NormalConstraintStart: ["n"],
  ParallelConstraintStart: ["l"],

  PlacingForceStart: ["f"],
  PlacingMomentStart: ["o"],
  PlacingProbe: ["i"],
} as const satisfies Partial<Record<ToolStateType, readonly string[]>>;

/** Key names to display as something other than their `KeyboardEvent.key`. */
const KEY_LABELS: Record<string, string> = {
  Escape: "Esc",
};

/** A tool's shortcut for a tooltip: `"M"`, `"H/V"`, `"Esc"`, or `""`. */
export function shortcut_label(stateType: ToolStateType): string {
  const keys: readonly string[] | undefined = (
    TOOL_SHORTCUTS as Partial<Record<ToolStateType, readonly string[]>>
  )[stateType];
  if (!keys) return "";
  return keys.map((key) => KEY_LABELS[key] ?? key.toUpperCase()).join("/");
}

/** Which tool a pressed key arms. Throws if two tools claim the same key. */
export const TOOL_STATE_BY_KEY: Readonly<Record<string, ToolStateType>> =
  (() => {
    const byKey: Record<string, ToolStateType> = {};
    for (const [stateType, keys] of Object.entries(TOOL_SHORTCUTS)) {
      for (const key of keys) {
        if (byKey[key])
          throw new Error(
            `Shortcut "${key}" claimed by both ${byKey[key]} and ${stateType}`,
          );
        byKey[key] = stateType as ToolStateType;
      }
    }
    return byKey;
  })();

/** A payload-free state as a `CanvasState`, which TypeScript cannot distribute on its own. */
export const tool_state = (stateType: ToolStateType): CanvasState =>
  ({ type: stateType }) as CanvasState;
