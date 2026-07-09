import { Action, ActionBundleType, GeomNodes, Mechanism } from "../../types";

import { resolveGeometricConstraints } from "../solver/geometric-solver";
import {
  get_constraint_nodes as get_constraint_positions,
  get_geom_nodes,
} from "../solver/parsing";
import { clone_mechanism } from "../../utils";
import { actionReducer } from "./action-reducer";

export function apply_actions(
  mechanism: Mechanism,
  actions: Action[],
  actionBundleType: ActionBundleType,
): Mechanism {
  const newAction = actions[0];
  let newActions = actions;
  let lastActions: Action[];
  let lastAction: Action;
  let secondToLastAction: Action;
  let oldNodes: GeomNodes;
  let newNodes: GeomNodes;

  let newHistory: Action[][] | undefined = undefined;

  switch (actionBundleType) {
    case "MoveConstraint":
    case "ChangeConstant":
      if (
        newAction.type !== "MoveConstraint" &&
        newAction.type !== "ChangeMass" &&
        newAction.type !== "ChangeStiffness" &&
        newAction.type !== "ChangeDamping"
      )
        break;
      if (mechanism.history.length === 0) break;
      lastActions = mechanism.history[mechanism.history.length - 1];
      if (lastActions.length < 1) break;
      lastAction = lastActions[lastActions.length - 1];
      if (newAction.type !== lastAction.type) break;
      if (newAction.id !== lastAction.id) break;
      switch (lastAction.type) {
        case "ChangeStiffness":
        case "ChangeDamping":
        case "ChangeMass":
          if (newAction.type !== lastAction.type) break;
          lastAction.delta += newAction.delta;
          break;
        case "MoveConstraint":
          if (newAction.type !== lastAction.type) break;
          lastAction.newPosition = newAction.newPosition;
          break;
      }
      newHistory = [...mechanism.history];
      break;
    case "MoveElement":
      if (
        newAction.type !== "MoveNode" &&
        newAction.type !== "MoveEdgeStart" &&
        newAction.type !== "MoveEdgeEnd" &&
        newAction.type !== "MoveEdgeBody" &&
        newAction.type !== "MoveElements" &&
        newAction.type !== "ChangeGearRadius" &&
        newAction.type !== "ChangeEdgeLength" &&
        newAction.type !== "ChangeBeltLength"
      )
        break;

      oldNodes = get_geom_nodes(mechanism.mechanicalElements);
      get_constraint_positions(mechanism.constraintElements).forEach(
        (pos, key) => oldNodes.positions.set(key, pos),
      );
      newNodes = resolveGeometricConstraints(
        mechanism,
        actionBundleType,
        newAction,
      );
      newActions = [
        ...actions,
        {
          type: "UpdatePositionsToValidState",
          masterActionType: newAction.type,
          newNodes,
          oldNodes,
        },
      ];
      if (mechanism.history.length === 0) break;
      lastActions = mechanism.history[mechanism.history.length - 1];
      if (lastActions.length < 2) break;
      lastAction = lastActions[lastActions.length - 1];
      secondToLastAction = lastActions[lastActions.length - 2];
      if (
        lastAction.type !== "UpdatePositionsToValidState" ||
        newAction.type !== lastAction.masterActionType
      )
        break;
      newHistory = [...mechanism.history];
      lastAction.newNodes = newNodes;
      if (secondToLastAction.type !== newAction.type) break;
      switch (secondToLastAction.type) {
        case "MoveNode":
        case "MoveEdgeStart":
        case "MoveEdgeEnd":
        case "MoveEdgeBody":
          if (secondToLastAction.type !== newAction.type) break;
          secondToLastAction.newPosition = newAction.newPosition;
          break;
        case "MoveElements":
          if (secondToLastAction.type !== newAction.type) break;
          secondToLastAction.delta = secondToLastAction.delta.add(
            newAction.delta,
          );
          break;
        case "ChangeGearRadius":
          if (secondToLastAction.type !== newAction.type) break;
          secondToLastAction.newRadius = newAction.newRadius;
          break;
        case "ChangeEdgeLength":
          if (secondToLastAction.type !== newAction.type) break;
          secondToLastAction.newLength = newAction.newLength;
          break;
        case "ChangeBeltLength":
          if (secondToLastAction.type !== newAction.type) break;
          secondToLastAction.newLength = newAction.newLength;
          break;
      }
      break;
    case "ChangeDimension":
      if (
        newAction.type !== "ChangeDimensionEdgeValue" &&
        newAction.type !== "ChangeDimensionNodeToNodeValue" &&
        newAction.type !== "ChangeDimensionEdgeToNodeValue" &&
        newAction.type !== "ChangeDimensionAngleValue" &&
        newAction.type !== "ChangeDimensionRadiusValue" &&
        newAction.type !== "ChangeDimensionBeltLengthValue" &&
        newAction.type !== "ChangeGearRatioValue"
      )
        break;

      oldNodes = get_geom_nodes(mechanism.mechanicalElements);
      get_constraint_positions(mechanism.constraintElements).forEach(
        (pos, key) => oldNodes.positions.set(key, pos),
      );
      newNodes = resolveGeometricConstraints(
        actionReducer(clone_mechanism(mechanism), actions, false),
        actionBundleType,
        newAction,
      );
      newActions = [
        ...actions,
        {
          type: "UpdatePositionsToValidState",
          masterActionType: newAction.type,
          newNodes,
          oldNodes,
        },
      ];
      if (
        mechanism.history.length === 0 ||
        newAction.type === "ChangeGearRatioValue"
      )
        break;
      lastActions = mechanism.history[mechanism.history.length - 1];
      if (lastActions.length < 2) break;
      lastAction = lastActions[lastActions.length - 1];
      secondToLastAction = lastActions[lastActions.length - 2];
      if (
        lastAction.type !== "UpdatePositionsToValidState" ||
        newAction.type !== lastAction.masterActionType
      )
        break;
      newHistory = [...mechanism.history];
      lastAction.newNodes = newNodes;
      if (secondToLastAction.type !== newAction.type) break;
      secondToLastAction.newValue = newAction.newValue;
      break;
    case "Connects":
      if (
        newAction.type !== "ConnectsParentBeam" &&
        newAction.type !== "ConnectsFixedNodeStart" &&
        newAction.type !== "ConnectsFixedNodeEnd" &&
        newAction.type !== "ConnectsAttachedBelt" &&
        newAction.type !== "ConnectsFixedEdges" &&
        newAction.type !== "ConnectsRotatingEdges" &&
        newAction.type !== "ConnectsFixedNodesBody" &&
        newAction.type !== "ConnectsMeshedGears" &&
        newAction.type !== "ConnectsAttachedGears" &&
        newAction.type !== "ConnectsFixedGears" &&
        newAction.type !== "CreateElement" &&
        newAction.type !== "DeleteElement"
      )
        break;

      oldNodes = get_geom_nodes(mechanism.mechanicalElements);
      get_constraint_positions(mechanism.constraintElements).forEach(
        (pos, key) => oldNodes.positions.set(key, pos),
      );
      newNodes = resolveGeometricConstraints(
        actionReducer(clone_mechanism(mechanism), actions, false),
        actionBundleType,
        newAction,
      );
      newActions = [
        ...actions,
        {
          type: "UpdatePositionsToValidState",
          masterActionType: newAction.type,
          newNodes,
          oldNodes,
        },
      ];
      break;
    case "CreateConstraint":
      if (
        newAction.type !== "CreateElement" ||
        (newAction.element.type !== "horizontal-align-edge" &&
          newAction.element.type !== "horizontal-align-nodes" &&
          newAction.element.type !== "vertical-align-edge" &&
          newAction.element.type !== "vertical-align-nodes" &&
          newAction.element.type !== "normal" &&
          newAction.element.type !== "parallel" &&
          newAction.element.type !== "equal" &&
          newAction.element.type !== "gear-ratio" &&
          newAction.element.type !== "dimension-belt-length")
      )
        break;
      oldNodes = get_geom_nodes(mechanism.mechanicalElements);
      get_constraint_positions(mechanism.constraintElements).forEach(
        (pos, key) => oldNodes.positions.set(key, pos),
      );

      newNodes = resolveGeometricConstraints(
        actionReducer(clone_mechanism(mechanism), actions, false),
        actionBundleType,
        newAction,
      );
      newActions = [
        ...actions,
        {
          type: "UpdatePositionsToValidState",
          masterActionType: newAction.type,
          newNodes,
          oldNodes,
        },
      ];
      break;
    case "MoveLoad":
      if (
        newAction.type !== "MoveForceVector" &&
        newAction.type !== "MoveDistributedForceVectors"
      )
        break;
      if (mechanism.history.length === 0) break;
      lastActions = mechanism.history[mechanism.history.length - 1];
      if (lastActions.length < 1) break;
      lastAction = lastActions[lastActions.length - 1];
      if (newAction.type !== lastAction.type || newAction.id !== lastAction.id)
        break;
      switch (lastAction.type) {
        case "MoveForceVector":
          if (newAction.type !== "MoveForceVector") break;
          lastAction.newVector = newAction.newVector;
          break;
        case "MoveDistributedForceVectors":
          if (newAction.type !== "MoveDistributedForceVectors") break;
          lastAction.newVectorStart = newAction.newVectorStart;
          lastAction.newVectorEnd = newAction.newVectorEnd;
          break;
      }
      newHistory = [...mechanism.history];
      break;
    case "Other":
      if (newAction.type == "Blank") {
        if (mechanism.history.length === 0) break;
        mechanism.history[mechanism.history.length - 1].push(newAction);
        newHistory = [...mechanism.history];
      }
  }
  if (!newHistory) newHistory = [...mechanism.history, newActions];

  let newMechanism = {
    history: newHistory,
    future: [],
    mechanicalElements: [...mechanism.mechanicalElements],
    constraintElements: [...mechanism.constraintElements],
    loads: [...mechanism.loads],
    viewport: { ...mechanism.viewport },
    metadata: { ...mechanism.metadata },
  };
  return actionReducer(newMechanism, newActions, false);
}
