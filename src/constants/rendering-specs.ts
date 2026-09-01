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
  /** Opacity of the library dialog's tint film, over the beam's own normal colors. */
  LIBRARY_TINT_OPACITY: 0.35,
} as const;

/** Dash pattern of a construction line (snap feedback): fine enough to read as an aid rather than as something drawn. */
export const GUIDE_DASH = [12, 8] as const;

/** The floor: an infinite line, drawn clipped to the canvas — every size here is a screen-px
 *  drawing decision, constant across zoom, like `REDUNDANCY_SYMBOL`'s. */
export const FLOOR = {
  /** How far along the line the angle-rotation handle sits from the height anchor. */
  ANGLE_HANDLE_PX: 150,
  /** Radius of the angle-constraint arc drawn when the floor isn't flat — inside the
   *  handle, so the two never overlap. */
  ANGLE_ARC_PX: 150,
  /** Half-length of the tick mark drawn across the line at the height anchor. */
  ANCHOR_TICK_PX: 12,
  /** Spacing between hatching ticks, same "ground" language as `draw_ground`'s. */
  HATCH_SPACING_PX: 14,
  /** Length of one hatching tick — `DIM.GROUND_HEIGHT`'s, for the same reason. */
  HATCH_LENGTH_PX: 15,
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
  /** Mantissas of the round values a load drag snaps to, one set per decade
   *  (…, 1, 2, 5, 10, 20, 50, 100, …). Pure powers of ten would sit ~166 px
   *  apart at the current scale, leaving most of a drag with no rung nearby. */
  SNAP_MANTISSAS: [1, 2, 5],
};

/** Same ruler as `LOAD_SCALING` (same `PX_SCALE`/`LOG_BASE`/`SNAP_MANTISSAS`), but centred on
 *  moments' own typical range: torques are commonly tenths of N·m, not hundreds of N, so
 *  sharing `LOAD_SCALING`'s `REF_VALUE`/`MIN_VALUE` flattened every moment near `MIN_PX`,
 *  indistinguishable from one another. */
export const MOMENT_SCALING = {
  ...LOAD_SCALING,
  /** Reference moment value (N·m) for scaling. */
  REF_VALUE: 1,
  /** Minimal moment value (N·m). */
  MIN_VALUE: 0.01,
  /** Minimal drawn arc radius (world px) — a moment's arc used to be drawn at a force
   *  arrow's length divided by two (so its diameter, not its radius, read like the arrow);
   *  half of `LOAD_SCALING.MIN_PX` keeps that same floor now that the radius is computed
   *  directly on its own ruler instead of through that division. */
  MIN_PX: LOAD_SCALING.MIN_PX / 2,
};

/**
 * Below this fraction of a `NegligibilityPool` field's own running max, a value reads as
 * negligible — hidden on a canvas overlay, flattened on a probe/cohesion chart (see
 * `negligibility-pool.ts`'s `is_negligible`). One ratio shared by every quantity kind
 * (force, moment, length, angle, linear/angular velocity): a product decision, not derived
 * from anything else, so it lives here rather than being tuned per call site.
 */
export const NEGLIGIBLE_RATIO = 0.01;

/**
 * Absolute floors a `NegligibilityPool` field's running max is never allowed below, even
 * when nothing bigger was ever recorded — without this, a mechanism that only ever produces
 * noise of one kind (nothing larger of that kind anywhere in the recording) sets its own
 * pool scale from that noise, so `NEGLIGIBLE_RATIO` has nothing to filter it against (see
 * `negligibility-pool.ts`'s `extend_negligibility_pool`). Only `MIN_LENGTH`/`MIN_ANGLE`/
 * `MIN_TIME` are independent product decisions: force reuses `LOAD_SCALING.MIN_VALUE` (the
 * smallest force this app ever bothers drawing distinctly), and `force`/`moment`/velocities
 * derive from these plus the mechanism's own bounding-box diagonal wherever their physical
 * dimension allows it (a moment's lever arm, a velocity's own distance-over-time) — see
 * `pool_floors`.
 */
