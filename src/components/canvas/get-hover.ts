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
  Point2,
  CanvasStateType,
  ScreenPoint,
  UP,
  ViewportState,
  WorldPoint,
} from "../../types";
import {
  DIM,
  HIT_TOLERANCE,
  HOVER_ORDER,
  INTERACTION_SPECS,
} from "../../constants/rendering-specs";
import {
  get_constraint_element_from_id,
  get_load_element_from_id,
  get_mechanical_element_from_id,
} from "../mechanism/connect-actions";
import {
  BELT_CANNOT_CLOSE,
  BELT_CANNOT_CLOSE_VARS,
  belt_can_close,
  belt_placing_pulleys,
  legality_for_state,
} from "../mechanism/connection-rules";
import {
  get_belt_path,
  screen2world,
  world2screen,
  world2screen_length,
} from "../../utils";
import { belt_pieces, nearest_point_on_piece } from "../../utils/belt-path";
import {
  distributed_screen_geometry,
  force_screen_geometry,
  moment_screen_geometry,
} from "../../utils/load-geom";
import { is_zero_load } from "../../utils/load-scale";
import {
  is_constraint_type,
  probe_badge_position,
  geometric_badge_positions,
} from "./utils";
import { offset_ends, parallel_edge_offsets } from "./parallel-edges";
import { motor_arrow_geometry } from "./drawing-functions";
import { gear_grab_handle } from "../solver/geometric-solver";
import { out_of_sizing_reach } from "./hover-bounds";

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
  | "whole"
  /** Positioned on top of the Rim (probe). */
  | "rim-top";

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

/** Which of the overlays drawn over the mechanism — constraints and loads —
 *  a tool may pick. */
export type OverlayProbe =
  /** Both, as a selection tool takes anything. */
  | "all"
  /** Constraints only: the dimensioning tool reaches its own labels to edit
   *  them, and a load is none of its business. */
  | "constraints";

export type HoverTargets = {
  node?: NodeProbe;
  gear?: GearProbe;
  edge?: EdgeProbe;
  belt?: BeltProbe;
  overlays?: OverlayProbe;
  /** The probe badge, picked to edit what its host measures. The eraser is
   *  deliberately not among these: a probe is removed with its host, and a
   *  badge sitting off to the side must not become a way to delete it. */
  probeBadge?: true;
  /** The rotation-direction arrow drawn on a motorized pivot. Excluded from
   *  the eraser for the same reason as `probeBadge`: it flips the motor, it
   *  does not remove anything. */
  motorArrow?: true;
};

