import { CanvasDrawing, draw_mechanism } from "./draw-mechanism";
import { draw_gesture_preview } from "./draw-gesture-preview";

export type { CanvasDrawing, CanvasHighlight } from "./draw-mechanism";
export { NO_HIGHLIGHT } from "./draw-mechanism";

/**
 * Dessine tout le canvas mécanique : le mécanisme lui-même, puis, si le
 * curseur est dessus, le fantôme du geste d'outil en cours.
 */
export function draw_mechanical_canvas(
  ctx: CanvasRenderingContext2D,
  drawing: CanvasDrawing,
) {
  draw_mechanism(ctx, drawing);
  if (!drawing.cursorOnCanvas) return;
  draw_gesture_preview(ctx, {
    viewport: drawing.viewport,
    hoveredPart: drawing.hoveredPart,
    state: drawing.state,
    mechanicalElements: drawing.mechanicalElements,
    dimensionSnapped: drawing.dimensionSnapped,
  });
}
