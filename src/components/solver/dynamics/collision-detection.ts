import { Link, Point2 } from "../../../types";
import { CollisionCandidates, FLOOR_ANCHOR_KEY } from "./collision-candidates";
import { MIN_EXTENT_M } from "../nodes";

/** Signed distance of `(px,py)` from the floor's line — positive on the allowed (`normal`)
 * side, the anchor read straight off `positions` (its own position, never `normal`, is what a height drag changes). */
function floor_signed_distance(
  px: number,
  py: number,
  anchor: Point2,
  normal: Point2,
): number {
  return (px - anchor.x) * normal.x + (py - anchor.y) * normal.y;
}

/**
 * Tiny numerical margin a resolved contact rests at — solver hygiene (the same reason `beltContact.detachRatio`/`reattachRatio` in `simulation-engine.ts` avoid sitting exactly at zero), never a visible or physical size.
 * A gear's own radius is the real "size" of its contact; this only pads it (and a plain point contact) against chatter at the boundary.
 *
 * A ratio of the mechanism's own extent (see `nodes_extent`/`positions_extent`), not a flat length — 5e-4 is the 0.5 mm this was tuned at, reinterpreted at the roughly metre-scale mechanisms it was tuned on.
 * A flat millimetre would drown a µm-scale mechanism (the margin bigger than the mechanism itself) while doing nothing useful on a km-scale one.
 */
export const CONTACT_EPS_RATIO = 5e-4;

/** The actual contact margin for a mechanism of the given `extent` — see `CONTACT_EPS_RATIO`. */
export function contact_eps(extent: number): number {
  return CONTACT_EPS_RATIO * (extent || MIN_EXTENT_M);
}

function within(px: number, py: number, tx: number, ty: number, boundary: number): boolean {
  const dx = px - tx;
  const dy = py - ty;
  return dx * dx + dy * dy < boundary * boundary;
}

/** Which side of `(sx,sy)-(ex,ey)`'s left normal `(px,py)` is currently on — `+1`/`-1`, the
 * same convention `applyPointSegmentContactConstraint` enforces against.
 * Exactly on the segment (or a degenerate zero-length one) reads as `+1`, matching `projectOnSegment`'s own tie-break — reproducible rather than arbitrary. */
function segment_side(
  px: number,
  py: number,
  sx: number,
  sy: number,
  ex: number,
  ey: number,
): number {
  const dx = ex - sx;
  const dy = ey - sy;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return 1;
  const nx = -dy / len;
  const ny = dx / len;
  return (px - sx) * nx + (py - sy) * ny < 0 ? -1 : 1;
}

/** Whether `(px, py)` is within `boundary` of its nearest point on segment `(sx,sy)-(ex,ey)`,
 * extremities included (clamped, never projected past them). */
function point_segment_within(
  px: number,
  py: number,
  sx: number,
  sy: number,
  ex: number,
  ey: number,
  boundary: number,
): boolean {
  const dx = ex - sx;
  const dy = ey - sy;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return within(px, py, sx, sy, boundary);
  const t = Math.max(0, Math.min(1, ((px - sx) * dx + (py - sy) * dy) / lenSq));
  return within(px, py, sx + dx * t, sy + dy * t, boundary);
}

/**
 * Candidates already violating their resting boundary in `positions` — a mechanism drawn with two unconnected parts already touching.
 * Dropped from `candidates` in place (not just flagged) so the pair is excluded for the rest of the run: per plan `swift-bouncing-kitten`, this should only ever fire for a direct junction that structural exclusion missed, which is rare enough that "ignore it once, permanently" is preferable to the bookkeeping a proper re-arm (wait for it to separate, then start enforcing) would need.
 */
export function prune_initial_penetrations(
  candidates: CollisionCandidates,
  positions: Map<string, Point2>,
  extent: number,
  floorNormal: Point2,
): CollisionCandidates {
  const eps = contact_eps(extent);
  const clear = <T>(items: T[], violated: (item: T) => boolean): T[] =>
    items.filter((item) => !violated(item));
  const floorAnchor = positions.get(FLOOR_ANCHOR_KEY);

  return {
    pointSegment: clear(candidates.pointSegment, (c) => {
      const p = positions.get(c.pointKey);
      const s1 = positions.get(c.segKey1);
      const s2 = positions.get(c.segKey2);
      return (
        !!p &&
        !!s1 &&
        !!s2 &&
        point_segment_within(p.x, p.y, s1.x, s1.y, s2.x, s2.y, eps)
      );
    }),
    pointCircle: clear(candidates.pointCircle, (c) => {
      const p = positions.get(c.pointKey);
      const ctr = positions.get(c.centerKey);
      return !!p && !!ctr && within(p.x, p.y, ctr.x, ctr.y, c.radius + eps);
    }),
    circleSegment: clear(candidates.circleSegment, (c) => {
      const ctr = positions.get(c.centerKey);
      const s1 = positions.get(c.segKey1);
      const s2 = positions.get(c.segKey2);
      return (
        !!ctr &&
        !!s1 &&
        !!s2 &&
        point_segment_within(
          ctr.x, ctr.y, s1.x, s1.y, s2.x, s2.y, c.radius + eps,
        )
      );
    }),
    circleCircle: clear(candidates.circleCircle, (c) => {
      const p1 = positions.get(c.key1);
      const p2 = positions.get(c.key2);
      return (
        !!p1 &&
        !!p2 &&
        within(p1.x, p1.y, p2.x, p2.y, c.radius1 + c.radius2 + eps)
      );
    }),
    pointFloor: clear(candidates.pointFloor, (c) => {
      const p = positions.get(c.pointKey);
      return (
        !!p &&
        !!floorAnchor &&
        floor_signed_distance(p.x, p.y, floorAnchor, floorNormal) < eps
      );
    }),
    circleFloor: clear(candidates.circleFloor, (c) => {
      const ctr = positions.get(c.centerKey);
      return (
        !!ctr &&
        !!floorAnchor &&
        floor_signed_distance(ctr.x, ctr.y, floorAnchor, floorNormal) <
          c.radius + eps
      );
    }),
  };
}

