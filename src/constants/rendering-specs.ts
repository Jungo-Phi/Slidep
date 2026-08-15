import { UnionElement } from "../types";
import {
  canvas_palette,
  CanvasPalette,
  DEFAULT_THEME,
  mix_theme_specs,
  THEME_SPECS,
  THEME_TRANSITION_CLASS,
  THEME_TRANSITION_MS,
  THEMES,
  ThemeName,
  ThemeSpec,
} from "./mui-theme";

/** Alpha suffixes, appended to a hex color. Theme-independent. */
const TRANSPARENCY = {
  ICON_TRANSPARENCY: "C8", // 75% opacity
  HOVER_TRANSPARENCY: "CC", // 80% opacity
  HALF_TRANSPARENCY: "80", // 50% opacity
} as const;

/**
 * Colors used to draw on the canvas, for the *currently selected theme*. Names
 * state the role, not the hue, so that a change of accent does not turn every
 * name into a lie.
 *
 * This binding is reassigned by `set_canvas_theme`. Drawing code may read
 * `COLORS.X` freely — the canvas redraws every animation frame, so a theme
 * switch shows up on the next one — but must not capture it in a module-level
 * constant, which would freeze it on the theme active at import time.
 *
 * Do not use `COLORS` inside a React `sx` prop: UI components go through the
 * theme's semantic roles (`text.primary`, `primary.main`, `action.hover`, …).
 */
export let COLORS: CanvasPalette & typeof TRANSPARENCY = {
  ...THEMES[DEFAULT_THEME].canvas,
  ...TRANSPARENCY,
};

/**
 * The palette the icons are drawn in. Always a theme's own palette, never an
 * intermediate one: icons are SVG sources recolored into data URIs and cached
 * per palette, so following the fade frame by frame would rebuild and re-decode
 * every icon sixty times a second. They snap to the new theme instead, while
 * the rest of the drawing fades under them.
 */
export let ICON_COLORS: CanvasPalette = THEMES[DEFAULT_THEME].canvas;

/**
 * The spec `COLORS` currently stands for — a theme's own, or, mid-fade, one
 * blended between two. A fade interrupted by another theme change departs from
 * here, and so never jumps.
 */
let current: ThemeSpec = THEME_SPECS[DEFAULT_THEME];

/** The fade in flight, if any — a second theme change cuts it short. */
let fade: number | null = null;

/**
 * Le fondu CSS de l'interface, joué en même temps que celui du canvas.
 *
 * Il ne vit que le temps du changement de thème : hors de là, la transition
 * s'appliquerait aussi au survol et à la sélection, qu'elle rendrait mous.
 */
const set_ui_fading = (fading: boolean): void => {
  document.documentElement.classList.toggle(THEME_TRANSITION_CLASS, fading);
};

/**
 * Repoint the canvas palette, fading into it over `duration` ms. The canvas
 * redraws every animation frame, so simply moving `COLORS` frame by frame is
 * enough to make the drawing cross-fade with the rest of the interface.
 *
 * The fade runs linearly, like the interface's own CSS transitions: the ground
 * under the drawing is painted in CSS, the grid on top of it in canvas, and two
 * different curves would put one out of step with the other.
 *
 * Pass `duration = 0` to land on the new theme at once — on the first paint,
 * where there is nothing to fade from.
 */
export function set_canvas_theme(
  name: ThemeName,
  duration: number = THEME_TRANSITION_MS,
): void {
  if (fade !== null) cancelAnimationFrame(fade);
  fade = null;

  ICON_COLORS = THEMES[name].canvas;
  const target = THEME_SPECS[name];

  if (duration <= 0) {
    set_ui_fading(false);
    current = target;
    COLORS = { ...THEMES[name].canvas, ...TRANSPARENCY };
    return;
  }

  set_ui_fading(true);
  const from = current;
  const start = performance.now();
  const step = () => {
    const t = Math.min(1, (performance.now() - start) / duration);
    current = t < 1 ? mix_theme_specs(from, target, t) : target;
    COLORS = { ...canvas_palette(current), ...TRANSPARENCY };
    if (t < 1) {
      fade = requestAnimationFrame(step);
    } else {
      fade = null;
      set_ui_fading(false);
    }
  };
  fade = requestAnimationFrame(step);
}

const STANDARD_STROKE = 2;
/** Added to an element's own width when it is hovered. A gain rather than a
 *  fixed width, so that emphasis stays proportionate on a stroke that does not
 *  rest at `STANDARD` — a gear outline jumping straight to a belt's weight reads
 *  as a belt, not as a hovered gear. */
const HOVER_GAIN = 1.5;

