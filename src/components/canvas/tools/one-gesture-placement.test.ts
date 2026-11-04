import { afterEach, describe, expect, it } from "vitest";
import { Point2 } from "../../../types/point2";
import type { Action, CanvasEvent } from "../../../types/actions";
import { selected_ids, type CanvasState } from "../../../types/canvas-state";
import type { HoveredPart } from "../../../types/hovered-part";
import type {
  BeamElement,
  BeltElement,
  GearElement,
  ID,
  MechanicalElement,
  PivotElement,
} from "../../../types/element";
import type { MaterialDef, ProfileDef } from "../../../types/material";
import {
  DEFAULT_METADATA,
  DEFAULT_SIMULATION,
  type Mechanism,
} from "../../../types/mechanism";
import { apply_actions } from "../../mechanism/apply-actions";
import { set_pointer_kind } from "../../../utils/pointer-kind";
import { canvasStateReducer } from "./canvas-state-reducer";
import { validate_mechanism } from "../../../utils/validate-mechanism";
import { belt_wrap_arriving } from "../../../utils/belt-geom";
import { belt_pieces } from "../../../utils/belt-path";
import { open_belt_vias } from "../drawing/belt-vias";
import { reversed_route } from "./belt-trace";

const MATERIALS: MaterialDef[] = [
  { id: "m" as ID, name: "test", E: 1, Re: 1, rho: 1 },
];
const PROFILES: ProfileDef[] = [
  { id: "p" as ID, name: "test", shape: { kind: "rect", b: 1, h: 1 } },
];

const EMPTY: Mechanism = {
  metadata: DEFAULT_METADATA,
  viewport: { scale: 1, pan: new Point2(0, 0) },
  simulation: DEFAULT_SIMULATION,
  mechanicalElements: [],
  constraintElements: [],
  loads: [],
  materials: MATERIALS,
  profiles: PROFILES,
  history: [],
  future: [],
};

interface World {
  state: CanvasState;
  mechanism: Mechanism;
  actions: Action[];
}

/** One event, the pointer at (`x`, `y`) over `hovered` — empty space unless given —, its actions applied to the mechanism. */
function step(
  world: World,
  event: CanvasEvent,
  x: number,
  y = 0,
  hovered: HoveredPart = { type: "Void", position: new Point2(x, y) },
): World {
  const at = new Point2(x, y);
  let state = world.state;
  const actions: Action[] = [];
  const { mechanism } = world;
  canvasStateReducer(
    world.state,
    hovered,
    at,
    "left",
    event,
    mechanism.mechanicalElements,
    mechanism.constraintElements,
    mechanism.loads,
    MATERIALS,
    PROFILES,
    mechanism.viewport,
    (s) => (state = s),
    (a) => actions.push(...a),
    () => {},
    () => {},
    () => {},
    false,
    false,
    () => {},
    () => {},
    at,
  );
  return {
    state,
    mechanism: actions.length ? apply_actions(mechanism, actions) : mechanism,
    actions,
  };
}

const start = (state: CanvasState): World => ({
  state,
  mechanism: EMPTY,
  actions: [],
});

const press: CanvasEvent = { type: "MouseLeftButtonDown", shiftKey: false };
const release: CanvasEvent = { type: "MouseButtonUp", dragged: true };
const click_release: CanvasEvent = { type: "MouseButtonUp", dragged: false };
const escape: CanvasEvent = { type: "KeyDown", key: "Escape", ctrlKey: false };

/** A click: a press, then its release without dragging. */
const click = (world: World, x: number, y = 0, hovered?: HoveredPart) =>
  step(step(world, press, x, y, hovered), click_release, x, y, hovered);

const beams = (world: World) =>
  world.mechanism.mechanicalElements.filter(
    (e): e is BeamElement => e.type === "beam",
  );

afterEach(() => set_pointer_kind("mouse"));

