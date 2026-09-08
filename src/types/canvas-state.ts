import { HoveredPart } from "./hovered-part";
import type { Measure, MeasureAnchor } from "./measure";
import { ID } from "./element";
import type { Link } from "./kinematic-solver-links";
import { WorldPoint } from "./mechanism";

// Define the possible types of canvas states
export type CanvasStateType =
  | "Selecting"
  | "SelectedElement"
  | "MovingNode"
  | "MovingEdgeStartPoint"
  | "MovingEdgeEndPoint"
  | "MovingEdgeBody"
  | "MovingBeltBody"
  | "ChangingGearRadius"
  | "MovingForce"
  | "MovingDistributedForce"
  | "MovingMoment"
  | "SelectingMultiple"
  | "SelectedMultiple"
  | "MovingSelectionMultiple"
  | "Erasing"
  | "ErasingMultiple"
  | "PlacingBeamStart"
  | "PlacingBeamEnd"
  | "PlacingSpringStart"
  | "PlacingSpringEnd"
  | "PlacingDamperStart"
  | "PlacingDamperEnd"
  | "PlacingBeltStart"
  | "PlacingBeltEnd"
  | "PlacingMotor"
  | "PlacingPivot"
  | "PlacingSlider"
  | "PlacingJoin"
  | "PlacingMass"
  | "PlacingGearStart"
  | "PlacingGearRadius"
  | "PlacingGround"
  | "PlacingForceStart"
  | "PlacingForceEnd"
  | "PlacingDistributedForce"
  | "PlacingMomentStart"
  | "PlacingMomentEnd"
  | "PlacingProbe"
  | "PlacingProbeMetrics"
  | "Measuring"
  | "MeasuringFrom"
  | "Measured"
  | "DimensionStart"
  | "DimensionNode"
  | "DimensionEdge"
  | "DimensionNodeToNode"
  | "DimensionEdgeToNode"
  | "DimensionAngle"
  | "DimensionRadius"
  | "DimensionBelt"
  | "HorizontalVerticalConstraintStart"
  | "HorizontalVerticalConstraintNode"
  | "NormalConstraintStart"
  | "NormalConstraintEdge"
  | "ParallelConstraintStart"
  | "ParallelConstraintEdge"
  | "EqualConstraintStart"
  | "EqualConstraintEdge"
  | "EqualConstraintGear"
  | "GearRatioConstraintStart"
  | "GearRatioConstraintGear"
  | "MovingConstraint"
  | "PlacingValue"
  | "EditingValue"
  | "DraggingFloorHeight"
  | "DraggingFloorAngle"
  | "EditingFloorValue"
  | "SimulationDragging";

