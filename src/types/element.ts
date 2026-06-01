/**
 * Types for mechanical elements in slidep
 * Following architecture patterns: PascalCase for types, camelCase for properties
 */

import { Point2 } from "./point2";

/** Union type for all element types */
export type ElementType = MechanicalElementType | ConstraintElementType;

/** Supported mechanical element types */
export type MechanicalElementType = NodeType | EdgeType;

/** Supported node element types */
export type NodeType = "pivot" | "slider" | "slidep" | "join" | "mass" | "gear";

/** Supported edge element types */
export type EdgeType = "beam" | "spring" | "damper" | "belt";

/** Supported constraint element types */
export type ConstraintElementType =
  | "dimension-edge"
  | "dimension-node-to-node"
  | "dimension-edge-to-node"
  | "dimension-angle"
  | "dimension-radius"
  | "horizontal-align-edge"
  | "horizontal-align-nodes"
  | "vertical-align-edge"
  | "vertical-align-nodes"
  | "normal"
  | "parallel"
  | "equal"
  | "gear-ratio";

/** Union type for all element types */
export type UnionElement = MechanicalElement | ConstraintElement;

/** Union type for all mechanical element types */
export type MechanicalElement = NodeElement | EdgeElement;

/** Supported node elements */
export type NodeElement =
  | PivotElement
  | SliderElement
  | SlidepElement
  | JoinElement
  | MassElement
  | GearElement;

/** Supported edge elements */
export type EdgeElement =
  | BeamElement
  | SpringElement
  | DamperElement
  | BeltElement;

/** Union type for all constraint element types */
export type ConstraintElement =
  | DimentionEdgeElement
  | DimentionNodeToNode
  | DimentionEdgeToNode
  | DimentionAngle
  | DimentionRadius
  | HorizontalAlignEdge
  | HorizontalAlignNodes
  | VerticalAlignEdge
  | VerticalAlignNodes
  | NormalEdges
  | ParallelEdges
  | EqualEdges
  | GearRatio;

export type ID = number;

export function shown_element_name(element: UnionElement | undefined): String {
  if (!element) return "introuvable";
  let name: string = element.type;
  if (name.includes("dimension")) name = "dimension";
  if (name.includes("horizontal")) name = "horizontal";
  if (name.includes("vertical")) name = "vertical";
  return (
    name.charAt(0).toUpperCase() +
    name.slice(1) +
    " " +
    element.id.toString().padStart(3, "0")
  );
}

/** Base interface for all elements */
export interface BaseElement {
  type: ElementType;
  id: ID;
}

/** Base interface for Node elements (defined by a position) */
export interface BaseNodeElement extends BaseElement {
  position: Point2;
  isGrounded: boolean;
}

/** Slider element - allows linear motion along a beam */
export interface SliderElement extends BaseNodeElement {
  type: "slider";
  parentBeamID?: ID;
  fixedEdgesIDs: ID[];
}

/** Pivot element - allows rotational motion */
export interface PivotElement extends BaseNodeElement {
  type: "pivot";
  rotatingEdgesIDs: ID[];
}

/** Slidep element (Pivot on a Slider) - allows linear motion along a beam and rotational motion */
export interface SlidepElement extends BaseNodeElement {
  type: "slidep";
  parentBeamID?: ID;
  rotatingEdgesIDs: ID[];
}

/** Join element - rigid connection between edges */
export interface JoinElement extends BaseNodeElement {
  type: "join";
  fixedEdgesIDs: ID[];
}

/** Mass element - point mass with inertia */
export interface MassElement extends BaseNodeElement {
  type: "mass";
  fixedEdgesIDs: ID[];
  mass: number;
}

/** Gear element - rotational transmission with teeth */
export interface GearElement extends BaseNodeElement {
  type: "gear";
  radius: number;
  rotatingEdgesIDs: ID[];
  fixedEdgesIDs: ID[];
  meshedGearsIDs: ID[];
  fixedGearsIDs: ID[];
  attachedBeltID?: ID;
}

