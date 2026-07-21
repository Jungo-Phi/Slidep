/**
 * Momentary separation of what a disconnection leaves visually ambiguous.
 *
 * Detaching two elements that still touch on the canvas — superposed at a point,
 * or meeting at a rim — leaves nothing to show they are now free of each other.
 * These links push them apart once, so that what is still connected reads at a
 * glance. Three shapes of contact, three separations:
 *
 *   • an edge terminal on a node   → part the two points (a preferred axis lets
 *                                     a belt end slide along the belt);
 *   • two meshed gear rims         → part the centres past their touching gap;
 *   • a body node on a beam        → lift the node off along the beam normal.
 *
 * Momentary on purpose. A standing minimum distance would fight the legitimate
 * superpositions — a node sliding along a beam it is not fixed to, elements
 * stacked before being connected — and compete with the real constraints. The
 * links live for the solve that follows the disconnection, and nothing after.
 */

import { DIM } from "../../constants/rendering-specs";
import type { Action, ID, Link, Mechanism, Point2 } from "../../types";
import { belt_pieces, belt_point_tangent } from "../../utils/belt-path";
import { get_belt_vias } from "../../utils/belt-geom";

/** An edge terminal and the node it was pinned to, held at one same point. */
function terminal_on_node(
  action: Action,
): { terminal: string; node: ID } | undefined {
  switch (action.type) {
    case "ConnectsFixedNodeStart":
      return { terminal: `${action.elementID}:start`, node: action.connectID };
    case "ConnectsFixedNodeEnd":
      return { terminal: `${action.elementID}:end`, node: action.connectID };
    default:
      return undefined;
  }
}

/** The axis a key would rather leave along, when its geometry names one. */
export type PreferredAxes = Map<string, Point2>;

/**
 * Belt terminals leave along the belt itself rather than sideways, so a freed
 * end slides on the path instead of jumping off it.
 *
 * Each axis is oriented so that the terminal — which the solver moves *against*
 * its axis — travels into the belt, away from the junction it just left.
 */
export function belt_terminal_axes(mechanism: Mechanism): PreferredAxes {
  const axes: PreferredAxes = new Map();
  for (const el of mechanism.mechanicalElements) {
    if (el.type !== "belt" || el.attachedGearsIDs.length === 0) continue;
    const vias = get_belt_vias(el, mechanism.mechanicalElements);
    const total = belt_pieces(vias, false).reduce((a, p) => a + p.length, 0);
    axes.set(
      `${el.id}:start`,
      belt_point_tangent(vias, 0, false).tangent.mul(-1),
    );
    axes.set(`${el.id}:end`, belt_point_tangent(vias, total, false).tangent);
  }
  return axes;
}

/**
 * Momentary links that push apart everything `actions` disconnects.
 *
 * Only the pair that remains — both sides still present — is ambiguous, so any
 * separation naming a deleted element is dropped. The one exception is a node
 * deleted from *under* several edge terminals (a closed belt's junction): the
 * terminals it held stay superposed with each other, so they part pairwise.
 */
export function separation_links(
  actions: Action[],
  mechanism: Mechanism,
  preferredAxes: PreferredAxes = new Map(),
): Link[] {
  const byID = new Map<ID, Mechanism["mechanicalElements"][number]>(
    mechanism.mechanicalElements.map((el) => [el.id, el]),
  );
  const deleted = new Set<ID>(
    actions.flatMap((a) => (a.type === "DeleteElement" ? [a.element.id] : [])),
  );
  const present = (id: ID) => byID.has(id) && !deleted.has(id);

  const links: Link[] = [];
  const distance = (
    key1: string,
    key2: string,
    target: number,
    axis?: Point2,
  ) =>
    links.push({
      type: "Distance",
      ddl: 1,
      key1,
      key2,
      distance: target,
      preferredAxis: axis,
    });
  const axisOf = (key: string) => preferredAxes.get(key);

  // ── Edge terminals pinned to a node: coincident, part by the separation gap.
  //    Grouped by node so that deleting the node parts the terminals it held
  //    from each other instead of from the vanished node.
  const terminalsByNode = new Map<ID, Set<string>>();
  for (const action of actions) {
    if (!("disconnect" in action) || !action.disconnect) continue;
    const pair = terminal_on_node(action);
    if (!pair) continue;
    const set = terminalsByNode.get(pair.node) ?? new Set<string>();
    set.add(pair.terminal);
    terminalsByNode.set(pair.node, set);
  }
  for (const [node, terminals] of terminalsByNode) {
    const keys = [...terminals];
    if (present(node)) {
      for (const key of keys)
        distance(key, `${node}`, DIM.DISCONNECT_SEPARATION, axisOf(key));
      continue;
    }
    for (let i = 0; i < keys.length; i++)
      for (let j = i + 1; j < keys.length; j++)
        distance(
          keys[i],
          keys[j],
          DIM.DISCONNECT_SEPARATION,
          axisOf(keys[i]) ?? axisOf(keys[j]),
        );
  }

  // ── Meshed gears touch at the rim: push the centres apart past their current
  //    gap so the rims part. Both gears carry the connection, hence the dedup.
  const meshedSeen = new Set<string>();
  for (const action of actions) {
    if (action.type !== "ConnectsMeshedGears" || !action.disconnect) continue;
    const { elementID: a, connectID: b } = action;
    const pairKey = [a, b].sort().join("|");
    if (meshedSeen.has(pairKey)) continue;
    meshedSeen.add(pairKey);
    if (!present(a) || !present(b)) continue;
    const ea = byID.get(a);
    const eb = byID.get(b);
    if (!ea || !eb || !("position" in ea) || !("position" in eb)) continue;
    const current = ea.position.distance_to(eb.position);
    distance(`${a}`, `${b}`, current + DIM.DISCONNECT_SEPARATION);
  }

  // ── A body node sits on the beam it was fixed to: lift it off the segment.
  //    The perpendicular direction (the beam normal) is DistanceToLine's own
  //    fallback when the node is exactly on the line — so no axis to supply.
  for (const action of actions) {
    if (action.type !== "ConnectsFixedNodesBody" || !action.disconnect)
      continue;
    const { elementID: beam, connectID: node } = action;
    if (!present(beam) || !present(node)) continue;
    links.push({
      type: "DistanceToLine",
      ddl: 1,
      key1: `${beam}:start`,
      key2: `${beam}:end`,
      key3: `${node}`,
      distance: DIM.DISCONNECT_SEPARATION,
    });
  }

  return links;
}
