/**
 * The ruler: what its ends hold on to, what a click builds, and what the whole reads.
 *
 * Everything is resolved against the mechanism it is read with, which during a simulation is
 * the live pose — so a reading is of the mechanism as it stands now, not of the pose the ruler
 * was laid on. A reading whose element is gone goes quiet rather than reporting a stale point.
 */

import type { CanvasState } from "../../../types/canvas-state";
import type { HoveredPart } from "../../../types/hovered-part";
import type {
  EdgeElement,
  GearElement,
  ID,
  Measure,
  MeasureAnchor,
  MeasureReadout,
  MechanicalElement,
  WorldPoint,
} from "../../../types";
import { Point2 } from "../../../types/point2";
import { resolve_angle_constraint_quadrant } from "../../../utils";
import { deg_to_rad } from "../../../utils/quantity-format";

const edge_by_id = (
  id: ID,
  elements: MechanicalElement[],
): EdgeElement | undefined => {
  const edge = elements.find((element) => element.id === id);
  return edge && "positionStart" in edge ? edge : undefined;
};

/** The edge `anchor` is on, if it is on one. */
function edge_of(
  anchor: MeasureAnchor,
  elements: MechanicalElement[],
): EdgeElement | undefined {
  if (anchor.kind !== "edge-end" && anchor.kind !== "edge-point")
    return undefined;
  return edge_by_id(anchor.edgeID, elements);
}

/** What the ruler takes hold of where the cursor is. Anything it is not offered as a target — empty space, the floor, an overlay — becomes a point of its own. */
export function measure_anchor(
  part: HoveredPart,
  elements: MechanicalElement[],
): MeasureAnchor {
  switch (part.type) {
    case "Node":
      return { kind: "node", nodeID: part.id };
    case "GearTooth":
      return { kind: "gear", gearID: part.id };
    case "Edge": {
      if (part.part !== "body")
        return { kind: "edge-end", edgeID: part.id, part: part.part };
      const edge = edge_by_id(part.id, elements);
      if (!edge) return { kind: "free", position: part.position.clone() };
      return {
        kind: "edge-point",
        edgeID: part.id,
        t: Math.min(
          1,
          Math.max(
            0,
            part.position.parameter_on_segment(
              edge.positionStart,
              edge.positionEnd,
            ),
          ),
        ),
      };
    }
    default:
      return { kind: "free", position: part.position.clone() };
  }
}

const gear_by_id = (
  id: ID,
  elements: MechanicalElement[],
): GearElement | undefined => {
  const gear = elements.find((element) => element.id === id);
  return gear?.type === "gear" ? gear : undefined;
};

/** The gear an anchor holds, if it holds one. */
export function gear_of(
  anchor: MeasureAnchor,
  elements: MechanicalElement[],
): GearElement | undefined {
  return anchor.kind === "gear"
    ? gear_by_id(anchor.gearID, elements)
    : undefined;
}

/**
 * Where an end stands before the other one is known, or nothing if what it was laid on has
 * since gone. A gear answers with its centre, which is not where it is measured from — see
 * `measure_points`, the only place a gear's own point is settled.
 */
export function anchor_base(
  anchor: MeasureAnchor,
  elements: MechanicalElement[],
): WorldPoint | undefined {
  switch (anchor.kind) {
    case "free":
      return anchor.position;
    case "node":
    case "gear": {
      const id = anchor.kind === "node" ? anchor.nodeID : anchor.gearID;
      const element = elements.find((one) => one.id === id);
      return element && "position" in element ? element.position : undefined;
    }
    case "edge-end": {
      const edge = edge_of(anchor, elements);
      if (!edge) return undefined;
      return anchor.part === "start" ? edge.positionStart : edge.positionEnd;
    }
    case "edge-point": {
      const edge = edge_of(anchor, elements);
      return edge?.positionStart.lerp(edge.positionEnd, anchor.t);
    }
  }
}

/** The point of `gear`'s rim nearest `toward`. */
function rim_point(gear: GearElement, toward: WorldPoint): WorldPoint {
  const spoke = toward.sub(gear.position);
  // Aimed at the centre itself, the rim offers no direction and every point of it is as near
  // as any other.
  if (spoke.length() < 1e-9) return gear.position;
  return gear.position.add(spoke.with_length(gear.radius));
}

