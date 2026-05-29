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
    console.log(
      "get_connections: ",
      get_connections(connectedElement, containerType),
    );
    return {
      type: containerType,
      disconnect: true,
      elementID: element.id,
      connectID: connectedElement.id,
      index: get_connections(connectedElement, containerType).indexOf(
        element.id,
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
      index: get_connections(connectedElement, containerType).indexOf(
        element.id,
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
 * Returns the actions to erase the connections of linked elements and the deletion itself.
 */
export function delete_element(
  element: UnionElement,
  mechanicalElements: MechanicalElement[],
): Action[] {
  let actions: Action[] = [];
  console.log("Delete: ", element.type, element.id.toString().padStart(3, "0"));
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
      get_connections(element, connectionType).forEach((connectedElementID) => {
        const connectedElement = get_mechanical_element_from_id(
          connectedElementID,
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
  return actions;
}

/**
 * Connects an element (elementPart) to another (hoveredPart) based on the hovered part.
 *
 * Returns the actions to perform bidirectional connections and handles special cases (connections transfer, fusion, etc.)
 *
 * All connections are allowed, the element (grabbed) takes over.
 */
export function connect_elements(
  mechanicalElements: MechanicalElement[],
  IDcounter: React.MutableRefObject<number>,
  hoveredPart: HoveredPart,
  element: MechanicalElement,
  elementPart: HoveredPart,
): Action[] {
  if (
    hoveredPart.type === "Void" ||
    hoveredPart.type === "Constraint" ||
    elementPart.type === "Void" ||
    elementPart.type === "Constraint" ||
    hoveredPart.id === elementPart.id
  ) {
    return [];
  }
  const hoveredElement = get_mechanical_element_from_id(
    hoveredPart.id,
    mechanicalElements,
  ) as MechanicalElement;
  let actions: Action[] = [];

  console.log(
    "CONNECT ELEMENT : ",
    element.type,
    elementPart,
    " TO HOVERED :",
    hoveredElement.type,
    hoveredPart,
  ); // DEBUG

  switch (elementPart.type) {
    case "Node":
      const node = element as NodeElement;
      switch (hoveredPart.type) {
        case "Node":
          // NODE on NODE
          const hoveredNode = hoveredElement as NodeElement;
          if (node.type === "pivot" && hoveredNode.type === "slider") {
            // Fuse them into a Slidep
            let slidep: SlidepElement = {
              type: "slidep",
              parentBeamID: hoveredNode.parentBeamID,
              rotatingEdgesIDs: node.rotatingEdgesIDs.concat(
                hoveredNode.fixedEdgesIDs,
              ),
              position: hoveredNode.position,
              isGrounded: node.isGrounded || hoveredNode.isGrounded,
              id: hoveredNode.id,
            };
            actions.push({ type: "DeleteElement", element: node });
            actions.push({ type: "DeleteElement", element: hoveredNode });
            actions.push({ type: "CreateElement", element: slidep });
            node.rotatingEdgesIDs.forEach((edgeID) => {
              const connectedEdge = get_mechanical_element_from_id(
                edgeID,
                mechanicalElements,
              ) as EdgeElement;
              if (connectedEdge.fixedNodeEndID === node.id) {
                actions.push({
                  type: "ConnectsFixedNodeEnd",
                  disconnect: true,
                  elementID: edgeID,
                  connectID: node.id,
                });
                actions.push({
                  type: "ConnectsFixedNodeEnd",
                  disconnect: false,
                  elementID: edgeID,
                  connectID: hoveredNode.id,
                });
              }
              if (connectedEdge.fixedNodeStartID === node.id) {
                actions.push({
                  type: "ConnectsFixedNodeStart",
                  disconnect: true,
                  elementID: edgeID,
                  connectID: node.id,
                });
                actions.push({
                  type: "ConnectsFixedNodeStart",
                  disconnect: false,
                  elementID: edgeID,
                  connectID: hoveredNode.id,
                });
              }
              if (
                "fixedNodesBodyIDs" in connectedEdge &&
                connectedEdge.fixedNodesBodyIDs.includes(node.id)
              ) {
                actions.push({
                  type: "ConnectsFixedNodesBody",
                  disconnect: true,
                  elementID: edgeID,
                  connectID: node.id,
                  index: 0, // TODO : remove at corresponding index
                });
                actions.push({
                  type: "ConnectsFixedNodesBody",
                  disconnect: false,
                  elementID: edgeID,
                  connectID: hoveredNode.id,
                  index: 0,
                });
              }
            });
          } else if (node.type === "slider" && hoveredNode.type === "pivot") {
            // Fuse them into a Slidep
            let slidep: SlidepElement = {
              type: "slidep",
              parentBeamID: node.parentBeamID,
              rotatingEdgesIDs: node.fixedEdgesIDs.concat(
                hoveredNode.rotatingEdgesIDs,
              ),
              position: hoveredNode.position,
              isGrounded: node.isGrounded || hoveredNode.isGrounded,
              id: node.id,
            };
            // TODO : update the connections of the slidep
            actions.push({ type: "DeleteElement", element: node });
            actions.push({ type: "DeleteElement", element: hoveredNode });
            actions.push({ type: "CreateElement", element: slidep });
          } else if (node.type === "gear" && hoveredNode.type === "gear") {
            actions.push({
              type: "ConnectsFixedGears",
              disconnect: false,
              elementID: node.id,
              connectID: hoveredNode.id,
              index: 0,
            });
            actions.push({
              type: "ConnectsFixedGears",
              disconnect: false,
              elementID: hoveredNode.id,
              connectID: node.id,
              index: 0,
            });
          } else {
            // TODO : Replace the hovered node and inherit its connections
          }
          break;
        case "Edge":
          // NODE on EDGE
          const hoveredEdge = hoveredElement as EdgeElement;
          actions.push(
            ...connect_node_and_edge(node, hoveredEdge, hoveredPart.part),
          );
          break;
      }
      break;
    case "Edge":
      const edge = element as EdgeElement;
      switch (hoveredPart.type) {
        case "Node":
          // EDGE on NODE
          const hoveredNode = hoveredElement as NodeElement;
          actions.push(
            ...connect_node_and_edge(hoveredNode, edge, elementPart.part),
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
          actions.push(...connect_node_and_edge(join, edge, elementPart.part));
          break;
      }
      break;
    case "GearTooth":
      const gear = element as GearElement;
      switch (hoveredPart.type) {
        case "GearTooth":
          // GEAR on GEAR
          const hoveredGear = hoveredElement as GearElement;
          actions.push({
            type: "ConnectsMeshedGears",
            disconnect: false,
            elementID: gear.id,
            connectID: hoveredGear.id,
            index: 0,
          });
          actions.push({
            type: "ConnectsMeshedGears",
            disconnect: false,
            elementID: hoveredGear.id,
            connectID: gear.id,
            index: 0,
          });
          break;
      }
      break;
  }

  return actions;
}

/** Connects a node and an edge bidirectionally. */
function connect_node_and_edge(
  node: NodeElement,
  edge: EdgeElement,
  edgePart: "start" | "end" | "body",
): Action[] {
  let actions: Action[] = [];
  if ("parentBeamID" in node && edgePart === "body") {
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
export function connect_gears(gear1ID: ID, gear2ID: ID): Action[] {
  let actions: Action[] = [];
  actions.push({
    type: "ConnectsMeshedGears",
    disconnect: false,
    elementID: gear1ID,
    connectID: gear2ID,
    index: 0,
  });
  actions.push({
    type: "ConnectsMeshedGears",
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