describe("placing a two-step element", () => {
  it("draws it in one gesture: pressed on its start, released on its end", () => {
    const pressed = step(start({ type: "PlacingBeamStart" }), press, 0);
    const released = step(pressed, release, 100);
    const [beam] = beams(released);
    expect(beam.positionStart.x).toBe(0);
    expect(beam.positionEnd.x).toBe(100);
    expect(released.state.type).toBe("PlacingBeamStart");
  });

  it("waits for a second click when the press never dragged", () => {
    const pressed = step(start({ type: "PlacingBeamStart" }), press, 0);
    // The hovered end sits away from the start even under a still pointer: the placement holds it a minimum length off.
    const released = step(pressed, click_release, 30);
    expect(released.actions).toEqual([]);
    expect(released.state.type).toBe("PlacingBeamEnd");

    const clicked = step(released, press, 100);
    expect(beams(clicked)[0].positionEnd.x).toBe(100);
    // The release of that second click puts nothing more down, even read against the state it was pressed in.
    expect(step({ ...clicked, state: released.state }, release, 100).actions).toEqual([]);
  });
});

describe("clicking beams one after another with a mouse", () => {
  const series = () => {
    const first = click(start({ type: "PlacingBeamStart" }), 0);
    return click(click(first, 100), 100, 100);
  };

  it("starts each beam on the end of the last, welded to it", () => {
    const placed = series();
    const [a, b] = beams(placed);
    expect(b.positionStart).toEqual(a.positionEnd);
    const joins = placed.mechanism.mechanicalElements.filter(
      (e) => e.type === "join",
    );
    expect(joins).toHaveLength(1);
    expect(placed.state.type).toBe("PlacingBeamEnd");
  });

  it("ends on a beam put down onto an existing element, its own first beam included", () => {
    const placed = series();
    const [first] = beams(placed);
    const closed = click(placed, 0, 0, {
      type: "Edge",
      id: first.id,
      position: first.positionStart,
      deleting: false,
      part: "start",
    });
    expect(beams(closed)).toHaveLength(3);
    expect(closed.state.type).toBe("PlacingBeamStart");
  });

  it("ends on Escape, the tool still armed", () => {
    expect(step(series(), escape, 0).state.type).toBe("PlacingBeamStart");
  });

});

describe("what a connection made while drawing is", () => {
  const nodes = (world: World, type: string) =>
    world.mechanism.mechanicalElements.filter((e) => e.type === type);
  const end_of = (beam: BeamElement): HoveredPart => ({
    type: "Edge",
    id: beam.id,
    position: beam.positionEnd,
    deleting: false,
    part: "end",
  });
  /** One beam drawn in one gesture from (0, 0) to (100, 0). */
  const one_beam = () =>
    step(step(start({ type: "PlacingBeamStart" }), press, 0), release, 100);

  it("hinges a beam hooked onto another one", () => {
    const first = one_beam();
    const [a] = beams(first);
    const hooked = step(step(first, press, 100, 0, end_of(a)), release, 100, 100);
    expect(nodes(hooked, "pivot")).toHaveLength(1);
    expect(nodes(hooked, "join")).toHaveLength(0);
  });

  it("welds the beams of one stroke, closing on its own first beam included", () => {
    const first = click(start({ type: "PlacingBeamStart" }), 0);
    const series = click(click(first, 100), 100, 100);
    const [a] = beams(series);
    const closed = click(series, 0, 0, {
      type: "Edge",
      id: a.id,
      position: a.positionStart,
      deleting: false,
      part: "start",
    });
    expect(nodes(closed, "join")).toHaveLength(3);
    expect(nodes(closed, "pivot")).toHaveLength(0);
  });

  it("hinges a stroke ending on a beam drawn before it", () => {
    const before = one_beam();
    const [a] = beams(before);
    const first = click({ ...before, state: { type: "PlacingBeamStart" } }, 0, 200);
    const series = click(click(first, 100, 200), 200, 200);
    const ended = click(series, 100, 0, end_of(a));
    expect(nodes(ended, "join")).toHaveLength(2);
    expect(nodes(ended, "pivot")).toHaveLength(1);
  });
});

