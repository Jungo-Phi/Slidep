import { Action } from "../../types";

/**
 * Whether `action`'s own edit nets to no change — same value in and out, or a
 * zero delta. Only the types that carry a directly comparable old/new pair or
 * delta are covered; anything without one (connections, creation, load frame,
 * motor config…) is never a no-op here, whatever it did.
 */
export function is_noop_action(action: Action): boolean {
  switch (action.type) {
    case "MoveNode":
    case "MoveEdgeStart":
    case "MoveEdgeEnd":
    case "MoveEdgeBody":
    case "MoveConstraint":
      return action.newPosition.equals(action.oldPosition);
    case "MoveElements":
      return action.delta.x === 0 && action.delta.y === 0;
    case "ChangeGearRadius":
      return action.newRadius === action.oldRadius;
    case "ChangeEdgeLength":
    case "ChangeBeltLength":
      return action.newLength === action.oldLength;
    case "ChangeEdgeAngle":
      return action.newAngle === action.oldAngle;
    case "ChangeMass":
    case "ChangeStiffness":
    case "ChangeDamping":
      return action.delta === 0;
    case "ChangeDimensionEdgeValue":
    case "ChangeDimensionNodeToNodeValue":
    case "ChangeDimensionEdgeToNodeValue":
    case "ChangeDimensionAngleValue":
    case "ChangeDimensionRadiusValue":
    case "ChangeDimensionBeltValue":
    case "ChangeGearRatioValue":
    case "ChangeMoment":
      return action.newValue === action.oldValue;
    case "ChangeForce":
      return action.newVector.equals(action.oldVector);
    case "ChangeDistributedForce":
      return (
        action.newDirection.equals(action.oldDirection) &&
        action.newMagnitudeStart === action.oldMagnitudeStart &&
        action.newMagnitudeEnd === action.oldMagnitudeEnd
      );
    case "UpdateElementName":
      return action.newName === action.oldName;
    case "SetShowOverlay":
      return action.newValue === action.oldValue;
    default:
      return false;
  }
}

/**
 * Whether `entry` — a history-entry candidate — nets to no change. Only
 * entries whose entire purpose is a single master edit qualify: a bare
 * value/position action, or one paired with the `UpdatePositionsToValidState`
 * it produced. A creation folded together with a dimension edit, a
 * connection's separation solve, or anything already sealed (ending in
 * `Blank`) is left alone — dropping those would throw away more than the
 * no-op edit itself.
 */
export function is_noop_entry(entry: Action[] | undefined): boolean {
  if (!entry) return false;
  const master =
    entry.length === 1
      ? entry[0]
      : entry.length === 2 && entry[1].type === "UpdatePositionsToValidState"
        ? entry[0]
        : undefined;
  return master !== undefined && is_noop_action(master);
}