/** Whether an end holds on to the mechanism rather than to a point of its own. */
export function is_attached(anchor: MeasureAnchor): boolean {
  return anchor.kind !== "free";
}


/** What an element reads of itself: a gear its radius, a bar its length. What clicking it twice would seal, and what hovering it already shows. */
export function own_measure(
  part: HoveredPart,
  elements: MechanicalElement[],
): Measure | undefined {
  if (part.type === "GearTooth") return { kind: "radius", gearID: part.id };
  if (part.type !== "Edge" || !edge_by_id(part.id, elements)) return undefined;
  return {
    kind: "distance",
    start: { kind: "edge-end", edgeID: part.id, part: "start" },
    end: { kind: "edge-end", edgeID: part.id, part: "end" },
  };
}

/** The bar an anchor sits on the body of — what an angle is read between. An end of a bar names a point, not a direction, so it answers nothing. */
function bar_of(anchor: MeasureAnchor): ID | undefined {
  return anchor.kind === "edge-point" ? anchor.edgeID : undefined;
}

/**
 * The two ends of a distance reading as points, or nothing if either has lost what it held.
 *
 * The one place a gear's own point is settled, being the only place both ends are known: a
 * gear is held by its rim, and which point of the rim is the one nearest the opposite end.
 * Both are answered from the centres, which for two gears is exact — the nearest points of
 * two circles lie on the line joining them.
 *
 * `crossed` says the two ends have passed each other, which only rims can do: two gears sunk
 * into one another give back rim points in the wrong order. It is what turns the reading
 * negative, so an interference of 2 mm does not read like a gap of 2 mm.
 */
export function measure_span(
  measure: Measure,
  elements: MechanicalElement[],
): { from: WorldPoint; to: WorldPoint; crossed: boolean } | undefined {
  if (measure.kind !== "distance") return undefined;
  const fromBase = anchor_base(measure.start, elements);
  const toBase = anchor_base(measure.end, elements);
  if (!fromBase || !toBase) return undefined;
  const startGear = gear_of(measure.start, elements);
  const endGear = gear_of(measure.end, elements);
  const from = startGear ? rim_point(startGear, toBase) : fromBase;
  const to = endGear ? rim_point(endGear, fromBase) : toBase;
  return {
    from,
    to,
    // Ends that did not move off their base cannot have crossed: the two vectors are then the
    // same one, and its dot product with itself is never negative.
    crossed: to.sub(from).dot(toBase.sub(fromBase)) < 0,
  };
}

/** The edge a reading spans end to end, if it spans one — a length that would otherwise be drawn on top of the bar it measures. */
export function spanned_edge(measure: Measure): ID | undefined {
  if (
    measure.kind !== "distance" ||
    measure.start.kind !== "edge-end" ||
    measure.end.kind !== "edge-end" ||
    measure.start.edgeID !== measure.end.edgeID
  )
    return undefined;
  return measure.start.edgeID;
}

/**
 * Where an angle reading sits and how wide it opens, as the bars stand now.
 *
 * The vertex is where the two bars' lines cross, which moves with them; the arc is anchored on
 * the bisector of the quadrant the clicks picked out, at the radius they set — so it stays in
 * its own corner and keeps its size however the mechanism swings.
 */
