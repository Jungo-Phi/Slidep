/**
 * Geometry helpers for loads (forces / distributed forces).
 *
 * A load's direction is stored in its active `frame`. For `frame: "world"` the
 * stored components already are world coordinates. For `frame: { mode: "edge" }`
 * they live in the referenced edge's local frame (x = start→end axis, y = normal)
 * and must be rotated by the edge's current orientation to reach world space.
 */

import { Point2 } from "../types/point2";
import type {
  DistributedForceElement,
  EdgeElement,
  ForceElement,
  ID,
  LoadElement,
  LoadFrame,
  MechanicalElement,
  MomentElement,
  NodeElement,
} from "../types";
import { RIGHT, UP } from "../types";
import { DIM, LOAD_SCALING } from "../constants/rendering-specs";
import { get_mechanical_element_from_id } from "../components/mechanism/connect-actions";

// ─── Display scale ──────────────────────────────────────────────────────────

/**
 * Compress a load magnitude (N or N/m) to a drawn arrow length (world px).
 *
 * Only works on unsigned values !
 **/
export function stored2world_load(value: number): number {
  return Math.max(
    LOAD_SCALING.MIN_PX,
    LOAD_SCALING.MIN_PX +
      (LOAD_SCALING.PX_SCALE * Math.log(value / LOAD_SCALING.REF_VALUE + 1)) /
        Math.log(LOAD_SCALING.LOG_BASE),
  );
}

/**
 * Inverse of `force_display_length`: recover the magnitude from a drawn length.
 *
 * Only works on unsigned values !
 **/
export function world2stored_load(value: number): number {
  return Math.max(
    LOAD_SCALING.MIN_VALUE,
    LOAD_SCALING.REF_VALUE *
      (Math.pow(
        LOAD_SCALING.LOG_BASE,
        (value - LOAD_SCALING.MIN_PX) / LOAD_SCALING.PX_SCALE,
      ) -
        1),
  );
}

/**
 * Signed counterpart of `world2stored_load`, for a length measured along a
 * fixed direction: a negative length means the arrow points backwards along
 * that direction, which a load stores as a negative magnitude.
 */
export function world2stored_load_signed(length: number): number {
  const value = world2stored_load(Math.abs(length));
  return length < 0 ? -value : value;
}

/**
 * The round value nearest to `value`, on the ladder a drag snaps to: the
 * mantissas of `LOAD_SCALING.SNAP_MANTISSAS` in every decade. Nearest is
 * measured in log space, the space the display scale itself works in.
 */
export function nearest_round_load_value(value: number): number {
  const magnitude = Math.max(LOAD_SCALING.MIN_VALUE, Math.abs(value));
  const decade = Math.floor(Math.log10(magnitude));
  let best = magnitude;
  let bestDistance = Infinity;
  // The neighbouring decades matter: just under 1000, the nearest rung up is
  // the next decade's 1, not this one's 5.
  for (const exponent of [decade - 1, decade, decade + 1]) {
    for (const mantissa of LOAD_SCALING.SNAP_MANTISSAS) {
      const candidate = mantissa * Math.pow(10, exponent);
      const distance = Math.abs(Math.log(candidate / magnitude));
      if (distance < bestDistance) {
        bestDistance = distance;
        best = candidate;
      }
    }
  }
  return best;
}

/**
 * World centre a moment's arc is drawn around: the middle of an edge, or a
 * gear's centre.
 */
export function moment_center_position(
  load: MomentElement,
  mechanicalElements: MechanicalElement[],
): Point2 {
  const support = get_mechanical_element_from_id(
    load.targetID,
    mechanicalElements,
  );
  if ("position" in support) return (support as NodeElement).position;
  const edge = support as EdgeElement;
  return edge.positionStart.lerp(edge.positionEnd, 0.5);
}

/** Drawn radius of a moment's arc for a given (signed) value. */
export function moment_display_radius(value: number): number {
  return stored2world_load(Math.abs(value)) / LOAD_SCALING.MOMENT_RADIUS_FACTOR;
}

/** Inverse of `moment_display_radius`: the unsigned value an arc radius maps to. */
export function radius2moment_value(radius: number): number {
  return world2stored_load(radius * LOAD_SCALING.MOMENT_RADIUS_FACTOR);
}

