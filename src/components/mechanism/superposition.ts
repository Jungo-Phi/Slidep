/**
 * Collapsing superposed edges: two edges holding the same pair of nodes draw
 * over one another and constrain the mechanism twice, so one absorbs the other.
 *
 * The rule itself lives in `edge-rules`; what is here is the machinery that
 * carries a fused edge's belongings over before it goes.
 */

import type { Action } from "../../types";
import type {
  ConstraintElement,
  EdgeElement,
  ID,
  LoadElement,
  MechanicalElement,
  NodeElement,
} from "../../types/element";
import { element_ref_fields } from "../../types/element-refs";
import { constraint_key } from "../../utils/validate-mechanism";
import {
  edges_by_terminal_pair,
  edges_may_coexist,
} from "../../utils/edge-rules";
import {
  connect_node_and_edge,
  delete_element,
  disconnect_element,
  get_connection_pair_types,
  start_simulation,
  type Simulation,
} from "./connect-actions";

/** Which edge of a superposed pair survives, and which is absorbed into it. */
interface EdgeFusion {
  survivorID: ID;
  absorbedID: ID;
}

/**
 * How a group of edges sharing two nodes must collapse.
 *
 * Two edges of one type are the same edge written twice: the eldest survives and
 * accumulates, so a stray second stroke over an existing bar costs nothing. Two
 * of different types are a conversion: the edge the gesture just brought takes
 * the others over, which is what draws a spring over a beam and gets a spring.
 *
 * `newness` ranks the candidates for that role; ties go to the youngest.
 */
function fusions_in_group(
  group: readonly MechanicalElement[],
  newness: ReadonlyMap<ID, number>,
): EdgeFusion[] {
  const fusions: EdgeFusion[] = [];

  const byType = new Map<string, MechanicalElement[]>();
  for (const edge of group) {
    const same = byType.get(edge.type);
    if (same) same.push(edge);
    else byType.set(edge.type, [edge]);
  }

  const representatives: MechanicalElement[] = [];
  for (const same of byType.values()) {
    representatives.push(same[0]);
    for (const other of same.slice(1))
      fusions.push({ survivorID: same[0].id, absorbedID: other.id });
  }

  if (representatives.length < 2 || edges_may_coexist(representatives))
    return fusions;

  const rank = (edge: MechanicalElement) => newness.get(edge.id) ?? 0;
  let survivor = representatives[representatives.length - 1];
  for (const edge of representatives)
    if (rank(edge) > rank(survivor)) survivor = edge;
  for (const other of representatives)
    if (other.id !== survivor.id)
      fusions.push({ survivorID: survivor.id, absorbedID: other.id });

  return fusions;
}

/**
 * Moves the nodes pinned along the absorbed edge onto the survivor.
 *
 * Only a beam carries nodes on its body, so a survivor that is not one releases
 * them instead — turning a bar into a spring drops the sliders that rode it,
 * exactly as erasing the bar would.
 */
function transfer_body_nodes(
  absorbedID: ID,
  survivorID: ID,
  sim: Simulation,
): void {
  const absorbed = sim.mechanicalElements.find((el) => el.id === absorbedID);
  if (!absorbed || !("fixedNodesBodyIDs" in absorbed)) return;

  for (const nodeID of [...absorbed.fixedNodesBodyIDs]) {
    const node = sim.mechanicalElements.find((el) => el.id === nodeID);
    if (!node) continue;

    // Both directions are cut before the survivor is offered: `connect_node_and_edge`
    // reads the node's `parentBeamID` to decide how to seat an edge, and would
    // demote the survivor to a plain edge list while the absorbed one still
    // holds that slot.
    sim.step(
      get_connection_pair_types(absorbedID, node).map((pairType) =>
        disconnect_element(node, absorbed, pairType, sim.mechanicalElements),
      ),
    );
    sim.step([
      disconnect_element(
        absorbed,
        node,
        "ConnectsFixedNodesBody",
        sim.mechanicalElements,
      ),
    ]);

    const survivor = sim.mechanicalElements.find((el) => el.id === survivorID);
    if (survivor?.type !== "beam") continue;
    sim.step(
      connect_node_and_edge(
        node as NodeElement,
        survivor,
        "body",
        sim.mechanicalElements,
        sim.loads,
      ),
    );
  }
}

/**
 * The same constraint, said of the survivor instead of the absorbed edge, or
 * `undefined` when it says nothing about the absorbed edge.
 *
 * `reversed` tells that the survivor runs from the other node: an angle read
 * along the edge's own direction is then measured from the opposite side.
 */
