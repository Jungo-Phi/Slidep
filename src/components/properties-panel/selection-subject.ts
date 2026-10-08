import { ID, LoadElement, MechanicalElement, Mechanism } from "../../types";
import { Reading, merged_internal, reading_from_focus } from "./element-readings";
import type { FocusedOverlay } from "../canvas/drawing/drawing-functions";
import type { CanvasState } from "../../types/canvas-state";

/**
 * What the simulation panel is currently reading: one element, one applied load, or one overlay reading.
 * A reading is not a selection in `CanvasState`'s sense — naming one on the canvas leaves the selection alone (see `App`'s own `focusedOverlay`) — so it is resolved first, and stands in for whatever happens to be selected underneath it.
 *
 * To the reader, though, the subject IS what they selected: they clicked an arrow, and its panel came up.
 * "The selected thing appears at the top" therefore means the SUBJECT appears at the top, whatever `CanvasState` holds — the element for an element, the load for a load, and the reading's own row for a reading, not the element it happens to be read from.
 */
export type InspectedSubject =
  | { kind: "element"; element: MechanicalElement }
  | { kind: "load"; load: LoadElement; host: MechanicalElement }
  | { kind: "reading"; reading: Reading; element: MechanicalElement };

/**
 * The subject `SelectionInspector` shows, or `undefined` when the selection names nothing it can read: nothing selected, several things at once, or a constraint.
 * Reads the mechanism in the pose on screen, so every value it leads to is the one being displayed rather than the one being edited.
 */
export function inspected_subject(
  selectedIds: ID[],
  focusedOverlay: FocusedOverlay | null,
  mechanism: Mechanism,
): InspectedSubject | undefined {
  if (focusedOverlay) {
    const element = mechanism.mechanicalElements.find(
      (el) => el.id === focusedOverlay.elementID,
    );
    if (element)
      return {
        kind: "reading",
        reading: reading_from_focus(focusedOverlay, element),
        element,
      };
  }
  if (selectedIds.length !== 1) return undefined;
  const id = selectedIds[0];
  const load = mechanism.loads.find((l) => l.id === id);
  if (load) {
    const host = mechanism.mechanicalElements.find(
      (el) => el.id === load.targetID,
    );
    return host ? { kind: "load", load, host } : undefined;
  }
  const element = mechanism.mechanicalElements.find((el) => el.id === id);
  return element ? { kind: "element", element } : undefined;
}

/**
 * The reading still named once the canvas has moved to `state`.
 * A reading goes stale with any new canvas state, except a member's internal effort when the new state selects another member of the same kind: the reader is going through the members, and expects to land on the same reading of the next one.
 * Selecting the member the reading already belongs to gives it up, like any other click away from it.
 */
export function carried_focus(
  focus: FocusedOverlay | null,
  state: CanvasState,
  elements: MechanicalElement[],
): FocusedOverlay | null {
  if (!focus || !merged_internal(focus) || state.type !== "SelectedElement")
    return null;
  if (state.elementID === focus.elementID) return null;
  const from = elements.find((el) => el.id === focus.elementID);
  const to = elements.find((el) => el.id === state.elementID);
  if (!from || !to || from.type !== to.type) return null;
  return { elementID: to.id, kind: focus.kind };
}