/** Base interface for Edge elements (defined by two points) */
export interface BaseEdgeElement extends BaseElement {
  positionStart: Point2;
  positionEnd: Point2;
  fixedNodeStartID?: ID;
  fixedNodeEndID?: ID;
}

/** Beam element - rigid connection between two points */
export interface BeamElement extends BaseEdgeElement {
  type: "beam";
  fixedNodesBodyIDs: ID[];
}

/** Spring element - elastic connection */
export interface SpringElement extends BaseEdgeElement {
  type: "spring";
  stiffness: number;
}

/** Damper element - energy dissipation */
export interface DamperElement extends BaseEdgeElement {
  type: "damper";
  damping: number;
}

/**
 * Belt element - flexible transmission
 *
 * The order of connected Gears (with directions) is the path of the belt from start to end
 *
 * Direction {true: counterclockwise, false: clockwise}
 */
export interface BeltElement extends BaseEdgeElement {
  type: "belt";
  attachedGearsIDs: { id: ID; direction: boolean }[];
  tight: boolean;
}

/** Constraint element */
export interface ConstraintBaseElement extends BaseElement {
  position: Point2;
}

/** Dimention edge element - dimension of edge length */
export interface DimentionEdgeElement extends ConstraintBaseElement {
  type: "dimension-edge";
  edgeID: ID;
  value: number;
}

/** Dimention node to node element - dimension between two nodes */
export interface DimentionNodeToNode extends ConstraintBaseElement {
  type: "dimension-node-to-node";
  startNodeID: ID;
  endNodeID: ID;
  value: number;
}

/** Dimention edge to node element - dimension between edge and node */
export interface DimentionEdgeToNode extends ConstraintBaseElement {
  type: "dimension-edge-to-node";
  edgeID: ID;
  nodeID: ID;
  value: number;
}

/** Dimention angle element - dimension of angle between two edges */
export interface DimentionAngle extends ConstraintBaseElement {
  type: "dimension-angle";
  startEdgeID: ID;
  endEdgeID: ID;
  value: number;
}

/** Dimention radius element - radius dimension of a gear */
export interface DimentionRadius extends ConstraintBaseElement {
  type: "dimension-radius";
  gearID: ID;
  value: number;
}

/** Horizontal align edge element - horizontal constraint */
export interface HorizontalAlignEdge extends ConstraintBaseElement {
  type: "horizontal-align-edge";
  edgeID: ID;
}

/** Horizontal align nodes element - horizontal constraint between two nodes */
export interface HorizontalAlignNodes extends ConstraintBaseElement {
  type: "horizontal-align-nodes";
  startNodeID: ID;
  endNodeID: ID;
}

/** Vertical align edge element - vertical constraint */
export interface VerticalAlignEdge extends ConstraintBaseElement {
  type: "vertical-align-edge";
  edgeID: ID;
}

/** Vertical align nodes element - vertical constraint between two nodes */
export interface VerticalAlignNodes extends ConstraintBaseElement {
  type: "vertical-align-nodes";
  startNodeID: ID;
  endNodeID: ID;
}

/**
 * Normal element - perpendicular constraint between two edges
 */
export interface NormalEdges extends ConstraintBaseElement {
  type: "normal";
  startEdgeID: ID;
  endEdgeID: ID;
}

/**
 * Parallel element - parallel constraint between two edges
 */
export interface ParallelEdges extends ConstraintBaseElement {
  type: "parallel";
  startEdgeID: ID;
  endEdgeID: ID;
}

/**
 * Equal element - equal length constraint between two edges
 */
export interface EqualEdges extends ConstraintBaseElement {
  type: "equal";
  startEdgeID: ID;
  endEdgeID: ID;
}

/**
 * Gear ration element - gear ratio constraint between two gears (start gear radius / end gear radius)
 */
export interface GearRatio extends ConstraintBaseElement {
  type: "gear-ratio";
  startGearID: ID;
  endGearID: ID;
  value: number;
}
