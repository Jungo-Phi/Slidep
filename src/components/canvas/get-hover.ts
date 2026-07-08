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
  LoadElement,
  BeamElement,
  Point2,
  CanvasStateType,
} from "../../types";
import {
  HIT_TOLERANCE,
  DRAWING_ORDER,
  INTERACTION_SPECS,
  DIM,
} from "../../constants/rendering-specs";
import {
  get_connection_types,
  get_connections,
  get_constraint_element_from_id,
  get_load_element_from_id,
  get_mechanical_element_from_id,
} from "../mechanism/connect-actions";
import { get_gear_angles } from "../../utils";
import { is_constraint_type } from "./utils";

const SELECTION_STATES = [
  "Selecting",
  "SelectedMultiple",
  "SelectedElement",
  "Erasing",
  "EditingConstraint",
] as const satisfies readonly CanvasStateType[];

type SelectionStateType = (typeof SELECTION_STATES)[number];

function isSelectionState(
  state: CanvasState,
): state is Extract<CanvasState, { type: SelectionStateType }> {
  return (SELECTION_STATES as readonly CanvasStateType[]).includes(state.type);
}

/** Returns the hovered part of the element, or null if no part is hovered. */
function get_hovered_part_of_element(
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
    if (edge.type !== "beam") return null;
  }
  if (element.type === "mass" && state.type === "PlacingGround") return null; // cannot place ground on mass
  if (
    element.type === "gear" &&
    state.type === "PlacingGearRadius" &&
    state.startHover.type === "Node" &&
    state.startHover.id === element.parentAxleID
  )
    return null; // cannot place a gear on another AND mesh them
  if (state.type === "MovingNode" && "fixedGearsIDs" in element) {
    const node = get_mechanical_element_from_id(
      state.elementID,
      mechanicalElements,
    ) as NodeElement;
    if (
      "fixedGearsIDs" in node &&
      node.fixedGearsIDs
        .map((nodeGearID) =>
          element.fixedGearsIDs
            .map((elementGearID) =>
              (
                get_mechanical_element_from_id(
                  elementGearID,
                  mechanicalElements,
                ) as GearElement
              ).meshedGearsIDs.includes(nodeGearID),
            )
            .some(Boolean),
        )
        .some(Boolean)
    )
      return null;
  } // cannot move an axle with fixed gear meshed with another on the other's parent axle
  // TODO : à "PlacingBeltEnd", ignorer les gears avec le même parentAxle
  if (
    (state.type === "PlacingBeltStart" ||
      state.type === "PlacingBeltEnd" ||
      state.type === "MovingBeltBody" ||
      ((state.type === "MovingEdgeStartPoint" ||
        state.type === "MovingEdgeEndPoint") &&
        get_mechanical_element_from_id(state.elementID, mechanicalElements)
          .type === "belt")) &&
    element.type === "belt"
  )
    return null; // "PlacingBeltStart/End" Et "MovingBeltStart/End" : ignorer les autres beltEnds

  switch (element.type) {
    case "pivot":
    case "slider":
    case "slidep":
    case "join":
    case "mass": {
      const node = element as NodeElement;
      const distance = mousePos.distance_to(node.position);
      switch (state.type) {
        case "Selecting":
        case "SelectedElement":
        case "SelectedMultiple":
        case "Erasing":
        case "EditingConstraint":
        case "PlacingBeltStart":
        case "PlacingBeltEnd":
        case "DimensionStart":
        case "MovingNode":
        case "MovingEdgeBody":
        case "ChangingGearRadius":
        case "PlacingBeamStart":
        case "PlacingBeamEnd":
        case "PlacingSpringStart":
        case "PlacingSpringEnd":
        case "PlacingDamperStart":
        case "PlacingDamperEnd":
        case "PlacingGearStart":
        case "PlacingGearRadius":
        case "PlacingGround":
        case "PlacingPivot":
        case "PlacingMotor":
        case "PlacingSlider":
        case "PlacingJoin":
        case "PlacingMass":
        case "PlacingForceStart":
        case "PlacingProbe":
        case "DimensionNode":
        case "DimensionEdge":
        case "HorizontalVerticalConstraintStart":
        case "HorizontalVerticalConstraintNode":
        case "MovingEdgeStartPoint":
        case "MovingEdgeEndPoint":
          // center
          const hit_radius =
            HIT_TOLERANCE.NODE *
            (node.type === "pivot" && node.motor ? 1.5 : 1);
          if (distance <= hit_radius) {
            return {
              type: "Node",
              position: node.position.clone(),
              id: node.id,
              deleting: state.type === "Erasing",
              beamBodyHover: false,
            };
          }

          // beam BodyHover
          if (
            state.type !== "MovingEdgeStartPoint" &&
            state.type !== "MovingEdgeEndPoint" &&
            state.type !== "PlacingBeamEnd"
          )
            break;

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
            break;
          }
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
          } else if (
            node.position.distance_to_segment(edge.positionStart, mousePos) <=
              HIT_TOLERANCE.EDGE &&
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
          break;
      }
      break;
    }
    case "gear": {
      const gear = element as GearElement;
      const distance = mousePos.distance_to(gear.position);
      if (
        distance > gear.radius + HIT_TOLERANCE.NODE / 2 ||
        distance < gear.radius - HIT_TOLERANCE.NODE / 2
      )
        break;
      switch (state.type) {
        case "Selecting":
        case "SelectedElement":
        case "SelectedMultiple":
        case "Erasing":
        case "EditingConstraint":
        case "PlacingBeltStart":
        case "PlacingBeltEnd":
        case "DimensionStart":
        case "MovingNode":
        case "MovingEdgeBody":
        case "PlacingBeamStart":
        case "PlacingBeamEnd":
        case "PlacingSpringStart":
        case "PlacingSpringEnd":
        case "PlacingDamperStart":
        case "PlacingDamperEnd":
        case "PlacingGround":
        case "PlacingPivot":
        case "PlacingMotor":
        case "PlacingSlider":
        case "PlacingJoin":
        case "PlacingMass":
        case "PlacingProbe":
          // gear perimeter
          return {
            type: "GearTooth",
            position: mousePos
              .sub(gear.position)
              .normalize()
              .mul(gear.radius)
              .add(gear.position),
            id: gear.id,
            deleting: state.type === "Erasing",
          };
        case "MovingBeltBody":
          if (gear.attachedBeltID) break;
          return {
            type: "GearTooth",
            position: gear.position.add(
              mousePos.sub(gear.position).normalize().mul(gear.radius),
            ),
            id: gear.id,
            deleting: false,
          };
        case "ChangingGearRadius":
          const gear2 = get_mechanical_element_from_id(
            state.elementID,
            mechanicalElements,
          ) as GearElement;
          return {
            type: "GearTooth",
            position: gear.position.add(
              gear2.position.sub(gear.position).normalize().mul(gear.radius),
            ),
            id: gear.id,
            deleting: false,
          };
        case "PlacingGearRadius":
          // Gear on gear teehts -> contact point
          return {
            type: "GearTooth",
            position: gear.position.add(
              state.startHover.position
                .sub(gear.position)
                .normalize()
                .mul(gear.radius),
            ),
            id: gear.id,
            deleting: false,
          };
        case "PlacingMoment":
          // Moment on gear perimeter
          return {
            type: "GearTooth",
            position: gear.position.clone(),
            id: gear.id,
            deleting: false,
          };
        case "GearRatioConstraintStart":
        case "GearRatioConstraintGear":
        case "EqualConstraintStart":
        case "EqualConstraintGear":
          // Only gear teehts
          if (
            gear.type !== "gear" ||
            ((state.type === "GearRatioConstraintGear" ||
              state.type === "EqualConstraintGear") &&
              state.startGearID === gear.id)
          )
            break;
          return {
            type: "GearTooth",
            position: gear.position.clone(),
            id: gear.id,
            deleting: false,
          };
      }
      break;
    }
    case "beam":
    case "spring":
    case "damper":
      const edge = element as EdgeElement;

      if (isSelectionState(state)) {
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
          mousePos.distance_to_segment(edge.positionStart, edge.positionEnd) <=
          HIT_TOLERANCE.EDGE
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
      }
      switch (state.type) {
        case "PlacingForceStart":
          // endpoints only (no body) — force anchors at node or edge endpoint
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
          break;
        case "PlacingMoment":
          // body of any edge (not just beam)
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
        case "PlacingDistributedForceStart":
          // beam body only
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
        case "PlacingProbe":
          // body of any edge
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
        case "PlacingGearStart":
        case "PlacingPivot":
        case "PlacingMotor":
        case "PlacingSlider":
        case "PlacingJoin":
        case "PlacingMass":
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
          // body
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
        case "PlacingGearRadius":
        case "ChangingGearRadius":
          // ends
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
      }
      break;
    case "belt":
      const belt = element as BeltElement;

      if (
        isSelectionState(state) ||
        state.type === "ChangingGearRadius" ||
        state.type === "PlacingGearRadius"
      ) {
        // body + ends
        if (
          state.type !== "ChangingGearRadius" &&
          state.type !== "PlacingGearRadius"
        ) {
          if (mousePos.distance_to(belt.positionStart) <= HIT_TOLERANCE.NODE) {
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
        const attachedGears = belt.attachedGearsIDs.map(({ id, direction }) => {
          return {
            gear: get_mechanical_element_from_id(
              id,
              mechanicalElements,
            ) as GearElement,
            direction,
          };
        });
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
            const angle = mousePos.sub(center).angle();
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
          if (mousePos.distance_to_segment(start, end) <= HIT_TOLERANCE.EDGE) {
            if (
              state.type === "ChangingGearRadius" ||
              state.type === "PlacingGearRadius"
            ) {
              let gearPos: Point2;
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
      }
      switch (state.type) {
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
        case "PlacingMotor":
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
      if (!isSelectionState(state)) break;
      if (mousePos.distance_to(element.position) > HIT_TOLERANCE.CONSTRAINT)
        break;
      return {
        type: "Constraint",
        position: element.position.clone(),
        id: element.id,
        deleting: state.type === "Erasing",
      };
    case "force": {
      if (!isSelectionState(state)) break;
      const target = get_mechanical_element_from_id(
        element.targetID,
        mechanicalElements,
      );
      let base: Point2;
      if ("position" in target) {
        base = (target as NodeElement).position;
      } else {
        const edge = target as EdgeElement;
        base = element.anchor === "end" ? edge.positionEnd : edge.positionStart;
      }
      const tip = base.add(element.vector);
      // Tip handle
      if (mousePos.distance_to(tip) <= HIT_TOLERANCE.NODE) {
        return {
          type: "Force",
          position: tip,
          id: element.id,
          part: "tip",
          deleting: state.type === "Erasing",
        };
      }
      // Arrow body
      if (mousePos.distance_to_segment(base, tip) <= HIT_TOLERANCE.EDGE) {
        return {
          type: "Force",
          position: mousePos.project_on_line(base, tip),
          id: element.id,
          part: "body",
          deleting: state.type === "Erasing",
        };
      }
      break;
    }
    case "moment": {
      if (!isSelectionState(state)) break;
      const beam = get_mechanical_element_from_id(
        element.beamID,
        mechanicalElements,
      ) as BeamElement;
      const center = beam.positionStart.lerp(beam.positionEnd, 0.5);
      const dist = mousePos.distance_to(center);
      const radius = 18 + Math.min(Math.abs(element.value) * 2, 20);
      if (
        dist <= radius + HIT_TOLERANCE.EDGE &&
        dist >= radius - HIT_TOLERANCE.EDGE
      ) {
        return {
          type: "Moment",
          position: center,
          id: element.id,
          deleting: state.type === "Erasing",
        };
      }
      break;
    }
    case "distributed-force":
      {
        if (!isSelectionState(state)) break;
        const beam = get_mechanical_element_from_id(
          element.beamID,
          mechanicalElements,
        ) as BeamElement;
        const tipStart = beam.positionStart.add(element.vectorStart);
        const tipEnd = beam.positionEnd.add(element.vectorEnd);
        // Tip handles
        if (mousePos.distance_to(tipStart) <= HIT_TOLERANCE.NODE) {
          return {
            type: "DistributedForce",
            position: tipStart,
            id: element.id,
            part: "start-tip",
            deleting: state.type === "Erasing",
          };
        }
        if (mousePos.distance_to(tipEnd) <= HIT_TOLERANCE.NODE) {
          return {
            type: "DistributedForce",
            position: tipEnd,
            id: element.id,
            part: "end-tip",
            deleting: state.type === "Erasing",
          };
        }
        // Both tips: near segment between tips
        if (
          mousePos.distance_to_segment(tipStart, tipEnd) <= HIT_TOLERANCE.EDGE
        ) {
          return {
            type: "DistributedForce",
            position: mousePos.project_on_line(tipStart, tipEnd),
            id: element.id,
            part: "line",
            deleting: state.type === "Erasing",
          };
        }
        // Body: Area between segment and beam
        if (
          mousePos.distance_to_segment(beam.positionStart, beam.positionEnd) <=
          30
        ) {
          // TODO : calculer si on est dans la surface
          return {
            type: "DistributedForce",
            position: mousePos,
            id: element.id,
            part: "body",
            deleting: state.type === "Erasing",
          };
        }
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
  loadElements: LoadElement[] = [],
  visibleConstraints: Map<ID, number>,
  mousePos: Point2,
  state: CanvasState,
): HoveredPart {
  const excluded_elements: ID[] = [];
  if (
    state.type === "MovingNode" ||
    state.type === "MovingEdgeStartPoint" ||
    state.type === "MovingEdgeEndPoint" ||
    state.type === "MovingEdgeBody" ||
    state.type === "ChangingGearRadius"
  ) {
    const element = get_mechanical_element_from_id(
      state.elementID,
      mechanicalElements,
    );
    excluded_elements.push(element.id);
    get_connection_types(element).forEach((connectionType) => {
      excluded_elements.push(...get_connections(element, connectionType));
    });
  }
  if (state.type === "MovingConstraint") {
    const constraint = get_constraint_element_from_id(
      state.elementID,
      constraintElements,
    );
    excluded_elements.push(constraint.id);
  }
  if (state.type === "MovingForce" || state.type === "MovingDistributedForce") {
    const load = get_load_element_from_id(state.elementID, loadElements);
    excluded_elements.push(load.id);
  }
  if (state.type === "PlacingBeltEnd") {
    excluded_elements.push(...state.attachedGearsIDs.map(({ id }) => id));
  } else if (
    state.type === "PlacingBeamEnd" &&
    (state.startHover.type === "Node" || state.startHover.type === "Edge")
  ) {
    excluded_elements.push(state.startHover.id);
  }

  let position = mousePos.clone();
  if (
    state.type === "PlacingBeamEnd" ||
    state.type === "PlacingSpringEnd" ||
    state.type === "PlacingDamperEnd"
  ) {
    position = state.startHover.position.add(
      mousePos
        .sub(state.startHover.position)
        .limit_length_min(DIM.MIN_EDGE_LENGTH),
    );
  } else if (state.type === "PlacingGearRadius") {
    position = state.startHover.position.add(
      mousePos
        .sub(state.startHover.position)
        .limit_length_min(DIM.MIN_GEAR_RADIUS),
    );
  }

  const elements: UnionElement[] = (mechanicalElements as UnionElement[])
    .concat(constraintElements)
    .concat(loadElements);

  const hover_order = [...DRAWING_ORDER];
  hover_order.reverse();
  for (const type of hover_order) {
    const one_type_elements = elements.filter((e) => e.type === type).reverse();
    for (const element of one_type_elements) {
      if (excluded_elements.includes(element.id)) continue;
      // Skip constraints hidden by the current context (mode / tab / hover).
      if (
        is_constraint_type(element.type) &&
        !visibleConstraints.has(element.id)
      )
        continue;
      const hoveredPart = get_hovered_part_of_element(
        element,
        mechanicalElements,
        position,
        state,
      );
      if (hoveredPart) return hoveredPart;
    }
  }

  // Belt end over belt start
  if (
    state.type === "PlacingBeltEnd" &&
    mousePos.distance_to(state.startHover.position) <= HIT_TOLERANCE.NODE
  ) {
    return {
      type: "Edge",
      position: state.startHover.position,
      id: "----",
      deleting: false,
      part: "start",
    };
  } else if (state.type === "MovingEdgeStartPoint") {
    const belt = get_mechanical_element_from_id(
      state.elementID,
      mechanicalElements,
    ) as EdgeElement;
    if (
      belt.type === "belt" &&
      mousePos.distance_to(belt.positionEnd) <= HIT_TOLERANCE.NODE
    ) {
      return {
        type: "Edge",
        position: belt.positionEnd,
        id: state.elementID,
        deleting: false,
        part: "end",
      };
    }
  } else if (state.type === "MovingEdgeEndPoint") {
    const belt = get_mechanical_element_from_id(
      state.elementID,
      mechanicalElements,
    ) as EdgeElement;
    if (
      belt.type === "belt" &&
      mousePos.distance_to(belt.positionStart) <= HIT_TOLERANCE.NODE
    ) {
      return {
        type: "Edge",
        position: belt.positionStart,
        id: state.elementID,
        deleting: false,
        part: "start",
      };
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
