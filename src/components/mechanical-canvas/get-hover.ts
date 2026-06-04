import {
  MechanicalElement,
  ConstraintElement,
  EdgeElement,
  GearElement,
  NodeElement,
  UnionElement,
  ID,
  BeltElement,
  CanvasState,
  HoveredPart,
  Point2,
} from "../../types";
import {
  HIT_TOLERANCE,
  DRAWING_ORDER,
  INTERACTION_SPECS,
  DIM,
} from "../../constants/rendering-specs";
import { get_mechanical_element_from_id } from "./connect-actions";
import { get_gear_angles } from "../../utils/belt-geom";

/** Returns the hovered part of the element, or null if no part is hovered. */
export function get_hovered_part_of_element(
  element: UnionElement,
  mechanicalElements: MechanicalElement[],
  mousePos: Point2,
  state: CanvasState,
): HoveredPart | null {
  if (state.type === "SelectingMultiple" || state.type === "ErasingMultiple")
    return null;
  if (state.type === "MovingEdgeBody") {
    const edge = get_mechanical_element_from_id(
      state.elementID,
      mechanicalElements,
    ) as EdgeElement;
    if (edge.type === "beam") {
      // TODO : rejeter les éléments directement connectés
    } else {
      return null;
    }
  }
  switch (element.type) {
    case "pivot":
    case "slider":
    case "slidep":
    case "join":
    case "mass":
    case "gear":
      const node = element as NodeElement;
      const distance = mousePos.distance_to(node.position);
      switch (state.type) {
        case "Selecting":
        case "SelectedElement":
        case "SelectedMultiple":
        case "PlacingBeltStart":
        case "PlacingBeltEnd":
        case "DimensionStart":
        case "Erasing":
        case "EditingConstraint":
          // center + gear perimeter
          if (distance <= HIT_TOLERANCE.NODE) {
            return {
              type: "Node",
              position: node.position.clone(),
              id: node.id,
              deleting: state.type === "Erasing",
              beamBodyHover: false,
            };
          }
          if (
            node.type !== "gear" ||
            state.type === "PlacingBeltStart" ||
            (state.type === "PlacingBeltEnd" && node.attachedBeltID)
          )
            break;
          if (
            distance <= node.radius + HIT_TOLERANCE.NODE / 2 &&
            distance > node.radius - HIT_TOLERANCE.NODE / 2
          ) {
            return {
              type: "GearTooth",
              position: mousePos
                .sub(node.position)
                .normalize()
                .mul(node.radius)
                .add(node.position),
              id: node.id,
              deleting: state.type === "Erasing",
            };
          }
          break;
        case "MovingNode":
        case "MovingEdgeBody":
        case "PlacingBeamStart":
        case "PlacingSpringStart":
        case "PlacingSpringEnd":
        case "PlacingDamperStart":
        case "PlacingDamperEnd":
        case "PlacingGearStart":
        case "PlacingGround":
        case "PlacingPivot":
        case "PlacingSlider":
        case "PlacingJoin":
        case "PlacingMass":
        case "DimensionNode":
        case "DimensionEdge":
        case "HorizontalVerticalConstraintStart":
        case "HorizontalVerticalConstraintNode":
          if (element.type === "mass" && state.type === "PlacingGround") break; // cannot place ground on mass
          // center
          if (distance <= HIT_TOLERANCE.NODE) {
            return {
              type: "Node",
              position: node.position.clone(),
              id: node.id,
              beamBodyHover: false,
              deleting: false,
            };
          }
          break;
        case "MovingEdgeStartPoint":
        case "MovingEdgeEndPoint":
        case "PlacingBeamEnd":
          // Center + beam BodyHover
          if (distance <= HIT_TOLERANCE.NODE) {
            return {
              type: "Node",
              position: node.position.clone(),
              id: node.id,
              deleting: false,
              beamBodyHover: false,
            };
          }
          if (state.type === "PlacingBeamEnd") {
            if (
              node.position.distance_to_segment(
                state.startHover.position,
                mousePos,
              ) <= HIT_TOLERANCE.EDGE &&
              mousePos.distance_to_line(
                state.startHover.position,
                node.position,
              ) <= HIT_TOLERANCE.EDGE
            ) {
              return {
                type: "Node",
                position: mousePos.project_on_line(
                  state.startHover.position,
                  node.position,
                ),
                id: node.id,
                deleting: false,
                beamBodyHover: true,
              };
            }
          } else {
            const edge = get_mechanical_element_from_id(
              state.elementID,
              mechanicalElements,
            );
            if (edge.type !== "beam") break;
            if (state.type === "MovingEdgeStartPoint") {
              if (
                node.position.distance_to_segment(edge.positionEnd, mousePos) <=
                  HIT_TOLERANCE.EDGE &&
                mousePos.distance_to_line(edge.positionEnd, node.position) <=
                  HIT_TOLERANCE.EDGE
              ) {
                return {
                  type: "Node",
                  position: mousePos.project_on_line(
                    edge.positionEnd,
                    node.position,
                  ),
                  id: node.id,
                  deleting: false,
                  beamBodyHover: true,
                };
              }
            } else {
              if (
                node.position.distance_to_segment(
                  edge.positionStart,
                  mousePos,
                ) <= HIT_TOLERANCE.EDGE &&
                mousePos.distance_to_line(edge.positionStart, node.position) <=
                  HIT_TOLERANCE.EDGE
              ) {
                return {
                  type: "Node",
                  position: mousePos.project_on_line(
                    edge.positionStart,
                    node.position,
                  ),
                  id: node.id,
                  deleting: false,
                  beamBodyHover: true,
                };
              }
            }
          }
          break;
        case "MovingBeltBody":
        case "ChangingGearRadius":
        case "PlacingGearRadius":
          // Gear on gear teehts -> contact point
          if (
            node.type !== "gear" ||
            (state.type === "MovingBeltBody" && node.attachedBeltID)
          )
            break;
          if (
            distance <= node.radius + HIT_TOLERANCE.NODE / 2 &&
            distance > node.radius - HIT_TOLERANCE.NODE / 2
          ) {
            switch (state.type) {
              case "MovingBeltBody":
                return {
                  type: "GearTooth",
                  position: node.position.add(
                    mousePos.sub(node.position).normalize().mul(node.radius),
                  ),
                  id: node.id,
                  deleting: false,
                };
              case "ChangingGearRadius":
                const gear = get_mechanical_element_from_id(
                  state.elementID,
                  mechanicalElements,
                ) as GearElement;
                return {
                  type: "GearTooth",
                  position: node.position.add(
                    gear.position
                      .sub(node.position)
                      .normalize()
                      .mul(node.radius),
                  ),
                  id: node.id,
                  deleting: false,
                };
              case "PlacingGearRadius":
                return {
                  type: "GearTooth",
                  position: node.position.add(
                    state.startHover.position
                      .sub(node.position)
                      .normalize()
                      .mul(node.radius),
                  ),
                  id: node.id,
                  deleting: false,
                };
            }
          }
          break;
        case "GearRatioConstraintStart":
        case "GearRatioConstraintGear":
        case "EqualConstraintStart":
        case "EqualConstraintGear":
          // Only gear teehts
          if (
            node.type !== "gear" ||
            ((state.type === "GearRatioConstraintGear" ||
              state.type === "EqualConstraintGear") &&
              state.startGearID === node.id)
          )
            break;
          if (
            distance <= node.radius + HIT_TOLERANCE.NODE / 2 &&
            distance > node.radius - HIT_TOLERANCE.NODE / 2
          ) {
            return {
              type: "GearTooth",
              position: node.position.clone(),
              id: node.id,
              deleting: false,
            };
          }
      }
      break;
    case "beam":
    case "spring":
    case "damper":
      const edge = element as EdgeElement;
      switch (state.type) {
        case "Selecting":
        case "SelectedMultiple":
        case "SelectedElement":
        case "Erasing":
        case "EditingConstraint":
          // body & ends
          if (mousePos.distance_to(edge.positionStart) <= HIT_TOLERANCE.NODE) {
            return {
              type: "Edge",
              position: edge.positionStart.clone(),
              id: edge.id,
              deleting: state.type === "Erasing",
              part: "start",
            };
          }
          if (mousePos.distance_to(edge.positionEnd) <= HIT_TOLERANCE.NODE) {
            return {
              type: "Edge",
              position: edge.positionEnd.clone(),
              id: edge.id,
              deleting: state.type === "Erasing",
              part: "end",
            };
          }
          if (
            mousePos.distance_to_segment(
              edge.positionStart,
              edge.positionEnd,
            ) <= HIT_TOLERANCE.EDGE
          ) {
            return {
              type: "Edge",
              position: mousePos.project_on_line(
                edge.positionStart,
                edge.positionEnd,
              ),
              id: edge.id,
              deleting: state.type === "Erasing",
              part: "body",
            };
          }
          break;
        case "MovingNode":
        case "MovingEdgeStartPoint":
        case "MovingEdgeEndPoint":
        case "MovingEdgeBody":
        case "PlacingBeamStart":
        case "PlacingBeamEnd":
        case "PlacingSpringStart":
        case "PlacingSpringEnd":
        case "PlacingDamperStart":
        case "PlacingDamperEnd":
        case "PlacingBeltStart":
        case "PlacingBeltEnd":
        case "PlacingPivot":
        case "PlacingSlider":
        case "PlacingJoin":
        case "PlacingMass":
        case "PlacingGearStart":
        case "PlacingGround":
          // body (only if beam) & ends
          if (mousePos.distance_to(edge.positionStart) <= HIT_TOLERANCE.NODE) {
            return {
              type: "Edge",
              position: edge.positionStart.clone(),
              id: edge.id,
              deleting: false,
              part: "start",
            };
          }
          if (mousePos.distance_to(edge.positionEnd) <= HIT_TOLERANCE.NODE) {
            return {
              type: "Edge",
              position: edge.positionEnd.clone(),
              id: edge.id,
              deleting: false,
              part: "end",
            };
          }
          if (
            edge.type === "beam" &&
            mousePos.distance_to_segment(
              edge.positionStart,
              edge.positionEnd,
            ) <= HIT_TOLERANCE.EDGE
          ) {
            return {
              type: "Edge",
              position: mousePos.project_on_line(
                edge.positionStart,
                edge.positionEnd,
              ),
              id: edge.id,
              deleting: false,
              part: "body",
            };
          }
          break;
        case "HorizontalVerticalConstraintStart":
        case "NormalConstraintStart":
        case "NormalConstraintEdge":
        case "ParallelConstraintStart":
        case "ParallelConstraintEdge":
        case "EqualConstraintStart":
        case "EqualConstraintEdge":
        case "DimensionStart":
        case "DimensionNode":
        case "DimensionEdge":
          if (
            mousePos.distance_to_segment(
              edge.positionStart,
              edge.positionEnd,
            ) <= HIT_TOLERANCE.EDGE
          ) {
            return {
              type: "Edge",
              position: mousePos.project_on_line(
                edge.positionStart,
                edge.positionEnd,
              ),
              id: edge.id,
              deleting: false,
              part: "body",
            };
          }
          break;
      }
      break;
    case "belt":
      const belt = element as BeltElement;
      switch (state.type) {
        case "Selecting":
        case "SelectedMultiple":
        case "SelectedElement":
        case "Erasing":
        case "ChangingGearRadius":
        case "PlacingGearRadius":
        case "EditingConstraint":
          // body + ends
          if (
            state.type !== "ChangingGearRadius" &&
            state.type !== "PlacingGearRadius"
          ) {
            if (
              mousePos.distance_to(belt.positionStart) <= HIT_TOLERANCE.NODE
            ) {
              return {
                type: "Edge",
                position: belt.positionStart.clone(),
                id: belt.id,
                deleting: state.type === "Erasing",
                part: "start",
              };
            }
            if (mousePos.distance_to(belt.positionEnd) <= HIT_TOLERANCE.NODE) {
              return {
                type: "Edge",
                position: belt.positionEnd.clone(),
                id: belt.id,
                deleting: state.type === "Erasing",
                part: "end",
              };
            }
          }
          // Belt body
          const attachedGears = belt.attachedGearsIDs.map(
            ({ id, direction }) => {
              return {
                gear: get_mechanical_element_from_id(
                  id,
                  mechanicalElements,
                ) as GearElement,
                direction,
              };
            },
          );
          let gearAngles = get_gear_angles(
            belt.positionStart,
            belt.positionEnd,
            attachedGears,
          );
          // arc sections
          if (
            state.type !== "ChangingGearRadius" &&
            state.type !== "PlacingGearRadius"
          ) {
            for (let i = 0; i < gearAngles.length; i++) {
              const { center, radius, startAngle, endAngle, direction } =
                gearAngles[i];
              const distance = mousePos.distance_to(center);
              const angle = center.angle_to(mousePos);
              if (
                distance <= radius + HIT_TOLERANCE.NODE / 2 &&
                distance > radius - HIT_TOLERANCE.NODE / 2 &&
                ((!direction && startAngle <= angle && angle <= endAngle) ||
                  (direction && endAngle <= angle && angle <= startAngle))
              ) {
                return {
                  type: "BeltBody",
                  position: mousePos
                    .sub(center)
                    .normalize()
                    .mul(radius)
                    .add(center),
                  id: belt.id,
                  deleting: state.type === "Erasing",
                  section: 2 * i + 1,
                };
              }
            }
          }
          // straight sections
          gearAngles.unshift({
            center: belt.positionStart,
            radius: 0,
            startAngle: 0,
            endAngle: 0,
            direction: false,
          });
          gearAngles.push({
            center: belt.positionEnd,
            radius: 0,
            startAngle: 0,
            endAngle: 0,
            direction: false,
          });
          for (let i = 0; i < gearAngles.length - 1; i++) {
            const { center: c1, radius: r1, endAngle } = gearAngles[i];
            const { center: c2, radius: r2, startAngle } = gearAngles[i + 1];
            const start = c1.add(Point2.from_polar(r1, endAngle));
            const end = c2.add(Point2.from_polar(r2, startAngle));
            if (
              mousePos.distance_to_segment(start, end) <= HIT_TOLERANCE.EDGE
            ) {
              let gearPos: Point2;
              if (
                state.type === "ChangingGearRadius" ||
                state.type === "PlacingGearRadius"
              ) {
                if (state.type == "ChangingGearRadius") {
                  const gear = get_mechanical_element_from_id(
                    state.elementID,
                    mechanicalElements,
                  ) as GearElement;
                  gearPos = gear.position;
                } else {
                  gearPos = state.startHover.position;
                }
                if (
                  gearPos.distance_to_segment(start, end) <=
                  gearPos.distance_to_line(start, end)
                ) {
                  return {
                    type: "BeltBody",
                    position: gearPos
                      .project_on_line(start, end)
                      .sub(gearPos)
                      .extend_length(INTERACTION_SPECS.GEAR_ON_BELT_GROW)
                      .add(gearPos),
                    id: belt.id,
                    deleting: false,
                    section: 2 * i,
                  };
                }
              } else {
                return {
                  type: "BeltBody",
                  position: mousePos.project_on_line(start, end),
                  id: belt.id,
                  deleting: state.type === "Erasing",
                  section: 2 * i,
                };
              }
            }
          }
          break;
        case "MovingNode":
        case "MovingEdgeStartPoint":
        case "MovingEdgeEndPoint":
        case "MovingEdgeBody":
        case "PlacingBeamStart":
        case "PlacingBeamEnd":
        case "PlacingSpringStart":
        case "PlacingSpringEnd":
        case "PlacingDamperStart":
        case "PlacingDamperEnd":
        case "PlacingBeltStart":
        case "PlacingBeltEnd":
        case "PlacingPivot":
        case "PlacingSlider":
        case "PlacingJoin":
        case "PlacingMass":
        case "PlacingGearStart":
        case "PlacingGround":
        case "DimensionStart":
        case "DimensionNode":
        case "DimensionEdge":
        case "HorizontalVerticalConstraintStart":
        case "HorizontalVerticalConstraintNode":
          // ends
          if (mousePos.distance_to(belt.positionStart) <= HIT_TOLERANCE.NODE) {
            return {
              type: "Edge",
              position: belt.positionStart.clone(),
              id: belt.id,
              deleting: false,
              part: "start",
            };
          }
          if (mousePos.distance_to(belt.positionEnd) <= HIT_TOLERANCE.NODE) {
            return {
              type: "Edge",
              position: belt.positionEnd.clone(),
              id: belt.id,
              deleting: false,
              part: "end",
            };
          }
          break;
      }
      break;
    case "dimension-edge":
    case "dimension-node-to-node":
    case "dimension-edge-to-node":
    case "dimension-angle":
    case "dimension-radius":
    case "horizontal-align-edge":
    case "horizontal-align-nodes":
    case "vertical-align-edge":
    case "vertical-align-nodes":
    case "normal":
    case "parallel":
    case "equal":
    case "gear-ratio":
      switch (state.type) {
        case "MovingNode":
        case "MovingEdgeStartPoint":
        case "MovingEdgeEndPoint":
        case "MovingEdgeBody":
        case "MovingBeltBody":
        case "ChangingGearRadius":
        case "MovingSelectionMultiple":
        case "PlacingBeamStart":
        case "PlacingBeamEnd":
        case "PlacingSpringStart":
        case "PlacingSpringEnd":
        case "PlacingDamperStart":
        case "PlacingDamperEnd":
        case "PlacingBeltStart":
        case "PlacingBeltEnd":
        case "PlacingPivot":
        case "PlacingSlider":
        case "PlacingJoin":
        case "PlacingMass":
        case "PlacingGearStart":
        case "PlacingGearRadius":
        case "PlacingGround":
        case "DimensionStart":
        case "DimensionNode":
        case "DimensionEdge":
        case "DimensionNodeToNode":
        case "DimensionEdgeToNode":
        case "DimensionAngle":
        case "DimensionRadius":
        case "HorizontalVerticalConstraintStart":
        case "HorizontalVerticalConstraintNode":
        case "NormalConstraintStart":
        case "NormalConstraintEdge":
        case "ParallelConstraintStart":
        case "ParallelConstraintEdge":
        case "EqualConstraintStart":
        case "EqualConstraintEdge":
        case "EqualConstraintGear":
        case "GearRatioConstraintStart":
        case "GearRatioConstraintGear":
        case "MovingConstraint":
          break;
      }
      if (mousePos.distance_to(element.position) <= HIT_TOLERANCE.CONSTRAINT) {
        return {
          type: "Constraint",
          position: element.position.clone(),
          id: element.id,
          deleting: state.type === "Erasing",
        };
      }
      break;
  }
  return null;
}

