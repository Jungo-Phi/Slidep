/**
 * The single declaration of every ID reference an element can hold.
 *
 * `ELEMENT_REFS` maps each element type to its reference fields, saying what
 * each may point to and whether it must resolve. Validation, repair and test
 * generation all read this table instead of enumerating fields by hand.
 *
 * Reference fields are derived from the types, not from naming conventions, so
 * adding one to an element breaks compilation until it is declared here.
 */

import type {
  BeamElement,
  BeltElement,
  DamperElement,
  DimensionAngle,
  DimensionBelt,
  DimensionEdgeElement,
  DimensionEdgeToNode,
  DimensionNodeToNode,
  DimensionRadius,
  DistributedForceElement,
  ElementType,
  EqualEdges,
  ForceElement,
  GearElement,
  GearRatio,
  HorizontalAlignEdge,
  HorizontalAlignNodes,
  ID,
  JoinElement,
  LoadFrame,
  MassElement,
  MomentElement,
  NormalEdges,
  ParallelEdges,
  PivotElement,
  SlidepElement,
  SliderElement,
  SpringElement,
  UnionElement,
  VerticalAlignEdge,
  VerticalAlignNodes,
} from "./element";

// ─── Target sets ──────────────────────────────────────────────────────────────

export const NODE_TYPES = [
  "pivot",
  "slider",
  "slidep",
  "join",
  "mass",
] as const satisfies readonly ElementType[];

export const EDGE_TYPES = [
  "beam",
  "spring",
  "damper",
  "belt",
] as const satisfies readonly ElementType[];

/**
 * Edges an alignment constraint may hold. A belt takes the shape its pulleys
 * impose, so aligning it means nothing — the hover refuses it too.
 */
const ALIGNABLE_EDGE_TYPES = [
  "beam",
  "spring",
  "damper",
] as const satisfies readonly ElementType[];

/** A node's edge lists also hold gears pinned to its perimeter, and a moment turns either. */
const EDGE_OR_GEAR = [...EDGE_TYPES, "gear"] as const;

const NODE_OR_EDGE = [...NODE_TYPES, ...EDGE_TYPES] as const;

// ─── Reference key derivation ─────────────────────────────────────────────────

type IsTrue<T> = true extends T ? true : false;

/**
 * Whether `T` can hold an `ID`, looking through arrays, unions and nested
 * objects. Tests `T extends ID` and never the reverse: `ID` is a template
 * literal subtype of `string`, so the opposite direction would match every
 * plain string field.
 */
type HoldsID<T> = T extends ID
  ? true
  : T extends (...args: never[]) => unknown
    ? false
    : T extends readonly (infer U)[]
      ? IsTrue<HoldsID<NonNullable<U>>>
      : T extends object
        ? IsTrue<{ [K in keyof T]-?: HoldsID<NonNullable<T[K]>> }[keyof T]>
        : false;

/** The keys of `T` that hold references to other elements. */
export type RefKeys<T> = Exclude<
  {
    [K in keyof T]-?: IsTrue<HoldsID<NonNullable<T[K]>>> extends true
      ? K
      : never;
  }[keyof T],
  "id"
>;

type Assert<T extends true> = T;

/** A plain `string` field must never be taken for a reference. */
export type NoStringFalsePositive = Assert<
  IsTrue<HoldsID<string>> extends false ? true : false
>;

/** A literal element type must never be taken for a reference. */
export type NoTypeTagFalsePositive = Assert<
  IsTrue<HoldsID<"dimension-edge-to-node">> extends false ? true : false
>;

// ─── Table shape ──────────────────────────────────────────────────────────────

interface RefSpecBase {
  /** The element types this reference may point to. */
  target: readonly ElementType[];
  /** Whether the field must resolve to an existing element. */
  required: boolean;
}

/**
 * A reference field of element type `T` holding a value of type `V`.
 *
 * A bare `ID` or `ID[]` needs nothing more: reading and repairing it are
 * generic. Any other shape declares `extract` to read its IDs and `prune` to
 * return the element without the dead ones — the two come as a pair, so a
 * reference the table can read is always one it can repair.
 */
export type RefSpec<T = never, V = unknown> = RefSpecBase &
  (
    | { extract?: undefined; prune?: undefined }
    | {
        extract: (value: V) => ID[];
        prune: (element: T, dead: (id: ID) => boolean) => T;
      }
  );

/** A spec read back from the table, where the element it belongs to is no longer known. */
export type AnyRefSpec = RefSpecBase & {
  extract?: (value: never) => ID[];
  prune?: (element: never, dead: (id: ID) => boolean) => UnionElement;
};

export type RefTable<T> = {
  [K in RefKeys<T>]-?: RefSpec<T, NonNullable<T[K]>>;
};

type ElementOfType<K extends ElementType> = Extract<UnionElement, { type: K }>;

// ─── Mechanical elements ──────────────────────────────────────────────────────

