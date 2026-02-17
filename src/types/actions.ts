import { ID, UnionElement } from "./element";
import { Point2 } from "./point2";

/** Events captured on the canvas */
export type CanvasEvent =
  | { type: "MouseLeftButtonDown"; shiftKey: boolean }
  | { type: "MouseLeftButtonUp" }
  | { type: "MouseMove"; mouseDelta: Point2 }
  | { type: "MouseRightButtonDown" }
  | { type: "KeyDown"; key: string; crtlKey: boolean };

/** Supported action types */
export type ActionType = OtherActionType | ConnectsActionType;

export type OtherActionType =
  | "CreateElement"
  | "DeleteElement"
  | "MoveNode"
  | "MoveEdgeStart"
  | "MoveEdgeEnd"
  | "MoveEdgeBody"
  | "MoveElements"
  | "MoveConstraint"
  | "ChangeEdgeLength"
  | "GroundNode"
  | "TightenBelt"
  | "SwitchMeshedGearDirection"
  | "ChangeGearRadius"
  | "ChangeGearAngle"
  | "ChangeMass"
  | "ChangeStiffness"
  | "ChangeDamping"
  | "ChangeDimensionEdgeValue"
  | "ChangeDimensionNodeToNodeValue"
  | "ChangeDimensionEdgeToNodeValue"
  | "ChangeDimensionAngleValue"
  | "ChangeDimensionRadiusValue"
  | "ChangeGearRatioValue";

export type ConnectsActionType =
  | ConnectsUnitActionType
  | ConnectsArrayActionType;
export type ConnectsUnitActionType =
  | "ConnectsParentBeam"
  | "ConnectsFixedNodeStart"
  | "ConnectsFixedNodeEnd"
  | "ConnectsAttachedBelt";
export type ConnectsArrayActionType =
  | "ConnectsFixedEdges"
  | "ConnectsRotatingEdges"
  | "ConnectsFixedNodesBody"
  | "ConnectsMeshedGears"
  | "ConnectsAttachedGears"
  | "ConnectsFixedGears";

/** Actions that can be performed on the mechanism - And reversed for crtl+Z */
export type Action =
  | { type: "CreateElement"; element: UnionElement }
  | { type: "DeleteElement"; element: UnionElement }
  | { type: "MoveNode"; id: ID; newPosition: Point2; oldPosition: Point2 }
  | { type: "MoveEdgeStart"; id: ID; newPosition: Point2; oldPosition: Point2 }
  | { type: "MoveEdgeEnd"; id: ID; newPosition: Point2; oldPosition: Point2 }
  | {
      type: "MoveEdgeBody";
      id: ID;
      deltaStart: Point2;
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
  | { type: "ChangeEdgeLength"; id: ID; delta: number }
  | { type: "GroundNode"; id: ID; grounded: boolean }
  | { type: "TightenBelt"; id: ID; tightened: boolean }
  | {
      type: "SwitchMeshedGearDirection";
      id: ID;
      index: number;
      direction: boolean;
    }
  | {
      type: "ChangeGearRadius";
      id: ID;
      newRadius: number;
      oldRadius: number;
    }
  | {
      type: "ChangeGearAngle";
      id: ID;
      newAngle: number;
      oldAngle: number;
    }
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
    };
