import { describe, expect, it } from "vitest";
import { edition_palette } from "./ElementPalette";
import { HOVER_TARGETS } from "../canvas/picking/get-hover";
import {
  CanvasState,
  CanvasStateType,
  DimensionEdgeElement,
  ID,
  Mechanism,
} from "../../types";
import { Point2 } from "../../types/point2";

/**
 * Every `CanvasStateType` must light up at least one palette icon — otherwise the tool a user is effectively using (dragging the floor, moving a load, mid-dimension) reads as "nothing armed", which is what happened when the floor's drag/edit states and a few `Moving*` load/gear states were added without a matching `hilightRule` entry.
 *
 * `HOVER_TARGETS` (`get-hover.ts`) is reused as the canonical, compiler-checked list of every `CanvasStateType` — it is itself a `Record<CanvasStateType, …>`, so it cannot fall out of sync with `canvas-state.ts` the way a hand-copied list could.
 *
 * Every `hilightRule` only reads `state.type` (and `state.rearm`) except the dimension and gear-ratio tools' `PlacingValue` branch, which looks up the constraint by `state.elementID` to tell the two apart — so `PlacingValue` is the one state that needs a real fixture instead of a bare `{ type }`.
 */

const DIMENSION_ID = "00000000-0000-0000-0000-000000000dim" as ID;

const dimension: DimensionEdgeElement = {
  type: "dimension-edge",
  id: DIMENSION_ID,
  position: new Point2(0, 0),
  edgeID: "00000000-0000-0000-0000-000000000edg" as ID,
  value: 100,
};

const mechanism = { constraintElements: [dimension] } as Mechanism;

const FIXTURES: Partial<Record<CanvasStateType, CanvasState>> = {
  PlacingValue: { type: "PlacingValue", elementID: DIMENSION_ID, value: 100 },
};

describe("ElementPalette coverage", () => {
  const palette = edition_palette().flatMap((group) => group.elements);
  const stateTypes = Object.keys(HOVER_TARGETS) as CanvasStateType[];

  it.each(stateTypes)("%s highlights at least one palette icon", (type) => {
    const state = FIXTURES[type] ?? ({ type } as CanvasState);
    const highlighted = palette.filter((item) =>
      item.hilightRule(state, mechanism),
    );
    expect(
      highlighted.length,
      `no palette icon highlights for canvas state "${type}" — add it to a ` +
        `hilightRule in ElementPalette.tsx`,
    ).toBeGreaterThan(0);
  });
});
