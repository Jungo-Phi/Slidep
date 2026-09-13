import { CanvasStateType } from "../types";
import { ToolStateType } from "./shortcuts";

/** The tools that can be armed while a simulation runs: every other one is greyed out in the palette and deaf to its shortcut. */
export const SIMULATION_TOOLS: ReadonlySet<ToolStateType> = new Set<ToolStateType>([
  "Selecting",
  "PlacingForceStart",
  "PlacingMomentStart",
  "PlacingProbe",
  "Measuring",
]);

/**
 * What entering a canvas state does to a running simulation, whichever route led there (palette, shortcut, drag, click on a value).
 * - `"exit"`: back to edition, for gestures that edit the structure.
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
  PlacingProbe: "none",
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

  // A load is an input, not structure: the run absorbs it (see `action-kind.ts`).
  PlacingForceStart: "pause",
  PlacingForceEnd: "pause",
  PlacingDistributedForce: "pause",
  PlacingMomentStart: "pause",
  PlacingMomentEnd: "pause",
  MovingForce: "pause",
  MovingDistributedForce: "pause",
  MovingMoment: "pause",
  // The field would otherwise ride along with the label it edits.
  EditingValue: "pause",
  PlacingValue: "pause",

  DimensionStart: "pause",
  DimensionNode: "pause",
  DimensionEdge: "pause",
  DimensionNodeToNode: "pause",
  DimensionEdgeToNode: "pause",
  DimensionAngle: "pause",
  DimensionRadius: "pause",
  DimensionBelt: "pause",
  HorizontalVerticalConstraintStart: "pause",
  HorizontalVerticalConstraintNode: "pause",
  NormalConstraintStart: "pause",
  NormalConstraintEdge: "pause",
  ParallelConstraintStart: "pause",
  ParallelConstraintEdge: "pause",
  EqualConstraintStart: "pause",
  EqualConstraintEdge: "pause",
  EqualConstraintGear: "pause",
  GearRatioConstraintStart: "pause",
  GearRatioConstraintGear: "pause",
  MovingConstraint: "pause",
  DraggingFloorHeight: "pause",
  DraggingFloorAngle: "pause",
  EditingFloorValue: "pause",
};
