import {
  MechanicalElement,
  ConstraintElement,
  EdgeElement,
  GearElement,
  NodeElement,
  UnionElement,
  ID,
  BeltElement,
  CanvasState,
  HoveredPart,
  LoadElement,
  BeamElement,
  Point2,
  CanvasStateType,
} from "../../types";
import {
  HIT_TOLERANCE,
  DRAWING_ORDER,
  INTERACTION_SPECS,
} from "../../constants/rendering-specs";
import {
  get_constraint_element_from_id,
  get_load_element_from_id,
  get_mechanical_element_from_id,
} from "../mechanism/connect-actions";
import {
  BELT_CANNOT_CLOSE,
  belt_can_close,
  belt_placing_pulleys,
  legality_for_state,
} from "../mechanism/connection-rules";
import { get_belt_path } from "../../utils";
import { belt_pieces, nearest_point_on_piece } from "../../utils/belt-path";
import {
  distributed_display_vectors,
  distributed_label_vector,
  force_base_position,
  force_display_vector,
  force_value_label_position,
  force_world_vector,
  frame2world,
  is_zero_load,
  moment_center_position,
  moment_display_radius,
  moment_value_label_position,
} from "../../utils/load-geom";
import { is_constraint_type } from "./utils";

/**
 * Where along `start`→`end` the cursor grabbed it, clamped to the segment.
 * Falls back to the middle for a segment with no length, which carries no
 * parameter at all.
 */
function grab_parameter(cursor: Point2, start: Point2, end: Point2): number {
  const t = cursor.parameter_on_segment(start, end);
  if (!Number.isFinite(t)) return 0.5;
  return Math.min(1, Math.max(0, t));
}

/**
 * How a target answers one tool, per family. `doc/hover-matrix.md` is the
 * readable form of the table below and explains every empty cell.
 */
type NodeProbe =
  /** The node itself. */
  | "centre"
  /** …and the node an edge is being drawn *past*, which lands on its body. */
  | "centre+past"
  /** Not the node but the gear its axle carries. */
  | "carried-gear";

type GearProbe =
  /** Rim point under the cursor. */
  | "rim"
  /** Rim point facing the gear being sized — the tangency of the two. */
  | "rim-toward-ref"
  /** The gear as a whole, designated by its centre. */
  | "whole";

export type EdgeProbe =
  /** Ends, then body — whatever the edge type. */
  | "ends+body"
  /** Ends, then body only if it is a beam. */
  | "ends+beam-body"
  /** Ends only. */
  | "ends"
  /** Body only, at the cursor. */
  | "body"
  /** Body only, designated by its middle. */
  | "body-centre";

export type BeltProbe =
  /** Ends, arcs and straight runs. */
  | "full"
  /** Arcs and straight runs, but not the ends. */
  | "runs+arcs"
  /** Straight runs only, at the tangency of the gear being sized. */
  | "runs-tangent"
  /** Ends only. */
  | "ends";

export type HoverTargets = {
  node?: NodeProbe;
  gear?: GearProbe;
  edge?: EdgeProbe;
  belt?: BeltProbe;
  /** Constraints and loads, which are only ever picked to be selected. */
  overlays?: true;
};

/** What a tool may pick, stated once for all six target families. */
const SELECT_ALL: HoverTargets = {
  node: "centre",
  gear: "rim",
  edge: "ends+body",
  belt: "full",
  overlays: true,
};

/** Placing or dragging something that attaches to the mechanism. */
const ATTACHING: HoverTargets = {
  node: "centre",
  gear: "rim",
  edge: "ends+beam-body",
  belt: "ends",
};

/** Same, for the two gestures that size a gear against what it meets. */
const SIZING_GEAR: HoverTargets = {
  node: "centre",
  gear: "rim-toward-ref",
  edge: "ends",
  belt: "runs-tangent",
};

/** Nothing is a target: the gesture reads the free cursor. */
const NOTHING: HoverTargets = {};

