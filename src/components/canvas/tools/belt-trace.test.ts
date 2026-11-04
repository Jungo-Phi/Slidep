import { describe, expect, it } from "vitest";
import { Point2 } from "../../../types/point2";
import type {
  GearElement,
  ID,
  MechanicalElement,
  PivotElement,
} from "../../../types/element";
import type { CanvasState } from "../../../types/canvas-state";
import { ZERO, type ViewportState, type WorldPoint } from "../../../types";
import { belt_wrap_arriving } from "../../../utils/belt-geom";
import { belt_pieces, type BeltVia } from "../../../utils/belt-path";
import { dragged_wraps } from "../drawing/draw-gesture-preview";
import { open_belt_vias } from "../drawing/belt-vias";
import { trace_belt_drag } from "./belt-trace";

const P = (x: number, y: number) => new Point2(x, y) as WorldPoint;
const VIEWPORT: ViewportState = { scale: 1, pan: ZERO };

const axle = (id: string, x: number, gearID: string): PivotElement => ({
  type: "pivot",
  id: id as ID,
  probes: [],
  overlays: {},
  position: P(x, 0),
  isGrounded: false,
  rotatingEdgesIDs: [],
  fixedGearsIDs: [gearID as ID],
  motor: undefined,
  rotationalFriction: 0,
});
const gear = (id: string, x: number, axleID: string): GearElement => ({
  type: "gear",
  id: id as ID,
  probes: [],
  overlays: {},
  position: P(x, 0),
  angle: 0,
  radius: 40,
  parentAxleID: axleID as ID,
  fixedNodesBodyIDs: [],
  meshedGearsIDs: [],
  attachedBeltID: undefined,
  surfaceMass: 1,
});
const A = gear("a", 0, "ax-a");
const B = gear("b", 300, "ax-b");
const MECH: MechanicalElement[] = [axle("ax-a", 0, "a"), A, axle("ax-b", 300, "b"), B];

type BeltEnd = Extract<CanvasState, { type: "PlacingBeltEnd" }>;
const START = P(-150, 0);
const opened: BeltEnd = {
  type: "PlacingBeltEnd",
  startHover: { type: "Void", position: START },
  attachedGearsIDs: [],
  pressHeld: true,
};

/** The drag played through `points`, one move event each. */
const drag = (points: WorldPoint[], from: BeltEnd = opened) =>
  points.reduce((state, point) => trace_belt_drag(state, point, MECH, VIEWPORT), from);
const routed = (state: BeltEnd) => state.attachedGearsIDs.map((g) => g.id);

/** Points on a circle round `center`, three times its gear's radius out, from `fromDeg` to `toDeg`. */
const around = (center: WorldPoint, fromDeg: number, toDeg: number) =>
  Array.from({ length: 41 }, (_, i) => {
    const a = ((fromDeg + ((toDeg - fromDeg) * i) / 40) * Math.PI) / 180;
    return P(center.x + 120 * Math.cos(a), center.y + 120 * Math.sin(a));
  });

