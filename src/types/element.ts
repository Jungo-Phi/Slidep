/**
 * Types for mechanical elements in slidep
 * Following architecture patterns: PascalCase for types, camelCase for properties
 */

import { WorldPoint } from "./mechanism";
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

/** Supported constraint element types */
export type ConstraintElementType = DimensionElementType | GeometricElementType;

/** Supported dimension constraint element types */
export type DimensionElementType =
  | "dimension-edge"
  | "dimension-node-to-node"
  | "dimension-edge-to-node"
  | "dimension-angle"
  | "dimension-radius"
  | "dimension-belt"
  | "gear-ratio";

/** Supported geometric constraint element types */
export type GeometricElementType =
  | "horizontal-align-edge"
  | "horizontal-align-nodes"
  | "vertical-align-edge"
  | "vertical-align-nodes"
  | "normal"
  | "parallel"
  | "equal";

/** Supported load element types */
export type LoadElementType = "force" | "moment" | "distributed-force";

/** Union type for all element types */
export type UnionElement = MechanicalElement | ConstraintElement | LoadElement;

/** Union type for all load element types */
export type LoadElement =
  | ForceElement
  | DistributedForceElement
  | MomentElement;

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

/** Union type for all dimension and constraint element types */
export type ConstraintElement = DimensionElement | GeometricElement;

/** Union type for all dimension constraint element types */
export type DimensionElement =
  | DimensionEdgeElement
  | DimensionNodeToNode
  | DimensionEdgeToNode
  | DimensionAngle
  | DimensionRadius
  | DimensionBelt
  | GearRatio;

/** Union type for all geometric constraint element types */
export type GeometricElement =
  | HorizontalAlignEdge
  | HorizontalAlignNodes
  | VerticalAlignEdge
  | VerticalAlignNodes
  | NormalEdges
  | ParallelEdges
  | EqualEdges;

/** Per-element overlay visibility */
export type OverlayFlags = Partial<Record<OverlayKind, boolean>>;

export type OverlayKind = "trajectory" | "force" | "velocity" | "stress";

export const OVERLAY_KIND_ORDER: OverlayKind[] = [
  "trajectory",
  "force",
  "velocity",
  "stress",
];

// ─── ID ───────────────────────────────────────────────────────────────────────

export type ID = `${string}-${string}-${string}-${string}-${string}`; // UUID

// ─── Base elements ────────────────────────────────────────────────────────────

/** Base interface for all elements */
export interface BaseElement {
  type: ElementType;
  id: ID;
}

/** Base interface for Mechanical elements */
export interface BaseMechanicalElement extends BaseElement {
  name?: string;
  probes: ProbeConfig[];
  overlays: OverlayFlags;
}

/** Base interface for Node elements (defined by a position) */
export interface BaseNodeElement extends BaseMechanicalElement {
  position: WorldPoint;
  isGrounded: boolean;
}

/** Base interface for Body elements (defined by a position and angle) */
export interface BaseBodyElement extends BaseMechanicalElement {
  position: WorldPoint;
  angle: number;
}

/** Base interface for Edge elements (defined by two points) */
export interface BaseEdgeElement extends BaseMechanicalElement {
  positionStart: WorldPoint;
  positionEnd: WorldPoint;
  fixedNodeStartID?: ID;
  fixedNodeEndID?: ID;
}

/** Base interface for Dimension elements (relative to machanical elements) */
export interface DimensionBaseElement extends BaseElement {
  name?: string;
  position: WorldPoint;
}

/** Base interface for Constraint elements (no positions, relative to machanical elements) */
export interface GeometricBaseElement extends BaseElement {}

/** Base interface for Load elements (relative to machanical elements) */
export interface LoadBaseElement extends BaseElement {
  name?: string;
  targetID: ID;
}

// ─── Mechanical elements ──────────────────────────────────────────────────────

/** Slider element - allows linear motion along a beam */
export interface SliderElement extends BaseNodeElement {
  type: "slider";
  parentBeamID?: ID;
  fixedEdgesIDs: ID[];
  slidingFriction: number;
}

