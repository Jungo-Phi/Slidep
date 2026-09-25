/** How the canvas and the panels respond to the pointer: hit tolerances, feedback opacities, and the animations that illustrate a result. */

export const HIT_TOLERANCE = {
  EDGE: 10,
  NODE: 14,
  CONSTRAINT: 20,
  SNAP: 8,
  PROBE: 10,
  // How far (screen px) the pointer must travel from the mouseDown for a click to turn into a drag: under it, a click; over it, a drag.
  // A distance rather than a delay keeps the two apart whatever the framerate and the pointer's speed.
  DRAG_START: 4,
} as const;

export const INTERACTION_SPECS = {
  SELECTION_HALO_SIZE: 10,
  ICON_HALO_SIZE: 5,
  /** How many times an arrow's background halo is stacked: a blur spreads a thin stroke's shadow too weak to see at one pass. */
  ARROW_HALO_PASSES: 3,
  DELETION_OPACITY: 0.3,
  GHOST_PREVIEW_OPACITY: 0.6,
  GEAR_ON_BELT_GROW: 15,
  BELT_GRAB_RADIUS: 4,
  /** Opacity of the library dialog's tint film, over the beam's own normal colors. */
  LIBRARY_TINT_OPACITY: 0.35,
} as const;

/**
 * Showing one degree of freedom by swinging the mechanism along it (analysis panel).
 */
export const MODE_ANIMATION = {
  /**
   * How far the widest-moving node travels, as a fraction of the WHOLE mechanism's extent.
   *
   * The mechanism's, not the chain's: an animation illustrates a property of the mechanism, so every chain of it swings by the same amount, and an isolated node — which has no extent of its own — still moves visibly.
   */
  AMPLITUDE_RATIO: 0.06,
  /** Seconds for a full there-and-back swing. The panel row beats in time with it. */
  PERIOD_S: 1.6,
  /**
   * How long the dimensions stay away after a swing ends.
   *
   * Long enough to cross from one mode's row to the next without them flashing back in between, short enough that leaving the list brings them straight back.
   */
  DIMENSION_RETURN_DELAY_MS: 200,
} as const;

/**
 * Same swing, for a gallery card on hover: evocative rather than a precise DDL reading, so it runs wider and quicker than MODE_ANIMATION's.
 */
export const THUMBNAIL_MODE_ANIMATION = {
  AMPLITUDE_RATIO: 0.15,
  PERIOD_S: 1.2,
} as const;

/**
 * Zoom a preview falls back to when it has nothing finite to fit — an empty mechanism, or one whose anchors all sit at the same point.
 * World units are metres: this lands the grid in its millimetre decade (see `grid.ts`), the finest scale a preview ever bothers to resolve.
 */
export const PREVIEW_MIN_ZOOM = 1000;

/** Framing margins for "Recentrer": the mechanism fit to the canvas, as a fraction of its width and height on each side. */
export const CANVAS_FIT_MARGIN = {
  ratioMarginX: 0.16,
  ratioMarginY: 0.16,
} as const;

/**
 * Framing margins for a gallery thumbnail, at rest and while a card is hovered.
 *
 * Tighter margins on hover draw the eye in, including for a mechanism with no freedom to swing, which would otherwise show no reaction to the hover at all.
 * `TRANSITION_S` eases between the two so the zoom doesn't cut in and out.
 */
export const THUMBNAIL_MARGIN = {
  REST: { ratioMarginX: 0.08, ratioMarginY: 0.12 },
  HOVER: { ratioMarginX: 0.06, ratioMarginY: 0.09 },
  TRANSITION_S: 0.15,
} as const;

/**
 * How long the pointer must rest on a menu entry before the setting it names is tried on — a theme family, a beam-fill lens.
 * A swipe across the list on the way somewhere else asks for nothing, and should repaint nothing.
 */
export const HOVER_PREVIEW_DELAY_MS = 100;

/**
 * How long a numeric field waits, after a step, for the next one before closing its history entry.
 * A run of arrow clicks — up, up, then back down — undoes in one go; the same field touched again later starts its own entry.
 */
export const VALUE_EDIT_COALESCE_MS = 800;

/**
 * How long (ms) an element's constraint badges stay up once the pointer has left it (edition's hover reveal).
 */
export const CONSTRAINT_REVEAL_COOLDOWN_MS = 900;

/**
 * How long (ms) the badges take to fade at the very end of that cooldown: full opacity until `COOLDOWN - FADE`, then down to 0.
 */
export const CONSTRAINT_REVEAL_FADE_MS = 200;

/**
 * How long (ms) a toast stays up.
 * `REPORT` is for the messages that report something lost or changed without the user's knowing: they must hold long enough to be read to the end.
 */
export const SNACKBAR_DURATION = {
  DEFAULT: 3000,
  REPORT: 12000,
};

/**
 * The properties panel's floating scrollbar: the thumb is drawn over the content rather than in a column of its own, so the width the children get never changes when the panel starts scrolling.
 */
export const OVERLAY_SCROLLBAR = {
  /** Thumb width, and how far it sits from the right edge (px). */
  WIDTH: 6,
  /** How far the track stays clear of the top and bottom edges (px). */
  MARGIN: 2,
  /** Shortest the thumb ever gets, however long the content is (px). */
  MIN_THUMB_HEIGHT: 28,
  /** Shortest it gets while squeezed against an edge by an overscroll (px). */
  MIN_SQUEEZED_HEIGHT: 8,
  /** Time without scrolling, pointer off the panel, before the thumb fades (ms). */
  IDLE_MS: 900,
  FADE_MS: 200,
};

/**
 * Native HTML5 drag and drop does not auto-scroll a nested `overflow` container the way it does the page itself, so `OverlayScrollArea` drives it manually: the closer the pointer gets to the top/bottom edge inside `EDGE_PX`, the faster it scrolls, up to `MAX_SPEED_PX_PER_FRAME` right at the edge.
 */
export const DRAG_AUTO_SCROLL = {
  EDGE_PX: 36,
  MAX_SPEED_PX_PER_FRAME: 14,
};

export const CURSOR_STYLE = {
  HOVER: "grab",
  MOVE: "grabbing",
};
