import {
  COLORS,
  DIM,
  DIMENSION_SPECS,
  DRAWING_ORDER,
  INTERACTION_SPECS,
  STROKE_WIDTHS,
} from "../../constants/rendering-specs";
import {
  BeamElement,
  ConstraintElement,
  DistributedForceElement,
  EdgeElement,
  ForceElement,
  GearElement,
  ID,
  LoadElement,
  MechanicalElement,
  MomentElement,
  NodeElement,
  Point2,
  UnionElement,
  ZERO,
} from "../../types";
import { HoveredPart } from "../../types/hovered-part";
import { CanvasState } from "../../types/canvas-state";
import {
  draw_beam,
  draw_belt,
  draw_hover_edge_end,
  draw_damper,
  draw_gear,
  draw_ground,
  draw_join,
  draw_mass,
  draw_pivot,
  draw_slidep_bottom,
  draw_slider,
  draw_spring,
  draw_start_edge_end,
  draw_belt_end,
  draw_element_icon,
  draw_gear_ratio,
  draw_dimention_angle,
  draw_dimention_to_segment,
  draw_dimension_radius,
  draw_dimention,
  draw_join_bottom,
  draw_join_top,
  draw_force,
  draw_moment,
  draw_distributed_force,
  draw_motor,
  draw_probe,
} from "./drawing-functions";
import { get_mechanical_element_from_id } from "../mechanism/connect-actions";
import {
  get_gear_angles,
  is_on_left_side_of_belt,
  resolve_angle_constraint_quadrant,
} from "../../utils";
import { connected_constraints, node_on_beam_body } from "./utils";

function is_selected(elementID: ID, state: CanvasState): boolean {
  return (
    (state.type === "SelectedElement" && state.elementID === elementID) ||
    (state.type === "MovingNode" && state.elementID === elementID) ||
    (state.type === "MovingEdgeStartPoint" && state.elementID === elementID) ||
    (state.type === "MovingEdgeEndPoint" && state.elementID === elementID) ||
    (state.type === "MovingEdgeBody" && state.elementID === elementID) ||
    (state.type === "ChangingGearRadius" && state.elementID === elementID) ||
    (state.type === "SelectingMultiple" &&
      state.elementIDs.includes(elementID)) ||
    (state.type === "SelectedMultiple" &&
      state.elementIDs.includes(elementID)) ||
    (state.type === "MovingSelectionMultiple" &&
      state.elementIDs.includes(elementID)) ||
    (state.type === "MovingConstraint" && state.elementID === elementID) ||
    (state.type === "EqualConstraintGear" && state.startGearID === elementID) ||
    (state.type === "EqualConstraintEdge" && state.startEdgeID === elementID) ||
    (state.type === "NormalConstraintEdge" &&
      state.startEdgeID === elementID) ||
    (state.type === "ParallelConstraintEdge" &&
      state.startEdgeID === elementID) ||
    (state.type === "GearRatioConstraintGear" &&
      state.startGearID === elementID) ||
    (state.type === "HorizontalVerticalConstraintNode" &&
      state.startNodeID === elementID)
  );
}

function is_erase_hovered(
  elementID: ID,
  hoveredPart: HoveredPart,
  state: CanvasState,
  constraintElements: ConstraintElement[],
): boolean {
  return (
    (hoveredPart.type !== "Void" &&
      hoveredPart.deleting &&
      (hoveredPart.id === elementID ||
        connected_constraints(hoveredPart.id, constraintElements).includes(
          elementID,
        ))) ||
    (state.type === "ErasingMultiple" &&
      [
        ...state.hoveredElementIDs,
        ...state.hoveredElementIDs
          .map((id) => connected_constraints(id, constraintElements))
          .flat(),
      ].includes(elementID))
  );
}

function is_edge_end_hovered(
  elementID: ID,
  hoveredPart: HoveredPart,
  state: CanvasState,
): boolean {
  return (
    hoveredPart.type === "Edge" &&
    hoveredPart.part !== "body" &&
    hoveredPart.id === elementID &&
    !(
      (hoveredPart.deleting && hoveredPart.id === elementID) ||
      (state.type === "ErasingMultiple" &&
        state.hoveredElementIDs.includes(elementID))
    ) &&
    ![
      "PlacingPivot",
      "PlacingSlider",
      "PlacingJoin",
      "PlacingMass",
      "PlacingBeamStart",
      "PlacingSpringStart",
      "PlacingDamperStart",
      "PlacingBeltStart",
    ].includes(state.type)
  );
}

