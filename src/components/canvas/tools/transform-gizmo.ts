/**
 * The gizmo a multiple selection rotates and scales by: its shape on screen, and what dragging it means.
 *
 * It keeps one size on screen, so everything here that is not a world point is in screen px.
 */

import {
  TRANSFORM_GIZMO,
  TRANSFORM_SCALE_PRECISION,
  TRANSFORM_SNAP,
  TOUCH_TRANSFORM_GIZMO,
} from "../../../constants/interaction-specs";
import {
  MechanicalElement,
  Point2,
  ScreenPoint,
  ViewportState,
  WorldPoint,
} from "../../../types";
import type { CanvasState } from "../../../types/canvas-state";
import { screen2world, world2screen } from "../../../utils";
import type {
  ID,
  TransformHandlePart,
  TransformKind,
} from "../../../types/element";
import { elements_center } from "../../mechanism/clipboard";
import { hit_tolerance, pointer_kind } from "../../../utils/pointer-kind";
import {
  ANGLE,
  field_precision,
  format_quantity,
  to_mantissa,
} from "../../../utils/quantity-format";

const UNIT_FREE = { symbol: "", factor: 1 };

/** What a scale's value reads after, in its box and in its field. */
export const SCALE_PREFIX = "×";

/** Which way the scale handle sits from the pivot on screen: down and to the right, clear of the value box. */
const SCALE_DIRECTION = new Point2<"screen">(Math.SQRT1_2, Math.SQRT1_2);

export const gizmo_sizes = () =>
  pointer_kind() === "touch" ? TOUCH_TRANSFORM_GIZMO : TRANSFORM_GIZMO;

/** The three corners of the scale handle, apex first, outside a circle of `radius` (the ring unless given) and pointing away from it. */
export function scale_handle_corners(
  pivot: ScreenPoint,
  radius = gizmo_sizes().RING,
): ScreenPoint[] {
  const { HANDLE_GAP, HANDLE_LENGTH, HANDLE_WIDTH } = gizmo_sizes();
  const base = pivot.add(SCALE_DIRECTION.mul(radius + HANDLE_GAP));
  const apex = base.add(SCALE_DIRECTION.mul(HANDLE_LENGTH));
  const side = new Point2<"screen">(-SCALE_DIRECTION.y, SCALE_DIRECTION.x).mul(
    HANDLE_WIDTH / 2,
  );
  return [apex, base.add(side), base.sub(side)];
}

/**
 * The handle under `mouse`, if any. The inside of the ring stays the mechanism's, the pivot aside.
 * `scaleRadius` is the circle the scale handle stands against: the ring, unless a scale has pushed it out.
 */
export function transform_handle_at(
  mouse: ScreenPoint,
  pivot: ScreenPoint,
  scaleRadius = gizmo_sizes().RING,
): TransformHandlePart | undefined {
  const { RING, RING_HIT, HANDLE_LENGTH, HANDLE_GAP, HANDLE_HIT } = gizmo_sizes();
  const middle = pivot.add(
    SCALE_DIRECTION.mul(scaleRadius + HANDLE_GAP + HANDLE_LENGTH / 2),
  );
  if (mouse.distance_to(middle) <= HANDLE_HIT) return "scale";
  const distance = mouse.distance_to(pivot);
  if (distance <= hit_tolerance().NODE) return "pivot";
  if (Math.abs(distance - RING) <= RING_HIT) return "rotate";
  return undefined;
}

/** The value of a drag as its box shows it, in the same format as the field that opens on release. */
export function transform_value_text(kind: TransformKind, value: number): string {
  if (kind === "scale")
    return `${SCALE_PREFIX} ${to_mantissa(value, UNIT_FREE, scale_precision(value))}`;
  return format_quantity(value, ANGLE, field_precision(ANGLE));
}

/** Where a selection pivots unless told otherwise; undefined if it names no mechanical element. */
export function default_pivot(
  ids: ID[],
  elements: MechanicalElement[],
): WorldPoint | undefined {
  const selected = elements.filter((el) => ids.includes(el.id));
  return selected.length > 0 ? elements_center(selected) : undefined;
}

/**
 * The handle under `mouse` while `state` has its value box open: only the one of the transform under way, where it is drawn, can be taken up again.
 * Undefined in any other state.
 */
export function open_handle_at(
  state: CanvasState,
  mouse: ScreenPoint,
  viewport: ViewportState,
  typed: number | null,
): TransformKind | undefined {
  if (state.type !== "EditingSelectionTransform") return undefined;
  const handle = transform_handle_at(
    mouse,
    world2screen(state.pivot, viewport),
    state.kind === "scale" ? gizmo_sizes().RING * (typed ?? state.value) : undefined,
  );
  return handle === state.kind ? state.kind : undefined;
}