export const MIN_LENGTH_POOL = 0.01; // m
export const MIN_ANGLE_POOL = 0.01; // rad
export const MIN_TIME_POOL = 1; // s

/** The physics-overlay quantities drawn on the canvas: a probed velocity, and the two flavours of reaction force/moment a constraint can carry. */
export type PhysicsOverlayKind =
  | "velocity"
  | "reaction-support"
  | "reaction-internal";

/**
 * Distinguishable from a user-placed load's `COLORS.ACCENT` on purpose — an arrow here is measured, not authored.
 * Reuses entries of `PROBE_ELEMENT_COLORS` rather than inventing new ones, so a physics overlay reads as the same family as a probe chart; the two reaction kinds share the warm half of the palette (support/internal), apart from velocity's cool blue.
 */
export const PHYSICS_OVERLAY_COLOR: Record<PhysicsOverlayKind, string> = {
  velocity: "#2F81F7",
  "reaction-support": "#B8410D",
  "reaction-internal": "#60A45F",
};

/** The three internal-force diagrams of one beam, shown together in the analysis panel
 *  (docs/plan-efforts-interieurs.md phase 5bis). */
export type CohesionQuantity = "N" | "T" | "Mf";

/**
 * Its own hue family, deliberately clear of both `PHYSICS_OVERLAY_COLOR` (measured, not
 * drawn-as-a-field — a diagram and a reaction arrow can be on the same beam at once) and
 * `COLORS.DELETION_STROKE` (redundancy symbol): a violet/pink/teal trio reads as "diagram"
 * on sight, never as "error" or "reaction".
 */
export const COHESION_DIAGRAM_COLOR: Record<CohesionQuantity, string> = {
  N: "#8B5CF6",
  T: "#EC4899",
  Mf: "#14B8A6",
};

/**
 * Tension vs compression, for the `normal`/`bending` beam-fill lenses (docs/plan-efforts-
 * interieurs.md phase 9) — unlike the panel's `COHESION_DIAGRAM_COLOR.N` (one curve, sign read
 * off its own axis), a beam's fill has no axis, so the sign has to be the color. The standard
 * mechanics-textbook pairing (warm = pulling, cool = pushing), not `COHESION_DIAGRAM_COLOR`'s
 * violet family: this reads on sight without a legend, which a shade of violet would not.
 */
export const SIGNED_STRESS_COLOR = {
  tension: "#DC2626",
  compression: "#2563EB",
} as const;

/**
 * `SIGNED_STRESS_COLOR`'s two hues as a diverging ramp, for interpolating a beam-fill gradient
 * (`signed_stress_color`, `drawing-functions.ts`): compression at `t = -1`, a neutral "nothing
 * to show" tone at `t = 0` (an unstressed span reads as no color at all, not as a third hue
 * competing with the other two), tension at `t = 1`.
 */
export const SIGNED_STRESS_RAMP: readonly {
  t: number;
  rgb: readonly [number, number, number];
}[] = [
  { t: -1, rgb: [0x25, 0x63, 0xeb] },
  { t: 0, rgb: [0xe5, 0xe7, 0xeb] },
  { t: 1, rgb: [0xdc, 0x26, 0x26] },
] as const;

/**
 * The stress overlay's own scale (canvas, phase 6): a beam's fill, colored along its axis by
 * `|σ|max(s)/Re`. The classic FEM post-processor "rainbow" — blue (low) through cyan, green,
 * yellow, to red — read on sight by anyone who has used a stress plot before. The two ends
 * deliberately match `SIGNED_STRESS_COLOR`'s tension/compression hues, tying the beam-fill
 * lenses to the same palette family without being the same read.
 *
 * `t = 1` is NOT "at the elastic limit" — it is `StressScaleCache.max`, the highest ratio ever
 * RECORDED (`cohesion-field.ts`), so the full spectrum stays legible even when nothing in the
 * mechanism comes close to `Re`. A ratio that actually reaches 1 draws in
 * `STRESS_OVERSTRESS_COLOR` instead, off this scale entirely.
 */
