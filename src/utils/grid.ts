/**
 * The adaptive grid: a cartesian grid whose step follows the zoom continuously.
 *
 * Its lines never crowd nor thin out — they fade in, densify, then the reference slides a notch, without a visible jump.
 * Line `n` sits at world coordinate `n * step`, on both axes.
 *
 * Two different ladders read this same geometry: `grid_snap_step` (where a placed point lands) follows the grid's own drawn hierarchy — `draw_grid`'s opacity levels emphasise multiples of 1, 5 and 10 within a decade, so snapping to exactly those is snapping to a line that is actually there to be seen.
 * `graduation_step` (which lines get a number) instead follows the roundest, most legible progression — the two agree on the coarsest and finest rung but not on what falls between, and neither has to: a labelled number is information to read, a snapped point is a place to land, and they don't need the same ladder to serve their own purpose well.
 */

/**
 * Where in `[0, 1)` each rung of `ladder` takes over — derived from the ladder itself rather than tuned by hand, so the sequence of round numbers stays the only thing anyone has to choose.
 *
 * Rung `i`'s width is set to `log10(ladder[i] / ladder[i+1])`: exactly the drop screen space takes when the *next* rung's switch arrives.
 * That makes every rung's low point land back at the same reference level (its own switch always costs it precisely what it was given), so the whole pitch envelope ends up exactly as tight as its single widest gap — the best any threshold placement could do for this ladder, with no search required (see `docs/grille-adaptative.md` §5 for the derivation).
 *
 * The one seam this can't cover: the finest rung's switch, at the decade's end, carries no gap of its own — it hands off to the next decade's coarsest rung at the same value, not a smaller one (`grid_metrics`'s own continuity, below).
 * That first gap, between the coarsest rung and the one after it, is therefore split evenly between the coarsest and finest rungs instead of charged to the coarsest alone.
 */
function rung_thresholds(ladder: readonly number[]): readonly number[] {
  const gaps = ladder.slice(0, -1).map((v, i) => Math.log10(v / ladder[i + 1]));
  const halfSeam = gaps[0] / 2;
  const widths = gaps.map((gap, i) => (i === 0 ? halfSeam : gap));
  widths.push(halfSeam);
  const at: number[] = [];
  let acc = 0;
  for (const width of widths) {
    at.push(acc);
    acc += width;
  }
  return at;
}

/** A ladder of round multiples plus the thresholds derived from it — everything needed to
 * turn a decade's `local` progress into "which rung are we on". */
interface Ladder {
  values: readonly number[];
  thresholds: readonly number[];
}

function make_ladder(values: readonly number[]): Ladder {
  return { values, thresholds: rung_thresholds(values) };
}

/** The rung `local` falls on, coarsest first. */
function rung_at(ladder: Ladder, local: number): number {
  let multiple = ladder.values[0];
  for (let i = 1; i < ladder.values.length; i++) {
    if (local >= ladder.thresholds[i]) multiple = ladder.values[i];
  }
  return multiple;
}

/** The pitch (screen px) a rung's value would have at the very start of its stretch, with
 * `CALIBRATION` still at 0 — a rung's low point, since pitch only grows across a stretch. */
function unscaled_floor(ladder: Ladder): number {
  let floor = Infinity;
  for (let i = 0; i < ladder.values.length; i++) {
    const pitchAtStart = 10 ** ladder.thresholds[i] * ladder.values[i];
    if (pitchAtStart < floor) floor = pitchAtStart;
  }
  return floor;
}

/** Its high point, the mirror of `unscaled_floor`. */
function unscaled_ceiling(ladder: Ladder): number {
  let ceiling = -Infinity;
  for (let i = 0; i < ladder.values.length; i++) {
    const end = i + 1 < ladder.thresholds.length ? ladder.thresholds[i + 1] : 1;
    const pitchAtEnd = 10 ** end * ladder.values[i];
    if (pitchAtEnd > ceiling) ceiling = pitchAtEnd;
  }
  return ceiling;
}

