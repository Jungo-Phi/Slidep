/**
 * The frame a load's direction is stored in, and the edges a load may take one
 * from.
 *
 * For `frame: "world"` the stored components already are world coordinates. For
 * `frame: { mode: "edge" }` they live in the referenced edge's local frame
 * (x = start→end axis, y = normal) and must be rotated by the edge's current
 * orientation to reach world space — which is what makes a load follow the beam
 * it was aimed along.
 */

import { Point2 } from "../types/point2";
import type {
  EdgeElement,
  ID,
  LoadFrame,
  MechanicalElement,
  WorldPoint,
} from "../types";

/** `element` as an edge, or undefined when it is not one. */
export function as_edge(
  element: MechanicalElement | undefined,
): EdgeElement | undefined {
  return element && "positionStart" in element
    ? (element as EdgeElement)
    : undefined;
}

/** Local axes of an edge: xhat along start→end, yhat its normal. */
function edge_axes(edge: EdgeElement): { xhat: WorldPoint; yhat: WorldPoint } {
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
  return as_edge(mechanicalElements.find((e) => e.id === frame.edgeID));
}

/** Convert a vector stored in a load's frame into world coordinates. */
export function frame2world_transform(
  vec: Point2,
  frame: LoadFrame,
  mechanicalElements: MechanicalElement[],
): WorldPoint {
  const edge = frame_edge(frame, mechanicalElements);
  if (!edge) return vec;
  const { xhat, yhat } = edge_axes(edge);
  return xhat.mul(vec.x).add(yhat.mul(vec.y));
}

/** Convert a world vector into a load's frame coordinates. */
export function world2frame_transform(
  vec: WorldPoint,
  frame: LoadFrame,
  mechanicalElements: MechanicalElement[],
): Point2 {
  const edge = frame_edge(frame, mechanicalElements);
  if (!edge) return vec;
  const { xhat, yhat } = edge_axes(edge);
  return new Point2(vec.dot(xhat), vec.dot(yhat));
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
    const edge = as_edge(e);
    if (!edge) continue;
    if (
      edge.fixedNodeStartID === node.id ||
      edge.fixedNodeEndID === node.id ||
      ids.has(edge.id)
    )
      edges.push(edge);
  }
  return edges;
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
  const edge = as_edge(target);
  if (!edge) return node_candidate_edges(target, mechanicalElements);
  const edges: EdgeElement[] = [edge];
  const nodeID = anchor === "end" ? edge.fixedNodeEndID : edge.fixedNodeStartID;
  const node = nodeID
    ? mechanicalElements.find((e) => e.id === nodeID)
    : undefined;
  if (node && !as_edge(node)) {
    for (const e of node_candidate_edges(node, mechanicalElements))
      if (!edges.some((x) => x.id === e.id)) edges.push(e);
  }
  return edges;
}