export const STRESS_RAMP: readonly {
  t: number;
  rgb: readonly [number, number, number];
}[] = [
  { t: 0, rgb: [0x25, 0x63, 0xeb] },
  { t: 0.25, rgb: [0x0e, 0xa5, 0xe9] },
  { t: 0.5, rgb: [0x22, 0xc5, 0x5e] },
  { t: 0.75, rgb: [0xea, 0xb3, 0x08] },
  { t: 1, rgb: [0xdc, 0x26, 0x26] },
] as const;

/**
 * A ratio at or past 1 — the section has reached or exceeded `Re` somewhere along it. Deliberately
 * outside `STRESS_RAMP`'s own hue range (its own red is a relative "worst point recorded", not an
 * absolute "over the limit") so the two can never be confused for one another.
 */
export const STRESS_OVERSTRESS_COLOR = "#000000";

/**
 * Floor for the `normal`/`bending` beam-fill lenses' own scale (`StressScaleCache.maxNormal`/
 * `.maxBending`, `cohesion-field.ts`), as a fraction of that beam's own `Re`. Unlike
 * `utilization`/`shear`, `normal` and `bending` have no admissible-limit ratio of their own to
 * fall back on — their scale is purely "highest ever recorded", so a mechanism where nothing is
 * genuinely loaded (only self-weight, or a numerical residual near the solver's own noise
 * floor) would otherwise stretch that noise across the FULL ramp, same contrast as a real load.
 * Below this fraction of `Re`, the lens reads flat/neutral instead of manufacturing contrast
 * out of nothing to show.
 */
export const NEGLIGIBLE_STRESS_FRACTION = 0.01;

/**
 * The stress overlay's legend: screen-anchored bottom-left, drawn only while at least one beam
 * shows the overlay. A recalibrated ramp reads as arbitrary color without one — the whole
 * reason it exists (revised after seeing the overlay drawn without it).
 */
export const STRESS_LEGEND = {
  MARGIN: 16,
  BAR_WIDTH: 240,
  BAR_HEIGHT: 10,
  GAP: 6,
  FONT: "11px Arial",
} as const;

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
 * Zoom a preview falls back to when it has nothing finite to fit — an empty mechanism, or one
 * whose anchors all sit at the same point. World units are metres: this lands the grid in its
 * millimetre decade (see `grid.ts`), the finest scale a preview ever bothers to resolve.
 */
export const PREVIEW_MIN_ZOOM = 1000;

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

/**
 * The properties panel's floating scrollbar: the thumb is drawn over the content rather than in a
 * column of its own, so the width the children get never changes when the panel starts scrolling.
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
  // holds for one solve, not as a standing minimum distance. A world distance
  // (20 mm), not a screen one, despite living among this object's px constants.
  DISCONNECT_SEPARATION: 0.02,

  // Beam
  BEAM_WIDTH: 8,

  // Spring
  SPRING_INNER_WIDTH: 6,
  SPRING_COIL_RADIUS: 7,
  SPRING_MIN_COILS: 3,
  /** World length one coil stands for, which fixes how many a spring shows. A world distance (16 mm), not a screen one, despite living among this object's px constants. */
  SPRING_COIL_PITCH: 0.016,
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

  // Geometric constraint badges (align/normal/parallel/equal), anchored to
  // their host(s) — below it, so they stay clear of the probe badge above.
  GEOMETRIC_BADGE_OFFSET: 20,
  GEOMETRIC_BADGE_GAP: 4,
  PROBE_RADIUS: 6,

  // Trajectory
  TRAJECTORY_LINE_WIDTH: 1.5,
  TRAJECTORY_DOT_RADIUS: 2.5,
  TRAJECTORY_DOT_STEP: 1, // TODO : rendre éditable ?
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
 * The world axes' graduations: small ticks and numbers riding `draw_axes`'s
 * lines, at the same spacing a point snaps to.
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
   * The units a graduation can be shown in, coarsest first: km, m, mm, µm —
   * every third power of ten, so switching units is switching by exactly the
   * digits a thousand adds.
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
