/**
 * When two edges are superposed, stated once for everyone who needs to know.
 *
 * Pure predicates over the elements alone, so the hover rules, the validator and
 * the fusion pass all read the same rule without pulling each other in.
 */

import type { EdgeType, MechanicalElement } from "../types/element";

/**
 * The one pair of types allowed to hold the same two nodes: a spring and a
 * damper in parallel model a real assembly (Kelvin-Voigt), so they coexist and
 * are drawn side by side. Any other combination is a superposition to collapse —
 * a new edge type is never superposable until it is named here.
 */
export const COEXISTING_EDGE_TYPES: readonly EdgeType[] = ["spring", "damper"];

/**
 * The two nodes an edge holds, as an order-independent key — `undefined` when it
 * holds fewer than two.
 *
 * A belt never answers: it is defined by the pulleys it runs over, so two belts
 * sharing terminals are not the same belt. A degenerate edge, both ends on one
 * node, does not answer either.
 */
export function edge_terminal_pair(edge: MechanicalElement): string | undefined {
  if (!("positionStart" in edge) || edge.type === "belt") return undefined;
  const start = edge.fixedNodeStartID;
  const end = edge.fixedNodeEndID;
  if (!start || !end || start === end) return undefined;
  return start < end ? `${start}|${end}` : `${end}|${start}`;
}

/** Whether these edges are the exact pair allowed to share their two nodes. */
export function edges_may_coexist(edges: readonly MechanicalElement[]): boolean {
  if (edges.length !== 2) return false;
  const types = edges.map((edge) => edge.type);
  return COEXISTING_EDGE_TYPES.every((type) => types.includes(type));
}

/** The edges holding each pair of nodes, keyed by `edge_terminal_pair`. */
export function edges_by_terminal_pair(
  mechanicalElements: readonly MechanicalElement[],
): Map<string, MechanicalElement[]> {
  const groups = new Map<string, MechanicalElement[]>();
  for (const element of mechanicalElements) {
    const pair = edge_terminal_pair(element);
    if (!pair) continue;
    const group = groups.get(pair);
    if (group) group.push(element);
    else groups.set(pair, [element]);
  }
  return groups;
}
