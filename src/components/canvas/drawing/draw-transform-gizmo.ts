import { COLORS } from "../../../theme/canvas-theme";
import { DIM, STROKE_WIDTHS } from "../../../constants/rendering-specs";
import { ScreenPoint, WorldPoint, ViewportState } from "../../../types";
import type { TransformHandlePart, TransformKind } from "../../../types";
import { world2screen } from "../../../utils";
import {
  gizmo_sizes,
  scale_handle_corners,
  transform_value_text,
} from "../tools/transform-gizmo";

/**
 * The gizmo is scaffolding, not a part of the mechanism and not the simulation's accent: neutral ink at the same restraint as the ruler's corner button.
 * The strokes are heavier than a drawing's to make up for it.
 */
const INK_ALPHA = { REST: 0.55, ACTIVE: 1, FILL: 0.15 };
const WIDTH = {
  REST: STROKE_WIDTHS.HOVERED,
  ACTIVE: STROKE_WIDTHS.HOVERED + STROKE_WIDTHS.HOVER_GAIN,
};
/** A pale edge under the ink, so the gizmo still reads over the elements it stands on. */
const HALO = { ALPHA: 0.6, EXTRA_WIDTH: 2.5 };

/** How large a scale's indicator may grow on screen: past that, it would only cover the canvas, and the number in the box says the rest. */
const SCALE_INDICATOR_MAX_RADIUS = 220;

/** The value under way, dragged or being typed, for the gizmo to show what it does. */
export interface GizmoDrag {
  kind: TransformKind;
  value: number;
  from: WorldPoint;
  /** The value box is open: it is a real field then, drawn by the editor. */
  typing?: boolean;
}

/** The gizmo of a multiple selection, on top of the mechanism it acts on. */
export function draw_transform_gizmo(
  ctx: CanvasRenderingContext2D,
  pivotWorld: WorldPoint,
  viewport: ViewportState,
  /** The handle under the cursor or being dragged. */
  active: TransformHandlePart | undefined,
  drag: GizmoDrag | undefined,
): void {
  const pivot = world2screen(pivotWorld, viewport);
  const { RING } = gizmo_sizes();
  /** Strokes the current path as `part`, over its halo. */
  const stroke_part = (part: TransformHandlePart) => {
    const isActive = active === part;
    const width = isActive ? WIDTH.ACTIVE : WIDTH.REST;
    ctx.globalAlpha = HALO.ALPHA;
    ctx.strokeStyle = COLORS.BACKGROUND;
    ctx.lineWidth = width + HALO.EXTRA_WIDTH;
    ctx.stroke();
    ctx.globalAlpha = isActive ? INK_ALPHA.ACTIVE : INK_ALPHA.REST;
    ctx.strokeStyle = COLORS.ELEMENT_STROKE;
    ctx.lineWidth = width;
    ctx.stroke();
  };

  ctx.save();
  ctx.lineJoin = "round";
  if (drag?.kind === "rotate") draw_rotation_sweep(ctx, pivot, drag, viewport);
  if (drag?.kind === "scale") draw_scale_band(ctx, pivot, drag);

  ctx.beginPath();
  ctx.arc(pivot.x, pivot.y, RING, 0, 2 * Math.PI);
  stroke_part("rotate");

  // Whole shapes rather than a fill and a stroke: those overlap along the edge, which translucent ink shows as a darker band inside it.
  const corners = scale_handle_corners(pivot);
  const scaleActive = active === "scale";
  const scaleWidth = scaleActive ? WIDTH.ACTIVE : WIDTH.REST;
  grown_triangle_path(ctx, corners, (scaleWidth + HALO.EXTRA_WIDTH) / 2);
  ctx.globalAlpha = HALO.ALPHA;
  ctx.fillStyle = COLORS.BACKGROUND;
  ctx.fill();
  grown_triangle_path(ctx, corners, scaleWidth / 2);
  ctx.globalAlpha = scaleActive ? INK_ALPHA.ACTIVE : INK_ALPHA.REST;
  ctx.fillStyle = COLORS.ELEMENT_STROKE;
  ctx.fill();

  // The same mark as the moment balance's reference point, and for the same reason: a point things are taken about.
  const half = DIM.MOMENT_BALANCE_MARKER_HALF_SIZE;
  ctx.beginPath();
  ctx.moveTo(pivot.x - half, pivot.y);
  ctx.lineTo(pivot.x + half, pivot.y);
  ctx.moveTo(pivot.x, pivot.y - half);
  ctx.lineTo(pivot.x, pivot.y + half);
  stroke_part("pivot");

  ctx.globalAlpha = 1;
  if (drag && !drag.typing) draw_value_box(ctx, pivot, drag);
  ctx.restore();
}

