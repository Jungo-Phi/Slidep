import type { CanvasState, Mechanism } from "../../types";
import { tool_state } from "../../constants/shortcuts";
import { armed_tool_state } from "../canvas/tools/arm-tool";
import type { PaletteElement } from "./ElementPalette";

/** The canvas state a click on `element` leads to, whichever palette it is clicked in. */
export function palette_click_state(
  element: PaletteElement,
  isHighlighted: boolean,
  canvasState: CanvasState,
  mechanism: Mechanism,
): CanvasState {
  // Clicking the armed tool disarms it, like Escape — minus Escape's effect on a running simulation, which a palette click has no business triggering.
  if (isHighlighted && element.goToStateType !== "Selecting")
    return tool_state("Selecting");
  return armed_tool_state(
    element.goToStateType,
    canvasState,
    mechanism.mechanicalElements,
    mechanism.constraintElements,
    mechanism.loads,
    mechanism.viewport,
  );
}
