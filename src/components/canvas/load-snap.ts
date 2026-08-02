/**
 * Visual snapping for loads. Applied in MechanicalCanvas on the hovered
 * position, so the placement/drag preview visibly snaps, like the grid does.
 *
 * Everything here works in screen space, the space loads are drawn in.
 *
 * Two independent snaps ride on the same position:
 * - direction, so a load's aim relative to its base lands on a world axis or on
 *   a connected beam's axial/normal;
 * - length, so the drawn arrow (or arc) lands on one that reads a round value.
 *   Because the display scale is logarithmic, this is done on the drawn length
 *   and not on the value: the tolerance stays a constant number of pixels
 *   whatever the magnitude, exactly like every other snap in the canvas.
 */

import type { CanvasState } from "../../types/canvas-state";
import type {
  DistributedForceElement,
  EdgeElement,
  ForceElement,
  LoadElement,
  LoadFrame,
  MechanicalElement,
  MomentElement,
  ScreenPoint,
  ViewportState,
} from "../../types";
import { names_element } from "../../types/hovered-part";
import { Point2 } from "../../types/point2";
import { HIT_TOLERANCE } from "../../constants/rendering-specs";
import {
  as_edge,
  force_snap_edges,
  frame2world_transform,
} from "../../utils/load-frame";
import {
  distributed_grab_length,
  distributed_grab_magnitude,
  distributed_tip_length,
  distributed_tip_magnitude,
  is_zero_load,
  nearest_round_load_value,
  screen2stored_load,
  screen2stored_moment,
  stored2screen_load,
  stored2screen_moment,
} from "../../utils/load-scale";
import { moment_center_position } from "../../utils/load-geom";
import { world2screen, world2screen_vec } from "../../utils";

// ─── Direction ──────────────────────────────────────────────────────────────

/** Smallest signed difference between two angles, wrapped to (-π, π]. */
function angle_diff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d <= -Math.PI) d += 2 * Math.PI;
  return d;
}

const SNAP_TOLERANCE_RAD = (8 * Math.PI) / 180;
/** Tolerance to recognise an already-snapped direction as an edge/world axis. */
const SNAP_MATCH_RAD = (1 * Math.PI) / 180;

/**
 * The four screen angles an edge offers: its axial direction and its normal,
 * both ways. Measured on screen and not in world, because the y flip of
 * `world2screen` turns a beam at θ into one drawn at −θ — comparing a drawn
 * direction to a world angle silently aims every oblique beam the wrong way.
 */
function edge_axis_angles(
  edge: EdgeElement,
  viewport: ViewportState,
): number[] {
  const beamAngle = world2screen(edge.positionEnd, viewport)
    .sub(world2screen(edge.positionStart, viewport))
    .angle();
  return [0, 1, 2, 3].map((k) => beamAngle + (k * Math.PI) / 2);
}

/**
 * Reference frame implied by an (already snapped) screen direction: the edge
 * whose axial/normal it lies on, or "world". An edge takes priority, so a
 * direction that is both world-aligned and edge-aligned references the edge — a
 * load aimed along a beam follows it, whichever way that beam happens to lie.
 */
export function frame_from_snapped_direction(
  screenVec: ScreenPoint,
  edges: EdgeElement[],
  viewport: ViewportState,
): LoadFrame {
  if (screenVec.length() < 1e-6) return "world";
  const angle = screenVec.angle();
  for (const edge of edges)
    for (const candidate of edge_axis_angles(edge, viewport))
      if (Math.abs(angle_diff(angle, candidate)) < SNAP_MATCH_RAD)
        return { mode: "edge", edgeID: edge.id };
  return "world";
}

/**
 * World axes (H/V) plus each edge's axial and normal directions, as angles.
 *
 * A candidate landing within `SNAP_MATCH_RAD` of one already kept is dropped:
 * an edge lying all but along a world axis would otherwise offer two targets a
 * fraction of a degree apart, which the direction flips between from one pixel
 * to the next. World axes come first, so they are the ones that survive.
 */
function snap_candidate_angles(
  edges: EdgeElement[],
  viewport: ViewportState,
): number[] {
  const candidates = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
  for (const edge of edges) {
    for (const candidate of edge_axis_angles(edge, viewport)) {
      if (
        candidates.some(
          (kept) => Math.abs(angle_diff(candidate, kept)) < SNAP_MATCH_RAD,
        )
      )
        continue;
      candidates.push(candidate);
    }
  }
  return candidates;
}

/**
 * Snap a screen-space load direction to the nearest meaningful axis (magnitude preserved)
 * The world horizontal/vertical axes, plus each given edge's axial and normal directions.
 * Returns the vector unchanged when no candidate is within tolerance.
 */
