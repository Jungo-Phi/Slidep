import { MechanicalElement } from "../types/element";
import { MaterialDef, ProfileDef } from "../types/material";
import { gear_inertia, gear_mass } from "./gear-mass";
import { beam_linear_mass } from "./section-properties";

/**
 * The mass an element brings to the mechanism, in kg — the same three sources the solver lumps its masses from.
 * Springs, dampers, belts and the nodes carry none of their own.
 */
export function element_mass(
  element: MechanicalElement,
  materials: MaterialDef[],
  profiles: ProfileDef[],
): number {
  switch (element.type) {
    case "mass":
      return element.mass;
    case "gear":
      return gear_mass(element.surfaceMass, element.radius);
    case "beam":
      return (
        beam_linear_mass(
          element.materialID,
          element.profileID,
          materials,
          profiles,
        ) * element.positionStart.distance_to(element.positionEnd)
      );
    default:
      return 0;
  }
}

/**
 * Whether the element is one of the three kinds that carry a mass, whatever that mass currently is.
 * Tells a zero mass apart from a quantity that does not apply.
 */
export function element_carries_mass(element: MechanicalElement): boolean {
  return (
    element.type === "mass" ||
    element.type === "gear" ||
    element.type === "beam"
  );
}

/**
 * Whether the element is a body that turns as a whole, carrying a moment of inertia about its centre of mass on top of its mass.
 * A mass element is a point: its inertia is a force alone.
 */
export function element_has_rotational_inertia(element: MechanicalElement): boolean {
  return element.type === "gear" || element.type === "beam";
}

/**
 * The element's moment of inertia about its own centre of mass, in kg·m²: the same rod `mL²/12` and disc the force balance reads.
 * `undefined` wherever `element_has_rotational_inertia` says there is none.
 */
export function element_centroidal_inertia(
  element: MechanicalElement,
  materials: MaterialDef[],
  profiles: ProfileDef[],
): number | undefined {
  switch (element.type) {
    case "gear":
      return gear_inertia(element.surfaceMass, element.radius);
    case "beam": {
      const length = element.positionStart.distance_to(element.positionEnd);
      return (element_mass(element, materials, profiles) * length * length) / 12;
    }
    default:
      return undefined;
  }
}
