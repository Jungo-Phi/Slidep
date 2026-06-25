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
import { HoveredPart } from "../../types/hovered-part";
import { connected_constraints, node_on_beam_body } from "../canvas/utils";
import { legible_id } from "../../utils";

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

/** Returns the complementary connection pair type of an element to another. */
export function get_connection_pair_type(
  elementID: ID,
  connectedElement: MechanicalElement,
): ConnectsActionType {
  if (
    "fixedEdgesIDs" in connectedElement &&
    connectedElement.fixedEdgesIDs.includes(elementID)
  )
    return "ConnectsFixedEdges";

  if (
    "rotatingEdgesIDs" in connectedElement &&
    connectedElement.rotatingEdgesIDs.includes(elementID)
  )
    return "ConnectsRotatingEdges";

  if (
    "parentBeamID" in connectedElement &&
    connectedElement.parentBeamID === elementID
  )
    return "ConnectsParentBeam";

  if (
    "fixedNodeStartID" in connectedElement &&
    connectedElement.fixedNodeStartID === elementID
  )
    return "ConnectsFixedNodeStart";

  if (
    "fixedNodeEndID" in connectedElement &&
    connectedElement.fixedNodeEndID === elementID
  )
    return "ConnectsFixedNodeEnd";

  if (
    "fixedNodesBodyIDs" in connectedElement &&
    connectedElement.fixedNodesBodyIDs.includes(elementID)
  )
    return "ConnectsFixedNodesBody";

  if (
    "parentAxleID" in connectedElement &&
    connectedElement.parentAxleID === elementID
  )
    return "ConnectsParentAxle";
  if (
    "meshedGearsIDs" in connectedElement &&
    connectedElement.meshedGearsIDs.includes(elementID)
  )
    return "ConnectsMeshedGears";

  if (
    "attachedGearsIDs" in connectedElement &&
    connectedElement.attachedGearsIDs.some(
      (attachedGear) => attachedGear.id === elementID,
    )
  )
    return "ConnectsAttachedGears";

  if (
    "attachedBeltID" in connectedElement &&
    connectedElement.attachedBeltID === elementID
  )
    return "ConnectsAttachedBelt";

  if (
    "fixedGearsIDs" in connectedElement &&
    (connectedElement.fixedGearsIDs as ID[]).includes(elementID)
  )
    return "ConnectsFixedGears";

  throw new Error("Connection pair type has not been found !");
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
  let connectionTypes: ConnectsActionType[] = [];
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
    console.log("get_connections: ", get_connections(element, containerType));
    return {
      type: containerType,
      disconnect: true,
      elementID: element.id,
      connectID: connectedElement.id,
      index: get_connections(element, containerType).indexOf(
        connectedElement.id,
      ),
      direction: belt.attachedGearsIDs.find(
        (gear) => gear.id === connectedElement.id,
      )?.direction!,
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

export function connect_element(
  element: MechanicalElement,
  connectedElement: MechanicalElement,
  containerType: ConnectsActionType,
  insertIndex: number,
  //mechanicalElements: MechanicalElement[],
): Action {
  if (containerType === "ConnectsAttachedGears") {
    // const belt = get_mechanical_element_from_id(element.id, mechanicalElements) as BeltElement;
    return {
      type: containerType,
      disconnect: false,
      elementID: connectedElement.id,
      connectID: element.id,
      index: insertIndex,
      direction: false, // TODO : belt.attachedGearsIDs.find((gear) => gear.id === element.id)?.direction!,
    };
  } else {
    return {
      type: containerType,
      disconnect: false,
      elementID: connectedElement.id,
      connectID: element.id,
      index: insertIndex,
    };
  }
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
  let actions: Action[] = [];
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
          const connection_pair_type = get_connection_pair_type(
            element.id,
            connectedElement,
          );
          actions.push(
            disconnect_element(
              connectedElement,
              element,
              connection_pair_type,
              mechanicalElements,
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
  return actions;
}

/**
 * Applies a single structural action (Delete or Connect/Disconnect) to mutable
 * simulated-state arrays. Used by delete_elements to maintain correct indices
 * between successive deletions within the same batch.
 */
function apply_to_sim_state(
  action: Action,
  simMech: MechanicalElement[],
  simConst: ConstraintElement[],
  simLoad: LoadElement[],
) {
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
  // Shallow-clone with deep-copied mutable arrays so the simulation
  // never touches the caller's state.
  const simMech: MechanicalElement[] = mechanicalElements.map(
    (el) =>
      ({
        ...el,
        ...("fixedEdgesIDs" in el && { fixedEdgesIDs: [...el.fixedEdgesIDs] }),
        ...("rotatingEdgesIDs" in el && {
          rotatingEdgesIDs: [...el.rotatingEdgesIDs],
        }),
        ...("meshedGearsIDs" in el && {
          meshedGearsIDs: [...el.meshedGearsIDs],
        }),
        ...("fixedGearsIDs" in el && { fixedGearsIDs: [...el.fixedGearsIDs] }),
        ...("fixedNodesBodyIDs" in el && {
          fixedNodesBodyIDs: [...el.fixedNodesBodyIDs],
        }),
        ...("attachedGearsIDs" in el && {
          attachedGearsIDs: el.attachedGearsIDs.map((g) => ({ ...g })),
        }),
      }) as MechanicalElement,
  );
  const simConst: ConstraintElement[] = [...constraintElements];
  const simLoad: LoadElement[] = [...loadElements];

  const allActions: Action[] = [];

  for (const id of elementIDs) {
    // Skip if a previous deletion in this batch already removed this element
    // (e.g. a constraint shared by two deleted mechanical elements).
    const exists =
      simMech.find((e) => e.id === id) ??
      simConst.find((e) => e.id === id) ??
      simLoad.find((e) => e.id === id);
    if (!exists) continue;

    const stepActions = delete_element(id, simMech, simConst, simLoad);
    allActions.push(...stepActions);

    // Advance the simulation so the next iteration sees correct state.
    for (const action of stepActions) {
      apply_to_sim_state(action, simMech, simConst, simLoad);
    }
  }

  return allActions;
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
  const connectedEdge = get_mechanical_element_from_id(
    edgeID,
    mechanicalElements,
  ) as EdgeElement;
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

  if ("parentBeamID" in sourceNode && sourceNode.parentBeamID) {
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
    sourceNode.fixedEdgesIDs.forEach((edgeID) => {
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
    sourceNode.rotatingEdgesIDs.forEach((edgeID) => {
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
    hoveredPart.id === selectedPart.id
  ) {
    return [];
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
          if (
            selectedNode.type === "pivot" &&
            !selectedNode.motor &&
            hoveredNode.type === "slider"
          ) {
            const slidep: SlidepElement = {
              type: "slidep",
              parentBeamID: hoveredNode.parentBeamID,
              rotatingEdgesIDs: selectedNode.rotatingEdgesIDs.concat(
                hoveredNode.fixedEdgesIDs,
              ),
              fixedGearsIDs: selectedNode.fixedGearsIDs,
              position: hoveredNode.position,
              isGrounded: selectedNode.isGrounded || hoveredNode.isGrounded,
              id: selectedNode.id,
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
          } else if (
            selectedNode.type === "slider" &&
            hoveredNode.type === "pivot"
          ) {
            // Fuse them into a Slidep — symétrique au cas pivot+slider :
            // le slidep hérite de l'ID du pivot pour que gear.parentAxleID reste valide.
            const parentBeam = node_on_beam_body(
              hoveredNode,
              mechanicalElements,
            );
            const parentBeamID = selectedNode.parentBeamID
              ? selectedNode.parentBeamID
              : parentBeam
                ? parentBeam.id
                : undefined;
            const slidep: SlidepElement = {
              type: "slidep",
              parentBeamID,
              rotatingEdgesIDs: selectedNode.fixedEdgesIDs
                .concat(hoveredNode.rotatingEdgesIDs)
                .filter((edgeID) => edgeID !== parentBeamID),
              fixedGearsIDs: hoveredNode.fixedGearsIDs,
              position: hoveredNode.position,
              isGrounded: selectedNode.isGrounded || hoveredNode.isGrounded,
              id: hoveredNode.id,
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
            actions.push(
              ...transfer_internal_connections(hoveredNode, selectedNode),
            );
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
          break;
        case "Edge":
          // NODE on EDGE
          const hoveredEdge = hoveredElement as EdgeElement;
          actions.push(
            ...connect_node_and_edge(
              selectedNode,
              hoveredEdge,
              hoveredPart.part,
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
              loads,
            ),
          );
          break;
        case "Edge":
          // EDGE on EDGE
          const hoveredEdge = hoveredElement as EdgeElement;
          // Connect the two edges with a join
          const join: JoinElement = {
            type: "join",
            fixedEdgesIDs: [],
            position: hoveredPart.position,
            isGrounded: false,
            id: crypto.randomUUID(),
          };
          actions.push({ type: "CreateElement", element: join });
          actions.push(
            ...connect_node_and_edge(
              join,
              hoveredEdge,
              hoveredPart.part,
              loads,
            ),
          );
          actions.push(
            ...connect_node_and_edge(
              join,
              selectedEdge,
              selectedPart.part,
              loads,
            ),
          );
          break;
      }
      break;
    case "GearTooth":
      const selectedGear = selectedElement as GearElement;
      switch (hoveredPart.type) {
        case "GearTooth":
          // GEAR on GEAR
          const hoveredGear = hoveredElement as GearElement;
          actions.push({
            type: "ConnectsMeshedGears",
            disconnect: false,
            elementID: selectedGear.id,
            connectID: hoveredGear.id,
            index: 0,
          });
          actions.push({
            type: "ConnectsMeshedGears",
            disconnect: false,
            elementID: hoveredGear.id,
            connectID: selectedGear.id,
            index: 0,
          });
          break;
      }
      break;
  }

  console.log("connect_elements : ", actions);

  return actions;
}

/** Connects a node and an edge bidirectionally. */
function connect_node_and_edge(
  node: NodeElement,
  edge: EdgeElement,
  edgePart: "start" | "end" | "body",
  loads: LoadElement[] = [],
): Action[] {
  let actions: Action[] = [];
  if ("parentBeamID" in node && !node.parentBeamID && edgePart === "body") {
    actions.push({
      type: "ConnectsParentBeam",
      disconnect: false,
      elementID: node.id,
      connectID: edge.id,
    });
  } else if ("rotatingEdgesIDs" in node) {
    actions.push({
      type: "ConnectsRotatingEdges",
      disconnect: false,
      elementID: node.id,
      connectID: edge.id,
      index: 0,
    });
  } else if ("fixedEdgesIDs" in node) {
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
      actions.push({
        type: "ConnectsFixedNodeStart",
        disconnect: false,
        elementID: edge.id,
        connectID: node.id,
      });
      break;
    case "end":
      actions.push({
        type: "ConnectsFixedNodeEnd",
        disconnect: false,
        elementID: edge.id,
        connectID: node.id,
      });
      break;
    case "body":
      actions.push({
        type: "ConnectsFixedNodesBody",
        disconnect: false,
        elementID: edge.id,
        connectID: node.id,
        index: 0,
      });
  }
  if (edgePart !== "body") {
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
          },
        });
      }
    }
  }
  return actions;
}

/** Connects two gears together (meshing only). */
export function connect_gears(gear1ID: ID, gear2ID: ID): Action[] {
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
export function connect_gear_and_belt(
  gearID: ID,
  beltID: ID,
  beltSection: number,
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
      index: beltSection / 2,
      direction,
    },
  ];
}
