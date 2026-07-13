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
  LoadFrame,
  MechanicalElement,
  NodeElement,
} from "../types";

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
export function frame_to_world(
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
export function world_to_frame(
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
export function force_base(
  load: ForceElement,
  mechanicalElements: MechanicalElement[],
): Point2 | undefined {
  const target = mechanicalElements.find((e) => e.id === load.targetID);
  if (!target) return undefined;
  if ("position" in target) return (target as NodeElement).position;
  const edge = target as EdgeElement;
  return load.anchor === "end" ? edge.positionEnd : edge.positionStart;
}

/** A force's vector in world coordinates. */
export function force_world_vector(
  load: ForceElement,
  mechanicalElements: MechanicalElement[],
): Point2 {
  return frame_to_world(load.vector, load.frame, mechanicalElements);
}

// ─── Display scale ──────────────────────────────────────────────────────────
// A load's magnitude is its physical value (N, or N/m for a distributed force);
// the drawn arrow length is a compressed (√) function of it so that magnitudes
// spanning several orders of magnitude stay drawable AND comparable (monotonic:
// bigger value ⇒ longer arrow). The forward/inverse pair are exact inverses, so
// dragging (value = inverse of the cursor distance) keeps the arrowhead under the
// cursor while the panel shows the true value.

/** Physical magnitude drawn at the reference length. */
const DISPLAY_REF_VALUE = 100;
/** Drawn length (world px) of a reference-magnitude load. */
const DISPLAY_REF_LENGTH = 40;

/** Compress a load magnitude (N or N/m) to a drawn arrow length (world px). */
export function force_display_length(value: number): number {
  const a = Math.abs(value);
  if (a < 1e-9) return 0;
  return DISPLAY_REF_LENGTH * Math.sqrt(a / DISPLAY_REF_VALUE);
}

/** Inverse of `force_display_length`: recover the magnitude from a drawn length. */
export function force_display_value(length: number): number {
  const r = Math.abs(length) / DISPLAY_REF_LENGTH;
  return DISPLAY_REF_VALUE * r * r;
}

/** Same direction as `worldVec` (whose length is the magnitude), length
 *  compressed for display. */
export function force_display_vector(worldVec: Point2): Point2 {
  const v = worldVec.length();
  if (v < 1e-9) return worldVec;
  return worldVec.mul(force_display_length(v) / v);
}

/** Inverse: a world drag vector (base→cursor) → the stored magnitude vector
 *  (same direction, length = the physical value the drag length maps to). */
export function force_stored_vector(dragVec: Point2): Point2 {
  const d = dragVec.length();
  if (d < 1e-9) return dragVec;
  return dragVec.mul(force_display_value(d) / d);
}

/** A distributed force's endpoint vectors in world coordinates. */
export function distributed_world_vectors(
  load: DistributedForceElement,
  mechanicalElements: MechanicalElement[],
): { worldStart: Point2; worldEnd: Point2 } {
  return {
    worldStart: frame_to_world(
      load.direction.mul(load.magnitudeStart),
      load.frame,
      mechanicalElements,
    ),
    worldEnd: frame_to_world(
      load.direction.mul(load.magnitudeEnd),
      load.frame,
      mechanicalElements,
    ),
  };
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
  return {
    displayStart: force_display_vector(worldStart),
    displayEnd: force_display_vector(worldEnd),
  };
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
export function snap_direction(
  worldVec: Point2,
  edges: EdgeElement[],
): Point2 {
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
      if (Math.abs(angle_diff(angle, beamAngle + (k * Math.PI) / 2)) < SNAP_MATCH_RAD)
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