/**
 * The one place a tool declares what it may pick.
 *
 * `Record<CanvasStateType, …>` is the point: a new state does not compile until
 * it has answered for all six families. Before this table the answer was spread
 * over six parallel `switch`, and forgetting one was silent — the tool simply
 * stopped seeing a kind of target.
 */
export const HOVER_TARGETS: Record<CanvasStateType, HoverTargets> = {
  Selecting: SELECT_ALL,
  SelectedElement: SELECT_ALL,
  SelectedMultiple: SELECT_ALL,
  Erasing: SELECT_ALL,
  EditingValue: SELECT_ALL,
  PlacingValue: SELECT_ALL,
  // A rectangle drag picks by area, not by hover.
  SelectingMultiple: NOTHING,
  ErasingMultiple: NOTHING,

  MovingNode: ATTACHING,
  MovingEdgeStartPoint: { ...ATTACHING, node: "centre+past" },
  MovingEdgeEndPoint: { ...ATTACHING, node: "centre+past" },
  // Dragging a body offers the body itself, so other bodies are not targets.
  MovingEdgeBody: { ...ATTACHING, edge: "ends" },
  MovingBeltBody: { gear: "rim" },
  ChangingGearRadius: SIZING_GEAR,
  MovingSelectionMultiple: NOTHING,
  MovingConstraint: NOTHING,
  // A load being dragged follows its own snapping, on the free cursor.
  MovingForce: NOTHING,
  MovingDistributedForce: NOTHING,
  MovingMoment: NOTHING,
  SimulationDragging: NOTHING,

  PlacingBeamStart: ATTACHING,
  PlacingBeamEnd: { ...ATTACHING, node: "centre+past" },
  PlacingSpringStart: ATTACHING,
  PlacingSpringEnd: ATTACHING,
  PlacingDamperStart: ATTACHING,
  PlacingDamperEnd: ATTACHING,
  PlacingBeltStart: ATTACHING,
  PlacingBeltEnd: ATTACHING,
  PlacingPivot: ATTACHING,
  PlacingMotor: ATTACHING,
  PlacingSlider: ATTACHING,
  PlacingJoin: ATTACHING,
  PlacingMass: ATTACHING,
  PlacingGround: ATTACHING,
  PlacingGearStart: ATTACHING,
  PlacingGearRadius: SIZING_GEAR,

  PlacingForceStart: { node: "centre", edge: "ends+beam-body" },
  // The "…End" states define a vector, not a target.
  PlacingForceEnd: NOTHING,
  PlacingDistributedForce: NOTHING,
  PlacingMomentStart: {
    node: "carried-gear",
    gear: "whole",
    edge: "body-centre",
  },
  PlacingMomentEnd: NOTHING,
  PlacingProbe: { node: "centre", gear: "rim", edge: "body" },
  PlacingProbeMetrics: NOTHING,

  // A belt is measured whole, from its body, so only DimensionStart sees it.
  DimensionStart: {
    node: "centre",
    gear: "rim",
    edge: "body",
    belt: "runs+arcs",
  },
  DimensionNode: { node: "centre", edge: "body" },
  DimensionEdge: { node: "centre", edge: "body" },
  // Both operands are already known; only the label is left to place.
  DimensionNodeToNode: NOTHING,
  DimensionEdgeToNode: NOTHING,
  DimensionAngle: NOTHING,
  DimensionRadius: NOTHING,
  DimensionBelt: NOTHING,

  HorizontalVerticalConstraintStart: { node: "centre", edge: "body" },
  // Once the first node is picked, the constraint joins two nodes.
  HorizontalVerticalConstraintNode: { node: "centre" },
  NormalConstraintStart: { edge: "body" },
  NormalConstraintEdge: { edge: "body" },
  ParallelConstraintStart: { edge: "body" },
  ParallelConstraintEdge: { edge: "body" },
  EqualConstraintStart: { gear: "whole", edge: "body" },
  EqualConstraintEdge: { edge: "body" },
  EqualConstraintGear: { gear: "whole" },
  GearRatioConstraintStart: { gear: "whole" },
  GearRatioConstraintGear: { gear: "whole" },
};

