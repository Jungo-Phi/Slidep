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
 * A minimum never grows what is already under it. Resizing something is not the
 * occasion to edit a size nobody aimed at: a gear of four units drawn at zoom 8
 * is a deliberate gear, and dezooming until it measures ten pixels must not blow
 * it out to thirty on the first grab of its rim. So what a resize answers to is
 * the screen minimum *or* the size in hand, whichever is smaller — a floor that
 * forbids shrinking further without ever pushing outwards. Zooming in lowers it
 * and gives the small sizes back.
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

  switch (state.type) {
    case "PlacingBeamEnd":
    case "PlacingSpringEnd":
    case "PlacingDamperEnd":
      return from_base(point, state.startHover.position, minEdgeLength);

    case "PlacingGearRadius":
    case "ChangingGearRadius": {
      const bound = sizing_bound(state, mechanicalElements, viewport);
      return bound ? from_base(point, bound.centre, bound.minRadius) : point;
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
 * Where a gear-sizing gesture measures its radius from, and the smallest it may
 * leave it — `undefined` for any other gesture.
 *
 * Placing has no gear yet, so nothing to ratchet against: a gear one is drawing
 * answers to the screen minimum alone.
 */
function sizing_bound(
  state: CanvasState,
  mechanicalElements: MechanicalElement[],
  viewport: ViewportState,
): { centre: Point2; minRadius: number } | undefined {
  const minRadius = screen2world_length(DIM.MIN_GEAR_RADIUS, viewport);
  if (state.type === "PlacingGearRadius")
    return { centre: state.startHover.position, minRadius };
  if (state.type !== "ChangingGearRadius") return undefined;
  const gear = element_of_type(state.elementID, "gear", mechanicalElements);
  return gear
    ? { centre: gear.position, minRadius: Math.min(minRadius, gear.radius) }
    : undefined;
}

/**
 * Whether `target` sits closer to the centre than the radius a sizing gesture
 * may leave the gear at.
 *
 * The bound the free cursor answers to, asked of an aimed target instead. A
 * target keeps its own position — that is what makes it a target — so the only
 * way to hold the bound against one is to stop offering it: the rim cannot be
 * brought there, so there is nothing to aim at. Silently, like every other place
 * a gesture simply cannot reach; and without it a target sitting on the axle
 * would size the gear down to nothing, which is where meshing, belt geometry and
 * ratios all divide by zero.
 */
export function out_of_sizing_reach(
  target: Point2,
  state: CanvasState,
  mechanicalElements: MechanicalElement[],
  viewport: ViewportState,
): boolean {
  const bound = sizing_bound(state, mechanicalElements, viewport);
  return !!bound && target.distance_to(bound.centre) < bound.minRadius;
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
  const minLength = Math.min(
    screen2world_length(
      edge.type !== "belt"
        ? DIM.MIN_EDGE_LENGTH
        : belt_can_close((edge as BeltElement).attachedGearsIDs.length)
          ? 0
          : UNCLOSABLE_BELT_GAP,
      viewport,
    ),
    // Never longer than the edge already is: dragging one end of a bar that
    // measures ten pixels must not stretch it to thirty.
    edge.positionStart.distance_to(edge.positionEnd),
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
