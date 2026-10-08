import type { CanvasState } from "../../../types/canvas-state";
import { state_under_probe_metrics } from "../../../types/canvas-state";
import type { HoveredPart } from "../../../types/hovered-part";
import type { BeamElement, MechanicalElement } from "../../../types/element";
import { DOWN, Point2, type ViewportState } from "../../../types";
import { DIM } from "../../../constants/rendering-specs";
import {
  LOAD_SCALING,
  MOMENT_SCALING,
} from "../../../constants/physics-display-specs";
import {
  stored2screen_load,
  stored2screen_moment,
} from "../../../utils/load-scale";
import { screen2world_length } from "../../../utils/viewport";
import { get_mechanical_element_from_id } from "../../mechanism/connect-actions";

/** The second step of a two-step placement. */
export type SecondStepState = Extract<CanvasState, { startHover: HoveredPart }>;

/**
 * What a finger tapping the first step of a placement, without dragging, puts down as its second: the end the first step's preview already drew whole, or nothing when it drew only a start.
 * A finger never leaves a placement waiting for a second tap: what it put down, it saw before lifting.
 * Mirrors the first steps of `draw_gesture_preview`.
 */
export function tap_second_step(
  state: SecondStepState,
  mechanicalElements: MechanicalElement[],
  viewport: ViewportState,
): HoveredPart | undefined {
  const start = state.startHover.position;
  const at = (offset: Point2): HoveredPart => ({
    type: "Void",
    position: start.add(offset),
  });
  switch (state.type) {
    case "PlacingGearRadius":
      return at(
        new Point2(screen2world_length(DIM.DEFAULT_GEAR_RADIUS, viewport), 0),
      );
    case "PlacingForceEnd":
      return at(
        DOWN.with_length(
          screen2world_length(
            stored2screen_load(LOAD_SCALING.PREVIEW_VALUE),
            viewport,
          ),
        ),
      );
    case "PlacingDistributedForce": {
      if (state.startHover.type !== "Edge") return undefined;
      const beam = get_mechanical_element_from_id(
        state.startHover.id,
        mechanicalElements,
      ) as BeamElement;
      // Read from the beam's middle, as the load's own drag is.
      const middle = beam.positionStart.lerp(beam.positionEnd, 0.5);
      const normal = beam.positionStart
        .sub(beam.positionEnd)
        .perp()
        .with_length(
          screen2world_length(
            stored2screen_load(LOAD_SCALING.PREVIEW_VALUE),
            viewport,
          ),
        );
      return { type: "Void", position: middle.add(normal) };
    }
    case "PlacingMomentEnd":
      // Rightward of the support: the side the preview's positive sense is read from.
      return at(
        new Point2(
          screen2world_length(
            stored2screen_moment(MOMENT_SCALING.PREVIEW_VALUE),
            viewport,
          ),
          0,
        ),
      );
    case "PlacingBeamEnd":
    case "PlacingSpringEnd":
    case "PlacingDamperEnd":
    case "PlacingBeltEnd":
      return undefined;
    default: {
      const unhandled: never = state;
      return unhandled;
    }
  }
}

/**
 * Whether a finger landing on `target` in `state` only aims, its press being played when it lifts.
 *
 * A finger hides what it points at, and nothing showed the target before it touched: a tool that writes lets it slide to correct its aim, the snap in view, before anything is put down.
 * Selecting and dragging act on contact instead, as with a mouse — a wrong target there costs nothing but another tap.
 * So does the first step of a two-step placement: sliding from it draws the element, whose second step the lift puts down.
 */
export function aims_until_lift(
  rawState: CanvasState,
  target: HoveredPart,
): boolean {
  const state = state_under_probe_metrics(rawState);
  switch (state.type) {
    case "Erasing":
      // On empty space the eraser draws its rectangle, which already erases on release only.
      return target.type !== "Void";
    case "PlacingBeamEnd":
    case "PlacingSpringEnd":
    case "PlacingDamperEnd":
    case "PlacingBeltEnd":
    case "PlacingMotor":
    case "PlacingPivot":
    case "PlacingSlider":
    case "PlacingJoin":
    case "PlacingMass":
    case "PlacingGearRadius":
    case "PlacingGround":
    case "PlacingForceEnd":
    case "PlacingDistributedForce":
    case "PlacingMomentEnd":
    case "PlacingProbe":
    case "PickingMomentBalanceNode":
    case "Measuring":
    case "MeasuringFrom":
    case "Measured":
    case "DimensionStart":
    case "DimensionNode":
    case "DimensionEdge":
    case "DimensionNodeToNode":
    case "DimensionEdgeToNode":
    case "DimensionAngle":
    case "DimensionRadius":
    case "DimensionBelt":
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
      return true;
    case "PlacingBeamStart":
    case "PlacingSpringStart":
    case "PlacingDamperStart":
    case "PlacingBeltStart":
    case "PlacingGearStart":
    case "PlacingForceStart":
    case "PlacingMomentStart":
    case "Selecting":
    case "SelectedElement":
    case "SelectingMultiple":
    case "SelectedMultiple":
    case "MovingNode":
    case "MovingEdgeStartPoint":
    case "MovingEdgeEndPoint":
    case "MovingEdgeBody":
    case "MovingBeltBody":
    case "ChangingGearRadius":
    case "MovingForce":
    case "MovingDistributedForce":
    case "MovingMoment":
    case "MovingSelectionMultiple":
    case "MovingConstraint":
    case "ErasingMultiple":
    case "DraggingFloorHeight":
    case "DraggingFloorAngle":
    case "EditingFloorValue":
    case "PlacingValue":
    case "EditingValue":
    case "SimulationDragging":
    case "PlacingProbeMetrics":
      return false;
    default: {
      const unhandled: never = state;
      return unhandled;
    }
  }
}
