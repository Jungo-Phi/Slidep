/**
 * When a belt is a closed loop, stated once for everyone who needs to know.
 *
 * Pure predicates over the element alone, so the hover rules, the validator and
 * the repair pass all read the same rule without pulling each other in.
 */

import type { BeltElement, ID } from "../types/element";

/**
 * Pulleys a closed belt must run over. One pulley makes a band around a single
 * wheel: geometrically drawable, but it transmits nothing and its two terminals
 * are the same point.
 */
export const MIN_PULLEYS_TO_CLOSE = 2;

/** Whether a belt running over `pulleys` pulleys may be closed at all. */
export function belt_can_close(pulleys: number): boolean {
  return pulleys >= MIN_PULLEYS_TO_CLOSE;
}

/**
 * How many pulleys a belt being placed runs over: its route, plus the gear the
 * gesture started on when the route does not list it yet — a start on a gear
 * only enters the route once a next via exists to orient its wrap.
 */
export function belt_placing_pulleys(
  routed: readonly { id: ID }[],
  startGearID: ID | undefined,
): number {
  const startIsExtra =
    startGearID !== undefined && !routed.some((g) => g.id === startGearID);
  return routed.length + (startIsExtra ? 1 : 0);
}

/**
 * Whether the belt's loop physically exists: enough pulleys, and both terminals
 * held by one junction node.
 *
 * `closed` must equal this — the equivalence holds both ways. Losing a pulley
 * opens the belt; joining both terminals onto one node closes it. A belt whose
 * flag disagrees is incoherent, not merely untidy.
 */
export function belt_is_looped(belt: BeltElement): boolean {
  return (
    belt_can_close(belt.attachedGearsIDs.length) &&
    belt_junction_id(belt) !== undefined
  );
}

/**
 * The pulley a belt terminal wraps: the first attached gear for the start
 * terminal, the last for the end. A terminal may rest ON that pulley's rim — it
 * is then a wound end — but never inside it.
 */
export function belt_terminal_pulley_id(
  belt: BeltElement,
  which: "start" | "end",
): ID | undefined {
  const gears = belt.attachedGearsIDs;
  if (gears.length === 0) return undefined;
  return which === "start" ? gears[0].id : gears[gears.length - 1].id;
}

/** The node holding both terminals, when one node holds both. */
export function belt_junction_id(belt: BeltElement): ID | undefined {
  if (!belt.fixedNodeStartID) return undefined;
  return belt.fixedNodeStartID === belt.fixedNodeEndID
    ? belt.fixedNodeStartID
    : undefined;
}
