import {
  ID,
  LoadFrame,
  MotorConfig,
  OverlayKind,
  ProbeConfig,
  UnionElement,
} from "./element";
import { GeomNodes } from "./kinematic-solver-links";
import { Point2 } from "./point2";

/** Events captured on the canvas */
export type CanvasEvent =
  | { type: "MouseLeftButtonDown"; shiftKey: boolean }
  | { type: "MouseButtonUp" }
  | { type: "MouseMove"; mouseDelta: Point2 }
  | { type: "MouseRightButtonDown" }
  | { type: "KeyDown"; key: string; ctrlKey: boolean };

export type ActionBundleType =
  | "MoveElement"
  | "MoveConstraint"
  | "ChangeConstant"
  | "ChangeDimension"
  | "Connects"
  | "CreateConstraint"
  | "MoveLoad"
  | "Other";

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
  | "TightenBelt"
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
  | { type: "MoveNode"; id: ID; newPosition: Point2; oldPosition: Point2 }
  | { type: "MoveEdgeStart"; id: ID; newPosition: Point2; oldPosition: Point2 }
  | { type: "MoveEdgeEnd"; id: ID; newPosition: Point2; oldPosition: Point2 }
  | {
      type: "MoveEdgeBody";
      id: ID;
      t: number;
      newPosition: Point2;
      oldPosition: Point2;
    }
  | {
      type: "MoveElements";
      elementIDs: ID[];
      newPos: Point2;
      delta: Point2;
    }
  | { type: "MoveConstraint"; id: ID; newPosition: Point2; oldPosition: Point2 }
  | { type: "GroundNode"; id: ID; grounded: boolean }
  | { type: "TightenBelt"; id: ID; tightened: boolean }
  | {
      type: "SwitchAttachedGearDirection";
      id: ID;
      index: number;
      direction: boolean;
    }
  | {
      type: "ChangeGearRadius";
      id: ID;
      newRadius: number;
      oldRadius: number;
      target: Point2;
    }
  | { type: "ChangeEdgeLength"; id: ID; newLength: number; oldLength: number }
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
      direction: boolean;
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
        | "TightenBelt";
      newNodes: GeomNodes;
      oldNodes: GeomNodes;
    }
  | { type: "Blank" }
  | { type: "MoveForceVector"; id: ID; newVector: Point2; oldVector: Point2 }
  | {
      type: "SetDistributedForce";
      id: ID;
      newDirection: Point2;
      oldDirection: Point2;
      newMagnitudeStart: number;
      oldMagnitudeStart: number;
      newMagnitudeEnd: number;
      oldMagnitudeEnd: number;
    }
  | { type: "ChangeMomentValue"; id: ID; newValue: number; oldValue: number }
  | { type: "FlipMomentDirection"; id: ID }
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
