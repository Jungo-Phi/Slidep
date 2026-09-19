import { body_centre } from "../../solver/analysis/force-balance";
import type { ID, MechanicalElement } from "../../../types/element";
import type { WorldPoint } from "../../../types";
import type { OverlayArrow, OverlayMoment } from "./drawing-functions";

/**
 * Re-anchoring the readings of a recorded frame onto the pose actually on screen.
 *
 * A reading is measured at one instant and drawn at the point its own element occupies — the two are the same pose every frame, except while a mode is being swung: the swing moves the bodies without moving the recording, and a reading left at the anchor its instant gave it would hang in place while the body it belongs to walks away.
 * The value is not re-derived, only the anchor: what is shown is still the reading of the instant the recording holds, carried along by the body it is read from.
 */

/** Where `reading` sits on `element`: an end for what an end carries, the body's centre for what the body carries as a whole — the very rule `use-simulation-playback.ts` anchors it by. */
function anchor_on(
  reading: { which?: "node" | "start" | "end" },
  element: MechanicalElement,
): WorldPoint | undefined {
  if (reading.which === "start" || reading.which === "end")
    return "positionStart" in element
      ? reading.which === "start"
        ? element.positionStart
        : element.positionEnd
      : undefined;
  return body_centre(element);
}

/** The other end of the member a reading sits at, which is the side its half-arc is drawn on (`OverlayMoment.direction`). */
function direction_on(
  moment: OverlayMoment,
  element: MechanicalElement,
  at: WorldPoint,
): WorldPoint | undefined {
  if (moment.which !== "start" && moment.which !== "end") return moment.direction;
  if (!("positionStart" in element)) return moment.direction;
  return (
    moment.which === "start" ? element.positionEnd : element.positionStart
  ).sub(at);
}

/**
 * Where a term of the force balance is drawn: its own element's centre on the pose on screen.
 * The balance is read off the pose the panel last rendered, which trails the canvas by a mirror tick and parts from it entirely wherever the panel stops being handed new instants — so the point comes from the drawing rather than from the term, and a term whose element is gone keeps its own.
 * Terms that are not read at a body (a load, applied where it was placed) have no such anchor.
 */
export function balance_term_anchor(
  term: { kind: string; elementID: ID },
  elements: MechanicalElement[],
): WorldPoint | undefined {
  if (term.kind === "load") return undefined;
  const element = elements.find((el) => el.id === term.elementID);
  return element ? body_centre(element) : undefined;
}

/** `readings` carried onto `elements`, the same array where every one of them already sits where its element is. */
export function anchored_arrows(
  readings: OverlayArrow[],
  elements: MechanicalElement[],
): OverlayArrow[] {
  return anchored(readings, elements, (reading, at) => ({ ...reading, at }));
}

/** `anchored_arrows` for the rotation half, whose glyph also takes the side it is drawn on from the member it sits at. */
export function anchored_moments(
  readings: OverlayMoment[],
  elements: MechanicalElement[],
): OverlayMoment[] {
  return anchored(readings, elements, (reading, at, element) => ({
    ...reading,
    at,
    direction: direction_on(reading, element, at),
  }));
}

function anchored<T extends OverlayArrow | OverlayMoment>(
  readings: T[],
  elements: MechanicalElement[],
  moved: (reading: T, at: WorldPoint, element: MechanicalElement) => T,
): T[] {
  let changed = false;
  const carried = readings.map((reading) => {
    const element = elements.find((el) => el.id === reading.elementID);
    if (!element) return reading;
    const at = anchor_on(reading, element);
    if (!at || (at.x === reading.at.x && at.y === reading.at.y)) return reading;
    changed = true;
    return moved(reading, at, element);
  });
  return changed ? carried : readings;
}
