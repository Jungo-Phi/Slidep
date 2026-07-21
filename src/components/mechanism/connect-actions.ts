import type {
  BeltElement,
  ConstraintElement,
  EdgeElement,
  ForceElement,
  GearElement,
  ID,
  JoinElement,
  LoadElement,
  MechanicalElement,
  NodeElement,
  SlidepElement,
  UnionElement,
} from "../../types/element";
import { Action, ConnectsActionType } from "../../types";
import { Point2 } from "../../types/point2";
import { HoveredPart } from "../../types/hovered-part";
import { connected_constraints, node_on_beam_body } from "../canvas/utils";
import { belt_wrap_direction, get_belt_path, legible_id } from "../../utils";
import type { BeltGearApproach } from "../../utils";
import {
  belt_section_insertion_index,
  belt_project,
} from "../../utils/belt-path";
import { belt_junction_id } from "../../utils/belt-rules";

/** Returns the mechanical element from the id. */
export function get_mechanical_element_from_id(
  id: ID,
  mechanicalElements: MechanicalElement[],
): MechanicalElement {
  const element = mechanicalElements.find((element) => element.id === id);
  if (element) return element;
  throw new Error(`Mechanical element with id "${legible_id(id)}" not found`);
}

/** Returns the constraint element from the id. */
export function get_constraint_element_from_id(
  id: ID,
  constraintElements: ConstraintElement[],
): ConstraintElement {
  const element = constraintElements.find((element) => element.id === id);
  if (element) return element;
  throw new Error(`Constraint element with id "${legible_id(id)}" not found`);
}

/** Returns the load element from the id. */
export function get_load_element_from_id(
  id: ID,
  loadElements: LoadElement[],
): LoadElement {
  const element = loadElements.find((element) => element.id === id);
  if (element) return element;
  throw new Error(`Load element with id "${legible_id(id)}" not found`);
}

/** Returns the element (mechanical or constraint) from the id. */
export function get_element_from_id(
  id: ID,
  mechanicalElements: MechanicalElement[],
  constraintElements: ConstraintElement[],
  loadElements: LoadElement[],
): UnionElement {
  const mechanicalElement = mechanicalElements.find(
    (element) => element.id === id,
  );
  if (mechanicalElement) return mechanicalElement;
  const constraintElement = constraintElements.find(
    (element) => element.id === id,
  );
  if (constraintElement) return constraintElement;
  const loadElement = loadElements.find((element) => element.id === id);
  if (loadElement) return loadElement;
  throw new Error(
    `Mechanical/Constraint/Load element with id "${legible_id(id)}" not found`,
  );
}

/**
 * The mechanical element a selection resolves to: itself, or — when a load is
 * selected — the element the load is applied to. A load has no panel of its own;
 * it is shown (and edited) inside its host's properties.
 */
export function host_mechanical_element(
  elementID: ID | undefined,
  mechanicalElements: MechanicalElement[],
  loadElements: LoadElement[],
): MechanicalElement | undefined {
  if (!elementID) return undefined;
  const mechanicalElement = mechanicalElements.find((e) => e.id === elementID);
  if (mechanicalElement) return mechanicalElement;
  const load = loadElements.find((l) => l.id === elementID);
  if (!load) return undefined;
  const hostID = load.targetID;
  return mechanicalElements.find((e) => e.id === hostID);
}

/**
 * Every container of `connectedElement` that holds `elementID`.
 *
 * A pair can be linked through more than one container — a gear sitting in both
 * its axle's `fixedGearsIDs` and its `rotatingEdgesIDs`, say. Disconnecting only
 * the first one leaves the others pointing at a deleted element, so callers must
 * handle all of them.
 */
export function get_connection_pair_types(
  elementID: ID,
  connectedElement: MechanicalElement,
): ConnectsActionType[] {
  const types: ConnectsActionType[] = [];

  if (
    "fixedEdgesIDs" in connectedElement &&
    connectedElement.fixedEdgesIDs.includes(elementID)
  )
    types.push("ConnectsFixedEdges");

  if (
    "rotatingEdgesIDs" in connectedElement &&
    connectedElement.rotatingEdgesIDs.includes(elementID)
  )
    types.push("ConnectsRotatingEdges");

  if (
    "parentBeamID" in connectedElement &&
    connectedElement.parentBeamID === elementID
  )
    types.push("ConnectsParentBeam");

  if (
    "fixedNodeStartID" in connectedElement &&
    connectedElement.fixedNodeStartID === elementID
  )
    types.push("ConnectsFixedNodeStart");

  if (
    "fixedNodeEndID" in connectedElement &&
    connectedElement.fixedNodeEndID === elementID
  )
    types.push("ConnectsFixedNodeEnd");

  if (
    "fixedNodesBodyIDs" in connectedElement &&
    connectedElement.fixedNodesBodyIDs.includes(elementID)
  )
    types.push("ConnectsFixedNodesBody");

  if (
    "parentAxleID" in connectedElement &&
    connectedElement.parentAxleID === elementID
  )
    types.push("ConnectsParentAxle");

  if (
    "meshedGearsIDs" in connectedElement &&
    connectedElement.meshedGearsIDs.includes(elementID)
  )
    types.push("ConnectsMeshedGears");

  if (
    "attachedGearsIDs" in connectedElement &&
    connectedElement.attachedGearsIDs.some(
      (attachedGear) => attachedGear.id === elementID,
    )
  )
    types.push("ConnectsAttachedGears");

  if (
    "attachedBeltID" in connectedElement &&
    connectedElement.attachedBeltID === elementID
  )
    types.push("ConnectsAttachedBelt");

  if (
    "fixedGearsIDs" in connectedElement &&
    (connectedElement.fixedGearsIDs as ID[]).includes(elementID)
  )
    types.push("ConnectsFixedGears");

  return types;
}

/** Returns the array of connected elements of a given type. */
export function get_connections(
  element: MechanicalElement,
  connectionType: ConnectsActionType,
): ID[] {
  switch (connectionType) {
    case "ConnectsFixedEdges":
      if ("fixedEdgesIDs" in element) return element.fixedEdgesIDs;

      break;
    case "ConnectsRotatingEdges":
      if ("rotatingEdgesIDs" in element) return element.rotatingEdgesIDs;

      break;
    case "ConnectsParentBeam":
      if ("parentBeamID" in element)
        return element.parentBeamID ? [element.parentBeamID] : [];

      break;
    case "ConnectsFixedNodeStart":
      if ("fixedNodeStartID" in element)
        return element.fixedNodeStartID ? [element.fixedNodeStartID] : [];

      break;
    case "ConnectsFixedNodeEnd":
      if ("fixedNodeEndID" in element)
        return element.fixedNodeEndID ? [element.fixedNodeEndID] : [];

      break;
    case "ConnectsFixedNodesBody":
      if ("fixedNodesBodyIDs" in element) return element.fixedNodesBodyIDs;

      break;
    case "ConnectsParentAxle":
      if ("parentAxleID" in element) return [element.parentAxleID];
      break;
    case "ConnectsMeshedGears":
      if ("meshedGearsIDs" in element) return element.meshedGearsIDs;

      break;
    case "ConnectsAttachedGears":
      if ("attachedGearsIDs" in element)
        return element.attachedGearsIDs.map((attachedGear) => attachedGear.id);

      break;
    case "ConnectsFixedGears":
      if ("fixedGearsIDs" in element) return element.fixedGearsIDs;

      break;
    case "ConnectsAttachedBelt":
      if ("attachedBeltID" in element)
        return element.attachedBeltID ? [element.attachedBeltID] : [];

      break;
  }
  return [];
}

