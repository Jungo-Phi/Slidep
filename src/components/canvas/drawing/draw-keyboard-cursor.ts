import { ScreenPoint } from "../../../types";
import { COLORS } from "../../../theme/canvas-theme";

/** Half the length of the cursor's cross, in screen px: the size of a system pointer, so it reads as one. */
const ARM = 9;
/** The gap left at the middle, for what lies under it to stay visible. */
const GAP = 3;

/**
 * The keyboard's cursor: a cross in the ink of the drawing, over a halo of its ground so that it reads on a beam as on the paper.
 * Drawn above everything, being where the next click lands rather than part of the mechanism.
 */
export function draw_keyboard_cursor(
  ctx: CanvasRenderingContext2D,
  at: ScreenPoint,
) {
  const arms = () => {
    ctx.beginPath();
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      ctx.moveTo(at.x + dx * GAP, at.y + dy * GAP);
      ctx.lineTo(at.x + dx * ARM, at.y + dy * ARM);
    }
    ctx.stroke();
  };
  ctx.save();
  ctx.setLineDash([]);
  ctx.lineCap = "round";
  ctx.strokeStyle = COLORS.BACKGROUND;
  ctx.lineWidth = 4;
  arms();
  ctx.strokeStyle = COLORS.ELEMENT_STROKE;
  ctx.lineWidth = 1.5;
  arms();
  ctx.restore();
}