export function snap_direction(
  vector: ScreenPoint,
  edges: EdgeElement[],
  viewport: ViewportState,
): ScreenPoint {
  const len = vector.length();
  if (len < 1e-6) return vector;

  const angle = vector.angle();
  let best = angle;
  let bestDiff = SNAP_TOLERANCE_RAD;
  for (const c of snap_candidate_angles(edges, viewport)) {
    const diff = Math.abs(angle_diff(angle, c));
    if (diff < bestDiff) {
      bestDiff = diff;
      best = c;
    }
  }
  return best === angle ? vector : Point2.from_polar(len, best);
}

// ─── Gestures ───────────────────────────────────────────────────────────────

/** An arrow from `base`: aim it, then pull its length onto a round value. */
function snap_arrow(
  position: ScreenPoint,
  base: ScreenPoint,
  edges: EdgeElement[],
  viewport: ViewportState,
): ScreenPoint {
  const aimed = snap_direction(position.sub(base), edges, viewport);
  const value = screen2stored_load(aimed.length());
  return base.add(
    aimed.with_length(stored2screen_load(nearest_round_load_value(value))),
  );
}

/** A moment's arc: only its radius carries a value, its aim carries nothing. */
function snap_arc(position: ScreenPoint, center: ScreenPoint): ScreenPoint {
  const radius = position.sub(center);
  const length = radius.length();
  const snapped = stored2screen_moment(
    nearest_round_load_value(screen2stored_moment(length)),
  );
  return center.add(radius.mul(snapped / length));
}

/**
 * A handle that only slides along `direction`: snap the projection that sets
 * the magnitude, and shift the position by just that much so the rest of the
 * cursor's offset — which the drag ignores anyway — is left alone.
 *
 * `rungs` holds the drawn lengths worth snapping to, **most meaningful first**.
 * A rung landing within `HIT_TOLERANCE.SNAP / 2` of one already kept is dropped:
 * the round-value ladder is multiplicative, so towards zero it piles up rungs
 * that end up a fraction of a pixel apart once the load's gain is applied
 * (with a peak of 300 N/m, the rungs at 1 and 2 sit half a pixel from zero).
 * A mouse cannot tell those apart, so only the rung carrying the most meaning
 * survives — which is how zero wins over "1" next to an end at 300.
 */
function snap_along(
  position: ScreenPoint,
  base: ScreenPoint,
  direction: ScreenPoint,
  rungs_of: (projection: number) => number[],
): ScreenPoint {
  const projection = position.sub(base).dot(direction);
  const kept: number[] = [];
  let target = projection;
  let bestDistance: number = HIT_TOLERANCE.SNAP;
  for (const rung of rungs_of(projection)) {
    if (kept.some((k) => Math.abs(k - rung) < HIT_TOLERANCE.SNAP / 2)) continue;
    kept.push(rung);
    const distance = Math.abs(rung - projection);
    if (distance < bestDistance) {
      bestDistance = distance;
      target = rung;
    }
  }
  return position.add(direction.mul(target - projection));
}

// ─── Distributed load rungs ─────────────────────────────────────────────────

/**
 * Drawn lengths one tip of a distributed load is worth snapping to, `other`
 * holding the magnitude at the opposite end.
 *
 * Three configurations the round-value ladder never reaches outrank it: zero
 * (the triangular load), matching the opposite end (the uniform one) and its
 * negative (the antisymmetric one, crossing the beam at mid-span). None exists
 * if that end carries nothing.
 */
function distributed_tip_rungs(projection: number, other: number): number[] {
  const magnitude = distributed_tip_magnitude(projection, other);
  const rungs: number[] = [];
  if (!is_zero_load(other))
    rungs.push(
      0,
      distributed_tip_length(other, other),
      distributed_tip_length(-other, other),
    );
  rungs.push(
    distributed_tip_length(nearest_round_load_value(magnitude), other),
  );
  return rungs;
}

/**
 * Drawn lengths the body bar of a distributed load is worth snapping to.
 * `offsetStart` / `offsetEnd` are the grabbed point's differences to the two
 * endpoint magnitudes (see `distributed_grab_length`).
 *
 * Both ends shift together, so either of them landing on a round value is worth
 * a rung — snapping the grabbed point instead would be meaningless, its position
 * along the beam being arbitrary.
 */