/** Returns the connection types (`ConnectsActionType[]`) of an elements. */
export function get_connection_types(
  element: MechanicalElement,
): ConnectsActionType[] {
  const connectionTypes: ConnectsActionType[] = [];
  if ("fixedEdgesIDs" in element) connectionTypes.push("ConnectsFixedEdges");
  if ("rotatingEdgesIDs" in element)
    connectionTypes.push("ConnectsRotatingEdges");
  if ("fixedGearsIDs" in element) connectionTypes.push("ConnectsFixedGears");
  if ("parentBeamID" in element) connectionTypes.push("ConnectsParentBeam");
  if ("fixedNodeStartID" in element)
    connectionTypes.push("ConnectsFixedNodeStart");
  if ("fixedNodeEndID" in element) connectionTypes.push("ConnectsFixedNodeEnd");
  if ("fixedNodesBodyIDs" in element)
    connectionTypes.push("ConnectsFixedNodesBody");
  if ("parentAxleID" in element) connectionTypes.push("ConnectsParentAxle");
  if ("meshedGearsIDs" in element) connectionTypes.push("ConnectsMeshedGears");
  if ("attachedGearsIDs" in element)
    connectionTypes.push("ConnectsAttachedGears");
  if ("attachedBeltID" in element) connectionTypes.push("ConnectsAttachedBelt");
  return connectionTypes;
}

export function disconnect_element(
  element: MechanicalElement,
  connectedElement: MechanicalElement,
  containerType: ConnectsActionType,
  mechanicalElements: MechanicalElement[],
): Action {
  console.log(
    "Disconnect: ",
    connectedElement.type,
    connectedElement.id.toString().padStart(3, "0"),
    "  from: ",
    element.type + "." + containerType.replace("Connects", ""),
  );
  if (containerType === "ConnectsAttachedGears") {
    const belt = get_mechanical_element_from_id(
      element.id,
      mechanicalElements,
    ) as BeltElement;
    const attached = belt.attachedGearsIDs.find(
      (gear) => gear.id === connectedElement.id,
    );
    return {
      type: containerType,
      disconnect: true,
      elementID: element.id,
      connectID: connectedElement.id,
      index: get_connections(element, containerType).indexOf(
        connectedElement.id,
      ),
      direction: attached?.direction ?? false,
    };
  } else {
    return {
      type: containerType,
      disconnect: true,
      elementID: element.id,
      connectID: connectedElement.id,
      index: get_connections(element, containerType).indexOf(
        connectedElement.id,
      ),
    };
  }
}

/**
 * Actions that open a closed belt into a loose one.
 *
 * When one junction node still fuses both terminals, the start is freed so the
 * two ends can part (the disconnection-separation pass slides it along the belt);
 * the end keeps the junction, so the node survives holding a single terminal.
 * Then the closed flag is cleared. A belt already free of its junction only needs
 * the flag. Call it on a belt whose loop no longer holds — see `belt_is_looped`.
 */
export function open_belt(belt: BeltElement): Action[] {
  const actions: Action[] = [];
  const junction = belt_junction_id(belt);
  if (junction !== undefined)
    actions.push({
      type: "ConnectsFixedNodeStart",
      disconnect: true,
      elementID: belt.id,
      connectID: junction,
    });
  actions.push({ type: "CloseBelt", id: belt.id, closed: false });
  return actions;
}

/**
 * The point of the loop nearest to `p`, read from the belt as the loop it is
 * about to become — the pulley cycle, terminals dropped. Same geometry the
 * geometric `BeltJunction` projects onto, so a junction seated here starts on
 * the outline. `p` itself when there is no loop to speak of.
 */
function nearest_point_on_belt_loop(
  belt: BeltElement,
  p: Point2,
  mechanicalElements: MechanicalElement[],
): Point2 {
  const { vias, closed } = get_belt_path(
    { ...belt, closed: true },
    mechanicalElements,
  );
  if (vias.length === 0) return p;
  return belt_project(vias, p, closed).point;
}

/**
 * Actions that close a belt into a loop, reusing whatever its terminals already
 * hold rather than always minting a junction:
 *
 *   • both terminals free          → a fresh join holds both;
 *   • one terminal already on a node → that node is the junction, the free end
 *                                      joins it (no new join, no duplicate);
 *   • both on the same node          → it is already the junction;
 *   • both on different nodes         → the two are fused like a node dropped on
 *                                      a node, then both terminals share it.
 *
 * `position` is only read when a fresh join is minted, and then only to pick the
 * nearest point of the loop it lands on.
 */
export function close_belt_actions(
  belt: BeltElement,
  position: Point2,
  mechanicalElements: MechanicalElement[],
  constraintElements: ConstraintElement[],
): Action[] {
  const close: Action = { type: "CloseBelt", id: belt.id, closed: true };
  const startNode = belt.fixedNodeStartID;
  const endNode = belt.fixedNodeEndID;

  if (startNode && startNode === endNode) return [close];

  if (!startNode && !endNode) {
    const join: JoinElement = {
      type: "join",
      id: crypto.randomUUID(),
      probes: [],
      overlays: {},
      fixedEdgesIDs: [],
      // Seat the junction on the loop it closes, not under the cursor: the
      // geometric BeltJunction then has ~no error to solve, so the belt itself
      // does not shift to meet a junction dropped away from its outline.
      position: nearest_point_on_belt_loop(belt, position, mechanicalElements),
      isGrounded: false,
    };
    return [
      { type: "CreateElement", element: join },
      {
        type: "ConnectsFixedEdges",
        disconnect: false,
        elementID: join.id,
        connectID: belt.id,
        index: 0,
      },
      {
        type: "ConnectsFixedNodeStart",
        disconnect: false,
        elementID: belt.id,
        connectID: join.id,
      },
      {
        type: "ConnectsFixedNodeEnd",
        disconnect: false,
        elementID: belt.id,
        connectID: join.id,
      },
      close,
    ];
  }

  // One terminal pinned: reuse its node, attach the free end to it. The node
  // already lists the belt (reciprocal of the pinned terminal), so nothing is
  // created and it is never listed twice.
  if (!startNode || !endNode) {
    const junction = (startNode ?? endNode)!;
    return [
      startNode
        ? {
            type: "ConnectsFixedNodeEnd",
            disconnect: false,
            elementID: belt.id,
            connectID: junction,
          }
        : {
            type: "ConnectsFixedNodeStart",
            disconnect: false,
            elementID: belt.id,
            connectID: junction,
          },
      close,
    ];
  }

  // Both terminals on different nodes: fuse them. The start's node survives and
  // keeps the start; the end's node is absorbed, its belt end retargeted onto it.
  const startEl = get_mechanical_element_from_id(
    startNode,
    mechanicalElements,
  ) as NodeElement;
  const endEl = get_mechanical_element_from_id(
    endNode,
    mechanicalElements,
  ) as NodeElement;
  return [
    ...fuse_nodes(startEl, endEl, mechanicalElements, constraintElements),
    close,
  ];
}