/**
 * Where the edge being drawn or dragged runs from, for the "drawn past a node"
 * pick. Only a beam takes a node on its body.
 */
function drawn_past_base(
  state: CanvasState,
  mechanicalElements: MechanicalElement[],
): Point2 | undefined {
  if (state.type === "PlacingBeamEnd") return state.startHover.position;
  if (
    state.type !== "MovingEdgeStartPoint" &&
    state.type !== "MovingEdgeEndPoint"
  )
    return undefined;
  const edge = get_mechanical_element_from_id(
    state.elementID,
    mechanicalElements,
  );
  if (edge.type !== "beam") return undefined;
  return state.type === "MovingEdgeStartPoint"
    ? edge.positionEnd
    : edge.positionStart;
}

/**
 * The centre of the gear a sizing gesture is bringing to a target. It is what
 * both the gear tangency and the belt tangency are measured from — a rim point
 * would answer a different question.
 */
function placed_gear_center(
  state: CanvasState,
  mechanicalElements: MechanicalElement[],
): Point2 | undefined {
  if (state.type === "PlacingGearRadius") return state.startHover.position;
  if (state.type !== "ChangingGearRadius") return undefined;
  return (
    get_mechanical_element_from_id(
      state.elementID,
      mechanicalElements,
    ) as GearElement
  ).position;
}

function probe_node(
  node: NodeElement,
  mousePos: Point2,
  mode: NodeProbe,
  deleting: boolean,
  drawnPastBase: Point2 | undefined,
  mechanicalElements: MechanicalElement[],
): HoveredPart | null {
  const distance = mousePos.distance_to(node.position);

  // A moment aimed at an axle lands on the gear it carries: reaching for the
  // centre of a gear is a natural way to designate that gear, and the axle
  // itself takes no moment. Without this, only the rim is a target — the whole
  // middle of the gear is a dead zone.
  if (mode === "carried-gear") {
    if (distance > HIT_TOLERANCE.NODE) return null;
    if (!("fixedGearsIDs" in node) || node.fixedGearsIDs.length === 0)
      return null;
    // An axle can carry several gears; the first is the one the moment goes to.
    // Aiming at a specific gear's rim stays the way to pick.
    const gear = get_mechanical_element_from_id(
      node.fixedGearsIDs[0],
      mechanicalElements,
    ) as GearElement;
    return {
      type: "GearTooth",
      position: gear.position.clone(),
      id: gear.id,
      deleting: false,
    };
  }

  const hitRadius =
    HIT_TOLERANCE.NODE * (node.type === "pivot" && node.motor ? 1.5 : 1);
  if (distance <= hitRadius)
    return {
      type: "Node",
      position: node.position.clone(),
      id: node.id,
      deleting,
      beamBodyHover: false,
    };

  if (mode !== "centre+past" || !drawnPastBase) return null;
  if (
    node.position.distance2segment(drawnPastBase, mousePos) >
      HIT_TOLERANCE.EDGE ||
    mousePos.distance2line(drawnPastBase, node.position) > HIT_TOLERANCE.EDGE
  )
    return null;
  return {
    type: "Node",
    position: mousePos.project_on_line(drawnPastBase, node.position),
    id: node.id,
    deleting,
    beamBodyHover: true,
  };
}

function probe_gear(
  gear: GearElement,
  mousePos: Point2,
  mode: GearProbe,
  deleting: boolean,
  gearRef: Point2 | undefined,
): HoveredPart | null {
  // Only the rim answers: the whole inside of a gear is a dead zone.
  const distance = mousePos.distance_to(gear.position);
  if (
    distance > gear.radius + HIT_TOLERANCE.NODE / 2 ||
    distance < gear.radius - HIT_TOLERANCE.NODE / 2
  )
    return null;

  if (mode === "whole")
    return {
      type: "GearTooth",
      position: gear.position.clone(),
      id: gear.id,
      deleting: false,
    };

  const toward = mode === "rim-toward-ref" && gearRef ? gearRef : mousePos;
  return {
    type: "GearTooth",
    position: gear.position.add(
      toward.sub(gear.position).normalize().mul(gear.radius),
    ),
    id: gear.id,
    deleting,
  };
}