/** The ladder a placed point's coordinate is a multiple of within one decade — the grid's own
 * drawn hierarchy (`draw_grid`'s opacity levels single out multiples of 1, 5 and 10; there is no separately-emphasised "2"), so a snapped point always lands on a line that is actually visible, not merely present. */
const SNAP_LADDER = make_ladder([10, 5, 1]);

/** The ladder a labelled line's index is a multiple of within one decade — the roundest,
 * most legible progression, independent of which of those lines a point can snap to. */
const GRADUATION_LADDER = make_ladder([10, 5, 2, 1]);

/** How close, in screen px, two labelled lines are ever allowed to come — the product
 * decision `CALIBRATION` exists to satisfy.
 * Below this a hold of a few px would cover a meaningful fraction of the visible plane, and one could barely put a point down off a line. */
export const LABEL_PITCH_FLOOR_PX = 40;

/** Its mirror at the other end, a direct consequence of `LABEL_PITCH_FLOOR_PX` and
 * `GRADUATION_LADDER`'s own widest gap rather than a second choice to make — see `rung_thresholds`'s doc for why that gap is unavoidable.
 * Exported so a test can check the envelope without re-deriving or hard-coding either end of it. */
export const LABEL_PITCH_CEILING_PX =
  LABEL_PITCH_FLOOR_PX *
  (unscaled_ceiling(GRADUATION_LADDER) / unscaled_floor(GRADUATION_LADDER));

/**
 * Exponent offset that lands `GRADUATION_LADDER`'s own floor exactly on `LABEL_PITCH_FLOOR_PX` — derived from the ladder rather than tuned by hand, so a future change to it keeps the same floor instead of silently drifting off it.
 *
 * This is the one dial for the whole adaptive grid: raising `LABEL_PITCH_FLOOR_PX` pushes every labelled line further apart, and — since the unlabelled, finest lines and `SNAP_LADDER` ride the same `local`/`decade` as the graduations (drawing and snapping cannot disagree on where a line is) — pushes them apart too, proportionally.
 * The finest lines are no longer independently centred on a fixed ~10 px the way a hand-picked constant once did; their range now scales with `LABEL_PITCH_FLOOR_PX` instead.
 */
const CALIBRATION = Math.log10(
  unscaled_floor(GRADUATION_LADDER) / LABEL_PITCH_FLOOR_PX,
);

export interface GridMetrics {
  /** World distance between two consecutive line indices. */
  step: number;
  /** Their distance on screen — see `CALIBRATION`'s doc for today's range. */
  pitch: number;
  /** Progress through the current decade, in [0, 1): 0 just after a change of level, ~1 just before the next. */
  local: number;
  /** Exponent such that `step = 10 ** -decade`: how many decades in from the calibration point. */
  decade: number;
}

/** Geometry of the grid at a given zoom. `scale` is the viewport's, in px per world unit. */
export function grid_metrics(scale: number): GridMetrics {
  const logScale = Math.log10(scale) + CALIBRATION;
  const decade = Math.floor(logScale);
  const step = 10 ** -decade;
  return { step, pitch: step * scale, local: logScale - decade, decade };
}

export const MIN_GRID_SCALE = 10 ** -2; // 5 km step
export const MAX_GRID_SCALE = 10 ** 8; // 0.5 µm step

/**
 * World distance between two lines a point snaps to.
 *
 * Always a multiple of the drawn grid's own step, and of `SNAP_LADDER`'s own rung — so a snapped point lands exactly on a line the grid draws with emphasis, not an arbitrary one.
 */
export function grid_snap_step(scale: number): number {
  const { step, local } = grid_metrics(scale);
  return step * rung_at(SNAP_LADDER, local);
}

/**
 * World distance between two labelled axis graduations — see `draw_graduations` in `drawing-functions.ts`.
 */
export function graduation_step(scale: number): number {
  const { step, local } = grid_metrics(scale);
  return step * rung_at(GRADUATION_LADDER, local);
}

/** The graduation ladder's rung `local` falls on — see `draw_graduations`, which reads this
 * both to detect the decade-start repeat (comparing against `graduation_multiple(0)`) and to size the decimals a label needs. */
export function graduation_multiple(local: number): number {
  return rung_at(GRADUATION_LADDER, local);
}
