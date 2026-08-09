/**
 * Asking a constraint to hold a value it cannot, and seeing whether the mechanism obeys.
 *
 * This is redundancy stated the other way round. If a constraint's row is independent, its
 * target can be moved and the mechanism follows — the implicit function theorem says a new
 * configuration exists nearby, and the solver finds it. If the row is dependent, the targets
 * are tied by a compatibility relation: changing one alone breaks it, and **no** configuration
 * satisfies the set. The solver does not diverge, it settles on a compromise and leaves a
 * residual proportional to the lie.
 *
 *     absorbed  ⟺  independent          resisted  ⟺  redundant
 *
 * So the same operation both detects the redundancy and shows it: a mechanism visibly
 * fighting itself is what over-constraint means to whoever drew it — not a lost motion, but
 * an assembly that cannot take up the smallest imperfection.
 */

import { Link, Point2 } from "../../types";
import { AnalysisModel, variable_keys_of } from "./analysis-model";

/**
 * A copy of `link` whose target is off by `offset`, or `undefined` when it has no target
 * to be wrong about.
 *
 * `offset` is a length. Angle-valued targets divide it by `lever`, the arm the angle acts
 * through, so that a millimetre of lie is a millimetre of lie whatever the constraint holds
 * — the same reason the mobility probe scales angles by a gear's radius. The arm must be the
 * constraint's own: handed the whole chain's extent, a short-armed angle lock receives a lie
 * far smaller than asked for and barely reacts.
 *
 * A slider has no value of its own, so its lie is a place rather than a number: the point is
 * asked to stand `offset` clear of its rail. That breaks `SlideOnSegment` outright, and
 * `FixedOnSegment` too — pinning both ways, it refuses a lie in any direction, so the normal
 * serves for both.
 *
 * Returning `undefined` is still a real answer: `Parallel`, `Horizontal` and their kin hold a
 * quantity at zero and carry no value to shift. Falsifying those needs a term the solver does
 * not have.
 */
export function falsify(
  link: Link,
  offset: number,
  lever: number,
): Link | undefined {
  switch (link.type) {
    case "Distance":
    case "DistanceToLine":
      return { ...link, distance: link.distance + offset };
    case "Radius":
      return { ...link, radius: link.radius + offset };
    case "BeltLength":
      return { ...link, length: link.length + offset };
    case "BeltSegmentNoSlip":
      return { ...link, h0: link.h0 + offset };
    case "Angle":
      return { ...link, angle_rad: link.angle_rad + offset / lever };
    case "SlideOnSegment":
    case "FixedOnSegment":
      return { ...link, normalOffset: (link.normalOffset ?? 0) + offset };
    default:
      return undefined;
  }
}

/** Whether `falsify` has a target to shift on this link. */
export const is_falsifiable = (link: Link): boolean =>
  falsify(link, 1, 1) !== undefined;

/**
 * The arm a lie travels through on `link`, in millimetres, or `fallback` when it holds no
 * geometry to read one from.
 *
 * Only angle-valued targets need it, and they need it to be the constraint's OWN: handed the
 * whole chain's extent, a short-armed angle lock converts a millimetre of lie into a rotation
 * so small that nothing measurable comes back — a real redundancy then reads as absorbed.
 */
export function constraint_lever(
  model: AnalysisModel,
  link: Link,
  fallback: number,
): number {
  const at = (key: string) => model.nodes.positions.get(key);

  // An angle is between two segments, and it is one of those the lie swings — never the
  // gap between their far ends, which two beams pointing apart make twice as long.
  const arm =
    link.type === "Angle"
      ? Math.max(
          span(at(link.key1), at(link.key2)),
          span(at(link.key3), at(link.key4)),
        )
      : widest_span(variable_keys_of(link).map(at));

  return arm > 0 ? arm : fallback;
}

const span = (a: Point2 | undefined, b: Point2 | undefined) =>
  a && b ? a.distance_to(b) : 0;

/** Longest distance between any two of the points given, ignoring the absent ones. */
function widest_span(points: (Point2 | undefined)[]): number {
  let widest = 0;
  for (let i = 0; i < points.length; i++)
    for (let j = i + 1; j < points.length; j++)
      widest = Math.max(widest, span(points[i], points[j]));
  return widest;
}