describe("drawing a belt in one drag", () => {
  const gear: GearElement = {
    type: "gear",
    id: "g" as ID,
    probes: [],
    overlays: {},
    position: new Point2(0, 0),
    angle: 0,
    radius: 40,
    parentAxleID: "ax" as ID,
    fixedNodesBodyIDs: [],
    meshedGearsIDs: [],
    attachedBeltID: undefined,
    surfaceMass: 1,
  };
  const axle: PivotElement = {
    type: "pivot",
    id: "ax" as ID,
    probes: [],
    overlays: {},
    position: new Point2(0, 0),
    isGrounded: true,
    rotatingEdgesIDs: [],
    fixedGearsIDs: [gear.id],
    motor: undefined,
    rotationalFriction: 0,
  };
  const move: CanvasEvent = { type: "MouseMove", mouseDelta: new Point2(0, 0) };

  it("wraps the gear the drag turned round, the press and release both in empty space", () => {
    let world: World = {
      state: { type: "PlacingBeltStart" },
      mechanism: { ...EMPTY, mechanicalElements: [axle, gear] },
      actions: [],
    };
    world = step(world, press, -150);
    for (const [x, y] of [[0, 120], [85, 85], [120, 0]])
      world = step(world, move, x, y);
    world = step(world, release, 120, -20);
    const belt = world.mechanism.mechanicalElements.find(
      (e): e is BeltElement => e.type === "belt",
    );
    expect(belt?.attachedGearsIDs.map((g) => g.id)).toEqual([gear.id]);
    expect(world.state.type).toBe("PlacingBeltStart");
  });

  it("keeps the whole turns the drag wound the pulley by", () => {
    let world: World = {
      state: { type: "PlacingBeltStart" },
      mechanism: { ...EMPTY, mechanicalElements: [axle, gear] },
      actions: [],
    };
    world = step(world, press, -150);
    for (let deg = 90; deg >= -420; deg -= 10) {
      const a = (deg * Math.PI) / 180;
      world = step(world, move, 120 * Math.cos(a), 120 * Math.sin(a));
    }
    world = step(world, release, 200, 0);
    const belt = world.mechanism.mechanicalElements.find(
      (e): e is BeltElement => e.type === "belt",
    )!;
    expect(belt.attachedGearsIDs).toEqual([expect.objectContaining({ id: gear.id, turns: 1 })]);
    expect(validate_mechanism(world.mechanism)).toBeNull();
  });

  it("ends pinned on the rim of the pulley it wrapped last, when released there", () => {
    let world: World = {
      state: { type: "PlacingBeltStart" },
      mechanism: { ...EMPTY, mechanicalElements: [axle, gear] },
      actions: [],
    };
    world = step(world, press, -150);
    for (const [x, y] of [[0, 120], [85, 85], [120, 0]])
      world = step(world, move, x, y);
    world = step(world, release, 0, -40, {
      type: "GearTooth",
      id: gear.id,
      position: new Point2(0, -40),
      deleting: false,
    });
    const belt = world.mechanism.mechanicalElements.find(
      (e): e is BeltElement => e.type === "belt",
    )!;
    expect(belt.attachedGearsIDs.map((g) => g.id)).toEqual([gear.id]);
    const pinned = world.mechanism.mechanicalElements.find(
      (e): e is GearElement => e.type === "gear",
    )!.fixedNodesBodyIDs;
    expect(pinned).toEqual([belt.fixedNodeEndID]);
    expect(validate_mechanism(world.mechanism)).toBeNull();
  });
});

