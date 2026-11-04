/**
 * Drawing a belt by dragging, as a rope is laid around pegs: the free run goes straight from its last point of contact to the cursor, and catches on whatever gear it comes to touch.
 *
 * A gear wraps the moment the free run reaches tangency with it, on the side the run came from, however far from it the cursor is.
 * The last pulley unwraps the moment the belt's wrap on it falls back through zero, the run having come straight off it again.
 * Going on round it past a whole turn winds it by one more turn (`turns`), and coming back through zero unwinds one, before it lets go.
 * The cursor passing over a gear touches nothing: the run already crossed that gear before it came out the other side, so it never reached tangency with it.
 *
 * The same rope is pulled whether the belt is being placed (`trace_belt_drag`) or one of its terminals is dragged (`trace_belt_terminal`).
 */

import type { Point2 } from "../../../types/point2";
import type { CanvasState, DraggedBeltRoute } from "../../../types/canvas-state";
import type {
  BeltElement,
  GearElement,
  MechanicalElement,
} from "../../../types/element";
import type { ViewportState, WorldPoint } from "../../../types";
import { belt_pieces } from "../../../utils/belt-path";
import { screen2world_length } from "../../../utils/viewport";
import { legality_for_state } from "../../mechanism/connection-rules";
import { open_belt_vias } from "../drawing/belt-vias";

type BeltEnd = Extract<CanvasState, { type: "PlacingBeltEnd" }>;
type Routed = BeltEnd["attachedGearsIDs"];

/** Screen px between two points of a drag taken into account: fine enough that a fast drag cannot skip past a tangency. */
const STEP = 4;

/** A rope being pulled: held at `anchor`, laid over `routed` from there, its end last at `last`. */
interface Rope {
  anchor: Point2;
  routed: Routed;
  last: Point2;
  /** Whether the run may catch on `gear`, `routed` being the route so far. */
  catchable: (gear: GearElement, routed: Routed) => boolean;
}

/** The route `rope` is laid over once its end has been pulled to `cursor`, and the wrap its last pulley then shows (`BeltTrace.lastWrap`). */
function trace_rope(
  rope: Rope,
  cursor: Point2,
  mechanicalElements: MechanicalElement[],
  viewport: ViewportState,
): { routed: Routed; lastWrap: number | undefined } {
  const gears = new Map(
    mechanicalElements
      .filter((e): e is GearElement => e.type === "gear")
      .map((g) => [g.id, g]),
  );

  const pieces_to = (routed: Routed, end: Point2) => {
    const route = routed.flatMap(({ id, clockwise }) => {
      const gear = gears.get(id);
      return gear ? [{ gear, clockwise }] : [];
    });
    return belt_pieces(
      open_belt_vias(rope.anchor as WorldPoint, route, end as WorldPoint),
    );
  };
  /** The straight run from the last point of contact of `routed` to `end`. */
  const free_run = (routed: Routed, end: Point2) => {
    const pieces = pieces_to(routed, end);
    const run = pieces[pieces.length - 1];
    return run.kind === "segment" ? run : undefined;
  };
  /** The angle the belt wraps its last pulley by, in [0, 2π): one falling through zero comes out just under a full turn. */
  const last_wrap = (routed: Routed, end: Point2) => {
    const pieces = pieces_to(routed, end);
    const arc = pieces[pieces.length - 2];
    return arc?.kind === "arc" ? arc.wrap : 0;
  };
  const touches = (gear: GearElement, run: { from: Point2; to: Point2 }) =>
    gear.position.distance2segment(run.from, run.to) < gear.radius;
  /** Which side of the line from `from` through the gear's centre `point` lies on, in the sense `belt_wrap_arriving` reads a contact. */
  const side = (gear: GearElement, from: Point2, point: Point2) =>
    gear.position.sub(from).perp().dot(point.sub(gear.position)) > 0;

  const advance = (previous: Point2, point: Point2, routed: Routed): Routed => {
    // The wrap the geometry shows on the last pulley is read in [0, 2π): a jump between two points close together is it going through zero or through a whole turn.
    // Through zero, coming back: one turn unwinds, or the pulley lets go once it has none — and so may the one before it.
    while (routed.length > 0) {
      const last = routed[routed.length - 1];
      const jump = last_wrap(routed, point) - last_wrap(routed, previous);
      const turns = last.turns ?? 0;
      if (jump < -Math.PI) {
        routed = [...routed.slice(0, -1), { ...last, turns: turns + 1 }];
        break;
      }
      if (jump <= Math.PI) break;
      if (turns > 0) {
        routed = [...routed.slice(0, -1), with_turns(last, turns - 1)];
        break;
      }
      routed = routed.slice(0, -1);
    }

    const before = free_run(routed, previous);
    const after = free_run(routed, point);
    if (!before || !after) return routed;
    let caught: GearElement | undefined;
    for (const gear of gears.values()) {
      if (routed.some((r) => r.id === gear.id)) continue;
      // A cursor inside a gear is passing over it, not laying the run against it.
      if (point.distance_to(gear.position) <= gear.radius) continue;
      if (previous.distance_to(gear.position) <= gear.radius) continue;
      if (touches(gear, before) || !touches(gear, after)) continue;
      if (!rope.catchable(gear, routed)) continue;
      // Of two gears caught at once, the run meets the nearer one first.
      if (
        !caught ||
        after.from.distance_to(gear.position) < after.from.distance_to(caught.position)
      )
        caught = gear;
    }
    if (!caught) return routed;
    // Caught on the side the run came from.
    return [...routed, { id: caught.id, clockwise: side(caught, after.from, previous) }];
  };

  const steps = Math.max(
    1,
    Math.ceil(rope.last.distance_to(cursor) / screen2world_length(STEP, viewport)),
  );
  let routed = rope.routed;
  let previous = rope.last;
  for (let i = 1; i <= steps; i++) {
    const point = rope.last.lerp(cursor, i / steps);
    routed = advance(previous, point, routed);
    previous = point;
  }
  return {
    routed,
    lastWrap: routed.length > 0 ? last_wrap(routed, cursor) : undefined,
  };
}