function retarget_constraint(
  constraint: ConstraintElement,
  absorbedID: ID,
  survivorID: ID,
  reversed: boolean,
): ConstraintElement | undefined {
  switch (constraint.type) {
    case "dimension-edge":
    case "dimension-edge-to-node":
    case "horizontal-align-edge":
    case "vertical-align-edge":
      return constraint.edgeID === absorbedID
        ? { ...constraint, edgeID: survivorID }
        : undefined;
    case "dimension-angle":
      if (constraint.startEdgeID === absorbedID)
        return {
          ...constraint,
          startEdgeID: survivorID,
          flipStart: reversed ? !constraint.flipStart : constraint.flipStart,
        };
      if (constraint.endEdgeID === absorbedID)
        return {
          ...constraint,
          endEdgeID: survivorID,
          flipEnd: reversed ? !constraint.flipEnd : constraint.flipEnd,
        };
      return undefined;
    case "normal":
    case "parallel":
    case "equal":
      if (constraint.startEdgeID === absorbedID)
        return { ...constraint, startEdgeID: survivorID };
      if (constraint.endEdgeID === absorbedID)
        return { ...constraint, endEdgeID: survivorID };
      return undefined;
    default:
      return undefined;
  }
}

/** Whether a constraint ends up naming one element in two of its operands. */
function names_one_element_twice(constraint: ConstraintElement): boolean {
  const ids = element_ref_fields(constraint).flatMap(({ ids }) => ids);
  return new Set(ids).size !== ids.length;
}

/**
 * Retargets every constraint held on the absorbed edge onto the survivor.
 *
 * One that would relate the survivor to itself, or repeat a relation the
 * mechanism already carries, is left where it is: the deletion that follows
 * takes it.
 */
function transfer_constraints(
  absorbedID: ID,
  survivorID: ID,
  reversed: boolean,
  sim: Simulation,
): void {
  for (const constraint of [...sim.constraintElements]) {
    const retargeted = retarget_constraint(
      constraint,
      absorbedID,
      survivorID,
      reversed,
    );
    if (!retargeted || names_one_element_twice(retargeted)) continue;
    const key = constraint_key(retargeted);
    if (
      sim.constraintElements.some(
        (other) => other.id !== constraint.id && constraint_key(other) === key,
      )
    )
      continue;
    sim.step([
      { type: "DeleteElement", element: constraint },
      { type: "CreateElement", element: retargeted },
    ]);
  }
}

/**
 * The same load, applied to the survivor instead of the absorbed edge, or
 * `undefined` when it must not follow.
 *
 * A `reversed` survivor runs from the other node, so its two ends trade places
 * and its local frame is the absorbed one turned by half a turn — a direction
 * stored in that frame keeps its world bearing only by changing sign.
 */
function retarget_load(
  load: LoadElement,
  absorbedID: ID,
  survivorID: ID,
  reversed: boolean,
  survivorIsBeam: boolean,
): LoadElement | undefined {
  const applied = load.targetID === absorbedID;
  const framed =
    "frame" in load &&
    load.frame !== "world" &&
    load.frame.edgeID === absorbedID;
  if (!applied && !framed) return undefined;
  // A distributed force is spread along a beam and nowhere else.
  if (applied && load.type === "distributed-force" && !survivorIsBeam)
    return undefined;

  const targetID = applied ? survivorID : load.targetID;
  const turned = framed && reversed;
  const traded = applied && reversed;

  switch (load.type) {
    case "moment":
      // A moment turns its host: no direction to re-express, no end to trade.
      return { ...load, targetID };
    case "force":
      return {
        ...load,
        targetID,
        frame: framed ? { mode: "edge", edgeID: survivorID } : load.frame,
        vector: turned ? load.vector.mul(-1) : load.vector,
        anchor:
          traded && load.anchor
            ? load.anchor === "start"
              ? "end"
              : "start"
            : load.anchor,
      };
    case "distributed-force":
      return {
        ...load,
        targetID,
        frame: framed ? { mode: "edge", edgeID: survivorID } : load.frame,
        direction: turned ? load.direction.mul(-1) : load.direction,
        magnitudeStart: traded ? load.magnitudeEnd : load.magnitudeStart,
        magnitudeEnd: traded ? load.magnitudeStart : load.magnitudeEnd,
      };
  }
}

/** Moves the loads applied to — or merely framed on — the absorbed edge over. */
function transfer_loads(
  absorbedID: ID,
  survivorID: ID,
  reversed: boolean,
  sim: Simulation,
): void {
  const survivorIsBeam =
    sim.mechanicalElements.find((el) => el.id === survivorID)?.type === "beam";
  for (const load of [...sim.loads]) {
    const moved = retarget_load(
      load,
      absorbedID,
      survivorID,
      reversed,
      survivorIsBeam,
    );
    if (!moved) continue;
    sim.step([
      { type: "DeleteElement", element: load },
      { type: "CreateElement", element: moved },
    ]);
  }
}

/**
 * Fuses the absorbed edge into the survivor: its body nodes, constraints and
 * loads move over, then it is deleted like any other element.
 *
 * The transfers run first on purpose — whatever they have moved no longer names
 * the absorbed edge, so the deletion only takes what could not follow.
 */
