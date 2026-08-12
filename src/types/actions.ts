import {
  ID,
  LoadFrame,
  MotorConfig,
  OverlayKind,
  ProbeConfig,
  UnionElement,
} from "./element";
import { GeomNodes } from "./kinematic-solver-links";
import { ScreenPoint, WorldPoint } from "./mechanism";

/** Events captured on the canvas */
export type CanvasEvent =
  | { type: "MouseLeftButtonDown"; shiftKey: boolean }
  | { type: "MouseButtonUp" }
  | { type: "MouseMove"; mouseDelta: ScreenPoint }
  | { type: "MouseRightButtonDown" }
  | { type: "KeyDown"; key: string; ctrlKey: boolean };

/** Supported action types */
export type ActionType =
  | OtherActionType
  | ChangeConstantActionType
  | MoveElementActionType
  | ChangeDimensionActionType
  | ConnectsActionType;

export type OtherActionType =
  | "MoveConstraint"
  | "GroundNode"
  | "CloseBelt"
  | "SwitchAttachedGearDirection"
  | "Blank";
export type ChangeConstantActionType =
  | "ChangeMass"
  | "ChangeStiffness"
  | "ChangeDamping";
export type MoveElementActionType =
  | "MoveNode"
  | "MoveEdgeStart"
  | "MoveEdgeEnd"
  | "MoveEdgeBody"
  | "MoveElements"
  | "ChangeGearRadius"
  | "ChangeEdgeLength"
  | "ChangeEdgeAngle"
  | "ChangeBeltLength";
export type ChangeDimensionActionType =
  | "ChangeDimensionEdgeValue"
  | "ChangeDimensionNodeToNodeValue"
  | "ChangeDimensionEdgeToNodeValue"
  | "ChangeDimensionAngleValue"
  | "ChangeDimensionRadiusValue"
  | "ChangeDimensionBeltValue"
  | "ChangeGearRatioValue";

export type ConnectsActionType =
  | ConnectsUnitActionType
  | ConnectsArrayActionType;
export type ConnectsUnitActionType =
  | "ConnectsParentBeam"
  | "ConnectsFixedNodeStart"
  | "ConnectsFixedNodeEnd"
  | "ConnectsParentAxle"
  | "ConnectsAttachedBelt";
export type ConnectsArrayActionType =
  | "ConnectsFixedEdges"
  | "ConnectsRotatingEdges"
  | "ConnectsFixedNodesBody"
  | "ConnectsMeshedGears"
  | "ConnectsAttachedGears"
  | "ConnectsFixedGears";
export type CreationActionType = "CreateElement" | "DeleteElement";