/**
 * Detects which part of a mechanism is being hovered at a given point
 * Returns the hovered part and the corresponding point on that part
 */
export function get_hovered_part(
  mechanicalElements: MechanicalElement[],
  constraintElements: ConstraintElement[],
  excluded_elements: ID[],
  constraints_visible: boolean,
  mousePos: Point2,
  state: CanvasState,
): HoveredPart {
  const hover_order = [...DRAWING_ORDER];
  hover_order.reverse();
  const elements: UnionElement[] = (
    mechanicalElements as UnionElement[]
  ).concat(constraintElements);

  let position = mousePos.clone();
  if (
    (state.type === "PlacingBeamEnd" ||
      state.type === "PlacingSpringEnd" ||
      state.type === "PlacingDamperEnd" ||
      state.type === "PlacingBeltEnd") &&
    mousePos.distance_to(state.startHover.position) < DIM.MIN_EDGE_LENGTH
  ) {
    const delta = mousePos.sub(state.startHover.position);
    position = state.startHover.position.add(
      delta.scale_to_length(DIM.MIN_EDGE_LENGTH),
    );
  } else if (
    state.type === "PlacingGearRadius" &&
    mousePos.distance_to(state.startHover.position) < DIM.MIN_GEAR_RADIUS
  ) {
    const delta = mousePos.sub(state.startHover.position);
    position = state.startHover.position.add(
      delta.scale_to_length(DIM.MIN_GEAR_RADIUS),
    );
  }
  for (const type of hover_order) {
    if (
      (type === "dimension-edge" ||
        type === "dimension-node-to-node" ||
        type === "dimension-edge-to-node" ||
        type === "dimension-angle" ||
        type === "dimension-radius" ||
        type === "horizontal-align-edge" ||
        type === "horizontal-align-nodes" ||
        type === "vertical-align-edge" ||
        type === "vertical-align-nodes" ||
        type === "normal" ||
        type === "parallel" ||
        type === "gear-ratio") &&
      !constraints_visible
    )
      continue;
    const one_type_elements = elements.filter((e) => e.type === type).reverse();
    for (const element of one_type_elements) {
      if (excluded_elements.includes(element.id)) continue;
      const hoveredPart = get_hovered_part_of_element(
        element,
        mechanicalElements,
        position,
        state,
      );
      if (hoveredPart) return hoveredPart;
    }
  }
  return { type: "Void", position };
}

/**
 * Detects which elements of a mechanism are being hovered by a rectangle selection.
 * Returns a list of the hovered elements ids
 */
export function get_hovered_elements_by_rect(
  mechanicalElements: MechanicalElement[],
  rectStart: Point2,
  rectEnd: Point2,
): ID[] {
  const hoveredElements: ID[] = [];
  // Check each element to see if it intersects with the rectangle
  for (const element of mechanicalElements) {
    switch (element.type) {
      case "slider":
      case "pivot":
      case "slidep":
      case "join":
      case "mass":
      case "gear":
        const node = element as NodeElement;
        if (node.position.is_in_rect(rectStart, rectEnd)) {
          hoveredElements.push(node.id);
        }
        break;
      case "belt":
      case "beam":
      case "spring":
      case "damper":
        const edge = element as EdgeElement;
        if (
          edge.positionStart
            .lerp(edge.positionEnd, 0.5)
            .is_in_rect(rectStart, rectEnd)
        ) {
          hoveredElements.push(edge.id);
        }
        break;
    }
  }
  return hoveredElements;
}
