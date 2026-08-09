/**
 * Where a dimension's line and label come to rest.
 *
 * A dimension's `position` carries two independent things: how far the line stands off what it measures, and where along it the label sits. Both are free, and both have one place that reads as deliberate — a round offset, and the middle of what is being measured. Left to the pixel, a drawing of a dozen dimensions never lines any of them up.
 *
 * Applies while the dimension is being placed and while it is being dragged: the same position, set by the same gesture.
 */

import type { CanvasState } from "../../types/canvas-state";
import type {
  BeltElement,
  ConstraintElement,
  EdgeElement,
  ID,
  MechanicalElement,
  ViewportState,
  WorldPoint,
} from "../../types";
import { Point2 } from "../../types/point2";
import { HIT_TOLERANCE } from "../../constants/rendering-specs";
import { as_edge } from "../../utils/load-frame";
import { get_belt_vias } from "../../utils/belt-geom";
import { belt_project } from "../../utils/belt-path";
import {
  grid_snap_step,
  screen2world_length,
  world2screen_vec,
} from "../../utils";
import {
  corridor_distance,
  NO_FEEDBACK,
  SNAP_CORRIDOR,
  angle_ray_count,
  type SnapFeedback,
  type SnapSettings,
} from "./snap-corridor";

/**
 * The geometry a dimension's position answers to.
 *
 * Every dimension has the same two freedoms, and the same two things worth landing on:
 * **(A) centring** — where along the measured thing the label sits, which has one deliberate answer, its middle;
 * **(B) the stand-off** — how far the line sits from what it measures, which has a ladder of round answers.
 *
 * `line` covers everything measured between two points: an edge's length, the gap between two nodes, the drop from a node to a beam.
 * `around` covers what is measured about a centre — an angle, a radius — where centring is a direction rather than a place along a span.
 * `from_path` covers the belt, whose line only stands off: a route of tangents and arcs has no middle to centre a label on.
 */
type Measured =
  | { kind: "line"; start: WorldPoint; end: WorldPoint }
  | { kind: "around"; origin: WorldPoint; directions: WorldPoint[] }
  | { kind: "from_path"; foot: WorldPoint };

/** One turn's worth of directions, for a dimension with no direction of its own to prefer. The same ladder an edge answers to, so one setting governs every round angle in the drawing. */
function angle_ladder(rays: number): WorldPoint[] {
  return Array.from({ length: rays }, (_, k) =>
    Point2.from_polar(1, (k * 2 * Math.PI) / rays),
  );
}

/** The two rays an angle dimension stands between, reduced to the one place its label belongs: halfway. */
function bisector(a: EdgeElement, b: EdgeElement): Measured | undefined {
  const origin = Point2.lines_intersection(
    a.positionStart,
    a.positionEnd,
    b.positionStart,
    b.positionEnd,
  );
  if (!origin) return undefined;
  const u = a.positionEnd.sub(a.positionStart).normalize();
  const v = b.positionEnd.sub(b.positionStart).normalize();
  // Both halves of each bar bound an angle, so all four combinations are a bisector of one of them.
  const directions: WorldPoint[] = [];
  for (const su of [1, -1])
    for (const sv of [1, -1]) {
      const sum = u.mul(su).add(v.mul(sv));
      if (sum.length() > 1e-9) directions.push(sum.normalize());
    }
  return { kind: "around", origin, directions };
}

/** Where a belt dimension's leader line meets the belt: the point its stand-off is measured from. */
function belt_foot(
  belt: BeltElement,
  mechanicalElements: MechanicalElement[],
  position: WorldPoint,
): Measured | undefined {
  const all = get_belt_vias(belt, mechanicalElements);
  // A closed loop repeats its first via at each end to carry the junction; the path itself is what lies between.
  const vias = belt.closed ? all.slice(1, -1) : all;
  if (vias.length === 0) return undefined;
  return { kind: "from_path", foot: belt_project(vias, position, belt.closed).point };
}

