import {
  Action,
  LoadElement,
  Mechanism,
  MechanicalElement,
  NodeElement,
  BeltElement,
  PivotElement,
  UnionElement,
  Point2,
  ForceElement,
  DistributedForceElement,
  MomentElement,
} from "../../types";
import {
  get_constraint_element_from_id,
  get_element_from_id,
  get_load_element_from_id,
  get_mechanical_element_from_id,
} from "./connect-actions";

/**
 * Shallow-clone a mechanical element with all its mutable array fields deep-copied.
 *
 * This prevents React StrictMode's double-invocation of state updaters from causing duplicate entries when actionReducer splices into shared array references.
 */
function clone_mechanical_element(el: MechanicalElement): MechanicalElement {
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

export function actionReducer(
  mechanism: Mechanism,
  actions: Action[],
  revert: boolean,
): Mechanism {
  let mechanicalElements = mechanism.mechanicalElements.map(
    clone_mechanical_element,
  );
  let constraintElements = mechanism.constraintElements.map((ce) => ({
    ...ce,
  }));
  let loadElements = mechanism.loads.map((l) => ({ ...l })); // TODO : clone_load ?
  let viewport = { ...mechanism.viewport };
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
            mechanicalElements.push(
              clone_mechanical_element(action.element as MechanicalElement),
            );
          }
        } else if (
          action.element.type === "force" ||
          action.element.type === "moment" ||
          action.element.type === "distributed-force"
        ) {
          if (revert !== (action.type === "DeleteElement")) {
            loadElements = loadElements.filter(
              (l) => l.id !== action.element.id,
            );
          } else {
            loadElements.push(action.element as LoadElement);
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
      case "UpdateElementName":
        element = get_element_from_id(
          action.id,
          mechanicalElements,
          constraintElements,
          loadElements,
        );
        element.name = revert ? action.oldName : action.newName;
        break;
      case "MoveConstraint":
        element = get_constraint_element_from_id(action.id, constraintElements);
        element.position = revert ? action.oldPosition : action.newPosition;
        break;
      case "ChangeDimensionEdgeValue":
      case "ChangeDimensionNodeToNodeValue":
      case "ChangeDimensionEdgeToNodeValue":
      case "ChangeDimensionAngleValue":
      case "ChangeDimensionRadiusValue":
      case "ChangeDimensionBeltLengthValue":
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
      case "ConnectsParentAxle":
        element = get_mechanical_element_from_id(
          action.elementID,
          mechanicalElements,
        );
        if (!("parentAxleID" in element)) {
          break;
        }
        if (action.disconnect !== revert) {
          (element as { parentAxleID: string }).parentAxleID = "----";
        } else {
          (element as { parentAxleID: string }).parentAxleID = action.connectID;
        }
        break;
      case "MoveForceVector": {
        const force = get_load_element_from_id(
          action.id,
          loadElements,
        ) as ForceElement;
        force.vector = revert ? action.oldVector : action.newVector;
        break;
      }
      case "MoveDistributedForceVectors": {
        const distForce = get_load_element_from_id(
          action.id,
          loadElements,
        ) as DistributedForceElement;
        distForce.vectorStart = revert
          ? action.oldVectorStart
          : action.newVectorStart;
        distForce.vectorEnd = revert
          ? action.oldVectorEnd
          : action.newVectorEnd;
        break;
      }
      case "ChangeMomentValue": {
        const moment = get_load_element_from_id(
          action.id,
          loadElements,
        ) as MomentElement;
        moment.value = revert ? action.oldValue : action.newValue;
        break;
      }
      case "FlipMomentDirection": {
        const moment = get_load_element_from_id(
          action.id,
          loadElements,
        ) as MomentElement;
        moment.clockwise = !moment.clockwise;
        break;
      }
      case "SetProbes": {
        const element = get_mechanical_element_from_id(
          action.elementID,
          mechanicalElements,
        );
        element.probes = revert ? action.oldProbes : action.newProbes;
        break;
      }
      case "SetShowTrajectory": {
        const element = get_mechanical_element_from_id(
          action.elementID,
          mechanicalElements,
        ) as NodeElement;
        element.showTrajectory = revert ? action.oldValue : action.newValue;
        break;
      }
      case "SetMotorConfig": {
        const pivot = get_mechanical_element_from_id(
          action.id,
          mechanicalElements,
        ) as PivotElement;
        if (pivot.type === "pivot") {
          pivot.motor = revert ? action.oldConfig : action.newConfig;
        }
        break;
      }
      case "UpdatePositionsToValidState":
        let positions: Map<string, Point2>;
        let radii: Map<string, number>;
        if (revert) {
          positions = action.oldNodes.positions;
          radii = action.oldNodes.radii;
        } else {
          positions = action.newNodes.positions;
          radii = action.newNodes.radii;
        }

        let position: Point2 | undefined;
        let radius: number | undefined;
        mechanicalElements.forEach((element) => {
          if ("position" in element) {
            position = positions.get(element.id);
            if (position) element.position = position;
            if ("radius" in element) {
              radius = radii.get(element.id);
              if (radius) element.radius = radius;
            }
          } else {
            position = positions.get(`${element.id}:start`);
            if (position) element.positionStart = position;
            position = positions.get(`${element.id}:end`);
            if (position) element.positionEnd = position;
          }
        });
        constraintElements.forEach((element) => {
          position = positions.get(element.id);
          if (position) element.position = position;
        });
        break;
    }
  });
  return {
    metadata: mechanism.metadata,
    viewport: viewport,
    mechanicalElements: mechanicalElements,
    constraintElements: constraintElements,
    loads: loadElements,
    history: mechanism.history,
    future: mechanism.future,
  };
}