export function angle_geometry(
  measure: Extract<Measure, { kind: "angle" }>,
  elements: MechanicalElement[],
):
  | {
      startEdge: EdgeElement;
      endEdge: EdgeElement;
      vertex: WorldPoint;
      arc: WorldPoint;
      angle: number;
    }
  | undefined {
  const startEdge = edge_by_id(measure.startEdgeID, elements);
  const endEdge = edge_by_id(measure.endEdgeID, elements);
  if (!startEdge || !endEdge) return undefined;
  const vertex = Point2.lines_intersection(
    startEdge.positionStart,
    startEdge.positionEnd,
    endEdge.positionStart,
    endEdge.positionEnd,
  );
  // Two bars that have come parallel cross nowhere, so there is no corner left to read.
  if (!vertex) return undefined;
  const v1 = startEdge.positionEnd
    .sub(startEdge.positionStart)
    .mul(measure.flipStart ? -1 : 1)
    .normalize();
  const v2 = endEdge.positionEnd
    .sub(endEdge.positionStart)
    .mul(measure.flipEnd ? -1 : 1)
    .normalize();
  const bisector = v1.add(v2);
  // At a straight angle the bisector vanishes, and either side of the two bars is as good
  // as the other.
  const direction =
    bisector.length() > 1e-9 ? bisector.normalize() : v1.perp().normalize();
  return {
    startEdge,
    endEdge,
    vertex,
    arc: vertex.add(direction.mul(measure.radius)),
    angle: Math.abs(deg_to_rad(v1.angle2deg(v2))),
  };
}

/** What the ruler reads, or nothing when it has lost what it held. */
export function measure_readout(
  measure: Measure,
  elements: MechanicalElement[],
): MeasureReadout | undefined {
  if (measure.kind === "radius") {
    const gear = gear_by_id(measure.gearID, elements);
    return gear && { kind: "radius", radius: gear.radius };
  }
  if (measure.kind === "angle") {
    const geometry = angle_geometry(measure, elements);
    return geometry && { kind: "angle", angle: geometry.angle };
  }
  const span = measure_span(measure, elements);
  if (!span) return undefined;
  const delta = span.to.sub(span.from);
  return {
    kind: "distance",
    distance: span.crossed ? -delta.length() : delta.length(),
    dx: delta.x,
    dy: delta.y,
    angle: delta.angle(),
  };
}

/**
 * The reading a second click on `hoveredPart` would seal.
 *
 * Two bar bodies give the angle between them, the way the dimensioning tool's second edge
 * does — and the two clicked points, which lie in the corner being aimed at, settle which of
 * the four quadrants that is. One thing clicked twice reads itself instead, a span or an angle
 * with itself being nothing: a bar gives its length, a gear its radius. Everything else is a
 * distance between the two ends.
 */
export function build_measure(
  start: MeasureAnchor,
  hoveredPart: HoveredPart,
  elements: MechanicalElement[],
): Measure {
  const end = measure_anchor(hoveredPart, elements);

  if (
    start.kind === "gear" &&
    end.kind === "gear" &&
    start.gearID === end.gearID
  )
    return { kind: "radius", gearID: start.gearID };

  const startBar = bar_of(start);
  const endBar = bar_of(end);

  if (startBar !== undefined && startBar === endBar)
    return {
      kind: "distance",
      start: { kind: "edge-end", edgeID: startBar, part: "start" },
      end: { kind: "edge-end", edgeID: startBar, part: "end" },
    };

  if (startBar !== undefined && endBar !== undefined) {
    const startEdge = edge_by_id(startBar, elements);
    const endEdge = edge_by_id(endBar, elements);
    const from = anchor_base(start, elements);
    const to = anchor_base(end, elements);
    if (startEdge && endEdge && from && to) {
      // Strictly inside the corner being aimed at, which the cursor itself is not: it sits on
      // the second bar, where the quadrant test has nothing to bite on.
      const corner = from.lerp(to, 0.5);
      const quadrant = resolve_angle_constraint_quadrant(
        startEdge.positionStart,
        startEdge.positionEnd,
        endEdge.positionStart,
        endEdge.positionEnd,
        corner,
      );
      const vertex = Point2.lines_intersection(
        startEdge.positionStart,
        startEdge.positionEnd,
        endEdge.positionStart,
        endEdge.positionEnd,
      );
      // Parallel bars cross nowhere: the ruler falls back to the distance between the two
      // points aimed at, the one thing still worth reading there.
      if (quadrant && vertex)
        return {
          kind: "angle",
          startEdgeID: startBar,
          endEdgeID: endBar,
          flipStart: quadrant.flipStart,
          flipEnd: quadrant.flipEnd,
          // The arc passes through the point aimed at, not halfway to it.
          radius: vertex.distance_to(to),
        };
    }
  }

  return { kind: "distance", start, end };
}