export interface MotorConfig {
  parentBeamID?: ID; // undefined means anchored to ground
  /** tr/min, signed: (positive = clockwise, negative = counter-clockwise) */
  speed: number;
}

/** Pivot element - allows rotational motion */
export interface PivotElement extends BaseNodeElement {
  type: "pivot";
  rotatingEdgesIDs: ID[];
  fixedGearsIDs: ID[];
  motor?: MotorConfig;
  rotationalFriction: number;
}

/** Slidep element (Pivot on a Slider) - allows linear motion along a beam and rotational motion */
export interface SlidepElement extends BaseNodeElement {
  type: "slidep";
  parentBeamID?: ID;
  rotatingEdgesIDs: ID[];
  fixedGearsIDs: ID[];
  slidingFriction: number;
  rotationalFriction: number;
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
export interface GearElement extends BaseBodyElement {
  type: "gear";
  radius: number;
  parentAxleID: ID; // pivot ou slidep (jamais null)
  fixedNodesBodyIDs: ID[];
  meshedGearsIDs: ID[];
  attachedBeltID?: ID;
  surfaceMass: number;
}

/** Beam element - rigid connection between two points */
export interface BeamElement extends BaseEdgeElement {
  type: "beam";
  fixedNodesBodyIDs: ID[];
  linearMass: number;
}

/** Spring element - elastic connection */
export interface SpringElement extends BaseEdgeElement {
  type: "spring";
  stiffness: number;
  /** The spring's natural length: the user's explicit value, or the drawn distance between its
   *  endpoints when unset. Feeds the kinematic solver's soft pull (see parsing.ts) and the drawn
   *  coil count; frozen on the simulated copy by apply_snapshot_to_mechanism so the coil count
   *  stays fixed while the drawn length varies (accordion). */
  restLength?: number;
}

/** Damper element - energy dissipation */
export interface DamperElement extends BaseEdgeElement {
  type: "damper";
  damping: number;
  /** Rendering only: natural length at simulation start, frozen on the displayed copy so the
   *  piston reach stays fixed while the drawn length varies. Undefined in edition. */
  restLength?: number;
}

/**
 * Belt element - flexible transmission
 *
 * The order of connected Gears (with directions) is the path of the belt from start to end
 */
export interface BeltElement extends BaseEdgeElement {
  type: "belt";
  attachedGearsIDs: { id: ID; clockwise: boolean }[];
  closed: boolean;
  /** Rendering only (simulation): indices into `attachedGearsIDs` of pulleys that
   *  lost belt contact this run, so the belt is drawn straight past them.
   *  Undefined in edition. */
  disconnectedGearIndices?: number[];
  /** Rendering only (simulation): continuous wrap angle per attached pulley;
   *  |value| > 2π ⇒ the belt has wound onto it (drawn as extra turns). */
  gearWraps?: number[];
}

// ─── Dimension constraints ────────────────────────────────────────────────────

/** Dimension edge element - dimension of edge length */
export interface DimensionEdgeElement extends DimensionBaseElement {
  type: "dimension-edge";
  edgeID: ID;
  value: number;
}

/** Dimension node to node element - dimension between two nodes */
export interface DimensionNodeToNode extends DimensionBaseElement {
  type: "dimension-node-to-node";
  startNodeID: ID;
  endNodeID: ID;
  value: number;
}

/** Dimension edge to node element - dimension between edge and node */
export interface DimensionEdgeToNode extends DimensionBaseElement {
  type: "dimension-edge-to-node";
  edgeID: ID;
  nodeID: ID;
  value: number;
}

/** Dimension angle element - dimension of angle between two edges */
export interface DimensionAngle extends DimensionBaseElement {
  type: "dimension-angle";
  startEdgeID: ID;
  endEdgeID: ID;
  flipStart: boolean;
  flipEnd: boolean;
  couterClockwise: boolean;
  value: number;
}

/** Dimension radius element - radius dimension of a gear */
export interface DimensionRadius extends DimensionBaseElement {
  type: "dimension-radius";
  gearID: ID;
  value: number;
}

/** Dimension belt length element - total length dimension of a belt */
export interface DimensionBelt extends DimensionBaseElement {
  type: "dimension-belt";
  beltID: ID;
  value: number;
}

// ─── Geometric constraints ────────────────────────────────────────────────────

/** Horizontal align edge element - horizontal constraint */
export interface HorizontalAlignEdge extends GeometricBaseElement {
  type: "horizontal-align-edge";
  edgeID: ID;
}

/** Horizontal align nodes element - horizontal constraint between two nodes */
export interface HorizontalAlignNodes extends GeometricBaseElement {
  type: "horizontal-align-nodes";
  startNodeID: ID;
  endNodeID: ID;
}

/** Vertical align edge element - vertical constraint */
export interface VerticalAlignEdge extends GeometricBaseElement {
  type: "vertical-align-edge";
  edgeID: ID;
}

/** Vertical align nodes element - vertical constraint between two nodes */
export interface VerticalAlignNodes extends GeometricBaseElement {
  type: "vertical-align-nodes";
  startNodeID: ID;
  endNodeID: ID;
}

/**
 * Normal element - perpendicular constraint between two edges
 */
export interface NormalEdges extends GeometricBaseElement {
  type: "normal";
  startEdgeID: ID;
  endEdgeID: ID;
}

/**
 * Parallel element - parallel constraint between two edges
 */
export interface ParallelEdges extends GeometricBaseElement {
  type: "parallel";
  startEdgeID: ID;
  endEdgeID: ID;
}

/**
 * Equal element - equal length constraint between two edges
 */
export interface EqualEdges extends GeometricBaseElement {
  type: "equal";
  startEdgeID: ID;
  endEdgeID: ID;
}

/**
 * Gear ration element - gear ratio constraint between two gears (start gear radius / end gear radius)
 */
export interface GearRatio extends DimensionBaseElement {
  type: "gear-ratio";
  startGearID: ID;
  endGearID: ID;
  value: number;
}

// ─── Load elements ────────────────────────────────────────────────────────────

/**
 * The reference frame a load's direction is expressed in.
 *  - "world": the direction is absolute
 *  - { mode: "edge", edgeID }: the direction is stored in the edge's local frame
 * (x = start→end axis, y = normal)
 *
 * 0° = axial, 90° = normal
 */
export type LoadFrame = "world" | { mode: "edge"; edgeID: ID };

/** Force applied to a node or an edge endpoint */
export interface ForceElement extends LoadBaseElement {
  type: "force";
  anchor?: "start" | "end";
  /** Force vector, expressed in the active `frame`'s coordinates. */
  vector: Point2;
  frame: LoadFrame;
}

/** Distributed force along a beam */
export interface DistributedForceElement extends LoadBaseElement {
  type: "distributed-force";
  direction: Point2;
  magnitudeStart: number;
  magnitudeEnd: number;
  frame: LoadFrame;
}

/** Moment applied to an edge or a gear */
export interface MomentElement extends LoadBaseElement {
  type: "moment";
  /** N·m, signed: (positive = clockwise, negative = counter-clockwise) */
  value: number;
}

// ─── Probes ───────────────────────────────────────────────────────────────────

/** A metric family measured by a probe.
 * The probe carries one ProbeConfig per selected metric. */
export type ProbeMetric =
  | "position"
  | "velocity"
  | "angle"
  | "angular-velocity"
  | "force";

/** Which curves of a vector metric are plotted.
 * Ignored for scalar metrics (angle, angular velocity). */
export interface ProbeComponents {
  x: boolean;
  y: boolean;
  norm: boolean;
}

export interface ProbeConfig {
  metric: ProbeMetric;
  components: ProbeComponents;
}

export const DEFAULT_PROBE_COMPONENTS: ProbeComponents = {
  x: false,
  y: false,
  norm: true,
};