/**
 * This frame's collision links: every candidate, turned into the constraint that enforces it — `MinDistanceToSegment` for the two segment cases (a gear's radius standing in for a plain point's tiny `contact_eps`), `MinDistance` for the two circle-as-point cases, `MinDistanceToLine` for the floor.
 * Read at the same point in the frame `update_belt_disconnects` already runs at (`step_simulation`/`step_dynamic_simulation`, on the warm-started `positions`, before the solve, on last frame's `extent`) — never permanent links: they need `collisionsOn`/`floorOn` re-read every frame, exactly as gravity does.
 *
 * Every candidate, not just the ones already close: an activation radius was tried first (a cheaper sweep, most candidates skipped most frames) and it tunnels — a candidate that starts a single frame's solve outside that radius never gets its constraint at all, so nothing stops a hard pull (a fast grab drag, well within reach of a rigid arm) from swinging clean through a wall it started more than the radius away from, however large that radius was set.
 * `side` (see `segment_side`) already makes the constraint itself safe against an arbitrarily large single correction once it is IN the sweep; the fix is making sure it always is.
 * The cost is a self-gating check (a few multiplications, see `applyPointSegmentContactConstraint`/`applyMinDistanceConstraint`'s own gates) per candidate per sweep instead of only for the nearby ones — unmeasured, and the first thing to revisit if collisions turn out to cost more than the rest of the sweep on a large mechanism.
 */
type CollisionLink = Extract<
  Link,
  { type: "MinDistance" | "MinDistanceToSegment" | "MinDistanceToLine" }
>;

/**
 * `collisionsOn`/`floorOn` gate independently — a mechanism can have one without the other — which is why they are two flags rather than the single boolean the caller used to skip this whole function with: the segment/circle families below only build under `collisionsOn`, the floor families only under `floorOn`.
 */
export function collision_links(
  candidates: CollisionCandidates,
  positions: Map<string, Point2>,
  extent: number,
  collisionsOn: boolean,
  floorOn: boolean,
  floorNormal: Point2,
): CollisionLink[] {
  const links: CollisionLink[] = [];
  const eps = contact_eps(extent);

  if (collisionsOn) {
    for (const c of candidates.pointSegment) {
      const p = positions.get(c.pointKey);
      const s1 = positions.get(c.segKey1);
      const s2 = positions.get(c.segKey2);
      if (!p || !s1 || !s2) continue;
      links.push({
        type: "MinDistanceToSegment",
        ddl: 0,
        key1: c.segKey1,
        key2: c.segKey2,
        key3: c.pointKey,
        offset: eps,
        side: segment_side(p.x, p.y, s1.x, s1.y, s2.x, s2.y),
      });
    }

    for (const c of candidates.pointCircle) {
      const p = positions.get(c.pointKey);
      const ctr = positions.get(c.centerKey);
      if (!p || !ctr) continue;
      links.push({
        type: "MinDistance",
        ddl: 0,
        key1: c.pointKey,
        key2: c.centerKey,
        distance: c.radius + eps,
      });
    }

    for (const c of candidates.circleSegment) {
      const ctr = positions.get(c.centerKey);
      const s1 = positions.get(c.segKey1);
      const s2 = positions.get(c.segKey2);
      if (!ctr || !s1 || !s2) continue;
      links.push({
        type: "MinDistanceToSegment",
        ddl: 0,
        key1: c.segKey1,
        key2: c.segKey2,
        key3: c.centerKey,
        offset: c.radius + eps,
        side: segment_side(ctr.x, ctr.y, s1.x, s1.y, s2.x, s2.y),
      });
    }

    for (const c of candidates.circleCircle) {
      const p1 = positions.get(c.key1);
      const p2 = positions.get(c.key2);
      if (!p1 || !p2) continue;
      links.push({
        type: "MinDistance",
        ddl: 0,
        key1: c.key1,
        key2: c.key2,
        distance: c.radius1 + c.radius2 + eps,
      });
    }
  }

  if (floorOn) {
    for (const c of candidates.pointFloor) {
      if (!positions.has(c.pointKey)) continue;
      links.push({
        type: "MinDistanceToLine",
        ddl: 0,
        key1: FLOOR_ANCHOR_KEY,
        key3: c.pointKey,
        normal: floorNormal,
        offset: eps,
      });
    }

    for (const c of candidates.circleFloor) {
      if (!positions.has(c.centerKey)) continue;
      links.push({
        type: "MinDistanceToLine",
        ddl: 0,
        key1: FLOOR_ANCHOR_KEY,
        key3: c.centerKey,
        normal: floorNormal,
        offset: c.radius + eps,
      });
    }
  }

  return links;
}
