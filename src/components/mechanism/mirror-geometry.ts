/**
 * What a mirror does to one element.
 *
 * Positions and senses are separate because they undo differently: a sense flips back by flipping again, whereas positions are restored whole by the bundle's `UpdatePositionsToValidState`.
 */

import {
  ConstraintElement,
  LoadElement,
  MechanicalElement,
  MirrorAxis,
  Point2,
  WorldPoint,
} from "../../types";

export function mirrored_point(
  point: WorldPoint,
  axis: MirrorAxis,
  center: WorldPoint,
): WorldPoint {
  return axis === "horizontal"
    ? new Point2<"world">(2 * center.x - point.x, point.y)
    : new Point2<"world">(point.x, 2 * center.y - point.y);
}

/** Where `point` goes when turned by `angle` and scaled by `scale` about `center`. */
export function transformed_point(
  point: WorldPoint,
  center: WorldPoint,
  angle: number,
  scale: number,
): WorldPoint {
  const dx = (point.x - center.x) * scale;
  const dy = (point.y - center.y) * scale;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return new Point2<"world">(
    center.x + dx * cos - dy * sin,
    center.y + dx * sin + dy * cos,
  );
}

/** `element` at its mirrored place. */
export function with_mirrored_position<
  T extends MechanicalElement | ConstraintElement,
>(element: T, axis: MirrorAxis, center: WorldPoint): T {
  if ("position" in element)
    return { ...element, position: mirrored_point(element.position, axis, center) };
  if ("positionStart" in element)
    return {
      ...element,
      positionStart: mirrored_point(element.positionStart, axis, center),
      positionEnd: mirrored_point(element.positionEnd, axis, center),
    };
  return element;
}

/** `element` with what it says about a direction of rotation turned around: a mirror reverses every one of them. */
export function with_mirrored_senses(
  element: MechanicalElement,
  axis: MirrorAxis,
): MechanicalElement {
  switch (element.type) {
    case "gear":
      return {
        ...element,
        angle: axis === "horizontal" ? Math.PI - element.angle : -element.angle,
      };
    case "belt":
      return {
        ...element,
        attachedGearsIDs: element.attachedGearsIDs.map((gear) => ({
          ...gear,
          clockwise: !gear.clockwise,
        })),
      };
    case "pivot":
      return element.motor
        ? { ...element, motor: { ...element.motor, speed: -element.motor.speed } }
        : element;
    default:
      return element;
  }
}

/** See `with_mirrored_senses`. */
export function with_mirrored_angle_sense<T extends ConstraintElement>(element: T): T {
  return element.type === "dimension-angle"
    ? { ...element, couterClockwise: !element.couterClockwise }
    : element;
}

/**
 * `load` as the mirror leaves it.
 * A world-frame force stays as it is: it belongs to the world, not to what it pushes on.
 * An edge frame's second axis is the edge's normal, turned by +90° from it, which the mirror reverses relative to the edge; a moment turns the other way.
 */
export function with_mirrored_load(load: LoadElement): LoadElement {
  switch (load.type) {
    case "moment":
      return { ...load, value: -load.value };
    case "force":
      return load.frame === "world"
        ? load
        : { ...load, vector: new Point2(load.vector.x, -load.vector.y) };
    case "distributed-force":
      return load.frame === "world"
        ? load
        : {
            ...load,
            direction: new Point2(load.direction.x, -load.direction.y),
          };
  }
}
