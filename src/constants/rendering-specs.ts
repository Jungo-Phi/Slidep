/** The geometry every element is drawn with: sizes in screen px, stroke weights, fonts, and the order elements are painted and picked in. */

import { UnionElement } from "../types";

const STANDARD_STROKE = 2;
/** Added to an element's own width when it is hovered. A gain rather than a
 * fixed width, so that emphasis stays proportionate on a stroke that does not rest at `STANDARD` — a gear outline jumping straight to a belt's weight reads as a belt, not as a hovered gear. */
const HOVER_GAIN = 1.5;

export const STROKE_WIDTHS = {
  STANDARD: STANDARD_STROKE,
  /** Gears rest on a light outline: they are large, and a full-weight circle
   * would compete with the belt riding on that same perimeter. */
  GEAR: (STANDARD_STROKE * 3) / 4,
  GROUND_BAR: 3.5,
  SPIRE: 4,
  HOVER_GAIN,
  /** Hovered width of a stroke resting at `STANDARD`. */
  HOVERED: STANDARD_STROKE + HOVER_GAIN,
} as const;

export const LINE_STYLES = {
  LINE_CAP: "square" as const,
  LINE_JOIN: "round" as const,
} as const;

/**
 * Opacity ramp for grid lines as the zoom crosses a decade — two interlocking ladders, powers of ten and multiples of five, whose steps line up so a line moving up one level at a decade boundary keeps the opacity it had just before.
 * That is what makes the change of level invisible.
 */
export const GRID_ALPHA = {
  POWERS: [0, 0.1, 0.3, 0.6],
  FIVES: [0, 0.25, 0.45],
  /** The alpha `COLORS.GRID` stands for: the weight the strongest line reaches. Turn this to make the whole grid heavier or lighter. */
  FULL: 0.4,
  /** Below this a line is not worth a path — it lands on the ground's own pixel value. */
  INVISIBLE: 1 / 100,
} as const;

/** Dash pattern of a construction line (snap feedback): fine enough to read as an aid rather than as something drawn. */
export const GUIDE_DASH = [12, 8] as const;

/** The floor: an infinite line, drawn clipped to the canvas — every size here is a screen-px
 * drawing decision, constant across zoom, like `REDUNDANCY_SYMBOL`'s. */
export const FLOOR = {
  /** How far along the line the angle-rotation handle sits from the height anchor. */
  ANGLE_HANDLE_PX: 150,
  /** Radius of the angle-constraint arc drawn when the floor isn't flat — inside the
   * handle, so the two never overlap. */
  ANGLE_ARC_PX: 150,
  /** Half-length of the tick mark drawn across the line at the height anchor. */
  ANCHOR_TICK_PX: 12,
  /** Spacing between hatching ticks, same "ground" language as `draw_ground`'s. */
  HATCH_SPACING_PX: 14,
  /** Length of one hatching tick — `DIM.GROUND_HEIGHT`'s, for the same reason. */
  HATCH_LENGTH_PX: 15,
} as const;

/**
 * Showing how a redundant constraint yields, drawn rather than measured (analysis panel).
 *
 * Every size here is a drawing decision in screen pixels, constant across zoom: the point this replaces the strain animation for is that a symbol has no measured response to calibrate, only a glyph to place and swing gently — its geometry (position, direction) still comes from the mechanism, but its size never does.
 */
export const REDUNDANCY_SYMBOL = {
  /** How far a "gap" symbol's two ticks pull apart from their rest position, in px. */
  GAP_AMPLITUDE_PX: 50,
  /** Half-length of a gap tick, perpendicular to the axis, in px. */
  GAP_TICK_PX: 15,
  /** Length of a "diverge" symbol's two arms, in px. */
  ARM_LENGTH_PX: 100,
  /** How far the arms swing away from their rest direction, in degrees. */
  ARM_SWING_DEG: 20,
  /** Radius of the small arc drawn between the two arms, in px. */
  ARM_ARC_PX: 30,
  /** How far an "off-rail" symbol's node lifts off its rail at the pulse's peak, in px. */
  LIFT_PX: 40,
  /** Half-length of the rail tick drawn at the node's rest position, in px. */
  RAIL_TICK_PX: 20,
} as const;

