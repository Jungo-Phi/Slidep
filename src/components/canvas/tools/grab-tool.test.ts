import { describe, expect, it } from "vitest";
import { Point2 } from "../../../types/point2";
import type { Action, CanvasEvent } from "../../../types/actions";
import type { CanvasState } from "../../../types/canvas-state";
import type { HoveredPart } from "../../../types/hovered-part";
import type { ID, LoadElement, MechanicalElement } from "../../../types/element";
import { canvasStateReducer } from "./canvas-state-reducer";
import { is_at_rest } from "../context-menu/context-entries";

const FREE = "free" as ID;
const GROUNDED = "grounded" as ID;

const MECHANICAL = [
  { id: FREE, type: "pivot", isGrounded: false },
  { id: GROUNDED, type: "pivot", isGrounded: true },
] as unknown as MechanicalElement[];

const FORCE = "force" as ID;
const LOADS = [{ id: FORCE, type: "force", targetID: FREE }] as unknown as LoadElement[];

const node = (id: ID): HoveredPart => ({
  type: "Node",
  id,
  position: new Point2(0, 0),
  deleting: false,
  beamBodyHover: false,
});

const PRESS: CanvasEvent = { type: "MouseLeftButtonDown", shiftKey: false };
const RELEASE: CanvasEvent = { type: "MouseButtonUp", dragged: false };
const MOVE: CanvasEvent = {
  type: "MouseMove",
  mouseDelta: new Point2<"screen">(1, 0),
};

/** One event over node `id`, the cursor at `x` and the left button held. */
function step(
  state: CanvasState,
  event: CanvasEvent,
  id: ID,
  { x = 0, simulating = false, applied = [] as Action[][] } = {},
): CanvasState {
  const at = new Point2<"world">(x, 0);
  let next = state;
  canvasStateReducer(
    state,
    node(id),
    at,
    "left",
    event,
    MECHANICAL,
    [],
    LOADS,
    [],
    [],
    { scale: 1, pan: new Point2(0, 0) },
    (s) => (next = s),
    (actions) => applied.push(actions),
    () => {},
    () => {},
    () => {},
    simulating,
    () => {},
    () => {},
    at,
  );
  return next;
}

describe("the grab tool", () => {
  it("pulls on a part once the drag crosses its threshold, and hands over to the selection tool once let go", () => {
    const pressed = step({ type: "Grabbing" }, PRESS, FREE);
    expect(pressed.type).toBe("Grabbing");
    const dragged = step(pressed, MOVE, FREE, { x: 100 });
    expect(dragged).toMatchObject({ type: "SimulationDragging", elementID: FREE });
    // The pull has set the mechanism moving, where the grab tool does not exist.
    expect(step(dragged, RELEASE, FREE, { simulating: true })).toEqual({ type: "Selecting" });
  });

  it("is put away by a right click, as every other tool is", () => {
    expect(is_at_rest({ type: "Grabbing" })).toBe(false);
    expect(step({ type: "Grabbing" }, { type: "MouseRightButtonDown" }, FREE)).toEqual({ type: "Selecting" });
  });

  it("does nothing on a click without a drag", () => {
    const pressed = step({ type: "Grabbing" }, PRESS, FREE);
    expect(step(pressed, RELEASE, FREE)).toEqual({ type: "Grabbing" });
  });

  it("pulls on a grounded node too", () => {
    const pressed = step({ type: "Grabbing" }, PRESS, GROUNDED);
    expect(step(pressed, MOVE, GROUNDED, { x: 100 })).toMatchObject({ type: "SimulationDragging", elementID: GROUNDED });
  });

  it("is not armed by its key in simulation", () => {
    const key: CanvasEvent = { type: "KeyDown", key: "a", ctrlKey: false };
    expect(step({ type: "Selecting" }, key, FREE, { simulating: true })).toEqual({ type: "Selecting" });
    expect(step({ type: "Selecting" }, key, FREE).type).toBe("Grabbing");
  });
});

describe("the selection tool in simulation", () => {
  it("selects on a click", () => {
    const pressed = step({ type: "Selecting" }, PRESS, FREE, { simulating: true });
    expect(pressed).toMatchObject({ type: "SelectedElement", elementID: FREE });
    expect(step(pressed, RELEASE, FREE, { simulating: true })).toMatchObject({
      type: "SelectedElement",
      elementID: FREE,
    });
  });

  it("pulls on a part dragged, which stays selected once let go", () => {
    const pressed = step({ type: "Selecting" }, PRESS, FREE, { simulating: true });
    const dragged = step(pressed, MOVE, FREE, { x: 100, simulating: true });
    expect(dragged).toMatchObject({ type: "SimulationDragging", elementID: FREE, selectedID: FREE });
    expect(step(dragged, RELEASE, FREE, { simulating: true })).toEqual({
      type: "SelectedElement",
      elementID: FREE,
    });
  });

  it("pulls on a grounded node dragged", () => {
    const pressed = step({ type: "Selecting" }, PRESS, GROUNDED, { simulating: true });
    expect(pressed).toMatchObject({ type: "SelectedElement", elementID: GROUNDED });
    expect(step(pressed, MOVE, GROUNDED, { x: 100, simulating: true })).toMatchObject({
      type: "SimulationDragging",
      elementID: GROUNDED,
      selectedID: GROUNDED,
    });
  });

  it("keeps its multiple selection", () => {
    const shiftPress: CanvasEvent = { type: "MouseLeftButtonDown", shiftKey: true };
    const both = step({ type: "SelectedElement", elementID: GROUNDED }, shiftPress, FREE, {
      simulating: true,
    });
    expect(both).toMatchObject({ type: "SelectedMultiple" });
    // A press on the selection does not move it, as it would at rest.
    const pressed = step({ type: "SelectedMultiple", elementIDs: [FREE, GROUNDED] }, PRESS, FREE, {
      simulating: true,
    });
    expect(pressed).toMatchObject({ type: "SelectedElement", elementID: FREE });
  });

  it("deletes nothing but loads on the Delete key", () => {
    const key: CanvasEvent = { type: "KeyDown", key: "Delete", ctrlKey: false };
    const kept: Action[][] = [];
    const part: CanvasState = { type: "SelectedElement", elementID: FREE };
    expect(step(part, key, FREE, { simulating: true, applied: kept })).toEqual(part);
    const mixed: CanvasState = { type: "SelectedMultiple", elementIDs: [FREE, FORCE] };
    expect(step(mixed, key, FREE, { simulating: true, applied: kept })).toEqual(mixed);
    expect(kept.flat()).toEqual([]);

    const deleted: Action[][] = [];
    const load: CanvasState = { type: "SelectedElement", elementID: FORCE };
    expect(step(load, key, FREE, { simulating: true, applied: deleted })).toEqual({ type: "Selecting" });
    expect(deleted.flat()).toEqual([{ type: "DeleteElement", element: LOADS[0] }]);
  });
});
