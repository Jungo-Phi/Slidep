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
import {
  created_elements,
  edge_newness,
  superposition_fusions,
} from "./superposition";
import { belt_is_looped } from "../../utils/belt-rules";

/** Whether a bundle can have changed which nodes an edge holds. */
function may_change_terminals(actions: Action[]): boolean {
  return actions.some(
    (a) =>
      a.type.startsWith("Connects") ||
      a.type === "CreateElement" ||
      a.type === "DeleteElement",
  );
}

/**
 * Appends the fusions a bundle owes to the superposition invariant: two edges
 * left holding the same pair of nodes collapse into one, a spring and a damper
 * apart.
 *
 * Stated here rather than at each call site because superposition is not the
 * privilege of the drawing tools — fusing two nodes brings two edges onto the
 * same pair without either being drawn.
 */
function with_superposition_fusions(
  mechanism: Mechanism,
  actions: Action[],
): Action[] {
  if (!may_change_terminals(actions)) return actions;

  const after = actionReducer(clone_mechanism(mechanism), actions, false);
  const fusions = superposition_fusions(
    after.mechanicalElements,
    after.constraintElements,
    after.loads,
    edge_newness(actions),
    created_elements(actions),
  );
  return fusions.length ? [...actions, ...fusions] : actions;
}

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

/**
 * Appends the corrections a bundle owes to the motor invariant: a motor drives
 * from the ground or from a beam, never from neither. One left with neither is
 * anchored, keeping the mechanism it drives coherent.
 *
 * The whole invariant rather than the dangling-reference case alone: a motor
 * also ends up driving nothing when a fusion carries it onto a node that is not
 * anchored, and there is no dead reference to notice that by.
 *
 * Stated against the state the bundle leaves rather than inside the deletion,
 * because a beam vanishes by more routes than the eraser — an edge fusion
 * absorbs one too. `motor.parentBeamID` is nested inside the config, so no
 * connection container carries it and no disconnect pass ever sees it.
 */
function with_motor_anchoring(
  mechanism: Mechanism,
  actions: Action[],
): Action[] {
  // Anything that reshapes the mechanism can leave a motor driving nothing. A
  // bundle that merely toggles an anchor is left alone: undoing that on the spot
  // would make the user's own gesture look like it did nothing.
  const mayStrand = actions.some(
    (a) =>
      a.type === "DeleteElement" ||
      a.type === "CreateElement" ||
      a.type.startsWith("Connects"),
  );
  if (!mayStrand) return actions;

  const after = actionReducer(clone_mechanism(mechanism), actions, false);
  const live = new Set(after.mechanicalElements.map((el) => el.id));
  const corrections = after.mechanicalElements.flatMap((el): Action[] => {
    if (el.type !== "pivot" || !el.motor) return [];
    const { parentBeamID } = el.motor;
    // Driving from a live beam, or from the ground: both are whole answers.
    if (parentBeamID !== undefined && live.has(parentBeamID)) return [];
    if (parentBeamID === undefined && el.isGrounded) return [];

    const anchored: Action[] = [];
    // A reference left over from the beam it drove against would contradict the
    // anchor that replaces it.
    if (parentBeamID !== undefined)
      anchored.push({
        type: "SetMotorConfig",
        id: el.id,
        newConfig: { ...el.motor, parentBeamID: undefined },
        oldConfig: el.motor,
      });
    if (!el.isGrounded)
      anchored.push({ type: "GroundNode", id: el.id, grounded: true });
    return anchored;
  });
  return corrections.length ? [...actions, ...corrections] : actions;
}

/**
 * The corrections a bundle owes the mechanism's invariants, appended to it.
 *
 * Each pass judges the state the bundle leaves rather than the gesture that
 * produced it, so they hold whatever path the actions came from — fusions first,
 * the closure pass then judging what they leave.
 *
 * Anyone applying a bundle outside `apply_actions` must go through here: without
 * it they get a mechanism the application never shows.
 */
export function with_corrections(
  mechanism: Mechanism,
  actions: Action[],
): Action[] {
  return with_belt_closure_corrections(
    mechanism,
    with_motor_anchoring(mechanism, with_superposition_fusions(mechanism, actions)),
  );
}

export function apply_actions(
  mechanism: Mechanism,
  actions: Action[],
  actionBundleType: ActionBundleType,
): Mechanism {
  actions = with_corrections(mechanism, actions);
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