/** What a tool may pick, stated once for all six target families. */
const SELECT_ALL: HoverTargets = {
  node: "centre",
  gear: "rim",
  edge: "ends+body",
  belt: "full",
  overlays: "all",
  probeBadge: true,
  motorArrow: true,
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
  Erasing: { ...SELECT_ALL, probeBadge: undefined, motorArrow: undefined },
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
  PlacingProbe: { node: "centre", gear: "rim-top", edge: "body-centre" },
  PlacingProbeMetrics: NOTHING,

  // A belt is measured whole, from its body, so only DimensionStart sees it.
  // Dimensions already placed are targets too, so the armed tool can edit one
  // without being put down first.
  DimensionStart: {
    node: "centre",
    gear: "rim",
    edge: "body",
    belt: "runs+arcs",
    overlays: "constraints",
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
 * Where the part being dragged actually sits, once the solver has had its say.
 *
 * A drag does not pin anything to the cursor: `resolveGeometricConstraints`
 * frees the grabbed part and pulls it with a `HandleGrab` that competes with
 * every other constraint. What comes back is what the mechanism granted, and it
 * falls short whenever an anchor, a dimension or a slide holds the part back.
 *
 * Every case here must answer with the handle that solve took hold of, built
 * from the same target it was handed. Most grab a part the mechanism carries,
 * so reading it back is an identity; the one that does not borrows the
 * solver's own constructor rather than repeating it.
 *
 * Belts are left out on purpose: a terminal rides its pulley's rim by
 * construction, so it stands off the cursor even when nothing is holding it.
 */
function granted_grab_point(
  state: CanvasState,
  mechanicalElements: MechanicalElement[],
  /** The target the solve was handed, which is what its grab took hold of. */
  askedPosition: Point2,
): Point2 | undefined {
  const dragged =
    "elementID" in state
      ? mechanicalElements.find((element) => element.id === state.elementID)
      : undefined;
  if (!dragged || dragged.type === "belt") return undefined;

  switch (state.type) {
    case "MovingNode":
      return "position" in dragged ? dragged.position : undefined;
    case "MovingEdgeStartPoint":
      return "positionStart" in dragged ? dragged.positionStart : undefined;
    case "MovingEdgeEndPoint":
      return "positionEnd" in dragged ? dragged.positionEnd : undefined;
    case "MovingEdgeBody":
      return "positionStart" in dragged
        ? dragged.positionStart.lerp(dragged.positionEnd, state.t)
        : undefined;
    // This one grabs no part of the gear but a handle the solver makes: the
    // rim point facing what was asked. Read back that way, the caller's
    // comparison reduces to the only thing this gesture ever produces — a
    // radius.
    case "ChangingGearRadius":
      return dragged.type === "gear"
        ? gear_grab_handle(dragged.position, dragged.radius, askedPosition)
        : undefined;
    default:
      return undefined;
  }
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
  mouseScreen: ScreenPoint,
  mode: NodeProbe,
  deleting: boolean,
  drawnPastBase: WorldPoint | undefined,
  mechanicalElements: MechanicalElement[],
  viewport: ViewportState,
): HoveredPart | null {
  const center = world2screen(node.position, viewport);
  const distance = mouseScreen.distance_to(center);

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
  const base = world2screen(drawnPastBase, viewport);
  if (
    center.distance2segment(base, mouseScreen) > HIT_TOLERANCE.EDGE ||
    mouseScreen.distance2line(base, center) > HIT_TOLERANCE.EDGE
  )
    return null;
  return {
    type: "Node",
    position: screen2world(mouseScreen.project_on_line(base, center), viewport),
    id: node.id,
    deleting,
    beamBodyHover: true,
  };
}

function probe_gear(
  gear: GearElement,
  mouseScreen: ScreenPoint,
  mode: GearProbe,
  deleting: boolean,
  gearRef: WorldPoint | undefined,
  viewport: ViewportState,
): HoveredPart | null {
  // Only the rim answers: the whole inside of a gear is a dead zone.
  const center = world2screen(gear.position, viewport);
  const radius = world2screen_length(gear.radius, viewport);
  const distance = mouseScreen.distance_to(center);
  if (
    distance > radius + HIT_TOLERANCE.NODE / 2 ||
    distance < radius - HIT_TOLERANCE.NODE / 2
  )
    return null;

  if (mode === "whole")
    return {
      type: "GearTooth",
      position: gear.position.clone(),
      id: gear.id,
      deleting: false,
    };

  if (mode === "rim-top")
    return {
      type: "GearTooth",
      position: gear.position.add(UP.mul(gear.radius)),
      id: gear.id,
      deleting: false,
    };

  const toward =
    mode === "rim-toward-ref" && gearRef
      ? world2screen(gearRef, viewport)
      : mouseScreen;
  return {
    type: "GearTooth",
    position: screen2world(
      center.add(toward.sub(center).normalize().mul(radius)),
      viewport,
    ),
    id: gear.id,
    deleting,
  };
}

function probe_edge(
  edge: EdgeElement,
  mouseScreen: ScreenPoint,
  mode: EdgeProbe,
  deleting: boolean,
  viewport: ViewportState,
  /** Where the body is drawn, when it stands beside the axis (see `parallel-edges`). */
  lateralOffset: number = 0,
): HoveredPart | null {
  const nodeStart = world2screen(edge.positionStart, viewport);
  const nodeEnd = world2screen(edge.positionEnd, viewport);
  // The terminals answer on their nodes, where they are drawn and where the
  // gesture grabs them; only the body follows the offset.
  const { start, end } = offset_ends(nodeStart, nodeEnd, lateralOffset);
  if (mode !== "body" && mode !== "body-centre") {
    if (mouseScreen.distance_to(nodeStart) <= HIT_TOLERANCE.NODE)
      return {
        type: "Edge",
        position: edge.positionStart.clone(),
        id: edge.id,
        deleting,
        part: "start",
      };
    if (mouseScreen.distance_to(nodeEnd) <= HIT_TOLERANCE.NODE)
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

  // Aimed at where the body is drawn, but answering on the axis: the offset is
  // a way of showing two elements at once, not a second place for one to be.
  if (mouseScreen.distance2segment(start, end) > HIT_TOLERANCE.EDGE)
    return null;
  return {
    type: "Edge",
    position:
      mode === "body-centre"
        ? edge.positionStart.lerp(edge.positionEnd, 0.5)
        : screen2world(
            mouseScreen.project_on_line(nodeStart, nodeEnd),
            viewport,
          ),
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
  viewport: ViewportState,
): HoveredPart | null {
  if (mode === "ends" || mode === "full") {
    if (
      mousePos.distance_to(belt.positionStart) <=
      HIT_TOLERANCE.NODE / viewport.scale
    )
      return {
        type: "Edge",
        position: belt.positionStart.clone(),
        id: belt.id,
        deleting,
        part: "start",
      };
    if (
      mousePos.distance_to(belt.positionEnd) <=
      HIT_TOLERANCE.NODE / viewport.scale
    )
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
      if (mousePos.distance_to(onArc) > HIT_TOLERANCE.NODE / viewport.scale / 2)
        continue;
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
    if (
      mousePos.distance2segment(from, to) >
      HIT_TOLERANCE.EDGE / viewport.scale
    )
      continue;

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

/**
 * Returns the hovered part of the element, or null if no part is hovered.
 *
 * Hit-testing is done in screen px, the unit every `HIT_TOLERANCE` is written
 * in. The answer goes back to world, as `HoveredPart` demands: an element's own
 * anchor is handed over untouched — never round-tripped through the screen,
 * whose float noise would break the `.equals` the reducer compares moves with —
 * and only a point derived from the cursor is converted back.
 *
 * The belt is the exception, still probed in world: its path carries per-via
 * winding directions that the y flip reverses (see `probe_belt`).
 */
function get_hovered_part_of_element(
  element: UnionElement,
  mechanicalElements: MechanicalElement[],
  mouseWorld: WorldPoint,
  mouseScreen: ScreenPoint,
  state: CanvasState,
  viewport: ViewportState,
  parallelOffsets: Map<ID, number>,
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
        mouseScreen,
        targets.node,
        deleting,
        drawn_past_base(state, mechanicalElements),
        mechanicalElements,
        viewport,
      );

    case "gear":
      if (!targets.gear) return null;
      return probe_gear(
        element as GearElement,
        mouseScreen,
        targets.gear,
        deleting,
        placed_gear_center(state, mechanicalElements),
        viewport,
      );

    case "beam":
    case "spring":
    case "damper":
      if (!targets.edge) return null;
      return probe_edge(
        element as EdgeElement,
        mouseScreen,
        targets.edge,
        deleting,
        viewport,
        parallelOffsets.get(element.id) ?? 0,
      );

    case "belt":
      if (!targets.belt) return null;
      return probe_belt(
        element as BeltElement,
        mouseWorld,
        targets.belt,
        deleting,
        placed_gear_center(state, mechanicalElements),
        mechanicalElements,
        viewport,
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
    case "gear-ratio":
      if (
        mouseScreen.distance_to(world2screen(element.position, viewport)) >
        HIT_TOLERANCE.CONSTRAINT
      )
        break;
      return {
        type: "Constraint",
        position: element.position.clone(),
        id: element.id,
        deleting: state.type === "Erasing",
      };
    case "force": {
      if (targets.overlays !== "all") break;
      const { base, tip, label } = force_screen_geometry(
        element,
        mechanicalElements,
        viewport,
      );
      if (
        mouseScreen.distance_to(tip) <= HIT_TOLERANCE.NODE ||
        mouseScreen.distance2segment(base, tip) <= HIT_TOLERANCE.EDGE
      )
        return {
          type: "Force",
          position: screen2world(tip, viewport),
          id: element.id,
          part: "body",
          deleting: state.type === "Erasing",
        };
      // Value
      if (mouseScreen.distance_to(label) <= HIT_TOLERANCE.CONSTRAINT)
        return {
          type: "Force",
          position: screen2world(label, viewport),
          id: element.id,
          part: "value",
          deleting: state.type === "Erasing",
        };
      break;
    }
    case "moment": {
      if (targets.overlays !== "all") break;
      const { center, worldCenter, radius, label } = moment_screen_geometry(
        element,
        mechanicalElements,
        viewport,
      );
      const dist = mouseScreen.distance_to(center);
      if (
        dist <= radius + HIT_TOLERANCE.EDGE &&
        dist >= radius - HIT_TOLERANCE.EDGE
      ) {
        return {
          type: "Moment",
          position: worldCenter,
          id: element.id,
          part: "body",
          deleting: state.type === "Erasing",
        };
      }
      // Value
      if (mouseScreen.distance_to(label) <= HIT_TOLERANCE.CONSTRAINT)
        return {
          type: "Moment",
          position: screen2world(label, viewport),
          id: element.id,
          part: "value",
          deleting: state.type === "Erasing",
        };
      break;
    }
    case "distributed-force": {
      if (targets.overlays !== "all") break;
      const {
        start,
        end,
        vectorStart,
        vectorEnd,
        tipStart,
        tipEnd,
        labelStart,
        labelEnd,
      } = distributed_screen_geometry(element, mechanicalElements, viewport);
      // Tip handles + Arrows body
      if (
        mouseScreen.distance_to(tipStart) <= HIT_TOLERANCE.NODE ||
        mouseScreen.distance2segment(start, tipStart) <= HIT_TOLERANCE.EDGE
      ) {
        return {
          type: "DistributedForce",
          position: screen2world(tipStart, viewport),
          id: element.id,
          part: "start",
          deleting: state.type === "Erasing",
        };
      }
      if (
        mouseScreen.distance_to(tipEnd) <= HIT_TOLERANCE.NODE ||
        mouseScreen.distance2segment(end, tipEnd) <= HIT_TOLERANCE.EDGE
      ) {
        return {
          type: "DistributedForce",
          position: screen2world(tipEnd, viewport),
          id: element.id,
          part: "end",
          deleting: state.type === "Erasing",
        };
      }
      // Body + segment between tips
      if (
        mouseScreen.is_in_distributed_force(
          start,
          end,
          vectorStart,
          vectorEnd,
        ) ||
        mouseScreen.distance2segment(tipStart, tipEnd) <= HIT_TOLERANCE.EDGE
      ) {
        return {
          type: "DistributedForce",
          position: screen2world(
            mouseScreen.project_on_line(tipStart, tipEnd),
            viewport,
          ),
          id: element.id,
          part: "body",
          deleting: state.type === "Erasing",
          // The tips are the profile at t = 0 and t = 1, so the parameter along
          // the crest line is the parameter along the beam. A load with both
          // ends at zero has no crest line to read it off — grab its middle.
          t: mouseScreen.parameter_on_segment(tipStart, tipEnd),
        };
      }
      if (
        !is_zero_load(element.magnitudeStart) &&
        mouseScreen.distance_to(labelStart) <= HIT_TOLERANCE.CONSTRAINT
      )
        return {
          type: "DistributedForce",
          position: screen2world(labelStart, viewport),
          id: element.id,
          part: "start-value",
          deleting: state.type === "Erasing",
        };
      if (
        !is_zero_load(element.magnitudeEnd) &&
        mouseScreen.distance_to(labelEnd) <= HIT_TOLERANCE.CONSTRAINT
      )
        return {
          type: "DistributedForce",
          position: screen2world(labelEnd, viewport),
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
  mouseScreen: ScreenPoint,
  viewport: ViewportState,
): WorldPoint {
  const worldCentre =
    "position" in element && element.type !== "gear"
      ? element.position
      : hoveredPart.type === "Edge" && hoveredPart.part !== "body"
        ? hoveredPart.position
        : undefined;
  if (!worldCentre) return screen2world(mouseScreen, viewport);
  const centre = world2screen(worldCentre, viewport);
  const radius =
    HIT_TOLERANCE.NODE * (element.type === "pivot" && element.motor ? 1.5 : 1);
  const distance = mouseScreen.distance_to(centre);
  if (distance >= radius) return screen2world(mouseScreen, viewport);
  // Dead centre carries no direction to push along; any one will do.
  const direction: ScreenPoint =
    distance > 0 ? mouseScreen.sub(centre).normalize() : new Point2(1, 0);
  return screen2world(centre.add(direction.mul(radius)), viewport);
}

/**
 * The probe badge under the cursor, if the tool may pick one at all.
 */
function hovered_probe_badge(
  mouseScreen: ScreenPoint,
  mechanicalElements: MechanicalElement[],
  excluded_elements: ID[],
  state: CanvasState,
  viewport: ViewportState,
): HoveredPart | undefined {
  if (!HOVER_TARGETS[state.type].probeBadge) return undefined;
  for (const element of mechanicalElements) {
    if (excluded_elements.includes(element.id)) continue;
    if (!element.probes || element.probes.length === 0) continue;
    const badge = probe_badge_position(element, viewport);
    if (mouseScreen.distance_to(badge) > HIT_TOLERANCE.PROBE) continue;
    return {
      type: "Probe",
      position: screen2world(badge, viewport),
      id: element.id,
      deleting: false,
    };
  }
  return undefined;
}

/**
 * The geometric-constraint badge (align/normal/parallel/equal) under the
 * cursor, if the tool may pick a constraint at all — same gate the old
 * position-based constraint badges used.
 */
function hovered_geometric_badge(
  mouseScreen: ScreenPoint,
  mechanicalElements: MechanicalElement[],
  constraintElements: ConstraintElement[],
  state: CanvasState,
  viewport: ViewportState,
): HoveredPart | undefined {
  if (!HOVER_TARGETS[state.type].overlays) return undefined;
  for (const host of mechanicalElements) {
    for (const { constraintId, position } of geometric_badge_positions(
      host.id,
      mechanicalElements,
      constraintElements,
      viewport,
    )) {
      if (mouseScreen.distance_to(position) > HIT_TOLERANCE.CONSTRAINT)
        continue;
      return {
        type: "Constraint",
        position: screen2world(position, viewport),
        id: constraintId,
        deleting: state.type === "Erasing",
      };
    }
  }
  return undefined;
}

/** 2π, matching the sweep `ctx.arc` and `motor_arrow_geometry` reason in. */
const ARROW_TAU = 2 * Math.PI;

/**
 * Whether `angle` falls on the arc from `start` to `end`, swept the way
 * `ctx.arc`'s own `anticlockwise` flag would draw it, with `margin` radians
 * of slack on each end — the arrow head is wider than the stroke it caps.
 */
function angle_on_arc(
  angle: number,
  start: number,
  end: number,
  anticlockwise: boolean,
  margin: number,
): boolean {
  const wrap = (a: number) => ((a % ARROW_TAU) + ARROW_TAU) % ARROW_TAU;
  const from = wrap(anticlockwise ? end : start) - margin;
  const span = wrap(anticlockwise ? start - end : end - start) + 2 * margin;
  const offset = wrap(angle - from);
  return offset <= span;
}

/**
 * The motor's rotation-direction arrow under the cursor, if the tool may pick
 * one at all. Hit-tested on the arc the arrow is actually drawn on — its
 * radius (`MOTOR_ARROW_RADIUS`) and its angular span, not the full ring
 * around the motor's disc, so the disc stays a normal node target and the
 * dead half of the circle does not answer for the arrow.
 */
function hovered_motor_arrow(
  mouseScreen: ScreenPoint,
  mechanicalElements: MechanicalElement[],
  excluded_elements: ID[],
  state: CanvasState,
  viewport: ViewportState,
): HoveredPart | undefined {
  if (!HOVER_TARGETS[state.type].motorArrow) return undefined;
  for (const element of mechanicalElements) {
    if (element.type !== "pivot" || !element.motor) continue;
    if (excluded_elements.includes(element.id)) continue;
    const centre = world2screen(element.position, viewport);
    const radialDistance = Math.abs(
      mouseScreen.distance_to(centre) - DIM.MOTOR_ARROW_RADIUS,
    );
    if (radialDistance > HIT_TOLERANCE.PROBE) continue;
    const { startAngle, endAngle, anticlockwise } = motor_arrow_geometry(
      element.motor.speed >= 0,
    );
    const angularMargin = HIT_TOLERANCE.PROBE / DIM.MOTOR_ARROW_RADIUS;
    const angle = mouseScreen.sub(centre).angle();
    if (
      !angle_on_arc(angle, startAngle, endAngle, anticlockwise, angularMargin)
    )
      continue;
    return {
      type: "MotorArrow",
      position: element.position.clone(),
      id: element.id,
      deleting: false,
    };
  }
  return undefined;
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
  viewport: ViewportState,
  /** What the previous frame of this drag asked for, when there is one. */
  askedPosition?: Point2,
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
  // The nodes a gear carries ride its rim, so they sit under the cursor for the
  // whole gesture and would answer with the radius the gear already has —
  // locking it on its own value. Its axle is excluded on the same grounds: it
  // is the centre the radius is measured from.
  if (state.type === "ChangingGearRadius") {
    const sized = get_mechanical_element_from_id(
      state.elementID,
      mechanicalElements,
    ) as GearElement;
    excluded_elements.push(...sized.fixedNodesBodyIDs, sized.parentAxleID);
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
  // The same map the drawing reads, so the cursor answers where the stroke is.
  const parallelOffsets = parallel_edge_offsets(mechanicalElements);

  const position = mousePos.clone();
  // Picking is a screen question — every `HIT_TOLERANCE` is a number of pixels —
  // so the cursor is converted once here and compared in that space throughout.
  const mouseScreen = world2screen(mousePos, viewport);

  const elements: UnionElement[] = (mechanicalElements as UnionElement[])
    .concat(constraintElements)
    .concat(loadElements);

  // Belt end back on its own start: the target is the belt's own terminal, so no rule in `legality_for_state` can be asked about it and the closure is gated here.
  // It precedes the element sweep because the start point usually sits on something — the rim of the gear the gesture started on, the node it started from — which would otherwise answer for it.
  if (
    state.type === "PlacingBeltEnd" &&
    mouseScreen.distance_to(
      world2screen(state.startHover.position, viewport),
    ) <= HIT_TOLERANCE.NODE
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
      return {
        type: "Void",
        position,
        rejected: BELT_CANNOT_CLOSE,
        rejectedVars: BELT_CANNOT_CLOSE_VARS,
      };
    return { type: "BeltClosure", position: state.startHover.position };
  }

  // A drag can only meet what it reaches.
  // When the solver has granted the grabbed part a place short of what the gesture asked for
  // (an anchor holding it, a dimensioned length, a slide it cannot leave)
  // whatever lies under the cursor is not under the element, and aiming at it targets nothing.
  // Ignored rather than refused: there is no gesture to explain, the cursor is simply over empty space as far as this element is concerned.
  //
  // Measured against what was asked rather than against the cursor,
  // because the hover runs before the move of its own frame is applied: the cursor has already advanced past the position this state answers to,
  // and that head start is not a constraint holding anything back.
  if (askedPosition) {
    const granted = granted_grab_point(
      state,
      mechanicalElements,
      askedPosition,
    );
    if (
      granted &&
      world2screen(granted, viewport).distance_to(
        world2screen(askedPosition, viewport),
      ) > HIT_TOLERANCE.NODE
    )
      return { type: "Void", position };
  }

  // A node the bar is merely drawn PAST, held back until the sweep is over.
  //
  // That hit only asks the node to lie somewhere along the line, so a whole row
  // of aligned nodes answers to it at once — and the first one swept would win
  // over the node the cursor is actually sitting on, which is never what was
  // aimed at. A centre under the cursor outranks them all; among themselves, the
  // nearest one does.
  let past: { part: HoveredPart; distance: number } | undefined;

  for (const type of HOVER_ORDER) {
    // Badges are not elements, so the family is swept whole at the rank
    // `DRAWING_ORDER` gives "probe" — above its host, which the badge overlaps
    // and which would otherwise answer for it.
    if (type === "probe") {
      const badgeHover = hovered_probe_badge(
        mouseScreen,
        mechanicalElements,
        excluded_elements,
        state,
        viewport,
      );
      if (badgeHover) return badgeHover;
      continue;
    }
    // Same reasoning as "probe": a geometric badge (align/normal/parallel/equal)
    // is anchored to its host(s), not an element of its own, so it is swept as
    // a family rather than through the per-element switch below.
    if (type === "geometricBadge") {
      const badgeHover = hovered_geometric_badge(
        mouseScreen,
        mechanicalElements,
        constraintElements,
        state,
        viewport,
      );
      if (badgeHover) return badgeHover;
      continue;
    }
    // Same reasoning as "probe": the arrow rides on the pivot it belongs to,
    // above it, so it must be swept before that pivot answers instead.
    if (type === "motorArrow") {
      const arrowHover = hovered_motor_arrow(
        mouseScreen,
        mechanicalElements,
        excluded_elements,
        state,
        viewport,
      );
      if (arrowHover) return arrowHover;
      continue;
    }
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
        mouseScreen,
        state,
        viewport,
        parallelOffsets,
      );
      if (!hoveredPart) continue;
      if (
        out_of_sizing_reach(
          hoveredPart.position,
          state,
          mechanicalElements,
          viewport,
        )
      )
        continue;
      const verdict = is_legal(element, hoveredPart);
      if (verdict.allowed) {
        // Landing back on the gear the belt started on, anywhere on its rim
        // (not just the exact starting pixel, already caught above): the same
        // closing gesture as returning to the start, since a bare via there
        // would just duplicate the gear in the route instead of shutting the loop.
        if (
          state.type === "PlacingBeltEnd" &&
          hoveredPart.type === "GearTooth" &&
          state.startHover.type === "GearTooth" &&
          hoveredPart.id === state.startHover.id
        ) {
          if (
            !belt_can_close(
              belt_placing_pulleys(state.attachedGearsIDs, state.startHover.id),
            )
          )
            return {
              type: "Void",
              position: hoveredPart.position,
              rejected: BELT_CANNOT_CLOSE,
              rejectedVars: BELT_CANNOT_CLOSE_VARS,
            };
          return { type: "BeltClosure", position: hoveredPart.position };
        }
        if (hoveredPart.type !== "Node" || !hoveredPart.beamBodyHover)
          return hoveredPart;
        const distance = mouseScreen.distance_to(
          world2screen((element as NodeElement).position, viewport),
        );
        if (!past || distance < past.distance)
          past = { part: hoveredPart, distance };
        continue;
      }
      if (verdict.blocks)
        return {
          type: "Void",
          position: pushed_out_of(element, hoveredPart, mouseScreen, viewport),
          rejected: verdict.reason,
          rejectedVars: verdict.vars,
        };
    }
  }
  if (past) return past.part;

  if (state.type === "MovingEdgeStartPoint") {
    const belt = get_mechanical_element_from_id(
      state.elementID,
      mechanicalElements,
    ) as EdgeElement;
    if (
      belt.type === "belt" &&
      mouseScreen.distance_to(world2screen(belt.positionEnd, viewport)) <=
        HIT_TOLERANCE.NODE
    ) {
      if (!belt_can_close(belt.attachedGearsIDs.length))
        return {
          type: "Void",
          position,
          rejected: BELT_CANNOT_CLOSE,
          rejectedVars: BELT_CANNOT_CLOSE_VARS,
        };
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
      mouseScreen.distance_to(world2screen(belt.positionStart, viewport)) <=
        HIT_TOLERANCE.NODE
    ) {
      if (!belt_can_close(belt.attachedGearsIDs.length))
        return {
          type: "Void",
          position,
          rejected: BELT_CANNOT_CLOSE,
          rejectedVars: BELT_CANNOT_CLOSE_VARS,
        };
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
      if (
        mouseScreen.distance_to(world2screen(otherPos, viewport)) >
        HIT_TOLERANCE.NODE
      )
        continue;
      if (!belt_can_close(belt.attachedGearsIDs.length))
        return {
          type: "Void",
          position,
          rejected: BELT_CANNOT_CLOSE,
          rejectedVars: BELT_CANNOT_CLOSE_VARS,
        };
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