function distributed_body_rungs(
  projection: number,
  offsetStart: number,
  offsetEnd: number,
): number[] {
  const magnitude = distributed_grab_magnitude(
    projection,
    offsetStart,
    offsetEnd,
  );
  const length_of = (end: number, offset: number) =>
    distributed_grab_length(end - offset, offsetStart, offsetEnd);
  const offsets = [offsetStart, offsetEnd];
  // The two configurations below annul something, so both need the load to have
  // a taper: on a uniform one they would take its two ends to zero at once and
  // snap the whole load away to nothing.
  const tapered = !is_zero_load(offsetEnd - offsetStart);
  // Zeroing an end comes first: it is what makes the load triangular, the
  // round-value ladder never reaches it, and next to a big opposite end it is
  // the only rung down there that means anything.
  const zeros = tapered ? offsets.map((offset) => length_of(0, offset)) : [];
  // Then the load centred on its beam (q at one end, -q at the other), whose
  // crest line crosses at mid-span.
  const antisymmetric = tapered
    ? [
        distributed_grab_length(
          -(offsetStart + offsetEnd) / 2,
          offsetStart,
          offsetEnd,
        ),
      ]
    : [];
  const rounds = offsets.map((offset) =>
    length_of(nearest_round_load_value(magnitude + offset), offset),
  );
  return [...zeros, ...antisymmetric, ...rounds];
}

// ─── Entry point ────────────────────────────────────────────────────────────

/**
 * Return `position` snapped for load placement/drag states; in screen space.
 */
export function snap_load_hover(
  position: ScreenPoint,
  state: CanvasState,
  mechanicalElements: MechanicalElement[],
  loadElements: LoadElement[],
  viewport: ViewportState,
): ScreenPoint {
  const find_edge = (id: string | undefined) =>
    as_edge(mechanicalElements.find((e) => e.id === id));

  switch (state.type) {
    case "PlacingForceEnd": {
      const startHover = state.startHover;
      if (!names_element(startHover)) return position;
      const anchor =
        startHover.type === "Edge" && startHover.part !== "body"
          ? startHover.part
          : undefined;
      return snap_arrow(
        position,
        world2screen(startHover.position, viewport),
        force_snap_edges(startHover.id, anchor, mechanicalElements),
        viewport,
      );
    }
    case "PlacingDistributedForce": {
      const startHover = state.startHover;
      if (!names_element(startHover)) return position;
      const beam = find_edge(startHover.id);
      if (!beam) return position;
      return snap_arrow(
        position,
        world2screen(beam.positionStart.lerp(beam.positionEnd, 0.5), viewport),
        [beam],
        viewport,
      );
    }
    case "MovingForce": {
      const force = loadElements.find((l) => l.id === state.elementID) as
        ForceElement | undefined;
      if (!force) return position;
      const target = mechanicalElements.find((e) => e.id === force.targetID);
      if (!target) return position;
      const base =
        "position" in target
          ? target.position
          : force.anchor === "start"
            ? target.positionStart
            : target.positionEnd;
      return snap_arrow(
        position,
        world2screen(base, viewport),
        force_snap_edges(force.targetID, force.anchor, mechanicalElements),
        viewport,
      );
    }
    case "MovingDistributedForce": {
      const load = loadElements.find((l) => l.id === state.elementID) as
        DistributedForceElement | undefined;
      if (!load) return position;
      const beam = find_edge(load.targetID);
      if (!beam) return position;
      // No handle aims the load any more, so all three are the same gesture:
      // slide along the direction, and pull the length onto one that reads a
      // round value. Only the length↔value mapping differs.
      const direction = world2screen_vec(
        frame2world_transform(load.direction, load.frame, mechanicalElements),
        viewport,
      ).normalize();
      if (state.part === "body") {
        const grabbed =
          load.magnitudeStart +
          (load.magnitudeEnd - load.magnitudeStart) * state.grabT;
        const offsetStart = load.magnitudeStart - grabbed;
        const offsetEnd = load.magnitudeEnd - grabbed;
        return snap_along(
          position,
          world2screen(
            beam.positionStart.lerp(beam.positionEnd, state.grabT),
            viewport,
          ),
          direction,
          (projection) =>
            distributed_body_rungs(projection, offsetStart, offsetEnd),
        );
      }
      const isStart = state.part === "start";
      const other = isStart ? load.magnitudeEnd : load.magnitudeStart;
      return snap_along(
        position,
        world2screen(isStart ? beam.positionStart : beam.positionEnd, viewport),
        direction,
        (projection) => distributed_tip_rungs(projection, other),
      );
    }
    case "PlacingMomentEnd": {
      if (state.startHover.type === "Void") return position;
      return snap_arc(
        position,
        world2screen(state.startHover.position, viewport),
      );
    }
    case "MovingMoment": {
      const moment = loadElements.find((l) => l.id === state.elementID) as
        MomentElement | undefined;
      if (!moment) return position;
      return snap_arc(
        position,
        world2screen(
          moment_center_position(moment, mechanicalElements),
          viewport,
        ),
      );
    }
  }
  return position;
}
