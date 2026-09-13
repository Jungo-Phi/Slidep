import { Action, MechanicalElement } from "../../types";
import { StringKey } from "../../i18n";
import {
  ANGULAR_DAMPING,
  ANGULAR_VELOCITY,
  DAMPING,
  INERTIA,
  LENGTH,
  MASS,
  MOMENT,
  QuantityKind,
  STIFFNESS,
  SURFACE_MASS,
} from "../../utils/quantity-format";
import { gear_inertia, surface_mass_for_inertia } from "../../utils/gear-mass";

/**
 * One physical value of an element that a running simulation absorbs: it takes effect at the current time, the past stays valid and the motion is recomputed from there (see `PARAMETER_ACTIONS`).
 * Everything structural is absent by construction, which is what makes this list safe to render with no `StructureOnly` guard around it.
 */
export interface LiveParameter {
  /** The symbol the field is known by, its label on screen. */
  label: string;
  titleKey: StringKey;
  kind: QuantityKind;
  value: number;
  /** A value whose sign is part of the reading — a motor's own sense of rotation. */
  signed?: boolean;
  change: (value: number) => Action[];
}

/**
 * The live values of `element`, in the order they are shown.
 * `shown` is the same element at the instant on screen: the values are read off it, while every change is built against `element`, the stored one (see `rebased_bundle`).
 * A beam's material and profile are live too, but they are a choice among a catalogue rather than a number, so they are rendered on their own (see `MaterialProfileSection`).
 */
export function live_parameters(
  element: MechanicalElement,
  shown: MechanicalElement = element,
): LiveParameter[] {
  const params: LiveParameter[] = [];
  if (element.type === "mass" && shown.type === "mass")
    params.push({
      label: "m",
      titleKey: "mass",
      kind: MASS,
      value: shown.mass,
      change: (mass) => [
        { type: "ChangeMass", id: element.id, delta: mass - element.mass },
      ],
    });
  if (element.type === "gear" && shown.type === "gear") {
    params.push({
      label: "mₛ",
      titleKey: "surface_mass",
      kind: SURFACE_MASS,
      value: shown.surfaceMass,
      change: (surfaceMass) => [
        {
          type: "ChangeSurfaceMass",
          id: element.id,
          delta: surfaceMass - element.surfaceMass,
        },
      ],
    });
    params.push({
      label: "J",
      titleKey: "inertia",
      kind: INERTIA,
      value: gear_inertia(shown.surfaceMass, shown.radius),
      // The gear stores a surface mass; its inertia is the same value read through its radius, so editing either writes the one field.
      change: (inertia) => [
        {
          type: "ChangeSurfaceMass",
          id: element.id,
          delta:
            surface_mass_for_inertia(inertia, element.radius) -
            element.surfaceMass,
        },
      ],
    });
  }
  if (element.type === "spring" && shown.type === "spring") {
    params.push({
      label: "k",
      titleKey: "stiffness",
      kind: STIFFNESS,
      value: shown.stiffness,
      change: (stiffness) => [
        {
          type: "ChangeStiffness",
          id: element.id,
          delta: stiffness - element.stiffness,
        },
      ],
    });
    params.push({
      label: "L₀",
      titleKey: "rest_length",
      kind: LENGTH,
      value:
        shown.restLength ?? shown.positionStart.distance_to(shown.positionEnd),
      change: (restLength) => [
        {
          type: "UpdateElementRestLength",
          id: element.id,
          newValue: restLength,
          oldValue: element.restLength,
        },
      ],
    });
  }
  if (element.type === "damper" && shown.type === "damper")
    params.push({
      label: "b",
      titleKey: "damping",
      kind: DAMPING,
      value: shown.damping,
      change: (damping) => [
        {
          type: "ChangeDamping",
          id: element.id,
          delta: damping - element.damping,
        },
      ],
    });
  if ("rotationalFriction" in element && "rotationalFriction" in shown)
    params.push({
      label: "bᵣ",
      titleKey: "rotational_friction",
      kind: ANGULAR_DAMPING,
      value: shown.rotationalFriction,
      change: (friction) => [
        {
          type: "ChangeRotationalFriction",
          id: element.id,
          delta: friction - element.rotationalFriction,
        },
      ],
    });
  if ("slidingFriction" in element && "slidingFriction" in shown)
    params.push({
      label: "bₛ",
      titleKey: "sliding_friction",
      kind: DAMPING,
      value: shown.slidingFriction,
      change: (friction) => [
        {
          type: "ChangeSlidingFriction",
          id: element.id,
          delta: friction - element.slidingFriction,
        },
      ],
    });
  if (element.type === "pivot" && shown.type === "pivot" && shown.motor) {
    // A motor config is replaced whole, so the new one starts from what is shown: a later edit of its other field must not ride along.
    const motor = shown.motor;
    params.push({
      label: "C",
      titleKey: "motor_torque_label",
      kind: MOMENT,
      value: motor.torque,
      change: (torque) => [
        {
          type: "SetMotorConfig",
          id: element.id,
          newConfig: { ...motor, torque },
          oldConfig: element.motor,
        },
      ],
    });
    params.push({
      label: "ω",
      titleKey: "motor_speed_label",
      kind: ANGULAR_VELOCITY(),
      value: motor.speed,
      signed: true,
      change: (speed) => [
        {
          type: "SetMotorConfig",
          id: element.id,
          newConfig: { ...motor, speed },
          oldConfig: element.motor,
        },
      ],
    });
  }
  return params;
}
