import {
  COLORS,
  DIM,
  TEXT_SPECS,
  DRAWING_ORDER,
  INTERACTION_SPECS,
  STROKE_WIDTHS,
} from "../../constants/rendering-specs";
import {
  BeamElement,
  BeltElement,
  ConstraintElement,
  DistributedForceElement,
  EdgeElement,
  ForceElement,
  GearElement,
  ID,
  LoadElement,
  MechanicalElement,
  MomentElement,
  NodeElement,
  ScreenPoint,
  UnionElement,
  ViewportState,
} from "../../types";
import { HoveredPart, names_element } from "../../types/hovered-part";
import { nodes_under_segment } from "./body-crossings";
import { CanvasState } from "../../types/canvas-state";
import { element_refs } from "../../types/element-refs";
import {
  draw_beam,
  draw_belt_loop,
  draw_belt_open,
  BeltWinding,
  draw_hover_circle,
  draw_damper,
  draw_gear,
  draw_ground,
  draw_join,
  draw_mass,
  draw_pivot,
  draw_slidep_bottom,
  draw_slider,
  draw_spring,
  draw_element_icon,
  draw_gear_ratio,
  draw_dimension_angle,
  draw_dimension_to_segment,
  draw_dimension_radius,
  draw_dimension,
  draw_join_bottom,
  draw_join_top,
  draw_force,
  draw_moment,
  draw_distributed_force,
  draw_motor,
  draw_probe,
  draw_dimension_belt,
  draw_parallel_leg_bottom,
  draw_parallel_leg_top,
  draw_redundancy_symbol,
} from "./drawing-functions";
import { RedundancySymbol } from "../solver/redundancy-symbols";
import { offset_ends, parallel_edge_offsets } from "./parallel-edges";
import {
  deletion_closure,
  get_mechanical_element_from_id,
} from "../mechanism/connect-actions";
import {
  distributed_screen_geometry,
  force_screen_geometry,
  moment_screen_geometry,
} from "../../utils/load-geom";
import { is_zero_load } from "../../utils/load-scale";
import {
  get_belt_vias,
  belt_wrap_direction,
  belt_without_gear,
  world2screen,
  world2screen_angle,
  world2screen_length,
} from "../../utils";
import {
  belt_pieces,
  belt_section_insertion_index,
} from "../../utils/belt-path";
import { replaced_constraint_ids } from "./placing-constraint-actions";
import {
  connected_constraints,
  is_constraint_type,
  probe_badge_position,
} from "./utils";
import {
  screen_vias,
  open_belt_vias,
  draw_belt_closure_marks,
} from "./belt-vias";

const TAU = 2 * Math.PI;

/** Shared empty set, so a frame with nothing doomed allocates none. */
const EMPTY_IDS: ReadonlySet<ID> = new Set<ID>();
const EMPTY_SYMBOLS: RedundancySymbol[] = [];

/**
 * Screen angle of the beam a node rides, 0 when it rides none. Screen and not
 * world: it is fed to `ctx.rotate`, which turns the glyph the other way round.
 */
function parent_beam_screen_angle(
  element: MechanicalElement,
  mechanicalElements: MechanicalElement[],
): number {
  if (!("parentBeamID" in element) || !element.parentBeamID) return 0;
  const beam = get_mechanical_element_from_id(
    element.parentBeamID,
    mechanicalElements,
  ) as BeamElement;
  return world2screen_angle(beam.positionEnd.sub(beam.positionStart).angle());
}

/**
 * Per-via winding spec for a belt: a pulley wound past a full turn (|wrap| ≥ 2π)
 * gets a coil growing one BELT_WIDTH per turn. It grows OUTWARD on the departure
 * side by default; on a winch (a terminal pinned to the first/last pulley) it
 * grows INWARD so the free (load) run stays on the rim and doesn't visually lean.
 * `viaWraps` is index-aligned to the belt's vias (0 for the two terminals).
 */
function belt_windings(
  viaWraps: (number | undefined)[],
  startExternal: boolean,
  endExternal: boolean,
): (BeltWinding | undefined)[] {
  const n = viaWraps.length;
  return viaWraps.map((w, v) => {
    if (w === undefined || Math.abs(w) < TAU) return undefined;
    const growth = (Math.abs(w) / TAU) * 4;
    if (startExternal && v === 1) return { growth: -growth, atStart: true };
    if (endExternal && v === n - 2) return { growth: -growth, atStart: false };
    return { growth, atStart: false };
  });
}

function is_selected(elementID: ID, state: CanvasState): boolean {
  return (
    (state.type === "SelectedElement" && state.elementID === elementID) ||
    // Its metric popover is open: the element being measured reads as selected,
    // the cursor having left the canvas for the popover.
    (state.type === "PlacingProbeMetrics" && state.elementID === elementID) ||
    (state.type === "MovingNode" && state.elementID === elementID) ||
    (state.type === "MovingEdgeStartPoint" && state.elementID === elementID) ||
    (state.type === "MovingEdgeEndPoint" && state.elementID === elementID) ||
    (state.type === "MovingEdgeBody" && state.elementID === elementID) ||
    (state.type === "MovingBeltBody" && state.elementID === elementID) ||
    (state.type === "ChangingGearRadius" && state.elementID === elementID) ||
    (state.type === "MovingForce" && state.elementID === elementID) ||
    (state.type === "MovingDistributedForce" &&
      state.elementID === elementID) ||
    ((state.type === "SelectingMultiple" ||
      state.type === "SelectedMultiple" ||
      state.type === "MovingSelectionMultiple") &&
      state.elementIDs.includes(elementID)) ||
    (state.type === "MovingConstraint" && state.elementID === elementID) ||
    (state.type === "EqualConstraintGear" && state.startGearID === elementID) ||
    (state.type === "EqualConstraintEdge" && state.startEdgeID === elementID) ||
    (state.type === "NormalConstraintEdge" &&
      state.startEdgeID === elementID) ||
    (state.type === "ParallelConstraintEdge" &&
      state.startEdgeID === elementID) ||
    (state.type === "GearRatioConstraintGear" &&
      state.startGearID === elementID) ||
    (state.type === "HorizontalVerticalConstraintNode" &&
      state.startNodeID === elementID)
  );
}

