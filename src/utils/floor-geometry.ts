import { FloorConfig, WorldPoint } from "../types/mechanism";
import { Point2 } from "../types/point2";

/**
 * A point on the floor's line and the unit normal pointing into free space (away from the floor), both in world space.
 * The line always passes through `(0, height)` — angle rotates it around that fixed point on the y-axis, rather than around the world origin, so the height handle stays where it was dragged to as the angle changes.
 */
export function floor_anchor_and_normal(floor: FloorConfig): {
  anchor: WorldPoint;
  normal: WorldPoint;
} {
  return {
    anchor: new Point2(0, floor.height),
    normal: new Point2(0, 1).rotate(floor.angle),
  };
}

/**
 * `angle` folded onto the line's own period: a floor is a line, not a ray, so leaning it past 90° reads as the same line leaning the other way, not as an ever-growing angle.
 * Returned in `(-π/2, π/2]`, signed — the magnitude is what to show against the horizontal, the sign which way it leans.
 * `angle` is assumed already in `(-π, π]`, true of every value `atan2` (the only place `floor.angle` is set) can produce.
 */
export function floor_acute_angle(angle: number): number {
  if (angle > Math.PI / 2) return angle - Math.PI;
  if (angle <= -Math.PI / 2) return angle + Math.PI;
  return angle;
}

/**
 * The inverse of `floor_acute_angle`: rebuilds a raw `floor.angle` from a new acute reading, keeping whichever side `oldRawAngle` had the floor's normal facing (flipped upside down or not) — the one bit `floor_acute_angle` throws away by folding.
 * Editing the acute angle shown on screen must not silently flip the floor over.
 */
export function floor_raw_angle_from_acute(
  newAcuteAngle: number,
  oldRawAngle: number,
): number {
  const offset = oldRawAngle - floor_acute_angle(oldRawAngle);
  const raw = newAcuteAngle + offset;
  return Math.atan2(Math.sin(raw), Math.cos(raw));
}