function probe_edge(
  edge: EdgeElement,
  mousePos: Point2,
  mode: EdgeProbe,
  deleting: boolean,
): HoveredPart | null {
  if (mode !== "body" && mode !== "body-centre") {
    if (mousePos.distance_to(edge.positionStart) <= HIT_TOLERANCE.NODE)
      return {
        type: "Edge",
        position: edge.positionStart.clone(),
        id: edge.id,
        deleting,
        part: "start",
      };
    if (mousePos.distance_to(edge.positionEnd) <= HIT_TOLERANCE.NODE)
      return {
        type: "Edge",
        position: edge.positionEnd.clone(),
        id: edge.id,
        deleting,
        part: "end",
      };
    if (mode === "ends") return null;
    if (mode === "ends+beam-body" && edge.type !== "beam") return null;
  }

  if (
    mousePos.distance2segment(edge.positionStart, edge.positionEnd) >
    HIT_TOLERANCE.EDGE
  )
    return null;
  return {
    type: "Edge",
    position:
      mode === "body-centre"
        ? edge.positionStart.lerp(edge.positionEnd, 0.5)
        : mousePos.project_on_line(edge.positionStart, edge.positionEnd),
    id: edge.id,
    deleting,
    part: "body",
  };
}

function probe_belt(
  belt: BeltElement,
  mousePos: Point2,
  mode: BeltProbe,
  deleting: boolean,
  gearRef: Point2 | undefined,
  mechanicalElements: MechanicalElement[],
): HoveredPart | null {
  if (mode === "ends" || mode === "full") {
    if (mousePos.distance_to(belt.positionStart) <= HIT_TOLERANCE.NODE)
      return {
        type: "Edge",
        position: belt.positionStart.clone(),
        id: belt.id,
        deleting,
        part: "start",
      };
    if (mousePos.distance_to(belt.positionEnd) <= HIT_TOLERANCE.NODE)
      return {
        type: "Edge",
        position: belt.positionEnd.clone(),
        id: belt.id,
        deleting,
        part: "end",
      };
    if (mode === "ends") return null;
  }

  // `section` is the index of the piece in this list, closed loop included, so
  // hit-testing and drawing name the same stretches of belt.
  const { vias, closed } = get_belt_path(belt, mechanicalElements);
  const pieces = belt_pieces(vias, closed);

  // Arcs first: a stretch wrapped on a pulley wins over the runs it joins, whose
  // ends it touches.
  if (mode === "full" || mode === "runs+arcs") {
    for (let section = 0; section < pieces.length; section++) {
      const piece = pieces[section];
      if (piece.kind !== "arc") continue;
      // Clamped to the swept sector, so the arc keeps its extent across the ±π
      // seam and never answers on the pulley's free side.
      const onArc = nearest_point_on_piece(mousePos, piece);
      if (mousePos.distance_to(onArc) > HIT_TOLERANCE.NODE / 2) continue;
      return {
        type: "BeltBody",
        position: onArc,
        id: belt.id,
        deleting,
        section,
      };
    }
  }

  for (let section = 0; section < pieces.length; section++) {
    const piece = pieces[section];
    if (piece.kind !== "segment") continue;
    const { from, to } = piece;
    if (mousePos.distance2segment(from, to) > HIT_TOLERANCE.EDGE) continue;

    if (mode === "runs-tangent") {
      // The run answers only where the gear can actually meet it: its centre
      // must project inside the segment, not past one of its ends.
      if (
        !gearRef ||
        gearRef.distance2segment(from, to) > gearRef.distance2line(from, to)
      )
        continue;
      return {
        type: "BeltBody",
        position: gearRef
          .project_on_line(from, to)
          .sub(gearRef)
          .extend_length(INTERACTION_SPECS.GEAR_ON_BELT_GROW)
          .add(gearRef),
        id: belt.id,
        deleting: false,
        section,
      };
    }
    return {
      type: "BeltBody",
      position: mousePos.project_on_line(from, to),
      id: belt.id,
      deleting,
      section,
    };
  }
  return null;
}

