import {
  Action,
  ChangeDimensionActionType,
  DamperElement,
  EdgeElement,
  GearElement,
  MassElement,
  Mechanism,
  PivotElement,
  Point2,
  SpringElement,
  UnionElement,
} from "../../types";
import { NodeElement } from "../../types/element";
import { measure_belt_length } from "../../utils";
import {
  ANGLE,
  FORCE,
  LENGTH,
  LOAD_INTENSITY,
  MOMENT,
  QuantityKind,
} from "../../utils/quantity-format";

// The writes behind the values an element's page and the phone's quick-access bar both edit, so the two never set the same value two ways.

export const change_mass = (element: MassElement, mass: number): Action => ({
  type: "ChangeMass",
  id: element.id,
  delta: mass - element.mass,
});

export const change_damping = (
  element: DamperElement,
  damping: number,
): Action => ({
  type: "ChangeDamping",
  id: element.id,
  delta: damping - element.damping,
});

export const change_stiffness = (
  element: SpringElement,
  stiffness: number,
): Action => ({
  type: "ChangeStiffness",
  id: element.id,
  delta: stiffness - element.stiffness,
});

/**
 * The motor's speed set to `speed`.
 * The config is replaced whole, so it is built from `shown` — the one on screen — rather than the stored one: a later edit of the other field must not ride along.
 */
export const change_motor_speed = (
  element: PivotElement,
  shown: NonNullable<PivotElement["motor"]>,
  speed: number,
): Action => ({
  type: "SetMotorConfig",
  id: element.id,
  newConfig: { ...shown, speed },
  oldConfig: element.motor,
});

export const change_gear_radius = (
  element: GearElement,
  radius: number,
): Action => ({
  type: "ChangeGearRadius",
  id: element.id,
  newRadius: radius,
  oldRadius: element.radius,
  target: new Point2(element.position.x + radius, element.position.y),
  committed: true,
});

export const toggle_ground = (element: NodeElement): Action => ({
  type: "GroundNode",
  id: element.id,
  grounded: !element.isGrounded,
});

/** An edge's length set to `length`: through the dimension holding it if there is one, so the dimension says the new value. */
export function change_edge_length(
  element: EdgeElement,
  length: number,
  mechanism: Mechanism,
): Action {
  if (element.type === "belt") {
    const beltDim = mechanism.constraintElements.find(
      (c) => c.type === "dimension-belt" && c.beltID === element.id,
    );
    if (beltDim && beltDim.type === "dimension-belt")
      return {
        type: "ChangeDimensionBeltValue",
        id: beltDim.id,
        newValue: length,
        oldValue: beltDim.value,
      };
    return {
      type: "ChangeBeltLength",
      id: element.id,
      newLength: length,
      oldLength: measure_belt_length(element, mechanism.mechanicalElements),
    };
  }
  const linkedDim = mechanism.constraintElements.find(
    (c) => c.type === "dimension-edge" && c.edgeID === element.id,
  );
  if (linkedDim && linkedDim.type === "dimension-edge")
    return {
      type: "ChangeDimensionEdgeValue",
      id: linkedDim.id,
      newValue: length,
      oldValue: linkedDim.value,
    };
  return {
    type: "ChangeEdgeLength",
    id: element.id,
    newLength: length,
    oldLength: element.positionStart.distance_to(element.positionEnd),
  };
}

/** What a value editor formats and parses an element's value as — absent for `gear-ratio`, a dimensionless ratio read as such. */
export const VALUE_KIND: Partial<Record<UnionElement["type"], QuantityKind>> = {
  "dimension-edge": LENGTH,
  "dimension-node-to-node": LENGTH,
  "dimension-edge-to-node": LENGTH,
  "dimension-radius": LENGTH,
  "dimension-belt": LENGTH,
  "dimension-angle": ANGLE,
  force: FORCE,
  moment: MOMENT,
  "distributed-force": LOAD_INTENSITY,
};

const CONSTRAINT_VALUE_ACTION: Partial<
  Record<UnionElement["type"], ChangeDimensionActionType>
> = {
  "dimension-edge": "ChangeDimensionEdgeValue",
  "dimension-node-to-node": "ChangeDimensionNodeToNodeValue",
  "dimension-edge-to-node": "ChangeDimensionEdgeToNodeValue",
  "dimension-angle": "ChangeDimensionAngleValue",
  "dimension-radius": "ChangeDimensionRadiusValue",
  "dimension-belt": "ChangeDimensionBeltValue",
  "gear-ratio": "ChangeGearRatioValue",
};

/** A dimension's or a gear ratio's value set to `newValue`; `undefined` for any other element, a moment's value included. */
export function change_constraint_value(
  element: UnionElement,
  newValue: number,
): Action | undefined {
  const type = CONSTRAINT_VALUE_ACTION[element.type];
  if (!type || !("value" in element)) return undefined;
  return { type, id: element.id, newValue, oldValue: element.value };
}