/**
 * Where a refusal — Escape, the right button — leaves the ruler: back to its previous step,
 * one at a time. A reading is dropped before the instrument is, so a misplaced end costs one
 * key rather than the whole gesture. Answers nothing for a state the ruler is not in.
 */
export function ruler_step_back(state: CanvasState): CanvasState | undefined {
  switch (state.type) {
    case "MeasuringFrom":
    case "Measured":
      return { type: "Measuring" };
    case "Measuring":
      return { type: "Selecting" };
    default:
      return undefined;
  }
}

/**
 * What the ruler shows right now: the reading it holds, or — while one end is down — the one
 * the next click would seal. The preview is therefore exactly what clicking produces, with no
 * second rule to keep in step with the first.
 */
export function shown_measure(
  state: CanvasState,
  hoveredPart: HoveredPart,
  elements: MechanicalElement[],
): Measure | undefined {
  if (state.type === "Measured") return state.measure;
  if (state.type === "MeasuringFrom")
    return build_measure(state.start, hoveredPart, elements);
  return undefined;
}

/** Whether the ruler is out, in any of its steps. */
export function ruler_is_out(state: CanvasState): boolean {
  return (
    state.type === "Measuring" ||
    state.type === "MeasuringFrom" ||
    state.type === "Measured"
  );
}

/** Nothing measured: shared, so a quiet frame keeps a stable identity. */
const NOTHING_MEASURED: ReadonlySet<ID> = new Set();

/**
 * The elements a reading takes whole rather than as a point of.
 *
 * A node always, being a point in itself. A gear always — which point of its rim is measured
 * is settled by the opposite end. A bar only for its own length or for an angle, where the
 * direction of the whole bar is what is read; anywhere else it contributes one point of its
 * body, and that point is what gets marked.
 */
export function whole_elements(measure: Measure): ID[] {
  switch (measure.kind) {
    case "radius":
      return [measure.gearID];
    case "angle":
      return [measure.startEdgeID, measure.endEdgeID];
    case "distance": {
      const spanned = spanned_edge(measure);
      if (spanned) return [spanned];
      return [measure.start, measure.end].flatMap((anchor) =>
        anchor.kind === "gear"
          ? [anchor.gearID]
          : anchor.kind === "node"
            ? [anchor.nodeID]
            : [],
      );
    }
  }
}

/**
 * Every reading the ruler puts on the canvas: the one it holds, and — while it holds no end —
 * what the element under the cursor reads of itself.
 *
 * The single answer to "what is on screen", so the drawing and the elements lit for it cannot
 * disagree about which readings there are.
 */
export function shown_readings(
  state: CanvasState,
  hoveredPart: HoveredPart,
  elements: MechanicalElement[],
  cursorOnCanvas: boolean,
): Measure[] {
  const readings: Measure[] = [];
  const held = shown_measure(state, hoveredPart, elements);
  if (held) readings.push(held);
  if (
    cursorOnCanvas &&
    (state.type === "Measuring" || state.type === "Measured")
  ) {
    const own = own_measure(hoveredPart, elements);
    if (own) readings.push(own);
  }
  return readings;
}

/** The elements the ruler lights, so the mechanism can draw them in its own hue. */
export function measured_elements(
  state: CanvasState,
  hoveredPart: HoveredPart,
  elements: MechanicalElement[],
  cursorOnCanvas: boolean,
): ReadonlySet<ID> {
  if (!ruler_is_out(state)) return NOTHING_MEASURED;
  const lit = shown_readings(state, hoveredPart, elements, cursorOnCanvas).flatMap(
    whole_elements,
  );
  // A node reads nothing of itself, so no reading of its own lights it under the cursor.
  if (cursorOnCanvas && hoveredPart.type === "Node") lit.push(hoveredPart.id);
  return lit.length > 0 ? new Set(lit) : NOTHING_MEASURED;
}

/** What the ruler currently reads, for the panel that shows it. */
export function shown_readout(
  state: CanvasState,
  hoveredPart: HoveredPart,
  elements: MechanicalElement[],
): MeasureReadout | null {
  const measure = shown_measure(state, hoveredPart, elements);
  return (measure && measure_readout(measure, elements)) ?? null;
}