/** Returns the hovered part of the element, or null if no part is hovered. */
function get_hovered_part_of_element(
  element: UnionElement,
  mechanicalElements: MechanicalElement[],
  mousePos: Point2,
  state: CanvasState,
): HoveredPart | null {
  // TODO : à "PlacingBeltEnd", ignorer les gears avec le même parentAxle

  const targets = HOVER_TARGETS[state.type];
  const deleting = state.type === "Erasing";

  switch (element.type) {
    case "pivot":
    case "slider":
    case "slidep":
    case "join":
    case "mass":
      if (!targets.node) return null;
      return probe_node(
        element as NodeElement,
        mousePos,
        targets.node,
        deleting,
        drawn_past_base(state, mechanicalElements),
        mechanicalElements,
      );

    case "gear":
      if (!targets.gear) return null;
      return probe_gear(
        element as GearElement,
        mousePos,
        targets.gear,
        deleting,
        placed_gear_center(state, mechanicalElements),
      );

    case "beam":
    case "spring":
    case "damper":
      if (!targets.edge) return null;
      return probe_edge(
        element as EdgeElement,
        mousePos,
        targets.edge,
        deleting,
      );

    case "belt":
      if (!targets.belt) return null;
      return probe_belt(
        element as BeltElement,
        mousePos,
        targets.belt,
        deleting,
        placed_gear_center(state, mechanicalElements),
        mechanicalElements,
      );
  }

  if (!targets.overlays) return null;

  switch (element.type) {
    case "dimension-edge":
    case "dimension-node-to-node":
    case "dimension-edge-to-node":
    case "dimension-angle":
    case "dimension-radius":
    case "dimension-belt":
    case "horizontal-align-edge":
    case "horizontal-align-nodes":
    case "vertical-align-edge":
    case "vertical-align-nodes":
    case "normal":
    case "parallel":
    case "equal":
    case "gear-ratio":
      if (mousePos.distance_to(element.position) > HIT_TOLERANCE.CONSTRAINT)
        break;
      return {
        type: "Constraint",
        position: element.position.clone(),
        id: element.id,
        deleting: state.type === "Erasing",
      };
    case "force": {
      const base = force_base_position(element, mechanicalElements);
      const displayVector = force_display_vector(
        force_world_vector(element, mechanicalElements),
      );
      const valuePos = force_value_label_position(base, displayVector);
      // Tip handle + Arrow body
      const tip = base.add(displayVector);
      if (
        mousePos.distance_to(tip) <= HIT_TOLERANCE.NODE ||
        mousePos.distance2segment(base, tip) <= HIT_TOLERANCE.EDGE
      )
        return {
          type: "Force",
          position: tip,
          id: element.id,
          part: "body",
          deleting: state.type === "Erasing",
        };
      // Value
      if (mousePos.distance_to(valuePos) <= HIT_TOLERANCE.CONSTRAINT)
        return {
          type: "Force",
          position: valuePos,
          id: element.id,
          part: "value",
          deleting: state.type === "Erasing",
        };
      break;
    }
    case "moment": {
      const center = moment_center_position(element, mechanicalElements);
      const radius = moment_display_radius(element.value);
      const valuePos = moment_value_label_position(center, radius);
      const dist = mousePos.distance_to(center);
      if (
        dist <= radius + HIT_TOLERANCE.EDGE &&
        dist >= radius - HIT_TOLERANCE.EDGE
      ) {
        return {
          type: "Moment",
          position: center,
          id: element.id,
          part: "body",
          deleting: state.type === "Erasing",
        };
      }
      // Value
      if (mousePos.distance_to(valuePos) <= HIT_TOLERANCE.CONSTRAINT)
        return {
          type: "Moment",
          position: valuePos,
          id: element.id,
          part: "value",
          deleting: state.type === "Erasing",
        };
      break;
    }
    case "distributed-force": {
      const beam = get_mechanical_element_from_id(
        element.targetID,
        mechanicalElements,
      ) as BeamElement;
      const { displayStart, displayEnd } = distributed_display_vectors(
        element,
        mechanicalElements,
      );
      const tipStart = beam.positionStart.add(displayStart);
      const tipEnd = beam.positionEnd.add(displayEnd);
      // Same anchors as the drawing, via the same helper: an end whose arrow
      // has run out to nothing still hangs its label off the load's direction.
      const direction = frame2world(
        element.direction,
        element.frame,
        mechanicalElements,
      );
      const startValuePos = force_value_label_position(
        beam.positionStart,
        distributed_label_vector(displayStart, direction),
      );
      // Tip handles + Arrows body
      if (
        mousePos.distance_to(tipStart) <= HIT_TOLERANCE.NODE ||
        mousePos.distance2segment(beam.positionStart, tipStart) <=
          HIT_TOLERANCE.EDGE
      ) {
        return {
          type: "DistributedForce",
          position: tipStart,
          id: element.id,
          part: "start",
          deleting: state.type === "Erasing",
        };
      }
      if (
        mousePos.distance_to(tipEnd) <= HIT_TOLERANCE.NODE ||
        mousePos.distance2segment(beam.positionEnd, tipEnd) <=
          HIT_TOLERANCE.EDGE
      ) {
        return {
          type: "DistributedForce",
          position: tipEnd,
          id: element.id,
          part: "end",
          deleting: state.type === "Erasing",
        };
      }
      // Body + segment between tips
      if (
        mousePos.is_in_distributed_force(
          beam.positionStart,
          beam.positionEnd,
          displayStart,
          displayEnd,
        ) ||
        mousePos.distance2segment(tipStart, tipEnd) <= HIT_TOLERANCE.EDGE
      ) {
        return {
          type: "DistributedForce",
          position: mousePos.project_on_line(tipStart, tipEnd),
          id: element.id,
          part: "body",
          deleting: state.type === "Erasing",
          // The tips are the profile at t = 0 and t = 1, so the parameter along
          // the crest line is the parameter along the beam. A load with both
          // ends at zero has no crest line to read it off — grab its middle.
          t: grab_parameter(mousePos, tipStart, tipEnd),
        };
      }
      // Value. An end carrying nothing writes no label, so it offers no target
      // either — an invisible one would be a click into thin air. Its value is
      // reached by dragging its tip back out, or from the panel.
      if (
        !is_zero_load(element.magnitudeStart) &&
        mousePos.distance_to(startValuePos) <= HIT_TOLERANCE.CONSTRAINT
      )
        return {
          type: "DistributedForce",
          position: startValuePos,
          id: element.id,
          part: "start-value",
          deleting: state.type === "Erasing",
        };
      const endValuePos = force_value_label_position(
        beam.positionEnd,
        distributed_label_vector(displayEnd, direction),
      );
      if (
        !is_zero_load(element.magnitudeEnd) &&
        mousePos.distance_to(endValuePos) <= HIT_TOLERANCE.CONSTRAINT
      )
        return {
          type: "DistributedForce",
          position: endValuePos,
          id: element.id,
          part: "end-value",
          deleting: state.type === "Erasing",
        };
      break;
    }
  }
  return null;
}