/**
 * Deletes an element.
 *
 * Returns actions to remove the connections of linked elements, delete connected constraints and delete the element itself.
 * When `isCascade` is true (gear deleted as part of parent pivot/slidep deletion), skips the parent fixedGearsIDs disconnect.
 */
export function delete_element(
  elementID: ID,
  mechanicalElements: MechanicalElement[],
  constraintElements: ConstraintElement[],
  loadElements: LoadElement[],
  isCascade: boolean = false,
): Action[] {
  const actions: Action[] = [];
  const element = get_element_from_id(
    elementID,
    mechanicalElements,
    constraintElements,
    loadElements,
  );
  if (
    element.type === "beam" ||
    element.type === "belt" ||
    element.type === "damper" ||
    element.type === "gear" ||
    element.type === "join" ||
    element.type === "mass" ||
    element.type === "pivot" ||
    element.type === "slidep" ||
    element.type === "slider" ||
    element.type === "spring"
  ) {
    get_connection_types(element)
      .filter((ct) => !(isCascade && ct === "ConnectsParentAxle"))
      .forEach((connectionType) => {
        get_connections(element, connectionType).forEach((id) => {
          const connectedElement = get_mechanical_element_from_id(
            id,
            mechanicalElements,
          );
          get_connection_pair_types(element.id, connectedElement).forEach(
            (pairType) =>
              actions.push(
                disconnect_element(
                  connectedElement,
                  element,
                  pairType,
                  mechanicalElements,
                ),
              ),
          );
        });
      });

    // Pivot/Slidep: cascade delete all attached gears
    if (
      (element.type === "pivot" || element.type === "slidep") &&
      element.fixedGearsIDs.length > 0
    ) {
      element.fixedGearsIDs.forEach((gearID) => {
        if (mechanicalElements.find((e) => e.id === gearID)) {
          actions.push(
            ...delete_element(
              gearID,
              mechanicalElements,
              constraintElements,
              loadElements,
              true,
            ),
          );
        }
      });
    }
  }
  actions.push({ type: "DeleteElement", element });
  connected_constraints(elementID, constraintElements).forEach((id) =>
    actions.push({
      type: "DeleteElement",
      element: get_constraint_element_from_id(id, constraintElements),
    }),
  );

  // A load lives on its host and goes with it. One merely *framed* on the
  // deleted edge survives, back in world coordinates — the fallback
  // `repair_mechanism` already applies to that reference at load time.
  loadElements.forEach((load) => {
    if (load.targetID === elementID) {
      actions.push({ type: "DeleteElement", element: load });
      return;
    }
    if (
      "frame" in load &&
      load.frame !== "world" &&
      load.frame.edgeID === elementID
    )
      actions.push({
        type: "SetLoadFrame",
        id: load.id,
        newFrame: "world",
        oldFrame: load.frame,
      });
  });
  return actions;
}

/**
 * A copy whose mutable containers are detached, so a simulation can advance over
 * it without ever reaching the caller's state — nor, for a freshly built
 * element, the very object its `CreateElement` action carries.
 */
function clone_element_for_simulation(
  el: MechanicalElement,
): MechanicalElement {
  return {
    ...el,
    ...("fixedEdgesIDs" in el && { fixedEdgesIDs: [...el.fixedEdgesIDs] }),
    ...("rotatingEdgesIDs" in el && {
      rotatingEdgesIDs: [...el.rotatingEdgesIDs],
    }),
    ...("meshedGearsIDs" in el && { meshedGearsIDs: [...el.meshedGearsIDs] }),
    ...("fixedGearsIDs" in el && { fixedGearsIDs: [...el.fixedGearsIDs] }),
    ...("fixedNodesBodyIDs" in el && {
      fixedNodesBodyIDs: [...el.fixedNodesBodyIDs],
    }),
    ...("attachedGearsIDs" in el && {
      attachedGearsIDs: el.attachedGearsIDs.map((g) => ({ ...g })),
    }),
  } as MechanicalElement;
}

/** The whole state, detached the same way. */
export function clone_for_simulation(
  mechanicalElements: MechanicalElement[],
): MechanicalElement[] {
  return mechanicalElements.map(clone_element_for_simulation);
}

/**
 * Applies a single structural action (Create, Delete or Connect/Disconnect) to
 * mutable simulated-state arrays.
 *
 * Any caller that emits several bundles of actions in one gesture must advance
 * this state between them: a bundle computed against the state as it was before
 * a previous one can name an element that is already gone, and the reducer
 * throws on it. `simMech` must come from `clone_for_simulation`.
 */
