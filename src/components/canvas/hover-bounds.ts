import type { CanvasState } from "../../types/canvas-state";
import type {
  BeltElement,
  EdgeElement,
  ID,
  MechanicalElement,
  Point2,
  ViewportState,
} from "../../types";
import { DIM, HIT_TOLERANCE } from "../../constants/rendering-specs";
import { belt_can_close, belt_terminal_pulley_id } from "../../utils/belt-rules";
import { screen2world_length } from "../../utils";

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
 * Every minimum here is a **screen** distance, converted through the viewport:
 * what these bounds protect is the ability to see and grab what one is drawing,
 * which is a matter of pixels. Zoomed in, a beam of ten world units becomes a
 * legitimate thing to draw; zoomed out, one of a thousand is the shortest that
 * can still be aimed at.
 *
 * These are aids to hovering, not invariants: hit tolerance and grid snapping
 * both run downstream and may pull the point back inside by a few pixels.
 */
export function clamp_to_bounds(
  point: Point2,
  state: CanvasState,
  mechanicalElements: MechanicalElement[],
  viewport: ViewportState,
): Point2 {
  const minEdgeLength = screen2world_length(DIM.MIN_EDGE_LENGTH, viewport);
  const minGearRadius = screen2world_length(DIM.MIN_GEAR_RADIUS, viewport);

  switch (state.type) {
    case "PlacingBeamEnd":
    case "PlacingSpringEnd":
    case "PlacingDamperEnd":
      return from_base(point, state.startHover.position, minEdgeLength);

    case "PlacingGearRadius":
      return from_base(point, state.startHover.position, minGearRadius);

    case "ChangingGearRadius": {
      const gear = element_of_type(state.elementID, "gear", mechanicalElements);
      return gear ? from_base(point, gear.position, minGearRadius) : point;
    }

    // The belt being routed has no element yet, so the pulley its end wraps is
    // read from the gesture: the last one routed, or — before any is — the gear
    // the gesture started on, which joins `attachedGearsIDs` only at
    // finalisation. With no pulley at all the belt is one straight span from its
    // start and answers to the same minimum length as any other edge.
    case "PlacingBeltEnd": {
      const gears = state.attachedGearsIDs;
      const gearID =
        gears.length > 0
          ? gears[gears.length - 1].id
          : state.startHover.type === "GearTooth"
            ? state.startHover.id
            : undefined;
      return gearID
        ? clamp_outside_gear(point, gearID, mechanicalElements)
        : from_base(point, state.startHover.position, minEdgeLength);
    }

    // A node pinned to an edge terminal carries that terminal with it, so it
    // answers to the same bounds — once per edge it holds. Overlapping bounds
    // are not reconciled: the last one wins. A minimum length is an aid to
    // hovering, not an invariant, and a node held by two edges whose far ends
    // are that close is already a corner case.
    case "MovingNode":
      return pinned_edge_terminals(state.elementID, mechanicalElements).reduce(
        (bounded, { edge, which }) =>
          clamp_edge_terminal(
            bounded,
            edge,
            which,
            mechanicalElements,
            viewport,
          ),
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
            viewport,
          )
        : point;
    }

    default:
      return point;
  }
}

/**
 * How close the two ends of a belt that cannot close may come, in screen px.
 * Strictly inside the tolerance that triggers the refusal, never on it: held
 * exactly on the threshold, the `<=` deciding whether the refusal shows flips
 * with rounding on every mouse move, and the cursor and its message blink.
 */
const UNCLOSABLE_BELT_GAP = HIT_TOLERANCE.NODE - 1;

/** Where one terminal of `edge` may go: clear of the opposite end, and outside the pulley it wraps. */
function clamp_edge_terminal(
  point: Point2,
  edge: EdgeElement,
  which: "start" | "end",
  mechanicalElements: MechanicalElement[],
  viewport: ViewportState,
): Point2 {
  const opposite = which === "start" ? edge.positionEnd : edge.positionStart;
  // A belt may bring its two ends together — that is the loop closing. Short of
  // the pulleys the loop needs, they stop just before touching: near enough for
  // the refusal to be offered, far enough not to merge. A plain span has no
  // closure to aim at, and shortening it onto itself would only make a point.
  const minLength = screen2world_length(
    edge.type !== "belt"
      ? DIM.MIN_EDGE_LENGTH
      : belt_can_close((edge as BeltElement).attachedGearsIDs.length)
        ? 0
        : UNCLOSABLE_BELT_GAP,
    viewport,
  );
  const bounded = from_base(point, opposite, minLength);
  const gearID =
    edge.type === "belt"
      ? belt_terminal_pulley_id(edge as BeltElement, which)
      : undefined;
  return gearID
    ? clamp_outside_gear(bounded, gearID, mechanicalElements)
    : bounded;
}

/** Every edge terminal `nodeID` is pinned to. A node on an edge *body* is not one. */
export function pinned_edge_terminals(
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