const SLIDER_REFS: RefTable<SliderElement> = {
  parentBeamID: { target: ["beam"], required: false },
  fixedEdgesIDs: { target: EDGE_OR_GEAR, required: false },
};

const PIVOT_REFS: RefTable<PivotElement> = {
  rotatingEdgesIDs: { target: EDGE_OR_GEAR, required: false },
  fixedGearsIDs: { target: ["gear"], required: false },
  motor: {
    target: ["beam"],
    required: false,
    extract: (motor) => (motor.parentBeamID ? [motor.parentBeamID] : []),
    // Clearing `parentBeamID` alone would leave a motor neither grounded nor
    // carried by a beam, which is invalid in itself: the motor goes instead.
    prune: (pivot) => ({ ...pivot, motor: undefined }),
  },
};

const SLIDEP_REFS: RefTable<SlidepElement> = {
  parentBeamID: { target: ["beam"], required: false },
  rotatingEdgesIDs: { target: EDGE_OR_GEAR, required: false },
  fixedGearsIDs: { target: ["gear"], required: false },
};

const JOIN_REFS: RefTable<JoinElement> = {
  fixedEdgesIDs: { target: EDGE_OR_GEAR, required: false },
};

const MASS_REFS: RefTable<MassElement> = {
  fixedEdgesIDs: { target: EDGE_OR_GEAR, required: false },
};

const GEAR_REFS: RefTable<GearElement> = {
  parentAxleID: { target: ["pivot", "slidep"], required: true },
  fixedNodesBodyIDs: { target: NODE_TYPES, required: false },
  meshedGearsIDs: { target: ["gear"], required: false },
  attachedBeltID: { target: ["belt"], required: false },
};

const BEAM_REFS: RefTable<BeamElement> = {
  fixedNodeStartID: { target: NODE_TYPES, required: false },
  fixedNodeEndID: { target: NODE_TYPES, required: false },
  fixedNodesBodyIDs: { target: NODE_TYPES, required: false },
};

const SPRING_REFS: RefTable<SpringElement> = {
  fixedNodeStartID: { target: NODE_TYPES, required: false },
  fixedNodeEndID: { target: NODE_TYPES, required: false },
};

const DAMPER_REFS: RefTable<DamperElement> = {
  fixedNodeStartID: { target: NODE_TYPES, required: false },
  fixedNodeEndID: { target: NODE_TYPES, required: false },
};

const BELT_REFS: RefTable<BeltElement> = {
  fixedNodeStartID: { target: NODE_TYPES, required: false },
  fixedNodeEndID: { target: NODE_TYPES, required: false },
  attachedGearsIDs: {
    target: ["gear"],
    required: false,
    extract: (gears) => gears.map((gear) => gear.id),
    // `disconnectedGearIndices` and `gearWraps` index into the list, so dropping
    // an entry shifts them. Both are simulation caches: clearing them is enough.
    prune: (belt, dead) => ({
      ...belt,
      attachedGearsIDs: belt.attachedGearsIDs.filter((gear) => !dead(gear.id)),
      disconnectedGearIndices: undefined,
      gearWraps: undefined,
    }),
  },
};

// ─── Constraint elements ──────────────────────────────────────────────────────

const DIMENSION_EDGE_REFS: RefTable<DimensionEdgeElement> = {
  edgeID: { target: EDGE_TYPES, required: true },
};

const DIMENSION_NODE_TO_NODE_REFS: RefTable<DimensionNodeToNode> = {
  startNodeID: { target: NODE_TYPES, required: true },
  endNodeID: { target: NODE_TYPES, required: true },
};

const DIMENSION_EDGE_TO_NODE_REFS: RefTable<DimensionEdgeToNode> = {
  edgeID: { target: EDGE_TYPES, required: true },
  nodeID: { target: NODE_TYPES, required: true },
};

const DIMENSION_ANGLE_REFS: RefTable<DimensionAngle> = {
  startEdgeID: { target: EDGE_TYPES, required: true },
  endEdgeID: { target: EDGE_TYPES, required: true },
};

const DIMENSION_RADIUS_REFS: RefTable<DimensionRadius> = {
  gearID: { target: ["gear"], required: true },
};

const DIMENSION_BELT_REFS: RefTable<DimensionBelt> = {
  beltID: { target: ["belt"], required: true },
};

const HORIZONTAL_ALIGN_EDGE_REFS: RefTable<HorizontalAlignEdge> = {
  edgeID: { target: ALIGNABLE_EDGE_TYPES, required: true },
};

const HORIZONTAL_ALIGN_NODES_REFS: RefTable<HorizontalAlignNodes> = {
  startNodeID: { target: NODE_TYPES, required: true },
  endNodeID: { target: NODE_TYPES, required: true },
};

const VERTICAL_ALIGN_EDGE_REFS: RefTable<VerticalAlignEdge> = {
  edgeID: { target: ALIGNABLE_EDGE_TYPES, required: true },
};

