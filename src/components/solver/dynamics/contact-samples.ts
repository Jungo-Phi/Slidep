import { Point2 } from "../../../types";
import type { ContactSample, SnapshotLayout } from "../../../types/runtime-state";
import { CollisionCandidates, FLOOR_ANCHOR_KEY } from "./collision-candidates";
import { contact_eps, floor_signed_distance, point_segment_within, within } from "./collision-detection";
import { CONTACT_SLACK_RATIO } from "./collision-restitution";
import { MIN_EXTENT_M } from "../nodes";

/**
 * Adds to `into` every candidate touching in `positions`, by the measure restitution judges a contact by: within `CONTACT_SLACK_RATIO` of its resting boundary.
 * A contact already in `into` is left as it is, so calling this after each solved step gathers everything that touched over them.
 *
 * `near`, when given, is a solve's own judgement of which contacts could be touching, in `contact_set`'s order for the same switches: only those are measured.
 */
export function collect_touching_contacts(
  candidates: CollisionCandidates,
  positions: Map<string, Point2>,
  extent: number,
  collisionsOn: boolean,
  floorOn: boolean,
  floorNormal: Point2,
  layout: SnapshotLayout,
  into: Map<number, ContactSample>,
  near?: Uint8Array | null,
): void {
  const eps = contact_eps(extent);
  const slack = CONTACT_SLACK_RATIO * (extent || MIN_EXTENT_M);
  // A fused key writes to one slot per part, and any of them reads its position back.
  const slot = (key: string) => layout.index.get(key.split(",")[0]);

  const { pointSegment, pointCircle, circleSegment, circleCircle, pointFloor, circleFloor } = candidates;
  const collisionCount = pointSegment.length + pointCircle.length + circleSegment.length + circleCircle.length;
  const judgedCount = (collisionsOn ? collisionCount : 0) + (floorOn ? pointFloor.length + circleFloor.length : 0);
  const judged = near && near.length === judgedCount ? near : null;
  let at = -1;
  const measured = () => {
    at++;
    return !judged || judged[at] !== 0;
  };

  // The id is the rank across every family whichever switches are on, so toggling one between two steps never gives a contact another's id.
  let id = 0;
  const segment = (pointKey: string, key1: string, key2: string, boundary: number) => {
    const rank = id++;
    if (!measured() || into.has(rank)) return;
    const p = positions.get(pointKey);
    const s1 = positions.get(key1);
    const s2 = positions.get(key2);
    if (!p || !s1 || !s2 || !point_segment_within(p.x, p.y, s1.x, s1.y, s2.x, s2.y, boundary + slack)) return;
    const point = slot(pointKey);
    const start = slot(key1);
    const end = slot(key2);
    if (point !== undefined && start !== undefined && end !== undefined)
      into.set(rank, { id: rank, kind: "segment", point, start, end });
  };
  const circle = (centreKey: string, otherKey: string, radius: number, boundary: number) => {
    const rank = id++;
    if (!measured() || into.has(rank)) return;
    const c = positions.get(centreKey);
    const o = positions.get(otherKey);
    if (!c || !o || !within(o.x, o.y, c.x, c.y, boundary + slack)) return;
    const centre = slot(centreKey);
    const other = slot(otherKey);
    if (centre !== undefined && other !== undefined)
      into.set(rank, { id: rank, kind: "circle", centre, other, radius });
  };
  const floor = (pointKey: string, boundary: number) => {
    const rank = id++;
    if (!measured() || into.has(rank)) return;
    const p = positions.get(pointKey);
    const a = positions.get(FLOOR_ANCHOR_KEY);
    if (!p || !a || floor_signed_distance(p.x, p.y, a, floorNormal) >= boundary + slack) return;
    const point = slot(pointKey);
    const anchor = slot(FLOOR_ANCHOR_KEY);
    if (point !== undefined && anchor !== undefined)
      into.set(rank, { id: rank, kind: "floor", point, anchor, nx: floorNormal.x, ny: floorNormal.y });
  };

  if (collisionsOn) {
    for (const c of pointSegment) segment(c.pointKey, c.segKey1, c.segKey2, eps);
    for (const c of pointCircle) circle(c.centerKey, c.pointKey, c.radius, c.radius + eps);
    for (const c of circleSegment) segment(c.centerKey, c.segKey1, c.segKey2, c.radius + eps);
    for (const c of circleCircle) circle(c.key1, c.key2, c.radius1, c.radius1 + c.radius2 + eps);
  } else id += collisionCount;

  if (floorOn) {
    for (const c of pointFloor) floor(c.pointKey, eps);
    for (const c of circleFloor) floor(c.centerKey, c.radius + eps);
  }
}
