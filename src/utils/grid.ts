/**
 * The adaptive grid: a cartesian grid whose step follows the zoom continuously.
 *
 * Its lines never crowd nor thin out — they fade in, densify, then the reference slides a notch, without a visible jump.
 * Line `n` sits at world coordinate `n * step`, on both axes.
 *
 * Drawing and snapping both read these metrics, so they cannot disagree on where a line is.
 */

/** Exponent offset centring the finest level's screen spacing on ~10 px. Without it the range would run 1 → 10 px, illegible at its low end. */
const CALIBRATION = -0.5;

export interface GridMetrics {
  /** World distance between two consecutive line indices. */
  step: number;
  /** Their distance on screen: always between 3.16 and 31.6 px, whatever the zoom. */
  pitch: number;
  /** Progress through the current decade, in [0, 1): 0 just after a change of level, ~1 just before the next. */
  local: number;
}

/** Geometry of the grid at a given zoom. `scale` is the viewport's, in px per world unit. */
export function grid_metrics(scale: number): GridMetrics {
  const logScale = Math.log10(scale) + CALIBRATION;
  const decade = Math.floor(logScale);
  const step = 10 ** -decade;
  return { step, pitch: step * scale, local: logScale - decade };
}

/**
 * Index multiple the snap aims at, as the zoom progresses through a decade.
 *
 * Snapping every line would give a hold that breathes by a factor of ten within a decade — at its dense end a tolerance of a few px would cover half the plane, and one could barely put a point down off the grid. Following the 1-2-5-10-20 ladder instead keeps the snapped lines between ~50 and ~125 px apart at every zoom, so the hold feels the same throughout.
 */
function snap_multiple(local: number): number {
  if (local < 0.2) return 20;
  if (local < 0.6) return 10;
  if (local < 0.9) return 5;
  return 2;
}

/**
 * World distance between two lines a point snaps to.
 *
 * Always a multiple of the drawn grid's own step, so a snapped point lands on a line that is there to be seen — and, once the graduations are drawn, on one that carries a number.
 */
export function grid_snap_step(scale: number): number {
  const { step, local } = grid_metrics(scale);
  return step * snap_multiple(local);
}