export const STROKE_WIDTHS = {
  STANDARD: STANDARD_STROKE,
  /** Gears rest on a light outline: they are large, and a full-weight circle
   *  would compete with the belt riding on that same perimeter. */
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

export const HIT_TOLERANCE = {
  EDGE: 10,
  NODE: 14,
  CONSTRAINT: 20,
  SNAP: 8,
  PROBE: 10,
  // Distance (px écran) que la souris doit parcourir depuis le mouseDown avant
  // qu'un clic ne bascule en déplacement. En dessous, c'est un clic ; au-dessus,
  // un drag. Rend la distinction clic/déplacement indépendante du framerate et
  // de la vitesse de la souris.
  DRAG_START: 4,
} as const;

export const INTERACTION_SPECS = {
  SELECTION_HALO_SIZE: 10,
  ICON_HALO_SIZE: 5,
  DELETION_OPACITY: 0.3,
  GHOST_PREVIEW_OPACITY: 0.6,
  GEAR_ON_BELT_GROW: 15,
  BELT_GRAB_RADIUS: 4,
} as const;

export const LOAD_SCALING = {
  /** Reference force value (N) for scaling. */
  REF_VALUE: 100,
  /** Drawn length (world px) of a reference-magnitude load. */
  PX_SCALE: 50,
  /** Log base of force scaling. Extending the drawn length by `PX_SCALE` will multiply the force value by `SCALE_BASE`. */
  LOG_BASE: 2,
  /** Minimal force value : 0.1 (N). */
  MIN_VALUE: 0.1,
  /** Minimal drawn force length (world px). */
  MIN_PX: 40,
  /** A moment's arc is drawn at the radius a force arrow of the same value
   *  would be long, divided by this: its diameter reads like that arrow. */
  MOMENT_RADIUS_FACTOR: 2,
  /** Mantissas of the round values a load drag snaps to, one set per decade
   *  (…, 1, 2, 5, 10, 20, 50, 100, …). Pure powers of ten would sit ~166 px
   *  apart at the current scale, leaving most of a drag with no rung nearby. */
  SNAP_MANTISSAS: [1, 2, 5],
};

/**
 * Showing one degree of freedom by swinging the mechanism along it (analysis panel).
 */
export const MODE_ANIMATION = {
  /**
   * How far the widest-moving node travels, as a fraction of the WHOLE mechanism's extent.
   *
   * The mechanism's, not the chain's: an animation illustrates a property of the mechanism,
   * so every chain of it swings by the same amount, and an isolated node — which has no
   * extent of its own — still moves visibly.
   */
  AMPLITUDE_RATIO: 0.06,
  /** Seconds for a full there-and-back swing. The panel row beats in time with it. */
  PERIOD_S: 1.6,
  /**
   * How long the dimensions stay away after a swing ends.
   *
   * Long enough to cross from one mode's row to the next without them flashing back in
   * between, short enough that leaving the list brings them straight back.
   */
  DIMENSION_RETURN_DELAY_MS: 200,
} as const;

/**
 * Same swing, for a gallery card on hover: evocative rather than a precise DDL reading, so it
 * runs wider and quicker than MODE_ANIMATION's.
 */
export const THUMBNAIL_MODE_ANIMATION = {
  AMPLITUDE_RATIO: 0.15,
  PERIOD_S: 1.2,
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
 * Showing how a redundant constraint yields, drawn rather than measured (analysis panel).
 *
 * Every size here is a drawing decision in screen pixels, constant across zoom: the point this
 * replaces the strain animation for is that a symbol has no measured response to calibrate,
 * only a glyph to place and swing gently — its geometry (position, direction) still comes from
 * the mechanism, but its size never does.
 */
export const REDUNDANCY_SYMBOL = {
  /** Seconds for a full there-and-back pulse. Shares `MODE_ANIMATION`'s beat, and its panel row. */
  PERIOD_S: MODE_ANIMATION.PERIOD_S,
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

/**
 * Durée (ms) pendant laquelle les badges de contraintes d'un élément restent
 * affichés après avoir cessé de le survoler (hover-reveal en édition).
 */
export const CONSTRAINT_REVEAL_COOLDOWN_MS = 900;

/**
 * Durée (ms) du fondu de sortie, à la toute fin du cooldown : les badges sont à
 * pleine opacité jusqu'à `COOLDOWN - FADE`, puis s'estompent vers 0.
 */
export const CONSTRAINT_REVEAL_FADE_MS = 200;

/**
 * Durées (ms) d'affichage des toasts. `REPORT` est pour les messages qui rendent
 * compte de quelque chose de perdu ou de modifié à l'insu de l'utilisateur : ils
 * doivent tenir le temps d'être lus jusqu'au bout.
 */
export const SNACKBAR_DURATION = {
  DEFAULT: 3000,
  REPORT: 12000,
};

export const CURSOR_STYLE = {
  HOVER: "grab",
  MOVE: "grabbing",
};

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

  // How far a disconnection pushes apart the elements it leaves superposed, so
  // that what is still connected reads at a glance. Purely a legibility gap: it
  // holds for one solve, not as a standing minimum distance.
  DISCONNECT_SEPARATION: 20,

  // Beam
  BEAM_WIDTH: 8,

  // Spring
  SPRING_INNER_WIDTH: 6,
  SPRING_COIL_RADIUS: 7,
  SPRING_MIN_COILS: 3,
  /** World length one coil stands for, which fixes how many a spring shows. */
  SPRING_COIL_PITCH: 16,
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
  GEAR_TEETH_SIZE: 6,

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

  // Geometric constraint badges (align/normal/parallel/equal), anchored to
  // their host(s) — below it, so they stay clear of the probe badge above.
  GEOMETRIC_BADGE_OFFSET: 20,
  GEOMETRIC_BADGE_GAP: 4,
  PROBE_RADIUS: 6,

  // Trajectory
  TRAJECTORY_LINE_WIDTH: 1.5,
  TRAJECTORY_DOT_RADIUS: 2.5,
  TRAJECTORY_DOT_STEP: 8,
} as const;

export const TEXT_SPECS = {
  TEXT_FONT: "16px Arial",
  TEXT_ALIGN: "center",
  TEXT_BASELINE: "middle",
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
  "gear",
];
