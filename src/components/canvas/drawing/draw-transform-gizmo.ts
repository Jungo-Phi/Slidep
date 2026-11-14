import { COLORS } from "../../../theme/canvas-theme";
import { DIM, STROKE_WIDTHS, TEXT_SPECS } from "../../../constants/rendering-specs";
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
/** `REST` for a part neither under the cursor nor dragged: see-through, so the elements under it still show. */
const INK_ALPHA = { REST: 0.35, ACTIVE: 1, FILL: 0.15 };
const WIDTH = {
  REST: STROKE_WIDTHS.HOVERED,
  ACTIVE: STROKE_WIDTHS.HOVERED + STROKE_WIDTHS.HOVER_GAIN,
};
/** A pale edge under the ink, so the gizmo still reads over the elements it stands on. */
const HALO = { ALPHA: 0.6, EXTRA_WIDTH: 2.5 };

/** The value under way, dragged or being typed, for the gizmo to show what it does. */
export interface GizmoDrag {
  kind: TransformKind;
  value: number;
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
  /** How `part` is inked: plain while it is under the cursor or dragged, see-through otherwise. */
  const look = (part: TransformHandlePart) =>
    active === part
      ? { width: WIDTH.ACTIVE, color: COLORS.ELEMENT_STROKE, opacity: INK_ALPHA.ACTIVE }
      : { width: WIDTH.REST, color: COLORS.ELEMENT_STROKE, opacity: INK_ALPHA.REST };
  /** Strokes the current path as `part`, over its halo. */
  const stroke_part = (part: TransformHandlePart) => {
    const { width, color, opacity } = look(part);
    ctx.globalAlpha = HALO.ALPHA * opacity;
    ctx.strokeStyle = COLORS.BACKGROUND;
    ctx.lineWidth = width + HALO.EXTRA_WIDTH;
    ctx.stroke();
    ctx.globalAlpha = opacity;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  };

  ctx.save();
  ctx.lineJoin = "round";
  if (drag?.kind === "rotate") draw_rotation_sweep(ctx, pivot, drag);

  ctx.beginPath();
  ctx.arc(pivot.x, pivot.y, RING, 0, 2 * Math.PI);
  stroke_part("rotate");

  const scaling = drag?.kind === "scale";
  if (scaling) draw_scale_band(ctx, pivot, drag);

  // Whole shapes rather than a fill and a stroke: those overlap along the edge, which translucent ink shows as a darker band inside it.
  // Against the scaled circle while a scale is under way, as if pushed by it.
  const corners = scale_handle_corners(pivot, scaling ? RING * drag.value : RING);
  const scaleLook = look("scale");
  grown_triangle_path(ctx, corners, (scaleLook.width + HALO.EXTRA_WIDTH) / 2);
  ctx.globalAlpha = HALO.ALPHA * scaleLook.opacity;
  ctx.fillStyle = COLORS.BACKGROUND;
  ctx.fill();
  grown_triangle_path(ctx, corners, scaleLook.width / 2);
  ctx.globalAlpha = scaleLook.opacity;
  ctx.fillStyle = scaleLook.color;
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
function paint_indicator(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = COLORS.ELEMENT_STROKE;
  ctx.strokeStyle = COLORS.ELEMENT_STROKE;
  ctx.globalAlpha = INK_ALPHA.FILL;
  ctx.fill();
  ctx.globalAlpha = INK_ALPHA.ACTIVE;
  ctx.lineWidth = WIDTH.REST;
  ctx.stroke();
}

/** The angle turned so far: a sector from the pivot, read from 0°, whatever point of the ring was grabbed. */
function draw_rotation_sweep(
  ctx: CanvasRenderingContext2D,
  pivot: ScreenPoint,
  drag: GizmoDrag,
): void {
  const radius = gizmo_sizes().RING * 2;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pivot.x, pivot.y);
  // A world turn counter-clockwise is one on screen too, and `arc` takes screen angles that grow clockwise.
  ctx.arc(pivot.x, pivot.y, radius, 0, -drag.value, drag.value > 0);
  ctx.closePath();
  paint_indicator(ctx);
  ctx.restore();
}

/**
 * The factor so far: the ring scaled by it, in proportion, the band between the two faint.
 * The ring itself is already drawn, so only the scaled circle gets an edge.
 */
function draw_scale_band(
  ctx: CanvasRenderingContext2D,
  pivot: ScreenPoint,
  drag: GizmoDrag,
): void {
  const { RING } = gizmo_sizes();
  const scaled = RING * drag.value;

  ctx.save();
  ctx.fillStyle = COLORS.ELEMENT_STROKE;
  ctx.strokeStyle = COLORS.ELEMENT_STROKE;
  ctx.beginPath();
  ctx.arc(pivot.x, pivot.y, RING, 0, 2 * Math.PI);
  ctx.moveTo(pivot.x + scaled, pivot.y);
  ctx.arc(pivot.x, pivot.y, scaled, 0, 2 * Math.PI);
  ctx.globalAlpha = INK_ALPHA.FILL;
  ctx.fill("evenodd");
  ctx.beginPath();
  ctx.arc(pivot.x, pivot.y, scaled, 0, 2 * Math.PI);
  ctx.globalAlpha = INK_ALPHA.ACTIVE;
  ctx.lineWidth = WIDTH.REST;
  ctx.stroke();
  ctx.restore();
}

/** The value being dragged, in a box like the one that opens in its place on release. */
function draw_value_box(
  ctx: CanvasRenderingContext2D,
  pivot: ScreenPoint,
  drag: GizmoDrag,
): void {
  const text = transform_value_text(drag.kind, drag.value);
  ctx.font = TEXT_SPECS.TEXT_FONT;
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