/**
 * Whether `elementID` is about to be erased — itself, or as part of the cascade
 * the hovered element drags along. `doomed` holds that cascade, computed once
 * per frame from the deletion itself (see `deletion_closure`).
 */
function is_erase_hovered(
  elementID: ID,
  hoveredPart: HoveredPart,
  state: CanvasState,
  constraintElements: ConstraintElement[],
  doomed: ReadonlySet<ID>,
): boolean {
  return (
    (names_element(hoveredPart) &&
      hoveredPart.deleting &&
      doomed.has(elementID)) ||
    (state.type === "ErasingMultiple" &&
      [
        ...state.hoveredElementIDs,
        ...state.hoveredElementIDs
          .map((id) => connected_constraints(id, constraintElements))
          .flat(),
      ].includes(elementID))
  );
}

function is_edge_end_hovered(
  elementID: ID,
  hoveredPart: HoveredPart,
  state: CanvasState,
): boolean {
  if (!names_element(hoveredPart) || hoveredPart.id !== elementID) return false;
  return (
    hoveredPart.type === "Edge" &&
    hoveredPart.part !== "body" &&
    !hoveredPart.deleting &&
    !(
      state.type === "ErasingMultiple" &&
      state.hoveredElementIDs.includes(elementID)
    ) &&
    ![
      "PlacingPivot",
      "PlacingSlider",
      "PlacingJoin",
      "PlacingMass",
      "PlacingBeamStart",
      "PlacingSpringStart",
      "PlacingDamperStart",
      "PlacingBeltStart",
    ].includes(state.type)
  );
}

/**
 * The terminal of `elementID` that must carry the free-end handle: the one under
 * the cursor, or the one a drag holds — the handle stays put for the whole gesture.
 */
function handled_edge_terminal(
  elementID: ID,
  hoveredPart: HoveredPart,
  state: CanvasState,
): "start" | "end" | undefined {
  if (state.type === "MovingEdgeStartPoint" && state.elementID === elementID)
    return "start";
  if (state.type === "MovingEdgeEndPoint" && state.elementID === elementID)
    return "end";
  if (!is_edge_end_hovered(elementID, hoveredPart, state)) return undefined;
  return hoveredPart.type === "Edge" && hoveredPart.part === "end"
    ? "end"
    : "start";
}

/**
 * The node the cursor is really on when the hover names an edge terminal, or the
 * start a belt closes onto. A held terminal is grabbed through its node: the node
 * is what lights up, and no free-end handle is ever drawn over it.
 */
function hovered_terminal_node(
  hoveredPart: HoveredPart,
  state: CanvasState,
  mechanicalElements: MechanicalElement[],
): ID | undefined {
  if (hoveredPart.type === "BeltClosure")
    return state.type === "PlacingBeltEnd" && state.startHover.type === "Node"
      ? state.startHover.id
      : undefined;
  if (
    hoveredPart.type !== "Edge" ||
    hoveredPart.part === "body" ||
    hoveredPart.deleting
  )
    return undefined;
  const edge = mechanicalElements.find((el) => el.id === hoveredPart.id);
  if (!edge || !("fixedNodeStartID" in edge)) return undefined;
  return hoveredPart.part === "start"
    ? edge.fixedNodeStartID
    : edge.fixedNodeEndID;
}

/**
 * Whether the gesture is about to close `belt` on itself: one terminal rides the
 * cursor and the hover offers the opposite one as its target. The preview must
 * then be the loop, not an open path with both ends on the same point.
 */
function is_closing_belt(
  belt: BeltElement,
  hoveredPart: HoveredPart,
  state: CanvasState,
): boolean {
  if (belt.closed || hoveredPart.type !== "Edge" || hoveredPart.id !== belt.id)
    return false;
  switch (state.type) {
    case "MovingEdgeStartPoint":
      return state.elementID === belt.id && hoveredPart.part === "end";
    case "MovingEdgeEndPoint":
      return state.elementID === belt.id && hoveredPart.part === "start";
    // The node carries one terminal, so the closing target is the other one.
    // Any other node merely dragged over a terminal is not closing anything.
    case "MovingNode": {
      const holdsStart = belt.fixedNodeStartID === state.elementID;
      const holdsEnd = belt.fixedNodeEndID === state.elementID;
      if (holdsStart === holdsEnd) return false;
      return hoveredPart.part === (holdsStart ? "end" : "start");
    }
    default:
      return false;
  }
}

/**
 * Whether a load element is hovered, optionally restricted to one of its parts.
 * Loads emphasize per part rather than as a whole: hovering a value label must
 * light up that label and the geometry, but not the element's other label.
 */
function is_load_hovered(
  elementID: ID,
  hoveredPart: HoveredPart,
  part?: "body" | "start" | "end" | "value" | "start-value" | "end-value",
): boolean {
  if (
    hoveredPart.type !== "Force" &&
    hoveredPart.type !== "Moment" &&
    hoveredPart.type !== "DistributedForce"
  )
    return false;
  if (hoveredPart.id !== elementID || hoveredPart.deleting) return false;
  return part === undefined || hoveredPart.part === part;
}

/**
 * The nodes the beam being drawn would pick up along its body, thickened like an ordinary hover.
 *
 * They are connected without ever having been aimed at, so without this the bar would silently take hold of whatever it happened to cross. Empty for every other tool: only a beam has a body to hold a node.
 */
function crossed_node_ids(
  hoveredPart: HoveredPart,
  state: CanvasState,
  mechanicalElements: MechanicalElement[],
  viewport: ViewportState,
): ReadonlySet<ID> {
  if (state.type !== "PlacingBeamEnd") return EMPTY_IDS;
  return new Set(
    nodes_under_segment(
      state.startHover.position,
      hoveredPart.position,
      mechanicalElements,
      viewport,
    ).map((node) => node.id),
  );
}