/**
 * Where the cursor is held back to when an opaque element refuses it: the edge
 * of its hit zone. Nothing can then be dropped stacked on top of it — the
 * refusal is felt as a resistance rather than read as an error.
 *
 * Only a refusal with a point to push away from pushes back: a node's centre, or
 * the terminal of an edge. A gear is refused at its rim and a body along its
 * length, and neither has an inside to be pushed out of.
 */
function pushed_out_of(
  element: UnionElement,
  hoveredPart: HoveredPart,
  position: Point2,
): Point2 {
  const centre =
    "position" in element && element.type !== "gear"
      ? element.position
      : hoveredPart.type === "Edge" && hoveredPart.part !== "body"
        ? hoveredPart.position
        : undefined;
  if (!centre) return position;
  const radius =
    HIT_TOLERANCE.NODE * (element.type === "pivot" && element.motor ? 1.5 : 1);
  const distance = position.distance_to(centre);
  if (distance >= radius) return position;
  // Dead centre carries no direction to push along; any one will do.
  const direction =
    distance > 0 ? position.sub(centre).normalize() : new Point2(1, 0);
  return centre.add(direction.mul(radius));
}

/**
 * Detects which part of a mechanism is being hovered at a given point
 * Returns the hovered part and the corresponding point on that part
 */