function is_hovered(
  elementID: ID,
  hoveredPart: HoveredPart,
  state: CanvasState,
  constraintElements: ConstraintElement[],
): boolean {
  if (hoveredPart.type === "Void") return false;
  if (
    hoveredPart.id === elementID &&
    !hoveredPart.deleting &&
    !is_edge_end_hovered(elementID, hoveredPart, state)
  )
    return true;

  const constraint = constraintElements.find((el) => el.id === hoveredPart.id);
  if (!constraint) return false;

  switch (constraint.type) {
    case "horizontal-align-edge":
    case "vertical-align-edge":
      return elementID === constraint.edgeID;
    case "horizontal-align-nodes":
    case "vertical-align-nodes":
      return (
        elementID === constraint.startNodeID ||
        elementID === constraint.endNodeID
      );
    case "normal":
    case "parallel":
    case "equal":
      return (
        elementID === constraint.startEdgeID ||
        elementID === constraint.endEdgeID
      );
    case "gear-ratio":
      return (
        elementID === constraint.startGearID ||
        elementID === constraint.endGearID
      );
    default:
      return false;
  }
}

/**
 * Draw tiny pieces of edges to make them appear over some part.
 */
export function draw_edge_fake_end(
  ctx: CanvasRenderingContext2D,
  edge: EdgeElement,
  elementID: ID,
  hoveredPart: HoveredPart,
  state: CanvasState,
  constraintElements: ConstraintElement[],
  length: number,
) {
  if (is_erase_hovered(edge.id, hoveredPart, state, constraintElements)) return;

  const oldShadowBlur = ctx.shadowBlur;
  const oldGlobalAlpha = ctx.globalAlpha;
  const oldStrokeStyle = ctx.strokeStyle;
  const oldFillStyle = ctx.fillStyle;
  const oldLineWidth = ctx.lineWidth;
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  ctx.strokeStyle = COLORS.STROKE;
  ctx.fillStyle = COLORS.FILL_BODY;
  ctx.lineWidth = STROKE_WIDTHS.STANDARD;

  if (is_hovered(edge.id, hoveredPart, state, constraintElements))
    ctx.lineWidth = STROKE_WIDTHS.THICK;

  if (is_selected(edge.id, state)) {
    ctx.strokeStyle = COLORS.SELECTION_STROKE;
    ctx.fillStyle = COLORS.SELECTION_FILL;
  }

  ctx.save();
  ctx.rotate(edge.positionEnd.sub(edge.positionStart).angle());

  const start = edge.fixedNodeEndID === elementID ? 0 : 1;
  const end = edge.fixedNodeStartID === elementID ? 0 : 1;
  const sideL = DIM.BEAM_WIDTH - STROKE_WIDTHS.STANDARD + ctx.lineWidth;
  const sideS = DIM.BEAM_WIDTH - STROKE_WIDTHS.STANDARD - ctx.lineWidth;
  const C = length + DIM.SLIDER_INNER_HEIGHT / 2;
  const D = C + 0.5;
  const oldFillStyle2 = ctx.fillStyle;
  ctx.fillStyle = ctx.strokeStyle;
  ctx.fillRect(-C * end, -sideL / 2, C * (start + end), sideL);
  ctx.fillStyle = oldFillStyle2;
  ctx.fillRect(-D * end, -sideS / 2, D * (start + end), sideS);

  ctx.restore();

  ctx.shadowBlur = oldShadowBlur;
  ctx.globalAlpha = oldGlobalAlpha;
  ctx.strokeStyle = oldStrokeStyle;
  ctx.fillStyle = oldFillStyle;
  ctx.lineWidth = oldLineWidth;
}

/*
 * Dessine tous les éléments du canvas.
 */
