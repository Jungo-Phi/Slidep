/**
 * Rendering specifications for mechanical elements
 */

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

export const PHYSICS = {
  DEFAULT_MOTOR_SPEED: 10, // tr/min
  GRAVITY: 10, // m/s^2
} as const;

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

/** Showing an over-constraint by asking one of its joints to hold a value it cannot. */
export const STRAIN_ANIMATION = {
  /**
   * How wrong the joint is asked to be, as a fraction of the WHOLE mechanism's extent.
   *
   * Small, and it has to be. Measured on the gallery: a lie of a few per cent leaves every
   * mechanism in pieces — bars three times their length — because the parts can no longer
   * reach the pose being asked of them at all. That is a jammed drawing, not a strain. Kept
   * where the response is still proportional to the lie, the picture stays the mechanism's
   * own; what it costs in legibility, `SHOWN_RATIO` buys back.
   */
  LIE_RATIO: 0.005,
  /**
   * How far a bar should APPEAR to stretch, as a fraction of its own length.
   *
   * The response is drawn magnified, the way a stress plot exaggerates a deflection: the
   * displacement field is scaled whole, so shape and proportion stay the mechanism's and
   * only the size is not. It is the stretching the magnification is aimed at, because that
   * is the statement — a mechanism that cannot take the lie up. On a heavily over-constrained
   * one the parts barely move at all and a single short bar takes the whole error; aiming at
   * the travel instead would blow that bar up to three times its length.
   */
  SHOWN_STRAIN_RATIO: 0.12,
  /**
   * Ceiling on the travel, as a fraction of the extent.
   *
   * Only binds when the mechanism answers the lie by moving rather than by straining, where
   * aiming at the stretching alone would ask for a magnification nothing justifies.
   */
  SHOWN_RATIO: 0.05,
  /**
   * Ceiling on that magnification.
   *
   * A joint whose lie the mechanism barely answers at all would otherwise have the solver's
   * own rounding blown up into a shape, which is a picture of nothing.
   */
  MAX_GAIN: 60,
  /**
   * Below this share of the extent, the mechanism did not answer the lie at all.
   *
   * A real case: a belt whose pulleys are every one of them anchored. Its length cannot be
   * wrong in any direction anything can move, so there is nothing to show and the panel says
   * so by not animating.
   */
  DEAD_RESPONSE_RATIO: 0.0005,
  /** Seconds for a full there-and-back strain. Shares the modes' beat, and their panel row. */
  PERIOD_S: MODE_ANIMATION.PERIOD_S,
  /**
   * Sweeps each strained pose gets.
   *
   * A falsified system is inconsistent, so the solve never satisfies its constraints and
   * never exits early: this budget is spent in full, every frame.
   */
  SWEEPS: 200,
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
export const DRAWING_ORDER: (UnionElement["type"] | "probe")[] = [
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
  "distributed-force",
  "force",
  "moment",
  "dimension-edge-to-node",
  "dimension-node-to-node",
  "dimension-edge",
  "dimension-angle",
  "dimension-radius",
  "dimension-belt",
  "horizontal-align-edge",
  "horizontal-align-nodes",
  "vertical-align-edge",
  "vertical-align-nodes",
  "normal",
  "parallel",
  "equal",
  "gear-ratio",
];

/** Ordre de hover des éléments sur le canvas */
export const HOVER_ORDER: (UnionElement["type"] | "probe" | "motorArrow")[] = [
  "gear-ratio",
  "equal",
  "parallel",
  "normal",
  "vertical-align-nodes",
  "vertical-align-edge",
  "horizontal-align-nodes",
  "horizontal-align-edge",
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