export function apply_to_sim_state(
  action: Action,
  simMech: MechanicalElement[],
  simConst: ConstraintElement[],
  simLoad: LoadElement[],
) {
  if (action.type === "CreateElement") {
    const { element } = action;
    // Mechanical elements carry probes; loads name a host; constraints neither.
    if ("probes" in element)
      simMech.push(clone_element_for_simulation(element as MechanicalElement));
    else if ("targetID" in element) simLoad.push(element);
    else simConst.push(element);
    return;
  }
  if (action.type === "DeleteElement") {
    const mechIndex = simMech.findIndex((e) => e.id === action.element.id);
    if (mechIndex !== -1) {
      simMech.splice(mechIndex, 1);
      return;
    }
    const constraintIndex = simConst.findIndex(
      (e) => e.id === action.element.id,
    );
    if (constraintIndex !== -1) simConst.splice(constraintIndex, 1);
    const loadIndex = simLoad.findIndex((e) => e.id === action.element.id);
    if (loadIndex !== -1) simLoad.splice(loadIndex, 1);
    return;
  }
  if (action.type === "SetLoadFrame") {
    // simLoad shares its entries with the caller's state, so this replaces
    // rather than mutates.
    const index = simLoad.findIndex((l) => l.id === action.id);
    const load = index === -1 ? undefined : simLoad[index];
    if (load && "frame" in load)
      simLoad[index] = { ...load, frame: action.newFrame };
    return;
  }
  if (!("elementID" in action)) return;
  const el = simMech.find((e) => e.id === action.elementID);
  if (!el) return;
  switch (action.type) {
    case "ConnectsFixedEdges":
      if ("fixedEdgesIDs" in el)
        action.disconnect
          ? el.fixedEdgesIDs.splice(action.index, 1)
          : el.fixedEdgesIDs.splice(action.index, 0, action.connectID);
      break;
    case "ConnectsFixedNodesBody":
      if ("fixedNodesBodyIDs" in el)
        action.disconnect
          ? el.fixedNodesBodyIDs.splice(action.index, 1)
          : el.fixedNodesBodyIDs.splice(action.index, 0, action.connectID);
      break;
    case "ConnectsRotatingEdges":
      if ("rotatingEdgesIDs" in el)
        action.disconnect
          ? el.rotatingEdgesIDs.splice(action.index, 1)
          : el.rotatingEdgesIDs.splice(action.index, 0, action.connectID);
      break;
    case "ConnectsMeshedGears":
      if ("meshedGearsIDs" in el)
        action.disconnect
          ? el.meshedGearsIDs.splice(action.index, 1)
          : el.meshedGearsIDs.splice(action.index, 0, action.connectID);
      break;
    case "ConnectsFixedGears":
      if ("fixedGearsIDs" in el)
        action.disconnect
          ? el.fixedGearsIDs.splice(action.index, 1)
          : el.fixedGearsIDs.splice(action.index, 0, action.connectID);
      break;
    case "ConnectsAttachedGears":
      if ("attachedGearsIDs" in el)
        action.disconnect
          ? el.attachedGearsIDs.splice(action.index, 1)
          : el.attachedGearsIDs.splice(action.index, 0, {
              id: action.connectID,
              direction: action.direction,
            });
      break;
    case "ConnectsFixedNodeStart":
      if ("fixedNodeStartID" in el)
        el.fixedNodeStartID = action.disconnect ? undefined : action.connectID;
      break;
    case "ConnectsFixedNodeEnd":
      if ("fixedNodeEndID" in el)
        el.fixedNodeEndID = action.disconnect ? undefined : action.connectID;
      break;
    case "ConnectsParentBeam":
      if ("parentBeamID" in el)
        el.parentBeamID = action.disconnect ? undefined : action.connectID;
      break;
    case "ConnectsAttachedBelt":
      if ("attachedBeltID" in el)
        el.attachedBeltID = action.disconnect ? undefined : action.connectID;
      break;
    case "ConnectsParentAxle":
      if ("parentAxleID" in el)
        el.parentAxleID = action.disconnect ? "----" : action.connectID;
      break;
  }
}

/**
 * A gesture that emits several bundles of actions, each computed against the
 * state the previous ones leave behind.
 *
 * Composing two `connect_elements` calls against the same starting state is a
 * defect, not a shortcut: the first may take a node over and delete it, and the
 * second then names an element the reducer will not find. Any multi-step gesture
 * goes through here.
 */
export interface Simulation {
  readonly mechanicalElements: MechanicalElement[];
  readonly constraintElements: ConstraintElement[];
  readonly loads: LoadElement[];
  /** Everything recorded so far, in order, ready for the reducer. */
  readonly actions: Action[];
  /** Records `produced` and advances the state over it. */
  step(produced: Action[]): void;
  /** Whether that hovered part still designates a live element. */
  holds(part: HoveredPart): boolean;
}

export function start_simulation(
  mechanicalElements: MechanicalElement[],
  constraintElements: ConstraintElement[],
  loads: LoadElement[],
): Simulation {
  const simMech = clone_for_simulation(mechanicalElements);
  const simConst = [...constraintElements];
  const simLoad = [...loads];
  const actions: Action[] = [];
  return {
    mechanicalElements: simMech,
    constraintElements: simConst,
    loads: simLoad,
    actions,
    step(produced) {
      for (const action of produced) {
        actions.push(action);
        apply_to_sim_state(action, simMech, simConst, simLoad);
      }
    },
    holds(part) {
      // A closure names no element, so there is nothing to vouch for. Callers
      // that accept one must say so themselves.
      if (part.type === "Void" || part.type === "BeltClosure") return false;
      return (
        simMech.some((e) => e.id === part.id) ||
        simConst.some((e) => e.id === part.id) ||
        simLoad.some((e) => e.id === part.id)
      );
    },
  };
}

/**
 * Deletes multiple elements as a single consistent action bundle.
 *
 * Each element is deleted against the state as it looks after all prior
 * deletions in the batch — so indices are always correct and no action
 * ever references an already-deleted element.
 */
export function delete_elements(
  elementIDs: ID[],
  mechanicalElements: MechanicalElement[],
  constraintElements: ConstraintElement[],
  loadElements: LoadElement[],
): Action[] {
  const sim = start_simulation(
    mechanicalElements,
    constraintElements,
    loadElements,
  );

  for (const id of elementIDs) {
    // Skip if a previous deletion in this batch already removed this element
    // (e.g. a constraint shared by two deleted mechanical elements).
    const exists =
      sim.mechanicalElements.some((e) => e.id === id) ||
      sim.constraintElements.some((e) => e.id === id) ||
      sim.loads.some((e) => e.id === id);
    if (!exists) continue;

    sim.step(
      delete_element(
        id,
        sim.mechanicalElements,
        sim.constraintElements,
        sim.loads,
      ),
    );
  }

  return sim.actions;
}

/**
 * Transfer les éléments connectés à `edge` de `sourceNodeID` à `destNodeID`
 *
 * Returns the actions to perform disconnections and connections.
 */
