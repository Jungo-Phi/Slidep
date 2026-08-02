/**
 * The ruler loads are drawn on: how a magnitude becomes a length in screen px,
 * and back. Pure arithmetic — nothing here knows where a load sits.
 *
 * The ruler is logarithmic so that loads of very different magnitudes stay
 * legible side by side. Lengths are screen px, so a load keeps its size on
 * screen whatever the zoom; callers holding a world length convert it first
 * (see `world2screen_length`).
 */

import { LOAD_SCALING } from "../constants/rendering-specs";

// ─── Display scale ──────────────────────────────────────────────────────────

/** Compress a load magnitude (N, Nm or N/m) to a drawn length (screen px) with LOG scaling. */
export function stored2screen_load(value: number): number {
  const unsigned = Math.max(
    LOAD_SCALING.MIN_PX,
    LOAD_SCALING.MIN_PX +
      (LOAD_SCALING.PX_SCALE *
        Math.log(Math.abs(value) / LOAD_SCALING.REF_VALUE + 1)) /
        Math.log(LOAD_SCALING.LOG_BASE),
  );
  return value < 0 ? -unsigned : unsigned;
}

/** Expand a drawn load length (screen px) to its real magnitude (N, Nm or N/m) with an INVERSE LOG scaling. */
export function screen2stored_load(value: number): number {
  const unsigned = Math.max(
    LOAD_SCALING.MIN_VALUE,
    LOAD_SCALING.REF_VALUE *
      (Math.pow(
        LOAD_SCALING.LOG_BASE,
        (Math.abs(value) - LOAD_SCALING.MIN_PX) / LOAD_SCALING.PX_SCALE,
      ) -
        1),
  );
  return value < 0 ? -unsigned : unsigned;
}

/**
 * Drawn radius (screen px) of a moment's arc. Unsigned: the sign of a moment is
 * its rotation direction, which `draw_moment` reads separately — a negative
 * radius would just throw out of `ctx.arc`.
 */
export function stored2screen_moment(value: number): number {
  return (
    stored2screen_load(Math.abs(value)) / LOAD_SCALING.MOMENT_RADIUS_FACTOR
  );
}

/** Inverse of `stored2screen_moment`: the unsigned value an arc radius maps to. */
export function screen2stored_moment(radius: number): number {
  return screen2stored_load(
    Math.abs(radius) * LOAD_SCALING.MOMENT_RADIUS_FACTOR,
  );
}

/**
 * The round value nearest to `value`, on the ladder a drag snaps to: the
 * mantissas of `LOAD_SCALING.SNAP_MANTISSAS` in every decade. Nearest is
 * measured in log space, the space the display scale itself works in.
 */
export function nearest_round_load_value(value: number): number {
  const magnitude = Math.max(LOAD_SCALING.MIN_VALUE, Math.abs(value));
  const decade = Math.floor(Math.log10(magnitude));
  let best = magnitude;
  let bestDistance = Infinity;
  // The neighbouring decades matter: just under 1000, the nearest rung up is
  // the next decade's 1, not this one's 5.
  for (const exponent of [decade - 1, decade, decade + 1]) {
    for (const mantissa of LOAD_SCALING.SNAP_MANTISSAS) {
      const candidate = mantissa * Math.pow(10, exponent);
      const distance = Math.abs(Math.log(candidate / magnitude));
      if (distance < bestDistance) {
        bestDistance = distance;
        best = candidate;
      }
    }
  }
  return value < 0 ? -best : best;
}

// ─── Distributed load display ───────────────────────────────────────────────
// The log ruler exists to keep loads of very different magnitudes legible side
// by side — a comparison *between* loads. Inside one load the reading is a
// different thing entirely: an engineer reads the intensity at any point off
// the straight line joining the two tip arrows, which only means anything if
// the drawing is proportional to the values across the span. So the compression
// is applied once, to the load's dominant magnitude, and the whole profile is
// drawn linearly from there: the biggest arrow keeps the length the ruler gives
// it, the arrow at mid-span is exactly the average of the two, and a triangular
// load draws as a true triangle instead of bottoming out on `MIN_PX`.

/**
 * Below this, a magnitude counts as zero. It is the threshold the canvas
 * already applies without saying so: `draw_dimension_text` keeps one decimal,
 * so anything under it is written "0" anyway.
 */
export const LOAD_ZERO_EPSILON = 0.05;

/** Whether a magnitude reads as zero — an end of a load carrying nothing. */
export function is_zero_load(magnitude: number): boolean {
  return Math.abs(magnitude) < LOAD_ZERO_EPSILON;
}

/** Drawn length per unit of magnitude for a whole distributed load (px per N/m). */
export function distributed_display_gain(
  magnitudeStart: number,
  magnitudeEnd: number,
): number {
  const peak = Math.max(Math.abs(magnitudeStart), Math.abs(magnitudeEnd));
  if (peak < 1e-9) return 0;
  return stored2screen_load(peak) / peak;
}

/**
 * Signed drawn length of one endpoint arrow, `other` holding the magnitude at
 * the opposite end — it shares the gain, so it takes part in the result.
 */
export function distributed_tip_length(
  magnitude: number,
  other: number,
): number {
  return magnitude * distributed_display_gain(magnitude, other);
}

/**
 * Inverse of `distributed_tip_length`: the magnitude a tip dragged to the
 * signed drawn length `length` takes, the opposite end holding `other`.
 *
 * The gain follows the dominant magnitude, so the drag has two regimes. While
 * the dragged tip is the dominant one, its length reads straight off the log
 * ruler — and the opposite arrow rescales as the gain moves under it. Once it
 * falls below the other end, the gain is pinned by that other end and the tip
 * moves linearly, which is what lets it reach exactly zero and turn the load
 * triangular. The two regimes agree where they meet.
 */
export function distributed_tip_magnitude(
  length: number,
  other: number,
): number {
  const dominant = screen2stored_load(length);
  const gain = distributed_display_gain(other, other);
  if (gain === 0 || Math.abs(dominant) >= Math.abs(other)) return dominant;
  return length / gain;
}

/**
 * Signed drawn length of the profile at the point of the beam where the body
 * bar was grabbed, when the magnitude there is `magnitude`. `offsetStart` and
 * `offsetEnd` are that point's differences to the two endpoint magnitudes —
 * constants for the whole drag, since a body drag translates both ends by the
 * same amount.
 */
export function distributed_grab_length(
  magnitude: number,
  offsetStart: number,
  offsetEnd: number,
): number {
  return (
    magnitude *
    distributed_display_gain(magnitude + offsetStart, magnitude + offsetEnd)
  );
}

/**
 * Inverse of `distributed_grab_length`, by bisection: there is no closed form,
 * because the gain moves with the load's peak and so sits on both sides of the
 * equation. The length is continuous and increasing in the magnitude (zero at
 * zero, growing like the log ruler at either end), which is all a bisection
 * needs; the bracket is widened by doubling first since the drawn length grows
 * only logarithmically.
 */
export function distributed_grab_magnitude(
  length: number,
  offsetStart: number,
  offsetEnd: number,
): number {
  const at = (m: number) => distributed_grab_length(m, offsetStart, offsetEnd);
  let lo = -1;
  let hi = 1;
  for (let i = 0; i < 60 && at(hi) < length; i++) hi *= 2;
  for (let i = 0; i < 60 && at(lo) > length; i++) lo *= 2;
  for (
    let i = 0;
    i < 100 && hi - lo > 1e-6 * Math.max(1, Math.abs(lo), Math.abs(hi));
    i++
  ) {
    const mid = (lo + hi) / 2;
    if (at(mid) < length) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