/**
 * The handle taken up again while `state` has its value box open, the drag going on from that value — `typed` when the box holds one — or undefined if `mouse` is not on the handle shown.
 * The box is dropped rather than applied: the drag carries its value on.
 */
export function resumed_transform(
  state: CanvasState,
  mouse: ScreenPoint,
  viewport: ViewportState,
  typed: number | null,
): Extract<CanvasState, { type: "TransformingSelection" }> | undefined {
  if (state.type !== "EditingSelectionTransform") return undefined;
  if (!open_handle_at(state, mouse, viewport, typed)) return undefined;
  const value = typed ?? state.value;
  return {
    type: "TransformingSelection",
    elementIDs: state.elementIDs,
    kind: state.kind,
    pivot: state.pivot,
    from: screen2world(mouse, viewport),
    start: value,
    value,
  };
}

/** The angle a drag from `from` to `to` turns about `pivot`, added to `start`; a drag alone turns by (-π, π]. */
export function dragged_angle(
  pivot: WorldPoint,
  from: WorldPoint,
  to: WorldPoint,
  start: number,
  snap: boolean,
): number {
  const a = from.sub(pivot);
  const b = to.sub(pivot);
  const angle = start + Math.atan2(a.x * b.y - a.y * b.x, a.x * b.x + a.y * b.y);
  if (!snap) return angle;
  return Math.round(angle / TRANSFORM_SNAP.ANGLE) * TRANSFORM_SNAP.ANGLE;
}

/**
 * How far `point` stands from the pivot along the diagonal the scale handle points down, in screen px: negative past the pivot, up and to the left.
 * A scale is read along that line alone, so the pointer can keep going past the pivot for the smallest factors.
 */
export function along_scale_axis(
  pivot: WorldPoint,
  point: WorldPoint,
  viewport: ViewportState,
): number {
  return world2screen(point, viewport)
    .sub(world2screen(pivot, viewport))
    .dot(SCALE_DIRECTION);
}

/**
 * The factor a drag from `from` to `to` scales by, from how far it went along the handle's diagonal, times `start`.
 * Doubles per fixed distance rather than following the ratio of the distances: on a handle this close to the pivot, that ratio would be far too sensitive to hold, and it lets the factor keep shrinking past the pivot.
 */
export function dragged_scale(
  pivot: WorldPoint,
  from: WorldPoint,
  to: WorldPoint,
  viewport: ViewportState,
  start: number,
  snap: boolean,
): number {
  const pulled =
    along_scale_axis(pivot, to, viewport) - along_scale_axis(pivot, from, viewport);
  const scale = start * 2 ** (pulled / TRANSFORM_GIZMO.PX_PER_DOUBLING);
  return snap ? snapped_scale(scale) : scale;
}

/** `scale` on the nearest step of `TRANSFORM_SNAP.SCALE_STEPS`. */
export function snapped_scale(scale: number): number {
  const step = scale_step(scale);
  // Rounded to the step's own decimals: `0.15 / 0.05 * 0.05` lands a hair off, which the value box would show.
  return Number((Math.round(scale / step) * step).toFixed(decimals_of(step) + 1));
}

/** The step a scale snaps by around `scale`. */
function scale_step(scale: number): number {
  const steps = TRANSFORM_SNAP.SCALE_STEPS;
  const [first, second] = steps;
  const [previous, last] = steps.slice(-2);
  // Out of the table, its two end rungs repeat a decade further each time.
  let decade = 0;
  while (scale >= previous.from * 10 ** (decade + 1)) decade++;
  while (scale < first.from * 10 ** decade) decade--;
  if (decade > 0)
    return (scale < last.from * 10 ** decade ? previous.step : last.step) * 10 ** decade;
  if (decade < 0)
    return (scale < second.from * 10 ** decade ? first.step : second.step) * 10 ** decade;
  let step = first.step;
  for (const rung of steps) if (scale >= rung.from) step = rung.step;
  return step;
}

/** How many decimals `value` needs before its first significant digit shows. */
const decimals_of = (value: number) => Math.max(0, -Math.floor(Math.log10(value)));

/** Decimals a scale is shown and typed with: `TRANSFORM_SCALE_PRECISION`, and two significant digits for a factor too small for it. */
export function scale_precision(scale: number): number {
  return Math.max(TRANSFORM_SCALE_PRECISION, decimals_of(scale) + 1);
}
