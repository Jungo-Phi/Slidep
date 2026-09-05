import { CanvasDrawing, draw_mechanism } from "./draw-mechanism";
import { draw_gesture_preview } from "./draw-gesture-preview";
import { draw_ruler } from "./draw-measure";

export type { CanvasDrawing, CanvasHighlight } from "./draw-mechanism";
export { NO_HIGHLIGHT } from "./draw-mechanism";

/**
 * Dessine tout le canvas mécanique : le mécanisme lui-même, les lectures de la
 * règle, puis, si le curseur est dessus, le fantôme du geste d'outil en cours.
 *
 * La règle est dessinée hors de ce dernier : une mesure se lit, et la lire veut
 * dire quitter le canvas des yeux.
 */
export function draw_mechanical_canvas(
  ctx: CanvasRenderingContext2D,
  drawing: CanvasDrawing,
) {
  draw_mechanism(ctx, drawing);
  draw_ruler(ctx, {
    viewport: drawing.viewport,
    state: drawing.state,
    hoveredPart: drawing.hoveredPart,
    mechanicalElements: drawing.mechanicalElements,
    cursorOnCanvas: drawing.cursorOnCanvas ?? false,
  });
  if (!drawing.cursorOnCanvas) return;
  draw_gesture_preview(ctx, {
    viewport: drawing.viewport,
    hoveredPart: drawing.hoveredPart,
    state: drawing.state,
    mechanicalElements: drawing.mechanicalElements,
    dimensionSnapped: drawing.dimensionSnapped,
  });
}
