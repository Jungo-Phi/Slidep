import { COLORS } from "../../../theme/canvas-theme";
import { PREVIEW_MIN_ZOOM, THUMBNAIL_MARGIN } from "../../../constants/interaction-specs";
import { Mechanism, ZERO } from "../../../types";
import { Bounds, fit_viewport_to_bounds, mechanism_bounds } from "../../../utils";
import { draw_floor } from "./drawing-functions";
import { draw_mechanism } from "./draw-mechanism";
import { coil_pitch_of_bounds } from "./coil-pitch";

const CANVAS_STATE = { type: "Selecting" } as const;
const HOVERED_PART = { type: "Void", position: ZERO } as const;

/**
 * Framing box of a thumbnail, in world coordinates.
 *
 * Kept out of the drawing so that a caller animating the mechanism computes it once, on the resting pose, and frames every pose of the swing in it.
 * Fitting each pose in turn would have the viewport follow the swing, which reads as the frame moving around a still mechanism.
 *
 * Constraints are left out, as the thumbnail draws none.
 */
export const thumbnail_bounds = (mechanism: Mechanism): Bounds | undefined =>
  mechanism_bounds(mechanism.mechanicalElements, []);

/**
 * Draw the mechanism's thumbnail into an already sized context.
 *
 * This is no photograph of the visible canvas: the mechanism alone is redrawn, in a neutral interaction state (nothing selected, hovered, nor being placed), framed on `bounds`.
 * A thumbnail therefore depends on the model only — not on what the user had on screen.
 *
 * It is not stored: the gallery redraws it on opening, which costs the save nothing and keeps it in the current theme.
 */
export const draw_thumbnail = (
  ctx: CanvasRenderingContext2D,
  mechanism: Mechanism,
  width: number,
  height: number,
  /** What to frame, from `thumbnail_bounds` — the resting pose's box, not this pose's. */
  bounds: Bounds | undefined,
  /** Eases the framing from `REST` (0) to `HOVER`'s tighter margins (1) as a card is hovered. */
  zoomProgress = 0,
): void => {
  const { REST, HOVER } = THUMBNAIL_MARGIN;
  const viewport = fit_viewport_to_bounds(bounds, width, height, {
    defaultZoom: PREVIEW_MIN_ZOOM,
    ratioMarginX:
      REST.ratioMarginX +
      (HOVER.ratioMarginX - REST.ratioMarginX) * zoomProgress,
    ratioMarginY:
      REST.ratioMarginY +
      (HOVER.ratioMarginY - REST.ratioMarginY) * zoomProgress,
  });

  // World axes, in screen coordinates as in the main rendering.
  // They leave the frame when the mechanism sits far from the origin, which is intended.
  ctx.strokeStyle = COLORS.GRID_AXIS;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(viewport.pan.x, 0);
  ctx.lineTo(viewport.pan.x, height);
  ctx.moveTo(0, viewport.pan.y);
  ctx.lineTo(width, viewport.pan.y);
  ctx.stroke();

  // Under every mechanism element, over the grid/axes — same z-order as the live canvas.
  draw_floor(ctx, viewport, width, height, mechanism.simulation.floor);

  draw_mechanism(ctx, {
    viewport,
    hoveredPart: HOVERED_PART,
    state: CANVAS_STATE,
    mechanicalElements: mechanism.mechanicalElements,
    // Off `bounds`, which is the resting pose's box for the same reason the framing is: a swing must no more recount a spring's coils than it may move the frame.
    coilPitch: coil_pitch_of_bounds(bounds),
    constraintElements: mechanism.constraintElements,
    loads: mechanism.loads,
    hideConstraints: true,
    hideProbes: true,
  });
};
