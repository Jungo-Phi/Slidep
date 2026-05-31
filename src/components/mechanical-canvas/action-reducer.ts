import {
  Action,
  Mechanism,
  NodeElement,
  BeltElement,
  UnionElement,
  Point2,
} from "../../types";
import {
  get_constraint_element_from_id,
  get_mechanical_element_from_id,
} from "./connect-actions";

export function actionReducer(
  mechanism: Mechanism,
  actions: Action[],
  revert: boolean,
): Mechanism {
  let mechanicalElements = [...mechanism.mechanicalElements];
  let constraintElements = [...mechanism.constraintElements];
  let element: UnionElement;
  actions.forEach((action) => {
    switch (action.type) {
      case "CreateElement":
      case "DeleteElement":
        if (
          action.element.type === "pivot" ||
          action.element.type === "slider" ||
          action.element.type === "slidep" ||
          action.element.type === "join" ||
          action.element.type === "mass" ||
          action.element.type === "gear" ||
          action.element.type === "beam" ||
          action.element.type === "spring" ||
          action.element.type === "damper" ||
          action.element.type === "belt"
        ) {
          if (revert !== (action.type === "DeleteElement")) {
            mechanicalElements = mechanicalElements.filter(
              (element) => element.id !== action.element.id,
            );
          } else {
            mechanicalElements.push(action.element);
          }
        } else {
          if (revert !== (action.type === "DeleteElement")) {
            constraintElements = constraintElements.filter(
              (element) => element.id !== action.element.id,
            );
          } else {
            constraintElements.push(action.element);
          }
        }
        break;
      /*
      case "MoveNode":
      case "MoveEdgeStart":
      case "MoveEdgeEnd":
      case "MoveEdgeBody":
        element = get_mechanical_element_from_id(
          action.id,
          mechanicalElements,
        );
        if (action.type === "MoveNode") {
          if (!("position" in element)) break;
          element.position = revert ? action.oldPosition : action.newPosition;
        } else if (action.type === "MoveEdgeStart") {
          if (!("positionStart" in element)) break;
          element.positionStart = revert
            ? action.oldPosition
            : action.newPosition;
        } else if (action.type === "MoveEdgeEnd") {
          if (!("positionEnd" in element)) break;
          element.positionEnd = revert
            ? action.oldPosition
            : action.newPosition;
        } else {
          if (!("positionStart" in element) || !("positionEnd" in element))
            break;
          const delta = element.positionEnd.sub(element.positionStart);
          element.positionStart = revert
            ? action.oldPosition.sub(action.deltaStart)
            : action.newPosition.sub(action.deltaStart);
          element.positionEnd = element.positionStart.add(delta);
        }
        break;
      case "MoveElements":
        for (const element of mechanicalElements) {
          if (action.elementIDs.includes(element.id)) {
            if ("position" in element) {
              element.position = element.position.add(
                action.delta.mul(revert ? -1 : 1),
              );
            } else {
              element.positionStart = element.positionStart.add(
                action.delta.mul(revert ? -1 : 1),
              );
              element.positionEnd = element.positionEnd.add(
                action.delta.mul(revert ? -1 : 1),
              );
            }
          }
        }
        break;
      case "ChangeGearRadius":
        element = get_mechanical_element_from_id(
          action.id,
          mechanicalElements,
        ) as GearElement;
        element.radius = revert ? action.oldRadius : action.newRadius;
        break;
      case "ChangeEdgeLength":
        const edgeElement = get_mechanical_element_from_id(
          action.id,
          mechanicalElements,
        ) as EdgeElement;
        const endExtention = edgeElement.positionEnd
          .sub(edgeElement.positionStart)
          .normalize()
          .mul(((action.newLength - action.oldLength) / 2) * (revert ? -1 : 1));
        edgeElement.positionStart = edgeElement.positionStart.sub(endExtention);
        edgeElement.positionEnd = edgeElement.positionEnd.add(endExtention);
        break;
      */
      case "MoveConstraint":
        element = get_constraint_element_from_id(action.id, constraintElements);
        element.position = revert ? action.oldPosition : action.newPosition;
        break;
      case "ChangeDimensionEdgeValue":
      case "ChangeDimensionNodeToNodeValue":
      case "ChangeDimensionEdgeToNodeValue":
      case "ChangeDimensionAngleValue":
      case "ChangeDimensionRadiusValue":
      case "ChangeGearRatioValue":
        element = get_constraint_element_from_id(action.id, constraintElements);
        if ("value" in element) {
          element.value = revert ? action.oldValue : action.newValue;
        }
        break;
      case "ChangeMass":
        element = get_mechanical_element_from_id(action.id, mechanicalElements);
        if (element.type !== "mass") {
          break;
        }
        element.mass += action.delta * (revert ? -1 : 1);
        break;
      case "ChangeStiffness":
        element = get_mechanical_element_from_id(action.id, mechanicalElements);
        if (element.type !== "spring") {
          break;
        }
        element.stiffness += action.delta * (revert ? -1 : 1);
        break;
      case "ChangeDamping":
        element = get_mechanical_element_from_id(action.id, mechanicalElements);
        if (element.type !== "damper") {
          break;
        }
        element.damping += action.delta * (revert ? -1 : 1);
        break;
      case "GroundNode":
        const node = get_mechanical_element_from_id(
          action.id,
          mechanicalElements,
        ) as NodeElement;
        node.isGrounded = action.grounded !== revert;
        break;
      case "TightenBelt":
        (
          get_mechanical_element_from_id(
            action.id,
            mechanicalElements,
          ) as BeltElement
        ).tight = action.tightened !== revert;
        break;
      case "SwitchAttachedGearDirection":
        const belt = get_mechanical_element_from_id(
          action.id,
          mechanicalElements,
        ) as BeltElement;
        belt.attachedGearsIDs[action.index].direction =
          action.direction !== revert;
        break;
      case "ConnectsFixedEdges":
        element = get_mechanical_element_from_id(
          action.elementID,
          mechanicalElements,
        );
        if (!("fixedEdgesIDs" in element)) {
          break;
        }
        if (action.disconnect !== revert) {
          element.fixedEdgesIDs.splice(action.index, 1);
        } else {
          element.fixedEdgesIDs.splice(action.index, 0, action.connectID);
        }
        break;
      case "ConnectsRotatingEdges":
        element = get_mechanical_element_from_id(
          action.elementID,
          mechanicalElements,
        );
        if (!("rotatingEdgesIDs" in element)) {
          break;
        }
        if (action.disconnect !== revert) {
          element.rotatingEdgesIDs.splice(action.index, 1);
        } else {
          element.rotatingEdgesIDs.splice(action.index, 0, action.connectID);
        }
        break;
      case "ConnectsParentBeam":
        element = get_mechanical_element_from_id(
          action.elementID,
          mechanicalElements,
        );
        if (!("parentBeamID" in element)) {
          break;
        }
        if (action.disconnect !== revert) {
          element.parentBeamID = undefined;
        } else {
          element.parentBeamID = action.connectID;
        }
        break;
      case "ConnectsFixedNodeStart":
        element = get_mechanical_element_from_id(
          action.elementID,
          mechanicalElements,
        );
        if (!("fixedNodeStartID" in element)) {
          break;
        }
        if (action.disconnect !== revert) {
          element.fixedNodeStartID = undefined;
        } else {
          element.fixedNodeStartID = action.connectID;
        }
        break;
      case "ConnectsFixedNodeEnd":
        element = get_mechanical_element_from_id(
          action.elementID,
          mechanicalElements,
        );
        if (!("fixedNodeEndID" in element)) {
          break;
        }
        if (action.disconnect !== revert) {
          element.fixedNodeEndID = undefined;
        } else {
          element.fixedNodeEndID = action.connectID;
        }
        break;
      case "ConnectsFixedNodesBody":
        element = get_mechanical_element_from_id(
          action.elementID,
          mechanicalElements,
        );
        if (!("fixedNodesBodyIDs" in element)) {
          break;
        }
        if (action.disconnect !== revert) {
          element.fixedNodesBodyIDs.splice(action.index, 1);
        } else {
          element.fixedNodesBodyIDs.splice(action.index, 0, action.connectID);
        }
        break;
      case "ConnectsMeshedGears":
        element = get_mechanical_element_from_id(
          action.elementID,
          mechanicalElements,
        );
        if (!("meshedGearsIDs" in element)) {
          break;
        }
        if (action.disconnect !== revert) {
          element.meshedGearsIDs.splice(action.index, 1);
        } else {
          element.meshedGearsIDs.splice(action.index, 0, action.connectID);
        }
        break;
      case "ConnectsAttachedGears":
        element = get_mechanical_element_from_id(
          action.elementID,
          mechanicalElements,
        );
        if (!("attachedGearsIDs" in element)) {
          break;
        }
        if (action.disconnect !== revert) {
          element.attachedGearsIDs.splice(action.index, 1);
        } else {
          element.attachedGearsIDs.splice(action.index, 0, {
            id: action.connectID,
            direction: action.direction,
          });
        }
        break;
      case "ConnectsFixedGears":
        element = get_mechanical_element_from_id(
          action.elementID,
          mechanicalElements,
        );
        if (!("fixedGearsIDs" in element)) {
          break;
        }
        if (action.disconnect !== revert) {
          element.fixedGearsIDs.splice(action.index, 1);
        } else {
          element.fixedGearsIDs.splice(action.index, 0, action.connectID);
        }
        break;
      case "ConnectsAttachedBelt":
        element = get_mechanical_element_from_id(
          action.elementID,
          mechanicalElements,
        );
        if (!("attachedBeltID" in element)) {
          break;
        }
        if (action.disconnect !== revert) {
          element.attachedBeltID = undefined;
        } else {
          element.attachedBeltID = action.connectID;
        }
        break;
      case "UpdatePositionsToValidState":
        let positions: Map<string, Point2>;
        let radii: Map<string, number>;
        if (revert) {
          positions = action.oldPositions.positions;
          radii = action.oldPositions.radii;
        } else {
          positions = action.newPositions.positions;
          radii = action.newPositions.radii;
        }

        let position: Point2 | undefined;
        let radius: number | undefined;
        mechanicalElements.forEach((element) => {
          if ("position" in element) {
            position = positions.get(`${element.id}:pos`);
            if (position !== undefined) element.position = position;
            if ("radius" in element) {
              radius = radii.get(`${element.id}:pos`);
              if (radius !== undefined) element.radius = radius;
            }
            // if ("angle" in element) angles.set(element.id, element.angle);
          } else {
            position = positions.get(`${element.id}:start`);
            if (position !== undefined) element.positionStart = position;
            position = positions.get(`${element.id}:end`);
            if (position !== undefined) element.positionEnd = position;
          }
        });
        break;
    }
  });
  return {
    history: mechanism.history,
    future: mechanism.future,
    mechanicalElements: mechanicalElements,
    constraintElements: constraintElements,
    viewport: mechanism.viewport,
    metadata: mechanism.metadata,
  };
}