function is_hovered(
  elementID: ID,
  hoveredPart: HoveredPart,
  constraintElements: ConstraintElement[],
): boolean {
  if (!names_element(hoveredPart)) return false;
  // A badge names its host, but hovering it highlights the badge alone —
  // lighting up the element too would read as two targets for one gesture.
  if (hoveredPart.type === "Probe" || hoveredPart.type === "MotorArrow")
    return false;
  if (hoveredPart.id === elementID && !hoveredPart.deleting) return true;

  const constraint = constraintElements.find((el) => el.id === hoveredPart.id);
  if (!constraint) return false;

  switch (constraint.type) {
    case "horizontal-align-edge":
    case "vertical-align-edge":
      return elementID === constraint.edgeID;
    case "horizontal-align-nodes":
    case "vertical-align-nodes":
      return (
        elementID === constraint.startNodeID ||
        elementID === constraint.endNodeID
      );
    case "normal":
    case "parallel":
    case "equal":
      return (
        elementID === constraint.startEdgeID ||
        elementID === constraint.endEdgeID
      );
    case "gear-ratio":
      return (
        elementID === constraint.startGearID ||
        elementID === constraint.endGearID
      );
    default:
      return false;
  }
}

/**
 * Draw tiny pieces of edges to make them appear over some part. `position` is
 * the screen point the stub is centred on — the node the edge is fixed to.
 */
export function draw_edge_fake_end(
  ctx: CanvasRenderingContext2D,
  edge: EdgeElement,
  elementID: ID,
  position: ScreenPoint,
  hoveredPart: HoveredPart,
  state: CanvasState,
  constraintElements: ConstraintElement[],
  doomed: ReadonlySet<ID>,
  focused: ReadonlySet<ID>,
  faulty: ReadonlySet<ID>,
  length: number,
) {
  if (is_erase_hovered(edge.id, hoveredPart, state, constraintElements, doomed))
    return;

  ctx.save();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  ctx.strokeStyle = COLORS.ELEMENT_STROKE;
  ctx.fillStyle = COLORS.FILL_BODY;
  ctx.lineWidth = STROKE_WIDTHS.STANDARD;

  if (
    (is_hovered(edge.id, hoveredPart, constraintElements) ||
      focused.has(edge.id) ||
      faulty.has(edge.id)) &&
    !is_edge_end_hovered(edge.id, hoveredPart, state)
  )
    ctx.lineWidth += STROKE_WIDTHS.HOVER_GAIN;

  if (is_selected(edge.id, state)) {
    ctx.strokeStyle = COLORS.SELECTION_STROKE;
    ctx.fillStyle = COLORS.FILL_BODY;
  }

  ctx.translate(position.x, position.y);
  ctx.rotate(
    world2screen_angle(edge.positionEnd.sub(edge.positionStart).angle()),
  );

  const start = edge.fixedNodeEndID === elementID ? 0 : 1;
  const end = edge.fixedNodeStartID === elementID ? 0 : 1;
  const sideL = DIM.BEAM_WIDTH - STROKE_WIDTHS.STANDARD + ctx.lineWidth;
  const sideS = DIM.BEAM_WIDTH - STROKE_WIDTHS.STANDARD - ctx.lineWidth;
  const C = length + DIM.SLIDER_INNER_HEIGHT / 2;
  const D = C + 0.5;
  const bodyFillStyle = ctx.fillStyle;
  ctx.fillStyle = ctx.strokeStyle;
  ctx.fillRect(-C * end, -sideL / 2, C * (start + end), sideL);
  ctx.fillStyle = bodyFillStyle;
  ctx.fillRect(-D * end, -sideS / 2, D * (start + end), sideS);

  ctx.restore();
}

/**
 * The elements that cannot be drawn, because a reference they hold names an
 * element that is not there. Drawing resolves those referents through strict
 * getters, so attempting one throws and takes the whole frame with it.
 *
 * Omitting them is a safety net, never a fix: a dangling reference is a defect
 * the validator reports and `repair_mechanism` clears at load time. What this
 * buys is that the defect costs one invisible element instead of a blank canvas.
 */
function undrawable_elements(
  allElements: UnionElement[],
  mechanicalElements: MechanicalElement[],
): Set<ID> {
  const present = new Set<ID>(mechanicalElements.map((element) => element.id));
  const undrawable = new Set<ID>();
  for (const element of allElements) {
    const dangling = element_refs(element).some((ref) => !present.has(ref.id));
    if (dangling) undrawable.add(element.id);
  }
  return undrawable;
}

/**
 * Elements the analysis panel is pointing at, and why.
 *
 * The reason travels with the set because the drawing differs: `focus` picks parts out —
 * a kinematic chain, or what one motion mode moves — and draws them hovered, while `fault`
 * marks the constraints an audit found dispensable and draws them red. Two parallel sets
 * would have let a caller light the same element both ways at once, which means nothing.
 *
 * Fading everything else was the first idea for `focus` and it reads backwards: the eye
 * follows the change, and the change would be on the parts one is NOT pointing at.
 */
export type CanvasHighlight = {
  elements: ReadonlySet<ID>;
  kind: "focus" | "fault";
};

/** Nothing pointed at. Shared, so a quiet frame keeps a stable identity. */
export const NO_HIGHLIGHT: CanvasHighlight = {
  elements: new Set<ID>(),
  kind: "focus",
};

/** What one frame of the mechanism shows. Everything past the mechanism is optional. */
export type CanvasDrawing = {
  viewport: ViewportState;
  hoveredPart: HoveredPart;
  state: CanvasState;
  mechanicalElements: MechanicalElement[];
  constraintElements: ConstraintElement[];
  loads?: LoadElement[];
  /** Dimensions to draw, by id, each with the opacity its reveal has reached. */
  visibleConstraints?: Map<ID, number>;
  /** Among those, the ones an undo is about to bring back. */
  ghostConstraintIDs?: Set<ID>;
  /** Whether the cursor is over the canvas: what a tool previews follows it, so
   *  it is not drawn for a hover designated from a panel. */
  cursorOnCanvas?: boolean;
  hideConstraints?: boolean;
  hideLoads?: boolean;
  hideProbes?: boolean;
  /** The dimension the gesture is placing or dragging has its stand-off on a rung. Its own
   *  ladder is invisible, so the dimension goes into relief to say so. */
  dimensionSnapped?: boolean;
  highlight?: CanvasHighlight;
  /** How a redundant constraint the analysis panel is pointing at would yield. */
  redundancySymbols?: RedundancySymbol[];
  /** `performance.now()`, ms — drives the symbols' pulse. Passed in rather than read here so a
   *  test can call this function with a fixed value. */
  now?: number;
};

