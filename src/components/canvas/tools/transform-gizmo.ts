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
import { MechanicalElement, Point2, ScreenPoint, WorldPoint } from "../../../types";
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

/** The three corners of the scale handle, apex first, outside the ring and pointing away from it. */
export function scale_handle_corners(pivot: ScreenPoint): ScreenPoint[] {
  const { RING, HANDLE_GAP, HANDLE_LENGTH, HANDLE_WIDTH } = gizmo_sizes();
  const base = pivot.add(SCALE_DIRECTION.mul(RING + HANDLE_GAP));
  const apex = base.add(SCALE_DIRECTION.mul(HANDLE_LENGTH));
  const side = new Point2<"screen">(-SCALE_DIRECTION.y, SCALE_DIRECTION.x).mul(
    HANDLE_WIDTH / 2,
  );
  return [apex, base.add(side), base.sub(side)];
}

/** The handle under `mouse`, if any. The inside of the ring stays the mechanism's, the pivot aside. */
export function transform_handle_at(
  mouse: ScreenPoint,
  pivot: ScreenPoint,
): TransformHandlePart | undefined {
  const { RING, RING_HIT, HANDLE_LENGTH, HANDLE_GAP, HANDLE_HIT } = gizmo_sizes();
  const middle = pivot.add(
    SCALE_DIRECTION.mul(RING + HANDLE_GAP + HANDLE_LENGTH / 2),
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
    return `${SCALE_PREFIX} ${to_mantissa(value, UNIT_FREE, TRANSFORM_SCALE_PRECISION)}`;
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

/** The angle a drag from `from` to `to` turns about `pivot`, in (-π, π]. */
export function dragged_angle(
  pivot: WorldPoint,
  from: WorldPoint,
  to: WorldPoint,
  snap: boolean,
): number {
  const a = from.sub(pivot);
  const b = to.sub(pivot);
  const angle = Math.atan2(a.x * b.y - a.y * b.x, a.x * b.x + a.y * b.y);
  if (!snap) return angle;
  return Math.round(angle / TRANSFORM_SNAP.ANGLE) * TRANSFORM_SNAP.ANGLE;
}

/**
 * The factor a drag from `from` to `to` scales by, from how far it pulled away from the pivot.
 * Doubles per fixed distance rather than following the ratio of the distances: on a handle this close to the pivot, that ratio would be far too sensitive to hold.
 */
export function dragged_scale(
  pivot: WorldPoint,
  from: WorldPoint,
  to: WorldPoint,
  pxPerWorld: number,
  minScale: number,
  snap: boolean,
): number {
  const outward = from.sub(pivot);
  const length = outward.length();
  const pulled =
    length > 0
      ? (((to.x - from.x) * outward.x + (to.y - from.y) * outward.y) / length) *
        pxPerWorld
      : 0;
  const scale = 2 ** (pulled / TRANSFORM_GIZMO.PX_PER_DOUBLING);
  const held = snap
    ? Math.round(scale / TRANSFORM_SNAP.SCALE) * TRANSFORM_SNAP.SCALE
    : scale;
  return Math.max(minScale, held);
}
