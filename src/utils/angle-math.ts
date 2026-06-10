import { Point2 } from "../types";

export function get_angle_dim_direction(
  start1: Point2,
  end1: Point2,
  start2: Point2,
  end2: Point2,
  position: Point2,
): { flipStart: boolean; flipEnd: boolean; angle: number } | null {
  const intersection = Point2.lines_intersection(start1, end1, start2, end2);
  if (!intersection) return null;

  const delta1 = end1.sub(start1);
  const delta2 = end2.sub(start2);
  const pos_dir = position.sub(intersection);

  const side = delta1.angle_to_deg(delta2) < 0 ? -1 : 1;
  const flipStart =
    Math.abs(pos_dir.perp().dot(delta2)) < 10e-10
      ? false
      : delta2.perp().dot(pos_dir) * side > 0;
  const flipEnd = delta1.perp().dot(pos_dir) * side < 0;

  const angle =
    delta1.mul(flipStart ? -1 : 1).angle_to_deg(delta2.mul(flipEnd ? -1 : 1)) *
    side *
    (flipStart ? -1 : 1) *
    (flipEnd ? -1 : 1);

  return { flipStart, flipEnd, angle };
}