describe("drawing a belt by dragging", () => {
  it("wraps a gear the drag turns round, far from its rim, on the side the run came from", () => {
    const state = drag(around(A.position, 90, 0));
    expect(state.attachedGearsIDs).toEqual([
      { id: A.id, clockwise: belt_wrap_arriving(A, START, P(0, 40)) },
    ]);
  });

  it("wraps it the other way when turned round the other side", () => {
    const over = drag(around(A.position, 90, 0)).attachedGearsIDs[0];
    const under = drag(around(A.position, -90, 0)).attachedGearsIDs[0];
    expect(under.clockwise).toBe(!over.clockwise);
  });

  it("keeps it wrapped as the drag goes on round it", () => {
    expect(routed(drag(around(A.position, 90, -150)))).toEqual([A.id]);
  });

  it("unwraps it as soon as the run is back to tangency", () => {
    const wrapped = drag(around(A.position, 90, -45));
    expect(routed(wrapped)).toEqual([A.id]);
    expect(routed(drag(around(A.position, -45, 90), wrapped))).toEqual([]);
  });

  it("keeps it wrapped past a half-turn, and unwraps it once the drag comes all the way back", () => {
    const far = drag(around(A.position, 90, -200));
    expect(routed(far)).toEqual([A.id]);
    expect(routed(drag(around(A.position, -200, 90), far))).toEqual([]);
  });

  it("never shows a pulley wrapped by a whole turn along the way", () => {
    let state = opened;
    for (const point of [...around(A.position, 90, -200), ...around(A.position, -200, 90)]) {
      state = trace_belt_drag(state, point, MECH, VIEWPORT);
      const route = state.attachedGearsIDs.map(({ clockwise }) => ({ gear: A, clockwise }));
      for (const piece of belt_pieces(open_belt_vias(START, route, point)))
        if (piece.kind === "arc") expect(piece.wrap).toBeLessThan(1.9 * Math.PI);
    }
  });

  it("draws a pulley just caught unwrapped, not wrapped a whole turn, when the end drawn lags the one traced", () => {
    let state = opened;
    let previous = START;
    for (const point of around(A.position, 90, 0)) {
      const next = trace_belt_drag(state, point, MECH, VIEWPORT);
      if (next.attachedGearsIDs.length > 0 && state.attachedGearsIDs.length === 0) {
        // The frame drawn with the new route but the end of the event before, short of tangency.
        const route = next.attachedGearsIDs.map(({ clockwise }) => ({ gear: A, clockwise }));
        const vias = open_belt_vias(START, route, previous) as unknown as BeltVia<"screen">[];
        const arc = belt_pieces(vias).find((p) => p.kind === "arc");
        expect(arc?.kind === "arc" && arc.wrap).toBeGreaterThan(Math.PI);
        expect(dragged_wraps(vias, next.trace?.lastWrap)[1]).toBe(0);
        // Drawn at the end it was traced to, it is left as it is.
        const traced = open_belt_vias(START, route, point) as unknown as BeltVia<"screen">[];
        expect(dragged_wraps(traced, next.trace?.lastWrap)[1]).toBeCloseTo(next.trace!.lastWrap!, 9);
        return;
      }
      state = next;
      previous = point;
    }
    throw new Error("the drag never caught the pulley");
  });

  it("winds a turn more each time the drag goes on round past a whole one", () => {
    const once = drag(around(A.position, 90, -420));
    expect(once.attachedGearsIDs).toEqual([expect.objectContaining({ id: A.id, turns: 1 })]);
    const twice = drag(around(A.position, -420, -780), once);
    expect(twice.attachedGearsIDs[0].turns).toBe(2);
  });

  it("unwinds its turns as the drag comes back, then lets the pulley go", () => {
    const wound = drag(around(A.position, 90, -780));
    const back = drag(around(A.position, -780, -60), wound);
    expect(back.attachedGearsIDs).toEqual([{ id: A.id, clockwise: wound.attachedGearsIDs[0].clockwise }]);
    expect(routed(drag(around(A.position, -60, 90), back))).toEqual([]);
  });

  it("ignores a gear the cursor passes over", () => {
    expect(routed(drag([P(-60, 0), P(0, 0), P(60, 0), P(150, 0)]))).toEqual([]);
  });

  it("wraps the gears in the order the run meets them", () => {
    const state = drag([...around(A.position, 90, 0), P(300, -120), P(420, 0)]);
    expect(routed(state)).toEqual([A.id, B.id]);
  });

  it("catches a tangency a fast drag jumps between two events", () => {
    expect(routed(drag([P(0, 120), P(120, 0)]))).toEqual([A.id]);
  });

  it("never wraps the gear the belt starts on: the start already does", () => {
    const fromA: BeltEnd = {
      ...opened,
      startHover: { type: "GearTooth", id: A.id, position: P(-40, 0), deleting: false },
    };
    expect(routed(drag(around(A.position, 90, -90), fromA))).toEqual([]);
  });
});
