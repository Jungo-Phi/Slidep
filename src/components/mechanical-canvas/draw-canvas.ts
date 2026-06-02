import {
  COLORS,
  DIM,
  DRAWING_ORDER,
  INTERACTION_SPECS,
  STROKE_WIDTHS,
} from "../../constants/rendering-specs";
import {
  BeamElement,
  ConstraintElement,
  EdgeElement,
  GearElement,
  MechanicalElement,
  NodeElement,
  Point2,
  UnionElement,
} from "../../types";
import { HoveredPart } from "../../types/hovered-part";
import { CanvasState } from "../../types/canvas-state";
import {
  draw_beam,
  draw_belt,
  draw_hover_edge_end,
  draw_damper,
  draw_gear,
  draw_grid,
  draw_ground,
  draw_join,
  draw_mass,
  draw_pivot,
  draw_slidep,
  draw_slider,
  draw_spring,
  draw_start_edge_end,
  draw_belt_end,
  draw_dimention_parallel,
  draw_element_icon,
  draw_gear_ratio,
  draw_dimention_angle,
  draw_dimention_to_segment,
  draw_dimention_radius,
  draw_dimention,
  draw_dimention_text,
  draw_join_bottom,
  draw_join_top,
} from "./drawing-functions";
import { get_mechanical_element_from_id } from "./connect-actions";
import {
  get_gear_angles,
  is_on_left_side_of_belt,
} from "../../utils/belt-geom";
import { connected_constraints, node_on_beam_body } from "./utils";

/*
 * Dessine tous les éléments du canvas.
 */
