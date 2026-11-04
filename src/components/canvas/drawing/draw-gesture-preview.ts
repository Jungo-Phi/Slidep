import { COLORS } from "../../../theme/canvas-theme";
import { LOAD_SCALING, MOMENT_SCALING } from "../../../constants/physics-display-specs";
import { DIM, STROKE_WIDTHS } from "../../../constants/rendering-specs";
import {
  BeamElement,
  BeltElement,
  EdgeElement,
  GearElement,
  MechanicalElement,
  NodeElement,
  Point2,
  ScreenPoint,
  DOWN,
  ViewportState,
} from "../../../types";
import { HoveredPart, is_hovered } from "../../../types/hovered-part";
import { CanvasState } from "../../../types/canvas-state";
import {
  draw_beam,
  draw_belt_loop,
  draw_belt_open,
  draw_damper,
  draw_gear,
  draw_ground,
  draw_join,
  draw_mass,
  draw_pivot,
  draw_slider,
  draw_spring,
  draw_start_edge_end,
  draw_belt_end,
  draw_dimension_angle,
  draw_dimension_to_segment,
  draw_dimension_radius,
  draw_dimension,
  draw_force,
  draw_moment,
  draw_distributed_force,
  draw_motor,
  draw_probe,
  draw_dimension_belt,
  draw_hover_circle,
} from "./drawing-functions";
import { gear_on_run } from "../tools/gear-on-run";
import { spring_coil_pitch } from "./coil-pitch";
import { get_mechanical_element_from_id } from "../../mechanism/connect-actions";
import {
  distributed_screen_geometry,
  force_screen_geometry,
  moment_screen_geometry,
} from "../../../utils/load-geom";
import {
  stored2screen_load,
  stored2screen_moment,
} from "../../../utils/load-scale";
import {
  GHOST_LOAD_ID,
  distributed_force_from_drag,
  force_from_drag,
  moment_from_drag,
} from "../tools/placing-loads";
import {
  belt_wrap_arriving,
  get_belt_vias,
  measure_belt_length,
  resolve_angle_constraint_quadrant,
  world2screen,
  world2screen_angle,
  world2screen_length,
  world2screen_vec,
} from "../../../utils";
import {
  attached_gears_with_start,
  axle_under,
} from "../tools/placing-element-actions";
import { node_on_beam_body, probe_badge_position } from "../utils";
import {
  belt_windings,
  screen_vias,
  open_belt_vias,
  draw_belt_closure_marks,
} from "./belt-vias";
import { belt_wraps, type BeltVia } from "../../../utils/belt-path";
import { terminal_pulley } from "../../mechanism/connection-rules";
import { FORCE, LOAD_INTENSITY } from "../../../utils/quantity-format";

/**
 * What `draw_gesture_preview` needs of a frame: the camera and the current tool gesture, nothing about the mechanism's own drawing state (selection, hover feedback, hidden layers...) — that all belongs to `draw_mechanism` alone.
 */
export type GesturePreviewDrawing = {
  viewport: ViewportState;
  hoveredPart: HoveredPart;
  state: CanvasState;
  mechanicalElements: MechanicalElement[];
  dimensionSnapped?: boolean;
};

/** The probe the armed tool would drop here, riding above whatever the cursor names. */
function draw_probe_under_cursor(
  ctx: CanvasRenderingContext2D,
  hoveredPart: HoveredPart,
  viewport: ViewportState,
) {
  const position = hoveredPart.position.clone();
  if (hoveredPart.type !== "Void")
    position.y += DIM.PROBE_OFFSET / viewport.scale;
  ctx.strokeStyle = COLORS.ACCENT;
  ctx.lineWidth = STROKE_WIDTHS.STANDARD;
  draw_probe(ctx, world2screen(position, viewport));
}

/**
 * The wraps a belt being placed is drawn with, per via: what its geometry shows, plus 2π per whole turn a pulley is wound by (`turns`, index-aligned to the pulleys).
 * The last pulley is held to the wrap the trace found there (`BeltTrace.lastWrap`): the end drawn can lag the one traced by a frame, and a pulley just caught then reads as wrapped by a whole turn, its wrap just under zero — drawn as no wrap at all instead.
 */
export function dragged_wraps(
  vias: BeltVia<"screen">[],
  traced: number | undefined,
  turns: readonly (number | undefined)[] = [],
): number[] {
  const shown = belt_wraps(vias);
  const last = vias.length - 2;
  if (traced !== undefined && last >= 1 && Math.abs(shown[last] - traced) > Math.PI)
    shown[last] = 0;
  return shown.map((wrap, v) => wrap + 2 * Math.PI * (turns[v - 1] ?? 0));
}

