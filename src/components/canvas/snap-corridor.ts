/**
 * The corridor a directional snap works in.
 *
 * A candidate direction is retained when the cursor falls inside a lane of constant width around the ray it defines — a distance across the ray, in screen px, never an angle.
 * An angular tolerance would widen the catch linearly with the length of the drag: the further one pulls, the more it would grab, when what the eye judges is how far the point sits from the line.
 */

import type { ScreenPoint, WorldPoint } from "../../types";
import { Point2 } from "../../types/point2";
import { HIT_TOLERANCE } from "../../constants/rendering-specs";

/** A construction line a snap is holding a point on: the anchor it is measured from, and the way it runs. */
export interface SnapGuide {
  anchor: WorldPoint;
  direction: WorldPoint;
}

/**
 * What a snap took hold of, so the drawing can show it.
 *
 * Everything here comes **out of** the snap and is never read back from the position it produced. A point pulled onto the grid alone lands on a round direction often enough by coincidence — the grid is made of them — and feedback derived from the result would claim holds the snap never had.
 */
export interface SnapFeedback {
  /** Construction lines the point is held on. Two of them when it sits on their crossing. */
  guides: SnapGuide[];
  /** World coordinates of the grid lines it landed on, one per axis. */
  gridX?: number;
  gridY?: number;
  /** The stand-off of a dimension has landed on its ladder — shown by putting the dimension itself in relief, its rungs being invisible. */
  distanceSnapped?: boolean;
}

/** A snap that took hold of nothing. */
export const NO_FEEDBACK: SnapFeedback = { guides: [] };

/** What the user has asked of the snapping, from the settings menu. */
export interface SnapSettings {
  /** Degrees between the round directions a gesture may aim at. */
  angleStep: number;
  /** Whether the menu shows `angleStep` via the preset dropdown or the free-form field — kept apart from the value itself so typing a custom angle that happens to match a preset doesn't flip the menu back. Absent on settings saved before this field existed; treat as `"preset"` then. */
  angleStepIsCustom?: boolean;
  /** Bring forward the grid line a point landed on, and mark the middle it was centred on. */
  highlightSnap: boolean;
  /** Draw the construction line a round direction is holding a point on. */
  showAngleGuides: boolean;
}

/** The angle steps the menu offers, the first being the one a drawing starts on. */
export const ANGLE_STEPS = [15, 22.5, 30, 45, 90];

/** Where "custom" starts. Deliberately outside `ANGLE_STEPS`, so choosing it reveals the field meant to change it. */
export const CUSTOM_ANGLE_STEP = 36;

export const DEFAULT_SNAP_SETTINGS: SnapSettings = {
  angleStep: ANGLE_STEPS[3],
  highlightSnap: true,
  showAngleGuides: true,
};

/**
 * The round directions a step offers, as a count of evenly spaced rays.
 *
 * Kept even so no two rays end up closer together than the rest: a step that does not divide a turn — 7°, say — is honoured as the nearest count that does rather than left with a short gap where it wraps.
 */
export function angle_ray_count(step: number): number {
  return Math.max(2, Math.round(360 / Math.min(180, Math.max(1, step))));
}

/** Half-width of the lane, in screen px. The tolerance the grid snap answers to, so that one hand feels one thing. */
export const SNAP_CORRIDOR = HIT_TOLERANCE.SNAP;

/**
 * How short a drag is to leave unaimed.
 *
 * Every ray passes through the origin, so near it they all lie inside each other's lane and the retained one would be decided by nothing at all. The snap only starts once the drag says something about direction.
 */
export const SNAP_DEAD_RADIUS = 15;

/**
 * Two rays closer than this, where the cursor is, are one target.
 *
 * A beam half a degree off vertical offers a ray that close to the world's own; without a margin, the retained one would flip from one pixel to the next, and with it the direction that gets stored. The margin makes it a tie, which the order of the candidates then settles.
 */
export const SNAP_SEPARATION = 1;

/**
 * Distance from the tip of `drag` to the ray carried by `unitRay`, across it.
 *
 * `Infinity` for a ray pointing the other way: the two directions of one axis are separate candidates, and without this a drag would snap onto the ray facing away from it, which is the same lane seen from behind.
 */
export function corridor_distance(
  drag: ScreenPoint,
  unitRay: ScreenPoint,
): number {
  if (drag.dot(unitRay) <= 0) return Infinity;
  return Math.abs(drag.cross(unitRay));
}

/**
 * The one of `rays` evenly spaced directions that `drag` lies along, or nothing when it lies along none.
 *
 * `undefined` for a drag shorter than the dead radius as well: every ray passes through the origin, so near it they all lie inside each other's lane and the one retained would be decided by nothing at all.
 */
export function best_ladder_ray(
  drag: ScreenPoint,
  rays: number,
): { ray: ScreenPoint; distance: number } | undefined {
  if (drag.length() < SNAP_DEAD_RADIUS) return undefined;
  let best: ScreenPoint | undefined;
  let distance = Infinity;
  for (let k = 0; k < rays; k++) {
    const ray = Point2.from_polar(
      1,
      (k * 2 * Math.PI) / rays,
    ).as_space<"screen">();
    const reach = corridor_distance(drag, ray);
    if (reach >= distance - SNAP_SEPARATION) continue;
    distance = reach;
    best = ray;
  }
  return best && distance <= SNAP_CORRIDOR
    ? { ray: best, distance }
    : undefined;
}