export function fuse_edges(
  survivorID: ID,
  absorbedID: ID,
  mechanicalElements: MechanicalElement[],
  constraintElements: ConstraintElement[],
  loads: LoadElement[],
): Action[] {
  const sim = start_simulation(mechanicalElements, constraintElements, loads);
  const absorbed = sim.mechanicalElements.find(
    (el) => el.id === absorbedID,
  ) as EdgeElement | undefined;
  const survivor = sim.mechanicalElements.find(
    (el) => el.id === survivorID,
  ) as EdgeElement | undefined;
  if (!absorbed || !survivor) return [];

  const reversed = absorbed.fixedNodeStartID !== survivor.fixedNodeStartID;

  transfer_body_nodes(absorbedID, survivorID, sim);
  transfer_constraints(absorbedID, survivorID, reversed, sim);
  transfer_loads(absorbedID, survivorID, reversed, sim);
  sim.step(
    delete_element(
      absorbedID,
      sim.mechanicalElements,
      sim.constraintElements,
      sim.loads,
    ),
  );
  return sim.actions;
}

/** How many edge terminals rest on this node. */
function terminals_held(
  nodeID: ID,
  mechanicalElements: readonly MechanicalElement[],
): number {
  let held = 0;
  for (const element of mechanicalElements) {
    if (!("positionStart" in element)) continue;
    if (element.fixedNodeStartID === nodeID) held++;
    if (element.fixedNodeEndID === nodeID) held++;
  }
  return held;
}

/**
 * Drops a junction the gesture minted and the fusion has made pointless: a join
 * is created to hold two edge ends together, and one of them has just been
 * absorbed into the other.
 *
 * Only joins born in this very bundle are considered — one the user placed is
 * theirs to keep, however little it holds. A join still pinned to a body, or
 * holding both ends of a belt it closes, is doing its job and stays.
 */
function drop_spent_junctions(
  created: ReadonlySet<ID>,
  sim: Simulation,
): void {
  for (const element of [...sim.mechanicalElements]) {
    if (element.type !== "join" || !created.has(element.id)) continue;
    if (terminals_held(element.id, sim.mechanicalElements) >= 2) continue;
    const pinned = sim.mechanicalElements.some(
      (other) =>
        "fixedNodesBodyIDs" in other &&
        other.fixedNodesBodyIDs.includes(element.id),
    );
    if (pinned) continue;
    sim.step(
      delete_element(
        element.id,
        sim.mechanicalElements,
        sim.constraintElements,
        sim.loads,
      ),
    );
  }
}

/**
 * The fusions a state owes to the superposition invariant, as one bundle.
 *
 * `newness` ranks the edges the gesture just brought; among edges of different
 * types it decides who survives, and it may be empty — a fusion born of two
 * nodes merging brought no edge at all. `created` names what the bundle minted,
 * so a junction the fusion strands can be taken back.
 */
export function superposition_fusions(
  mechanicalElements: MechanicalElement[],
  constraintElements: ConstraintElement[],
  loads: LoadElement[],
  newness: ReadonlyMap<ID, number>,
  created: ReadonlySet<ID>,
): Action[] {
  const groups = edges_by_terminal_pair(mechanicalElements);
  const sim = start_simulation(mechanicalElements, constraintElements, loads);
  let fused = false;
  for (const group of groups.values()) {
    if (group.length < 2 || edges_may_coexist(group)) continue;
    for (const { survivorID, absorbedID } of fusions_in_group(group, newness)) {
      sim.step(
        fuse_edges(
          survivorID,
          absorbedID,
          sim.mechanicalElements,
          sim.constraintElements,
          sim.loads,
        ),
      );
      fused = true;
    }
  }
  if (fused) drop_spent_junctions(created, sim);
  return sim.actions;
}

/** An edge the bundle created outranks one it merely gave a new terminal to. */
const CREATED = 2;
const RETERMINATED = 1;

/**
 * How firmly a bundle designates each edge as the one the gesture brought.
 *
 * The two ranks are not cosmetic. Seating a new spring on a bar's free end mints
 * a join, and that join re-terminates the bar too — so re-termination alone
 * would let the bar pass for the newcomer and swallow the spring the user drew.
 * Only a drag, which creates nothing, wins on re-termination.
 */
export function edge_newness(actions: readonly Action[]): Map<ID, number> {
  const newness = new Map<ID, number>();
  const raise = (id: ID, rank: number) =>
    newness.set(id, Math.max(newness.get(id) ?? 0, rank));
  for (const action of actions) {
    if (action.type === "CreateElement") raise(action.element.id, CREATED);
    else if (
      (action.type === "ConnectsFixedNodeStart" ||
        action.type === "ConnectsFixedNodeEnd") &&
      !action.disconnect
    )
      raise(action.elementID, RETERMINATED);
  }
  return newness;
}

/** The elements a bundle brought into being. */
export function created_elements(actions: readonly Action[]): Set<ID> {
  const created = new Set<ID>();
  for (const action of actions)
    if (action.type === "CreateElement") created.add(action.element.id);
  return created;
}
