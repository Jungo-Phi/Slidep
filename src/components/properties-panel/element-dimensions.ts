import {
  ConstraintElement,
  EdgeElement,
  GearElement,
  MechanicalElement,
} from "../../types/element";
import { ViewportState, ONE } from "../../types";
import { screen2world_length } from "../../utils";
import { measure_belt_length } from "../../utils/belt-geom";
import { DIM } from "../../constants/rendering-specs";

/**
 * How far a dimension nobody placed stands off what it measures — a screen distance, so it lands where it can be read whatever the zoom, and never a hundred times the mechanism away.
 *
 * Read by the ruler as well: a reading and a cote of the same thing sit in the same place, so one does not read as an odd version of the other.
 */
export const auto_dimension_offset = (viewport: ViewportState) =>
  screen2world_length(DIM.AUTO_DIMENSION_OFFSET, viewport);


export const create_length_dimension = (
  element: EdgeElement,
  mechanicalElements: MechanicalElement[],
  viewport: ViewportState,
): ConstraintElement => {
  const { positionStart, positionEnd } = element;
  const length =
    element.type === "belt"
      ? measure_belt_length(element, mechanicalElements)
      : positionStart.distance_to(positionEnd);
  const mid = positionStart.lerp(positionEnd, 0.5);
  const offset = positionEnd
    .sub(positionStart)
    .perp()
    .with_length(auto_dimension_offset(viewport));
  const position = mid.add(offset);
  if (element.type === "belt") {
    return {
      type: "dimension-belt",
      id: crypto.randomUUID(),
      position,
      beltID: element.id,
      value: length,
    };
  }
  return {
    type: "dimension-edge",
    id: crypto.randomUUID(),
    position,
    edgeID: element.id,
    value: length,
  };
};

export const create_radius_dimension = (
  gear: GearElement,
  viewport: ViewportState,
): ConstraintElement => {
  const position = gear.position.add(
    ONE.with_length(gear.radius + auto_dimension_offset(viewport)),
  );
  return {
    type: "dimension-radius",
    id: crypto.randomUUID(),
    position,
    gearID: gear.id,
    value: gear.radius,
  };
};
