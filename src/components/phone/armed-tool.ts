import { CanvasState, Mechanism } from "../../types";
import {
  edition_palette,
  PaletteElement,
} from "../element-palette/ElementPalette";

/** The palette tool armed in `canvasState`, if any — the selection tool being no tool to show. */
export function armed_palette_element(
  canvasState: CanvasState,
  mechanism: Mechanism,
): PaletteElement | undefined {
  for (const group of edition_palette())
    for (const element of group.elements)
      if (
        element.goToStateType !== "Selecting" &&
        element.hilightRule(canvasState, mechanism)
      )
        return element;
  return undefined;
}
