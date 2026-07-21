import { Action, ActionBundleType, GeomNodes, Mechanism } from "../../types";

import { resolveGeometricConstraints } from "../solver/geometric-solver";
import {
  get_constraint_nodes as get_constraint_positions,
  get_geom_nodes,
} from "../solver/parsing";
import { clone_mechanism } from "../../utils";
import { assert_actions_preserve_validity } from "../../utils/assert-mechanism";
import { actionReducer } from "./action-reducer";
import { open_belt } from "./connect-actions";
import { belt_is_looped } from "../../utils/belt-rules";

/**
 * Appends the corrections a bundle owes to the belt-closure invariant, in both
 * directions: a belt whose loop no longer holds (a pulley lost, a terminal freed
 * from its junction) must open; a belt that a gesture just made looped (both
 * terminals brought onto one node, ≥2 pulleys) must close. Stated once here,
 * against the state the bundle leaves, rather than at every call site.
 *
 * The corrections join the bundle, so they solve, record and undo as one with it.
 */
function with_belt_closure_corrections(
  mechanism: Mechanism,
  actions: Action[],
): Action[] {
  const mayChangeLoop = actions.some(
    (a) =>
      a.type.startsWith("Connects") ||
      a.type === "DeleteElement" ||
      a.type === "CloseBelt",
  );
  if (!mayChangeLoop) return actions;

  const after = actionReducer(clone_mechanism(mechanism), actions, false);
  const corrections = after.mechanicalElements.flatMap((el): Action[] => {
    if (el.type !== "belt" || el.closed === belt_is_looped(el)) return [];
    return el.closed
      ? open_belt(el)
      : [{ type: "CloseBelt", id: el.id, closed: true }];
  });
  return corrections.length ? [...actions, ...corrections] : actions;
}

export function apply_actions(
  mechanism: Mechanism,
  actions: Action[],
  actionBundleType: ActionBundleType,
): Mechanism {
  actions = with_belt_closure_corrections(mechanism, actions);
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
        newAction.type !== "ChangeDimensionBeltValue" &&
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
        newAction.type !== "DeleteElement" &&
        newAction.type !== "CloseBelt"
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
        actions,
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
          newAction.element.type !== "dimension-belt")
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
        newAction.type !== "ChangeForce" &&
        newAction.type !== "ChangeDistributedForce" &&
        newAction.type !== "ChangeMoment"
      )
        break;
      if (mechanism.history.length === 0) break;
      lastActions = mechanism.history[mechanism.history.length - 1];
      if (lastActions.length < 1) break;
      lastAction = lastActions[lastActions.length - 1];
      if (newAction.type !== lastAction.type || newAction.id !== lastAction.id)
        break;
      switch (lastAction.type) {
        case "ChangeForce":
          if (newAction.type !== "ChangeForce") break;
          lastAction.newVector = newAction.newVector;
          break;
        case "ChangeDistributedForce":
          if (newAction.type !== "ChangeDistributedForce") break;
          lastAction.newDirection = newAction.newDirection;
          lastAction.newMagnitudeStart = newAction.newMagnitudeStart;
          lastAction.newMagnitudeEnd = newAction.newMagnitudeEnd;
          break;
        case "ChangeMoment":
          if (newAction.type !== "ChangeMoment") break;
          lastAction.newValue = newAction.newValue;
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

  const newMechanism = {
    history: newHistory,
    future: [],
    mechanicalElements: [...mechanism.mechanicalElements],
    constraintElements: [...mechanism.constraintElements],
    loads: [...mechanism.loads],
    viewport: { ...mechanism.viewport },
    metadata: { ...mechanism.metadata },
  };
  const result = actionReducer(newMechanism, newActions, false);
  assert_actions_preserve_validity(
    mechanism,
    result,
    newActions,
    actionBundleType,
  );
  return result;
}
