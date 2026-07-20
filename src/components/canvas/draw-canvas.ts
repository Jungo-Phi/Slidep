import {
  COLORS,
  DIM,
  DIMENSION_SPECS,
  DRAWING_ORDER,
  INTERACTION_SPECS,
  LOAD_SCALING,
  STROKE_WIDTHS,
} from "../../constants/rendering-specs";
import {
  BeamElement,
  BeltElement,
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
  UP,
  ZERO,
} from "../../types";
import { HoveredPart } from "../../types/hovered-part";
import { CanvasState } from "../../types/canvas-state";
import { element_refs } from "../../types/element-refs";
import {
  draw_beam,
  draw_belt,
  draw_belt_loop,
  draw_belt_open,
  BeltWinding,
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
  draw_dimension_angle,
  draw_dimension_to_segment,
  draw_dimension_radius,
  draw_dimension,
  draw_join_bottom,
  draw_join_top,
  draw_force,
  draw_moment,
  draw_distributed_force,
  draw_motor,
  draw_probe,
  draw_dimension_belt,
} from "./drawing-functions";
import { get_mechanical_element_from_id } from "../mechanism/connect-actions";
import {
  distributed_display_vectors,
  distributed_label_vector,
  frame2world,
  is_zero_load,
  force_base_position,
  force_display_vector,
  force_world_vector,
  moment_center_position,
  moment_display_radius,
  stored2world_load,
} from "../../utils/load-geom";
import {
  GHOST_LOAD_ID,
  distributed_force_from_drag,
  force_from_drag,
  moment_from_drag,
} from "./placing-loads";
import {
  get_belt_vias,
  get_gear_angles,
  belt_wrap_direction,
  measure_belt_length,
  resolve_angle_constraint_quadrant,
} from "../../utils";
import {
  connected_constraints,
  is_constraint_type,
  node_on_beam_body,
} from "./utils";

const TAU = 2 * Math.PI;

/**
 * Per-via winding spec for a belt: a pulley wound past a full turn (|wrap| ≥ 2π)
 * gets a coil growing one BELT_WIDTH per turn. It grows OUTWARD on the departure
 * side by default; on a winch (a terminal pinned to the first/last pulley) it
 * grows INWARD so the free (load) run stays on the rim and doesn't visually lean.
 * `viaWraps` is index-aligned to the belt's vias (0 for the two terminals).
 */
function belt_windings(
  viaWraps: (number | undefined)[],
  startExternal: boolean,
  endExternal: boolean,
): (BeltWinding | undefined)[] {
  const n = viaWraps.length;
  return viaWraps.map((w, v) => {
    if (w === undefined || Math.abs(w) < TAU) return undefined;
    const growth = (Math.abs(w) / TAU) * 4;
    if (startExternal && v === 1) return { growth: -growth, atStart: true };
    if (endExternal && v === n - 2) return { growth: -growth, atStart: false };
    return { growth, atStart: false };
  });
}