export function drawMechanicalCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  hoveredPart: HoveredPart,
  state: CanvasState,
  mechanicalElements: MechanicalElement[],
  constraintElements: ConstraintElement[],
) {
  // Efface le canvas
  ctx.clearRect(0, 0, width, height);

  // Dessine la grille
  draw_grid(ctx, width, height);

  //const viewport = currentMechanism?.viewport;
  //const zoom = 1; //viewport?.zoom || 1;
  //const panX = 0; //viewport?.panX || 0;
  //const panY = 0; //viewport?.panY || 0;

  //ctx.save();
  //ctx.translate(panX, panY);
  //ctx.scale(zoom, zoom);

  const allElements: UnionElement[] = (
    mechanicalElements as UnionElement[]
  ).concat(constraintElements);

  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  ctx.strokeStyle = COLORS.STROKE;
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
      const isSelected =
        (state.type === "SelectedElement" && state.elementID === element.id) ||
        (state.type === "MovingNode" && state.elementID === element.id) ||
        (state.type === "MovingEdgeStartPoint" &&
          state.elementID === element.id) ||
        (state.type === "MovingEdgeEndPoint" &&
          state.elementID === element.id) ||
        (state.type === "MovingEdgeBody" && state.elementID === element.id) ||
        (state.type === "ChangingGearRadius" &&
          state.elementID === element.id) ||
        (state.type === "SelectingMultiple" &&
          state.elementIDs.includes(element.id)) ||
        (state.type === "SelectedMultiple" &&
          state.elementIDs.includes(element.id)) ||
        (state.type === "MovingSelectionMultiple" &&
          state.elementIDs.includes(element.id)) ||
        (state.type === "EqualConstraintGear" &&
          state.startGearID === element.id) ||
        (state.type === "EqualConstraintEdge" &&
          state.startEdgeID === element.id) ||
        (state.type === "NormalConstraintEdge" &&
          state.startEdgeID === element.id) ||
        (state.type === "ParallelConstraintEdge" &&
          state.startEdgeID === element.id) ||
        (state.type === "GearRatioConstraintGear" &&
          state.startGearID === element.id) ||
        (state.type === "HorizontalVerticalConstraintNode" &&
          state.startNodeID === element.id);
      const isEraseHovered =
        (hoveredPart.type !== "Void" &&
          hoveredPart.deleting &&
          (hoveredPart.id === element.id ||
            connected_constraints(hoveredPart.id, constraintElements).includes(
              element.id,
            ))) ||
        (state.type === "ErasingMultiple" &&
          [
            ...state.hoveredElementIDs,
            ...state.hoveredElementIDs
              .map((id) => connected_constraints(id, constraintElements))
              .flat(),
          ].includes(element.id));
      const isEdgeEndHovered =
        hoveredPart.type === "Edge" &&
        hoveredPart.part !== "body" &&
        hoveredPart.id === element.id &&
        !isEraseHovered &&
        ![
          "PlacingPivot",
          "PlacingSlider",
          "PlacingJoin",
          "PlacingMass",
          "PlacingBeamStart",
          "PlacingSpringStart",
          "PlacingDamperStart",
          "PlacingBeltStart",
        ].includes(state.type);

      let isHovered =
        hoveredPart.type !== "Void" &&
        hoveredPart.id === element.id &&
        !hoveredPart.deleting &&
        !isEdgeEndHovered;
      if (hoveredPart.type !== "Void") {
        const constraint = constraintElements.find(
          (element) => element.id === hoveredPart.id,
        );
        if (constraint) {
          switch (constraint.type) {
            case "horizontal-align-edge":
            case "vertical-align-edge":
              if (element.id === constraint.edgeID) isHovered = true;
              break;
            case "horizontal-align-nodes":
            case "vertical-align-nodes":
              if (
                element.id === constraint.startNodeID ||
                element.id === constraint.endNodeID
              )
                isHovered = true;
              break;
            case "normal":
            case "parallel":
            case "equal":
              if (
                element.id === constraint.startEdgeID ||
                element.id === constraint.endEdgeID
              )
                isHovered = true;
              break;
            case "gear-ratio":
              if (
                element.id === constraint.startGearID ||
                element.id === constraint.endGearID
              )
                isHovered = true;
              break;
          }
        }
      }

      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      ctx.filter = "none";
      ctx.strokeStyle = COLORS.STROKE;
      ctx.fillStyle = COLORS.FILL_BODY;
      ctx.lineWidth = STROKE_WIDTHS.STANDARD;
      if (isHovered && !isEdgeEndHovered) ctx.lineWidth = STROKE_WIDTHS.THICK;

      if (isSelected) {
        // Add blue halo and blue stroke if element is selected/moving
        ctx.shadowColor = COLORS.SELECTION_STROKE;
        ctx.strokeStyle = COLORS.SELECTION_STROKE;
        ctx.fillStyle = COLORS.FILL_NODE;
        ctx.shadowBlur = INTERACTION_SPECS.SELECTION_HALO_SIZE;
      }
      if (isEraseHovered) {
        // Add red stroke and make semi-transparent if element is hovered for deletion
        ctx.strokeStyle = COLORS.DELETION_STROKE;
        ctx.globalAlpha = INTERACTION_SPECS.DELETION_OPACITY;
      }

      switch (element.type) {
        case "pivot":
        case "slider":
        case "slidep":
        case "join":
        case "gear":
        case "mass":
          ctx.save();
          ctx.translate(element.position.x, element.position.y);
          if ("parentBeamID" in element && element.parentBeamID) {
            // slider & slidep
            const parentBeam = get_mechanical_element_from_id(
              element.parentBeamID,
              mechanicalElements,
            ) as BeamElement;
            ctx.rotate(
              parentBeam.positionStart.angle_to(parentBeam.positionEnd),
            );
          }
          if (element.isGrounded && element.type !== "gear") {
            draw_ground(ctx);
          }
          switch (element.type) {
            case "slider":
              draw_slider(ctx);
              break;
            case "pivot":
              draw_pivot(ctx, element.rotatingEdgesIDs.length > 0);
              break;
            case "slidep":
              draw_slidep(ctx, element.rotatingEdgesIDs.length > 0);
              break;
            case "join":
              if (isHovered || isSelected || isEraseHovered) {
                draw_join(ctx);
              } else {
                draw_join_top(ctx);
              }
              break;
            case "gear":
              if (
                hoveredPart.type === "Node" &&
                hoveredPart.id === element.id
              ) {
                ctx.lineWidth = STROKE_WIDTHS.STANDARD;
              }
              draw_gear(ctx, element.radius);
              if (
                hoveredPart.type === "Node" &&
                hoveredPart.id === element.id
              ) {
                ctx.lineWidth = STROKE_WIDTHS.THICK;
              } else {
                ctx.lineWidth = STROKE_WIDTHS.STANDARD;
              }
              if (element.isGrounded) {
                draw_ground(ctx);
              }
              draw_pivot(
                ctx,
                element.rotatingEdgesIDs.length > 0 ||
                  element.fixedEdgesIDs.length > 0,
              );
              break;
            case "mass":
              draw_mass(ctx);
              break;
          }
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
              draw_spring(ctx, delta.length());
              break;
            case "damper":
              draw_damper(ctx, delta.length());
              break;
          }
          if (isEdgeEndHovered) {
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
                  id: 0,
                  position: hoveredPart.position,
                  isGrounded: false,
                  radius: INTERACTION_SPECS.BELT_GRAB_RADIUS,
                  fixedEdgesIDs: [],
                  rotatingEdgesIDs: [],
                  meshedGearsIDs: [],
                  fixedGearsIDs: [],
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
                id: 0,
                position: state.startHover.position,
                isGrounded: false,
                radius: state.startHover.position.distance_to(
                  hoveredPart.position,
                ),
                fixedEdgesIDs: [],
                rotatingEdgesIDs: [],
                meshedGearsIDs: [],
                fixedGearsIDs: [],
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
          if (isEdgeEndHovered) {
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
          draw_dimention_parallel(
            ctx,
            edgeD.positionStart,
            edgeD.positionEnd,
            element.position,
            element.value,
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
          draw_dimention_parallel(
            ctx,
            startNode.position,
            endNode.position,
            element.position,
            element.value,
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
            element.position,
            element.value,
          );
          break;
        case "dimension-radius":
          const gear = get_mechanical_element_from_id(
            element.gearID,
            mechanicalElements,
          ) as GearElement;
          draw_dimention_radius(
            ctx,
            gear.position,
            gear.radius,
            element.position,
            element.value,
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
        case "gear-ratio":
          ctx.save();
          ctx.translate(element.position.x, element.position.y);
          draw_gear_ratio(ctx, element.value);
          ctx.restore();
          break;
      }
    }
  });

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
        case "PlacingSlider":
          let hoveredBeam;
          if (hoveredPart.type === "Edge" && hoveredPart.part === "body") {
            hoveredBeam = get_mechanical_element_from_id(
              hoveredPart.id,
              mechanicalElements,
            ) as BeamElement;
          } else if (hoveredPart.type === "Node") {
            hoveredBeam = node_on_beam_body(
              get_mechanical_element_from_id(
                hoveredPart.id,
                mechanicalElements,
              ) as NodeElement,
              mechanicalElements,
            );
          }
          if (hoveredBeam) {
            ctx.rotate(
              hoveredBeam.positionStart.angle_to(hoveredBeam.positionEnd),
            );
          }
          draw_slider(ctx);
          break;
        case "PlacingJoin":
          draw_join(ctx);
          break;
        case "PlacingMass":
          draw_mass(ctx);
          break;
        case "PlacingGround":
          draw_ground(ctx);
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
        draw_dimention(ctx, nodeD.position, hoveredPart.position);
        draw_dimention_text(
          ctx,
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
          draw_dimention_parallel(
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
          const cross = Point2.lines_intersection(
            edgeD.positionStart,
            edgeD.positionEnd,
            endEdge.positionStart,
            endEdge.positionEnd,
          );
          draw_dimention_angle(
            ctx,
            edgeD.positionStart,
            edgeD.positionEnd,
            endEdge.positionStart,
            endEdge.positionEnd,
            cross.add(
              hoveredPart.position
                .sub(cross)
                .slerp(
                  edgeD.positionEnd
                    .sub(cross)
                    .normalize()
                    .mul(hoveredPart.position.distance_to(cross)),
                  0.25,
                ), // TODO
            ),
            edgeD.positionEnd
              .sub(edgeD.positionStart)
              .angle_to_deg(endEdge.positionEnd.sub(endEdge.positionStart)),
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
      draw_dimention_parallel(
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
      draw_dimention_angle(
        ctx,
        startEdge.positionStart,
        startEdge.positionEnd,
        endEdge.positionStart,
        endEdge.positionEnd,
        hoveredPart.position,
        startEdge.positionEnd
          .sub(startEdge.positionStart)
          .angle_to_deg(endEdge.positionEnd.sub(endEdge.positionStart)),
      );
      break;
    case "DimensionRadius":
      const gear = get_mechanical_element_from_id(
        state.gearID,
        mechanicalElements,
      ) as GearElement;
      draw_dimention_radius(
        ctx,
        gear.position,
        gear.radius,
        hoveredPart.position,
        gear.radius,
      );
      break;
    case "HorizontalVerticalConstraintNode":
    case "NormalConstraintEdge":
    case "ParallelConstraintEdge":
    case "EqualConstraintEdge":
    case "EqualConstraintGear":
    case "GearRatioConstraintGear":
      // TODO : show start element selected
      break;
    case "EditingConstraint":
      // TODO
      break;
  }
  ctx.restore();
}
