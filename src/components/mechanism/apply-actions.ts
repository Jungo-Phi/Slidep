import { Action, GeomNodes, Mechanism } from "../../types";

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
import { bundle_geometry, continues_previous_gesture } from "./action-geometry";
import { is_noop_entry } from "./no-op-action";

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

/** The `masterActionType` an `UpdatePositionsToValidState` records. */
type MasterActionType = Extract<
  Action,
  { type: "UpdatePositionsToValidState" }
>["masterActionType"];

/**
 * Folds a value-only edit (mechanism 1: `MoveConstraint`, the `Change*` constant
 * edits, the load edits) into the single action of the history entry it
 * continues. Stiffness-like deltas accumulate; the rest overwrite with the
 * latest value, since they carry an absolute position or vector rather than a step.
 */
function merge_value_edit(lastAction: Action, newAction: Action): void {
  switch (lastAction.type) {
    case "ChangeStiffness":
    case "ChangeDamping":
    case "ChangeMass":
    case "ChangeSlidingFriction":
    case "ChangeRotationalFriction":
    case "ChangeSurfaceMass":
    case "ChangeLinearMass":
      if (newAction.type !== lastAction.type) break;
      lastAction.delta += newAction.delta;
      break;
    case "MoveConstraint":
      if (newAction.type !== lastAction.type) break;
      lastAction.newPosition = newAction.newPosition;
      break;
    case "UpdateElementRestLength":
      if (newAction.type !== lastAction.type) break;
      lastAction.newValue = newAction.newValue;
      break;
    case "ChangeForce":
      if (newAction.type !== lastAction.type) break;
      lastAction.newVector = newAction.newVector;
      break;
    case "ChangeDistributedForce":
      if (newAction.type !== lastAction.type) break;
      lastAction.newDirection = newAction.newDirection;
      lastAction.newMagnitudeStart = newAction.newMagnitudeStart;
      lastAction.newMagnitudeEnd = newAction.newMagnitudeEnd;
      break;
    case "ChangeMoment":
      if (newAction.type !== lastAction.type) break;
      lastAction.newValue = newAction.newValue;
      break;
  }
}

/**
 * Folds a geometry-solving edit (mechanism 2: the `MoveElement` family, the
 * `ChangeDimension` family minus the gear ratio) into the gesture's history
 * entry: the entry's `UpdatePositionsToValidState` takes the freshly solved
 * nodes, and the master edit it recorded takes the latest value — so a single
 * undo reverts the whole gesture to before it started, not to its first frame.
 */
function merge_solved_edit(
  secondToLastAction: Action,
  newAction: Action,
): void {
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
    case "ChangeEdgeAngle":
      if (secondToLastAction.type !== newAction.type) break;
      secondToLastAction.newAngle = newAction.newAngle;
      break;
    case "ChangeBeltLength":
      if (secondToLastAction.type !== newAction.type) break;
      secondToLastAction.newLength = newAction.newLength;
      break;
    case "ChangeDimensionEdgeValue":
    case "ChangeDimensionNodeToNodeValue":
    case "ChangeDimensionEdgeToNodeValue":
    case "ChangeDimensionAngleValue":
    case "ChangeDimensionRadiusValue":
    case "ChangeDimensionBeltValue":
      if (secondToLastAction.type !== newAction.type) break;
      secondToLastAction.newValue = newAction.newValue;
      break;
  }
}

/** Whether two actions share an `id` — the mechanism-1 types all carry one. */
function same_id(a: Action, b: Action): boolean {
  return "id" in a && "id" in b && a.id === b.id;
}