function transfer_edge_connections_to_node(
  edgeID: ID,
  sourceNodeID: ID,
  destNodeID: ID,
  mechanicalElements: MechanicalElement[],
) {
  const actions: Action[] = [];
  const connected = get_mechanical_element_from_id(edgeID, mechanicalElements);
  // A node's fixedEdges/rotatingEdges may also reference a pinned gear: transfer
  // the gear-side pin (fixedNodesBodyIDs) from source to dest instead.
  if (connected.type === "gear") {
    const index = connected.fixedNodesBodyIDs.indexOf(sourceNodeID);
    if (index !== -1) {
      actions.push({
        type: "ConnectsFixedNodesBody",
        disconnect: true,
        elementID: edgeID,
        connectID: sourceNodeID,
        index,
      });
      if (!connected.fixedNodesBodyIDs.includes(destNodeID))
        actions.push({
          type: "ConnectsFixedNodesBody",
          disconnect: false,
          elementID: edgeID,
          connectID: destNodeID,
          index: 0,
        });
    }
    return actions;
  }
  const connectedEdge = connected as EdgeElement;
  if (connectedEdge.fixedNodeEndID === sourceNodeID) {
    actions.push({
      type: "ConnectsFixedNodeEnd",
      disconnect: true,
      elementID: edgeID,
      connectID: sourceNodeID,
    });
    actions.push({
      type: "ConnectsFixedNodeEnd",
      disconnect: false,
      elementID: edgeID,
      connectID: destNodeID,
    });
  }
  if (connectedEdge.fixedNodeStartID === sourceNodeID) {
    actions.push({
      type: "ConnectsFixedNodeStart",
      disconnect: true,
      elementID: edgeID,
      connectID: sourceNodeID,
    });
    actions.push({
      type: "ConnectsFixedNodeStart",
      disconnect: false,
      elementID: edgeID,
      connectID: destNodeID,
    });
  }
  // Both nodes may already sit on this body, in which case the survivor only
  // takes the place it already holds.
  if (
    "fixedNodesBodyIDs" in connectedEdge &&
    connectedEdge.fixedNodesBodyIDs.includes(sourceNodeID)
  ) {
    actions.push({
      type: "ConnectsFixedNodesBody",
      disconnect: true,
      elementID: edgeID,
      connectID: sourceNodeID,
      index: get_connections(connectedEdge, "ConnectsFixedNodesBody").indexOf(
        sourceNodeID,
      ),
    });
    if (!connectedEdge.fixedNodesBodyIDs.includes(destNodeID))
      actions.push({
        type: "ConnectsFixedNodesBody",
        disconnect: false,
        elementID: edgeID,
        connectID: destNodeID,
        index: 0,
      });
  }
  return actions;
}

/**
 * Transfer les connections de `sourceNode` à des edges vers `destNode` (sauf pour AttachedBelt).
 *
 * Returns the actions to perform disconnections and connections.
 */
function transfer_internal_connections(
  sourceNode: NodeElement,
  destNode: NodeElement,
): Action[] {
  const actions: Action[] = [];

  // Both nodes may already hold the same edge — the two ends of one beam, say.
  // Re-adding it would leave the survivor naming it twice.
  const not_already_on_dest = (edgeID: ID): boolean =>
    !(
      ("fixedEdgesIDs" in destNode &&
        destNode.fixedEdgesIDs.includes(edgeID)) ||
      ("rotatingEdgesIDs" in destNode &&
        destNode.rotatingEdgesIDs.includes(edgeID)) ||
      ("parentBeamID" in destNode && destNode.parentBeamID === edgeID)
    );

  if (
    "parentBeamID" in sourceNode &&
    sourceNode.parentBeamID &&
    not_already_on_dest(sourceNode.parentBeamID)
  ) {
    if ("parentBeamID" in destNode && !destNode.parentBeamID) {
      actions.push({
        type: "ConnectsParentBeam",
        disconnect: false,
        elementID: destNode.id,
        connectID: sourceNode.parentBeamID,
      });
    } else {
      actions.push({
        type:
          "fixedEdgesIDs" in destNode
            ? "ConnectsFixedEdges"
            : "ConnectsRotatingEdges",
        disconnect: false,
        elementID: destNode.id,
        connectID: sourceNode.parentBeamID,
        index: 0,
      });
    }
  }
  if ("fixedEdgesIDs" in sourceNode) {
    sourceNode.fixedEdgesIDs.filter(not_already_on_dest).forEach((edgeID) => {
      actions.push({
        type:
          "fixedEdgesIDs" in destNode
            ? "ConnectsFixedEdges"
            : "ConnectsRotatingEdges",
        disconnect: false,
        elementID: destNode.id,
        connectID: edgeID,
        index: 0,
      });
    });
  }
  if ("rotatingEdgesIDs" in sourceNode) {
    sourceNode.rotatingEdgesIDs
      .filter(not_already_on_dest)
      .forEach((edgeID) => {
        actions.push({
          type:
            "rotatingEdgesIDs" in destNode
              ? "ConnectsRotatingEdges"
              : "ConnectsFixedEdges",
          disconnect: false,
          elementID: destNode.id,
          connectID: edgeID,
          index: 0,
        });
      });
  }
  // Transférer les gears du source (pivot/slidep) vers le dest
  if ("fixedGearsIDs" in sourceNode && "fixedGearsIDs" in destNode) {
    sourceNode.fixedGearsIDs.forEach((gearID) => {
      actions.push({
        type: "ConnectsFixedGears",
        disconnect: false,
        elementID: destNode.id,
        connectID: gearID,
        index: 0,
      });
      actions.push({
        type: "ConnectsParentAxle",
        disconnect: true,
        elementID: gearID,
        connectID: sourceNode.id,
      });
      actions.push({
        type: "ConnectsParentAxle",
        disconnect: false,
        elementID: gearID,
        connectID: destNode.id,
      });
    });
  }
  return actions;
}

/**
 * Transfer les connections des edges à `sourceNode` vers `destNode` (sauf pour AttachedBelt).
 *
 * Exemple : rotatingEdgeID(2).endID = 1
 * -> transfer_connection_id(node(1), node(3))
 * -> rotatingEdgeID(2).endID = 3
 *
 * Returns the actions to perform disconnections and connections.
 */
function transfer_external_connections(
  sourceNode: NodeElement,
  destNode: NodeElement,
  mechanicalElements: MechanicalElement[],
): Action[] {
  const actions: Action[] = [];

  if ("parentBeamID" in sourceNode && sourceNode.parentBeamID) {
    actions.push(
      ...transfer_edge_connections_to_node(
        sourceNode.parentBeamID,
        sourceNode.id,
        destNode.id,
        mechanicalElements,
      ),
    );
  }
  if ("fixedEdgesIDs" in sourceNode) {
    sourceNode.fixedEdgesIDs.forEach((edgeID) => {
      actions.push(
        ...transfer_edge_connections_to_node(
          edgeID,
          sourceNode.id,
          destNode.id,
          mechanicalElements,
        ),
      );
    });
  }
  if ("rotatingEdgesIDs" in sourceNode) {
    sourceNode.rotatingEdgesIDs.forEach((edgeID) => {
      actions.push(
        ...transfer_edge_connections_to_node(
          edgeID,
          sourceNode.id,
          destNode.id,
          mechanicalElements,
        ),
      );
    });
  }
  return actions;
}

/**
 * Transfer les connections des contraintes à `sourceNode` vers `destNode`.
 *
 * Si le transfer n'est pas possible, les supprimer.
 *
 * Returns the actions to perform disconnections and connections.
 */