describe("dragging a terminal of a loose belt", () => {
  const axleOf = (id: string, x: number): PivotElement => ({
    type: "pivot",
    id: `ax-${id}` as ID,
    probes: [],
    overlays: {},
    position: new Point2(x, 0),
    isGrounded: true,
    rotatingEdgesIDs: [],
    fixedGearsIDs: [id as ID],
    motor: undefined,
    rotationalFriction: 0,
  });
  const gearAt = (id: string, x: number, belt?: string): GearElement => ({
    type: "gear",
    id: id as ID,
    probes: [],
    overlays: {},
    position: new Point2(x, 0),
    angle: 0,
    radius: 40,
    parentAxleID: `ax-${id}` as ID,
    fixedNodesBodyIDs: [],
    meshedGearsIDs: [],
    attachedBeltID: belt as ID | undefined,
    surfaceMass: 1,
  });
  // Over A, its end hanging to the right; B stands free further right.
  const beltOverA: BeltElement = {
    type: "belt",
    id: "belt" as ID,
    probes: [],
    overlays: {},
    positionStart: new Point2(-150, 0),
    positionEnd: new Point2(120, 0),
    fixedNodeStartID: undefined,
    fixedNodeEndID: undefined,
    attachedGearsIDs: [{ id: "a" as ID, clockwise: belt_wrap_arriving(gearAt("a", 0), new Point2(-150, 0), new Point2(0, 40)) }],
    closed: false,
  };
  const move: CanvasEvent = { type: "MouseMove", mouseDelta: new Point2(0, 0) };
  const world = (type: "MovingEdgeStartPoint" | "MovingEdgeEndPoint"): World => ({
    state: { type, elementID: beltOverA.id },
    mechanism: {
      ...EMPTY,
      mechanicalElements: [axleOf("a", 0), gearAt("a", 0, "belt"), axleOf("b", 300), gearAt("b", 300), beltOverA],
    },
    actions: [],
  });
  /** The drag played through `points`, then dropped where it ended, over empty space. */
  const drag_through = (start: World, points: [number, number][]) => {
    let w = start;
    let previous = points[0];
    for (const [x, y] of points) {
      w = step(w, move, previous[0], previous[1], { type: "Void", position: new Point2(x, y) });
      previous = [x, y];
    }
    return step(w, release, previous[0] + 1, previous[1], { type: "Void", position: new Point2(...previous) });
  };
  const beltOf = (w: World) =>
    w.mechanism.mechanicalElements.find((e): e is BeltElement => e.type === "belt")!;
  const arc = (cx: number, from: number, to: number): [number, number][] =>
    Array.from({ length: 49 }, (_, i) => {
      const a = ((from + ((to - from) * i) / 48) * Math.PI) / 180;
      return [cx + 120 * Math.cos(a), 120 * Math.sin(a)];
    });

  it("lays the belt over a pulley its end is pulled round, applied at the drop", () => {
    const dropped = drag_through(world("MovingEdgeEndPoint"), [[120, 0], [200, -60], ...arc(300, -90, 0)]);
    expect(beltOf(dropped).attachedGearsIDs.map((g) => g.id)).toEqual(["a", "b"]);
    const b = dropped.mechanism.mechanicalElements.find((e) => e.id === ("b" as ID)) as GearElement;
    expect(b.attachedBeltID).toBe(beltOverA.id);
    expect(validate_mechanism(dropped.mechanism)).toBeNull();
  });

  it("winds the pulley next to it by a turn when its end goes round it past a whole one", () => {
    const dropped = drag_through(world("MovingEdgeEndPoint"), [[120, 0], ...arc(0, 0, -400)]);
    expect(beltOf(dropped).attachedGearsIDs).toEqual([expect.objectContaining({ id: "a", turns: 1 })]);
  });

  it("does the same when dragged by the node holding it", () => {
    const load: MechanicalElement = {
      type: "mass",
      id: "load" as ID,
      probes: [],
      overlays: {},
      position: new Point2(120, 0),
      isGrounded: false,
      fixedEdgesIDs: [beltOverA.id],
      mass: 1,
    };
    const start = world("MovingEdgeEndPoint");
    const byNode: World = {
      state: { type: "MovingNode", elementID: load.id },
      mechanism: {
        ...start.mechanism,
        mechanicalElements: [
          ...start.mechanism.mechanicalElements.map((e) =>
            e.type === "belt" ? { ...e, fixedNodeEndID: load.id } : e,
          ),
          load,
        ],
      },
      actions: [],
    };
    const dropped = drag_through(byNode, [[120, 0], ...arc(0, 0, -400)]);
    expect(beltOf(dropped).attachedGearsIDs).toEqual([expect.objectContaining({ id: "a", turns: 1 })]);
    expect(validate_mechanism(dropped.mechanism)).toBeNull();
  });

  it("lays the belt over a pulley its start is pulled round, ahead of the others", () => {
    const fromStart: World = {
      ...world("MovingEdgeStartPoint"),
    };
    fromStart.mechanism = {
      ...fromStart.mechanism,
      mechanicalElements: fromStart.mechanism.mechanicalElements.map((e) =>
        e.id === ("b" as ID) ? { ...e, position: new Point2(-300, 0) } : e.id === ("ax-b" as ID) ? { ...e, position: new Point2(-300, 0) } : e,
      ),
    };
    const dropped = drag_through(fromStart, [[-150, 0], [-220, 60], ...arc(-300, 90, 180)]);
    expect(beltOf(dropped).attachedGearsIDs.map((g) => g.id)).toEqual(["b", "a"]);
    expect(validate_mechanism(dropped.mechanism)).toBeNull();
  });
});

