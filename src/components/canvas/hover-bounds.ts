import type { CanvasState } from "../../types/canvas-state";
import type {
  BeltElement,
  EdgeElement,
  ID,
  MechanicalElement,
  Point2,
} from "../../types";
import { DIM } from "../../constants/rendering-specs";

/**
 * Where the cursor is allowed to be, given what the gesture is about to produce.
 *
 * Called once on the world cursor before anything reads it, so hit-testing and
 * the gestures taking the raw mouse share one bounded point. Applied afterwards
 * instead, an element would settle somewhere the cursor never was.
 *
 * Placing an element and dragging one answer to the same bounds — a beam is no
 * shorter for having just been drawn.
 *
 * These are aids to hovering, not invariants: hit tolerance and grid snapping
 * both run downstream and may pull the point back inside by a few pixels.
 */
export function clamp_to_bounds(
  point: Point2,
  state: CanvasState,
  mechanicalElements: MechanicalElement[],
): Point2 {
  switch (state.type) {
    case "PlacingBeamEnd":
    case "PlacingSpringEnd":
    case "PlacingDamperEnd":
      return from_base(point, state.startHover.position, DIM.MIN_EDGE_LENGTH);

    case "PlacingGearRadius":
      return from_base(point, state.startHover.position, DIM.MIN_GEAR_RADIUS);

    case "ChangingGearRadius": {
      const gear = element_of_type(state.elementID, "gear", mechanicalElements);
      return gear
        ? from_base(point, gear.position, DIM.MIN_GEAR_RADIUS)
        : point;
    }

    // The belt being routed has no element yet, so its adjacent gear comes from
    // the route built so far rather than from `attachedGearsIDs`. Until a first
    // pulley is picked, the belt is still one straight span from its start and
    // answers to the same minimum length as any other edge.
    case "PlacingBeltEnd": {
      const gears = state.attachedGearsIDs;
      if (gears.length === 0)
        return from_base(point, state.startHover.position, DIM.MIN_EDGE_LENGTH);
      return clamp_outside_gear(
        point,
        gears[gears.length - 1].id,
        mechanicalElements,
      );
    }

    // A node pinned to an edge terminal carries that terminal with it, so it
    // answers to the same bounds — once per edge it holds. Overlapping bounds
    // are not reconciled: the last one wins. A minimum length is an aid to
    // hovering, not an invariant, and a node held by two edges whose far ends
    // are that close is already a corner case.
    case "MovingNode":
      return pinned_edge_terminals(state.elementID, mechanicalElements).reduce(
        (bounded, { edge, which }) =>
          clamp_edge_terminal(bounded, edge, which, mechanicalElements),
        point,
      );

    case "MovingEdgeStartPoint":
    case "MovingEdgeEndPoint": {
      const edge = mechanicalElements.find(
        (el) => el.id === state.elementID && "positionStart" in el,
      ) as EdgeElement | undefined;
      return edge
        ? clamp_edge_terminal(
            point,
            edge,
            state.type === "MovingEdgeStartPoint" ? "start" : "end",
            mechanicalElements,
          )
        : point;
    }

    default:
      return point;
  }
}

/** Where one terminal of `edge` may go: clear of the opposite end, and outside the pulley it wraps. */
function clamp_edge_terminal(
  point: Point2,
  edge: EdgeElement,
  which: "start" | "end",
  mechanicalElements: MechanicalElement[],
): Point2 {
  const opposite = which === "start" ? edge.positionEnd : edge.positionStart;
  // A belt running over at least one pulley may bring its two ends together —
  // that is the loop closing. One with no pulley is a plain span, and shortening
  // it onto itself would only make a point.
  const canClose =
    edge.type === "belt" && (edge as BeltElement).attachedGearsIDs.length > 0;
  const bounded = from_base(
    point,
    opposite,
    canClose ? 0 : DIM.MIN_EDGE_LENGTH,
  );
  const gearID = adjacent_belt_gear(edge, which);
  return gearID
    ? clamp_outside_gear(bounded, gearID, mechanicalElements)
    : bounded;
}

/** Every edge terminal `nodeID` is pinned to. A node on an edge *body* is not one. */
function pinned_edge_terminals(
  nodeID: ID,
  mechanicalElements: MechanicalElement[],
): { edge: EdgeElement; which: "start" | "end" }[] {
  const terminals: { edge: EdgeElement; which: "start" | "end" }[] = [];
  for (const element of mechanicalElements) {
    if (!("fixedNodeStartID" in element)) continue;
    const edge = element as EdgeElement;
    if (edge.fixedNodeStartID === nodeID)
      terminals.push({ edge, which: "start" });
    if (edge.fixedNodeEndID === nodeID) terminals.push({ edge, which: "end" });
  }
  return terminals;
}

/**
 * The element `id` names, when it is of `type`.
 *
 * Canvas state can outlive what it points at — a drag whose target is deleted —
 * and this file runs on every mouse move, ahead of everything else. A miss
 * yields the unbounded cursor instead of throwing in the app's hottest path.
 */
function element_of_type<T extends MechanicalElement["type"]>(
  id: ID,
  type: T,
  mechanicalElements: MechanicalElement[],
): Extract<MechanicalElement, { type: T }> | undefined {
  const element = mechanicalElements.find((el) => el.id === id);
  return element?.type === type
    ? (element as Extract<MechanicalElement, { type: T }>)
    : undefined;
}

/** `point` pushed away from `base` until it is at least `minLength` from it. */
function from_base(point: Point2, base: Point2, minLength: number): Point2 {
  return base.add(point.sub(base).limit_length_min(minLength));
}

/**
 * The gear a belt terminal wraps: the first attached gear for the start
 * terminal, the last for the end.
 */
function adjacent_belt_gear(
  edge: EdgeElement,
  which: "start" | "end",
): ID | undefined {
  if (edge.type !== "belt") return undefined;
  const gears = (edge as BeltElement).attachedGearsIDs;
  if (gears.length === 0) return undefined;
  return which === "start" ? gears[0].id : gears[gears.length - 1].id;
}

/**
 * Keep a belt terminal out of the pulley it wraps. It may sit ON the rim — that
 * is a wound end — but never inside.
 */
function clamp_outside_gear(
  pos: Point2,
  gearID: ID,
  mechanicalElements: MechanicalElement[],
): Point2 {
  const gear = element_of_type(gearID, "gear", mechanicalElements);
  if (!gear) return pos;
  const v = pos.sub(gear.position);
  const d = v.length();
  if (d >= gear.radius || d < 1e-9) return pos;
  return gear.position.add(v.mul(gear.radius / d));
}