/** `entry` wound by `turns` whole turns, the field left out when there are none. */
function with_turns(entry: Routed[number], turns: number): Routed[number] {
  const { id, clockwise } = entry;
  return turns > 0 ? { id, clockwise, turns } : { id, clockwise };
}

/** The same route travelled from its other end: each pulley in reverse order, wrapped the other way round. */
export function reversed_route(routed: Routed): Routed {
  return [...routed]
    .reverse()
    .map((entry) => ({ ...entry, clockwise: !entry.clockwise }));
}

/** `state` once the drag has reached `cursor`, its route rewound to match. */
export function trace_belt_drag(
  state: BeltEnd,
  cursor: WorldPoint,
  mechanicalElements: MechanicalElement[],
  viewport: ViewportState,
): BeltEnd {
  const startGearID =
    state.startHover.type === "GearTooth" ? state.startHover.id : undefined;
  const { routed, lastWrap } = trace_rope(
    {
      anchor: state.startHover.position,
      routed: state.attachedGearsIDs,
      last: state.trace?.last ?? state.startHover.position,
      // The gear the belt starts on already wraps it; for the others, the same rules as a click on the gear: one already on the belt, or on an axle it already runs over, is refused.
      catchable: (gear, routed) =>
        gear.id !== startGearID &&
        legality_for_state({ ...state, attachedGearsIDs: routed }, mechanicalElements)(gear)
          .allowed,
    },
    cursor,
    mechanicalElements,
    viewport,
  );
  return { ...state, attachedGearsIDs: routed, trace: { last: cursor, lastWrap } };
}

/**
 * The route `belt` is laid over while its `which` terminal is dragged to `cursor`, carried by the drag until the drop applies it (`belt_route_actions`).
 * The run is pulled from the other terminal, over the pulleys between: those next to the dragged terminal wrap, unwrap and wind as the rope rules say.
 * `prior` is the route the drag has pulled so far, absent on its first move.
 */
export function trace_belt_terminal(
  belt: BeltElement,
  which: "start" | "end",
  prior: DraggedBeltRoute | undefined,
  cursor: WorldPoint,
  mechanicalElements: MechanicalElement[],
  viewport: ViewportState,
): DraggedBeltRoute {
  const fromStart = which === "start";
  const stored = prior?.attachedGearsIDs ?? belt.attachedGearsIDs;
  // Traced from the fixed terminal towards the dragged one, which is the belt's own order for its end and the reverse of it for its start.
  const towards = fromStart ? reversed_route(stored) : stored;
  const anchor = fromStart ? belt.positionEnd : belt.positionStart;
  const dragged = fromStart ? belt.positionStart : belt.positionEnd;
  const rules = (routed: Routed): BeltEnd => ({
    type: "PlacingBeltEnd",
    startHover: { type: "Void", position: anchor },
    attachedGearsIDs: routed,
  });
  const { routed, lastWrap } = trace_rope(
    {
      anchor,
      routed: towards,
      last: prior?.trace.last ?? dragged,
      catchable: (gear, routed) =>
        legality_for_state(rules(routed), mechanicalElements)(gear).allowed,
    },
    cursor,
    mechanicalElements,
    viewport,
  );
  return {
    beltID: belt.id,
    which,
    attachedGearsIDs: fromStart ? reversed_route(routed) : routed,
    trace: { last: cursor, lastWrap },
  };
}

/**
 * The loose belt whose terminal a drag of `elementID` pulls as a rope, and which terminal: the belt itself when one of its terminals is dragged, or the belt a dragged node holds by a terminal.
 * A node pinned to a pulley's rim carries its terminal round that pulley rather than pulling it, and pulls nothing.
 */
export function rope_pulled_by(
  state: CanvasState,
  mechanicalElements: MechanicalElement[],
): { belt: BeltElement; which: "start" | "end" } | undefined {
  if (state.type === "MovingEdgeStartPoint" || state.type === "MovingEdgeEndPoint") {
    const belt = mechanicalElements.find((e) => e.id === state.elementID);
    return belt?.type === "belt" && !belt.closed
      ? { belt, which: state.type === "MovingEdgeStartPoint" ? "start" : "end" }
      : undefined;
  }
  if (state.type !== "MovingNode") return undefined;
  const nodeID = state.elementID;
  if (mechanicalElements.some((e) => e.type === "gear" && e.fixedNodesBodyIDs.includes(nodeID)))
    return undefined;
  for (const el of mechanicalElements) {
    if (el.type !== "belt" || el.closed) continue;
    if (el.fixedNodeStartID === nodeID) return { belt: el, which: "start" };
    if (el.fixedNodeEndID === nodeID) return { belt: el, which: "end" };
  }
  return undefined;
}

/** The route a drag is pulling `beltID` over, if any. */
export function dragged_route(state: CanvasState, beltID: string): DraggedBeltRoute | undefined {
  const route = "route" in state ? state.route : undefined;
  return route && route.beltID === beltID ? route : undefined;
}
