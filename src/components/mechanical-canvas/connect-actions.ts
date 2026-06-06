import type {
  BeltElement,
  ConstraintElement,
  EdgeElement,
  GearElement,
  ID,
  JoinElement,
  MechanicalElement,
  NodeElement,
  SlidepElement,
  UnionElement,
} from "../../types/element";
import { Action, ConnectsActionType } from "../../types";
import { HoveredPart } from "../../types/hovered-part";
import { connected_constraints, node_on_beam_body } from "./utils";

/** Returns the mechanical element from the id. */
export function get_mechanical_element_from_id(
  id: ID,
  mechanicalElements: MechanicalElement[],
): MechanicalElement {
  const element = mechanicalElements.find((element) => element.id === id);
  if (element) return element;
  throw new Error(`Mechanical element with id "${id}" not found`);
}

/** Returns the constraint element from the id. */
export function get_constraint_element_from_id(
  id: ID,
  constraintElements: ConstraintElement[],
): ConstraintElement {
  const element = constraintElements.find((element) => element.id === id);
  if (element) return element;
  throw new Error(`Constraint element with id "${id}" not found`);
}

/** Returns the element (mechanical or constraint) from the id. */
export function get_element_from_id(
  id: ID,
  mechanicalElements: MechanicalElement[],
  constraintElements: ConstraintElement[],
): UnionElement {
  const mechanicalElement = mechanicalElements.find(
    (element) => element.id === id,
  );
  if (mechanicalElement) return mechanicalElement;
  const constraintElement = constraintElements.find(
    (element) => element.id === id,
  );
  if (constraintElement) return constraintElement;
  throw new Error(`Mechanical element with id "${id}" not found`);
}

/** Returns the complementary connection pair type of an element to another. */
export function get_connection_pair_type(
  elementID: ID,
  connectedElement: MechanicalElement,
): ConnectsActionType {
  if (
    "fixedEdgesIDs" in connectedElement &&
    connectedElement.fixedEdgesIDs.includes(elementID)
  ) {
    return "ConnectsFixedEdges";
  }
  if (
    "rotatingEdgesIDs" in connectedElement &&
    connectedElement.rotatingEdgesIDs.includes(elementID)
  ) {
    return "ConnectsRotatingEdges";
  }
  if (
    "parentBeamID" in connectedElement &&
    connectedElement.parentBeamID === elementID
  ) {
    return "ConnectsParentBeam";
  }
  if (
    "fixedNodeStartID" in connectedElement &&
    connectedElement.fixedNodeStartID === elementID
  ) {
    return "ConnectsFixedNodeStart";
  }
  if (
    "fixedNodeEndID" in connectedElement &&
    connectedElement.fixedNodeEndID === elementID
  ) {
    return "ConnectsFixedNodeEnd";
  }
  if (
    "fixedNodesBodyIDs" in connectedElement &&
    connectedElement.fixedNodesBodyIDs.includes(elementID)
  ) {
    return "ConnectsFixedNodesBody";
  }
  if (
    "meshedGearsIDs" in connectedElement &&
    connectedElement.meshedGearsIDs.includes(elementID)
  ) {
    return "ConnectsMeshedGears";
  }
  if (
    "attachedGearsIDs" in connectedElement &&
    connectedElement.attachedGearsIDs.some(
      (attachedGear) => attachedGear.id === elementID,
    )
  ) {
    return "ConnectsAttachedGears";
  }
  if (
    "fixedGearsIDs" in connectedElement &&
    connectedElement.fixedGearsIDs.includes(elementID)
  ) {
    return "ConnectsFixedGears";
  }
  if (
    "attachedBeltID" in connectedElement &&
    connectedElement.attachedBeltID === elementID
  ) {
    return "ConnectsAttachedBelt";
  }
  throw new Error("Connection pair type has not been found !");
}

