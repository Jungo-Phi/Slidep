import { HoveredPart } from "../types/hovered-part";
import { ID } from "./element";
import type { Point2 } from "./point2";

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
  | "MovingForceTip"
  | "MovingDistributedForceTip"
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
  | "PlacingDistributedForceStart"
  | "PlacingDistributedForceEnd"
  | "PlacingMoment"
  | "PlacingProbe"
  | "PlacingProbeMetrics"
  | "DimensionStart"
  | "DimensionNode"
  | "DimensionEdge"
  | "DimensionNodeToNode"
  | "DimensionEdgeToNode"
  | "DimensionAngle"
  | "DimensionRadius"
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
  | "EditingConstraint"
  | "SimulationDragging";

// Define the possible states of the canvas interaction
export type CanvasState =
  | { type: "Selecting" } // Selection tool active
  | {
      type: "SelectingMultiple";
      startPos: Point2;
      elementIDs: ID[];
      hoveredElementIDs: ID[];
    } // User has started a drag to select multiple elements
  | { type: "SelectedMultiple"; elementIDs: ID[] }
  | { type: "SelectedElement"; elementID: ID }
  | { type: "MovingNode"; elementID: ID }
  | { type: "MovingEdgeStartPoint"; elementID: ID } // Moving the start point of an edge
  | { type: "MovingEdgeEndPoint"; elementID: ID } // Moving the end point of an edge
  | { type: "MovingEdgeBody"; elementID: ID; t: number } // Moving the entire edge by its body, grabbed at proportion `t`
  | { type: "MovingBeltBody"; elementID: ID; section: number } // Moving a section of a belt
  | { type: "ChangingGearRadius"; elementID: ID }
  | { type: "MovingForce"; elementID: ID }
  | {
      type: "MovingDistributedForce";
      elementID: ID;
      part: "start" | "end" | "body";
    }
  | { type: "MovingSelectionMultiple"; elementIDs: ID[]; delta: Point2 } // Multiple selected elements are being dragged
  | { type: "Erasing" } // Eraser tool active
  | { type: "ErasingMultiple"; startPos: Point2; hoveredElementIDs: ID[] } // User has started a drag to delete multiple elements
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
      attachedGearsIDs: { id: ID; direction: boolean }[];
    } // Placing a 'belt' element, defining its gear connections / end point
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
  | { type: "PlacingDistributedForceStart" }
  | { type: "PlacingDistributedForceEnd"; startHover: HoveredPart }
  | { type: "PlacingMoment" }
  | { type: "PlacingProbe" }
  | { type: "PlacingProbeMetrics"; elementID: ID; position: Point2 } // Metric selector popover open on a clicked element
  | { type: "DimensionStart" } // Dimensioning tool active
  | { type: "DimensionNode"; nodeID: ID } // Dimension from a node to ?
  | { type: "DimensionEdge"; edgeID: ID } // Dimension of an edge / from an edge to ?
  | {
      type: "DimensionNodeToNode";
      startNodeID: ID;
      endNodeID: ID;
    } // Dimension between two nodes
  | { type: "DimensionEdgeToNode"; edgeID: ID; nodeID: ID } // Dimension between an edge and a node
  | { type: "DimensionAngle"; startEdgeID: ID; endEdgeID: ID } // Angle dimension between two edges
  | { type: "DimensionRadius"; gearID: ID } // Radius dimension of a gear
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
  | {
      type: "EditingConstraint";
      elementID: ID;
      value: number;
      isPlacing: boolean;
    }
  | {
      type: "SimulationDragging";
      grabbedKey: string;
      elementID: ID;
      /** Set when grabbing an edge on its body: ratio along the edge (grabbedKey = edgeID). */
      bodyRatio?: number;
      /** Set when grabbing a gear tooth: rotate the gear so the grabbed perimeter
       *  point (fixed angle offset from the gear angle) follows the mouse. */
      gearPerimeter?: { gearID: ID; angleOffset: number; radius: number };
    };