function transfer_constraint_connections(
  sourceNodeID: ID,
  destNodeID: ID,
  constraintElements: ConstraintElement[],
): Action[] {
  const actions: Action[] = [];

  constraintElements.forEach((constraint) => {
    switch (constraint.type) {
      case "dimension-node-to-node":
      case "horizontal-align-nodes":
      case "vertical-align-nodes":
        if (constraint.startNodeID === sourceNodeID) {
          const newConstraint = { ...constraint };
          newConstraint.startNodeID = destNodeID;
          actions.push({ type: "DeleteElement", element: constraint });
          actions.push({ type: "CreateElement", element: newConstraint });
        } else if (constraint.endNodeID === sourceNodeID) {
          const newConstraint = { ...constraint };
          newConstraint.endNodeID = destNodeID;
          actions.push({ type: "DeleteElement", element: constraint });
          actions.push({ type: "CreateElement", element: newConstraint });
        }
        break;
      case "dimension-edge-to-node":
        if (constraint.nodeID === sourceNodeID) {
          const newConstraint = { ...constraint };
          newConstraint.nodeID = destNodeID;
          actions.push({ type: "DeleteElement", element: constraint });
          actions.push({ type: "CreateElement", element: newConstraint });
        }
        break;
      case "dimension-radius":
        if (constraint.gearID === sourceNodeID) {
          actions.push({ type: "DeleteElement", element: constraint });
        }
        break;
      case "gear-ratio":
        if (
          constraint.startGearID === sourceNodeID ||
          constraint.endGearID === sourceNodeID
        ) {
          actions.push({ type: "DeleteElement", element: constraint });
        }
        break;
    }
  });
  return actions;
}

/**
 * Fuses `hoveredNode` into `selectedNode`: the actions that merge two nodes
 * landing on one another, keeping every connection either carried.
 *
 * A pivot meeting a slider (either order) becomes a slidep — the one node that
 * both turns and slides; the slidep inherits the pivot's id so a gear's
 * `parentAxleID` stays valid. Otherwise `selectedNode` takes over and
 * `hoveredNode` is deleted, its links transferred. Shared with the belt closure,
 * which merges the two junction nodes exactly as a drag would.
 */
export function fuse_nodes(
  selectedNode: NodeElement,
  hoveredNode: NodeElement,
  mechanicalElements: MechanicalElement[],
  constraintElements: ConstraintElement[],
): Action[] {
  const actions: Action[] = [];
  if (
    selectedNode.type === "pivot" &&
    !selectedNode.motor &&
    hoveredNode.type === "slider"
  ) {
    const slidep: SlidepElement = {
      type: "slidep",
      id: selectedNode.id,
      probes: [],
      overlays: {},
      parentBeamID: hoveredNode.parentBeamID,
      rotatingEdgesIDs: selectedNode.rotatingEdgesIDs.concat(
        hoveredNode.fixedEdgesIDs,
      ),
      fixedGearsIDs: selectedNode.fixedGearsIDs,
      position: hoveredNode.position,
      isGrounded: selectedNode.isGrounded || hoveredNode.isGrounded,
    };
    actions.push({ type: "DeleteElement", element: selectedNode });
    actions.push({ type: "DeleteElement", element: hoveredNode });
    actions.push({ type: "CreateElement", element: slidep });
    actions.push(
      ...transfer_external_connections(
        hoveredNode,
        selectedNode,
        mechanicalElements,
      ),
    );
    actions.push(
      ...transfer_constraint_connections(
        hoveredNode.id,
        selectedNode.id,
        constraintElements,
      ),
    );
  } else if (selectedNode.type === "slider" && hoveredNode.type === "pivot") {
    // Fuse them into a Slidep — symétrique au cas pivot+slider :
    // le slidep hérite de l'ID du pivot pour que gear.parentAxleID reste valide.
    const parentBeam = node_on_beam_body(hoveredNode, mechanicalElements);
    const parentBeamID = selectedNode.parentBeamID
      ? selectedNode.parentBeamID
      : parentBeam
        ? parentBeam.id
        : undefined;
    const slidep: SlidepElement = {
      type: "slidep",
      id: hoveredNode.id,
      probes: [],
      overlays: {},
      parentBeamID,
      rotatingEdgesIDs: selectedNode.fixedEdgesIDs
        .concat(hoveredNode.rotatingEdgesIDs)
        .filter((edgeID) => edgeID !== parentBeamID),
      fixedGearsIDs: hoveredNode.fixedGearsIDs,
      position: hoveredNode.position,
      isGrounded: selectedNode.isGrounded || hoveredNode.isGrounded,
    };
    actions.push({ type: "DeleteElement", element: selectedNode });
    actions.push({ type: "DeleteElement", element: hoveredNode });
    actions.push({ type: "CreateElement", element: slidep });
    actions.push(
      ...transfer_external_connections(
        selectedNode,
        hoveredNode,
        mechanicalElements,
      ),
    );
    actions.push(
      ...transfer_constraint_connections(
        selectedNode.id,
        hoveredNode.id,
        constraintElements,
      ),
    );
  } else {
    // Takeover de selectedNode sur hoveredNode
    actions.push({ type: "DeleteElement", element: hoveredNode });
    // A mass never inherits an anchor: it is the one node that cannot
    // be grounded.
    if (
      hoveredNode.isGrounded &&
      !selectedNode.isGrounded &&
      selectedNode.type !== "mass"
    ) {
      actions.push({
        type: "GroundNode",
        id: selectedNode.id,
        grounded: true,
      });
    }
    actions.push(...transfer_internal_connections(hoveredNode, selectedNode));
    actions.push(
      ...transfer_external_connections(
        hoveredNode,
        selectedNode,
        mechanicalElements,
      ),
    );
    actions.push(
      ...transfer_constraint_connections(
        hoveredNode.id,
        selectedNode.id,
        constraintElements,
      ),
    );
  }
  return actions;
}

/** Which part of its own element a gesture is bringing to the target. */
export type OwnPartKind = "node" | "start" | "end" | "body" | "gear";

/**
 * The `selectedPart` to hand to `connect_elements`: what the element being placed
 * or dragged offers to the target.
 *
 * An endpoint becomes a body connection when the target is a node the edge is
 * being drawn past — it ends up mid-edge, not at the tip. Placing and dragging
 * answer to this identically, which is the whole reason this is one function.
 *
 * The position is carried only to satisfy `HoveredPart`; `connect_elements`
 * reads the type, the id and the part, never the position.
 */
