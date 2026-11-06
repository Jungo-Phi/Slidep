/**
 * The canvas palette in use, and the fade that carries it from one theme to the next.
 *
 * What this module exports is live: `COLORS` and `ICON_COLORS` are reassigned as the theme changes, so drawing code reads them fresh rather than capturing them.
 */

import {
  CanvasPalette,
  DEFAULT_THEME,
  mix_canvas_palettes,
  THEME_TRANSITION_CLASS,
  THEME_TRANSITION_MS,
  THEMES,
  ThemeName,
} from "./mui-theme";

/** Alpha suffixes, appended to a hex color. Theme-independent. */
const TRANSPARENCY = {
  ICON_TRANSPARENCY: "C8", // 75% opacity
  HOVER_TRANSPARENCY: "CC", // 80% opacity
  HALF_TRANSPARENCY: "80", // 50% opacity
} as const;

/**
 * Colors the canvas is drawn in, for the *currently selected theme*. Names state the role, not the hue, so they hold whatever accent a theme picks.
 *
 * This binding is reassigned by `set_canvas_theme`.
 * Drawing code may read `COLORS.X` freely — the canvas redraws every animation frame, so a theme switch shows up on the next one — but must not capture it in a module-level constant, which would freeze it on the theme active at import time.
 *
 * Do not use `COLORS` inside a React `sx` prop: UI components go through the theme's semantic roles (`text.primary`, `primary.main`, `action.hover`, …).
 */
export let COLORS: CanvasPalette & typeof TRANSPARENCY = {
  ...THEMES[DEFAULT_THEME].canvas,
  ...TRANSPARENCY,
};

/**
 * The palette the icons are drawn in.
 * Always a theme's own palette, never an intermediate one: icons are SVG sources recolored into data URIs and cached per palette, so following the fade frame by frame would rebuild and re-decode every icon sixty times a second.
 * They snap to the new theme instead, while the rest of the drawing fades under them.
 */
export let ICON_COLORS: CanvasPalette = THEMES[DEFAULT_THEME].canvas;

/**
 * The palette `COLORS` currently stands for — a theme's own, or, mid-fade, one blended between two.
 * A fade interrupted by another theme change departs from here, and so never jumps.
 */
let current: CanvasPalette = THEMES[DEFAULT_THEME].canvas;

/** The fade in flight, if any — a second theme change cuts it short. */
let fade: number | null = null;

/**
 * The interface's CSS fade, played alongside the canvas one.
 *
 * It lives only for the duration of a theme switch: left on, the transition would also apply to hover and selection, and make them sluggish.
 */
const set_ui_fading = (fading: boolean): void => {
  document.documentElement.classList.toggle(THEME_TRANSITION_CLASS, fading);
};

/**
 * Repoint the canvas palette, fading into it over `duration` ms from the next frame on.
 * The canvas redraws every animation frame, so simply moving `COLORS` frame by frame is enough to make the drawing cross-fade with the rest of the interface.
 *
 * The fade runs linearly, like the interface's own CSS transitions: the ground under the drawing is painted in CSS, the grid on top of it in canvas, and two different curves would put one out of step with the other.
 *
 * Pass `duration = 0` to land on the new theme at once — on the first paint, where there is nothing to fade from.
 */
export function set_canvas_theme(
  name: ThemeName,
  duration: number = THEME_TRANSITION_MS,
): void {
  if (fade !== null) cancelAnimationFrame(fade);
  fade = null;

  ICON_COLORS = THEMES[name].canvas;
  const target = THEMES[name].canvas;

  if (duration <= 0) {
    set_ui_fading(false);
    current = target;
    COLORS = { ...target, ...TRANSPARENCY };
    return;
  }

  set_ui_fading(true);
  const from = current;
  // The clock starts on the first frame, not now: this runs while React renders the new theme, and the CSS transitions only start once that render has been committed and styled — on that same frame.
  // Started now, the canvas would lead the interface by however long the render takes, and its labels would fade ahead of the ground they sit on.
  let start: number | null = null;
  const step = (now: number) => {
    start ??= now;
    const t = Math.min(1, (now - start) / duration);
    current = t < 1 ? mix_canvas_palettes(from, target, t) : target;
    COLORS = { ...current, ...TRANSPARENCY };
    if (t < 1) {
      fade = requestAnimationFrame(step);
    } else {
      fade = null;
      set_ui_fading(false);
    }
  };
  fade = requestAnimationFrame(step);
}
