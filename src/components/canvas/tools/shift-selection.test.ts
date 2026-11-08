import { describe, expect, it } from "vitest";
import { Point2 } from "../../../types/point2";
import type { CanvasEvent } from "../../../types/actions";
import type { CanvasState } from "../../../types/canvas-state";
import type { HoveredPart } from "../../../types/hovered-part";
import type {
  ConstraintElement,
  ID,
  MechanicalElement,
} from "../../../types/element";
import { canvasStateReducer } from "./canvas-state-reducer";

const A = "a" as ID;
const B = "b" as ID;
const C = "c" as ID;
const DIMENSION = "dimension" as ID;

const MECHANICAL = [A, B, C].map(
  (id) => ({ id, type: "beam" }) as unknown as MechanicalElement,
);
const CONSTRAINTS = [
  { id: DIMENSION, type: "Distance", value: 1 } as unknown as ConstraintElement,
];

const over = (id: ID): HoveredPart => ({
  type: "Edge",
  id,
  part: "body",
  position: new Point2(0, 0),
  deleting: false,
});

/** One event over `id`, the left button held. */
function step(state: CanvasState, event: CanvasEvent, id: ID): CanvasState {
  const at = new Point2<"world">(0, 0);
  let next = state;
  canvasStateReducer(
    state,
    over(id),
    at,
    "left",
    event,
    MECHANICAL,
    CONSTRAINTS,
    [],
    [],
    [],
    { scale: 1, pan: new Point2(0, 0) },
    (s) => (next = s),
    () => {},
    () => {},
    () => {},
    () => {},
    false,
    false,
    () => {},
    () => {},
    at,
  );
  return next;
}

const SHIFT_PRESS: CanvasEvent = { type: "MouseLeftButtonDown", shiftKey: true };
const RELEASE: CanvasEvent = { type: "MouseButtonUp", dragged: false };
const MOVE: CanvasEvent = {
  type: "MouseMove",
  mouseDelta: new Point2<"screen">(1, 0),
};

const shift_click = (state: CanvasState, id: ID) =>
  step(step(state, SHIFT_PRESS, id), RELEASE, id);

describe("a Shift click on the selection", () => {
  it("deselects the only selected element", () => {
    expect(shift_click({ type: "SelectedElement", elementID: A }, A)).toEqual({
      type: "Selecting",
    });
  });

  it("deselects a dimension, even when the pointer shifts during the click", () => {
    const pressed = step(
      { type: "SelectedElement", elementID: DIMENSION },
      SHIFT_PRESS,
      DIMENSION,
    );
    const moved = step(pressed, MOVE, DIMENSION);
    expect(step(moved, RELEASE, DIMENSION)).toEqual({ type: "Selecting" });
  });

  it("reduces a selection of two to the element that remains", () => {
    expect(
      shift_click({ type: "SelectedMultiple", elementIDs: [A, B] }, B),
    ).toEqual({ type: "SelectedElement", elementID: A });
  });

  it("removes one element from a larger selection", () => {
    expect(
      shift_click({ type: "SelectedMultiple", elementIDs: [A, B, C] }, C),
    ).toEqual({ type: "SelectedMultiple", elementIDs: [A, B] });
  });

  it("adds a mechanical element to the selection", () => {
    expect(shift_click({ type: "SelectedElement", elementID: A }, B)).toEqual({
      type: "SelectedMultiple",
      elementIDs: [A, B],
    });
  });

  it("leaves the selection as it is on an overlay", () => {
    expect(
      shift_click({ type: "SelectedElement", elementID: A }, DIMENSION),
    ).toEqual({ type: "SelectedElement", elementID: A });
  });
});