/**
 * Sign of a moment from the side of its support the cursor sits on: positive
 * (clockwise, see `draw_moment`) on the left of the support's start→end axis.
 * A support with no axis of its own (a gear) falls back to the world x axis.
 */
export function moment_sign_from_cursor(
  supportID: ID,
  center: Point2,
  cursor: Point2,
  mechanicalElements: MechanicalElement[],
): number {
  const support = get_mechanical_element_from_id(supportID, mechanicalElements);
  const axis =
    support && "positionStart" in support
      ? (support as EdgeElement).positionEnd.sub(
          (support as EdgeElement).positionStart,
        )
      : RIGHT;
  return axis.cross(cursor.sub(center)) >= 0 ? 1 : -1;
}

// ─── Load frame ──────────────────────────────────────────────────────────

/** Local axes of an edge: xhat along start→end, yhat its normal. */
function edge_axes(edge: EdgeElement): { xhat: Point2; yhat: Point2 } {
  const delta = edge.positionEnd.sub(edge.positionStart);
  const xhat = delta.length() > 1e-9 ? delta.normalize() : new Point2(1, 0);
  return { xhat, yhat: xhat.perp() };
}

/** The edge a load's frame references, or undefined for the world frame. */
function frame_edge(
  frame: LoadFrame,
  mechanicalElements: MechanicalElement[],
): EdgeElement | undefined {
  if (frame === "world") return undefined;
  const edge = mechanicalElements.find((e) => e.id === frame.edgeID);
  return edge && "positionStart" in edge ? (edge as EdgeElement) : undefined;
}

/** Convert a vector stored in a load's frame into world coordinates. */
export function frame2world(
  vec: Point2,
  frame: LoadFrame,
  mechanicalElements: MechanicalElement[],
): Point2 {
  const edge = frame_edge(frame, mechanicalElements);
  if (!edge) return vec;
  const { xhat, yhat } = edge_axes(edge);
  return xhat.mul(vec.x).add(yhat.mul(vec.y));
}

/** Convert a world vector into a load's frame coordinates. */
export function world2frame(
  vec: Point2,
  frame: LoadFrame,
  mechanicalElements: MechanicalElement[],
): Point2 {
  const edge = frame_edge(frame, mechanicalElements);
  if (!edge) return vec;
  const { xhat, yhat } = edge_axes(edge);
  return new Point2(vec.dot(xhat), vec.dot(yhat));
}

/** World position a force is anchored at (node, or an edge endpoint). */
export function force_base_position(
  load: ForceElement,
  mechanicalElements: MechanicalElement[],
): Point2 {
  const target = get_mechanical_element_from_id(
    load.targetID,
    mechanicalElements,
  );
  if ("position" in target) return (target as NodeElement).position;
  const edge = target as EdgeElement;
  return load.anchor === "end" ? edge.positionEnd : edge.positionStart;
}

/** A force's vector in world coordinates. */
export function force_world_vector(
  load: ForceElement,
  mechanicalElements: MechanicalElement[],
): Point2 {
  return frame2world(load.vector, load.frame, mechanicalElements);
}

/** Same direction as `worldVec` (whose length is the magnitude), length
 *  compressed for display. */
export function force_display_vector(worldVec: Point2): Point2 {
  const v = worldVec.length();
  if (v < 1e-9) return worldVec;
  return worldVec.mul(stored2world_load(v) / v);
}

/** Inverse: a world drag vector (base→cursor) → the stored magnitude vector
 *  (same direction, length = the physical value the drag length maps to). */
export function force_stored_vector(dragVec: Point2): Point2 {
  const d = dragVec.length();
  if (d < 1e-9) return dragVec;
  return dragVec.mul(world2stored_load(d) / d);
}

/** A distributed force's endpoint vectors in world coordinates. */
export function distributed_world_vectors(
  load: DistributedForceElement,
  mechanicalElements: MechanicalElement[],
): { worldStart: Point2; worldEnd: Point2 } {
  return {
    worldStart: frame2world(
      load.direction.mul(load.magnitudeStart),
      load.frame,
      mechanicalElements,
    ),
    worldEnd: frame2world(
      load.direction.mul(load.magnitudeEnd),
      load.frame,
      mechanicalElements,
    ),
  };
}