// Define the possible states of the canvas interaction
export type CanvasState =
  | { type: "Selecting" } // Selection tool active
  | {
      type: "SelectingMultiple";
      startPos: WorldPoint;
      elementIDs: ID[];
      hoveredElementIDs: ID[];
    } // User has started a drag to select multiple elements
  | { type: "SelectedMultiple"; elementIDs: ID[] }
  | {
      type: "SelectedElement";
      elementID: ID;
      pendingHit?: HoveredPart;
      downPos?: WorldPoint;
    }
  | { type: "MovingNode"; elementID: ID }
  | { type: "MovingEdgeStartPoint"; elementID: ID }
  | { type: "MovingEdgeEndPoint"; elementID: ID }
  | { type: "MovingEdgeBody"; elementID: ID; t: number }
  | {
      type: "MovingBeltBody";
      elementID: ID;
      /** The run the drag carries, numbered on the belt MINUS `removingGearIndex`
       * — read it through `belt_without_gear`, never against the stored belt. */
      section: number;
      /** Set when the grab was on an arc: that pulley only leaves the belt at the
       * drop, so an abandoned gesture costs nothing and the path never opens. */
      removingGearIndex?: number;
    }
  | { type: "ChangingGearRadius"; elementID: ID }
  | { type: "MovingForce"; elementID: ID }
  | { type: "MovingDistributedForce"; elementID: ID; part: "start" | "end" }
  | {
      type: "MovingDistributedForce";
      elementID: ID;
      part: "body";
      /** Where along the beam the crest line was grabbed: that point is what
       * follows the cursor, so an off-centre grab does not swing the load. */
      grabT: number;
    }
  | { type: "MovingMoment"; elementID: ID }
  | {
      type: "MovingSelectionMultiple";
      elementIDs: ID[];
      grabbedID: ID;
      hasMoved: boolean;
    }
  | { type: "Erasing" }
  | { type: "ErasingMultiple"; startPos: WorldPoint; hoveredElementIDs: ID[] }
  | { type: "PlacingBeamStart" }
  | { type: "PlacingBeamEnd"; startHover: HoveredPart }
  | { type: "PlacingSpringStart" }
  | { type: "PlacingSpringEnd"; startHover: HoveredPart }
  | { type: "PlacingDamperStart" }
  | { type: "PlacingDamperEnd"; startHover: HoveredPart }
  | { type: "PlacingBeltStart" }
  | {
      type: "PlacingBeltEnd";
      startHover: HoveredPart;
      attachedGearsIDs: { id: ID; clockwise: boolean }[];
    }
  | { type: "PlacingMotor" }
  | { type: "PlacingPivot" }
  | { type: "PlacingSlider" }
  | { type: "PlacingJoin" }
  | { type: "PlacingMass" }
  | { type: "PlacingGearStart" } // Placing a 'gear' element's center
  | { type: "PlacingGearRadius"; startHover: HoveredPart } // Placing a 'gear' element, defining its radius
  | { type: "PlacingGround" }
  | { type: "PlacingForceStart" }
  | { type: "PlacingForceEnd"; startHover: HoveredPart }
  | { type: "PlacingDistributedForce"; startHover: HoveredPart }
  | { type: "PlacingMomentStart" }
  | { type: "PlacingMomentEnd"; startHover: HoveredPart }
  | { type: "PlacingProbe" }
  // Metric selector popover open on an element, reached either by placing a probe (`armed`, so closing it re-arms the tool) or by clicking the badge of one already there (closing leaves that element selected).
  | {
      type: "PlacingProbeMetrics";
      elementID: ID;
      position: WorldPoint;
      armed?: boolean;
    }
  // The ruler, in its three moments: out and waiting, holding one end, and read.
  // It measures without touching the mechanism, so it lives in the canvas state and nowhere else — leaving the tool is what clears it.
  | { type: "Measuring" }
  | { type: "MeasuringFrom"; start: MeasureAnchor }
  | { type: "Measured"; measure: Measure }
  | { type: "DimensionStart" } // Dimensioning tool active
  | { type: "DimensionNode"; nodeID: ID } // Dimension from a node to ?
  | { type: "DimensionEdge"; edgeID: ID } // Dimension of an edge / from an edge to ?
  | {
      type: "DimensionNodeToNode";
      startNodeID: ID;
      endNodeID: ID;
    }
  | { type: "DimensionEdgeToNode"; edgeID: ID; nodeID: ID }
  | { type: "DimensionAngle"; startEdgeID: ID; endEdgeID: ID }
  | { type: "DimensionRadius"; gearID: ID }
  | { type: "DimensionBelt"; beltID: ID }
  | { type: "HorizontalVerticalConstraintStart" }
  | { type: "HorizontalVerticalConstraintNode"; startNodeID: ID }
  | { type: "NormalConstraintStart" }
  | { type: "NormalConstraintEdge"; startEdgeID: ID }
  | { type: "ParallelConstraintStart" }
  | { type: "ParallelConstraintEdge"; startEdgeID: ID }
  | { type: "EqualConstraintStart" }
  | { type: "EqualConstraintEdge"; startEdgeID: ID }
  | { type: "EqualConstraintGear"; startGearID: ID }
  | { type: "GearRatioConstraintStart" }
  | { type: "GearRatioConstraintGear"; startGearID: ID }
  | { type: "MovingConstraint"; elementID: ID }
  // Both drag the floor directly, continuously once past the same drag-start threshold `SelectedElement` gates its own drag on.
  // `downPos` is what that threshold measures against, and — unmoved by mouse-up — what turns the gesture into a click that opens `EditingFloorValue` instead.
  | { type: "DraggingFloorHeight"; downPos: WorldPoint }
  | { type: "DraggingFloorAngle"; downPos: WorldPoint }
  // The two states for typing a value on the canvas.
  // They share the editor but not the exits: on an element just put down, ESCAPE removes it and ENTER re-arms the tool for another; on an element that stood there before, ESCAPE drops the entry and ENTER leaves it selected.
  | {
      type: "PlacingValue";
      elementID: ID;
      value: number;
    }
  | {
      type: "EditingValue";
      elementID: ID;
      value: number;
      /** Which magnitude of a distributed force is being edited. */
      part?: "start" | "end";
      /** The tool to re-arm on exit, when the entry was opened from a tool still armed.
       * Absent: the entry leaves the element selected. */
      rearm?: "DimensionStart";
    }
  | {
      type: "SimulationDragging";
      grabbedKey: string;
      elementID: ID;
      bodyRatio?: number;
      gearPerimeter?: { gearID: ID; angleOffset: number; radius: number };
      beltPin?: Extract<Link, { type: "BeltPin" }>;
    }
  /** Opened on a click (no drag) on a floor handle — see `DraggingFloorHeight`/
   * `DraggingFloorAngle`.
   * Always leaves the floor selected on exit: there is no `PlacingValue`-style "delete on Escape" counterpart, since the floor already existed. */
  | { type: "EditingFloorValue"; field: "height" | "angle"; value: number };

/**
 * The state the probe metric box is laid over, every other state answering for itself.
 * The box is an overlay, not a mode: the canvas keeps aiming and taking clicks as if it were closed, and closing it lands exactly here.
 */
export function state_under_probe_metrics(state: CanvasState): CanvasState {
  if (state.type !== "PlacingProbeMetrics") return state;
  return state.armed
    ? { type: "PlacingProbe" }
    : { type: "SelectedElement", elementID: state.elementID };
}

/** Every element id the canvas state currently treats as selected/focused: one id for
 * most states (drag, edit, single selection), several under a multiple selection. */
export function selected_ids(state: CanvasState): ID[] {
  if ("elementIDs" in state) return state.elementIDs;
  if ("elementID" in state) return [state.elementID];
  return [];
}
