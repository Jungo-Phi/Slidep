import { afterEach, describe, expect, it } from "vitest";
import { Point2 } from "../../../types/point2";
import type { Action, CanvasEvent } from "../../../types/actions";
import type { CanvasState } from "../../../types/canvas-state";
import type { HoveredPart } from "../../../types/hovered-part";
import type { BeamElement, ID } from "../../../types/element";
import type { MaterialDef, ProfileDef } from "../../../types/material";
import {
  DEFAULT_METADATA,
  DEFAULT_SIMULATION,
  type Mechanism,
} from "../../../types/mechanism";
import { apply_actions } from "../../mechanism/apply-actions";
import { set_pointer_kind } from "../../../utils/pointer-kind";
import { canvasStateReducer } from "./canvas-state-reducer";

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