// ─── Distributed load display ───────────────────────────────────────────────
// The log ruler exists to keep loads of very different magnitudes legible side
// by side — a comparison *between* loads. Inside one load the reading is a
// different thing entirely: an engineer reads the intensity at any point off
// the straight line joining the two tip arrows, which only means anything if
// the drawing is proportional to the values across the span. So the compression
// is applied once, to the load's dominant magnitude, and the whole profile is
// drawn linearly from there: the biggest arrow keeps the length the ruler gives
// it, the arrow at mid-span is exactly the average of the two, and a triangular
// load draws as a true triangle instead of bottoming out on `MIN_PX`.

/**
 * Below this, a magnitude counts as zero. It is the threshold the canvas
 * already applies without saying so: `draw_dimension_text` keeps one decimal,
 * so anything under it is written "0" anyway.
 */
export const LOAD_ZERO_EPSILON = 0.05;

/** Whether a magnitude reads as zero — an end of a load carrying nothing. */
export function is_zero_load(magnitude: number): boolean {
  return Math.abs(magnitude) < LOAD_ZERO_EPSILON;
}

/** Drawn length per unit of magnitude for a whole distributed load (px per N/m). */
export function distributed_display_gain(
  magnitudeStart: number,
  magnitudeEnd: number,
): number {
  const peak = Math.max(Math.abs(magnitudeStart), Math.abs(magnitudeEnd));
  if (peak < 1e-9) return 0;
  return stored2world_load(peak) / peak;
}

/** A distributed force's endpoint vectors in world coords, length compressed
 *  for display (see the display-scale section). */
export function distributed_display_vectors(
  load: DistributedForceElement,
  mechanicalElements: MechanicalElement[],
): { displayStart: Point2; displayEnd: Point2 } {
  const { worldStart, worldEnd } = distributed_world_vectors(
    load,
    mechanicalElements,
  );
  const gain = distributed_display_gain(
    load.magnitudeStart,
    load.magnitudeEnd,
  );
  return {
    displayStart: worldStart.mul(gain),
    displayEnd: worldEnd.mul(gain),
  };
}

/**
 * Signed drawn length of one endpoint arrow, `other` holding the magnitude at
 * the opposite end — it shares the gain, so it takes part in the result.
 */
export function distributed_tip_length(
  magnitude: number,
  other: number,
): number {
  return magnitude * distributed_display_gain(magnitude, other);
}

/**
 * Inverse of `distributed_tip_length`: the magnitude a tip dragged to the
 * signed drawn length `length` takes, the opposite end holding `other`.
 *
 * The gain follows the dominant magnitude, so the drag has two regimes. While
 * the dragged tip is the dominant one, its length reads straight off the log
 * ruler — and the opposite arrow rescales as the gain moves under it. Once it
 * falls below the other end, the gain is pinned by that other end and the tip
 * moves linearly, which is what lets it reach exactly zero and turn the load
 * triangular. The two regimes agree where they meet.
 */
export function distributed_tip_magnitude(
  length: number,
  other: number,
): number {
  const dominant = world2stored_load_signed(length);
  const gain = distributed_display_gain(other, other);
  if (gain === 0 || Math.abs(dominant) >= Math.abs(other)) return dominant;
  return length / gain;
}

/**
 * Signed drawn length of the profile at the point of the beam where the body
 * bar was grabbed, when the magnitude there is `magnitude`. `offsetStart` and
 * `offsetEnd` are that point's differences to the two endpoint magnitudes —
 * constants for the whole drag, since a body drag translates both ends by the
 * same amount.
 */
export function distributed_grab_length(
  magnitude: number,
  offsetStart: number,
  offsetEnd: number,
): number {
  return (
    magnitude *
    distributed_display_gain(magnitude + offsetStart, magnitude + offsetEnd)
  );
}

/**
 * Inverse of `distributed_grab_length`, by bisection: there is no closed form,
 * because the gain moves with the load's peak and so sits on both sides of the
 * equation. The length is continuous and increasing in the magnitude (zero at
 * zero, growing like the log ruler at either end), which is all a bisection
 * needs; the bracket is widened by doubling first since the drawn length grows
 * only logarithmically.
 */