/**
 * Draws the ghost of the tool gesture in progress — a marquee box, the element a placement would create, the dimension a drag is measuring.
 * Called only while the cursor is over the canvas: with nothing to preview, there is nothing to draw.
 */
export function draw_gesture_preview(
  ctx: CanvasRenderingContext2D,
  drawing: GesturePreviewDrawing,
) {
  const {
    viewport,
    hoveredPart,
    state,
    mechanicalElements,
    dimensionSnapped = false,
  } = drawing;
  const isPlacingLoadElement =
    state.type === "PlacingForceStart" ||
    state.type === "PlacingForceEnd" ||
    state.type === "PlacingDistributedForce" ||
    state.type === "PlacingMomentStart" ||
    state.type === "PlacingMomentEnd";
  // Cleared before `save` so the matching `restore` leaves the context neutral: the element pass ends on whatever tint its last element carried.
  ctx.save();
  ctx.strokeStyle = isPlacingLoadElement
    ? COLORS.ACCENT
    : COLORS.ELEMENT_STROKE;
  ctx.fillStyle = isPlacingLoadElement ? COLORS.ACCENT : COLORS.FILL_BODY;
  // A dimension being placed says its stand-off has landed the only way it can: by thickening, exactly as a placed one does when the drag holds it.
  ctx.lineWidth =
    STROKE_WIDTHS.STANDARD + (dimensionSnapped ? STROKE_WIDTHS.HOVER_GAIN : 0);
  let delta: ScreenPoint;
  switch (state.type) {
    case "SelectingMultiple":
    case "ErasingMultiple":
      ctx.lineWidth = 1;
      ctx.strokeStyle =
        state.type === "SelectingMultiple"
          ? COLORS.SELECTION_BOX
          : COLORS.DELETION_BOX;
      ctx.fillStyle = ctx.strokeStyle;
      const start = world2screen(state.startPos, viewport);
      const hoverPos = world2screen(hoveredPart.position, viewport);
      delta = hoverPos.sub(start);
      ctx.globalAlpha = 0.2;
      ctx.fillRect(start.x, start.y, delta.x, delta.y);
      ctx.globalAlpha = 0.9;
      ctx.strokeRect(start.x, start.y, delta.x, delta.y);
      break;
    case "PlacingBeamStart":
    case "PlacingSpringStart":
    case "PlacingDamperStart":
      draw_start_edge_end(ctx, world2screen(hoveredPart.position, viewport));
      break;
    case "PlacingBeltStart":
      draw_belt_end(ctx, world2screen(hoveredPart.position, viewport));
      break;
    case "PlacingGearStart":
      // On a run, the click is where the gear will touch it: which side it grows on, the drag decides.
      if (hoveredPart.type === "BeltBody") {
        draw_hover_circle(ctx, world2screen(hoveredPart.position, viewport));
        break;
      }
      draw_gear(
        ctx,
        world2screen(hoveredPart.position, viewport),
        DIM.DEFAULT_GEAR_RADIUS,
        0,
      );
      if (!axle_under(hoveredPart, mechanicalElements))
        draw_pivot(ctx, world2screen(hoveredPart.position, viewport), true);
      break;
    case "PlacingPivot":
      draw_pivot(ctx, world2screen(hoveredPart.position, viewport), false);
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
      draw_slider(
        ctx,
        world2screen(hoveredPart.position, viewport),
        hoveredBeam
          ? world2screen_angle(
              hoveredBeam.positionEnd.sub(hoveredBeam.positionStart).angle(),
            )
          : 0,
        false,
      );
      break;
    }
    case "PlacingJoin":
      draw_join(ctx, world2screen(hoveredPart.position, viewport));
      break;
    case "PlacingMass":
      draw_mass(ctx, world2screen(hoveredPart.position, viewport), 1);
      break;
    case "PlacingGround":
      draw_ground(ctx, world2screen(hoveredPart.position, viewport), 0);
      break;
    case "PlacingMotor":
      draw_motor(ctx, world2screen(hoveredPart.position, viewport), true, true);
      draw_pivot(ctx, world2screen(hoveredPart.position, viewport), false);
      break;
    case "PlacingGearRadius": {
      if (state.startHover.type === "BeltBody") {
        const laid = gear_on_run(
          state.startHover,
          hoveredPart.position,
          mechanicalElements,
          viewport,
        );
        if (!laid) break;
        const at = world2screen(laid.center, viewport);
        draw_gear(ctx, at, world2screen_length(laid.radius, viewport), 0);
        draw_pivot(ctx, at, true);
        break;
      }
      const center = world2screen(state.startHover.position, viewport);
      const radius = world2screen(hoveredPart.position, viewport).distance_to(
        center,
      );
      draw_gear(ctx, center, radius, 0);
      if (!axle_under(state.startHover, mechanicalElements))
        draw_pivot(ctx, center, true);
      break;
    }
    case "PlacingBeamEnd":
      draw_beam(
        ctx,
        world2screen(state.startHover.position, viewport),
        world2screen(hoveredPart.position, viewport),
      );
      break;
    case "PlacingSpringEnd":
      draw_spring(
        ctx,
        world2screen(state.startHover.position, viewport),
        world2screen(hoveredPart.position, viewport),
        spring_coil_pitch(mechanicalElements, [
          state.startHover.position,
          hoveredPart.position,
        ]),
        undefined,
        viewport.scale,
      );
      break;
    case "PlacingDamperEnd":
      draw_damper(
        ctx,
        world2screen(state.startHover.position, viewport),
        world2screen(hoveredPart.position, viewport),
        undefined,
        viewport.scale,
      );
      break;
    case "PlacingBeltEnd": {
      // The route the click commits: the pulleys already routed, the gear under the cursor appended as clicking it would, and the gear the gesture started on folded in exactly as finalisation does.
      // A drag commits no gear it is released over, so none is appended while it lasts; nor is the last pulley, which the belt then ends pinned on.
      const routed = [...state.attachedGearsIDs];
      if (
        hoveredPart.type === "GearTooth" &&
        !state.pressHeld &&
        hoveredPart.id !== terminal_pulley(state, mechanicalElements)
      ) {
        const hoveredGear = get_mechanical_element_from_id(
          hoveredPart.id,
          mechanicalElements,
        ) as GearElement;
        const previousVia =
          routed.length > 0
            ? (
                get_mechanical_element_from_id(
                  routed[routed.length - 1].id,
                  mechanicalElements,
                ) as GearElement
              ).position
            : state.startHover.position;
        routed.push({
          id: hoveredGear.id,
          clockwise: belt_wrap_arriving(
            hoveredGear,
            previousVia,
            hoveredPart.position,
          ),
        });
      }
      const route = attached_gears_with_start(
        { ...state, attachedGearsIDs: routed },
        hoveredPart.position,
        mechanicalElements,
      );
      const attachedTurns = route.map(({ turns }) => turns);
      const attachedGears = route.map(({ id, clockwise }) => ({
        gear: get_mechanical_element_from_id(
          id,
          mechanicalElements,
        ) as GearElement,
        clockwise,
      }));
      const vias = screen_vias(
        open_belt_vias(
          state.startHover.position,
          attachedGears,
          hoveredPart.position,
        ),
        viewport,
      );
      // Cursor back on the start: preview the loop it will build — same route, no free ends.
      if (hoveredPart.type === "BeltClosure") {
        const loopVias = vias.slice(1, -1);
        draw_belt_loop(ctx, loopVias, [], []);
        draw_belt_closure_marks(
          ctx,
          loopVias,
          world2screen(hoveredPart.position, viewport),
          state.startHover.type !== "Node",
        );
        break;
      }
      const wraps = dragged_wraps(
        vias,
        state.trace?.lastWrap,
        attachedTurns,
      );
      draw_belt_open(ctx, vias, wraps, belt_windings(wraps, false, false));
      break;
    }
    case "PlacingForceStart": {
      const force_length = stored2screen_load(LOAD_SCALING.PREVIEW_VALUE);
      if (hoveredPart.type === "Edge" && hoveredPart.part === "body") {
        const beam = get_mechanical_element_from_id(
          hoveredPart.id,
          mechanicalElements,
        ) as BeamElement;
        const start = world2screen(beam.positionStart, viewport);
        const end = world2screen(beam.positionEnd, viewport);
        // The beam's world normal, so the preview leans to the same side of the beam whatever the viewport does with it.
        const delta = world2screen_vec(
          beam.positionStart.sub(beam.positionEnd).perp(),
          viewport,
        ).with_length(force_length);
        draw_distributed_force(ctx, start, end, delta, delta);
        draw_force(ctx, start, delta, LOAD_SCALING.PREVIEW_VALUE, false, LOAD_INTENSITY);
        draw_force(ctx, end, delta, LOAD_SCALING.PREVIEW_VALUE, false, LOAD_INTENSITY);
        break;
      }
      draw_force(
        ctx,
        world2screen(hoveredPart.position, viewport),
        world2screen_vec(DOWN, viewport).with_length(force_length),
        LOAD_SCALING.PREVIEW_VALUE,
        false,
        FORCE,
      );
      break;
    }
    case "PlacingForceEnd": {
      const force = force_from_drag(
        GHOST_LOAD_ID,
        state.startHover,
        hoveredPart.position,
        mechanicalElements,
        viewport,
      );
      if (!force) break;
      const ghost = force_screen_geometry(force, mechanicalElements, viewport);
      draw_force(
        ctx,
        ghost.base,
        ghost.vector,
        force.vector.length(),
        false,
        FORCE,
      );
      break;
    }
    case "PlacingDistributedForce": {
      const load = distributed_force_from_drag(
        GHOST_LOAD_ID,
        state.startHover,
        hoveredPart.position,
        mechanicalElements,
        viewport,
      );
      if (!load) break;
      const { start, end, vectorStart, vectorEnd } =
        distributed_screen_geometry(load, mechanicalElements, viewport);
      draw_distributed_force(ctx, start, end, vectorStart, vectorEnd);
      draw_force(
        ctx,
        start,
        vectorStart,
        Math.abs(load.magnitudeStart),
        false,
        LOAD_INTENSITY,
      );
      draw_force(
        ctx,
        end,
        vectorEnd,
        Math.abs(load.magnitudeEnd),
        false,
        LOAD_INTENSITY,
      );
      break;
    }
    case "PlacingMomentStart": {
      draw_moment(
        ctx,
        world2screen(hoveredPart.position, viewport),
        stored2screen_moment(MOMENT_SCALING.PREVIEW_VALUE),
        MOMENT_SCALING.PREVIEW_VALUE,
      );
      break;
    }
    case "PlacingMomentEnd": {
      const moment = moment_from_drag(
        GHOST_LOAD_ID,
        state.startHover,
        hoveredPart.position,
        viewport,
      );
      if (!moment) break;
      const arc = moment_screen_geometry(moment, mechanicalElements, viewport);
      draw_moment(ctx, arc.center, arc.radius, moment.value);
      break;
    }
    case "DimensionNode": {
      const position = (
        get_mechanical_element_from_id(
          state.nodeID,
          mechanicalElements,
        ) as NodeElement
      ).position;
      if (hoveredPart.type === "Edge") {
        const edge = get_mechanical_element_from_id(
          hoveredPart.id,
          mechanicalElements,
        ) as EdgeElement;
        const start = edge.positionStart;
        const end = edge.positionEnd;
        draw_dimension_to_segment(
          ctx,
          world2screen(position, viewport),
          world2screen(start, viewport),
          world2screen(end, viewport),
          world2screen(hoveredPart.position, viewport),
          position.distance2line(start, end),
        );
      } else {
        draw_dimension(
          ctx,
          world2screen(position, viewport),
          world2screen(hoveredPart.position, viewport),
          world2screen(position, viewport).lerp(
            world2screen(hoveredPart.position, viewport),
            0.5,
          ),
          position.distance_to(hoveredPart.position),
        );
      }
      break;
    }
    case "DimensionEdge": {
      const edge = get_mechanical_element_from_id(
        state.edgeID,
        mechanicalElements,
      ) as EdgeElement;
      const start = edge.positionStart;
      const end = edge.positionEnd;
      switch (hoveredPart.type) {
        case "Void":
          draw_dimension(
            ctx,
            world2screen(start, viewport),
            world2screen(end, viewport),
            world2screen(hoveredPart.position, viewport),
            start.distance_to(end),
          );
          break;
        case "Node":
          draw_dimension_to_segment(
            ctx,
            world2screen(hoveredPart.position, viewport),
            world2screen(start, viewport),
            world2screen(end, viewport),
            world2screen(hoveredPart.position, viewport)
              .project_on_line(
                world2screen(start, viewport),
                world2screen(end, viewport),
              )
              .lerp(world2screen(hoveredPart.position, viewport), 0.5),
            hoveredPart.position.distance2line(start, end),
          );
          break;
        case "Edge":
          const endEdge = get_mechanical_element_from_id(
            hoveredPart.id,
            mechanicalElements,
          ) as EdgeElement;
          const intersection = Point2.lines_intersection(
            world2screen(start, viewport),
            world2screen(end, viewport),
            world2screen(endEdge.positionStart, viewport),
            world2screen(endEdge.positionEnd, viewport),
          );
          if (!intersection) break;

          const angleConstraintQuadrant = resolve_angle_constraint_quadrant(
            start,
            end,
            endEdge.positionStart,
            endEdge.positionEnd,
            hoveredPart.position,
          );
          if (!angleConstraintQuadrant) break;
          const { flipStart, flipEnd, angle } = angleConstraintQuadrant;

          const pos_dir = world2screen(hoveredPart.position, viewport).sub(
            intersection,
          );
          const position = intersection.add(
            pos_dir.slerp(
              world2screen(end, viewport)
                .sub(intersection)
                .normalize()
                .mul(pos_dir.length()),
              0.5,
            ),
          );

          draw_dimension_angle(
            ctx,
            world2screen(start, viewport),
            world2screen(end, viewport),
            world2screen(endEdge.positionStart, viewport),
            world2screen(endEdge.positionEnd, viewport),
            flipStart,
            flipEnd,
            position,
            angle,
          );
          break;
      }
      break;
    }
    case "DimensionNodeToNode": {
      const start = (
        get_mechanical_element_from_id(
          state.startNodeID,
          mechanicalElements,
        ) as NodeElement
      ).position;
      const end = (
        get_mechanical_element_from_id(
          state.endNodeID,
          mechanicalElements,
        ) as NodeElement
      ).position;
      draw_dimension(
        ctx,
        world2screen(start, viewport),
        world2screen(end, viewport),
        world2screen(hoveredPart.position, viewport),
        start.distance_to(end),
      );
      break;
    }
    case "DimensionEdgeToNode": {
      const edge = get_mechanical_element_from_id(
        state.edgeID,
        mechanicalElements,
      ) as EdgeElement;
      const start = edge.positionStart;
      const end = edge.positionEnd;
      const point = (
        get_mechanical_element_from_id(
          state.nodeID,
          mechanicalElements,
        ) as NodeElement
      ).position;
      draw_dimension_to_segment(
        ctx,
        world2screen(point, viewport),
        world2screen(start, viewport),
        world2screen(end, viewport),
        world2screen(hoveredPart.position, viewport),
        point.distance2line(start, end),
      );
      break;
    }
    case "DimensionAngle": {
      const edge1 = get_mechanical_element_from_id(
        state.startEdgeID,
        mechanicalElements,
      ) as EdgeElement;
      const start1 = edge1.positionStart;
      const end1 = edge1.positionEnd;
      const edge2 = get_mechanical_element_from_id(
        state.endEdgeID,
        mechanicalElements,
      ) as EdgeElement;
      const start2 = edge2.positionStart;
      const end2 = edge2.positionEnd;

      const angleConstraintQuadrant = resolve_angle_constraint_quadrant(
        start1,
        end1,
        start2,
        end2,
        hoveredPart.position,
      );
      if (!angleConstraintQuadrant) break;
      const { flipStart, flipEnd, angle } = angleConstraintQuadrant;

      draw_dimension_angle(
        ctx,
        world2screen(start1, viewport),
        world2screen(end1, viewport),
        world2screen(start2, viewport),
        world2screen(end2, viewport),
        flipStart,
        flipEnd,
        world2screen(hoveredPart.position, viewport),
        angle,
      );
      break;
    }
    case "DimensionRadius": {
      const gear = get_mechanical_element_from_id(
        state.gearID,
        mechanicalElements,
      ) as GearElement;
      draw_dimension_radius(
        ctx,
        world2screen(gear.position, viewport),
        world2screen_length(gear.radius, viewport),
        world2screen(hoveredPart.position, viewport),
        gear.radius,
      );
      break;
    }
    case "DimensionBelt": {
      const belt = get_mechanical_element_from_id(
        state.beltID,
        mechanicalElements,
      ) as BeltElement;
      const allVias = screen_vias(
        get_belt_vias(belt, mechanicalElements),
        viewport,
      );
      const vias = belt.closed ? allVias.slice(1, -1) : allVias;

      draw_dimension_belt(
        ctx,
        vias,
        belt.closed,
        world2screen(hoveredPart.position, viewport),
        measure_belt_length(belt, mechanicalElements),
      );
      break;
    }
    case "PlacingProbe": {
      draw_probe_under_cursor(ctx, hoveredPart, viewport);
      break;
    }
    case "PlacingProbeMetrics": {
      const probed = mechanicalElements.find((el) => el.id === state.elementID);
      // The element being set up wears a probe of its own until a first metric is ticked, which draws a real one.
      if (probed && (probed.probes?.length ?? 0) === 0) {
        ctx.strokeStyle = COLORS.ACCENT;
        ctx.lineWidth = STROKE_WIDTHS.STANDARD;
        draw_probe(ctx, probe_badge_position(probed, viewport));
      }
      // The tool is still armed under the box, so the next probe follows the cursor as soon as it aims somewhere else.
      if (state.armed && !is_hovered(hoveredPart, state.elementID))
        draw_probe_under_cursor(ctx, hoveredPart, viewport);
      break;
    }
  }
  ctx.restore();
}
