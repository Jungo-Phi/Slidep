import { Action, ActionBundleType, Mechanism, Nodes } from "../../types";

import { resolveGeometricConstraints } from "../../components/solver/geometric-solver";
import {
  get_constraint_nodes as get_constraint_positions,
  get_nodes,
} from "../../components/solver/parsing";
import { cloneMechanism } from "../../utils/serialization";
import { actionReducer } from "./action-reducer";

export function update_mechanism(
  mechanism: Mechanism,
  actions: Action[],
  actionBundleType: ActionBundleType,
): Mechanism {
  const newAction = actions[0];
  let newActions = actions;
  let lastActions: Action[];
  let lastAction: Action;
  let secondToLastAction: Action;
  let oldNodes: Nodes;
  let newNodes: Nodes;

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
        throw console.error("impossible");
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
          if (newAction.type === lastAction.type) {
            lastAction.delta += newAction.delta;
          }
          break;
        case "MoveConstraint":
          if (newAction.type === lastAction.type) {
            lastAction.newPosition = newAction.newPosition;
          }
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
        newAction.type !== "ChangeEdgeLength"
      )
        throw console.error("impossible");

      oldNodes = get_nodes(mechanism.mechanicalElements);
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
      if (secondToLastAction.type !== newAction.type)
        throw console.error("impossible");
      switch (secondToLastAction.type) {
        case "MoveNode":
        case "MoveEdgeStart":
        case "MoveEdgeEnd":
        case "MoveEdgeBody":
          if (secondToLastAction.type !== newAction.type)
            throw console.error("impossible");
          secondToLastAction.newPosition = newAction.newPosition;
          break;
        case "MoveElements":
          if (secondToLastAction.type !== newAction.type)
            throw console.error("impossible");
          secondToLastAction.delta = secondToLastAction.delta.add(
            newAction.delta,
          );
          break;
        case "ChangeGearRadius":
          if (secondToLastAction.type !== newAction.type)
            throw console.error("impossible");
          secondToLastAction.newRadius = newAction.newRadius;
          break;
        case "ChangeEdgeLength":
          if (secondToLastAction.type !== newAction.type)
            throw console.error("impossible");
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
        newAction.type !== "ChangeGearRatioValue"
      )
        throw console.error("impossible");

      oldNodes = get_nodes(mechanism.mechanicalElements);
      get_constraint_positions(mechanism.constraintElements).forEach(
        (pos, key) => oldNodes.positions.set(key, pos),
      );
      newNodes = resolveGeometricConstraints(
        actionReducer(cloneMechanism(mechanism), actions, false),
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
      if (secondToLastAction.type !== newAction.type)
        throw console.error("impossible");
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
        throw console.error("impossible");

      oldNodes = get_nodes(mechanism.mechanicalElements);
      get_constraint_positions(mechanism.constraintElements).forEach(
        (pos, key) => oldNodes.positions.set(key, pos),
      );
      newNodes = resolveGeometricConstraints(
        actionReducer(cloneMechanism(mechanism), actions, false),
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
          newAction.element.type !== "gear-ratio")
      )
        break;
      oldNodes = get_nodes(mechanism.mechanicalElements);
      get_constraint_positions(mechanism.constraintElements).forEach(
        (pos, key) => oldNodes.positions.set(key, pos),
      );

      newNodes = resolveGeometricConstraints(
        actionReducer(cloneMechanism(mechanism), actions, false),
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
    viewport: { ...mechanism.viewport },
    metadata: { ...mechanism.metadata },
  };
  return actionReducer(newMechanism, newActions, false);
}