const VERTICAL_ALIGN_NODES_REFS: RefTable<VerticalAlignNodes> = {
  startNodeID: { target: NODE_TYPES, required: true },
  endNodeID: { target: NODE_TYPES, required: true },
};

const NORMAL_REFS: RefTable<NormalEdges> = {
  startEdgeID: { target: EDGE_TYPES, required: true },
  endEdgeID: { target: EDGE_TYPES, required: true },
};

const PARALLEL_REFS: RefTable<ParallelEdges> = {
  startEdgeID: { target: EDGE_TYPES, required: true },
  endEdgeID: { target: EDGE_TYPES, required: true },
};

const EQUAL_REFS: RefTable<EqualEdges> = {
  startEdgeID: { target: EDGE_TYPES, required: true },
  endEdgeID: { target: EDGE_TYPES, required: true },
};

const GEAR_RATIO_REFS: RefTable<GearRatio> = {
  startGearID: { target: ["gear"], required: true },
  endGearID: { target: ["gear"], required: true },
};

// ─── Load elements ────────────────────────────────────────────────────────────

/** A load's `frame` carries an edge reference in its "edge" variant only. Losing that edge falls back to world coordinates. */
const frame_edge_ref = <T extends { frame: LoadFrame }>(): RefSpec<
  T,
  LoadFrame
> => ({
  target: EDGE_TYPES,
  required: false,
  extract: (frame) => (frame === "world" ? [] : [frame.edgeID]),
  prune: (load) => ({ ...load, frame: "world" }),
});

const FORCE_REFS: RefTable<ForceElement> = {
  targetID: { target: NODE_OR_EDGE, required: true },
  frame: frame_edge_ref(),
};

const DISTRIBUTED_FORCE_REFS: RefTable<DistributedForceElement> = {
  targetID: { target: ["beam"], required: true },
  frame: frame_edge_ref(),
};

const MOMENT_REFS: RefTable<MomentElement> = {
  targetID: { target: EDGE_OR_GEAR, required: true },
};

// ─── The table ────────────────────────────────────────────────────────────────

export const ELEMENT_REFS: {
  [K in ElementType]: RefTable<ElementOfType<K>>;
} = {
  slider: SLIDER_REFS,
  pivot: PIVOT_REFS,
  slidep: SLIDEP_REFS,
  join: JOIN_REFS,
  mass: MASS_REFS,
  gear: GEAR_REFS,
  beam: BEAM_REFS,
  spring: SPRING_REFS,
  damper: DAMPER_REFS,
  belt: BELT_REFS,
  "dimension-edge": DIMENSION_EDGE_REFS,
  "dimension-node-to-node": DIMENSION_NODE_TO_NODE_REFS,
  "dimension-edge-to-node": DIMENSION_EDGE_TO_NODE_REFS,
  "dimension-angle": DIMENSION_ANGLE_REFS,
  "dimension-radius": DIMENSION_RADIUS_REFS,
  "dimension-belt": DIMENSION_BELT_REFS,
  "horizontal-align-edge": HORIZONTAL_ALIGN_EDGE_REFS,
  "horizontal-align-nodes": HORIZONTAL_ALIGN_NODES_REFS,
  "vertical-align-edge": VERTICAL_ALIGN_EDGE_REFS,
  "vertical-align-nodes": VERTICAL_ALIGN_NODES_REFS,
  normal: NORMAL_REFS,
  parallel: PARALLEL_REFS,
  equal: EQUAL_REFS,
  "gear-ratio": GEAR_RATIO_REFS,
  force: FORCE_REFS,
  "distributed-force": DISTRIBUTED_FORCE_REFS,
  moment: MOMENT_REFS,
};

// ─── Reading the table ────────────────────────────────────────────────────────

/** The references one field of an element holds, resolved through its `RefSpec`. */
export interface ElementRefField {
  field: string;
  ids: ID[];
  spec: AnyRefSpec;
}

/** One reference held by an element, resolved through its `RefSpec`. */
export interface ElementRef {
  field: string;
  id: ID;
  spec: AnyRefSpec;
}

/**
 * Every reference field of `element`, in table order, each with the IDs it
 * currently holds. An absent optional field yields an empty `ids`, which is how
 * a `required` field with nothing in it is detected.
 */
export function element_ref_fields(element: UnionElement): ElementRefField[] {
  const table = ELEMENT_REFS[element.type] as Record<string, AnyRefSpec>;
  return Object.entries(table).map(([field, spec]) => {
    const value = (element as unknown as Record<string, unknown>)[field];
    if (value === undefined || value === null) return { field, ids: [], spec };
    const ids = spec.extract
      ? spec.extract(value as never)
      : Array.isArray(value)
        ? (value as ID[])
        : [value as ID];
    return { field, ids, spec };
  });
}

/** Every reference `element` holds, flattened. */
export function element_refs(element: UnionElement): ElementRef[] {
  return element_ref_fields(element).flatMap(({ field, ids, spec }) =>
    ids.map((id) => ({ field, id, spec })),
  );
}
