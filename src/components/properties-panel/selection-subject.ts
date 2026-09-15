import { ID, LoadElement, MechanicalElement, Mechanism } from "../../types";
import { Reading, reading_from_focus } from "./element-readings";
import type { FocusedOverlay } from "../canvas/drawing/drawing-functions";

/**
 * What the simulation panel is currently reading: one element, one applied load, or one overlay reading.
 * A reading is not a selection — naming one on the canvas leaves the selection alone (see `App`'s own `focusedOverlay`) — so it is resolved first, and stands in for whatever happens to be selected underneath it.
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