/** Starts a path around `corners`, grown by `margin` with rounded corners: the silhouette a round-joined stroke of width `2 * margin` would give it. */
function grown_triangle_path(
  ctx: CanvasRenderingContext2D,
  corners: ScreenPoint[],
  margin: number,
): void {
  const unit = (x: number, y: number) => {
    const length = Math.hypot(x, y);
    return { x: x / length, y: y / length };
  };
  const grown = corners.map((corner, index) => {
    const next = corners[(index + 1) % corners.length];
    const previous = corners[(index + corners.length - 1) % corners.length];
    const toNext = unit(next.x - corner.x, next.y - corner.y);
    const toPrevious = unit(previous.x - corner.x, previous.y - corner.y);
    const inward = unit(toNext.x + toPrevious.x, toNext.y + toPrevious.y);
    const halfAngle =
      Math.acos(toNext.x * toPrevious.x + toNext.y * toPrevious.y) / 2;
    const reach = margin / Math.sin(halfAngle);
    return { x: corner.x - inward.x * reach, y: corner.y - inward.y * reach };
  });
  const last = grown[grown.length - 1];
  ctx.beginPath();
  ctx.moveTo((last.x + grown[0].x) / 2, (last.y + grown[0].y) / 2);
  grown.forEach((corner, index) => {
    const next = grown[(index + 1) % grown.length];
    ctx.arcTo(corner.x, corner.y, next.x, next.y, margin);
  });
  ctx.closePath();
}

/** Fills and strokes the current path as an indicator: the ground under it faint, its edge plain. */
function paint_indicator(ctx: CanvasRenderingContext2D, fillRule?: CanvasFillRule): void {
  ctx.fillStyle = COLORS.ELEMENT_STROKE;
  ctx.strokeStyle = COLORS.ELEMENT_STROKE;
  ctx.globalAlpha = INK_ALPHA.FILL;
  ctx.fill(fillRule);
  ctx.globalAlpha = INK_ALPHA.ACTIVE;
  ctx.lineWidth = WIDTH.REST;
  ctx.stroke();
}

/** The angle swept so far: a sector from the pivot. */
function draw_rotation_sweep(
  ctx: CanvasRenderingContext2D,
  pivot: ScreenPoint,
  drag: GizmoDrag,
  viewport: ViewportState,
): void {
  const radius = gizmo_sizes().RING * 2;
  const from = world2screen(drag.from, viewport);
  const start = Math.atan2(from.y - pivot.y, from.x - pivot.x);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pivot.x, pivot.y);
  // A world turn counter-clockwise is one on screen too, and `arc` takes screen angles that grow clockwise.
  ctx.arc(pivot.x, pivot.y, radius, start, start - drag.value, drag.value > 0);
  ctx.closePath();
  paint_indicator(ctx);
  ctx.restore();
}

/** The factor so far: the band between the ring and the ring scaled. */
function draw_scale_band(
  ctx: CanvasRenderingContext2D,
  pivot: ScreenPoint,
  drag: GizmoDrag,
): void {
  const { RING } = gizmo_sizes();
  const scaled = Math.min(RING * drag.value, SCALE_INDICATOR_MAX_RADIUS);

  ctx.save();
  ctx.beginPath();
  ctx.arc(pivot.x, pivot.y, RING, 0, 2 * Math.PI);
  ctx.moveTo(pivot.x + scaled, pivot.y);
  ctx.arc(pivot.x, pivot.y, scaled, 0, 2 * Math.PI);
  paint_indicator(ctx, "evenodd");
  ctx.restore();
}

/** The value being dragged, in a box like the one that opens in its place on release. */
function draw_value_box(
  ctx: CanvasRenderingContext2D,
  pivot: ScreenPoint,
  drag: GizmoDrag,
): void {
  const text = transform_value_text(drag.kind, drag.value);
  ctx.font = "16px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const width = ctx.measureText(text).width + 16;
  const height = 32;
  const x = pivot.x + gizmo_sizes().VALUE_OFFSET;
  ctx.beginPath();
  ctx.roundRect(x - width / 2, pivot.y - height / 2, width, height, 6);
  ctx.fillStyle = COLORS.ON_ACCENT;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = COLORS.ELEMENT_STROKE;
  ctx.stroke();
  ctx.fillStyle = COLORS.ELEMENT_STROKE;
  ctx.fillText(text, x, pivot.y);
}
