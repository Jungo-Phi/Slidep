import type { SimulationSettings } from "../../types";
import type { SimulationValueSetting } from "../../types/actions";

/** Every numeric physics setting, in the order the physics menu lists them. */
export const SIMULATION_VALUE_SETTINGS: readonly SimulationValueSetting[] = [
  "gravityStrength",
  "restitution",
  "staticFriction",
  "dynamicFriction",
];

export type SimulationValues = Pick<
  SimulationSettings,
  "gravityStrength" | "restitution" | "contactFriction"
>;

export function simulation_values(settings: SimulationSettings): SimulationValues {
  return {
    gravityStrength: settings.gravityStrength,
    restitution: settings.restitution,
    contactFriction: { ...settings.contactFriction },
  };
}

/** `values` with `setting` set to `value` — the one place a `SimulationValueSetting` is mapped onto where it is stored. */
export function with_simulation_value(
  values: SimulationValues,
  setting: SimulationValueSetting,
  value: number,
): SimulationValues {
  switch (setting) {
    case "gravityStrength":
      return { ...values, gravityStrength: value };
    case "restitution":
      return { ...values, restitution: value };
    case "staticFriction":
      return { ...values, contactFriction: { ...values.contactFriction, static: value } };
    case "dynamicFriction":
      return { ...values, contactFriction: { ...values.contactFriction, dynamic: value } };
  }
}

/** The value `setting` stands at in `settings`. */
export function simulation_value(
  settings: SimulationValues,
  setting: SimulationValueSetting,
): number {
  switch (setting) {
    case "gravityStrength":
      return settings.gravityStrength;
    case "restitution":
      return settings.restitution;
    case "staticFriction":
      return settings.contactFriction.static;
    case "dynamicFriction":
      return settings.contactFriction.dynamic;
  }
}