export function distributed_grab_magnitude(
  length: number,
  offsetStart: number,
  offsetEnd: number,
): number {
  const at = (m: number) => distributed_grab_length(m, offsetStart, offsetEnd);
  let lo = -1;
  let hi = 1;
  for (let i = 0; i < 60 && at(hi) < length; i++) hi *= 2;
  for (let i = 0; i < 60 && at(lo) > length; i++) lo *= 2;
  for (
    let i = 0;
    i < 100 && hi - lo > 1e-6 * Math.max(1, Math.abs(lo), Math.abs(hi));
    i++
  ) {
    const mid = (lo + hi) / 2;
    if (at(mid) < length) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Vector a distributed endpoint's value label is placed along: its own drawn
 * arrow, or the load's direction when that arrow has no length — a zero end
 * still needs its "0" written beside the beam rather than on top of it.
 */
export function distributed_label_vector(
  display: Point2,
  worldDirection: Point2,
): Point2 {
  return display.length() > 1e-6 ? display : worldDirection;
}

/**
 * Total force of a distributed load (trapezoid area): the average of the two
 * endpoint magnitudes times the beam length.
 */
export function distributed_resultant(
  load: DistributedForceElement,
  beamLength: number,
): number {
  return ((load.magnitudeStart + load.magnitudeEnd) / 2) * beamLength;
}

// ─── Value labels ───────────────────────────────────────────────────────────
// Where a load's value is written on the canvas. Drawing, hit-testing and the
// on-canvas editor all read these — they must agree to the pixel, otherwise the
// label is drawn in one place and clickable in another.

/**
 * Position of the value label of an arrow drawn from `base` along
 * `displayVector`: past the tip, pushed away by a superellipse radius so the
 * text clears the arrowhead by a margin that follows the label's own aspect
 * (wider horizontally than vertically) instead of a constant gap.
 */
export function force_value_label_position(
  base: Point2,
  displayVector: Point2,
): Point2 {
  if (displayVector.length() < 1e-9) return base;
  const N = 4;
  const width = DIM.VECTOR_VALUE_OFFSET * 2;
  const height = DIM.VECTOR_VALUE_OFFSET;
  const unit = displayVector.normalize();
  const radius = Math.pow(
    Math.pow(unit.x / width, N) + Math.pow(unit.y / height, N),
    -1 / N,
  );
  return base.add(displayVector.extend_length(radius));
}

/** Position of the value label of a moment, above its arc. */
export function moment_value_label_position(
  center: Point2,
  radius: number,
): Point2 {
  return center.add(UP.mul(radius + DIM.VECTOR_VALUE_OFFSET * 1.3));
}

/**
 * World position of a load's editable value label — the anchor the on-canvas
 * value editor centers on, and the centre of its hit target in `get-hover.ts`.
 * For a distributed force, `part` selects the start or end magnitude label.
 */
export function load_value_anchor(
  load: LoadElement,
  mechanicalElements: MechanicalElement[],
  part?: "start" | "end",
): Point2 {
  switch (load.type) {
    case "force": {
      const base = force_base_position(load, mechanicalElements);
      const displayVector = force_display_vector(
        force_world_vector(load, mechanicalElements),
      );
      return force_value_label_position(base, displayVector);
    }
    case "moment": {
      const moment = load as MomentElement;
      const center = moment_center_position(moment, mechanicalElements);
      return moment_value_label_position(
        center,
        moment_display_radius(moment.value),
      );
    }
    case "distributed-force": {
      const dist = load as DistributedForceElement;
      const beam = get_mechanical_element_from_id(
        dist.targetID,
        mechanicalElements,
      ) as EdgeElement;
      const { displayStart, displayEnd } = distributed_display_vectors(
        dist,
        mechanicalElements,
      );
      const direction = frame2world(
        dist.direction,
        dist.frame,
        mechanicalElements,
      );
      // Each endpoint arrow is drawn from its own beam end, so its label sits
      // exactly where `draw_force` puts it for that arrow.
      return part === "end"
        ? force_value_label_position(
            beam.positionEnd,
            distributed_label_vector(displayEnd, direction),
          )
        : force_value_label_position(
            beam.positionStart,
            distributed_label_vector(displayStart, direction),
          );
    }
  }
}

/**
 * Edges physically attached to a node — candidate reference edges for a force's
 * edge frame. Covers both the node's own edge lists and edges pinned to it.
 */
export function node_candidate_edges(
  node: MechanicalElement,
  mechanicalElements: MechanicalElement[],
): EdgeElement[] {
  const ids = new Set<ID>();
  if ("fixedEdgesIDs" in node) node.fixedEdgesIDs.forEach((id) => ids.add(id));
  if ("rotatingEdgesIDs" in node)
    node.rotatingEdgesIDs.forEach((id) => ids.add(id));
  if ("parentBeamID" in node && node.parentBeamID) ids.add(node.parentBeamID);
  const edges: EdgeElement[] = [];
  for (const e of mechanicalElements) {
    if (!("positionStart" in e)) continue;
    const edge = e as EdgeElement;
    if (
      edge.fixedNodeStartID === node.id ||
      edge.fixedNodeEndID === node.id ||
      ids.has(edge.id)
    )
      edges.push(edge);
  }
  return edges;
}

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

/** World axes (H/V) plus each edge's axial and normal directions, as angles. */
function snap_candidate_angles(edges: EdgeElement[]): number[] {
  const candidates = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
  for (const edge of edges) {
    const beamAngle = edge.positionEnd.sub(edge.positionStart).angle();
    for (let k = 0; k < 4; k++) candidates.push(beamAngle + (k * Math.PI) / 2);
  }
  return candidates;
}

/**
 * Snap a world-space load direction to the nearest meaningful axis (magnitude
 * preserved): the world horizontal/vertical axes, plus each given edge's axial
 * and normal directions. Returns the vector unchanged when no candidate is
 * within tolerance. Exact angles stay reachable via the panel.
 */
export function snap_direction(worldVec: Point2, edges: EdgeElement[]): Point2 {
  const len = worldVec.length();
  if (len < 1e-6) return worldVec;
  const angle = worldVec.angle();
  let best = angle;
  let bestDiff = SNAP_TOLERANCE_RAD;
  for (const c of snap_candidate_angles(edges)) {
    const diff = Math.abs(angle_diff(angle, c));
    if (diff < bestDiff) {
      bestDiff = diff;
      best = c;
    }
  }
  return best === angle ? worldVec : Point2.from_polar(len, best);
}

/**
 * Reference frame implied by an (already snapped) direction: the edge whose
 * axial/normal it lies on, or "world" — world axes take priority, so a direction
 * that is both world-aligned and edge-aligned stays "world" (e.g. gravity down a
 * vertical beam is not captured as a follower load).
 */
export function frame_from_snapped_direction(
  worldVec: Point2,
  edges: EdgeElement[],
): LoadFrame {
  if (worldVec.length() < 1e-6) return "world";
  const angle = worldVec.angle();
  for (let k = 0; k < 4; k++)
    if (Math.abs(angle_diff(angle, (k * Math.PI) / 2)) < SNAP_MATCH_RAD)
      return "world";
  for (const edge of edges) {
    const beamAngle = edge.positionEnd.sub(edge.positionStart).angle();
    for (let k = 0; k < 4; k++)
      if (
        Math.abs(angle_diff(angle, beamAngle + (k * Math.PI) / 2)) <
        SNAP_MATCH_RAD
      )
        return { mode: "edge", edgeID: edge.id };
  }
  return "world";
}

/**
 * Edges a force anchored at (targetID, anchor) can snap to / reference: for a
 * node target, all its attached edges; for an edge target, that edge plus the
 * edges of the node fixed at the anchored endpoint.
 */
export function force_snap_edges(
  targetID: ID,
  anchor: "start" | "end" | undefined,
  mechanicalElements: MechanicalElement[],
): EdgeElement[] {
  const target = mechanicalElements.find((e) => e.id === targetID);
  if (!target) return [];
  if (!("positionStart" in target))
    return node_candidate_edges(target, mechanicalElements);
  const edge = target as EdgeElement;
  const edges: EdgeElement[] = [edge];
  const nodeID = anchor === "end" ? edge.fixedNodeEndID : edge.fixedNodeStartID;
  const node = nodeID
    ? mechanicalElements.find((e) => e.id === nodeID)
    : undefined;
  if (node && !("positionStart" in node)) {
    for (const e of node_candidate_edges(node, mechanicalElements))
      if (!edges.some((x) => x.id === e.id)) edges.push(e);
  }
  return edges;
}
