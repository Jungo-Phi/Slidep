import { CanvasStateType } from "../types";

/**
 * What entering a canvas state does to a running simulation, whichever route led there (palette, shortcut, drag, click on a value).
 * Every tool can be armed during a run: one that edits the structure brings the mechanism back to rest as soon as it is armed.
 * - `"exit"`: back to rest, for gestures that edit the structure.
 * - `"pause"`: stays in simulation but holds the mechanism still, so the gesture does not chase a moving target.
 * - `"none"`: the run goes on.
 */
export type SimEffect = "exit" | "pause" | "none";

export const CANVAS_STATE_SIM_EFFECT: Record<CanvasStateType, SimEffect> = {
  Selecting: "none",
  SelectedElement: "none",
  SelectingMultiple: "none",
  SelectedMultiple: "none",
  SimulationDragging: "none",
  Grabbing: "none",
  PlacingProbeMetrics: "none",
  PickingMomentBalanceNode: "none",
  Measuring: "none",
  MeasuringFrom: "none",
  Measured: "none",

  MovingNode: "exit",
  MovingEdgeStartPoint: "exit",
  MovingEdgeEndPoint: "exit",
  MovingEdgeBody: "exit",
  MovingBeltBody: "exit",
  ChangingGearRadius: "exit",
  MovingSelectionMultiple: "exit",
  MovingTransformPivot: "exit",
  TransformingSelection: "exit",
  EditingSelectionTransform: "exit",
  Erasing: "exit",
  ErasingMultiple: "exit",
  PlacingBeamStart: "exit",
  PlacingBeamEnd: "exit",
  PlacingSpringStart: "exit",
  PlacingSpringEnd: "exit",
  PlacingDamperStart: "exit",
  PlacingDamperEnd: "exit",
  PlacingBeltStart: "exit",
  PlacingBeltEnd: "exit",
  PlacingMotor: "exit",
  PlacingPivot: "exit",
  PlacingSlider: "exit",
  PlacingJoin: "exit",
  PlacingMass: "exit",
  PlacingGearStart: "exit",
  PlacingGearRadius: "exit",
  PlacingGround: "exit",
  // A constraint changes what the mechanism can do, as a link does.
  DimensionStart: "exit",
  DimensionNode: "exit",
  DimensionEdge: "exit",
  DimensionNodeToNode: "exit",
  DimensionEdgeToNode: "exit",
  DimensionAngle: "exit",
  DimensionRadius: "exit",
  DimensionBelt: "exit",
  HorizontalVerticalConstraintStart: "exit",
  HorizontalVerticalConstraintNode: "exit",
  NormalConstraintStart: "exit",
  NormalConstraintEdge: "exit",
  ParallelConstraintStart: "exit",
  ParallelConstraintEdge: "exit",
  EqualConstraintStart: "exit",
  EqualConstraintEdge: "exit",
  EqualConstraintGear: "exit",
  GearRatioConstraintStart: "exit",
  GearRatioConstraintGear: "exit",

  // A load is an input, not structure: the run absorbs it (see `action-kind.ts`).
  PlacingForceStart: "pause",
  PlacingForceEnd: "pause",
  PlacingDistributedForce: "pause",
  PlacingMomentStart: "pause",
  PlacingMomentEnd: "pause",
  MovingForce: "pause",
  MovingDistributedForce: "pause",
  MovingMoment: "pause",
  // A probe is aimed at an element, which holds still for it as it does for a load.
  PlacingProbe: "pause",
  // The field would otherwise ride along with the label it edits.
  EditingValue: "pause",
  PlacingValue: "pause",

  MovingConstraint: "pause",
  DraggingFloorHeight: "pause",
  DraggingFloorAngle: "pause",
  EditingFloorValue: "pause",
};
