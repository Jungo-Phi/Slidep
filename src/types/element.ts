/**
 * Types for mechanical elements in slidep
 * Following architecture patterns: PascalCase for types, camelCase for properties
 */

import { Point2 } from "./point2";

/** Union type for all element types */
export type ElementType =
  | MechanicalElementType
  | ConstraintElementType
  | LoadElementType;

/** Supported mechanical element types */
export type MechanicalElementType = NodeType | EdgeType;

/** Supported node element types */
export type NodeType = "pivot" | "slider" | "slidep" | "join" | "mass" | "gear";

/** Supported edge element types */
export type EdgeType = "beam" | "spring" | "damper" | "belt";

/** Supported load element types */
export type LoadElementType = "force" | "moment" | "distributed-force";

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
export type UnionElement = MechanicalElement | ConstraintElement | LoadElement;

/** Union type for all load element types */
export type LoadElement =
  | ForceElement
  | MomentElement
  | DistributedForceElement;

/** Union type for all mechanical element types */
export type MechanicalElement = NodeElement | BodyElement | EdgeElement;

/** Supported node elements */
export type NodeElement =
  | PivotElement
  | SliderElement
  | SlidepElement
  | JoinElement
  | MassElement;

/** Supported body elements */
export type BodyElement = GearElement;

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

export type ID = `${string}-${string}-${string}-${string}-${string}`; // UUID

/** Base interface for all elements */
export interface BaseElement {
  type: ElementType;
  id: ID;
  name?: string;
  probes?: ProbeConfig[];
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

export interface MotorConfig {
  parentBeamID?: ID; // undefined = sol (seulement si le pivot est groundé)
  speed: number; // tr/min
}

/** Pivot element - allows rotational motion */
export interface PivotElement extends BaseNodeElement {
  type: "pivot";
  rotatingEdgesIDs: ID[];
  fixedGearsIDs: ID[];
  motor?: MotorConfig;
}

/** Slidep element (Pivot on a Slider) - allows linear motion along a beam and rotational motion */
export interface SlidepElement extends BaseNodeElement {
  type: "slidep";
  parentBeamID?: ID;
  rotatingEdgesIDs: ID[];
  fixedGearsIDs: ID[];
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

/** Base interface for Body elements (defined by a position and angle) */
export interface BaseBodyElement extends BaseElement {
  position: Point2;
  angle: number;
}

/** Gear element - rotational transmission with teeth */
export interface GearElement extends BaseBodyElement {
  type: "gear";
  radius: number;
  parentAxleID: ID; // PivotElement ou SlidepElement (jamais null)
  fixedNodesBodyIDs: ID[];
  meshedGearsIDs: ID[];
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
  /** Rendering only: natural length at simulation start, set on the displayed
   *  copy by apply_snapshot_to_mechanism so the coil count stays fixed while the
   *  drawn length varies (accordion). Undefined in edition. */
  restLength?: number;
}

/** Damper element - energy dissipation */
export interface DamperElement extends BaseEdgeElement {
  type: "damper";
  damping: number;
  /** Rendering only: natural length at simulation start (see SpringElement). */
  restLength?: number;
}

/**
 * Belt element - flexible transmission
 *
 * The order of connected Gears (with directions) is the path of the belt from start to end
 *
 * Direction {true: counterClockwise, false: clockwise}
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
  flipStart: boolean;
  flipEnd: boolean;
  couterClockwise: boolean;
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

// ─── Load elements ────────────────────────────────────────────────────────────

/** Force applied to a node or an edge endpoint */
export interface ForceElement {
  type: "force";
  id: ID;
  name?: string;
  targetID: ID;
  anchor?: "start" | "end"; // only for edge targets
  vector: Point2; // direction + magnitude in world coordinates
}

/** Moment applied to an edge or a gear (never a node) */
export interface MomentElement {
  type: "moment";
  id: ID;
  name?: string;
  targetID: ID;
  value: number;
  clockwise: boolean;
}

/** Distributed force along a beam — two draggable vectors at each endpoint */
export interface DistributedForceElement {
  type: "distributed-force";
  id: ID;
  name?: string;
  beamID: ID;
  vectorStart: Point2;
  vectorEnd: Point2;
}

// ─── Probes ───────────────────────────────────────────────────────────────────

export type ProbeMetric =
  | "position-x"
  | "position-y"
  | "velocity-x"
  | "velocity-y"
  | "force"
  | "moment"
  | "stress";

export interface ProbeConfig {
  metric: ProbeMetric;
  showGraph: boolean;
  showProbe: boolean;
}
