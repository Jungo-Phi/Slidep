/**
 * The ruler on the canvas: a dimension drawn for the reader rather than for the drawing, and
 * the feedback that says what the next click would take hold of.
 *
 * In the selection hue — the register of a marquee, not of a cote. A cote states a design
 * value in the drawing's own ink and drives the geometry; a ruler only reports what is there,
 * and the two must never be read for one another.
 *
 * A reading marks each of its ends once: what it takes whole is lit — the element itself, drawn
 * by `draw_mechanism` in this hue, never a shape around it — and what it takes as a point is
 * ringed. `whole_elements` draws that line.
 *
 * The reading is drawn whether or not the cursor is over the canvas, unlike the hover
 * feedback: a reading is there to be read, and reading it means looking away from where it
 * was laid.
 */

import { COLORS } from "../../../theme/canvas-theme";
import { DIM, STROKE_WIDTHS } from "../../../constants/rendering-specs";
import type { CanvasState } from "../../../types/canvas-state";
import type { HoveredPart } from "../../../types/hovered-part";
import type {
  Measure,
  MeasureAnchor,
  MechanicalElement,
  ScreenPoint,
  ViewportState,
} from "../../../types";
import { ONE, Point2 } from "../../../types/point2";
import { world2screen, world2screen_length } from "../../../utils";
import { LENGTH, rad_to_deg } from "../../../utils/quantity-format";
import { auto_dimension_offset } from "../../properties-panel/element-dimensions";
import {
  draw_dimension,
  draw_dimension_angle,
  draw_dimension_radius,
  draw_dimension_text,
  draw_hover_circle,
} from "./drawing-functions";
import {
  angle_geometry,
  measure_span,
  ruler_is_out,
  shown_readings,
  spanned_edge,
} from "../tools/measure";

/** Below this the two ends are one point on screen: there is no line to draw and no direction to point an arrow along. */
const MIN_SCREEN_LENGTH = 4;

/** How far the label of a reading with no length yet is lifted, to clear the ring under the cursor. */
const LABEL_LIFT = DIM.EDGE_ENDPOINT_RADIUS + 14;

export type MeasureDrawing = {
  viewport: ViewportState;
  state: CanvasState;
  hoveredPart: HoveredPart;
  mechanicalElements: MechanicalElement[];
  /** What the cursor points at is only read while it is over the canvas; a reading already laid is read wherever one looks. */
  cursorOnCanvas: boolean;
};

/**
 * The point an end picks out on something larger — an end of a bar, or a place along its body.
 * Everything the ruler takes whole is lit instead, and a mark of its own would say it twice.
 */
function draw_end(
  ctx: CanvasRenderingContext2D,
  anchor: MeasureAnchor,
  position: ScreenPoint,
) {
  if (anchor.kind !== "edge-end" && anchor.kind !== "edge-point") return;
  draw_hover_circle(ctx, position);
}

/** One reading, drawn where the mechanism currently puts it. */
function draw_reading(
  ctx: CanvasRenderingContext2D,
  measure: Measure,
  drawing: MeasureDrawing,
) {
  const { viewport, mechanicalElements } = drawing;
  ctx.save();
  ctx.strokeStyle = COLORS.MEASURE;
  ctx.fillStyle = COLORS.MEASURE;
  ctx.lineWidth = STROKE_WIDTHS.STANDARD;

  if (measure.kind === "radius") {
    const gear = mechanicalElements.find(
      (element) => element.id === measure.gearID,
    );
    if (gear?.type === "gear")
      draw_dimension_radius(
        ctx,
        world2screen(gear.position, viewport),
        world2screen_length(gear.radius, viewport),
        world2screen(
          // Where a radius cote nobody placed would sit, so a reading and a cote of the same
          // gear land in the same spot.
          gear.position.add(
            ONE.with_length(gear.radius + auto_dimension_offset(viewport)),
          ),
          viewport,
        ),
        gear.radius,
      );
    ctx.restore();
    return;
  }

  if (measure.kind === "angle") {
    const geometry = angle_geometry(measure, mechanicalElements);
    if (geometry)
      draw_dimension_angle(
        ctx,
        world2screen(geometry.startEdge.positionStart, viewport),
        world2screen(geometry.startEdge.positionEnd, viewport),
        world2screen(geometry.endEdge.positionStart, viewport),
        world2screen(geometry.endEdge.positionEnd, viewport),
        measure.flipStart,
        measure.flipEnd,
        world2screen(geometry.arc, viewport),
        // `draw_dimension_angle` draws in degrees, like the dimensioning tool's own preview.
        rad_to_deg(geometry.angle),
      );
    ctx.restore();
    return;
  }

  const span = measure_span(measure, mechanicalElements);
  if (!span) {
    ctx.restore();
    return;
  }
  const { from, to } = span;
  const start = world2screen(from, viewport);
  const end = world2screen(to, viewport);
  const spread = start.distance_to(end) >= MIN_SCREEN_LENGTH;
  const spanned = spanned_edge(measure);
  // A length read end to end of one bar would otherwise be drawn along the bar itself, where
  // neither line nor label can be read. It stands off exactly as its cote would.
  const label = spanned
    ? world2screen(
        from
          .lerp(to, 0.5)
          .add(to.sub(from).perp().with_length(auto_dimension_offset(viewport))),
        viewport,
      )
    : start.lerp(end, 0.5);

  if (spread) draw_dimension(ctx, start, end, label, from.distance_to(to), true);

  // A bar spanned end to end is lit whole, so neither of its ends is a point to ring.
  if (!spanned) {
    draw_end(ctx, measure.start, start);
    draw_end(ctx, measure.end, end);
  }

  // Unit shown, unlike a cote's: a cote is one of a drawing full of millimetres, a reading is
  // on its own and says what it is in.
  ctx.lineWidth = STROKE_WIDTHS.STANDARD;
  draw_dimension_text(
    ctx,
    spread ? label : new Point2<"screen">(label.x, label.y - LABEL_LIFT),
    from.distance_to(to),
    "",
    LENGTH,
  );
  ctx.restore();
}

/** Every reading the ruler currently puts on the canvas. What it holds is lit by the mechanism itself — see `whole_elements`. */
export function draw_ruler(
  ctx: CanvasRenderingContext2D,
  drawing: MeasureDrawing,
) {
  const { state, hoveredPart, mechanicalElements, cursorOnCanvas } = drawing;
  if (!ruler_is_out(state)) return;
  for (const reading of shown_readings(
    state,
    hoveredPart,
    mechanicalElements,
    cursorOnCanvas,
  ))
    draw_reading(ctx, reading, drawing);
}