/**
 * Draws the mechanism itself — elements, hover/selection feedback, redundancy symbols — with no tool gesture overlaid.
 * Used both by the live canvas (paired with `draw_gesture_preview` when the cursor is over it) and by `draw_thumbnail`, which never has a gesture to preview.
 */
export function draw_mechanism(
  ctx: CanvasRenderingContext2D,
  drawing: CanvasDrawing,
) {
  const {
    viewport,
    hoveredPart,
    state,
    mechanicalElements,
    constraintElements,
    loads = [],
    visibleConstraints = new Map(),
    ghostConstraintIDs = new Set(),
    cursorOnCanvas = false,
    hideConstraints = false,
    hideLoads = false,
    hideProbes = false,
    dimensionSnapped = false,
    highlight = NO_HIGHLIGHT,
    redundancySymbols = EMPTY_SYMBOLS,
    now = 0,
  } = drawing;
  const focused = highlight.kind === "focus" ? highlight.elements : EMPTY_IDS;
  const faulty = highlight.kind === "fault" ? highlight.elements : EMPTY_IDS;

  let allElements: UnionElement[] = mechanicalElements as UnionElement[];
  if (!hideConstraints) allElements = allElements.concat(constraintElements);
  if (!hideLoads) allElements = allElements.concat(loads);
  const undrawable = undrawable_elements(allElements, mechanicalElements);
  const terminalNodeID = hovered_terminal_node(
    hoveredPart,
    state,
    mechanicalElements,
  );

  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  ctx.strokeStyle = COLORS.ELEMENT_STROKE;
  ctx.fillStyle = COLORS.FILL_BODY;
  ctx.lineWidth = STROKE_WIDTHS.STANDARD;
  ctx.textAlign = TEXT_SPECS.TEXT_ALIGN;
  ctx.textBaseline = TEXT_SPECS.TEXT_BASELINE;
  ctx.font = TEXT_SPECS.TEXT_FONT;
  // Once for the whole pass: they depend on the gesture, not on the element.
  const crossedNodeIDs = cursorOnCanvas
    ? crossed_node_ids(hoveredPart, state, mechanicalElements, viewport)
    : EMPTY_IDS;

  // What the eraser would take, so the whole cascade turns red before the click
  // rather than the aimed element alone.
  const doomed =
    names_element(hoveredPart) && hoveredPart.deleting
      ? deletion_closure(
          hoveredPart.id,
          mechanicalElements,
          constraintElements,
          loads,
        )
      : EMPTY_IDS;

  // The dimensions the aimed placement would replace: the preview draws their
  // replacement, so they step aside instead of doubling it.
  const replaced = hideConstraints
    ? EMPTY_IDS
    : replaced_constraint_ids(
        state,
        hoveredPart,
        mechanicalElements,
        constraintElements,
      );

  for (const element of allElements.filter(
    (element) => element.type === "join",
  )) {
    if (
      undrawable.has(element.id) ||
      doomed.has(element.id) ||
      (state.type === "ErasingMultiple" &&
        state.hoveredElementIDs.includes(element.id))
    )
      continue;
    draw_join_bottom(ctx, world2screen(element.position, viewport));
  }
  ctx.fillStyle = COLORS.FILL_BODY;
  for (const element of allElements.filter(
    (element) => element.type === "pivot" && element.motor,
  )) {
    if (
      undrawable.has(element.id) ||
      doomed.has(element.id) ||
      (state.type === "ErasingMultiple" &&
        state.hoveredElementIDs.includes(element.id)) ||
      element.type !== "pivot" ||
      element.motor === undefined
    )
      continue;
    ctx.lineWidth =
      STROKE_WIDTHS.STANDARD +
      (focused.has(element.id) || faulty.has(element.id)
        ? STROKE_WIDTHS.HOVER_GAIN
        : 0);
    draw_motor(
      ctx,
      world2screen(element.position, viewport),
      element.isGrounded,
      element.motor.speed >= 0,
    );
  }
  ctx.lineWidth = STROKE_WIDTHS.STANDARD;

  // Read once for the whole frame: the drawing and the hover share this map, so
  // the stroke and the cursor cannot disagree on where an edge is.
  const parallelOffsets = parallel_edge_offsets(mechanicalElements);

  // A gear normally draws under belts, so a belt wrapping it traces right over
  // its rim. Hovering/selecting/erase-hovering it re-draws it once more, after
  // belts, so it comes forward — still under nodes, drawn later in this pass.
  const elevatedGears: {
    element: GearElement;
    isHovered: boolean;
    strokeStyle: string | CanvasGradient | CanvasPattern;
    fillStyle: string | CanvasGradient | CanvasPattern;
    lineWidth: number;
    globalAlpha: number;
    shadowColor: string;
    shadowBlur: number;
  }[] = [];

  DRAWING_ORDER.forEach((type) => {
    if (type === "probe" && !hideProbes) {
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      ctx.strokeStyle = COLORS.ACCENT;
      for (const element of mechanicalElements) {
        if (!element.probes || element.probes.length === 0) continue;
        if (undrawable.has(element.id)) continue;
        ctx.lineWidth = STROKE_WIDTHS.STANDARD;
        if (hoveredPart.type === "Probe" && hoveredPart.id === element.id)
          ctx.lineWidth += STROKE_WIDTHS.HOVER_GAIN;
        if (doomed.has(element.id))
          ctx.globalAlpha = INTERACTION_SPECS.DELETION_OPACITY;
        draw_probe(ctx, probe_badge_position(element, viewport));
      }
      return;
    }
    const elements = allElements.filter((element) => element.type === type);
    for (const element of elements) {
      if (undrawable.has(element.id) || replaced.has(element.id)) continue;
      // Skip constraints hidden by the current context (mode / tab / hover).
      const constraintOpacity = is_constraint_type(element.type)
        ? visibleConstraints.get(element.id)
        : undefined;
      if (is_constraint_type(element.type) && constraintOpacity === undefined)
        continue;
      const isLoadElement =
        element.type === "force" ||
        element.type === "moment" ||
        element.type === "distributed-force";
      const isSelected = is_selected(element.id, state);
      const isEraseHovered = is_erase_hovered(
        element.id,
        hoveredPart,
        state,
        constraintElements,
        doomed,
      );
      // A terminal held by a node is grabbed through it: the node takes the
      // hover, and the handle that would sit on top of it is not drawn.
      const handleTerminal =
        terminalNodeID === undefined
          ? handled_edge_terminal(element.id, hoveredPart, state)
          : undefined;
      const isEdgeEndHovered = handleTerminal !== undefined;
      // Cursor-driven only: a group highlight (focused/faulty) must not, by
      // itself, pull a motor to the front — see the "pivot" case below.
      const isCursorHovered =
        is_hovered(element.id, hoveredPart, constraintElements) ||
        element.id === terminalNodeID ||
        crossedNodeIDs.has(element.id) ||
        (dimensionSnapped &&
          state.type === "MovingConstraint" &&
          state.elementID === element.id);
      const isHovered =
        focused.has(element.id) || faulty.has(element.id) || isCursorHovered;

      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      ctx.lineCap = "butt";
      ctx.lineJoin = "miter";
      ctx.strokeStyle = isLoadElement ? COLORS.ACCENT : COLORS.ELEMENT_STROKE;
      ctx.fillStyle = isLoadElement ? COLORS.ACCENT : COLORS.FILL_BODY;
      ctx.lineWidth = STROKE_WIDTHS.STANDARD;
      if (element.type === "gear") {
        ctx.lineWidth = STROKE_WIDTHS.GEAR;
      }

      // Thicken the stroke if element is hovered. Loads are left out: they pick
      // their width per sub-part below, from loadRestWidth / loadHoverWidth.
      if (isHovered && !isEdgeEndHovered && !isLoadElement)
        ctx.lineWidth += STROKE_WIDTHS.HOVER_GAIN;
      // Add blue halo and blue stroke if element is selected
      if (isSelected) {
        if (isLoadElement) ctx.lineWidth += 1;
        ctx.shadowColor = isLoadElement
          ? COLORS.ACCENT
          : COLORS.SELECTION_STROKE;
        ctx.strokeStyle = isLoadElement
          ? COLORS.SELECTION_ACCENT
          : COLORS.SELECTION_STROKE;
        ctx.fillStyle = isLoadElement
          ? COLORS.SELECTION_ACCENT
          : COLORS.FILL_BODY;
        ctx.shadowBlur = INTERACTION_SPECS.SELECTION_HALO_SIZE;
      }
      // Add red stroke and make semi-transparent if element is to be deleted
      if (isEraseHovered) {
        if (!isLoadElement) ctx.strokeStyle = COLORS.DELETION_STROKE;
        ctx.globalAlpha = INTERACTION_SPECS.DELETION_OPACITY;
      }
      // A joint the redundancy audit found dispensable. The eraser's red, because it reads
      // as a warning in every theme — but at full opacity, since this is something to look
      // at, not something on its way out.
      if (faulty.has(element.id) && !isLoadElement)
        ctx.strokeStyle = COLORS.DELETION_STROKE;
      // Fade out revealed constraints at the end of their hover cooldown.
      if (constraintOpacity !== undefined) ctx.globalAlpha *= constraintOpacity;
      // Tombstone of a just-deleted constraint (undo/redo feedback).
      const isGhost = ghostConstraintIDs.has(element.id);
      if (isGhost) ctx.strokeStyle = COLORS.DELETION_STROKE;
      const hideText =
        (state.type === "EditingValue" || state.type === "PlacingValue") &&
        state.elementID === element.id;
      // Widths a load's sub-parts choose from: the element's own width when at
      // rest, the hovered width for the part under the cursor.
      const loadRestWidth = ctx.lineWidth;
      const loadHoverWidth = loadRestWidth + STROKE_WIDTHS.HOVER_GAIN;

      switch (element.type) {
        case "pivot":
        case "slider":
        case "slidep":
        case "join":
        case "mass":
          if (
            element.isGrounded &&
            !(element.type === "pivot" && element.motor)
          ) {
            draw_ground(
              ctx,
              world2screen(element.position, viewport),
              element.type === "slider"
                ? parent_beam_screen_angle(element, mechanicalElements)
                : 0,
            );
          }
          switch (element.type) {
            case "slider": {
              if (element.fixedEdgesIDs.length > 0 && !element.parentBeamID) {
                ctx.fillStyle = COLORS.BACKGROUND;
              }
              draw_slider(
                ctx,
                world2screen(element.position, viewport),
                parent_beam_screen_angle(element, mechanicalElements),
                !!element.parentBeamID || element.fixedEdgesIDs.length > 0,
              );
              break;
            }
            case "pivot": {
              const arrowHovered =
                hoveredPart.type === "MotorArrow" &&
                hoveredPart.id === element.id;
              // A motor rides under the bars, drawn before them. Standing out means
              // coming up over them, and only then are the bars faked back on top.
              if (
                element.motor &&
                (isCursorHovered ||
                  isSelected ||
                  isEraseHovered ||
                  arrowHovered)
              ) {
                draw_motor(
                  ctx,
                  world2screen(element.position, viewport),
                  element.isGrounded,
                  element.motor.speed >= 0,
                  arrowHovered,
                );

                // The bar the stator pushes against passes under the body: that is
                // what tells it apart from the ones the motor turns.
                const rotatingEdges = element.rotatingEdgesIDs.filter(
                  (el) => el !== element.motor!.parentBeamID,
                );
                rotatingEdges.reverse().forEach((edgeID) => {
                  const edge = get_mechanical_element_from_id(
                    edgeID,
                    mechanicalElements,
                  );
                  if (!("positionStart" in edge)) return;
                  draw_edge_fake_end(
                    ctx,
                    edge as EdgeElement,
                    element.id,
                    world2screen(element.position, viewport),
                    hoveredPart,
                    state,
                    constraintElements,
                    doomed,
                    focused,
                    faulty,
                    DIM.MOTOR_RADIUS + DIM.MOTOR_CORNER_RADIUS + 1,
                  );
                });
              }
              draw_pivot(
                ctx,
                world2screen(element.position, viewport),
                element.rotatingEdgesIDs.length > 0 ||
                  element.fixedGearsIDs.length > 0,
              );
              break;
            }
            case "slidep": {
              draw_slidep_bottom(
                ctx,
                world2screen(element.position, viewport),
                parent_beam_screen_angle(element, mechanicalElements),
              );
              [...element.rotatingEdgesIDs].reverse().forEach((edgeID) => {
                const edge = get_mechanical_element_from_id(
                  edgeID,
                  mechanicalElements,
                );
                // rotatingEdgesIDs may also reference a pinned gear — skip it.
                if (!("positionStart" in edge)) return;
                draw_edge_fake_end(
                  ctx,
                  edge as EdgeElement,
                  element.id,
                  world2screen(element.position, viewport),
                  hoveredPart,
                  state,
                  constraintElements,
                  doomed,
                  focused,
                  faulty,
                  DIM.SLIDEP_OUTER_WIDTH / 2,
                );
              });
              draw_pivot(
                ctx,
                world2screen(element.position, viewport),
                !!element.parentBeamID ||
                  element.rotatingEdgesIDs.length > 0 ||
                  element.fixedGearsIDs.length > 0,
              );
              break;
            }
            case "join":
              if (isHovered || isSelected || isEraseHovered) {
                draw_join(ctx, world2screen(element.position, viewport));
              } else {
                draw_join_top(ctx, world2screen(element.position, viewport));
              }
              break;
            case "mass":
              draw_mass(
                ctx,
                world2screen(element.position, viewport),
                element.mass,
              );
              break;
          }
          break;
        case "gear":
          draw_gear(
            ctx,
            world2screen(element.position, viewport),
            world2screen_length(element.radius, viewport),
            world2screen_angle(element.angle),
            isHovered,
          );
          // Cursor-driven only, same as the motor's front-bringing rule above: a
          // group highlight (focused/faulty) must not by itself elevate a gear.
          if (isCursorHovered || isSelected || isEraseHovered) {
            elevatedGears.push({
              element,
              isHovered,
              strokeStyle: ctx.strokeStyle,
              fillStyle: ctx.fillStyle,
              lineWidth: ctx.lineWidth,
              globalAlpha: ctx.globalAlpha,
              shadowColor: ctx.shadowColor,
              shadowBlur: ctx.shadowBlur,
            });
          }
          break;
        case "beam":
        case "spring":
        case "damper": {
          const nodeStart = world2screen(element.positionStart, viewport);
          const nodeEnd = world2screen(element.positionEnd, viewport);
          const offset = parallelOffsets.get(element.id) ?? 0;
          const { start, end } = offset_ends(nodeStart, nodeEnd, offset);
          if (offset) {
            draw_parallel_leg_bottom(ctx, nodeStart, start);
            draw_parallel_leg_bottom(ctx, nodeEnd, end);
          }
          switch (element.type) {
            case "beam":
              draw_beam(
                ctx,
                start,
                end,
                !!element.fixedNodeStartID,
                !!element.fixedNodeEndID,
              );
              break;
            case "spring":
              draw_spring(ctx, start, end, element.restLength, viewport.scale);
              break;
            case "damper":
              draw_damper(ctx, start, end, element.restLength, viewport.scale);
              break;
          }
          if (offset) {
            draw_parallel_leg_top(ctx, nodeStart, start);
            draw_parallel_leg_top(ctx, nodeEnd, end);
          }
          if (handleTerminal) {
            // The handle belongs to the terminal, which stays on its node.
            draw_hover_circle(
              ctx,
              handleTerminal === "end" ? nodeEnd : nodeStart,
            );
          }
          break;
        }
        case "belt": {
          // Pulleys the path skips: those that lost belt contact during
          // simulation, and the one a drag is about to pull off. Both are drawn
          // as if the belt ran straight past them.
          const removingGearIndex =
            state.type === "MovingBeltBody" && state.elementID === element.id
              ? state.removingGearIndex
              : undefined;
          const disconnectedGears = new Set(
            element.disconnectedGearIndices ?? [],
          );
          if (removingGearIndex !== undefined)
            disconnectedGears.add(removingGearIndex);
          // The carried section is numbered on the belt without that pulley, so
          // every section-indexed read below goes through this one.
          const pathBelt =
            removingGearIndex === undefined
              ? element
              : belt_without_gear(element, removingGearIndex);
          const attachedGears = element.attachedGearsIDs
            .map(({ id, clockwise }) => {
              return {
                gear: get_mechanical_element_from_id(
                  id,
                  mechanicalElements,
                ) as GearElement,
                clockwise,
              };
            })
            .filter((_, i) => !disconnectedGears.has(i));
          // Preview the pulley where the commit will actually put it. An arc
          // section takes none, and the belt is then previewed unchanged.
          const preview_pulley = (
            section: number,
            entry: { gear: GearElement; clockwise: boolean },
          ) => {
            const index = belt_section_insertion_index(
              section,
              pathBelt.closed,
            );
            if (index !== undefined) attachedGears.splice(index, 0, entry);
          };
          switch (state.type) {
            case "MovingBeltBody":
              if (state.elementID !== element.id) break;
              if (hoveredPart.type === "GearTooth") {
                const gear = get_mechanical_element_from_id(
                  hoveredPart.id,
                  mechanicalElements,
                ) as GearElement;
                preview_pulley(state.section, {
                  gear,
                  clockwise: belt_wrap_direction(
                    hoveredPart.position,
                    pathBelt,
                    state.section,
                    mechanicalElements,
                    "belt-onto-gear",
                  ),
                });
              } else {
                const newGear: GearElement = {
                  type: "gear",
                  id: "----",
                  probes: [],
                  overlays: {},
                  position: hoveredPart.position,
                  angle: 0,
                  radius: INTERACTION_SPECS.BELT_GRAB_RADIUS,
                  parentAxleID: "----",
                  fixedNodesBodyIDs: [],
                  meshedGearsIDs: [],
                  attachedBeltID: element.id,
                };
                preview_pulley(state.section, {
                  gear: newGear,
                  clockwise: belt_wrap_direction(
                    newGear.position,
                    pathBelt,
                    state.section,
                    mechanicalElements,
                    "belt-onto-gear",
                  ),
                });
              }
              break;
            case "ChangingGearRadius": {
              if (
                hoveredPart.type !== "BeltBody" ||
                hoveredPart.id !== element.id
              )
                break;
              const gear = get_mechanical_element_from_id(
                state.elementID,
                mechanicalElements,
              ) as GearElement;
              // TODO : snap preview
              preview_pulley(hoveredPart.section, {
                gear,
                clockwise: belt_wrap_direction(
                  gear.position,
                  element,
                  hoveredPart.section,
                  mechanicalElements,
                  "gear-onto-belt",
                ),
              });
              break;
            }
            case "PlacingGearRadius": {
              if (
                hoveredPart.type !== "BeltBody" ||
                hoveredPart.id !== element.id
              )
                break;
              // TODO --------------- TEST ---------------
              const vias = screen_vias(
                open_belt_vias(
                  element.positionStart,
                  attachedGears,
                  element.positionEnd,
                ),
                viewport,
              );
              const pieces = belt_pieces(vias, true);
              const piece = pieces[hoveredPart.section];
              if (piece.kind === "segment")
                draw_hover_circle(
                  ctx,
                  world2screen(hoveredPart.position, viewport).project_on_line(
                    piece.from,
                    piece.to,
                  ),
                );
              // TODO --------------- TEST ---------------

              const newGear: GearElement = {
                type: "gear",
                id: "----",
                probes: [],
                overlays: {},
                position: state.startHover.position,
                angle: 0,
                radius: state.startHover.position.distance_to(
                  hoveredPart.position,
                ),
                parentAxleID: "----",
                fixedNodesBodyIDs: [],
                meshedGearsIDs: [],
                attachedBeltID: element.id,
              };
              preview_pulley(hoveredPart.section, {
                gear: newGear,
                clockwise: belt_wrap_direction(
                  newGear.position,
                  element,
                  hoveredPart.section,
                  mechanicalElements,
                  "gear-onto-belt",
                ),
              });
              break;
            }
          }
          // A terminal dragged onto the other one shows the loop the drop makes,
          // not an open path whose two ends sit on the same point.
          const isClosing = is_closing_belt(element, hoveredPart, state);
          if ((element.closed || isClosing) && attachedGears.length > 0) {
            // Closed belt: continuous closed loop around the pulleys, drawn
            // independently of the junction position (no free ends). In
            // simulation, pass the tracked continuous wraps (filtered to the
            // still-connected gears, same as attachedGears) so a pulley about to
            // disconnect is drawn straight-past, not wrapped a full turn.
            const loopWraps = element.gearWraps
              ? element.gearWraps.filter((_, i) => !disconnectedGears.has(i))
              : [];
            const loopVias = screen_vias(
              attachedGears.map(({ gear, clockwise }) => ({
                pos: gear.position,
                radius: gear.radius,
                clockwise,
              })),
              viewport,
            );
            draw_belt_loop(
              ctx,
              loopVias,
              loopWraps,
              // A closed loop has no terminals, so any wound pulley coils outward.
              loopWraps ? belt_windings(loopWraps, false, false) : [],
            );
            if (isClosing)
              draw_belt_closure_marks(
                ctx,
                loopVias,
                world2screen(hoveredPart.position, viewport),
                terminalNodeID === undefined,
              );
          } else {
            const openWraps = element.gearWraps
              ? element.gearWraps.filter((_, i) => !disconnectedGears.has(i))
              : undefined;
            const vias = screen_vias(
              open_belt_vias(
                element.positionStart,
                attachedGears,
                element.positionEnd,
              ),
              viewport,
            );
            // A terminal pinned onto its adjacent pulley (winch) makes that
            // pulley coil inward so the free run stays on the rim.
            const startExternal =
              !!element.fixedNodeStartID &&
              attachedGears.length > 0 &&
              attachedGears[0].gear.fixedNodesBodyIDs.includes(
                element.fixedNodeStartID,
              );
            const endExternal =
              !!element.fixedNodeEndID &&
              attachedGears.length > 0 &&
              attachedGears[
                attachedGears.length - 1
              ].gear.fixedNodesBodyIDs.includes(element.fixedNodeEndID);
            const viaWraps = openWraps ? [0, ...openWraps, 0] : [];
            draw_belt_open(
              ctx,
              vias,
              viaWraps,
              viaWraps
                ? belt_windings(viaWraps, startExternal, endExternal)
                : [],
            );
            if (handleTerminal) {
              draw_hover_circle(
                ctx,
                world2screen(
                  handleTerminal === "end"
                    ? element.positionEnd
                    : element.positionStart,
                  viewport,
                ),
              );
            }
          }
          break;
        }
        case "dimension-edge": {
          const edge = get_mechanical_element_from_id(
            element.edgeID,
            mechanicalElements,
          ) as EdgeElement;
          draw_dimension(
            ctx,
            world2screen(edge.positionStart, viewport),
            world2screen(edge.positionEnd, viewport),
            world2screen(element.position, viewport),
            element.value,
            hideText,
          );
          break;
        }
        case "dimension-node-to-node": {
          const start = (
            get_mechanical_element_from_id(
              element.startNodeID,
              mechanicalElements,
            ) as NodeElement
          ).position;
          const end = (
            get_mechanical_element_from_id(
              element.endNodeID,
              mechanicalElements,
            ) as NodeElement
          ).position;
          draw_dimension(
            ctx,
            world2screen(start, viewport),
            world2screen(end, viewport),
            world2screen(element.position, viewport),
            element.value,
            hideText,
          );
          break;
        }
        case "dimension-edge-to-node": {
          const edge = get_mechanical_element_from_id(
            element.edgeID,
            mechanicalElements,
          ) as EdgeElement;
          const start = edge.positionStart;
          const end = edge.positionEnd;
          const point = (
            get_mechanical_element_from_id(
              element.nodeID,
              mechanicalElements,
            ) as NodeElement
          ).position;
          draw_dimension_to_segment(
            ctx,
            world2screen(point, viewport),
            world2screen(start, viewport),
            world2screen(end, viewport),
            world2screen(element.position, viewport),
            element.value,
            hideText,
          );
          break;
        }
        case "dimension-angle": {
          const edge1 = get_mechanical_element_from_id(
            element.startEdgeID,
            mechanicalElements,
          ) as EdgeElement;
          const start1 = edge1.positionStart;
          const end1 = edge1.positionEnd;
          const edge2 = get_mechanical_element_from_id(
            element.endEdgeID,
            mechanicalElements,
          ) as EdgeElement;
          const start2 = edge2.positionStart;
          const end2 = edge2.positionEnd;
          draw_dimension_angle(
            ctx,
            world2screen(start1, viewport),
            world2screen(end1, viewport),
            world2screen(start2, viewport),
            world2screen(end2, viewport),
            element.flipStart,
            element.flipEnd,
            world2screen(element.position, viewport),
            element.value,
            hideText,
          );
          break;
        }
        case "dimension-radius": {
          const gear = get_mechanical_element_from_id(
            element.gearID,
            mechanicalElements,
          ) as GearElement;
          draw_dimension_radius(
            ctx,
            world2screen(gear.position, viewport),
            world2screen_length(gear.radius, viewport),
            world2screen(element.position, viewport),
            element.value,
            hideText,
          );
          break;
        }
        case "dimension-belt": {
          const belt = get_mechanical_element_from_id(
            element.beltID,
            mechanicalElements,
          ) as BeltElement;
          const allVias = screen_vias(
            get_belt_vias(belt, mechanicalElements),
            viewport,
          );
          const vias = belt.closed ? allVias.slice(1, -1) : allVias;
          draw_dimension_belt(
            ctx,
            vias,
            belt.closed,
            world2screen(element.position, viewport),
            element.value,
            hideText,
          );
          break;
        }
        case "gear-ratio":
          if (hideText) break;
          draw_gear_ratio(
            ctx,
            world2screen(element.position, viewport),
            element.value,
            isSelected,
            isHovered,
            isGhost ? "ghost" : isEraseHovered ? "erasing" : "none",
          );
          break;
        case "horizontal-align-edge":
        case "horizontal-align-nodes":
        case "vertical-align-edge":
        case "vertical-align-nodes":
        case "normal":
        case "parallel":
        case "equal":
          draw_element_icon(
            ctx,
            world2screen(element.position, viewport),
            element,
            isSelected,
            isHovered,
            isGhost ? "ghost" : isEraseHovered ? "erasing" : "none",
          );
          break;
        case "force": {
          const force = element as ForceElement;
          const { base, vector, tip } = force_screen_geometry(
            force,
            mechanicalElements,
            viewport,
          );
          ctx.lineWidth = is_load_hovered(force.id, hoveredPart)
            ? loadHoverWidth
            : loadRestWidth;
          draw_force(
            ctx,
            base,
            vector,
            force.vector.length(),
            hideText,
            " N",
            is_load_hovered(force.id, hoveredPart, "value")
              ? loadHoverWidth
              : loadRestWidth,
          );
          // Hovering the arrow reveals the tip handle it would drag, and the
          // drag itself keeps it under the cursor.
          if (
            is_load_hovered(force.id, hoveredPart, "body") ||
            (state.type === "MovingForce" && state.elementID === force.id)
          ) {
            draw_hover_circle(ctx, tip);
          }
          break;
        }
        case "distributed-force": {
          const distributedForce = element as DistributedForceElement;
          const { start, end, vectorStart, vectorEnd, tipStart, tipEnd } =
            distributed_screen_geometry(
              distributedForce,
              mechanicalElements,
              viewport,
            );
          const id = distributedForce.id;
          const heldTip =
            state.type === "MovingDistributedForce" &&
            state.elementID === id &&
            state.part !== "body"
              ? state.part
              : is_load_hovered(id, hoveredPart, "start")
                ? "start"
                : is_load_hovered(id, hoveredPart, "end")
                  ? "end"
                  : undefined;
          const heldBody =
            state.type === "MovingDistributedForce" &&
            state.elementID === id &&
            state.part === "body";
          ctx.lineWidth =
            is_load_hovered(id, hoveredPart) || heldBody
              ? loadHoverWidth
              : loadRestWidth;
          draw_distributed_force(
            ctx,
            start,
            end,
            vectorStart,
            vectorEnd,
            is_load_hovered(id, hoveredPart, "body") || heldBody
              ? loadHoverWidth
              : loadRestWidth,
          );
          draw_force(
            ctx,
            start,
            vectorStart,
            Math.abs(distributedForce.magnitudeStart),
            (hideText &&
              state.type === "EditingValue" &&
              state.part === "start") ||
              is_zero_load(distributedForce.magnitudeStart),
            " N/m",
            is_load_hovered(id, hoveredPart, "start-value")
              ? loadHoverWidth
              : loadRestWidth,
          );
          draw_force(
            ctx,
            end,
            vectorEnd,
            Math.abs(distributedForce.magnitudeEnd),
            (hideText &&
              state.type === "EditingValue" &&
              state.part === "end") ||
              is_zero_load(distributedForce.magnitudeEnd),
            " N/m",
            is_load_hovered(id, hoveredPart, "end-value")
              ? loadHoverWidth
              : loadRestWidth,
          );
          if (heldTip) {
            draw_hover_circle(ctx, heldTip === "start" ? tipStart : tipEnd);
          }
          break;
        }
        case "moment": {
          const load = element as MomentElement;
          const { center, radius } = moment_screen_geometry(
            load,
            mechanicalElements,
            viewport,
          );
          ctx.lineWidth = is_load_hovered(load.id, hoveredPart)
            ? loadHoverWidth
            : loadRestWidth;
          draw_moment(
            ctx,
            center,
            radius,
            load.value,
            hideText,
            is_load_hovered(load.id, hoveredPart, "value")
              ? loadHoverWidth
              : loadRestWidth,
          );
          break;
        }
      }
    }
    if (type === "belt") {
      for (const gear of elevatedGears) {
        ctx.strokeStyle = gear.strokeStyle;
        ctx.fillStyle = gear.fillStyle;
        ctx.lineWidth = gear.lineWidth;
        ctx.globalAlpha = gear.globalAlpha;
        ctx.shadowColor = gear.shadowColor;
        ctx.shadowBlur = gear.shadowBlur;
        draw_gear(
          ctx,
          world2screen(gear.element.position, viewport),
          world2screen_length(gear.element.radius, viewport),
          world2screen_angle(gear.element.angle),
          gear.isHovered,
        );
      }
    }
  });

  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;

  for (const symbol of redundancySymbols)
    draw_redundancy_symbol(ctx, viewport, symbol, now);
}