/** Returns the array of connected elements of a given type. */
export function get_connections(
  element: MechanicalElement,
  connectionType: ConnectsActionType,
): ID[] {
  switch (connectionType) {
    case "ConnectsFixedEdges":
      if ("fixedEdgesIDs" in element) {
        return element.fixedEdgesIDs;
      }
      break;
    case "ConnectsRotatingEdges":
      if ("rotatingEdgesIDs" in element) {
        return element.rotatingEdgesIDs;
      }
      break;
    case "ConnectsParentBeam":
      if ("parentBeamID" in element) {
        return element.parentBeamID ? [element.parentBeamID] : [];
      }
      break;
    case "ConnectsFixedNodeStart":
      if ("fixedNodeStartID" in element) {
        return element.fixedNodeStartID ? [element.fixedNodeStartID] : [];
      }
      break;
    case "ConnectsFixedNodeEnd":
      if ("fixedNodeEndID" in element) {
        return element.fixedNodeEndID ? [element.fixedNodeEndID] : [];
      }
      break;
    case "ConnectsFixedNodesBody":
      if ("fixedNodesBodyIDs" in element) {
        return element.fixedNodesBodyIDs;
      }
      break;
    case "ConnectsMeshedGears":
      if ("meshedGearsIDs" in element) {
        return element.meshedGearsIDs;
      }
      break;
    case "ConnectsAttachedGears":
      if ("attachedGearsIDs" in element) {
        return element.attachedGearsIDs.map((attachedGear) => attachedGear.id);
      }
      break;
    case "ConnectsFixedGears":
      if ("fixedGearsIDs" in element) {
        return element.fixedGearsIDs;
      }
      break;
    case "ConnectsAttachedBelt":
      if ("attachedBeltID" in element) {
        return element.attachedBeltID ? [element.attachedBeltID] : [];
      }
      break;
  }
  return [];
}

/** Returns the connection types (`ConnectsActionType[]`) of an elements. */
export function get_connection_types(
  element: MechanicalElement,
): ConnectsActionType[] {
  let connectionTypes: ConnectsActionType[] = [];
  if ("fixedEdgesIDs" in element) {
    connectionTypes.push("ConnectsFixedEdges");
  }
  if ("rotatingEdgesIDs" in element) {
    connectionTypes.push("ConnectsRotatingEdges");
  }
  if ("parentBeamID" in element) {
    connectionTypes.push("ConnectsParentBeam");
  }
  if ("fixedNodeStartID" in element) {
    connectionTypes.push("ConnectsFixedNodeStart");
  }
  if ("fixedNodeEndID" in element) {
    connectionTypes.push("ConnectsFixedNodeEnd");
  }
  if ("fixedNodesBodyIDs" in element) {
    connectionTypes.push("ConnectsFixedNodesBody");
  }
  if ("meshedGearsIDs" in element) {
    connectionTypes.push("ConnectsMeshedGears");
  }
  if ("attachedGearsIDs" in element) {
    connectionTypes.push("ConnectsAttachedGears");
  }
  if ("fixedGearsIDs" in element) {
    connectionTypes.push("ConnectsFixedGears");
  }
  if ("attachedBeltID" in element) {
    connectionTypes.push("ConnectsAttachedBelt");
  }
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
 */
export function delete_element(
  elementID: ID,
  mechanicalElements: MechanicalElement[],
  constraintElements: ConstraintElement[],
): Action[] {
  let actions: Action[] = [];
  const element = get_element_from_id(
    elementID,
    mechanicalElements,
    constraintElements,
  );
  // console.log("Delete: ", element.type, element.id.toString().padStart(3, "0"));
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
    get_connection_types(element).forEach((connectionType) => {
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
  IDcounter: React.MutableRefObject<number>,
  mechanicalElements: MechanicalElement[],
  constraintElements: ConstraintElement[],
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
          if (selectedNode.type === "pivot" && hoveredNode.type === "slider") {
            const slidep: SlidepElement = {
              type: "slidep",
              parentBeamID: hoveredNode.parentBeamID,
              rotatingEdgesIDs: selectedNode.rotatingEdgesIDs.concat(
                hoveredNode.fixedEdgesIDs,
              ),
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
            // Fuse them into a Slidep
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
            selectedNode.type === "gear" &&
            hoveredNode.type === "gear"
          ) {
            actions.push(
              ...connect_gears(
                selectedNode.id,
                hoveredNode.id,
                "ConnectsFixedGears",
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
            id: IDcounter.current,
          };
          IDcounter.current++;
          actions.push({ type: "CreateElement", element: join });
          actions.push(
            ...connect_node_and_edge(join, hoveredEdge, hoveredPart.part),
          );
          actions.push(
            ...connect_node_and_edge(join, selectedEdge, selectedPart.part),
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
  return actions;
}

/** Connects two gears together. */
export function connect_gears(
  gear1ID: ID,
  gear2ID: ID,
  connectionType: "ConnectsMeshedGears" | "ConnectsFixedGears",
): Action[] {
  let actions: Action[] = [];
  actions.push({
    type: connectionType,
    disconnect: false,
    elementID: gear1ID,
    connectID: gear2ID,
    index: 0,
  });
  actions.push({
    type: connectionType,
    disconnect: false,
    elementID: gear2ID,
    connectID: gear1ID,
    index: 0,
  });
  return actions;
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