describe("a route travelled from its other end", () => {
  it("is the same belt", () => {
    const route = [
      { gear: { position: new Point2(0, 0), radius: 40 } as GearElement, clockwise: false },
      { gear: { position: new Point2(300, 0), radius: 40 } as GearElement, clockwise: true },
    ];
    const start = new Point2(-150, 80);
    const end = new Point2(450, 80);
    const length = (vias: ReturnType<typeof open_belt_vias>) =>
      belt_pieces(vias).reduce((sum, p) => sum + p.length, 0);
    const reversed = reversed_route(route.map(({ gear, clockwise }) => ({ id: "g" as ID, clockwise, gear })))
      .map(({ clockwise }, i) => ({ gear: route[route.length - 1 - i].gear, clockwise }));
    expect(length(open_belt_vias(end, reversed, start))).toBeCloseTo(length(open_belt_vias(start, route, end)), 9);
  });
});

describe("a gear taken by its body", () => {
  const axle: PivotElement = {
    type: "pivot",
    id: "ax" as ID,
    probes: [],
    overlays: {},
    position: new Point2(0, 0),
    isGrounded: false,
    rotatingEdgesIDs: [],
    fixedGearsIDs: ["g" as ID],
    motor: undefined,
    rotationalFriction: 0,
  };
  const gear: GearElement = {
    type: "gear",
    id: "g" as ID,
    probes: [],
    overlays: {},
    position: new Point2(0, 0),
    angle: 0,
    radius: 40,
    parentAxleID: axle.id,
    fixedNodesBodyIDs: [],
    meshedGearsIDs: [],
    attachedBeltID: undefined,
    surfaceMass: 1,
  };
  const body = (x: number, y: number): HoveredPart => ({
    type: "GearTooth",
    id: gear.id,
    position: new Point2(x, y),
    deleting: false,
    body: true,
  });
  const move: CanvasEvent = { type: "MouseMove", mouseDelta: new Point2(0, 0) };
  const selecting = (): World => ({
    state: { type: "Selecting" },
    mechanism: { ...EMPTY, mechanicalElements: [axle, gear] },
    actions: [],
  });

  it("selects the gear on a click", () => {
    const clicked = click(selecting(), 20, 10, body(20, 10));
    expect(clicked.state).toMatchObject({ type: "SelectedElement", elementID: gear.id });
  });

  it("moves its axle when dragged, held where it was grabbed", () => {
    const pressed = step(selecting(), press, 20, 10, body(20, 10));
    const grabbed = step(pressed, move, 30, 10, body(30, 10));
    expect(grabbed.state).toEqual({
      type: "MovingNode",
      elementID: axle.id,
      grabOffset: new Point2(20, 10),
      selects: gear.id,
    });
    expect(selected_ids(grabbed.state)).toEqual([gear.id]);
    // The canvas reads the cursor back by the offset: at (60, 10), the axle is aimed at (40, 0).
    const moved = step(grabbed, move, 60, 10, { type: "Void", position: new Point2(40, 0) });
    expect(moved.actions).toContainEqual(
      expect.objectContaining({
        type: "MoveNode",
        id: axle.id,
        newPosition: new Point2(40, 0),
        oldPosition: new Point2(0, 0),
      }),
    );
    // The gear the drag was started on stays selected once dropped.
    expect(step(moved, release, 60, 10, { type: "Void", position: new Point2(40, 0) }).state).toEqual({
      type: "SelectedElement",
      elementID: gear.id,
    });
  });
});

describe("a finger tapping the first step of a placement", () => {
  it("puts down the gear its preview showed whole", () => {
    set_pointer_kind("touch");
    const tapped = click(start({ type: "PlacingGearStart" }), 0);
    expect(
      tapped.mechanism.mechanicalElements.filter((e) => e.type === "gear"),
    ).toHaveLength(1);
    expect(tapped.state.type).toBe("PlacingGearStart");
  });

  it("puts down nothing for a segment, whose preview showed only its start", () => {
    set_pointer_kind("touch");
    const tapped = click(start({ type: "PlacingBeamStart" }), 0);
    expect(tapped.mechanism.mechanicalElements).toEqual([]);
    expect(tapped.state.type).toBe("PlacingBeamStart");
  });
});