export function drawMechanicalCanvas(
  ctx: CanvasRenderingContext2D,
  hoveredPart: HoveredPart,
  state: CanvasState,
  mechanicalElements: MechanicalElement[],
  constraintElements: ConstraintElement[],
  loads: LoadElement[] = [],
) {
  const allElements: UnionElement[] = (mechanicalElements as UnionElement[])
    .concat(constraintElements)
    .concat(loads);

  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  ctx.strokeStyle = COLORS.STROKE;
  ctx.fillStyle = COLORS.FILL_BODY;
  ctx.textAlign = DIMENSION_SPECS.TEXT_ALIGN;
  ctx.textBaseline = DIMENSION_SPECS.TEXT_BASELINE;
  for (const element of allElements.filter(
    (element) => element.type === "join",
  )) {
    if (
      (hoveredPart.type !== "Void" &&
        hoveredPart.deleting &&
        hoveredPart.id === element.id) ||
      (state.type === "ErasingMultiple" &&
        state.hoveredElementIDs.includes(element.id))
    )
      continue;
    ctx.save();
    ctx.translate(element.position.x, element.position.y);
    draw_join_bottom(ctx);
    ctx.restore();
  }

  DRAWING_ORDER.forEach((type) => {
    const elements = allElements.filter((element) => element.type === type);
    for (const element of elements) {
      const isLoadElement =
        element.type === "force" ||
        element.type === "moment" ||
        element.type === "distributed-force";
      const isSelected = is_selected(element.id, state);
      const isEraseHovered = is_erase_hovered(
        element.id,
        hoveredPart,
        state,
        constraintElements,
      );
      const isEdgeEndHovered = is_edge_end_hovered(
        element.id,
        hoveredPart,
        state,
      );
      let isHovered = is_hovered(
        element.id,
        hoveredPart,
        state,
        constraintElements,
      );

      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      ctx.filter = "none";
      ctx.strokeStyle = isLoadElement ? COLORS.ORANGE : COLORS.STROKE;
      ctx.fillStyle = isLoadElement ? COLORS.ORANGE : COLORS.FILL_BODY;
      ctx.lineWidth = STROKE_WIDTHS.STANDARD;

      // Thicken the stroke if element is hovered
      if (isHovered && !isEdgeEndHovered) ctx.lineWidth = STROKE_WIDTHS.THICK;
      // Add blue halo and blue stroke if element is selected
      if (isSelected) {
        if (isLoadElement) ctx.lineWidth += 1;
        ctx.shadowColor = isLoadElement
          ? COLORS.ORANGE
          : COLORS.SELECTION_STROKE;
        ctx.strokeStyle = isLoadElement
          ? COLORS.SELECTION_ORANGE
          : COLORS.SELECTION_STROKE;
        ctx.fillStyle = isLoadElement
          ? COLORS.SELECTION_ORANGE
          : COLORS.SELECTION_FILL;
        ctx.shadowBlur = INTERACTION_SPECS.SELECTION_HALO_SIZE;
      }
      // Add red stroke and make semi-transparent if element is to be deleted
      if (isEraseHovered) {
        ctx.strokeStyle = COLORS.DELETION_STROKE;
        ctx.globalAlpha = INTERACTION_SPECS.DELETION_OPACITY;
      }

      switch (element.type) {
        case "pivot":
        case "slider":
        case "slidep":
        case "join":
        case "mass":
          ctx.save();
          ctx.translate(element.position.x, element.position.y);
          if (element.type === "slider" && element.parentBeamID) {
            const parentBeam = get_mechanical_element_from_id(
              element.parentBeamID,
              mechanicalElements,
            ) as BeamElement;
            ctx.rotate(
              parentBeam.positionEnd.sub(parentBeam.positionStart).angle(),
            );
          }
          if (element.isGrounded) {
            if (element.type === "pivot" && element.motor) ctx.translate(0, 7);
            draw_ground(ctx);
            if (element.type === "pivot" && element.motor) ctx.translate(0, -7);
          }
          if (element.type === "slidep" && element.parentBeamID) {
            const parentBeam = get_mechanical_element_from_id(
              element.parentBeamID,
              mechanicalElements,
            ) as BeamElement;
            ctx.rotate(
              parentBeam.positionEnd.sub(parentBeam.positionStart).angle(),
            );
          }
          switch (element.type) {
            case "slider":
              if (element.fixedEdgesIDs.length > 0 && !element.parentBeamID) {
                ctx.fillStyle = COLORS.BACKGROUND;
              }
              draw_slider(
                ctx,
                Boolean(element.parentBeamID) ||
                  element.fixedEdgesIDs.length > 0,
              );
              break;
            case "pivot": {
              if (element.motor) {
                draw_motor(ctx);
                const rotatingEdges = [...element.rotatingEdgesIDs];
                rotatingEdges.filter(
                  (el) => el !== element.motor!.parentBeamID,
                );
                rotatingEdges.reverse().forEach((edgeID) => {
                  const edge = get_mechanical_element_from_id(
                    edgeID,
                    mechanicalElements,
                  ) as EdgeElement;
                  draw_edge_fake_end(
                    ctx,
                    edge,
                    element.id,
                    hoveredPart,
                    state,
                    constraintElements,
                    DIM.MOTOR_RADIUS,
                  );
                });
              }
              draw_pivot(ctx, element.rotatingEdgesIDs.length > 0);
              break;
            }
            case "slidep":
              draw_slidep_bottom(ctx);
              if (element.parentBeamID) {
                const parentBeam = get_mechanical_element_from_id(
                  element.parentBeamID,
                  mechanicalElements,
                ) as BeamElement;
                ctx.rotate(
                  -parentBeam.positionEnd.sub(parentBeam.positionStart).angle(),
                );
              }
              [...element.rotatingEdgesIDs].reverse().forEach((edgeID) => {
                const edge = get_mechanical_element_from_id(
                  edgeID,
                  mechanicalElements,
                ) as EdgeElement;
                draw_edge_fake_end(
                  ctx,
                  edge,
                  element.id,
                  hoveredPart,
                  state,
                  constraintElements,
                  DIM.SLIDEP_OUTER_WIDTH / 2,
                );
              });
              draw_pivot(
                ctx,
                Boolean(element.parentBeamID) ||
                  element.rotatingEdgesIDs.length > 0,
              );
              break;
            case "join":
              if (isHovered || isSelected || isEraseHovered) {
                draw_join(ctx);
              } else {
                draw_join_top(ctx);
              }
              break;
            case "mass":
              draw_mass(ctx);
              break;
          }
          ctx.restore();
          break;
        case "gear":
          ctx.save();
          ctx.translate(element.position.x, element.position.y);
          ctx.rotate(element.angle);
          draw_gear(ctx, element.radius);
          ctx.restore();
          break;
        case "beam":
        case "spring":
        case "damper":
          const delta = element.positionEnd.sub(element.positionStart);
          ctx.save();
          ctx.translate(element.positionStart.x, element.positionStart.y);
          ctx.rotate(delta.angle());
          switch (element.type) {
            case "beam":
              draw_beam(
                ctx,
                delta.length(),
                Boolean(element.fixedNodeStartID),
                Boolean(element.fixedNodeEndID),
              );
              break;
            case "spring":
              draw_spring(ctx, delta.length(), element.restLength);
              break;
            case "damper":
              draw_damper(ctx, delta.length(), element.restLength);
              break;
          }
          if (isEdgeEndHovered && hoveredPart.type === "Edge") {
            ctx.lineWidth = STROKE_WIDTHS.THICK;
            if (hoveredPart.part === "end") {
              ctx.translate(delta.length(), 0);
            }
            draw_hover_edge_end(ctx);
          }
          ctx.restore();
          break;
        case "belt":
          let attachedGears = element.attachedGearsIDs.map(
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
          switch (state.type) {
            case "MovingBeltBody":
              if (state.elementID !== element.id) break;
              if (hoveredPart.type === "GearTooth") {
                const gear = get_mechanical_element_from_id(
                  hoveredPart.id,
                  mechanicalElements,
                ) as GearElement;
                attachedGears.splice(state.section / 2, 0, {
                  gear,
                  direction: !is_on_left_side_of_belt(
                    hoveredPart.position,
                    element,
                    state.section,
                    mechanicalElements,
                  ),
                });
              } else {
                const newGear: GearElement = {
                  type: "gear",
                  id: "----",
                  position: hoveredPart.position,
                  angle: 0,
                  radius: INTERACTION_SPECS.BELT_GRAB_RADIUS,
                  parentAxleID: "----",
                  fixedNodesIDs: [],
                  meshedGearsIDs: [],
                  attachedBeltID: element.id,
                };
                attachedGears.splice(state.section / 2, 0, {
                  gear: newGear,
                  direction: !is_on_left_side_of_belt(
                    hoveredPart.position,
                    element,
                    state.section,
                    mechanicalElements,
                  ),
                });
              }
              break;
            case "ChangingGearRadius":
              if (hoveredPart.type !== "BeltBody") break;
              const gear = get_mechanical_element_from_id(
                state.elementID,
                mechanicalElements,
              ) as GearElement;
              attachedGears.splice(hoveredPart.section / 2, 0, {
                gear,
                direction: is_on_left_side_of_belt(
                  gear.position,
                  element,
                  hoveredPart.section,
                  mechanicalElements,
                ),
              });
              break;
            case "PlacingGearRadius":
              if (hoveredPart.type !== "BeltBody") break;
              const newGear: GearElement = {
                type: "gear",
                id: "----",
                position: state.startHover.position,
                angle: 0,
                radius: state.startHover.position.distance_to(
                  hoveredPart.position,
                ),
                parentAxleID: "----",
                fixedNodesIDs: [],
                meshedGearsIDs: [],
                attachedBeltID: element.id,
              };
              attachedGears.splice(hoveredPart.section / 2, 0, {
                gear: newGear,
                direction: is_on_left_side_of_belt(
                  state.startHover.position,
                  element,
                  hoveredPart.section,
                  mechanicalElements,
                ),
              });
              break;
          }
          const gearAngles = get_gear_angles(
            element.positionStart,
            element.positionEnd,
            attachedGears,
          );
          draw_belt(
            ctx,
            element.positionStart,
            element.positionEnd,
            gearAngles,
          );
          if (isEdgeEndHovered && hoveredPart.type === "Edge") {
            ctx.lineWidth = STROKE_WIDTHS.THICK;
            const delta =
              hoveredPart.part === "end"
                ? element.positionEnd
                : element.positionStart;
            ctx.save();
            ctx.translate(delta.x, delta.y);
            draw_hover_edge_end(ctx);
            ctx.restore();
          }
          break;
        case "dimension-edge":
          const edgeD = get_mechanical_element_from_id(
            element.edgeID,
            mechanicalElements,
          ) as EdgeElement;
          draw_dimention(
            ctx,
            edgeD.positionStart,
            edgeD.positionEnd,
            element.position,
            element.value,
            state.type === "EditingConstraint" &&
              state.elementID === element.id,
          );
          break;
        case "dimension-node-to-node":
          const startNode = get_mechanical_element_from_id(
            element.startNodeID,
            mechanicalElements,
          ) as NodeElement;
          const endNode = get_mechanical_element_from_id(
            element.endNodeID,
            mechanicalElements,
          ) as NodeElement;
          draw_dimention(
            ctx,
            startNode.position,
            endNode.position,
            element.position,
            element.value,
            state.type === "EditingConstraint" &&
              state.elementID === element.id,
          );
          break;
        case "dimension-edge-to-node":
          const edge = get_mechanical_element_from_id(
            element.edgeID,
            mechanicalElements,
          ) as EdgeElement;
          const node = get_mechanical_element_from_id(
            element.nodeID,
            mechanicalElements,
          ) as NodeElement;
          draw_dimention_to_segment(
            ctx,
            node.position,
            edge.positionStart,
            edge.positionEnd,
            element.position,
            element.value,
            state.type === "EditingConstraint" &&
              state.elementID === element.id,
          );
          break;
        case "dimension-angle":
          const startEdge = get_mechanical_element_from_id(
            element.startEdgeID,
            mechanicalElements,
          ) as EdgeElement;
          const endEdge = get_mechanical_element_from_id(
            element.endEdgeID,
            mechanicalElements,
          ) as EdgeElement;
          draw_dimention_angle(
            ctx,
            startEdge.positionStart,
            startEdge.positionEnd,
            endEdge.positionStart,
            endEdge.positionEnd,
            element.flipStart,
            element.flipEnd,
            element.position,
            element.value,
            state.type === "EditingConstraint" &&
              state.elementID === element.id,
          );
          break;
        case "dimension-radius":
          const gear = get_mechanical_element_from_id(
            element.gearID,
            mechanicalElements,
          ) as GearElement;
          draw_dimension_radius(
            ctx,
            gear.position,
            gear.radius,
            element.position,
            element.value,
            state.type === "EditingConstraint" &&
              state.elementID === element.id,
          );
          break;
        case "horizontal-align-edge":
        case "horizontal-align-nodes":
        case "vertical-align-edge":
        case "vertical-align-nodes":
        case "normal":
        case "parallel":
        case "equal":
          ctx.save();
          ctx.translate(
            Math.round(element.position.x),
            Math.round(element.position.y),
          );
          draw_element_icon(ctx, element);
          ctx.restore();
          break;
        case "force": {
          const load = element as ForceElement;
          const target = mechanicalElements.find((e) => e.id === load.targetID);
          if (!target) break;
          let base: Point2;
          if ("position" in target) {
            base = (target as NodeElement).position;
          } else {
            const edge = target as EdgeElement;
            base =
              load.anchor === "end" ? edge.positionEnd : edge.positionStart;
          }
          ctx.save();
          ctx.translate(base.x, base.y);
          draw_force(ctx, ZERO, load.vector);
          if (hoveredPart.type === "ForceTip" && hoveredPart.id === load.id) {
            ctx.translate(load.vector.x, load.vector.y);
            draw_hover_edge_end(ctx);
          }
          ctx.restore();
          break;
        }
        case "moment": {
          const load = element as MomentElement;
          const target = mechanicalElements.find((e) => e.id === load.targetID);
          if (!target) break;
          const center =
            "position" in target
              ? (target as NodeElement).position
              : (target as EdgeElement).positionStart.lerp(
                  (target as EdgeElement).positionEnd,
                  0.5,
                );
          draw_moment(ctx, center, load.value, load.clockwise);
          break;
        }
        case "distributed-force": {
          const load = element as DistributedForceElement;
          const beam = mechanicalElements.find(
            (e) => e.id === load.beamID && e.type === "beam",
          ) as BeamElement | undefined;
          if (!beam) break;
          draw_distributed_force(
            ctx,
            beam.positionStart,
            beam.positionEnd,
            load.vectorStart,
            load.vectorEnd,
          );
          if (
            hoveredPart.type === "DistributedForce" &&
            hoveredPart.id === load.id
          ) {
            const tipStart = beam.positionStart.add(load.vectorStart);
            const tipEnd = beam.positionEnd.add(load.vectorEnd);
            if (hoveredPart.part === "body") {
              ctx.beginPath();
              ctx.moveTo(tipStart.x, tipStart.y);
              ctx.lineTo(tipEnd.x, tipEnd.y);
              ctx.stroke();
            } else {
              const pos = hoveredPart.part === "start" ? tipStart : tipEnd;
              ctx.save();
              ctx.translate(pos.x, pos.y);
              draw_hover_edge_end(ctx);
              ctx.restore();
            }
          }
          break;
        }
        case "gear-ratio":
          if (
            state.type === "EditingConstraint" &&
            state.elementID === element.id
          )
            break;
          ctx.save();
          ctx.translate(element.position.x, element.position.y);
          draw_gear_ratio(ctx, element.value);
          ctx.restore();
          break;
      }
    }
  });

  // Draw probes on top of all elements
  for (const el of mechanicalElements) {
    if (!el.probes || el.probes.length === 0) continue;
    const pos =
      "position" in el
        ? (el as NodeElement).position
        : (el as EdgeElement).positionStart.lerp(
            (el as EdgeElement).positionEnd,
            0.5,
          );
    for (let i = 0; i < el.probes.length; i++) {
      const offset = new Point2(
        i * 16 - (el.probes.length - 1) * 8,
        -DIM.PROBE_OFFSET,
      );
      ctx.save();
      ctx.translate(pos.add(offset).x, pos.add(offset).y);
      draw_probe(ctx);
      ctx.restore();
    }
  }

  // Draw  state specific elements
  ctx.save();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  ctx.filter = "none";
  ctx.strokeStyle = COLORS.STROKE;
  ctx.fillStyle = COLORS.FILL_BODY;
  ctx.lineWidth = STROKE_WIDTHS.STANDARD;
  let delta: Point2;
  switch (state.type) {
    case "Selecting":
      break;
    case "SelectingMultiple":
    case "ErasingMultiple":
      ctx.translate(state.startPos.x, state.startPos.y);
      delta = hoveredPart.position.sub(state.startPos);
      ctx.strokeStyle =
        state.type === "SelectingMultiple"
          ? COLORS.SELECTION_BOX
          : COLORS.DELETION_BOX;
      ctx.lineWidth = 1;
      ctx.fillStyle = ctx.strokeStyle;
      ctx.globalAlpha = 0.2;
      ctx.fillRect(delta.x, delta.y, -delta.x, -delta.y);
      ctx.globalAlpha = 0.9;
      ctx.strokeRect(delta.x, delta.y, -delta.x, -delta.y);
      break;
    case "PlacingBeamStart":
    case "PlacingSpringStart":
    case "PlacingDamperStart":
    case "PlacingBeltStart":
    case "PlacingGearStart":
    case "PlacingPivot":
    case "PlacingSlider":
    case "PlacingJoin":
    case "PlacingMass":
    case "PlacingGround":
    case "PlacingMotor":
      ctx.translate(hoveredPart.position.x, hoveredPart.position.y);
      switch (state.type) {
        case "PlacingBeamStart":
        case "PlacingSpringStart":
        case "PlacingDamperStart":
          draw_start_edge_end(ctx);
          break;
        case "PlacingBeltStart":
          draw_belt_end(ctx);
          break;
        case "PlacingGearStart":
          draw_gear(ctx, DIM.DEFAULT_GEAR_RADIUS);
          draw_pivot(ctx, false);
          break;
        case "PlacingPivot":
          draw_pivot(ctx, false);
          break;
        case "PlacingSlider": {
          let hoveredBeam;
          if (hoveredPart.type === "Edge" && hoveredPart.part === "body") {
            hoveredBeam = mechanicalElements.find(
              (e) => e.id === hoveredPart.id,
            ) as BeamElement | undefined;
          } else if (hoveredPart.type === "Node") {
            const hoveredNode = mechanicalElements.find(
              (e) => e.id === hoveredPart.id,
            ) as NodeElement | undefined;
            if (hoveredNode) {
              hoveredBeam = node_on_beam_body(hoveredNode, mechanicalElements);
            }
          }
          if (hoveredBeam) {
            ctx.rotate(
              hoveredBeam.positionEnd.sub(hoveredBeam.positionStart).angle(),
            );
          }
          draw_slider(ctx, false);
          break;
        }
        case "PlacingJoin":
          draw_join(ctx);
          break;
        case "PlacingMass":
          draw_mass(ctx);
          break;
        case "PlacingGround":
          draw_ground(ctx);
          break;
        case "PlacingMotor":
          ctx.translate(0, 7);
          draw_ground(ctx);
          ctx.translate(0, -7);
          draw_motor(ctx);
          draw_pivot(ctx, false);
          break;
      }
      break;
    case "PlacingForceStart":
    case "PlacingForceEnd":
    case "PlacingMoment":
    case "PlacingDistributedForceStart":
    case "PlacingDistributedForceEnd":
      ctx.strokeStyle = COLORS.ORANGE;
      ctx.fillStyle = COLORS.ORANGE;
      switch (state.type) {
        case "PlacingForceStart":
          draw_force(ctx, hoveredPart.position, new Point2(0, -50));
          break;
        case "PlacingForceEnd":
          draw_force(
            ctx,
            state.startHover.position,
            hoveredPart.position.sub(state.startHover.position),
          );
          break;
        case "PlacingMoment":
          draw_moment(ctx, hoveredPart.position, 1, true);
          break;
        case "PlacingDistributedForceStart":
          if (hoveredPart.type === "Edge") {
            const hBeam = mechanicalElements.find(
              (e) => e.id === hoveredPart.id && e.type === "beam",
            ) as BeamElement | undefined;
            if (hBeam) {
              const perp = hBeam.positionEnd
                .sub(hBeam.positionStart)
                .perp()
                .normalize()
                .mul(50);
              draw_distributed_force(
                ctx,
                hBeam.positionStart,
                hBeam.positionEnd,
                perp,
                perp,
              );
            }
          } else {
            const delta = new Point2(0, 50);
            draw_distributed_force(
              ctx,
              hoveredPart.position.sub(new Point2(50, 0)),
              hoveredPart.position.add(new Point2(50, 0)),
              delta,
              delta,
              4,
            );
          }
          break;
        case "PlacingDistributedForceEnd":
          if (state.startHover.type !== "Edge") break;
          const beam = get_mechanical_element_from_id(
            state.startHover.id,
            mechanicalElements,
          ) as BeamElement;
          const delta = hoveredPart.position.sub(
            beam.positionStart.lerp(beam.positionEnd, 0.5),
          );
          draw_distributed_force(
            ctx,
            beam.positionStart,
            beam.positionEnd,
            delta,
            delta,
          );
          break;
      }
      break;
    case "PlacingBeamEnd":
    case "PlacingSpringEnd":
    case "PlacingDamperEnd":
    case "PlacingGearRadius":
      delta = hoveredPart.position.sub(state.startHover.position);
      ctx.translate(state.startHover.position.x, state.startHover.position.y);
      if (state.type !== "PlacingGearRadius") ctx.rotate(delta.angle());
      switch (state.type) {
        case "PlacingBeamEnd":
          draw_beam(ctx, delta.length());
          break;
        case "PlacingSpringEnd":
          draw_spring(ctx, delta.length());
          break;
        case "PlacingDamperEnd":
          draw_damper(ctx, delta.length());
          break;
        case "PlacingGearRadius":
          draw_gear(ctx, delta.length());
          draw_pivot(ctx, false);
          break;
      }
      break;
    case "PlacingBeltEnd":
      let attachedGears = state.attachedGearsIDs.map(({ id, direction }) => {
        return {
          gear: get_mechanical_element_from_id(
            id,
            mechanicalElements,
          ) as GearElement,
          direction,
        };
      });
      if (hoveredPart.type === "GearTooth") {
        const hoveredGear = get_mechanical_element_from_id(
          hoveredPart.id,
          mechanicalElements,
        ) as GearElement;
        const direction =
          hoveredGear.position
            .sub(
              state.attachedGearsIDs.length > 0
                ? attachedGears.slice(-1)[0].gear.position
                : state.startHover.position,
            )
            .perp()
            .dot(hoveredPart.position.sub(hoveredGear.position)) > 0;
        attachedGears.push({ gear: hoveredGear, direction });
      }
      const gearAngles = get_gear_angles(
        state.startHover.position,
        hoveredPart.position,
        attachedGears,
      );
      draw_belt(
        ctx,
        state.startHover.position,
        hoveredPart.position,
        gearAngles,
      );
      break;
    case "DimensionNode":
      const nodeD = get_mechanical_element_from_id(
        state.nodeID,
        mechanicalElements,
      ) as NodeElement;
      if (hoveredPart.type === "Edge") {
        const edge = get_mechanical_element_from_id(
          hoveredPart.id,
          mechanicalElements,
        ) as EdgeElement;
        draw_dimention_to_segment(
          ctx,
          nodeD.position,
          edge.positionStart,
          edge.positionEnd,
          hoveredPart.position,
          nodeD.position.distance_to_line(edge.positionStart, edge.positionEnd),
        );
      } else {
        draw_dimention(
          ctx,
          nodeD.position,
          hoveredPart.position,
          nodeD.position.lerp(hoveredPart.position, 0.5),
          nodeD.position.distance_to(hoveredPart.position),
        );
      }

      break;
    case "DimensionEdge":
      const edgeD = get_mechanical_element_from_id(
        state.edgeID,
        mechanicalElements,
      ) as EdgeElement;
      switch (hoveredPart.type) {
        case "Void":
          draw_dimention(
            ctx,
            edgeD.positionStart,
            edgeD.positionEnd,
            hoveredPart.position,
            edgeD.positionStart.distance_to(edgeD.positionEnd),
          );
          break;
        case "Node":
          draw_dimention_to_segment(
            ctx,
            hoveredPart.position,
            edgeD.positionStart,
            edgeD.positionEnd,
            hoveredPart.position
              .project_on_line(edgeD.positionStart, edgeD.positionEnd)
              .lerp(hoveredPart.position, 0.5),
            hoveredPart.position.distance_to_line(
              edgeD.positionStart,
              edgeD.positionEnd,
            ),
          );
          break;
        case "Edge":
          const endEdge = get_mechanical_element_from_id(
            hoveredPart.id,
            mechanicalElements,
          ) as EdgeElement;
          const intersection = Point2.lines_intersection(
            edgeD.positionStart,
            edgeD.positionEnd,
            endEdge.positionStart,
            endEdge.positionEnd,
          );
          if (!intersection) break;

          const angleConstraintQuadrant = resolve_angle_constraint_quadrant(
            edgeD.positionStart,
            edgeD.positionEnd,
            endEdge.positionStart,
            endEdge.positionEnd,
            hoveredPart.position,
          );
          if (!angleConstraintQuadrant) break;
          const { flipStart, flipEnd, angle } = angleConstraintQuadrant;

          const pos_dir = hoveredPart.position.sub(intersection);
          const position = intersection.add(
            pos_dir.slerp(
              edgeD.positionEnd
                .sub(intersection)
                .normalize()
                .mul(pos_dir.length()),
              0.5,
            ),
          );

          draw_dimention_angle(
            ctx,
            edgeD.positionStart,
            edgeD.positionEnd,
            endEdge.positionStart,
            endEdge.positionEnd,
            flipStart,
            flipEnd,
            position,
            angle,
          );
          break;
      }

      break;
    case "DimensionNodeToNode":
      const startNode = get_mechanical_element_from_id(
        state.startNodeID,
        mechanicalElements,
      ) as NodeElement;
      const endNode = get_mechanical_element_from_id(
        state.endNodeID,
        mechanicalElements,
      ) as NodeElement;
      draw_dimention(
        ctx,
        startNode.position,
        endNode.position,
        hoveredPart.position,
        startNode.position.distance_to(endNode.position),
      );
      break;
    case "DimensionEdgeToNode":
      const edge = get_mechanical_element_from_id(
        state.edgeID,
        mechanicalElements,
      ) as EdgeElement;
      const node = get_mechanical_element_from_id(
        state.nodeID,
        mechanicalElements,
      ) as NodeElement;
      draw_dimention_to_segment(
        ctx,
        node.position,
        edge.positionStart,
        edge.positionEnd,
        hoveredPart.position,
        node.position.distance_to_line(edge.positionStart, edge.positionEnd),
      );
      ctx.restore();
      break;
    case "DimensionAngle":
      const startEdge = get_mechanical_element_from_id(
        state.startEdgeID,
        mechanicalElements,
      ) as EdgeElement;
      const endEdge = get_mechanical_element_from_id(
        state.endEdgeID,
        mechanicalElements,
      ) as EdgeElement;

      const angleConstraintQuadrant = resolve_angle_constraint_quadrant(
        startEdge.positionStart,
        startEdge.positionEnd,
        endEdge.positionStart,
        endEdge.positionEnd,
        hoveredPart.position,
      );
      if (!angleConstraintQuadrant) break;
      const { flipStart, flipEnd, angle } = angleConstraintQuadrant;

      draw_dimention_angle(
        ctx,
        startEdge.positionStart,
        startEdge.positionEnd,
        endEdge.positionStart,
        endEdge.positionEnd,
        flipStart,
        flipEnd,
        hoveredPart.position,
        angle,
      );
      break;
    case "DimensionRadius":
      const gear = get_mechanical_element_from_id(
        state.gearID,
        mechanicalElements,
      ) as GearElement;
      draw_dimension_radius(
        ctx,
        gear.position,
        gear.radius,
        hoveredPart.position,
        gear.radius,
      );
      break;
    case "PlacingProbe":
      let pos = hoveredPart.position.clone();
      if (hoveredPart.type !== "Void") pos.y -= DIM.PROBE_OFFSET;
      ctx.translate(pos.x, pos.y);
      draw_probe(ctx);
      break;
  }
  ctx.restore();
}
