import { Point2 } from "../../../types";
import { CollisionCandidates, FLOOR_ANCHOR_KEY } from "./collision-candidates";
import { contact_eps } from "./collision-detection";
import { MIN_EXTENT_M } from "../nodes";

/**
 * Dynamic mode only: a collision constraint already gets a physically plausible (if fully inelastic) velocity response for free — XPBD reads velocity back as `(solved − frameStart)/dt`, so a node a contact stopped cold simply moved little in the blocked direction.
 * Restitution replaces that "little" with `-e × incoming velocity` (`e` = 0 keeps today's inelastic behaviour, `e` = 1 an elastic bounce) for whichever contacts actually fired this frame — found by checking the SOLVED geometry against each candidate's own resting boundary, since nothing in the position solve records which constraint did work.
 *
 * Point-vs-segment contacts (a node or a gear against a beam) redistribute the impulse across the segment's two endpoints the same `t`/`1−t`, mass-weighted way `applyPointSegmentContactConstraint`'s position correction already does — physically the same operation, an impulse instead of a displacement, so the weighting has to match.
 */

/**
 * Beyond a contact's resting boundary, still close enough to have been the one the solve just settled — the position solve converges TO the boundary, never past it, so this is slack for float error and Gauss-Seidel's own residual, not a second contact margin.
 *
 * A ratio of the mechanism's own extent, same reasoning as `CONTACT_EPS_RATIO` in `collision-detection.ts` — 1e-3 is the 1 mm this was tuned at, at the roughly metre-scale mechanisms it was tuned on.
 */
const CONTACT_SLACK_RATIO = 1e-3;

/** J — kinetic energy a contact removes when it turns a closing speed `relBefore` into a rebound at `restitution` times that speed; `denom` is the contact's inverse effective mass. */
function bounce_loss(denom: number, restitution: number, relBefore: number): number {
  return (0.5 * (1 - restitution * restitution) * relBefore * relBefore) / denom;
}

function velocity_of(map: Map<string, Point2>, key: string): Point2 {
  return map.get(key) ?? new Point2(0, 0);
}

/** Reflects the relative normal velocity of two point-like contacts (`keyA` vs `keyB`,
 * resting `boundary` apart) — shared by point-circle and circle-circle, both already plain point pairs once their radii are folded into `boundary`. */
function reflect_point_point(
  keyA: string,
  keyB: string,
  boundary: number,
  slack: number,
  positions: Map<string, Point2>,
  posMasses: Map<string, number>,
  before: Map<string, Point2>,
  after: Map<string, Point2>,
  restitution: number,
): number {
  const pA = positions.get(keyA);
  const pB = positions.get(keyB);
  if (!pA || !pB) return 0;
  const delta = pA.sub(pB);
  const dist = delta.length();
  if (dist > boundary + slack) return 0; // not in contact this frame
  const n = dist > 1e-9 ? delta.mul(1 / dist) : new Point2(0, 1);

  const wA = posMasses.get(keyA) ?? 1;
  const wB = posMasses.get(keyB) ?? 1;
  const denom = wA + wB;
  if (denom <= 0) return 0; // both anchored: nothing to correct

  const relBefore = velocity_of(before, keyA).sub(velocity_of(before, keyB)).dot(n);
  if (relBefore >= 0) return 0; // separating or resting already: no bounce to add

  const vA1 = velocity_of(after, keyA);
  const vB1 = velocity_of(after, keyB);
  const relAfter = vA1.sub(vB1).dot(n);
  const impulse = (-restitution * relBefore - relAfter) / denom;

  after.set(keyA, vA1.add(n.mul(impulse * wA)));
  after.set(keyB, vB1.sub(n.mul(impulse * wB)));
  return bounce_loss(denom, restitution, relBefore);
}

/** Same idea against a segment (`segKey1`-`segKey2`) instead of a second point: the contact
 * point on the segment is `lerp(seg1, seg2, t)`, and the impulse is redistributed across both ends weighted by `(1−t)`/`t` and their own masses — `applyPointSegmentContactConstraint` redistributes its position correction the identical way. */
function reflect_point_segment(
  pointKey: string,
  segKey1: string,
  segKey2: string,
  boundary: number,
  slack: number,
  positions: Map<string, Point2>,
  posMasses: Map<string, number>,
  before: Map<string, Point2>,
  after: Map<string, Point2>,
  restitution: number,
): number {
  const p = positions.get(pointKey);
  const s1 = positions.get(segKey1);
  const s2 = positions.get(segKey2);
  if (!p || !s1 || !s2) return 0;
  const d = s2.sub(s1);
  const lenSq = d.length_squared();
  if (lenSq === 0) return 0;
  const t = Math.max(0, Math.min(1, p.sub(s1).dot(d) / lenSq));
  const foot = s1.add(d.mul(t));
  const toPoint = p.sub(foot);
  const dist = toPoint.length();
  if (dist > boundary + slack) return 0; // not in contact this frame
  const n = dist > 1e-9 ? toPoint.mul(1 / dist) : d.perp().normalize();

  const wP = posMasses.get(pointKey) ?? 1;
  const wS1 = posMasses.get(segKey1) ?? 1;
  const wS2 = posMasses.get(segKey2) ?? 1;
  const a = 1 - t;
  const denom = wP + wS1 * a * a + wS2 * t * t;
  if (denom <= 0) return 0; // point and the span it landed on are both anchored

  const vSegBefore = velocity_of(before, segKey1)
    .mul(a)
    .add(velocity_of(before, segKey2).mul(t));
  const relBefore = velocity_of(before, pointKey).sub(vSegBefore).dot(n);
  if (relBefore >= 0) return 0; // separating or resting already: no bounce to add

  const vP1 = velocity_of(after, pointKey);
  const vS11 = velocity_of(after, segKey1);
  const vS21 = velocity_of(after, segKey2);
  const relAfter = vP1.sub(vS11.mul(a).add(vS21.mul(t))).dot(n);
  const impulse = (-restitution * relBefore - relAfter) / denom;

  after.set(pointKey, vP1.add(n.mul(impulse * wP)));
  after.set(segKey1, vS11.sub(n.mul(impulse * wS1 * a)));
  after.set(segKey2, vS21.sub(n.mul(impulse * wS2 * t)));
  return bounce_loss(denom, restitution, relBefore);
}

