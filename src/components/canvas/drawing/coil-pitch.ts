import { MechanicalElement, Point2, WorldPoint } from "../../../types";
import { DIM } from "../../../constants/rendering-specs";
import { Bounds, mechanism_bounds } from "../../../utils";

/**
 * World length one drawn coil stands for, or `undefined` for a mechanism with no extent of its own.
 *
 * A spring shows one coil per pitch of its *rest* length, so that its coils spread as it stretches and keep their count through a run — the accordion.
 * That leaves only the pitch to choose, and it cannot be an absolute length: a mechanism is modelled in whatever unit suits it, and the same spring laid out in millimetres or in metres has to read the same.
 * It is taken from the diagonal of the mechanism's own box instead, which carries that unit with it, and read raw rather than rounded to anything.
 * Rounding it would make the count fall back a notch at each threshold the box grows past, and pulling on a spring would take coils away from it — the one thing a drawing may never answer to that gesture.
 * Raw, the box cannot grow faster than the spring being pulled, so the count only ever climbs or holds; a spring that is the whole mechanism holds `SPRING_COILS_PER_SPAN` at any length.
 *
 * The box has to be one of the mechanism at rest: a pose stretches the springs it moves, so a box taken off it carries their own length back into what counts their coils, and a run recounts them as it plays.
 */
export function coil_pitch_of_bounds(
  bounds: Bounds | undefined,
): number | undefined {
  if (!bounds) return undefined;
  const span = bounds.min.distance_to(bounds.max);
  if (!(span > 0)) return undefined;
  return span / DIM.SPRING_COILS_PER_SPAN;
}

/**
 * `coil_pitch_of_bounds` for a mechanism given by its elements.
 *
 * `drawn` is the edge a gesture is previewing, ends in world coordinates: counted in although it is not an element yet, so that a preview reaching outside the mechanism measures itself against the span it is about to make, and no coil appears or vanishes on the click that lands it.
 */
export function spring_coil_pitch(
  mechanicalElements: MechanicalElement[],
  drawn?: readonly [WorldPoint, WorldPoint],
): number | undefined {
  const bounds = mechanism_bounds(mechanicalElements);
  if (!drawn) return coil_pitch_of_bounds(bounds);
  const corners = [...(bounds ? [bounds.min, bounds.max] : []), ...drawn];
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  return coil_pitch_of_bounds({
    min: new Point2(Math.min(...xs), Math.min(...ys)),
    max: new Point2(Math.max(...xs), Math.max(...ys)),
  });
}