function is_selected(
  elementID: ID,
  state: CanvasState,
  constraintElements: ConstraintElement[],
): boolean {
  return (
    (state.type === "SelectedElement" && state.elementID === elementID) ||
    (state.type === "MovingNode" && state.elementID === elementID) ||
    (state.type === "MovingEdgeStartPoint" && state.elementID === elementID) ||
    (state.type === "MovingEdgeEndPoint" && state.elementID === elementID) ||
    (state.type === "MovingEdgeBody" && state.elementID === elementID) ||
    (state.type === "ChangingGearRadius" && state.elementID === elementID) ||
    (state.type === "MovingForce" && state.elementID === elementID) ||
    (state.type === "MovingDistributedForce" &&
      state.elementID === elementID) ||
    ((state.type === "SelectingMultiple" ||
      state.type === "SelectedMultiple" ||
      state.type === "MovingSelectionMultiple") &&
      (state.elementIDs.includes(elementID) ||
        state.elementIDs.some((id) =>
          connected_constraints(id, constraintElements).includes(elementID),
        ))) ||
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
  if (hoveredPart.type === "Void" || hoveredPart.id !== elementID) return false;
  return (
    hoveredPart.type === "Edge" &&
    hoveredPart.part !== "body" &&
    !hoveredPart.deleting &&
    !(
      state.type === "ErasingMultiple" &&
      state.hoveredElementIDs.includes(elementID)
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

/**
 * Whether a load element is hovered, optionally restricted to one of its parts.
 * Loads emphasize per part rather than as a whole: hovering a value label must
 * light up that label and the geometry, but not the element's other label.
 */
function is_load_hovered(
  elementID: ID,
  hoveredPart: HoveredPart,
  part?: "body" | "start" | "end" | "value" | "start-value" | "end-value",
): boolean {
  if (
    hoveredPart.type !== "Force" &&
    hoveredPart.type !== "Moment" &&
    hoveredPart.type !== "DistributedForce"
  )
    return false;
  if (hoveredPart.id !== elementID || hoveredPart.deleting) return false;
  return part === undefined || hoveredPart.part === part;
}

function is_hovered(
  elementID: ID,
  hoveredPart: HoveredPart,
  constraintElements: ConstraintElement[],
): boolean {
  if (hoveredPart.type === "Void") return false;
  if (hoveredPart.id === elementID && !hoveredPart.deleting) return true;

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
  ctx.strokeStyle = COLORS.ELEMENT_STROKE;
  ctx.fillStyle = COLORS.FILL_BODY;
  ctx.lineWidth = STROKE_WIDTHS.STANDARD;

  if (is_hovered(edge.id, hoveredPart, constraintElements))
    ctx.lineWidth = STROKE_WIDTHS.THICK;

  if (is_selected(edge.id, state, constraintElements)) {
    ctx.strokeStyle = COLORS.SELECTION_STROKE;
    ctx.fillStyle = COLORS.FILL_BODY;
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

/**
 * The elements that cannot be drawn, because a reference they hold names an
 * element that is not there. Drawing resolves those referents through strict
 * getters, so attempting one throws and takes the whole frame with it.
 *
 * Omitting them is a safety net, never a fix: a dangling reference is a defect
 * the validator reports and `repair_mechanism` clears at load time. What this
 * buys is that the defect costs one invisible element instead of a blank canvas.
 */
function undrawable_elements(
  allElements: UnionElement[],
  mechanicalElements: MechanicalElement[],
): Set<ID> {
  const present = new Set<ID>(mechanicalElements.map((element) => element.id));
  const undrawable = new Set<ID>();
  for (const element of allElements) {
    const dangling = element_refs(element).some((ref) => !present.has(ref.id));
    if (dangling) undrawable.add(element.id);
  }
  return undrawable;
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
  visibleConstraints: Map<ID, number> = new Map(),
  ghostConstraintIDs: Set<ID> = new Set(),
) {
  const allElements: UnionElement[] = (mechanicalElements as UnionElement[])
    .concat(constraintElements)
    .concat(loads);
  const undrawable = undrawable_elements(allElements, mechanicalElements);

  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  ctx.strokeStyle = COLORS.ELEMENT_STROKE;
  ctx.fillStyle = COLORS.FILL_BODY;
  ctx.textAlign = DIMENSION_SPECS.TEXT_ALIGN;
  ctx.textBaseline = DIMENSION_SPECS.TEXT_BASELINE;
  for (const element of allElements.filter(
    (element) => element.type === "join",
  )) {
    if (
      undrawable.has(element.id) ||
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
      if (undrawable.has(element.id)) continue;
      // Skip constraints hidden by the current context (mode / tab / hover).
      const constraintOpacity = is_constraint_type(element.type)
        ? visibleConstraints.get(element.id)
        : undefined;
      if (is_constraint_type(element.type) && constraintOpacity === undefined)
        continue;
      const isLoadElement =
        element.type === "force" ||
        element.type === "moment" ||
        element.type === "distributed-force";
      const isSelected = is_selected(element.id, state, constraintElements);
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
      const isHovered = is_hovered(element.id, hoveredPart, constraintElements);

      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      ctx.filter = "none";
      ctx.strokeStyle = isLoadElement ? COLORS.ACCENT : COLORS.ELEMENT_STROKE;
      ctx.fillStyle = isLoadElement ? COLORS.ACCENT : COLORS.FILL_BODY;
      ctx.lineWidth = STROKE_WIDTHS.STANDARD;
      if (element.type === "gear") {
        ctx.lineWidth = STROKE_WIDTHS.STANDARD / 2;
      }

      // Thicken the stroke if element is hovered. Loads are left out: they pick
      // their width per sub-part below, from loadRestWidth / loadHoverWidth.
      if (isHovered && !isEdgeEndHovered && !isLoadElement)
        ctx.lineWidth = STROKE_WIDTHS.THICK;
      // Add blue halo and blue stroke if element is selected
      if (isSelected) {
        if (isLoadElement) ctx.lineWidth += 1;
        ctx.shadowColor = isLoadElement
          ? COLORS.ACCENT
          : COLORS.SELECTION_STROKE;
        ctx.strokeStyle = isLoadElement
          ? COLORS.SELECTION_ACCENT
          : COLORS.SELECTION_STROKE;
        ctx.fillStyle = isLoadElement
          ? COLORS.SELECTION_ACCENT
          : COLORS.FILL_BODY;
        ctx.shadowBlur = INTERACTION_SPECS.SELECTION_HALO_SIZE;
      }
      // Add red stroke and make semi-transparent if element is to be deleted
      if (isEraseHovered) {
        ctx.strokeStyle = COLORS.DELETION_STROKE;
        ctx.globalAlpha = INTERACTION_SPECS.DELETION_OPACITY;
      }
      // Fade out revealed constraints at the end of their hover cooldown.
      if (constraintOpacity !== undefined) ctx.globalAlpha *= constraintOpacity;
      // Tombstone of a just-deleted constraint (undo/redo feedback).
      const isGhost = ghostConstraintIDs.has(element.id);
      if (isGhost) ctx.strokeStyle = COLORS.DELETION_STROKE;
      const hideText =
        (state.type === "EditingValue" || state.type === "PlacingValue") &&
        state.elementID === element.id;
      // Widths a load's sub-parts choose from: the element's own width when at
      // rest, the hovered width for the part under the cursor.
      const loadRestWidth = ctx.lineWidth;
      const loadHoverWidth = STROKE_WIDTHS.THICK + (isSelected ? 1 : 0);

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
          if (
            element.isGrounded &&
            !(element.type === "pivot" && element.motor)
          ) {
            draw_ground(ctx);
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
                draw_motor(ctx, element.isGrounded);
                const rotatingEdges = [...element.rotatingEdgesIDs];
                rotatingEdges.filter(
                  (el) => el !== element.motor!.parentBeamID,
                );
                rotatingEdges.reverse().forEach((edgeID) => {
                  const edge = get_mechanical_element_from_id(
                    edgeID,
                    mechanicalElements,
                  );
                  if (!("positionStart" in edge)) return;
                  draw_edge_fake_end(
                    ctx,
                    edge as EdgeElement,
                    element.id,
                    hoveredPart,
                    state,
                    constraintElements,
                    DIM.MOTOR_RADIUS + DIM.MOTOR_CORNER_RADIUS + 1,
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
                );
                // rotatingEdgesIDs may also reference a pinned gear — skip it.
                if (!("positionStart" in edge)) return;
                draw_edge_fake_end(
                  ctx,
                  edge as EdgeElement,
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
          // Pulleys that lost belt contact during simulation are drawn as if the
          // belt ran straight past them (skipped from the path).
          const disconnectedGears = new Set(
            element.disconnectedGearIndices ?? [],
          );
          const attachedGears = element.attachedGearsIDs
            .map(({ id, direction }) => {
              return {
                gear: get_mechanical_element_from_id(
                  id,
                  mechanicalElements,
                ) as GearElement,
                direction,
              };
            })
            .filter((_, i) => !disconnectedGears.has(i));
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
                  direction: belt_wrap_direction(
                    gear.position,
                    element,
                    state.section,
                    mechanicalElements,
                    "belt-onto-gear",
                  ),
                });
              } else {
                const newGear: GearElement = {
                  type: "gear",
                  id: "----",
                  probes: [],
                  overlays: {},
                  position: hoveredPart.position,
                  angle: 0,
                  radius: INTERACTION_SPECS.BELT_GRAB_RADIUS,
                  parentAxleID: "----",
                  fixedNodesBodyIDs: [],
                  meshedGearsIDs: [],
                  attachedBeltID: element.id,
                };
                attachedGears.splice(state.section / 2, 0, {
                  gear: newGear,
                  direction: belt_wrap_direction(
                    newGear.position,
                    element,
                    state.section,
                    mechanicalElements,
                    "belt-onto-gear",
                  ),
                });
              }
              break;
            case "ChangingGearRadius":
              if (
                hoveredPart.type !== "BeltBody" ||
                hoveredPart.id !== element.id
              )
                break;
              const gear = get_mechanical_element_from_id(
                state.elementID,
                mechanicalElements,
              ) as GearElement;
              attachedGears.splice(hoveredPart.section / 2, 0, {
                gear,
                direction: belt_wrap_direction(
                  gear.position,
                  element,
                  hoveredPart.section,
                  mechanicalElements,
                  "gear-onto-belt",
                ),
              });
              break;
            case "PlacingGearRadius":
              if (
                hoveredPart.type !== "BeltBody" ||
                hoveredPart.id !== element.id
              )
                break;
              const newGear: GearElement = {
                type: "gear",
                id: "----",
                probes: [],
                overlays: {},
                position: state.startHover.position,
                angle: 0,
                radius: state.startHover.position.distance_to(
                  hoveredPart.position,
                ),
                parentAxleID: "----",
                fixedNodesBodyIDs: [],
                meshedGearsIDs: [],
                attachedBeltID: element.id,
              };
              attachedGears.splice(hoveredPart.section / 2, 0, {
                gear: newGear,
                direction: belt_wrap_direction(
                  newGear.position,
                  element,
                  hoveredPart.section,
                  mechanicalElements,
                  "gear-onto-belt",
                ),
              });
              break;
          }
          if (element.tight && attachedGears.length > 0) {
            // Tight belt: continuous closed loop around the pulleys, drawn
            // independently of the junction position (no free ends). In
            // simulation, pass the tracked continuous wraps (filtered to the
            // still-connected gears, same as attachedGears) so a pulley about to
            // disconnect is drawn straight-past, not wrapped a full turn.
            const loopWraps = element.gearWraps
              ? element.gearWraps.filter((_, i) => !disconnectedGears.has(i))
              : undefined;
            draw_belt_loop(
              ctx,
              attachedGears.map(({ gear, direction }) => ({
                pos: gear.position,
                radius: gear.radius,
                direction,
              })),
              loopWraps,
              // A tight loop has no terminals, so any wound pulley coils outward.
              loopWraps ? belt_windings(loopWraps, false, false) : undefined,
            );
          } else {
            // Loose belt: open path (start terminal → gears → end terminal). In
            // simulation, pass the tracked continuous wraps (filtered to the
            // still-connected gears) so a pulley about to disconnect is drawn
            // straight-past, not wrapped a full turn.
            const openWraps = element.gearWraps
              ? element.gearWraps.filter((_, i) => !disconnectedGears.has(i))
              : undefined;
            const vias = [
              { pos: element.positionStart, radius: 0, direction: false },
              ...attachedGears.map(({ gear, direction }) => ({
                pos: gear.position,
                radius: gear.radius,
                direction,
              })),
              { pos: element.positionEnd, radius: 0, direction: false },
            ];
            // A terminal pinned onto its adjacent pulley (winch) makes that
            // pulley coil inward so the free run stays on the rim.
            const startExternal =
              !!element.fixedNodeStartID &&
              attachedGears.length > 0 &&
              attachedGears[0].gear.fixedNodesBodyIDs.includes(
                element.fixedNodeStartID,
              );
            const endExternal =
              !!element.fixedNodeEndID &&
              attachedGears.length > 0 &&
              attachedGears[
                attachedGears.length - 1
              ].gear.fixedNodesBodyIDs.includes(element.fixedNodeEndID);
            const viaWraps = openWraps ? [0, ...openWraps, 0] : undefined;
            draw_belt_open(
              ctx,
              vias,
              viaWraps,
              viaWraps
                ? belt_windings(viaWraps, startExternal, endExternal)
                : undefined,
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
          }
          break;
        case "dimension-edge":
          const edgeD = get_mechanical_element_from_id(
            element.edgeID,
            mechanicalElements,
          ) as EdgeElement;
          draw_dimension(
            ctx,
            edgeD.positionStart,
            edgeD.positionEnd,
            element.position,
            element.value,
            hideText,
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
          draw_dimension(
            ctx,
            startNode.position,
            endNode.position,
            element.position,
            element.value,
            hideText,
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
          draw_dimension_to_segment(
            ctx,
            node.position,
            edge.positionStart,
            edge.positionEnd,
            element.position,
            element.value,
            hideText,
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
          draw_dimension_angle(
            ctx,
            startEdge.positionStart,
            startEdge.positionEnd,
            endEdge.positionStart,
            endEdge.positionEnd,
            element.flipStart,
            element.flipEnd,
            element.position,
            element.value,
            hideText,
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
            hideText,
          );
          break;
        case "dimension-belt":
          const belt = get_mechanical_element_from_id(
            element.beltID,
            mechanicalElements,
          ) as BeltElement;
          const allVias = get_belt_vias(belt, mechanicalElements);
          const vias = belt.tight ? allVias.slice(1, -1) : allVias;
          draw_dimension_belt(
            ctx,
            vias,
            belt.tight,
            element.position,
            element.value,
            hideText,
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
          draw_element_icon(ctx, element, isGhost);
          ctx.restore();
          break;
        case "force": {
          const force = element as ForceElement;
          const base = force_base_position(force, mechanicalElements);
          if (!base) break;
          const displayVector = force_display_vector(
            force_world_vector(force, mechanicalElements),
          );
          ctx.save();
          ctx.translate(base.x, base.y);
          ctx.lineWidth = is_load_hovered(force.id, hoveredPart)
            ? loadHoverWidth
            : loadRestWidth;
          draw_force(
            ctx,
            ZERO,
            displayVector,
            force.vector.length(),
            hideText,
            is_load_hovered(force.id, hoveredPart, "value")
              ? loadHoverWidth
              : loadRestWidth,
          );
          // Hovering the arrow reveals the tip handle it would drag.
          if (is_load_hovered(force.id, hoveredPart, "body")) {
            ctx.translate(displayVector.x, displayVector.y);
            draw_hover_edge_end(ctx);
          }
          ctx.restore();
          break;
        }
        case "moment": {
          const load = element as MomentElement;
          const center = moment_center_position(load, mechanicalElements);
          ctx.lineWidth = is_load_hovered(load.id, hoveredPart)
            ? loadHoverWidth
            : loadRestWidth;
          draw_moment(
            ctx,
            center,
            moment_display_radius(load.value),
            load.value,
            hideText,
            is_load_hovered(load.id, hoveredPart, "value")
              ? loadHoverWidth
              : loadRestWidth,
          );
          break;
        }
        case "distributed-force": {
          const distributedForce = element as DistributedForceElement;
          const beam = mechanicalElements.find(
            (e) => e.id === distributedForce.targetID && e.type === "beam",
          ) as BeamElement | undefined;
          if (!beam) break;
          const { displayStart, displayEnd } = distributed_display_vectors(
            distributedForce,
            mechanicalElements,
          );
          const id = distributedForce.id;
          const direction = frame2world(
            distributedForce.direction,
            distributedForce.frame,
            mechanicalElements,
          );
          ctx.lineWidth = is_load_hovered(id, hoveredPart)
            ? loadHoverWidth
            : loadRestWidth;
          draw_distributed_force(
            ctx,
            beam.positionStart,
            beam.positionEnd,
            displayStart,
            displayEnd,
            is_load_hovered(id, hoveredPart, "body")
              ? loadHoverWidth
              : loadRestWidth,
          );
          // The values are written unsigned: the arrows already say which side
          // of the beam the load pushes on, and a load dragged across its beam
          // must not start reading as negative. An end carrying nothing writes
          // nothing — a "0" floating by the beam is noise, and the arrow
          // running out to a point already says it.
          draw_force(
            ctx,
            beam.positionStart,
            displayStart,
            Math.abs(distributedForce.magnitudeStart),
            hideText || is_zero_load(distributedForce.magnitudeStart),
            is_load_hovered(id, hoveredPart, "start-value")
              ? loadHoverWidth
              : loadRestWidth,
            distributed_label_vector(displayStart, direction),
          );
          draw_force(
            ctx,
            beam.positionEnd,
            displayEnd,
            Math.abs(distributedForce.magnitudeEnd),
            hideText || is_zero_load(distributedForce.magnitudeEnd),
            is_load_hovered(id, hoveredPart, "end-value")
              ? loadHoverWidth
              : loadRestWidth,
            distributed_label_vector(displayEnd, direction),
          );
          const startTip = beam.positionStart.add(displayStart);
          const endTip = beam.positionEnd.add(displayEnd);
          if (
            is_load_hovered(id, hoveredPart, "start") ||
            is_load_hovered(id, hoveredPart, "end")
          ) {
            const pos = is_load_hovered(id, hoveredPart, "start")
              ? startTip
              : endTip;
            ctx.save();
            ctx.translate(pos.x, pos.y);
            draw_hover_edge_end(ctx);
            ctx.restore();
          }
          break;
        }
        case "gear-ratio":
          if (hideText) break;
          draw_gear_ratio(ctx, element.position, element.value);
          break;
      }
    }
  });

  // Draw probes on top of all elements (one indicator per probed element)
  // globalAlpha may still hold the last constraint's fade-out opacity here.
  ctx.globalAlpha = 1;
  for (const el of mechanicalElements) {
    if (!el.probes || el.probes.length === 0) continue;
    const pos =
      "position" in el
        ? (el as NodeElement).position
        : (el as EdgeElement).positionStart.lerp(
            (el as EdgeElement).positionEnd,
            0.5,
          );
    ctx.save();
    ctx.translate(pos.x, pos.y - DIM.PROBE_OFFSET);
    draw_probe(ctx);
    ctx.restore();
  }

  // Draw  state specific elements
  ctx.save();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  ctx.filter = "none";
  ctx.strokeStyle = COLORS.ELEMENT_STROKE;
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
          draw_motor(ctx, true);
          draw_pivot(ctx, false);
          break;
      }
      break;
    case "PlacingForceStart":
    case "PlacingForceEnd":
    case "PlacingDistributedForce":
    case "PlacingMomentStart":
    case "PlacingMomentEnd":
      ctx.strokeStyle = COLORS.ACCENT;
      ctx.fillStyle = COLORS.ACCENT;
      switch (state.type) {
        case "PlacingForceStart":
          const force_length = stored2world_load(LOAD_SCALING.REF_VALUE);
          if (hoveredPart.type === "Edge" && hoveredPart.part === "body") {
            const beam = get_mechanical_element_from_id(
              hoveredPart.id,
              mechanicalElements,
            ) as BeamElement;
            const delta = beam.positionEnd
              .sub(beam.positionStart)
              .perp()
              .scale2length(force_length);
            draw_distributed_force(
              ctx,
              beam.positionStart,
              beam.positionEnd,
              delta,
              delta,
            );
            draw_force(ctx, beam.positionStart, delta, LOAD_SCALING.REF_VALUE);
            draw_force(ctx, beam.positionEnd, delta, LOAD_SCALING.REF_VALUE);
            break;
          }
          draw_force(
            ctx,
            hoveredPart.position,
            UP.mul(force_length),
            LOAD_SCALING.REF_VALUE,
          );
          break;
        case "PlacingForceEnd": {
          const force = force_from_drag(
            GHOST_LOAD_ID,
            state.startHover,
            hoveredPart.position,
            mechanicalElements,
          );
          if (!force) break;
          draw_force(
            ctx,
            force_base_position(force, mechanicalElements),
            force_display_vector(force_world_vector(force, mechanicalElements)),
            force.vector.length(),
          );
          break;
        }
        case "PlacingDistributedForce": {
          const load = distributed_force_from_drag(
            GHOST_LOAD_ID,
            state.startHover,
            hoveredPart.position,
            mechanicalElements,
          );
          if (!load) break;
          const beam = get_mechanical_element_from_id(
            load.targetID,
            mechanicalElements,
          ) as BeamElement;
          const { displayStart, displayEnd } = distributed_display_vectors(
            load,
            mechanicalElements,
          );
          draw_distributed_force(
            ctx,
            beam.positionStart,
            beam.positionEnd,
            displayStart,
            displayEnd,
          );
          draw_force(
            ctx,
            beam.positionStart,
            displayStart,
            Math.abs(load.magnitudeStart),
          );
          draw_force(
            ctx,
            beam.positionEnd,
            displayEnd,
            Math.abs(load.magnitudeEnd),
          );
          break;
        }
        case "PlacingMomentStart": {
          draw_moment(
            ctx,
            hoveredPart.position,
            moment_display_radius(LOAD_SCALING.REF_VALUE),
            LOAD_SCALING.REF_VALUE,
          );
          break;
        }
        case "PlacingMomentEnd": {
          const moment = moment_from_drag(
            GHOST_LOAD_ID,
            state.startHover,
            hoveredPart.position,
            mechanicalElements,
          );
          if (!moment) break;
          draw_moment(
            ctx,
            moment_center_position(moment, mechanicalElements),
            moment_display_radius(moment.value),
            moment.value,
          );
          break;
        }
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
      if (
        state.startHover.type === "GearTooth" &&
        attachedGears.length === 0 &&
        !(
          hoveredPart.type === "GearTooth" &&
          hoveredPart.id === state.startHover.id
        )
      ) {
        const hoveredGear = get_mechanical_element_from_id(
          state.startHover.id,
          mechanicalElements,
        ) as GearElement;
        const direction =
          hoveredGear.position
            .sub(state.startHover.position)
            .perp()
            .dot(hoveredPart.position.sub(hoveredGear.position)) > 0;
        attachedGears = [{ gear: hoveredGear, direction }];
      }
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
        draw_dimension_to_segment(
          ctx,
          nodeD.position,
          edge.positionStart,
          edge.positionEnd,
          hoveredPart.position,
          nodeD.position.distance2line(edge.positionStart, edge.positionEnd),
        );
      } else {
        draw_dimension(
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
          draw_dimension(
            ctx,
            edgeD.positionStart,
            edgeD.positionEnd,
            hoveredPart.position,
            edgeD.positionStart.distance_to(edgeD.positionEnd),
          );
          break;
        case "Node":
          draw_dimension_to_segment(
            ctx,
            hoveredPart.position,
            edgeD.positionStart,
            edgeD.positionEnd,
            hoveredPart.position
              .project_on_line(edgeD.positionStart, edgeD.positionEnd)
              .lerp(hoveredPart.position, 0.5),
            hoveredPart.position.distance2line(
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

          draw_dimension_angle(
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
      draw_dimension(
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
      draw_dimension_to_segment(
        ctx,
        node.position,
        edge.positionStart,
        edge.positionEnd,
        hoveredPart.position,
        node.position.distance2line(edge.positionStart, edge.positionEnd),
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

      draw_dimension_angle(
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
    case "DimensionBelt":
      const belt = get_mechanical_element_from_id(
        state.beltID,
        mechanicalElements,
      ) as BeltElement;
      const allVias = get_belt_vias(belt, mechanicalElements);
      const vias = belt.tight ? allVias.slice(1, -1) : allVias;
      draw_dimension_belt(
        ctx,
        vias,
        belt.tight,
        hoveredPart.position,
        measure_belt_length(belt, mechanicalElements),
      );
      break;
    case "PlacingProbe":
      const pos = hoveredPart.position.clone();
      if (hoveredPart.type !== "Void") pos.y -= DIM.PROBE_OFFSET;
      ctx.translate(pos.x, pos.y);
      draw_probe(ctx);
      break;
    case "PlacingProbeMetrics":
      // Metric popover open: keep showing the probe on the clicked element
      ctx.translate(state.position.x, state.position.y - DIM.PROBE_OFFSET);
      draw_probe(ctx);
      break;
  }
  ctx.restore();
}