export function apply_actions(mechanism: Mechanism, actions: Action[]): Mechanism {
  actions = with_corrections(mechanism, actions);
  const newAction = actions[0];
  const { solve, trigger } = bundle_geometry(actions);
  let newActions = actions;
  let newNodes: GeomNodes | undefined;
  let newHistory: Action[][] | undefined = undefined;

  if (solve !== "none") {
    const oldNodes = get_geom_nodes(mechanism.mechanicalElements);
    get_constraint_positions(mechanism.constraintElements).forEach(
      (pos, key) => oldNodes.positions.set(key, pos),
    );
    const solvedOn =
      solve === "before"
        ? mechanism
        : actionReducer(clone_mechanism(mechanism), actions, false);
    newNodes = resolveGeometricConstraints(solvedOn, trigger, actions);
    newActions = [
      ...actions,
      {
        type: "UpdatePositionsToValidState",
        // `solve !== "none"` only for the categories action-geometry maps to
        // the MoveElement / ChangeDimension / Connects / CloseBelt / creation
        // triggers this field's type expects.
        masterActionType: newAction.type as MasterActionType,
        newNodes,
        oldNodes,
      },
    ];
  }

  const lastActions =
    mechanism.history.length > 0
      ? mechanism.history[mechanism.history.length - 1]
      : undefined;
  const lastAction = lastActions?.[lastActions.length - 1];
  // Whether the entry this call is NOT going to merge into (different type,
  // different id, or nothing to merge with) turned out, now that nothing else
  // will ever touch it, to have netted to no change — a drag or value edit
  // that ended up back where it started.
  const staleNoop = is_noop_entry(lastActions);

  // The value editor's first commit right after placing the element is part
  // of the creation gesture, not a follow-up edit: it folds into the same
  // history entry so a single undo removes the whole dimension. The creation
  // bundle ends either on the `CreateElement` itself (a plain dimension,
  // whose auto-measured value needs no geometry solve) or on the
  // `UpdatePositionsToValidState` a constraining type like a gear ratio
  // appends after it.
  if (
    lastActions &&
    lastAction &&
    (newAction.type === "ChangeDimensionEdgeValue" ||
      newAction.type === "ChangeDimensionNodeToNodeValue" ||
      newAction.type === "ChangeDimensionEdgeToNodeValue" ||
      newAction.type === "ChangeDimensionAngleValue" ||
      newAction.type === "ChangeDimensionRadiusValue" ||
      newAction.type === "ChangeDimensionBeltValue" ||
      newAction.type === "ChangeGearRatioValue") &&
    (lastAction.type === "CreateElement" ||
      (lastAction.type === "UpdatePositionsToValidState" &&
        lastAction.masterActionType === "CreateElement")) &&
    lastActions.some(
      (a) => a.type === "CreateElement" && a.element.id === newAction.id,
    )
  ) {
    newHistory = [
      ...mechanism.history.slice(0, -1),
      [...lastActions, ...newActions],
    ];
  } else if (
    lastActions &&
    lastAction &&
    continues_previous_gesture(actions) &&
    newAction.type === lastAction.type &&
    same_id(newAction, lastAction)
  ) {
    // Mechanism 1: the previous entry is the single value-only action itself.
    // Cloned rather than mutated in place — `lastAction` is reachable from the
    // mechanism React just handed us, and mutating it would corrupt whatever
    // else still holds that reference (StrictMode replays this same updater a
    // second time against the identical, unmutated `mechanism`).
    const mergedAction = { ...lastAction };
    merge_value_edit(mergedAction, newAction);
    newHistory = [...mechanism.history.slice(0, -1), [mergedAction]];
  } else if (
    lastActions &&
    lastActions.length >= 2 &&
    lastAction &&
    continues_previous_gesture(actions) &&
    lastAction.type === "UpdatePositionsToValidState" &&
    newAction.type === lastAction.masterActionType &&
    newNodes
  ) {
    // Mechanism 2: the previous entry ends on the solve this gesture repeats.
    // Same cloning concern as mechanism 1, for both halves of the pair.
    const mergedUpdate = { ...lastAction, newNodes };
    const mergedMaster = { ...lastActions[lastActions.length - 2] };
    merge_solved_edit(mergedMaster, newAction);
    newHistory = [
      ...mechanism.history.slice(0, -1),
      [...lastActions.slice(0, -2), mergedMaster, mergedUpdate],
    ];
  } else if (newAction.type === "Blank" && lastActions) {
    newHistory = staleNoop
      ? mechanism.history.slice(0, -1)
      : [...mechanism.history.slice(0, -1), [...lastActions, newAction]];
  }

  if (!newHistory) {
    const base = staleNoop ? mechanism.history.slice(0, -1) : mechanism.history;
    newHistory = is_noop_entry(newActions) ? base : [...base, newActions];
  }

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
  assert_actions_preserve_validity(mechanism, result, newActions, newAction.type);
  return result;
}