/** Element dimensions from UX specification */
export const DIM = {
  // General
  TAC: 20,
  ICON_SIZE: 24,
  ARROW_HEAD_LENGTH: 18,
  ARROW_HEAD_WIDTH: 13,

  // Edges
  EDGE_ENDPOINT_RADIUS: 7,
  /** Shortest edge a gesture may draw, and smallest gear it may size — in **screen** px, so that what one can see and grab does not depend on the zoom. Neither is a world minimum: the solver has none. */
  MIN_EDGE_LENGTH: 30,

  // How far a disconnection pushes apart the elements it leaves superposed, so that what is still connected reads at a glance.
  // Purely a legibility gap: it holds for one solve, not as a standing minimum distance.
  // A world distance (20 mm), not a screen one, despite living among this object's px constants.
  DISCONNECT_SEPARATION: 0.02,

  // Beam
  BEAM_WIDTH: 8,

  // Spring
  SPRING_INNER_WIDTH: 6,
  SPRING_COIL_RADIUS: 7,
  SPRING_MIN_COILS: 3,
  /** Ceiling on the count, for the spring whose rest length dwarfs the mechanism it belongs to — a typed one is free to. */
  SPRING_MAX_COILS: 20,
  /** Coils shown by a spring as long as the whole mechanism, which fixes the pitch every other spring is counted against — see `coil_pitch_of_bounds`. A count, not a length: nothing here is in px nor in world units. */
  SPRING_COILS_PER_SPAN: 20,
  /** How far the coils passing behind the spring recede into the ground. */
  SPRING_BACK_COIL_OPACITY: 0.45,

  // Damper
  DAMPER_INNER_WIDTH: 6,
  DAMPER_CYLINDER_DIAMETER: 20,
  DAMPER_PISTON_WIDTH: 6,

  /** Half the gap between a spring and a damper drawn in parallel. */
  PARALLEL_EDGE_OFFSET: 12,

  // Mass
  MASS_HEIGHT: 24,
  /** Tilt of the trapezoid sides, away from vertical. */
  MASS_SIDE_ANGLE: 20 * (Math.PI / 180),
  /** Free space kept on each side of the label before the shape widens. */
  MASS_TEXT_PADDING: 9,

  // Pivot
  PIVOT_OUTER_RADIUS: 9,
  PIVOT_INNER_RADIUS: 4,
  /** Half the span of each arm of the moment balance's reference-point cross — reaching past a pivot, so it reads as its own mark rather than as a node that happens to sit there. */
  MOMENT_BALANCE_MARKER_HALF_SIZE: 13,
  /** Radius of the centre-of-mass marker — a touch bigger than a ruler endpoint's own ring, since it stands for the whole mechanism rather than one point of it. */
  CENTER_OF_MASS_RADIUS: 9,
  /** How far the veil under that marker reaches, as a multiple of its radius: the marker lands wherever the mass puts it, bars included, and the veil is what keeps its shape readable over them. */
  CENTER_OF_MASS_VEIL_SCALE: 1.5,
  // Motor
  MOTOR_RADIUS: 18,
  MOTOR_CORNER_RADIUS: 2.5,
  MOTOR_ARROW_RADIUS: 30,
  MOTOR_ARROW_ANGLE: 1 / 6,
  // Join
  JOIN_RADIUS: 6,

  // Slider
  SLIDER_OUTER_WIDTH: 24,
  SLIDER_OUTER_HEIGHT: 14,
  SLIDER_INNER_WIDTH: 14,
  SLIDER_INNER_HEIGHT: 6,
  SLIDER_RADIUS: 2,

  // Slidep
  SLIDEP_OUTER_WIDTH: 28,

  // Gear
  DEFAULT_GEAR_RADIUS: 40,
  MIN_GEAR_RADIUS: 30,
  GEAR_HOLES_COUNT: 3,

  // Belt
  BELT_WIDTH: 3,
  END_RADIUS: 4,

  // Ground
  GROUND_WIDTH: 22,
  GROUND_HEIGHT: 10,
  GROUND_BAR_HEIGHT: 6,
  GROUND_VERTICAL_OFFSET: 6,

  // Dimensions
  HELPER_LINE_BASE_OFFSET: 7,
  AUTO_DIMENSION_OFFSET: 50,

  // Loads
  ARROW_BASE_OFFSET: 5,
  ARROW_HEAD_OFFSET: 3,
  LOAD_VALUE_OFFSET: 20,
  NB_DISTRIBUTED_FORCE_ARROWS: 5,

  // Probe
  PROBE_OFFSET: 20,

  // Geometric constraint badges (align/normal/parallel/equal), anchored to their host(s) — below it, so they stay clear of the probe badge above.
  GEOMETRIC_BADGE_OFFSET: 20,
  GEOMETRIC_BADGE_GAP: 4,
  PROBE_RADIUS: 6,

  // Trajectory
  TRAJECTORY_LINE_WIDTH: 1.5,
  TRAJECTORY_DOT_RADIUS: 2.5,
  TRAJECTORY_DOT_STEP: 1, // TODO: make this editable?
} as const;

const SCHEMA_DIM_OFFSET = 20;

/**
 * The cross-section schema on a beam's properties (materials panel): a technical drawing rather than a canvas element, so every size here is a screen-px decision, constant whatever section it ends up drawing.
 * The view is cropped to what the drawing actually covers and rendered one unit to the pixel, so these numbers read literally — `SECTION_SIZE` is the one that says how big the schema comes out.
 *
 * `MAX_ASPECT` and `MIN_THICKNESS` are what let a section stay readable when its own proportions would make it unreadable — the cotes keep carrying the true values whatever those two do.
 */
