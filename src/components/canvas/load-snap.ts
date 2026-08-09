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
import {
  corridor_distance,
  SNAP_CORRIDOR,
  SNAP_DEAD_RADIUS,
  SNAP_SEPARATION,
} from "./snap-corridor";

// ─── Direction ──────────────────────────────────────────────────────────────

/**
 * A direction snap, and what it landed on.
 *
 * The frame comes out of the snap rather than being read back from the angle it produced. Recognising an axis after the fact takes a tolerance, and a tolerance turns a beam half a degree off vertical into a beam whose load is stored at 89.5° from it — aimed at its normal, following it for ever a touch askew, and nothing on screen to say so.
 */
export interface DirectionSnap {
  vector: ScreenPoint;
  frame: LoadFrame;
}

/**
 * The four rays an edge offers: its axial direction and its normal, both ways.
 *
 * Measured on screen and not in world, because the y flip of `world2screen` turns a beam at θ into one drawn at −θ — comparing a drawn direction to a world angle silently aims every oblique beam the wrong way.
 */
function edge_axis_rays(
  edge: EdgeElement,
  viewport: ViewportState,
): ScreenPoint[] {
  const beamAngle = world2screen(edge.positionEnd, viewport)
    .sub(world2screen(edge.positionStart, viewport))
    .angle();
  return [0, 1, 2, 3].map((k) =>
    Point2.from_polar(1, beamAngle + (k * Math.PI) / 2).as_space<"screen">(),
  );
}

/**
 * Every direction a load is worth aiming at, **edges first**.
 *
 * An edge outranks the world: a load pulled along a beam follows that beam, whichever way it happens to lie. Order is what carries that rule — where two rays are within `SNAP_SEPARATION` of each other the first wins, so a beam all but vertical keeps its own ray, and the load lands on exactly a quarter turn from it rather than on the world's vertical a hair away.
 */
function snap_candidates(
  edges: EdgeElement[],
  viewport: ViewportState,
): { ray: ScreenPoint; frame: LoadFrame }[] {
  const candidates: { ray: ScreenPoint; frame: LoadFrame }[] = [];
  for (const edge of edges)
    for (const ray of edge_axis_rays(edge, viewport))
      candidates.push({ ray, frame: { mode: "edge", edgeID: edge.id } });
  for (const k of [0, 1, 2, 3])
    candidates.push({
      ray: Point2.from_polar(1, (k * Math.PI) / 2).as_space<"screen">(),
      frame: "world",
    });
  return candidates;
}

/**
 * Aim a screen-space load direction at the nearest ray worth landing on, magnitude preserved: the world axes, plus each given edge's axial and normal directions.
 *
 * Answers `"world"` and the untouched vector when nothing is near enough — an unaimed load belongs to no beam.
 */
export function snap_direction(
  vector: ScreenPoint,
  edges: EdgeElement[],
  viewport: ViewportState,
): DirectionSnap {
  const len = vector.length();
  if (len < SNAP_DEAD_RADIUS) return { vector, frame: "world" };

  let best: { ray: ScreenPoint; frame: LoadFrame } | undefined;
  let bestDistance = Infinity;
  for (const candidate of snap_candidates(edges, viewport)) {
    const distance = corridor_distance(vector, candidate.ray);
    if (distance >= bestDistance - SNAP_SEPARATION) continue;
    bestDistance = distance;
    best = candidate;
  }
  if (!best || bestDistance > SNAP_CORRIDOR) return { vector, frame: "world" };
  return { vector: best.ray.mul(len), frame: best.frame };
}

/**
 * The frame a drag lands in, for the commit that has to store it.
 *
 * The same snap the preview ran, on the vector that snap produced: the drag already lies on the retained ray, so it wins its own lane again and the frame comes back exactly.
 */
export function frame_from_drag(
  screenVec: ScreenPoint,
  edges: EdgeElement[],
  viewport: ViewportState,
): LoadFrame {
  return snap_direction(screenVec, edges, viewport).frame;
}

// ─── Gestures ───────────────────────────────────────────────────────────────

/** An arrow from `base`: aim it, then pull its length onto a round value. */
function snap_arrow(
  position: ScreenPoint,
  base: ScreenPoint,
  edges: EdgeElement[],
  viewport: ViewportState,
): ScreenPoint {
  const { vector } = snap_direction(position.sub(base), edges, viewport);
  const value = screen2stored_load(vector.length());
  return base.add(
    vector.with_length(stored2screen_load(nearest_round_load_value(value))),
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
