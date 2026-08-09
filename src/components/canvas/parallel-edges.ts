/**
 * Where a spring and a damper sharing two nodes are drawn, so they read as two
 * elements in parallel rather than one on top of the other.
 *
 * Only the drawn body moves: an edge's `positionStart` and `positionEnd` stay on
 * their nodes, so everything anchored to it — loads, dimensions, the probe badge,
 * the solver — keeps reading the same geometry. What the offset must not do is
 * disagree between the stroke and the cursor, which is why drawing and
 * hit-testing both come here.
 */

import type { ID, MechanicalElement } from "../../types/element";
import type { ScreenPoint } from "../../types";
import { DIM } from "../../constants/rendering-specs";
import {
  edges_by_terminal_pair,
  edges_may_coexist,
} from "../../utils/edge-rules";

/**
 * Which side each type takes. Keyed on the type rather than on an ordering of
 * ids, so the pair never swaps sides between two frames — and the coexisting
 * pair is exactly these two types.
 */
const SIDE: Partial<Record<string, number>> = { spring: 1, damper: -1 };

/**
 * The lateral offsets, in screen pixels, of the edges drawn beside one another.
 * An edge absent from the map is drawn on its own axis.
 *
 * Built for the whole mechanism in one pass: it is read once per frame by the
 * drawing and once per move by the hover, both of which would otherwise pay a
 * scan per edge.
 */
export function parallel_edge_offsets(
  mechanicalElements: readonly MechanicalElement[],
): Map<ID, number> {
  const offsets = new Map<ID, number>();
  for (const group of edges_by_terminal_pair(mechanicalElements).values()) {
    if (!edges_may_coexist(group)) continue;
    for (const edge of group) {
      const side = SIDE[edge.type];
      if (side !== undefined)
        offsets.set(edge.id, side * DIM.PARALLEL_EDGE_OFFSET);
    }
  }
  return offsets;
}

/** The same two ends, moved off the axis by `offset` screen pixels. */
export function offset_ends(
  start: ScreenPoint,
  end: ScreenPoint,
  offset: number,
): { start: ScreenPoint; end: ScreenPoint } {
  if (!offset) return { start, end };
  const delta = end.sub(start);
  if (delta.length_squared() < 1e-9) return { start, end };
  const away = delta.perp().normalize().mul(offset);
  return { start: start.add(away), end: end.add(away) };
}
