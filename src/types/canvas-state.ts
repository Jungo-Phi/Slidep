import { HoveredPart } from "../types/hovered-part";
import { ID } from "./element";
import type { Link } from "./kinematic-solver-links";
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
  | {
      type: "SelectedElement";
      elementID: ID;
      pendingHit?: HoveredPart;
      downPos?: Point2;
    }
  | { type: "MovingNode"; elementID: ID }
  | { type: "MovingEdgeStartPoint"; elementID: ID }
  | { type: "MovingEdgeEndPoint"; elementID: ID }
  | { type: "MovingEdgeBody"; elementID: ID; t: number }
  | { type: "MovingBeltBody"; elementID: ID; section: number }
  | { type: "ChangingGearRadius"; elementID: ID }
  | { type: "MovingForce"; elementID: ID }
  | { type: "MovingDistributedForce"; elementID: ID; part: "start" | "end" }
  | {
      type: "MovingDistributedForce";
      elementID: ID;
      part: "body";
      /** Where along the beam the crest line was grabbed: that point is what
       *  follows the cursor, so an off-centre grab does not swing the load. */
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
  | { type: "ErasingMultiple"; startPos: Point2; hoveredElementIDs: ID[] }
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
  | { type: "PlacingProbeMetrics"; elementID: ID; position: Point2 } // Metric selector popover open on a clicked element
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
  // Les deux états de saisie d'une valeur au canvas. Ils partagent l'éditeur
  // mais pas les issues : sur un élément qui vient d'être posé, ESCAPE le
  // supprime et ENTER réarme l'outil pour en poser un autre ; sur un élément
  // déjà existant, ESCAPE annule la saisie et ENTER le laisse sélectionné.
  | {
      type: "PlacingValue";
      elementID: ID;
      value: number;
    }
  | {
      type: "EditingValue";
      elementID: ID;
      value: number;
      /** Quelle magnitude d'une force répartie est éditée. */
      part?: "start" | "end";
    }
  | {
      type: "SimulationDragging";
      grabbedKey: string;
      elementID: ID;
      bodyRatio?: number;
      gearPerimeter?: { gearID: ID; angleOffset: number; radius: number };
      beltPin?: Extract<Link, { type: "BeltPin" }>;
    };