export function own_part(
  elementID: ID,
  kind: OwnPartKind,
  target: HoveredPart,
): HoveredPart {
  const position = target.position;
  if (kind === "gear")
    return { type: "GearTooth", position, id: elementID, deleting: false };
  if (kind === "node")
    return {
      type: "Node",
      position,
      id: elementID,
      deleting: false,
      beamBodyHover: false,
    };
  const drawnPast =
    kind !== "body" && target.type === "Node" && target.beamBodyHover;
  return {
    type: "Edge",
    position,
    id: elementID,
    deleting: false,
    part: drawnPast ? "body" : kind,
  };
}

/**
 * Connects an element (selectedPart) to another (hoveredPart).
 *
 * Returns the actions to perform bidirectional connections and handles special cases (connections transfer, fusion, etc.)
 *
 * All connections are allowed, the selectedElement takes over.
 */
export function connect_elements(
  hoveredPart: HoveredPart,
  selectedElement: MechanicalElement,
  selectedPart: HoveredPart,
  mechanicalElements: MechanicalElement[],
  constraintElements: ConstraintElement[],
  loads: LoadElement[] = [],
): Action[] {
  if (
    hoveredPart.type === "Void" ||
    hoveredPart.type === "Constraint" ||
    selectedPart.type === "Void" ||
    selectedPart.type === "Constraint" ||
    selectedPart.type === "BeltClosure"
  ) {
    return [];
  }
  // Close a belt onto itself: the terminal offered while it is being placed, or
  // its own opposite end while one is dragged onto the other.
  if (
    hoveredPart.type === "BeltClosure" ||
    hoveredPart.id === selectedPart.id
  ) {
    return close_belt_actions(
      selectedElement as BeltElement,
      hoveredPart.position,
      mechanicalElements,
      constraintElements,
    );
  }

  const hoveredElement = get_mechanical_element_from_id(
    hoveredPart.id,
    mechanicalElements,
  ) as MechanicalElement;
  const actions: Action[] = [];

  console.log(
    "CONNECT ELEMENT : ",
    selectedElement.type,
    selectedPart,
    " TO HOVERED :",
    hoveredElement.type,
    hoveredPart,
  ); // DEBUG

  switch (selectedPart.type) {
    case "Node":
      const selectedNode = selectedElement as NodeElement;
      switch (hoveredPart.type) {
        case "Node":
          // NODE on NODE
          const hoveredNode = hoveredElement as NodeElement;
          actions.push(
            ...fuse_nodes(
              selectedNode,
              hoveredNode,
              mechanicalElements,
              constraintElements,
            ),
          );
          break;
        case "Edge":
          // NODE on EDGE
          const hoveredEdge = hoveredElement as EdgeElement;
          actions.push(
            ...connect_node_and_edge(
              selectedNode,
              hoveredEdge,
              hoveredPart.part,
              mechanicalElements,
              loads,
            ),
          );
          break;
        case "GearTooth":
          // NODE on GEAR
          actions.push(
            ...connect_node_and_edge(
              selectedNode,
              hoveredElement as GearElement,
              "body",
              mechanicalElements,
              loads,
            ),
          );
          break;
      }
      break;
    case "Edge":
      const selectedEdge = selectedElement as EdgeElement;
      switch (hoveredPart.type) {
        case "Node":
          // EDGE on NODE
          const hoveredNode = hoveredElement as NodeElement;
          actions.push(
            ...connect_node_and_edge(
              hoveredNode,
              selectedEdge,
              selectedPart.part,
              mechanicalElements,
              loads,
            ),
          );
          break;
        case "Edge":
          // EDGE on EDGE
          actions.push(
            ...connect_two_edges(
              hoveredElement as EdgeElement,
              hoveredPart.part,
              selectedEdge,
              selectedPart.part,
              hoveredPart.position,
              mechanicalElements,
              loads,
            ),
          );
          break;
        case "GearTooth":
          // EDGE on GEAR
          actions.push(
            ...connect_two_edges(
              selectedEdge,
              selectedPart.part,
              hoveredElement as GearElement,
              "body",
              hoveredPart.position,
              mechanicalElements,
              loads,
            ),
          );
          break;
      }
      break;
    case "GearTooth":
      const selectedGear = selectedElement as GearElement;
      switch (hoveredPart.type) {
        case "Node":
          // GEAR on NODE
          actions.push(
            ...connect_node_and_edge(
              hoveredElement as NodeElement,
              selectedGear,
              "body",
              mechanicalElements,
              loads,
            ),
          );
          break;
        case "Edge":
          // GEAR on EDGE
          actions.push(
            ...connect_two_edges(
              hoveredElement as EdgeElement,
              hoveredPart.part,
              selectedGear,
              "body",
              hoveredPart.position,
              mechanicalElements,
              loads,
            ),
          );
          break;
        case "GearTooth":
          // GEAR on GEAR
          actions.push(
            ...connect_meshed_gears(selectedGear.id, hoveredElement.id),
          );
          break;
      }
      break;
  }

  console.log("connect_elements : ", actions);

  return actions;
}

/**
 * Connects a node and an edge bidirectionally.
 *
 * Idempotent: a link already present on either side is not emitted again, so
 * re-connecting an existing pair is a no-op rather than a duplicate entry.
 */
/**
 * Releases an edge end from the node currently holding it.
 *
 * Only the node's edge lists are cleared: a node may also hold the same edge as
 * its `parentBeamID` — a slider sliding along it — which the endpoint moving
 * away does not end.
 */
function detach_edge_end(
  edge: EdgeElement,
  previousNodeID: ID | undefined,
  node: NodeElement,
  mechanicalElements: MechanicalElement[],
): Action[] {
  if (!previousNodeID || previousNodeID === node.id) return [];
  const previous = mechanicalElements.find((e) => e.id === previousNodeID);
  if (!previous) return [];
  return get_connection_pair_types(edge.id, previous)
    .filter(
      (pairType) =>
        pairType === "ConnectsRotatingEdges" ||
        pairType === "ConnectsFixedEdges",
    )
    .map((pairType) =>
      disconnect_element(previous, edge, pairType, mechanicalElements),
    );
}

