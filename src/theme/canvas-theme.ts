/**
 * The canvas palette in use, and the fade that carries it from one theme to the next.
 *
 * What this module exports is live: `COLORS` and `ICON_COLORS` are reassigned as the theme changes, so drawing code reads them fresh rather than capturing them.
 */

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