/** Actions that can be performed on the mechanism - And reversed for ctrl+Z */
export type Action =
  | { type: "CreateElement"; element: UnionElement }
  | { type: "DeleteElement"; element: UnionElement }
  | { type: "UpdateElementName"; id: ID; newName?: string; oldName?: string }
  | {
      type: "MoveNode";
      id: ID;
      newPosition: WorldPoint;
      oldPosition: WorldPoint;
      /**
       * The value was typed and validated rather than dragged. A drag is a continuous
       * gesture that must follow the cursor without tearing the sketch, so it pulls softly;
       * a typed value is a decision, and it is the rest of the sketch that has to give way.
       */
      committed?: boolean;
    }
  | {
      type: "MoveEdgeStart";
      id: ID;
      newPosition: WorldPoint;
      oldPosition: WorldPoint;
      /** Typed and validated rather than dragged — see `MoveNode`. */
      committed?: boolean;
    }
  | {
      type: "MoveEdgeEnd";
      id: ID;
      newPosition: WorldPoint;
      oldPosition: WorldPoint;
      /** Typed and validated rather than dragged — see `MoveNode`. */
      committed?: boolean;
    }
  | {
      type: "MoveEdgeBody";
      id: ID;
      t: number;
      newPosition: WorldPoint;
      oldPosition: WorldPoint;
    }
  | {
      type: "MoveElements";
      elementIDs: ID[];
      newPos: WorldPoint;
      delta: WorldPoint;
    }
  | {
      type: "MoveConstraint";
      id: ID;
      newPosition: WorldPoint;
      oldPosition: WorldPoint;
    }
  | { type: "GroundNode"; id: ID; grounded: boolean }
  | { type: "CloseBelt"; id: ID; closed: boolean }
  | {
      type: "SwitchAttachedGearDirection";
      id: ID;
      index: number;
      clockwise: boolean;
    }
  | {
      type: "ChangeGearRadius";
      id: ID;
      newRadius: number;
      oldRadius: number;
      target: WorldPoint;
      /** Typed and validated rather than dragged — see `MoveNode`. */
      committed?: boolean;
    }
  | { type: "ChangeEdgeLength"; id: ID; newLength: number; oldLength: number }
  | { type: "ChangeEdgeAngle"; id: ID; newAngle: number; oldAngle: number }
  | { type: "ChangeBeltLength"; id: ID; newLength: number; oldLength: number }
  | {
      type: "ChangeMass";
      id: ID;
      delta: number;
    }
  | {
      type: "ChangeStiffness";
      id: ID;
      delta: number;
    }
  | {
      type: "ChangeDamping";
      id: ID;
      delta: number;
    }
  | {
      type: "ChangeDimensionEdgeValue";
      id: ID;
      newValue: number;
      oldValue: number;
    }
  | {
      type: "ChangeDimensionNodeToNodeValue";
      id: ID;
      newValue: number;
      oldValue: number;
    }
  | {
      type: "ChangeDimensionEdgeToNodeValue";
      id: ID;
      newValue: number;
      oldValue: number;
    }
  | {
      type: "ChangeDimensionAngleValue";
      id: ID;
      newValue: number;
      oldValue: number;
    }
  | {
      type: "ChangeDimensionRadiusValue";
      id: ID;
      newValue: number;
      oldValue: number;
    }
  | {
      type: "ChangeDimensionBeltValue";
      id: ID;
      newValue: number;
      oldValue: number;
    }
  | {
      type: "ChangeGearRatioValue";
      id: ID;
      newValue: number;
      oldValue: number;
    }
  | {
      type: "ConnectsFixedEdges";
      disconnect: boolean;
      elementID: ID;
      connectID: ID;
      index: number;
    }
  | {
      type: "ConnectsRotatingEdges";
      disconnect: boolean;
      elementID: ID;
      connectID: ID;
      index: number;
    }
  | {
      type: "ConnectsParentBeam";
      disconnect: boolean;
      elementID: ID;
      connectID: ID;
    }
  | {
      type: "ConnectsFixedNodeStart";
      disconnect: boolean;
      elementID: ID;
      connectID: ID;
    }
  | {
      type: "ConnectsFixedNodeEnd";
      disconnect: boolean;
      elementID: ID;
      connectID: ID;
    }
  | {
      type: "ConnectsFixedNodesBody";
      disconnect: boolean;
      elementID: ID;
      connectID: ID;
      index: number;
    }
  | {
      type: "ConnectsParentAxle";
      disconnect: boolean;
      elementID: ID;
      connectID: ID;
    }
  | {
      type: "ConnectsMeshedGears";
      disconnect: boolean;
      elementID: ID;
      connectID: ID;
      index: number;
    }
  | {
      type: "ConnectsAttachedGears";
      disconnect: boolean;
      elementID: ID;
      connectID: ID;
      index: number;
      clockwise: boolean;
    }
  | {
      type: "ConnectsFixedGears";
      disconnect: boolean;
      elementID: ID;
      connectID: ID;
      index: number;
    }
  | {
      type: "ConnectsAttachedBelt";
      disconnect: boolean;
      elementID: ID;
      connectID: ID;
    }
  | {
      type: "UpdatePositionsToValidState";
      masterActionType:
        | MoveElementActionType
        | ChangeDimensionActionType
        | ConnectsActionType
        | CreationActionType
        | "CloseBelt";
      newNodes: GeomNodes;
      oldNodes: GeomNodes;
    }
  | { type: "Blank" }
  | {
      type: "ChangeForce";
      id: ID;
      newVector: WorldPoint;
      oldVector: WorldPoint;
    }
  | {
      type: "ChangeDistributedForce";
      id: ID;
      newDirection: WorldPoint;
      oldDirection: WorldPoint;
      newMagnitudeStart: number;
      oldMagnitudeStart: number;
      newMagnitudeEnd: number;
      oldMagnitudeEnd: number;
    }
  | { type: "ChangeMoment"; id: ID; newValue: number; oldValue: number }
  | { type: "SetLoadFrame"; id: ID; newFrame: LoadFrame; oldFrame: LoadFrame }
  | {
      type: "SetProbes";
      elementID: ID;
      newProbes: ProbeConfig[];
      oldProbes: ProbeConfig[];
    }
  | {
      type: "SetShowOverlay";
      elementID: ID;
      kind: OverlayKind;
      newValue: boolean;
      oldValue: boolean;
    }
  | {
      type: "SetMotorConfig";
      id: ID;
      newConfig: MotorConfig | undefined;
      oldConfig: MotorConfig | undefined;
    };
