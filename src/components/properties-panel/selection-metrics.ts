import { MechanicalElement } from "../../types/element";
import { MaterialDef, ProfileDef } from "../../types/material";
import { element_mass } from "../../utils/element-mass";

export interface SelectionMetrics {
  /** kg, over everything in the selection that carries mass. */
  mass: number;
  /** m, over the selection's beams — the bill of material a frame adds up to. */
  beamLength: number;
  beamCount: number;
}

/** What a multi-selection adds up to: read-only totals, shown under its common properties. */
export function selection_metrics(
  elements: MechanicalElement[],
  materials: MaterialDef[],
  profiles: ProfileDef[],
): SelectionMetrics {
  let mass = 0;
  let beamLength = 0;
  let beamCount = 0;
  for (const element of elements) {
    mass += element_mass(element, materials, profiles);
    if (element.type === "beam") {
      beamLength += element.positionStart.distance_to(element.positionEnd);
      beamCount += 1;
    }
  }
  return { mass, beamLength, beamCount };
}
