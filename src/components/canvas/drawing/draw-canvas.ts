import { CanvasDrawing, draw_mechanism } from "./draw-mechanism";
import { draw_gesture_preview } from "./draw-gesture-preview";
import { draw_ruler } from "./draw-measure";
import {
  draw_floor,
  draw_overlay_arrow,
  draw_overlay_arrow_label,
  draw_overlay_moment,
  draw_overlay_moment_label,
  draw_trajectory,
  type FocusedOverlay,
  type OverlayArrow,
  type OverlayMoment,
  type TrajectoryDisplay,
} from "./drawing-functions";
import type { HoveredBalanceTerm } from "../../solver/analysis/force-balance";
import type { FloorConfig, ID, ViewportState } from "../../../types";
import type { HoveredPart } from "../../../types/hovered-part";
import type { CanvasState } from "../../../types/canvas-state";

export type { CanvasDrawing, CanvasHighlight } from "./draw-mechanism";
export { NO_HIGHLIGHT } from "./draw-mechanism";

/** Shared empties, so a frame with no recording behind it allocates none. */
const EMPTY_TRAJECTORIES: TrajectoryDisplay[] = [];
const EMPTY_ARROWS: OverlayArrow[] = [];
const EMPTY_MOMENTS: OverlayMoment[] = [];

/**
 * One frame of the scene: what `draw_mechanism` shows, plus the layers that go under and over it.
 * `hoveredOverlayElementID` and `litLoadIDs` are absent on purpose — what a hover names is resolved here, from the same hover the arrows themselves are drawn against.
 */
export type MechanicalCanvasDrawing = Omit<
  CanvasDrawing,
  "hoveredOverlayElementID" | "litLoadIDs"
> & {
  /** Canvas size, px — the floor is a line clipped to it, not a shape of its own. */
  canvasWidth: number;
  canvasHeight: number;
  /** The surface the mechanism rests on, drawn under every element. */
  floor?: FloorConfig;
  /** The probed points' travelled paths, under everything else: they are where the mechanism has been, not part of it. */
  trajectories?: TrajectoryDisplay[];
  trajectoryDotted?: boolean;
  /** The recording's readings for this frame, drawn over the elements they dress. */
  overlayArrows?: OverlayArrow[];
  overlayMoments?: OverlayMoment[];
  /** A row of the panel's force balance pointing at a reading — lights it up exactly as the cursor would. */
  hoveredBalanceTerm?: HoveredBalanceTerm | null;
};

/** The readings drawn with their value, and the element they belong to — see `hovered_readings`.
 * Several of each kind, since one reading may be drawn at more than one place: a member's internal effort is named once and shown at both its ends. */
type HoveredReadings = {
  arrows: OverlayArrow[];
  moments: OverlayMoment[];
  elementID?: ID;
  /** The loads the hover names, drawn thick — a whole balance line names several at once, which `elementID` cannot carry. */
  loadIDs: ReadonlySet<ID>;
};

/**
 * Whichever reading the hover names, wherever that hover came from: the cursor or a row of the panel pointing at one.
 * Not hit-tested here: a reading and an element are the same register, so one function ranks them both (`get_hovered_part`), and this only reads what it answered.
 * A balance row lights its force from either column, and a support's own couple only from ΣM, the one line that couple enters.
 * The element a weight or support term belongs to is lit even where no reading of it is on screen: `MechanicalCanvas` draws that reading itself — but only where the hover names ONE term, a whole line naming half the mechanism instead.
 * A load has no such reading: its own arrow is part of the mechanism, so it is lit by being drawn thick (`loadIDs`), however many the hover names.
 */