/** What the gesture is dimensioning, from the state that is placing it or the element being dragged. */
function measured(
  state: CanvasState,
  mechanicalElements: MechanicalElement[],
  constraintElements: ConstraintElement[],
  rays: number,
  position: WorldPoint,
): Measured | undefined {
  const element = (id: ID) => mechanicalElements.find((el) => el.id === id);
  const edge = (id: ID) => as_edge(element(id));
  const node = (id: ID) => {
    const found = element(id);
    return found && "position" in found ? found.position : undefined;
  };

  const of_edge = (id: ID): Measured | undefined => {
    const found = edge(id);
    return found
      ? { kind: "line", start: found.positionStart, end: found.positionEnd }
      : undefined;
  };
  const of_nodes = (a: ID, b: ID): Measured | undefined => {
    const start = node(a);
    const end = node(b);
    return start && end ? { kind: "line", start, end } : undefined;
  };
  // What is measured is the drop from the node to the bar's line, so the line the position answers to runs from the foot of that drop to the node.
  const of_edge_to_node = (edgeID: ID, nodeID: ID): Measured | undefined => {
    const bar = edge(edgeID);
    const point = node(nodeID);
    if (!bar || !point) return undefined;
    return {
      kind: "line",
      start: point.project_on_line(bar.positionStart, bar.positionEnd),
      end: point,
    };
  };
  const of_angle = (a: ID, b: ID): Measured | undefined => {
    const first = edge(a);
    const second = edge(b);
    return first && second ? bisector(first, second) : undefined;
  };
  // A radius has no middle to aim for: what characterises where its line points is its direction, so it answers to the same round angles an edge does.
  const of_gear = (id: ID): Measured | undefined => {
    const centre = node(id);
    return centre
      ? { kind: "around", origin: centre, directions: angle_ladder(rays) }
      : undefined;
  };
  const of_belt = (id: ID): Measured | undefined => {
    const belt = element(id);
    return belt?.type === "belt"
      ? belt_foot(belt as BeltElement, mechanicalElements, position)
      : undefined;
  };

  switch (state.type) {
    case "DimensionEdge":
      return of_edge(state.edgeID);
    case "DimensionNodeToNode":
      return of_nodes(state.startNodeID, state.endNodeID);
    case "DimensionEdgeToNode":
      return of_edge_to_node(state.edgeID, state.nodeID);
    case "DimensionAngle":
      return of_angle(state.startEdgeID, state.endEdgeID);
    case "DimensionRadius":
      return of_gear(state.gearID);
    case "DimensionBelt":
      return of_belt(state.beltID);
    case "MovingConstraint": {
      const constraint = constraintElements.find(
        (c) => c.id === state.elementID,
      );
      switch (constraint?.type) {
        case "dimension-edge":
          return of_edge(constraint.edgeID);
        case "dimension-node-to-node":
          return of_nodes(constraint.startNodeID, constraint.endNodeID);
        case "dimension-edge-to-node":
          return of_edge_to_node(constraint.edgeID, constraint.nodeID);
        case "dimension-angle":
          return of_angle(constraint.startEdgeID, constraint.endEdgeID);
        case "dimension-radius":
          return of_gear(constraint.gearID);
        case "dimension-belt":
          return of_belt(constraint.beltID);
        default:
          return undefined;
      }
    }
    default:
      return undefined;
  }
}

/**
 * A stand-off pulled onto its ladder, and whether it landed.
 *
 * Half the grid's step: a dimension line is a piece of annotation, not a part of the mechanism, and wants to sit closer to what it measures than a whole grid square — while still lining up with its neighbours.
 */
function snap_offset(
  value: number,
  step: number,
  tolerance: number,
): { value: number; landed: boolean } {
  const rung = step / 2;
  const target = Math.round(value / rung) * rung;
  return Math.abs(target - value) < tolerance
    ? { value: target, landed: true }
    : { value, landed: false };
}

/** A snapped dimension position, and what took hold of it. */
export interface DimensionSnap extends SnapFeedback {
  position: WorldPoint;
}

/**
 * `position` snapped for a dimension being placed or dragged; unchanged for every other gesture.
 *
 * Both axes announce themselves once reached, never before: the centring one by drawing the line the label has landed on, the stand-off — whose ladder has no line to draw — by putting the dimension itself in relief.
 */
export function snap_dimension_position(
  position: WorldPoint,
  state: CanvasState,
  mechanicalElements: MechanicalElement[],
  constraintElements: ConstraintElement[],
  viewport: ViewportState,
  settings: SnapSettings,
): DimensionSnap {
  const free = { position, ...NO_FEEDBACK };
  const target = measured(
    state,
    mechanicalElements,
    constraintElements,
    angle_ray_count(settings.angleStep),
    position,
  );
  if (!target) return free;
  const step = grid_snap_step(viewport.scale);
  const tolerance = screen2world_length(HIT_TOLERANCE.SNAP, viewport);

  if (target.kind === "line") {
    const span = target.end.sub(target.start);
    const length = span.length();
    if (length < 1e-9) return free;
    const axis = span.mul(1 / length);
    const offset = position.sub(target.start);
    const along = offset.dot(axis);
    const stand = snap_offset(offset.cross(axis), step, tolerance);
    // Mid-span for the label, a round stand-off for the line. Independent: landing on one without the other is a perfectly good answer.
    const centred = Math.abs(along - length / 2) < tolerance;
    const middle = target.start.add(axis.mul(length / 2));
    return {
      position: target.start
        .add(axis.mul(centred ? length / 2 : along))
        .sub(axis.perp().mul(stand.value)),
      // Shown once reached rather than throughout: an axis drawn before the label
      // is on it is one more line to read, and the eye finds the middle of a span
      // without help.
      guides: centred ? [{ anchor: middle, direction: axis.perp() }] : [],
      distanceSnapped: stand.landed,
    };
  }

  if (target.kind === "from_path") {
    const spoke = position.sub(target.foot);
    const reach = spoke.length();
    if (reach < 1e-9) return free;
    const stand = snap_offset(reach, step, tolerance);
    // Nothing to centre: a route of tangents and arcs has no middle, so the leader line only answers for its length.
    return {
      position: target.foot.add(spoke.with_length(stand.value)),
      guides: [],
      distanceSnapped: stand.landed,
    };
  }

  const spoke = position.sub(target.origin);
  const reach = spoke.length();
  if (reach < 1e-9) return free;
  // The direction is judged across the ray in px, like every other aim; the distance from the centre answers to the ladder.
  const drag = world2screen_vec(spoke, viewport);
  let best: WorldPoint | undefined;
  let bestDistance: number = SNAP_CORRIDOR;
  for (const direction of target.directions) {
    const distance = corridor_distance(
      drag,
      world2screen_vec(direction, viewport).normalize(),
    );
    if (distance >= bestDistance) continue;
    bestDistance = distance;
    best = direction;
  }
  const stand = snap_offset(reach, step, tolerance);
  const aim = best ?? spoke.mul(1 / reach);
  return {
    position: target.origin.add(aim.mul(stand.value)),
    guides: best ? [{ anchor: target.origin, direction: best }] : [],
    distanceSnapped: stand.landed,
  };
}