function connect_node_and_edge(
  node: NodeElement,
  edge: EdgeElement | GearElement,
  edgePart: "start" | "end" | "body",
  mechanicalElements: MechanicalElement[],
  loads: LoadElement[] = [],
): Action[] {
  const actions: Action[] = [];
  if (
    "parentBeamID" in node &&
    !node.parentBeamID &&
    edgePart === "body" &&
    edge.type !== "gear"
  ) {
    actions.push({
      type: "ConnectsParentBeam",
      disconnect: false,
      elementID: node.id,
      connectID: edge.id,
    });
  } else if ("rotatingEdgesIDs" in node) {
    if (!node.rotatingEdgesIDs.includes(edge.id))
      actions.push({
        type: "ConnectsRotatingEdges",
        disconnect: false,
        elementID: node.id,
        connectID: edge.id,
        index: 0,
      });
  } else if ("fixedEdgesIDs" in node) {
    if (!node.fixedEdgesIDs.includes(edge.id))
      actions.push({
        type: "ConnectsFixedEdges",
        disconnect: false,
        elementID: node.id,
        connectID: edge.id,
        index: 0,
      });
  }
  switch (edgePart) {
    case "start":
      if (edge.type !== "gear" && edge.fixedNodeStartID !== node.id) {
        actions.push(
          ...detach_edge_end(
            edge,
            edge.fixedNodeStartID,
            node,
            mechanicalElements,
          ),
        );
        actions.push({
          type: "ConnectsFixedNodeStart",
          disconnect: false,
          elementID: edge.id,
          connectID: node.id,
        });
      }
      break;
    case "end":
      if (edge.type !== "gear" && edge.fixedNodeEndID !== node.id) {
        actions.push(
          ...detach_edge_end(
            edge,
            edge.fixedNodeEndID,
            node,
            mechanicalElements,
          ),
        );
        actions.push({
          type: "ConnectsFixedNodeEnd",
          disconnect: false,
          elementID: edge.id,
          connectID: node.id,
        });
      }
      break;
    case "body":
      if (
        !("fixedNodesBodyIDs" in edge) ||
        !edge.fixedNodesBodyIDs.includes(node.id)
      )
        actions.push({
          type: "ConnectsFixedNodesBody",
          disconnect: false,
          elementID: edge.id,
          connectID: node.id,
          index: 0,
        });
  }
  if (edgePart === "body") return actions;

  const edgeForces = loads.filter(
    (l): l is ForceElement =>
      l.type === "force" && l.targetID === edge.id && l.anchor === edgePart,
  );
  const nodeHasForce = loads.some(
    (l) => l.type === "force" && l.targetID === node.id,
  );
  for (const ef of edgeForces) {
    actions.push({ type: "DeleteElement", element: ef });
    if (!nodeHasForce) {
      actions.push({
        type: "CreateElement",
        element: {
          type: "force",
          id: crypto.randomUUID() as ID,
          targetID: node.id,
          vector: ef.vector,
          frame: ef.frame,
        },
      });
    }
  }
  return actions;
}

/** The node fixed at that end of an edge, if the part designates a single one. */
function node_at_edge_part(
  edge: EdgeElement | GearElement,
  edgePart: "start" | "end" | "body",
): ID | undefined {
  if (edge.type === "gear") return undefined;
  if (edgePart === "start") return edge.fixedNodeStartID;
  if (edgePart === "end") return edge.fixedNodeEndID;
  return undefined;
}

/**
 * Connects 2 edges together (beam body / gear perimeter) by creating a join at the contact point.
 *
 * Idempotent: two ends already held by the same node are left alone, rather than
 * given a second join that would orphan the first.
 */
function connect_two_edges(
  edge1: EdgeElement | GearElement,
  edgePart1: "start" | "end" | "body",
  edge2: EdgeElement | GearElement,
  edgePart2: "start" | "end" | "body",
  position: Point2,
  mechanicalElements: MechanicalElement[],
  loads: LoadElement[] = [],
): Action[] {
  const node1 = node_at_edge_part(edge1, edgePart1);
  if (node1 && node1 === node_at_edge_part(edge2, edgePart2)) return [];

  const join: JoinElement = {
    type: "join",
    id: crypto.randomUUID(),
    probes: [],
    overlays: {},
    fixedEdgesIDs: [],
    position,
    isGrounded: false,
  };
  return [
    { type: "CreateElement", element: join },
    ...connect_node_and_edge(join, edge1, edgePart1, mechanicalElements, loads),
    ...connect_node_and_edge(join, edge2, edgePart2, mechanicalElements, loads),
  ];
}

/** Connects two gears together (meshing). */
export function connect_meshed_gears(gear1ID: ID, gear2ID: ID): Action[] {
  return [
    {
      type: "ConnectsMeshedGears",
      disconnect: false,
      elementID: gear1ID,
      connectID: gear2ID,
      index: 0,
    },
    {
      type: "ConnectsMeshedGears",
      disconnect: false,
      elementID: gear2ID,
      connectID: gear1ID,
      index: 0,
    },
  ];
}

/** Connects a gear and a belt bidirectionally. */
/**
 * Insert a gear into a belt's straight section, winding the belt on the side its
 * centre sits on.
 *
 * The centre is passed rather than read from the gear: the placement tool creates
 * the gear in the same batch, so it is not in `mechanicalElements` yet.
 */
export function attach_gear_to_belt(
  gearID: ID,
  gearCenter: Point2,
  belt: BeltElement,
  section: number,
  mechanicalElements: MechanicalElement[],
  approach: BeltGearApproach,
): Action[] {
  const index = belt_section_insertion_index(section, belt.closed);
  if (index === undefined) return [];
  return [
    ...evict_belt_from_gear(gearID, belt.id, mechanicalElements),
    ...connect_gear_and_belt(
      gearID,
      belt.id,
      index,
      belt_wrap_direction(
        gearCenter,
        belt,
        section,
        mechanicalElements,
        approach,
      ),
    ),
  ];
}

/**
 * A gear carries one belt. When a new belt takes a gear another already holds,
 * the previous belt lets go of it (the closure-correction pass then opens that
 * belt if it drops below a loop). A freshly placed gear is not in the mechanism
 * yet, so it holds nothing and this is a no-op.
 *
 * Both directions are cut, not just the belt's list: `attachedBeltID` is written
 * by the connect that follows, but undoing that write clears it to `undefined`
 * rather than back to the old belt. Cutting the gear→belt side here makes the
 * eviction reversible — the undo restores the previous belt on both sides.
 */
export function evict_belt_from_gear(
  gearID: ID,
  incomingBeltID: ID,
  mechanicalElements: MechanicalElement[],
): Action[] {
  const gear = mechanicalElements.find((el) => el.id === gearID);
  if (!gear || !("attachedBeltID" in gear)) return [];
  const previous = gear.attachedBeltID;
  if (!previous || previous === incomingBeltID) return [];
  const oldBelt = get_mechanical_element_from_id(previous, mechanicalElements);
  return [
    disconnect_element(
      oldBelt,
      gear,
      "ConnectsAttachedGears",
      mechanicalElements,
    ),
    disconnect_element(gear, oldBelt, "ConnectsAttachedBelt", mechanicalElements),
  ];
}

function connect_gear_and_belt(
  gearID: ID,
  beltID: ID,
  index: number,
  direction: boolean,
): Action[] {
  return [
    {
      type: "ConnectsAttachedBelt",
      disconnect: false,
      elementID: gearID,
      connectID: beltID,
    },
    {
      type: "ConnectsAttachedGears",
      disconnect: false,
      elementID: beltID,
      connectID: gearID,
      index,
      direction,
    },
  ];
}
