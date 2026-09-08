import { MechanicalElement } from "../types/element";
import { MaterialDef, ProfileDef } from "../types/material";
import { gear_mass } from "./gear-mass";
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
