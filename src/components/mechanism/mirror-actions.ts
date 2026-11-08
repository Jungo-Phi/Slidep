/**
 * Mirroring a selection in place, about its own centre.
 *
 * The selection always ends up mirrored: what ties it to the rest of the mechanism yields, by moving if it can and by being cut if it cannot.
 */

import {
  Action,
  ConstraintElement,
  ID,
  MechanicalElement,
  Mechanism,
  MirrorAxis,
} from "../../types";
import { element_refs } from "../../types/element-refs";
import { clone_mechanism, screen2world_length } from "../../utils";
import { MIRROR_TOLERANCE_PX } from "../../constants/interaction-specs";
import { resolveGeometricConstraints } from "../solver/kinematics/geometric-solver";
import { actionReducer } from "./action-reducer";
import { elements_center } from "./clipboard";
import {
  disconnect_element,
  get_connection_pair_types,
  get_connections,
  get_mechanical_element_from_id,
  start_simulation,
} from "./connect-actions";
import { mirrored_point } from "./mirror-geometry";

const edge_ends = (element: MechanicalElement): (ID | undefined)[] =>
  "fixedNodeStartID" in element
    ? [element.fixedNodeStartID, element.fixedNodeEndID]
    : [];

/**
 * `selectedIDs` and everything that moves with them: what an edge holds, a gear's axle and what it carries, the pulleys of a selected belt.
 * A belt follows on its own once all its pulleys do, its route being theirs.
 */
function carried_with(
  selectedIDs: ID[],
  elements: MechanicalElement[],
): Set<ID> {
  const byID = new Map(elements.map((el) => [el.id, el]));
  const carried = new Set<ID>();
  const pending = [...selectedIDs];
  const drain = () => {
    while (pending.length > 0) {
      const id = pending.pop()!;
      const element = byID.get(id);
      if (!element || carried.has(id)) continue;
      carried.add(id);
      for (const end of edge_ends(element)) if (end) pending.push(end);
      if (element.type === "beam") pending.push(...element.fixedNodesBodyIDs);
      if (element.type === "gear")
        pending.push(element.parentAxleID, ...element.fixedNodesBodyIDs);
      if (element.type === "pivot" || element.type === "slidep")
        pending.push(...element.fixedGearsIDs);
      if (element.type === "belt")
        pending.push(...element.attachedGearsIDs.map((gear) => gear.id));
    }
  };
  drain();
  for (const element of elements)
    if (
      element.type === "belt" &&
      element.attachedGearsIDs.length > 0 &&
      element.attachedGearsIDs.every((gear) => carried.has(gear.id))
    )
      pending.push(element.id);
  drain();
  return carried;
}

/** The points of `element` that the mirror moves, each as moved or not. */
function points_moved(
  element: MechanicalElement,
  carried: Set<ID>,
): boolean[] {
  if (carried.has(element.id)) return [true];
  const ends = edge_ends(element);
  if (ends.length === 0) return [false];
  return ends.map((end) => !!end && carried.has(end));
}

/** Whether `constraint` relates a point the mirror moves to one it leaves behind. */
function straddles(
  constraint: ConstraintElement,
  elements: MechanicalElement[],
  carried: Set<ID>,
): boolean {
  const moved = element_refs(constraint).flatMap(({ id }) => {
    const element = elements.find((el) => el.id === id);
    return element ? points_moved(element, carried) : [];
  });
  return moved.includes(true) && moved.includes(false);
}

/** Cuts the links that hold a carried element onto one left behind, by more than a shared point that can simply follow. */
function cut_body_links(mechanism: Mechanism, carried: Set<ID>): Action[] {
  const sim = start_simulation(
    mechanism.mechanicalElements,
    mechanism.constraintElements,
    mechanism.loads,
  );
  const element_of = (id: ID) =>
    get_mechanical_element_from_id(id, sim.mechanicalElements);
  for (const id of carried) {
    for (const type of [
      "ConnectsMeshedGears",
      "ConnectsFixedNodesBody",
      "ConnectsParentBeam",
    ] as const) {
      for (const otherID of [...get_connections(element_of(id), type)]) {
        if (carried.has(otherID)) continue;
        sim.step([
          disconnect_element(
            element_of(id),
            element_of(otherID),
            type,
            sim.mechanicalElements,
          ),
        ]);
        for (const pairType of get_connection_pair_types(id, element_of(otherID)))
          sim.step([
            disconnect_element(
              element_of(otherID),
              element_of(id),
              pairType,
              sim.mechanicalElements,
            ),
          ]);
      }
    }
  }
  return sim.actions;
}

/** Whether the solve leaves everything carried where the mirror put it. */
function holds_in_place(mechanism: Mechanism, action: Action): boolean {
  if (action.type !== "MirrorElements") return true;
  const solved = resolveGeometricConstraints(
    actionReducer(clone_mechanism(mechanism), [action], false),
    [action],
    [action],
  );
  const tolerance = screen2world_length(MIRROR_TOLERANCE_PX, mechanism.viewport);
  const off = (key: string, point: Parameters<typeof mirrored_point>[0]) => {
    const at = solved.positions.get(key);
    return (
      !!at &&
      at.distance_to(mirrored_point(point, action.axis, action.center)) > tolerance
    );
  };
  return !mechanism.mechanicalElements.some((element) => {
    if (!action.elementIDs.includes(element.id)) return false;
    return "position" in element
      ? off(element.id, element.position)
      : off(`${element.id}:start`, element.positionStart) ||
          off(`${element.id}:end`, element.positionEnd);
  });
}

/** The bundle that mirrors `selectedIDs` across a line through their centre. */
export function mirror_actions(
  selectedIDs: ID[],
  axis: MirrorAxis,
  mechanism: Mechanism,
): Action[] {
  const { mechanicalElements: elements, constraintElements, loads } = mechanism;
  const selected = elements.filter((el) => selectedIDs.includes(el.id));
  const carried = carried_with(selectedIDs, elements);
  const mirror: Action = {
    type: "MirrorElements",
    elementIDs: [...carried],
    constraintIDs: constraintElements
      .filter((c) => element_refs(c).every(({ id }) => carried.has(id)))
      .map((c) => c.id),
    loadIDs: loads
      .filter((load) => carried.has(load.targetID))
      .map((load) => load.id),
    axis,
    center: elements_center(selected),
  };
  if (holds_in_place(mechanism, mirror)) return [mirror];
  return [
    mirror,
    ...constraintElements
      .filter((c) => straddles(c, elements, carried))
      .map((element): Action => ({ type: "DeleteElement", element })),
    ...cut_body_links(mechanism, carried),
  ];
}