function hovered_readings(
  hoveredPart: HoveredPart,
  hoveredBalanceTerm: HoveredBalanceTerm | null,
  arrows: OverlayArrow[],
  moments: OverlayMoment[],
): HoveredReadings {
  const reading = hoveredPart.type === "Overlay" ? hoveredPart.reading : null;
  const names_reading = (candidate: OverlayArrow | OverlayMoment) =>
    !!reading &&
    reading.elementID === candidate.elementID &&
    reading.kind === candidate.kind &&
    // No point named means the whole element's own: a member's internal effort is read along it, so it answers for either end (see `merged_internal`).
    (reading.which === undefined || reading.which === candidate.which);
  const hoveredTerms = hoveredBalanceTerm?.terms ?? [];
  // The law's right-hand member stands for one reading of every body rather than for any term, so it is matched on the kind instead of on a term's own id.
  const inertiaNamed = hoveredBalanceTerm?.inertia === true;
  const in_hovered_terms = (candidate: OverlayArrow | OverlayMoment) =>
    inertiaNamed
      ? candidate.kind === "inertia"
      : hoveredTerms.some((term) => term.id === candidate.id);
  const named_arrows = arrows.filter(names_reading);
  const hoveredArrows =
    named_arrows.length > 0 ? named_arrows : arrows.filter(in_hovered_terms);
  const named_moments = moments.filter(names_reading);
  const hoveredMoments =
    named_moments.length > 0
      ? named_moments
      : hoveredBalanceTerm?.quantity === "moment"
        ? moments.filter(in_hovered_terms)
        : [];
  // One element lit, and only where the hover names one thing — the cursor on a reading, or a single row of the balance.
  const lone = hoveredTerms.length === 1 ? hoveredTerms[0] : undefined;
  const fromLoneTerm =
    lone &&
    (hoveredMoments[0]?.elementID ??
      hoveredArrows[0]?.elementID ??
      (lone.kind === "load" ? undefined : lone.elementID));
  return {
    arrows: hoveredArrows,
    moments: hoveredMoments,
    elementID:
      named_moments[0]?.elementID ??
      named_arrows[0]?.elementID ??
      fromLoneTerm ??
      undefined,
    loadIDs: new Set(
      hoveredTerms
        .filter((term) => term.kind === "load")
        .map((term) => term.elementID),
    ),
  };
}

/**
 * The measured velocities and reactions, over the elements they dress.
 * Every kind reveals its value on hover, the way a placed load does — `draw_overlay_arrow_label` picks the unit off `arrow.kind`.
 * Hovering an element lights up (and raises) every reading it owns, the mirror of `hovered_readings` pointing back at the element from a reading.
 */
function draw_overlay_readings(
  ctx: CanvasRenderingContext2D,
  viewport: ViewportState,
  hoveredPart: HoveredPart,
  hovered: HoveredReadings,
  focused: FocusedOverlay | null,
  arrows: OverlayArrow[],
  moments: OverlayMoment[],
) {
  const hoveredEdgeID =
    hoveredPart.type === "Edge" ? hoveredPart.id : undefined;
  // A focused reading draws with its own selected look instead of its owning element's, which stands down while this is true (`draw_mechanism`'s own `isSelected`).
  const names_focused = (candidate: OverlayArrow | OverlayMoment) =>
    !!focused &&
    candidate.elementID === focused.elementID &&
    candidate.kind === focused.kind &&
    // Same rule as the hover above: a reading with no point named takes both ends of its member.
    (focused.which === undefined || focused.which === candidate.which);
  // Kept apart from `names_focused`: a selected-but-not-hovered reading must draw at its own, lesser width — not the width a live hover would stack on top of it.
  const is_hovered = (candidate: OverlayArrow | OverlayMoment) =>
    (hovered.arrows as (OverlayArrow | OverlayMoment)[]).includes(candidate) ||
    (hovered.moments as (OverlayArrow | OverlayMoment)[]).includes(candidate) ||
    (hoveredEdgeID !== undefined && candidate.elementID === hoveredEdgeID);
  const emphasized = (candidate: OverlayArrow | OverlayMoment) =>
    is_hovered(candidate) || names_focused(candidate);

  // Two passes so an emphasized reading always draws on top of the ones it overlaps, not just wherever it falls in the array.
  for (const arrow of arrows)
    if (!emphasized(arrow)) draw_overlay_arrow(ctx, viewport, arrow, false);
  for (const arrow of arrows)
    if (emphasized(arrow))
      draw_overlay_arrow(
        ctx,
        viewport,
        arrow,
        is_hovered(arrow),
        names_focused(arrow),
      );
  for (const moment of moments)
    if (!emphasized(moment)) draw_overlay_moment(ctx, viewport, moment, false);
  for (const moment of moments)
    if (emphasized(moment))
      draw_overlay_moment(
        ctx,
        viewport,
        moment,
        is_hovered(moment),
        names_focused(moment),
      );

  // The labels last, on top of every arrow/moment just drawn: an arrow drawn later in the loops above must not obstruct another one's label.
  // A selected reading keeps its value on screen for as long as it stands, not just while the cursor is on it: that value is what selecting it was for.
  // Every place the named reading is drawn gets its value, not just the first: both ends of a member's own internal effort read at once, which is the whole point of naming it once.
  const labelledArrows =
    hovered.arrows.length > 0 ? hovered.arrows : arrows.filter(names_focused);
  const labelledMoments =
    hovered.moments.length > 0 ? hovered.moments : moments.filter(names_focused);
  for (const arrow of labelledArrows)
    draw_overlay_arrow_label(ctx, viewport, arrow, names_focused(arrow));
  for (const moment of labelledMoments)
    draw_overlay_moment_label(ctx, viewport, moment, names_focused(moment));
}