export const SECTION_SCHEMA = {
  /** Drawn size of the section's largest extent. Everything else is annotation around it, so this is what sets how big the schema reads. */
  SECTION_SIZE: 72,
  /** Uniform border kept around everything the drawing covers, labels included. */
  PAD: 6,
  FONT: 10,
  /** Distance from the section's edge to the first dimension line on that side. */
  DIM_OFFSET: SCHEMA_DIM_OFFSET,
  /** Distance between two dimension lines stacked on the same side. */
  DIM_STEP: 18,
  TEXT_GAP: 3,
  /** How far an extension line runs past the dimension line it reaches. */
  EXT_OVERSHOOT: 3,
  ARROW: 5,
  /** The neutral axis pokes out of the section, but stops short of the dimension lines. */
  AXIS_OVERSHOOT: SCHEMA_DIM_OFFSET / 4,
  /** Angle above the horizontal a round wall's cote is read along: off the horizontal so the
   * cote does not sit on the neutral axis, off the vertical so it costs the schema no height. */
  ROUND_WALL_ANGLE: 20,

  /** Beyond this width-to-height ratio the section is drawn stubbier than it is: a 200×5 flat
   * would otherwise come out as a hairline with nowhere to hang a cote. */
  MAX_ASPECT: 5,
  /** Walls are thickened until the thinnest of them reaches this fraction of the section's
   * short side — below it the two edges merge and the cote has nothing left to point at. */
  MIN_THICKNESS: 1 / 20,
  /** …and never below this many px, whatever the fraction works out to: on a section the aspect
   * clamp already flattened, a fraction of the short side is itself sub-pixel. */
  MIN_THICKNESS_PX: 2,
  /** Ceiling that thickening may not push a wall past, so a section whose thinnest wall is
   * minute cannot have its thickest one swallow the section. */
  MAX_THICKNESS: 1 / 4,

  OUTLINE_WIDTH: 1.5,
  DIM_WIDTH: 1,
  EXT_WIDTH: 0.75,
  AXIS_DASH: "6,2,1,2",
} as const;

export const TEXT_SPECS = {
  TEXT_FONT: "16px Arial",
  TEXT_ALIGN: "center",
  TEXT_BASELINE: "middle",
} as const;

/** Icon silhouette tinting (selected / about-to-delete states), rasterized once per (source, colour) and cached. */
export const ICON_TINT = {
  /** Supersample factor: rendered above the drawn size so the silhouette stays crisp when scaled down. */
  SUPERSAMPLE: 4,
} as const;

/**
 * The world axes' graduations: small ticks and numbers riding `draw_axes`'s lines, at the same spacing a point snaps to.
 */
export const GRADUATION = {
  /** How far a tick's stroke extends either side of the axis line, in px. */
  TICK_LENGTH: 4,
  /** Gap between a tick's end and the label it carries, in px. */
  LABEL_GAP: 3,
  FONT: "10px Arial",
  /** Vertical room one line of graduation text needs. Only sets when the horizontal axis's labels flip above the line, so a generous constant is fine — no need to measure it. */
  LABEL_HEIGHT: 14,
  /** Width of the background-coloured halo stroked under each label, so the digits stay legible over a grid line crossing behind them. */
  HALO_WIDTH: 3,
  /**
   * The units a graduation can be shown in, coarsest first: km, m, mm, µm — every third power of ten, so switching units is switching by exactly the digits a thousand adds.
   */
  UNITS: [
    { scale: -3, suffix: "km" },
    { scale: 0, suffix: "m" },
    { scale: 3, suffix: "mm" },
    { scale: 6, suffix: "µm" },
  ],
} as const;

/** Ordre de dessin des éléments sur le canvas */
export const DRAWING_ORDER: (
  | UnionElement["type"]
  | "probe"
  | "geometricBadge"
)[] = [
  "gear",
  "beam",
  "damper",
  "spring",
  "belt",
  "join",
  "slidep",
  "slider",
  "pivot",
  "mass",
  "probe",
  "geometricBadge",
  "distributed-force",
  "force",
  "moment",
  "dimension-edge-to-node",
  "dimension-node-to-node",
  "dimension-edge",
  "dimension-angle",
  "dimension-radius",
  "dimension-belt",
  "gear-ratio",
];

/** Ordre de hover des éléments sur le canvas */
export const HOVER_ORDER: (
  | UnionElement["type"]
  | "probe"
  | "motorArrow"
  | "geometricBadge"
  | "overlay"
)[] = [
  "geometricBadge",
  "gear-ratio",
  "dimension-belt",
  "dimension-radius",
  "dimension-angle",
  "dimension-edge",
  "dimension-node-to-node",
  "dimension-edge-to-node",
  "probe",
  "motorArrow",
  "mass",
  "pivot",
  "slider",
  "slidep",
  "join",
  "belt",
  "spring",
  "damper",
  "beam",
  "moment",
  "force",
  "distributed-force",
  // A measured reading is drawn over everything, but it never steals the hover from a load one can actually take hold of — it is read, not edited.
  "overlay",
  "gear",
];