export function get_hovered_part(
  mechanicalElements: MechanicalElement[],
  constraintElements: ConstraintElement[],
  loadElements: LoadElement[] = [],
  visibleConstraints: Map<ID, number>,
  mousePos: Point2,
  state: CanvasState,
): HoveredPart {
  // Picking only: an element being dragged is under the cursor by construction
  // and must never be its own target. What it may legally reach is decided by
  // legality_for_state.
  const excluded_elements: ID[] = [];
  if (
    state.type === "MovingNode" ||
    state.type === "MovingEdgeStartPoint" ||
    state.type === "MovingEdgeEndPoint" ||
    state.type === "MovingEdgeBody" ||
    state.type === "ChangingGearRadius"
  ) {
    excluded_elements.push(state.elementID);
  }
  // A node holding a belt terminal drags that terminal onto the cursor, so the
  // main loop would keep answering with the held end. Exclude such a belt and
  // let the closure section below offer its *other* terminal instead.
  if (state.type === "MovingNode") {
    for (const element of mechanicalElements)
      if (
        element.type === "belt" &&
        (element.fixedNodeStartID === state.elementID ||
          element.fixedNodeEndID === state.elementID)
      )
        excluded_elements.push(element.id);
  }
  if (state.type === "MovingConstraint") {
    const constraint = get_constraint_element_from_id(
      state.elementID,
      constraintElements,
    );
    excluded_elements.push(constraint.id);
  }
  if (state.type === "MovingForce" || state.type === "MovingDistributedForce") {
    const load = get_load_element_from_id(state.elementID, loadElements);
    excluded_elements.push(load.id);
  }

  const is_legal = legality_for_state(state, mechanicalElements);

  const position = mousePos.clone();

  const elements: UnionElement[] = (mechanicalElements as UnionElement[])
    .concat(constraintElements)
    .concat(loadElements);

  // Belt end back on its own start: the target is the belt's own terminal, so no rule in `legality_for_state` can be asked about it and the closure is gated here.
  // It precedes the element sweep because the start point usually sits on something — the rim of the gear the gesture started on, the node it started from — which would otherwise answer for it.
  if (
    state.type === "PlacingBeltEnd" &&
    mousePos.distance_to(state.startHover.position) <= HIT_TOLERANCE.NODE
  ) {
    if (
      !belt_can_close(
        belt_placing_pulleys(
          state.attachedGearsIDs,
          state.startHover.type === "GearTooth"
            ? state.startHover.id
            : undefined,
        ),
      )
    )
      return { type: "Void", position, rejected: BELT_CANNOT_CLOSE };
    return { type: "BeltClosure", position: state.startHover.position };
  }

  const hover_order = [...DRAWING_ORDER];
  hover_order.reverse();
  for (const type of hover_order) {
    const one_type_elements = elements.filter((e) => e.type === type).reverse();
    for (const element of one_type_elements) {
      if (excluded_elements.includes(element.id)) continue;
      // Skip constraints hidden by the current context (mode / tab / hover).
      if (
        is_constraint_type(element.type) &&
        !visibleConstraints.has(element.id)
      )
        continue;
      // Geometry first: legality is only consulted for an element the cursor is
      // actually over, otherwise an opaque refusal would block from anywhere.
      const hoveredPart = get_hovered_part_of_element(
        element,
        mechanicalElements,
        position,
        state,
      );
      if (!hoveredPart) continue;
      const verdict = is_legal(element, hoveredPart);
      if (verdict.allowed) return hoveredPart;
      if (verdict.blocks)
        return {
          type: "Void",
          position: pushed_out_of(element, hoveredPart, position),
          rejected: verdict.reason,
        };
    }
  }

  if (state.type === "MovingEdgeStartPoint") {
    const belt = get_mechanical_element_from_id(
      state.elementID,
      mechanicalElements,
    ) as EdgeElement;
    if (
      belt.type === "belt" &&
      mousePos.distance_to(belt.positionEnd) <= HIT_TOLERANCE.NODE
    ) {
      if (!belt_can_close(belt.attachedGearsIDs.length))
        return { type: "Void", position, rejected: BELT_CANNOT_CLOSE };
      return {
        type: "Edge",
        position: belt.positionEnd,
        id: state.elementID,
        deleting: false,
        part: "end",
      };
    }
  } else if (state.type === "MovingEdgeEndPoint") {
    const belt = get_mechanical_element_from_id(
      state.elementID,
      mechanicalElements,
    ) as EdgeElement;
    if (
      belt.type === "belt" &&
      mousePos.distance_to(belt.positionStart) <= HIT_TOLERANCE.NODE
    ) {
      if (!belt_can_close(belt.attachedGearsIDs.length))
        return { type: "Void", position, rejected: BELT_CANNOT_CLOSE };
      return {
        type: "Edge",
        position: belt.positionStart,
        id: state.elementID,
        deleting: false,
        part: "start",
      };
    }
  } else if (state.type === "MovingNode") {
    // A node holding one belt terminal, dragged onto that belt's *other*
    // terminal, closes the loop by becoming its junction. Offer the end the node
    // does not hold; the one it holds rides the cursor and is never the target.
    for (const belt of mechanicalElements) {
      if (belt.type !== "belt") continue;
      const holdsStart = belt.fixedNodeStartID === state.elementID;
      const holdsEnd = belt.fixedNodeEndID === state.elementID;
      if (holdsStart === holdsEnd) continue;
      const otherPos = holdsStart ? belt.positionEnd : belt.positionStart;
      if (mousePos.distance_to(otherPos) > HIT_TOLERANCE.NODE) continue;
      if (!belt_can_close(belt.attachedGearsIDs.length))
        return { type: "Void", position, rejected: BELT_CANNOT_CLOSE };
      return {
        type: "Edge",
        position: otherPos,
        id: belt.id,
        deleting: false,
        part: holdsStart ? "end" : "start",
      };
    }
  }

  return { type: "Void", position };
}

/**
 * Detects which elements of a mechanism are being hovered by a rectangle selection.
 * Returns a list of the hovered elements ids
 */
export function get_hovered_elements_by_rect(
  mechanicalElements: MechanicalElement[],
  rectStart: Point2,
  rectEnd: Point2,
): ID[] {
  const hoveredElements: ID[] = [];
  // Check each element to see if it intersects with the rectangle
  for (const element of mechanicalElements) {
    switch (element.type) {
      case "slider":
      case "pivot":
      case "slidep":
      case "join":
      case "mass":
      case "gear":
        const node = element as NodeElement;
        if (node.position.is_in_rect(rectStart, rectEnd)) {
          hoveredElements.push(node.id);
        }
        break;
      case "belt":
      case "beam":
      case "spring":
      case "damper":
        const edge = element as EdgeElement;
        if (
          edge.positionStart
            .lerp(edge.positionEnd, 0.5)
            .is_in_rect(rectStart, rectEnd)
        ) {
          hoveredElements.push(edge.id);
        }
        break;
    }
  }
  return hoveredElements;
}