/** Whether the floor is being reached for, either by the cursor or by the drag already under way. */
function floor_hover(
  hoveredPart: HoveredPart,
  state: CanvasState,
): { floor: boolean; angle: boolean; value: boolean } {
  const angle =
    hoveredPart.type === "FloorAngle" || state.type === "DraggingFloorAngle";
  return {
    floor:
      angle ||
      hoveredPart.type === "FloorHeight" ||
      hoveredPart.type === "FloorAngleValue" ||
      state.type === "DraggingFloorHeight",
    angle,
    value: hoveredPart.type === "FloorAngleValue",
  };
}

/**
 * Draws the whole scene, in one place so nothing decides its own layer: the trajectories, the floor they run over, the mechanism itself, the ruler's readings, the ghost of the tool gesture in progress if the cursor is over the canvas, then the overlay readings.
 * The grid, the axes and the lens legend stay out: they are screen furniture, read against the drawing rather than part of it.
 *
 * The ruler is drawn ahead of the gesture preview: a reading is meant to be read, and reading it means looking away from the canvas.
 */
export function draw_mechanical_canvas(
  ctx: CanvasRenderingContext2D,
  drawing: MechanicalCanvasDrawing,
) {
  const {
    viewport,
    hoveredPart,
    state,
    canvasWidth,
    canvasHeight,
    floor,
    trajectories = EMPTY_TRAJECTORIES,
    trajectoryDotted = false,
    overlayArrows = EMPTY_ARROWS,
    overlayMoments = EMPTY_MOMENTS,
    hoveredBalanceTerm = null,
    focusedOverlay = null,
  } = drawing;

  for (const trajectory of trajectories)
    draw_trajectory(ctx, viewport, trajectory, trajectoryDotted);

  if (floor) {
    const reached = floor_hover(hoveredPart, state);
    draw_floor(
      ctx,
      viewport,
      canvasWidth,
      canvasHeight,
      floor,
      reached.floor,
      reached.angle,
      reached.value,
    );
  }

  // Resolved before the mechanism, so the element a hovered reading belongs to draws thickened in the same frame its reading lights up.
  const hovered = hovered_readings(
    hoveredPart,
    hoveredBalanceTerm,
    overlayArrows,
    overlayMoments,
  );

  draw_mechanism(ctx, {
    ...drawing,
    hoveredOverlayElementID: hovered.elementID,
    litLoadIDs: hovered.loadIDs,
  });
  draw_ruler(ctx, {
    viewport,
    state,
    hoveredPart,
    mechanicalElements: drawing.mechanicalElements,
    cursorOnCanvas: drawing.cursorOnCanvas ?? false,
  });
  if (drawing.cursorOnCanvas)
    draw_gesture_preview(ctx, {
      viewport,
      hoveredPart,
      state,
      mechanicalElements: drawing.mechanicalElements,
      dimensionSnapped: drawing.dimensionSnapped,
    });

  draw_overlay_readings(
    ctx,
    viewport,
    hoveredPart,
    hovered,
    focusedOverlay,
    overlayArrows,
    overlayMoments,
  );
}