/** Same idea against the floor's line: `normal` is fixed rather than read off the geometry
 * (an infinite line has the same direction everywhere), so unlike `reflect_point_segment` there is no `t` to redistribute across — only the point and the anchor (`invMass = 0`, so `wAnchor` zeroes its own share below) share the impulse. */
function reflect_point_line(
  pointKey: string,
  anchorKey: string,
  normal: Point2,
  boundary: number,
  slack: number,
  positions: Map<string, Point2>,
  posMasses: Map<string, number>,
  before: Map<string, Point2>,
  after: Map<string, Point2>,
  restitution: number,
): number {
  const p = positions.get(pointKey);
  const anchor = positions.get(anchorKey);
  if (!p || !anchor) return 0;
  const dist = p.sub(anchor).dot(normal);
  if (dist > boundary + slack) return 0; // not in contact this frame

  const wP = posMasses.get(pointKey) ?? 1;
  const wAnchor = posMasses.get(anchorKey) ?? 1;
  const denom = wP + wAnchor;
  if (denom <= 0) return 0; // both anchored: nothing to correct

  const relBefore = velocity_of(before, pointKey)
    .sub(velocity_of(before, anchorKey))
    .dot(normal);
  if (relBefore >= 0) return 0; // separating or resting already: no bounce to add

  const vP1 = velocity_of(after, pointKey);
  const vAnchor1 = velocity_of(after, anchorKey);
  const relAfter = vP1.sub(vAnchor1).dot(normal);
  const impulse = (-restitution * relBefore - relAfter) / denom;

  after.set(pointKey, vP1.add(normal.mul(impulse * wP)));
  after.set(anchorKey, vAnchor1.sub(normal.mul(impulse * wAnchor)));
  return bounce_loss(denom, restitution, relBefore);
}

/**
 * Applies restitution to every candidate that actually resolved into contact this frame.
 * Returns the kinetic energy (J) the bounces removed, so an energy balance can charge it to the collisions.
 * `positions` is the SOLVED (post-solve) state; `before` the velocities the frame started with (snapshot it before calling the solver — it mutates `velocities` in place into what becomes `after`); `after` is mutated further, in place, with the bounced result.
 */
export function apply_collision_restitution(
  candidates: CollisionCandidates,
  positions: Map<string, Point2>,
  posMasses: Map<string, number>,
  before: Map<string, Point2>,
  after: Map<string, Point2>,
  restitution: number,
  extent: number,
  collisionsOn: boolean,
  floorOn: boolean,
  floorNormal: Point2,
): number {
  if (restitution <= 0) return 0; // fully inelastic: XPBD's own readback already gives that
  let lost = 0;
  const eps = contact_eps(extent);
  const slack = CONTACT_SLACK_RATIO * (extent || MIN_EXTENT_M);

  if (collisionsOn) {
    for (const c of candidates.pointSegment)
      lost += reflect_point_segment(
        c.pointKey, c.segKey1, c.segKey2, eps, slack,
        positions, posMasses, before, after, restitution,
      );
    for (const c of candidates.pointCircle)
      lost += reflect_point_point(
        c.pointKey, c.centerKey, c.radius + eps, slack,
        positions, posMasses, before, after, restitution,
      );
    for (const c of candidates.circleSegment)
      lost += reflect_point_segment(
        c.centerKey, c.segKey1, c.segKey2, c.radius + eps, slack,
        positions, posMasses, before, after, restitution,
      );
    for (const c of candidates.circleCircle)
      lost += reflect_point_point(
        c.key1, c.key2, c.radius1 + c.radius2 + eps, slack,
        positions, posMasses, before, after, restitution,
      );
  }

  if (floorOn) {
    for (const c of candidates.pointFloor)
      lost += reflect_point_line(
        c.pointKey, FLOOR_ANCHOR_KEY, floorNormal, eps, slack,
        positions, posMasses, before, after, restitution,
      );
    for (const c of candidates.circleFloor)
      lost += reflect_point_line(
        c.centerKey, FLOOR_ANCHOR_KEY, floorNormal, c.radius + eps, slack,
        positions, posMasses, before, after, restitution,
      );
  }
  return lost;
}
