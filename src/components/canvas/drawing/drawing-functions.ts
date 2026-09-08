/**
 * Canvas drawing primitives: one function per mechanical element, badge, or overlay drawn on the canvas.
 */

import { COLORS, ICON_COLORS } from "../../../theme/canvas-theme";
import { HIT_TOLERANCE, INTERACTION_SPECS, MODE_ANIMATION } from "../../../constants/interaction-specs";
import { PhysicsOverlayKind, PHYSICS_OVERLAY_COLOR, SIGNED_STRESS_RAMP, STRESS_RAMP, STRESS_INDETERMINATE_COLOR, STRESS_OVERSTRESS_COLOR, STRESS_LEGEND } from "../../../constants/physics-display-specs";
import { STROKE_WIDTHS, DIM, FLOOR, GRADUATION, GRID_ALPHA, GUIDE_DASH, ICON_TINT, TEXT_SPECS, REDUNDANCY_SYMBOL } from "../../../constants/rendering-specs";
import { FloorConfig } from "../../../types/mechanism";
import {
  floor_acute_angle,
  floor_anchor_and_normal,
} from "../../../utils/floor-geometry";
import { RedundancySymbol } from "../../solver/analysis/redundancy-symbols";
import { Point2 } from "../../../types/point2";
import { get_element_icon } from "../../element-palette/elementIcon";
import {
  ScreenPoint,
  UnionElement,
  ViewportState,
  WorldPoint,
} from "../../../types";
import {
  grid_metrics,
  graduation_step,
  graduation_multiple,
  value2ratio,
  world2screen,
  world2screen_angle,
  world2screen_vec,
} from "../../../utils";
import {
  force_label_position_screen,
  moment_value_label_position,
} from "../../../utils/load-geom";
import {
  stored2screen_load,
  stored2screen_moment,
} from "../../../utils/load-scale";
import {
  BeltVia,
  BeltPiece,
  belt_pieces,
  belt_project,
} from "../../../utils/belt-path";
import type { SnapFeedback } from "../../../utils/snap-corridor";
import {
  FORCE,
  LENGTH,
  MASS,
  MOMENT,
  STRESS,
  QuantityKind,
  format_mantissa,
  format_quantity,
  rad_to_deg,
} from "../../../utils/quantity-format";

const TAU = 2 * Math.PI;

/** Preloaded icon images, keyed by URL. */
const iconImageCache = new Map<string, HTMLImageElement>();

/** Flat silhouettes of the icons, one per (source, colour). */
const tintedIconCache = new Map<string, HTMLCanvasElement>();

/**
 * The icon painted over in a single colour, for the states an icon has to read in — selected, about to be deleted.
 *
 * A silhouette rather than a filter over the original: an icon's own hues come from the theme, and any relative operation (brightness, hue-rotate) lands somewhere different in each one — on a pure black or pure grey ink, nowhere at all.
 * Cached, since it costs a rasterization.
 */
function tinted_icon(
  img: HTMLImageElement,
  url: string,
  color: string,
  side: number,
): HTMLCanvasElement {
  const key = `${url}|${color}|${side}`;
  const cached = tintedIconCache.get(key);
  if (cached) return cached;

  const tinted = document.createElement("canvas");
  tinted.width = side * ICON_TINT.SUPERSAMPLE;
  tinted.height = side * ICON_TINT.SUPERSAMPLE;
  const tintedCtx = tinted.getContext("2d")!;
  tintedCtx.drawImage(img, 0, 0, tinted.width, tinted.height);
  // Keeps the glyph's shape and drops all of its colours.
  tintedCtx.globalCompositeOperation = "source-in";
  tintedCtx.fillStyle = color;
  tintedCtx.fillRect(0, 0, tinted.width, tinted.height);
  tintedIconCache.set(key, tinted);
  return tinted;
}

export function draw_grid(
  ctx: CanvasRenderingContext2D,
  viewport: ViewportState,
  width: number,
  height: number,
) {
  const { pitch, local } = grid_metrics(viewport.scale);
  const panX = viewport.pan.x;
  const panY = viewport.pan.y;

  // Line n runs down the screen at x = n·pitch + panX, and across it at y = panY − n·pitch, the world y axis pointing the other way.
  const xFrom = Math.ceil(-panX / pitch);
  const xTo = (width - panX) / pitch;
  const yFrom = Math.ceil((panY - height) / pitch);
  const yTo = panY / pitch;

  ctx.strokeStyle = COLORS.GRID;
  ctx.lineWidth = 1;

  const between = (from: number, to: number) => from + (to - from) * local;

  /**
   * All the lines of one level, in a single path: the indices multiple of `multiple` but not of `next`, which owns those.
   *
   * One path rather than one per line: at the dense end of a decade a level runs to a few hundred lines, and a stroke each would show.
   */
  const stroke_level = (multiple: number, next: number, alpha: number) => {
    if (alpha < GRID_ALPHA.INVISIBLE) return;
    ctx.globalAlpha = alpha / GRID_ALPHA.FULL;
    ctx.beginPath();
    const xStart = Math.ceil(xFrom / multiple) * multiple;
    const yStart = Math.ceil(yFrom / multiple) * multiple;
    for (let n = xStart; n <= xTo; n += multiple) {
      if (next > 0 && n % next === 0) continue;
      const x = n * pitch + panX;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    for (let n = yStart; n <= yTo; n += multiple) {
      if (next > 0 && n % next === 0) continue;
      const y = panY - n * pitch;
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();
  };

  const { POWERS, FIVES } = GRID_ALPHA;
  stroke_level(1, 5, between(POWERS[0], POWERS[1]));
  stroke_level(5, 10, between(FIVES[0], FIVES[1]));
  stroke_level(10, 50, between(POWERS[1], POWERS[2]));
  stroke_level(50, 100, between(FIVES[1], FIVES[2]));
  stroke_level(100, 0, between(POWERS[2], POWERS[3]));

  ctx.globalAlpha = 1;
}

/**
 * The world axes, always on screen.
 *
 * An axis whose origin has scrolled out of the view is pinned to the edge it left by rather than disappearing: it keeps saying which side the origin lies on, which is what makes it a landmark at any pan.
 */
export function draw_axes(
  ctx: CanvasRenderingContext2D,
  viewport: ViewportState,
  width: number,
  height: number,
) {
  // The origin's own screen position: `world2screen` of (0, 0) is the pan.
  const pin = (origin: number, extent: number) =>
    Math.min(Math.max(origin, 1), extent - 1);
  const x = pin(viewport.pan.x, width);
  const y = pin(viewport.pan.y, height);

  ctx.strokeStyle = COLORS.GRID_AXIS;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, height);
  ctx.moveTo(0, y);
  ctx.lineTo(width, y);
  ctx.stroke();
}

/**
 * The floor's screen-space geometry, shared by `draw_floor` and hit-testing (`get-hover.ts`) so both agree on exactly where the line and its handles are.
 * `anchor`/`normal` mirror `floor_anchor_and_normal`'s world-space ones; `direction` is along the line (screen space), for walking along it — the angle handle at `FLOOR.ANGLE_HANDLE_PX` in particular.
 * `angleLabel` is where the angle's value is drawn (meaningless at exactly flat, where neither `draw_floor` nor hit-testing use it).
 */
export function floor_screen_geometry(
  viewport: ViewportState,
  floor: FloorConfig,
): {
  anchor: ScreenPoint;
  normal: ScreenPoint;
  direction: ScreenPoint;
  angleHandle: ScreenPoint;
  angleLabel: ScreenPoint;
} {
  const { anchor: worldAnchor, normal: worldNormal } =
    floor_anchor_and_normal(floor);
  const anchor = world2screen(worldAnchor, viewport);
  const normal = world2screen_vec(worldNormal, viewport).normalize();
  // The line's own direction is the normal's perpendicular — screen space, where the world's CCW rotation reads CW (see `world2screen_angle`), so this is `normal` turned -90° on screen rather than +90°.
  const direction = new Point2(normal.y, -normal.x).as_space<"screen">();
  // `direction` points at `floor.angle + π`, not `floor.angle`: a world vector at `floor.angle` mirrors and rotates into `(-cos, -sin)` of it, and `atan2` of that is the angle plus a half turn.
  // The handle must read back as `floor.angle` itself when grabbed (else the first drag frame flips the floor to its mirror image), so it sits against `direction` rather than along it.
  // Halfway between horizontal and the line, screen angles — where `draw_dimension_angle` draws its label, so it has to sit on the arc rather than floating off it.
  const screenAngle = world2screen_angle(floor_acute_angle(floor.angle));
  const angleLabel = anchor.add(
    new Point2(FLOOR.ANGLE_ARC_PX, 0)
      .as_space<"screen">()
      .rotate(screenAngle / 2),
  );
  return {
    anchor,
    normal,
    direction,
    angleHandle: anchor.sub(direction.mul(FLOOR.ANGLE_HANDLE_PX)),
    angleLabel,
  };
}

/**
 * Clips the infinite line through `anchor` (screen space) along `direction` to the canvas rectangle — the same "extend to the edges" idea as `draw_axes`, generalized to a line that need not be horizontal or vertical.
 * `null` when the line misses the canvas entirely (never for an unrotated view, but a very steep angle at a corner can).
 */
function clip_line_to_rect(
  anchor: ScreenPoint,
  direction: ScreenPoint,
  width: number,
  height: number,
): [ScreenPoint, ScreenPoint] | null {
  let tMin = -Infinity;
  let tMax = Infinity;
  const clip = (p0: number, d: number, hi: number) => {
    if (Math.abs(d) < 1e-9) {
      if (p0 < 0 || p0 > hi) tMin = Infinity; // parallel to this axis, outside its band
      return;
    }
    const t1 = -p0 / d;
    const t2 = (hi - p0) / d;
    tMin = Math.max(tMin, Math.min(t1, t2));
    tMax = Math.min(tMax, Math.max(t1, t2));
  };
  clip(anchor.x, direction.x, width);
  clip(anchor.y, direction.y, height);
  if (tMin > tMax) return null;
  return [anchor.add(direction.mul(tMin)), anchor.add(direction.mul(tMax))];
}

/** Regular 45° ticks below the line (the `direction`/`normal` side away from free space), the same "ground" language `draw_ground`'s hatching uses for the palette's fixed anchor — walked from `from` to `to` (assumed `to = from + direction * length`, as `clip_line_to_rect` returns them), phase-locked to `anchor` (screen position of the floor's world x=0) so the pattern stays put under pan instead of resetting at the canvas edge. */
function draw_floor_hatching(
  ctx: CanvasRenderingContext2D,
  from: ScreenPoint,
  to: ScreenPoint,
  anchor: ScreenPoint,
  direction: ScreenPoint,
  normal: ScreenPoint,
) {
  const length = from.distance_to(to);
  // Trailing along the line AND into the ground, in equal parts: 45° down-and-back.
  const tickDir = direction.add(normal).mul(-Math.SQRT1_2);
  const offset = from.sub(anchor).dot(direction);
  const start =
    offset -
    Math.floor(offset / FLOOR.HATCH_SPACING_PX) * FLOOR.HATCH_SPACING_PX;
  ctx.beginPath();
  for (let t = -start; t <= length; t += FLOOR.HATCH_SPACING_PX) {
    const base = from.add(direction.mul(t));
    const tip = base.add(tickDir.mul(FLOOR.HATCH_LENGTH_PX));
    ctx.moveTo(base.x, base.y);
    ctx.lineTo(tip.x, tip.y);
  }
  ctx.stroke();
}

/**
 * The floor: a solid infinite line hatched like the palette's fixed-anchor symbol (see `draw_ground`), with a tick at its height anchor and — only away from flat, so a level floor stays uncluttered — its angle drawn the same way a `dimension-angle` constraint reads an angle: an arc against the horizontal, with its value.
 * Drawn clipped to the canvas; nothing when disabled.
 */
export function draw_floor(
  ctx: CanvasRenderingContext2D,
  viewport: ViewportState,
  width: number,
  height: number,
  floor: FloorConfig,
  isHovered: boolean = false,
  /** The drag handle specifically — the small ring drawn at `angleHandle`. Separate from `isValueHovered`: dragging the handle and clicking the value are two different gestures on two different targets, so only the one actually under the cursor lights up. */
  isAngleHovered: boolean = false,
  /** The angle's displayed value (`FloorAngleValue`) — thickens the arc/text itself, never the handle ring. */
  isValueHovered: boolean = false,
) {
  if (!floor.enabled) return;
  const { anchor, normal, direction, angleHandle, angleLabel } =
    floor_screen_geometry(viewport, floor);
  const clipped = clip_line_to_rect(anchor, direction, width, height);
  if (!clipped) return;

  ctx.strokeStyle = COLORS.ELEMENT_STROKE;
  ctx.fillStyle = COLORS.ELEMENT_STROKE;
  ctx.lineWidth =
    STROKE_WIDTHS.STANDARD + (isHovered ? STROKE_WIDTHS.HOVER_GAIN : 0);

  ctx.beginPath();
  ctx.moveTo(clipped[0].x, clipped[0].y);
  ctx.lineTo(clipped[1].x, clipped[1].y);
  ctx.stroke();

  draw_floor_hatching(ctx, clipped[0], clipped[1], anchor, direction, normal);

  if (isHovered && !isAngleHovered) {
    ctx.beginPath();
    ctx.moveTo(anchor.x, anchor.y - FLOOR.ANCHOR_TICK_PX);
    ctx.lineTo(anchor.x, anchor.y + FLOOR.ANCHOR_TICK_PX);
    ctx.stroke();
  }

  if (isAngleHovered) {
    ctx.lineWidth = STROKE_WIDTHS.HOVERED;
    ctx.beginPath();
    ctx.arc(angleHandle.x, angleHandle.y, DIM.EDGE_ENDPOINT_RADIUS, 0, TAU);
    ctx.stroke();
  }

  // The angle itself, read against the horizontal as the line's acute angle — a floor is a line, not a ray, so leaning it past 90° reads as the same line leaning the *other* way, never as an ever-growing angle.
  // Hidden at exactly flat, where there is nothing to measure.
  const acuteAngle = floor_acute_angle(floor.angle);
  const horizontalEnd = anchor.add(new Point2(FLOOR.ANGLE_ARC_PX, 0));
  const screenAngle = world2screen_angle(acuteAngle);
  const floorEnd = anchor.add(
    new Point2(FLOOR.ANGLE_ARC_PX, 0).as_space<"screen">().rotate(screenAngle),
  );
  if (Math.abs(acuteAngle) > 1e-6) {
    ctx.lineWidth = isValueHovered
      ? STROKE_WIDTHS.HOVERED
      : STROKE_WIDTHS.STANDARD;
    draw_dimension_angle(
      ctx,
      anchor,
      horizontalEnd,
      anchor,
      floorEnd,
      false,
      false,
      angleLabel,
      rad_to_deg(Math.abs(acuteAngle)),
    );
  } else if (isHovered) {
    ctx.lineWidth = isAngleHovered
      ? STROKE_WIDTHS.HOVERED
      : STROKE_WIDTHS.STANDARD;
    ctx.fillStyle = ctx.strokeStyle;
    const anglo = TAU / 20;
    const radius = FLOOR.ANGLE_ARC_PX;
    const start = anchor.add(Point2.from_polar(radius, -anglo + 3 / radius));
    const end = anchor.add(Point2.from_polar(radius, anglo - 3 / radius));
    draw_arrow_head(ctx, start, TAU / 4 - anglo);
    draw_arrow_head(ctx, end, anglo - TAU / 4);
    ctx.beginPath();
    ctx.arc(
      anchor.x,
      anchor.y,
      Math.sqrt(radius ** 2 + 20 ** 2),
      -anglo + DIM.ARROW_HEAD_LENGTH / radius,
      anglo - DIM.ARROW_HEAD_LENGTH / radius,
    );
    ctx.stroke();
  }
}

/**
 * The coarsest unit whose numbers, at this decade, still need at most one decimal — see `docs/grille-adaptative.md` §5 for the precision formula this pairs with.
 *
 * Picked once per frame from `decade` alone, the same value for every labelled line: were it picked per label instead, a step straddling a unit's threshold would print some ticks in mm and others in m, and a run of "0.8 m, 1.0 m, 1.2 m" would read as unrelated numbers rather than one ruler.
 */
function graduation_unit(decade: number): (typeof GRADUATION.UNITS)[number] {
  for (const unit of GRADUATION.UNITS) {
    if (unit.scale >= decade - 1) return unit;
  }
  return GRADUATION.UNITS[GRADUATION.UNITS.length - 1];
}

/**
 * How many decimal digits of headroom a rung's own value is worth, signed: positive for a value with trailing zeros (`10` → 1, it can absorb one decade before needing a decimal), negative for one that already carries decimals of its own (`2.5` → -1, it needs one before `precision` even starts counting decades).
 * Read from `multiple`'s canonical string form rather than hand-listed per rung, so a ladder entry stays the only thing anyone tunes.
 */
function decimal_shift(multiple: number): number {
  const [intPart, fracPart = ""] = Math.abs(multiple).toString().split(".");
  const trailingZeros = intPart === "0" ? 0 : intPart.match(/0*$/)![0].length;
  return trailingZeros - fracPart.length;
}

function format_graduation(
  worldValue: number,
  unit: { scale: number; suffix: string },
  precision: number,
): string {
  const displayed = worldValue * 10 ** unit.scale;
  // toFixed on a value that rounds to zero can still print "-0.0": the sign survives rounding even though the magnitude doesn't.
  const text = displayed.toFixed(precision).replace(/^-(0(\.0+)?)$/, "$1");
  return `${text} ${unit.suffix}`;
}

/** A label stroked in the background colour before it is filled, so it stays readable over a grid line crossing behind it rather than just over open ground. */
function draw_graduation_label(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
) {
  ctx.save();
  ctx.lineWidth = GRADUATION.HALO_WIDTH;
  ctx.strokeStyle = COLORS.BACKGROUND;
  ctx.lineJoin = "round";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = COLORS.BADGE_STROKE;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/**
 * Numbers along the world axes, on the grid's roundest ladder (`graduation_step` — see `grid.ts`'s module doc for why it can differ from where a point actually snaps).
 *
 * Ridden on `draw_axes`'s own lines: pinned to whichever edge the axis left by, exactly like the line itself.
 * Each label sits on the line's interior side, flipped to the other side before the axis's own 1px pin would carry it off-screen — room is reserved for a tick, a gap, and (on the vertical axis, where digit count varies with the unit) the widest label this frame has to show.
 */
export function draw_graduations(
  ctx: CanvasRenderingContext2D,
  viewport: ViewportState,
  width: number,
  height: number,
) {
  const pin = (origin: number, extent: number) =>
    Math.min(Math.max(origin, 1), extent - 1);
  const axisX = pin(viewport.pan.x, width);
  const axisY = pin(viewport.pan.y, height);

  const { decade, local } = grid_metrics(viewport.scale);
  const worldStep = graduation_step(viewport.scale);
  const multiple = graduation_multiple(local);
  // A decade's very first labelled line always repeats the previous decade's last one (see grid.ts's own `GRADUATION_LADDER` doc) — reading the unit from the previous decade through that repeat keeps the flip on the next line that's actually new, rather than relabelling one that hasn't moved.
  const unit = graduation_unit(
    multiple === graduation_multiple(0) ? decade - 1 : decade,
  );
  const precision = Math.max(0, decade - unit.scale - decimal_shift(multiple));

  const xWorldFrom = -viewport.pan.x / viewport.scale;
  const xWorldTo = (width - viewport.pan.x) / viewport.scale;
  const yWorldFrom = (viewport.pan.y - height) / viewport.scale;
  const yWorldTo = viewport.pan.y / viewport.scale;

  ctx.save();
  ctx.font = GRADUATION.FONT;

  // The vertical axis's labels, computed up front: each one's own width decides whether it has room on the line's right, since they aren't all the same length.
  const yTicks: { y: number; text: string; textWidth: number }[] = [];
  const yFrom = Math.ceil(yWorldFrom / worldStep);
  const yTo = Math.floor(yWorldTo / worldStep);
  for (let n = yFrom; n <= yTo; n++) {
    if (n === 0) continue;
    const worldValue = n * worldStep;
    const text = format_graduation(worldValue, unit, precision);
    yTicks.push({
      y: world2screen(new Point2(0, worldValue), viewport).y,
      text,
      textWidth: ctx.measureText(text).width,
    });
  }

  // Labels default to below/right, the natural reading side — flipped to the line's other side once that side would run out of room for a tick, a gap, and the label itself.
  const xLabelBelow =
    viewport.pan.y <=
    height -
      (2 * GRADUATION.TICK_LENGTH +
        GRADUATION.LABEL_GAP +
        GRADUATION.LABEL_HEIGHT);

  ctx.textAlign = "center";
  ctx.textBaseline = xLabelBelow ? "top" : "bottom";
  const xFrom = Math.ceil(xWorldFrom / worldStep);
  const xTo = Math.floor(xWorldTo / worldStep);
  for (let n = xFrom; n <= xTo; n++) {
    if (n === 0) continue;
    const worldValue = n * worldStep;
    const x = world2screen(new Point2(worldValue, 0), viewport).x;
    ctx.strokeStyle = COLORS.BADGE_STROKE;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, axisY - GRADUATION.TICK_LENGTH);
    ctx.lineTo(x, axisY + GRADUATION.TICK_LENGTH);
    ctx.stroke();
    const labelY = xLabelBelow
      ? axisY + GRADUATION.TICK_LENGTH + GRADUATION.LABEL_GAP
      : height - 1 - GRADUATION.TICK_LENGTH - GRADUATION.LABEL_GAP;
    draw_graduation_label(
      ctx,
      format_graduation(worldValue, unit, precision),
      x,
      labelY,
    );
  }

  ctx.textBaseline = "middle";
  for (const { y, text, textWidth } of yTicks) {
    // Room on the right is the same for every tick — only shared axis, common to the line — but whether a given label fits it depends on that label's own width.
    const labelRight =
      viewport.pan.x <=
      width -
        (2 * GRADUATION.TICK_LENGTH + GRADUATION.LABEL_GAP + textWidth + 4);
    ctx.strokeStyle = COLORS.BADGE_STROKE;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(axisX - GRADUATION.TICK_LENGTH, y);
    ctx.lineTo(axisX + GRADUATION.TICK_LENGTH, y);
    ctx.stroke();
    ctx.textAlign = labelRight ? "left" : "right";
    const labelX = labelRight
      ? axisX + GRADUATION.TICK_LENGTH + GRADUATION.LABEL_GAP
      : width - 1 - GRADUATION.TICK_LENGTH - GRADUATION.LABEL_GAP;
    draw_graduation_label(ctx, text, labelX, y);
  }

  ctx.restore();
}

/**
 * What a snap took hold of, drawn under the mechanism.
 *
 * One colour and one dash throughout, and neither belongs to the grid: a hold is a different statement from « here is the paper », and drawn in a step of the grid ramp it would read as one more grid line — vanishing outright where it fell on an axis.
 * The grid line a point landed on is therefore not darkened in place but overdrawn, in the same dashes as the direction holding it, so every indicator reads as one family.
 *
 * Lines run the full width rather than stopping at the cursor: what they say is « this line », not « this length », and a segment ending under the point would read as the edge being placed.
 */
export function draw_snap_feedback(
  ctx: CanvasRenderingContext2D,
  feedback: SnapFeedback,
  viewport: ViewportState,
  width: number,
  height: number,
) {
  const reach = width + height;
  ctx.save();
  ctx.strokeStyle = COLORS.SNAP;
  ctx.lineWidth = 1.5;
  ctx.setLineDash(GUIDE_DASH);
  ctx.beginPath();

  if (feedback.gridX !== undefined) {
    const x = world2screen(new Point2(feedback.gridX, 0), viewport).x;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  if (feedback.gridY !== undefined) {
    const y = world2screen(new Point2(0, feedback.gridY), viewport).y;
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  for (const { anchor, direction } of feedback.guides) {
    const origin = world2screen(anchor, viewport);
    const along = world2screen_vec(direction, viewport).normalize();
    ctx.moveTo(origin.x - along.x * reach, origin.y - along.y * reach);
    ctx.lineTo(origin.x + along.x * reach, origin.y + along.y * reach);
  }

  ctx.stroke();
  ctx.restore();
}

export function draw_ground(
  ctx: CanvasRenderingContext2D,
  position: ScreenPoint,
  angle: number,
) {
  const widthChange = ctx.lineWidth - STROKE_WIDTHS.STANDARD;
  ctx.save();
  ctx.translate(position.x, position.y);
  ctx.rotate(angle);
  ctx.translate(0, DIM.GROUND_VERTICAL_OFFSET);

  // Vertical line
  ctx.lineCap = "square";
  ctx.lineWidth = STROKE_WIDTHS.GROUND_BAR + widthChange;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 0 + DIM.GROUND_BAR_HEIGHT);
  ctx.stroke();

  // Hatching
  ctx.lineCap = "round";
  ctx.lineWidth = STROKE_WIDTHS.STANDARD + widthChange;
  ctx.beginPath();
  ctx.moveTo(-DIM.GROUND_WIDTH / 2, DIM.GROUND_BAR_HEIGHT + 1.5);
  ctx.lineTo(DIM.GROUND_WIDTH / 2, DIM.GROUND_BAR_HEIGHT + 1.5);
  ctx.moveTo(-DIM.GROUND_WIDTH / 2, DIM.GROUND_BAR_HEIGHT + 2);
  ctx.lineTo(-DIM.GROUND_WIDTH / 4, DIM.GROUND_BAR_HEIGHT + DIM.GROUND_HEIGHT);
  ctx.moveTo(-DIM.GROUND_WIDTH / 4, DIM.GROUND_BAR_HEIGHT + 2);
  ctx.lineTo(0, DIM.GROUND_BAR_HEIGHT + DIM.GROUND_HEIGHT);
  ctx.moveTo(0, DIM.GROUND_BAR_HEIGHT + 2);
  ctx.lineTo(DIM.GROUND_WIDTH / 4, DIM.GROUND_BAR_HEIGHT + DIM.GROUND_HEIGHT);
  ctx.moveTo(DIM.GROUND_WIDTH / 4, DIM.GROUND_BAR_HEIGHT + 2);
  ctx.lineTo(DIM.GROUND_WIDTH / 2, DIM.GROUND_BAR_HEIGHT + DIM.GROUND_HEIGHT);
  ctx.stroke();

  ctx.restore();
}

/** The gesture-preview marker for an edge's start point, while its end is still being placed. */
export function draw_start_edge_end(
  ctx: CanvasRenderingContext2D,
  position: ScreenPoint,
) {
  const sideL = DIM.BEAM_WIDTH + STROKE_WIDTHS.STANDARD;
  const sideS = DIM.BEAM_WIDTH - STROKE_WIDTHS.STANDARD;
  const oldFillStyle = ctx.fillStyle;
  ctx.fillStyle = ctx.strokeStyle;
  ctx.fillRect(position.x - sideL / 2, position.y - sideL / 2, sideL, sideL);
  ctx.fillStyle = oldFillStyle;
  ctx.fillRect(position.x - sideS / 2, position.y - sideS / 2, sideS, sideS);
}

export function draw_belt_end(
  ctx: CanvasRenderingContext2D,
  position: ScreenPoint,
) {
  ctx.fillStyle = ctx.strokeStyle;
  ctx.beginPath();
  ctx.arc(position.x, position.y, DIM.END_RADIUS, 0, TAU);
  ctx.fill();
}

export function draw_hover_circle(
  ctx: CanvasRenderingContext2D,
  position: ScreenPoint,
) {
  ctx.lineWidth = STROKE_WIDTHS.HOVERED;
  ctx.beginPath();
  ctx.arc(position.x, position.y, DIM.EDGE_ENDPOINT_RADIUS, 0, TAU);
  ctx.stroke();
}

export function draw_pivot(
  ctx: CanvasRenderingContext2D,
  position: ScreenPoint,
  filled: boolean,
) {
  ctx.beginPath();
  ctx.arc(position.x, position.y, DIM.PIVOT_OUTER_RADIUS, 0, TAU);
  ctx.arc(position.x, position.y, DIM.PIVOT_INNER_RADIUS, 0, TAU);
  ctx.fillStyle = COLORS.FILL_NODE;
  ctx.fill("evenodd");

  if (filled) {
    ctx.beginPath();
    ctx.arc(position.x, position.y, DIM.PIVOT_INNER_RADIUS, 0, TAU);
    ctx.fillStyle = COLORS.FILL_BODY;
    ctx.fill();
  }

  ctx.beginPath();
  ctx.arc(position.x, position.y, DIM.PIVOT_OUTER_RADIUS, 0, TAU);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(position.x, position.y, DIM.PIVOT_INNER_RADIUS, 0, TAU);
  ctx.stroke();
}

export function draw_slider(
  ctx: CanvasRenderingContext2D,
  position: ScreenPoint,
  angle: number,
  filled: boolean,
) {
  ctx.save();
  ctx.translate(position.x, position.y);
  ctx.rotate(angle);

  ctx.beginPath();
  ctx.roundRect(
    -DIM.SLIDER_OUTER_WIDTH / 2,
    -DIM.SLIDER_OUTER_HEIGHT / 2,
    DIM.SLIDER_OUTER_WIDTH,
    DIM.SLIDER_OUTER_HEIGHT,
    DIM.SLIDER_RADIUS,
  );
  ctx.rect(
    -DIM.SLIDER_INNER_WIDTH / 2,
    -DIM.SLIDER_INNER_HEIGHT / 2,
    DIM.SLIDER_INNER_WIDTH,
    DIM.SLIDER_INNER_HEIGHT,
  );
  const oldFillStyle = ctx.fillStyle;
  ctx.fillStyle = COLORS.FILL_NODE;
  ctx.fill("evenodd");
  if (filled) {
    ctx.fillStyle = oldFillStyle;
    ctx.fillRect(
      -DIM.SLIDER_INNER_WIDTH / 2,
      -DIM.SLIDER_INNER_HEIGHT / 2,
      DIM.SLIDER_INNER_WIDTH,
      DIM.SLIDER_INNER_HEIGHT,
    );
  }
  ctx.stroke();

  ctx.restore();
}

export function draw_slidep_bottom(
  ctx: CanvasRenderingContext2D,
  position: ScreenPoint,
  angle: number,
) {
  ctx.save();
  ctx.translate(position.x, position.y);
  ctx.rotate(angle);

  ctx.beginPath();
  ctx.roundRect(
    -DIM.SLIDEP_OUTER_WIDTH / 2,
    -DIM.SLIDER_OUTER_HEIGHT / 2,
    DIM.SLIDEP_OUTER_WIDTH,
    DIM.SLIDER_OUTER_HEIGHT,
    DIM.SLIDER_RADIUS,
  );
  ctx.rect(
    -DIM.SLIDER_INNER_WIDTH / 2,
    -DIM.SLIDER_INNER_HEIGHT / 2,
    DIM.SLIDER_INNER_WIDTH,
    DIM.SLIDER_INNER_HEIGHT,
  );
  ctx.fillStyle = COLORS.FILL_NODE;
  ctx.fill("evenodd");
  ctx.beginPath();
  ctx.roundRect(
    -DIM.SLIDEP_OUTER_WIDTH / 2,
    -DIM.SLIDER_OUTER_HEIGHT / 2,
    DIM.SLIDEP_OUTER_WIDTH,
    DIM.SLIDER_OUTER_HEIGHT,
    DIM.SLIDER_RADIUS,
  );
  ctx.stroke();

  ctx.restore();
}

export function draw_parallel_leg_bottom(
  ctx: CanvasRenderingContext2D,
  from: ScreenPoint,
  to: ScreenPoint,
) {
  const widthChange = ctx.lineWidth - STROKE_WIDTHS.STANDARD;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.lineWidth = DIM.BEAM_WIDTH + widthChange;
  ctx.stroke();
  ctx.restore();
}

export function draw_parallel_leg_top(
  ctx: CanvasRenderingContext2D,
  from: ScreenPoint,
  to: ScreenPoint,
) {
  const widthChange = ctx.lineWidth - STROKE_WIDTHS.STANDARD;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.strokeStyle = ctx.fillStyle;
  ctx.lineWidth = DIM.BEAM_WIDTH - 2 * STROKE_WIDTHS.STANDARD - widthChange;
  ctx.stroke();
  ctx.restore();
}

export function draw_join_bottom(
  ctx: CanvasRenderingContext2D,
  position: ScreenPoint,
) {
  ctx.beginPath();
  ctx.arc(position.x, position.y, DIM.JOIN_RADIUS + ctx.lineWidth / 2, 0, TAU);
  ctx.fillStyle = ctx.strokeStyle;
  ctx.fill();
}

export function draw_join_top(
  ctx: CanvasRenderingContext2D,
  position: ScreenPoint,
) {
  ctx.beginPath();
  ctx.arc(position.x, position.y, DIM.JOIN_RADIUS - ctx.lineWidth / 2, 0, TAU);

  ctx.fill();
}

export function draw_join(
  ctx: CanvasRenderingContext2D,
  position: ScreenPoint,
) {
  ctx.beginPath();
  ctx.arc(position.x, position.y, DIM.JOIN_RADIUS, 0, TAU);

  ctx.fill();
  ctx.stroke();
}

export function draw_mass(
  ctx: CanvasRenderingContext2D,
  position: ScreenPoint,
  value: number,
) {
  ctx.font = TEXT_SPECS.TEXT_FONT;
  const text = format_quantity(value, MASS);
  const width = ctx.measureText(text).width + 2 * DIM.MASS_TEXT_PADDING;
  const overhang = (DIM.MASS_HEIGHT / 2) * Math.tan(DIM.MASS_SIDE_ANGLE);
  const top = position.y - DIM.MASS_HEIGHT / 2;
  const bottom = position.y + DIM.MASS_HEIGHT / 2;
  const corners = [
    { x: position.x - width / 2 + overhang * 2, y: top },
    { x: position.x + width / 2 - overhang * 2, y: top },
    { x: position.x + width / 2, y: bottom },
    { x: position.x - width / 2, y: bottom },
  ];
  const edge_middle = (i: number) => ({
    x: (corners[i % 4].x + corners[(i + 1) % 4].x) / 2,
    y: (corners[i % 4].y + corners[(i + 1) % 4].y) / 2,
  });

  ctx.beginPath();
  const start = edge_middle(0);
  ctx.moveTo(start.x, start.y);
  for (let i = 1; i <= 4; i++) {
    const corner = corners[i % 4];
    const next = edge_middle(i);
    ctx.arcTo(corner.x, corner.y, next.x, next.y, DIM.SLIDER_RADIUS);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = ctx.strokeStyle;
  draw_text(ctx, position, text);
}

/** Shared by every stress-fill ramp (`stress_ramp_color`, `magnitude_stress_color`,
 * `signed_stress_color`): linear interpolation between the two stops of `ramp` that bracket `t`, clamped to `ramp`'s own ends outside its range. */
function interpolate_color_ramp(
  ramp: readonly { t: number; rgb: readonly [number, number, number] }[],
  t: number,
): string {
  let lo = ramp[0];
  let hi = ramp[ramp.length - 1];
  for (let i = 0; i < ramp.length - 1; i++) {
    if (t >= ramp[i].t && t <= ramp[i + 1].t) {
      lo = ramp[i];
      hi = ramp[i + 1];
      break;
    }
  }
  const span = hi.t - lo.t || 1;
  const u = (t - lo.t) / span;
  const [r, g, b] = lo.rgb.map((c, i) => Math.round(c + (hi.rgb[i] - c) * u));
  return `rgb(${r}, ${g}, ${b})`;
}

/** Linear interpolation on `STRESS_RAMP`. `ratio` at or past 1 is `STRESS_OVERSTRESS_COLOR`,
 * unconditionally — past the elastic limit is never a matter of scale, and stays a per-beam ratio check even though the ramp itself no longer is (`Re` differs beam to beam).
 * Below that, `stress` (Pa, absolute) is read as a fraction of `scaleMaxStress` (`StressScaleCache.maxStress`) — an absolute scale, so it can be labelled with one real stress value in the legend instead of a bare, per-beam-relative percentage.
 * `0` or negative `scaleMaxStress` (nothing recorded yet) reads as the bottom of the ramp. */
export function stress_ramp_color(
  ratio: number,
  stress: number,
  scaleMaxStress: number,
): string {
  // A NaN input (a solver reaction gone degenerate) must still resolve to a paintable color — every comparison against it is false, so it would otherwise fall through every branch below and reach `addColorStop` as "rgb(NaN, NaN, NaN)".
  if (Number.isNaN(ratio) || Number.isNaN(stress)) {
    const [r, g, b] = STRESS_RAMP[0].rgb;
    return `rgb(${r}, ${g}, ${b})`;
  }
  if (ratio >= 1) return STRESS_OVERSTRESS_COLOR;
  const t =
    scaleMaxStress > 0 ? Math.min(Math.max(stress / scaleMaxStress, 0), 1) : 0;
  return interpolate_color_ramp(STRESS_RAMP, t);
}

/**
 * `STRESS_RAMP` read on a plain magnitude, no sign, no overstress threshold — the `bending` lens' own color (docs/plan-efforts-interieurs.md phase 9).
 * Unlike `normal`, a single cut in bending is in tension on one fibre and compression on the other AT ONCE: there is no whole- section state to sign, so this reads `|Mf·v/I|` the same way `stress_ramp_color` reads `utilization` — "how much", not "which way".
 * `scaleMax <= 0` or a non-finite `magnitude` reads as the ramp's own bottom. */
export function magnitude_stress_color(
  magnitude: number,
  scaleMax: number,
): string {
  if (!Number.isFinite(magnitude) || scaleMax <= 0) {
    const [r, g, b] = STRESS_RAMP[0].rgb;
    return `rgb(${r}, ${g}, ${b})`;
  }
  const t = Math.min(Math.max(magnitude / scaleMax, 0), 1);
  return interpolate_color_ramp(STRESS_RAMP, t);
}

/** Converts `bending_stress_stops`' raw (signed) readings into the beam's gradient stops via
 * `magnitude_stress_color` — the sign itself is dropped here, in drawing territory, not in `cohesion-field.ts`: the physics function stays the honest signed reading, this is a display choice.
 * No re-stepping needed, same reasoning as `signed_stress_fill_stops`. */
export function magnitude_stress_fill_stops(
  rawStops: { offset: number; stress: number }[],
  scaleMax: number,
): BeamFillStop[] {
  return rawStops.map((stop) => ({
    offset: stop.offset,
    color: magnitude_stress_color(Math.abs(stop.stress), scaleMax),
  }));
}

/**
 * Converts `stress_utilization_stops`'/`shear_utilization_stops`' raw readings into the beam's gradient stops, stepping — never fading — across every point where `ratio` crosses 1: the elastic limit (or `τ_adm`) is a real physical boundary, not a place for the ramp to blend into `STRESS_OVERSTRESS_COLOR` over a span of samples.
 * `field.samples` carries no station there (it isn't a discontinuity of the internal-force field itself, only of where this overlay's color happens to jump), so the step is snapped to the first sample past the crossing rather than the exact abscissa — close enough at the sample density `compute_cohesion_field` already uses, and far simpler than root-finding through `max_fiber_stress`'s/`max_shear_stress`'s non-smooth terms.
 */
export function beam_fill_stops(
  rawStops: { offset: number; ratio: number; stress: number }[],
  scaleMaxStress: number,
): BeamFillStop[] {
  const result: BeamFillStop[] = [];
  let prevRatio: number | undefined;
  for (const stop of rawStops) {
    const color = stress_ramp_color(stop.ratio, stop.stress, scaleMaxStress);
    if (prevRatio !== undefined && prevRatio >= 1 !== stop.ratio >= 1) {
      const justBefore =
        stop.ratio >= 1
          ? // Entering overstress: the ramp's own color one instant before it steps to black.
            stress_ramp_color(0.999999, stop.stress, scaleMaxStress)
          : // Leaving overstress: black right up to the boundary, then straight into the ramp.
            STRESS_OVERSTRESS_COLOR;
      result.push({ offset: stop.offset, color: justBefore });
    }
    result.push({ offset: stop.offset, color });
    prevRatio = stop.ratio;
  }
  return result;
}

/**
 * A `STRESS_RAMP`-reading lens' legend — screen-anchored bottom-left, a gradient bar reading `STRESS_RAMP` directly (0 to `scaleMaxStress`, labelled as an absolute stress — a real number a user can compare against a material's own `Re`, far more informative than a bare percentage).
 * `overstressLabel` given (the `utilization` lens, phase 6) also draws a separate swatch in `STRESS_OVERSTRESS_COLOR`, apart from the bar, never at its right end: it means something categorically different ("past the limit"), not a position on the scale, and drawing it as the bar's own last segment would say otherwise.
 * `undefined` (the `bending` lens, phase 9) omits it: a magnitude with no threshold of its own has nothing to mark past the bar's own top.
 */
export function draw_stress_legend(
  ctx: CanvasRenderingContext2D,
  height: number,
  scaleMaxStress: number,
  overstressLabel?: string,
  /** Shown only when the mechanism actually holds a beam whose field is indicative — see
   * `STRESS_INDETERMINATE_COLOR`.
   * An unexplained colour on screen is worse than none. */
  indeterminateLabel?: string,
) {
  const { MARGIN, BAR_WIDTH, BAR_HEIGHT, GAP, FONT } = STRESS_LEGEND;
  const barX = MARGIN;
  const barY = height - MARGIN - BAR_HEIGHT;

  ctx.save();
  ctx.font = FONT;

  const gradient = ctx.createLinearGradient(barX, 0, barX + BAR_WIDTH, 0);
  for (const stop of STRESS_RAMP) {
    const [r, g, b] = stop.rgb;
    gradient.addColorStop(stop.t, `rgb(${r}, ${g}, ${b})`);
  }
  ctx.fillStyle = gradient;
  ctx.strokeStyle = COLORS.BADGE_STROKE;
  ctx.lineWidth = 1;

  ctx.fillRect(barX, barY, BAR_WIDTH, BAR_HEIGHT);
  ctx.strokeRect(barX + 0.5, barY + 0.5, BAR_WIDTH - 1, BAR_HEIGHT - 1);

  ctx.textBaseline = "bottom";
  ctx.textAlign = "left";
  draw_graduation_label(ctx, "0", barX, barY - GAP);
  ctx.textAlign = "right";
  draw_graduation_label(
    ctx,
    format_quantity(scaleMaxStress, STRESS, 1),
    barX + BAR_WIDTH,
    barY - GAP,
  );

  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  let swatchX = barX + BAR_WIDTH + GAP;
  if (overstressLabel !== undefined)
    swatchX = draw_legend_swatch(
      ctx,
      swatchX,
      barY,
      BAR_HEIGHT,
      GAP,
      STRESS_OVERSTRESS_COLOR,
      overstressLabel,
    );
  if (indeterminateLabel !== undefined)
    draw_legend_swatch(
      ctx,
      swatchX,
      barY,
      BAR_HEIGHT,
      GAP,
      STRESS_INDETERMINATE_COLOR,
      indeterminateLabel,
    );

  ctx.restore();
}

/** One square of colour and its label, laid out left to right; returns where the next one
 * starts.
 * Assumes `textAlign`/`textBaseline` are already left/middle. */
function draw_legend_swatch(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  gap: number,
  color: string,
  label: string,
): number {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, size, size);
  ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
  const labelX = x + size + gap;
  draw_graduation_label(ctx, label, labelX, y + size / 2);
  return labelX + ctx.measureText(label).width + gap * 2;
}

/** One stop of the stress overlay's fill gradient — `offset` a fraction of the beam's own
 * length (0 at `start`), `color` already ramped.
 * Two stops at the same `offset` draw a hard step, for a discontinuity that must not be smoothed away (same convention as the panel's own diagrams). */
export interface BeamFillStop {
  offset: number;
  color: string;
}

export function draw_beam(
  ctx: CanvasRenderingContext2D,
  start: ScreenPoint,
  end: ScreenPoint,
  isStartJoin: boolean = false,
  isEndJoin: boolean = false,
  stressStops?: BeamFillStop[],
) {
  const sL = DIM.BEAM_WIDTH - STROKE_WIDTHS.STANDARD + ctx.lineWidth;
  const sideS = DIM.BEAM_WIDTH - STROKE_WIDTHS.STANDARD - ctx.lineWidth;
  const startJ = isStartJoin ? DIM.JOIN_RADIUS + STROKE_WIDTHS.STANDARD + 1 : 0;
  const endJ = isEndJoin ? DIM.JOIN_RADIUS + STROKE_WIDTHS.STANDARD + 1 : 0;
  const oldFillStyle = ctx.fillStyle;

  ctx.save();
  try {
    ctx.translate(start.x, start.y);
    ctx.rotate(end.sub(start).angle());
    const length = start.distance_to(end);

    ctx.fillStyle = ctx.strokeStyle;
    ctx.fillRect(-sL / 2 + startJ, -sL / 2, length + sL - endJ - startJ, sL);
    // Built here, under this call's own translate/rotate: a gradient's coordinates are only guaranteed to line up with the shape they fill when both are resolved under the same transform, so it cannot be built by the caller and handed in.
    if (stressStops && stressStops.length > 0) {
      const gradient = ctx.createLinearGradient(0, 0, length, 0);
      for (const stop of stressStops)
        gradient.addColorStop(
          Math.min(Math.max(stop.offset, 0), 1),
          stop.color,
        );
      ctx.fillStyle = gradient;
    } else {
      ctx.fillStyle = oldFillStyle;
    }
    ctx.fillRect(-sideS / 2, -sideS / 2, length + sideS, sideS);
  } finally {
    // A stray exception (an invalid gradient color stop, say) must never skip this: leaving the translate/rotate above unwound would rotate every element drawn after this one for the rest of the session, canvas-wide.
    ctx.restore();
  }
}

export function draw_spring(
  ctx: CanvasRenderingContext2D,
  start: ScreenPoint,
  end: ScreenPoint,
  restLength: number | undefined = undefined,
  scale: number = 1,
) {
  ctx.save();
  ctx.translate(start.x, start.y);
  ctx.rotate(end.sub(start).angle());
  const length = start.distance_to(end);
  const coilNb = Math.max(
    Math.floor((restLength ?? length / scale) / DIM.SPRING_COIL_PITCH),
    DIM.SPRING_MIN_COILS,
  );
  const fc = (t: number) => {
    return (Math.sin((t - 0.5) * Math.PI) + 1) / 2;
  };
  const deca = (i: number, offset: number) => {
    return (
      DIM.TAC -
      DIM.BEAM_WIDTH / 2 +
      (length - 2 * DIM.TAC + DIM.BEAM_WIDTH) * fc((i + offset) / (coilNb + 1))
    );
  };

  const oldStrokeStyle = ctx.strokeStyle;
  const oldFillStyle = ctx.fillStyle;
  const widthChange = ctx.lineWidth - STROKE_WIDTHS.STANDARD;

  ctx.lineCap = "round";
  ctx.lineWidth = STROKE_WIDTHS.SPIRE + widthChange;
  ctx.save();
  ctx.globalAlpha *= DIM.SPRING_BACK_COIL_OPACITY;
  for (let i = 1; i <= coilNb - 1; i++) {
    ctx.beginPath();
    ctx.moveTo(deca(i, 0.25), DIM.SPRING_COIL_RADIUS);
    ctx.lineTo(deca(i, 0.75), -DIM.SPRING_COIL_RADIUS);
    ctx.stroke();
  }
  ctx.restore();

  // Backing bar
  ctx.lineCap = "square";
  ctx.beginPath();
  ctx.moveTo(DIM.TAC, 0);
  ctx.lineTo(length - DIM.TAC, 0);
  ctx.lineWidth = DIM.SPRING_INNER_WIDTH + widthChange;
  ctx.strokeStyle = oldStrokeStyle;
  ctx.stroke();
  ctx.strokeStyle = oldFillStyle;
  ctx.lineWidth =
    DIM.SPRING_INNER_WIDTH - 2 * STROKE_WIDTHS.STANDARD - widthChange;
  ctx.stroke();
  ctx.strokeStyle = oldStrokeStyle;
  // Start
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(DIM.TAC - DIM.BEAM_WIDTH / 2, 0);
  ctx.lineWidth = DIM.BEAM_WIDTH + widthChange;
  ctx.strokeStyle = oldStrokeStyle;
  ctx.stroke();
  ctx.strokeStyle = oldFillStyle;
  ctx.lineWidth = DIM.BEAM_WIDTH - 2 * STROKE_WIDTHS.STANDARD - widthChange;
  ctx.stroke();
  ctx.strokeStyle = oldStrokeStyle;
  // End
  ctx.beginPath();
  ctx.moveTo(length - DIM.TAC + DIM.BEAM_WIDTH / 2, 0);
  ctx.lineTo(length, 0);
  ctx.lineWidth = DIM.BEAM_WIDTH + widthChange;
  ctx.strokeStyle = oldStrokeStyle;
  ctx.stroke();
  ctx.strokeStyle = oldFillStyle;
  ctx.lineWidth = DIM.BEAM_WIDTH - 2 * STROKE_WIDTHS.STANDARD - widthChange;
  ctx.stroke();
  ctx.strokeStyle = oldStrokeStyle;

  // Front coils
  ctx.lineCap = "round";
  ctx.lineWidth = STROKE_WIDTHS.SPIRE + widthChange;
  for (let i = 1; i <= coilNb; i++) {
    ctx.beginPath();
    ctx.moveTo(deca(i, -0.25), -DIM.SPRING_COIL_RADIUS);
    ctx.lineTo(deca(i, 0.25), DIM.SPRING_COIL_RADIUS);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * How far down its travel the piston sits, as a fraction, for a damper stretched to `stretch` times its rest length: half way at rest, sliding back toward the cylinder's mouth as the damper extends.
 *
 * One function of the stretch, normalised on its own value at rest, so edition — which *is* rest — and simulation cannot disagree.
 * Two separate expressions would have to be kept equal at `stretch === 1` by hand, and a mismatch there jumps the piston the instant the simulation starts, with nothing having moved.
 */
function damper_piston_fraction(stretch: number): number {
  const reach = (s: number) => 1 + 3 * Math.exp(-Math.pow(s / 2, 2));
  return reach(stretch) / (2 * reach(1));
}

export function draw_damper(
  ctx: CanvasRenderingContext2D,
  start: ScreenPoint,
  end: ScreenPoint,
  restLength: number | undefined = undefined,
  scale: number = 1,
) {
  ctx.save();
  ctx.translate(start.x, start.y);
  ctx.rotate(end.sub(start).angle());
  const length = start.distance_to(end);
  const start_x = length / 4;
  // No rest length to compare against means edition, where the damper is drawn at its natural length by definition.
  const stretch = restLength ? length / scale / restLength : 1;
  const piston_x = (length - 2 * DIM.TAC) * damper_piston_fraction(stretch);
  const oldStrokeStyle = ctx.strokeStyle;
  const widthChange = ctx.lineWidth - STROKE_WIDTHS.STANDARD;

  // End
  ctx.lineCap = "square";
  ctx.beginPath();
  ctx.moveTo(length - DIM.TAC + DIM.BEAM_WIDTH / 2 - 1, 0);
  ctx.lineTo(length, 0);
  ctx.lineWidth = DIM.BEAM_WIDTH + widthChange;
  ctx.strokeStyle = oldStrokeStyle;
  ctx.stroke();
  ctx.strokeStyle = ctx.fillStyle;
  ctx.lineWidth = DIM.BEAM_WIDTH - 2 * STROKE_WIDTHS.STANDARD - widthChange;
  ctx.stroke();
  ctx.strokeStyle = oldStrokeStyle;

  // Cylinder body
  ctx.beginPath();
  ctx.rect(
    start_x,
    -DIM.DAMPER_CYLINDER_DIAMETER / 2,
    length - DIM.TAC - start_x,
    DIM.DAMPER_CYLINDER_DIAMETER,
  );
  ctx.lineWidth = STROKE_WIDTHS.STANDARD + widthChange;
  ctx.stroke();

  // Center bar
  ctx.beginPath();
  ctx.moveTo(DIM.TAC, 0);
  ctx.lineTo(piston_x + DIM.TAC / 2, 0);
  ctx.lineWidth = DIM.DAMPER_INNER_WIDTH + widthChange;
  ctx.strokeStyle = oldStrokeStyle;
  ctx.stroke();
  ctx.strokeStyle = ctx.fillStyle;
  ctx.lineWidth =
    DIM.DAMPER_INNER_WIDTH - 2 * STROKE_WIDTHS.STANDARD - widthChange;
  ctx.stroke();
  ctx.strokeStyle = oldStrokeStyle;
  // Start
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(DIM.TAC - DIM.BEAM_WIDTH / 2 + 1, 0);
  ctx.lineWidth = DIM.BEAM_WIDTH + widthChange;
  ctx.strokeStyle = oldStrokeStyle;
  ctx.stroke();
  ctx.strokeStyle = ctx.fillStyle;
  ctx.lineWidth = DIM.BEAM_WIDTH - 2 * STROKE_WIDTHS.STANDARD - widthChange;
  ctx.stroke();
  ctx.strokeStyle = oldStrokeStyle;

  // Valve
  ctx.beginPath();
  ctx.rect(
    piston_x + DIM.TAC / 2 - DIM.DAMPER_PISTON_WIDTH / 2,
    -DIM.DAMPER_CYLINDER_DIAMETER / 2 + 3,
    DIM.DAMPER_PISTON_WIDTH,
    DIM.DAMPER_CYLINDER_DIAMETER - 6,
  );
  ctx.lineWidth = STROKE_WIDTHS.STANDARD + widthChange;
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

/** The arc the rotation-direction arrow rides on, shared with the hit-test so a click only lands where the arrow is actually drawn. */
export function motor_arrow_geometry(clockwise: boolean): {
  startAngle: number;
  endAngle: number;
  anticlockwise: boolean;
} {
  return {
    startAngle:
      TAU * (clockwise ? DIM.MOTOR_ARROW_ANGLE - 0.5 : -DIM.MOTOR_ARROW_ANGLE),
    endAngle:
      TAU * (clockwise ? -DIM.MOTOR_ARROW_ANGLE : DIM.MOTOR_ARROW_ANGLE - 0.5),
    anticlockwise: !clockwise,
  };
}

export function draw_motor(
  ctx: CanvasRenderingContext2D,
  position: ScreenPoint,
  isGrounded: boolean,
  clockwise: boolean,
  arrowHovered = false,
) {
  const bottom = DIM.MOTOR_RADIUS - 2;
  ctx.lineCap = "round";

  ctx.beginPath();
  if (isGrounded) {
    ctx.moveTo(position.x - DIM.MOTOR_RADIUS, position.y + bottom);
    ctx.arc(position.x, position.y, DIM.MOTOR_RADIUS, TAU / 2, 0);
    ctx.lineTo(position.x + DIM.MOTOR_RADIUS, position.y + bottom);
  } else {
    ctx.arc(position.x, position.y, DIM.MOTOR_RADIUS, 0, TAU);
  }
  ctx.closePath();
  if (isGrounded) {
    ctx.moveTo(position.x - DIM.MOTOR_RADIUS + 7, position.y + bottom);
    ctx.arc(
      position.x - DIM.MOTOR_RADIUS + 5,
      position.y + bottom - 5,
      2,
      0,
      TAU,
    );
    ctx.moveTo(position.x + DIM.MOTOR_RADIUS - 3, position.y + bottom - 5);
    ctx.arc(
      position.x + DIM.MOTOR_RADIUS - 5,
      position.y + bottom - 5,
      2,
      0,
      TAU,
    );
  }
  ctx.arc(position.x, position.y, DIM.PIVOT_INNER_RADIUS, 0, TAU);
  ctx.fill("evenodd");

  ctx.beginPath();
  if (isGrounded) {
    ctx.arc(
      position.x - DIM.MOTOR_RADIUS + DIM.MOTOR_CORNER_RADIUS,
      position.y + bottom - DIM.MOTOR_CORNER_RADIUS,
      DIM.MOTOR_CORNER_RADIUS,
      TAU / 4,
      TAU / 2,
    );
    ctx.arc(position.x, position.y, DIM.MOTOR_RADIUS, TAU / 2, 0);
    ctx.arc(
      position.x + DIM.MOTOR_RADIUS - DIM.MOTOR_CORNER_RADIUS,
      position.y + bottom - DIM.MOTOR_CORNER_RADIUS,
      DIM.MOTOR_CORNER_RADIUS,
      0,
      TAU / 4,
    );
  } else {
    ctx.arc(position.x, position.y, DIM.MOTOR_RADIUS, 0, TAU);
  }
  ctx.closePath();
  ctx.stroke();
  if (isGrounded) {
    ctx.lineWidth -= 0.5;
    ctx.beginPath();
    ctx.arc(
      position.x - DIM.MOTOR_RADIUS + 5,
      position.y + bottom - 5,
      2,
      0,
      TAU,
    );
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(
      position.x + DIM.MOTOR_RADIUS - 5,
      position.y + bottom - 5,
      2,
      0,
      TAU,
    );
    ctx.stroke();
    ctx.lineWidth += 0.5;
  }

  const inner = DIM.PIVOT_OUTER_RADIUS + 3.5;
  const outer = DIM.MOTOR_RADIUS - 1;

  ctx.beginPath();
  ctx.moveTo(position.x + inner, position.y);
  ctx.lineTo(position.x + outer, position.y);
  if (!isGrounded) {
    ctx.moveTo(position.x, position.y + inner);
    ctx.lineTo(position.x, position.y + outer);
  }
  ctx.moveTo(position.x - inner, position.y);
  ctx.lineTo(position.x - outer, position.y);
  ctx.moveTo(position.x, position.y - inner);
  ctx.lineTo(position.x, position.y - outer);
  ctx.lineWidth += 0.5;
  ctx.stroke();
  ctx.lineWidth -= 0.5;

  // Direction arrow

  const D = 1 / 32;
  const scale = 0.8;

  const { startAngle, endAngle, anticlockwise } =
    motor_arrow_geometry(clockwise);
  const endAngleA = endAngle + TAU * (clockwise ? -D : D);

  const oldArrowLineWidth = ctx.lineWidth;
  ctx.lineWidth =
    STROKE_WIDTHS.STANDARD + (arrowHovered ? STROKE_WIDTHS.HOVER_GAIN : 0);
  ctx.beginPath();
  ctx.arc(
    position.x,
    position.y,
    DIM.MOTOR_ARROW_RADIUS,
    startAngle,
    endAngleA,
    anticlockwise,
  );
  ctx.stroke();
  const headAngle = clockwise
    ? endAngleA - (1 / 4 - D) * TAU
    : endAngleA + (1 / 4 - D) * TAU;
  const tip = position
    .add(Point2.from_polar(DIM.MOTOR_ARROW_RADIUS, endAngleA))
    .sub(Point2.from_polar(DIM.ARROW_HEAD_LENGTH * scale, headAngle));
  const oldFillStyle = ctx.fillStyle;
  ctx.fillStyle = ctx.strokeStyle;
  draw_arrow_head(ctx, tip, headAngle, scale);
  ctx.fillStyle = oldFillStyle;
  ctx.lineWidth = oldArrowLineWidth;
}

/** `hovered` fills the body at 80% opacity instead of the usual half. The belt arc rides on the very circle the outline draws, so the outline alone cannot carry the hover: the body does. */
export function draw_gear(
  ctx: CanvasRenderingContext2D,
  position: ScreenPoint,
  radius: number,
  angle: number,
  hovered = false,
) {
  const r1 = (radius + DIM.PIVOT_OUTER_RADIUS) / 2;
  const r2 = Math.max(1, (radius - DIM.PIVOT_OUTER_RADIUS) / 3);
  const holesNb = DIM.GEAR_HOLES_COUNT;

  // Main gear body
  ctx.beginPath();
  ctx.arc(position.x, position.y, radius, 0, TAU);
  ctx.arc(position.x, position.y, DIM.PIVOT_OUTER_RADIUS, 0, TAU);
  for (let i = 0; i < holesNb; i++) {
    const angleA = (i / holesNb) * TAU + angle;
    ctx.moveTo(
      position.x + Math.cos(angleA) * r1,
      position.y + Math.sin(angleA) * r1,
    );
    ctx.arc(
      position.x + Math.cos(angleA) * r1,
      position.y + Math.sin(angleA) * r1,
      r2,
      0,
      TAU,
    );
  }
  ctx.fillStyle += hovered
    ? COLORS.HOVER_TRANSPARENCY
    : COLORS.HALF_TRANSPARENCY;

  const oldShadowBlur = ctx.shadowBlur;
  ctx.shadowBlur = 0;
  ctx.fill("evenodd");
  ctx.shadowBlur = oldShadowBlur;

  ctx.beginPath();
  ctx.arc(position.x, position.y, radius, 0, TAU);
  ctx.stroke();

  for (let i = 0; i < holesNb; i++) {
    ctx.beginPath();
    const angleA = (i / holesNb) * TAU + angle;
    ctx.arc(
      position.x + Math.cos(angleA) * r1,
      position.y + Math.sin(angleA) * r1,
      r2,
      0,
      TAU,
    );
    ctx.stroke();
  }
}

/**
 * Winding of one belt arc: the belt climbs `growth` px total across the wrap (one BELT_WIDTH per turn) so surplus turns read as a coil, not a retraced circle.
 * Applied at the arrival end (`atStart`) or the departure end; the other end stays on the rim.
 * `growth` > 0 grows outward (the free run leaves from the top layer), < 0 inward (winch: keep the free run on the rim so it doesn't lean).
 */
export type BeltWinding = { growth: number; atStart: boolean };

/**
 * Radii at the arrival / departure ends of an arc given its optional winding.
 * The grown end is kept ≥ 1px so an inward (winch) coil deep enough to reach the centre never flips across it.
 */
function belt_arc_radii(
  arc: BeltPiece<"screen">,
  w?: BeltWinding,
): [number, number] {
  if (arc.kind !== "arc") return [0, 0];
  const r = arc.radius;
  if (!w) return [r, r];
  const grown = Math.max(1, r + w.growth);
  return w.atStart ? [grown, r] : [r, grown];
}

/**
 * Append a belt arc to the current path as a polyline from `rStart` (at its arrival angle) to `rEnd` (at its departure angle), the radius interpolated across the swept wrap. rStart === rEnd → a plain circular arc; differing radii → a coil (spiral) that reaches both tangent runs — a belt wound past a full turn.
 * The straight run into the arc is the implicit line from the current point to the first sampled point.
 */
function append_belt_arc(
  ctx: CanvasRenderingContext2D,
  arc: BeltPiece<"screen">,
  rStart: number,
  rEnd: number,
) {
  if (arc.kind !== "arc") return [0, 0];
  const sign = arc.clockwise ? -1 : 1;
  const steps = Math.max(8, Math.ceil((arc.wrap / TAU) * 48));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const angle = arc.startAngle + sign * arc.wrap * t;
    const p = arc.center.add(
      Point2.from_polar(rStart + (rEnd - rStart) * t, angle),
    );
    ctx.lineTo(p.x, p.y);
  }
}

/**
 * Draw a loose (open) belt from its ordered geometric pieces: the tangent runs from the start terminal, the gear arcs, and the run to the end terminal, plus the two end dots.
 * `wraps` (continuous per-via wrap, simulation) sizes each arc so a pulley losing contact (wrap → 0) is drawn straight-past; `windings` (per via) turns a wound pulley's arc into a coil (see `draw_belt_loop`).
 */
export function draw_belt_open(
  ctx: CanvasRenderingContext2D,
  vias: BeltVia<"screen">[],
  wraps: number[],
  windings: (BeltWinding | undefined)[],
) {
  if (vias.length < 2) return;
  const pieces = belt_pieces(vias, false, wraps);
  const widthChange = ctx.lineWidth - STROKE_WIDTHS.STANDARD;
  ctx.lineCap = "square";

  const start = vias[0].pos;
  const end = vias[vias.length - 1].pos;
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  for (const piece of pieces) {
    if (piece.kind === "segment") {
      ctx.lineTo(piece.to.x, piece.to.y);
    } else {
      const [rStart, rEnd] = belt_arc_radii(piece, windings?.[piece.gearIndex]);
      append_belt_arc(ctx, piece, rStart, rEnd);
    }
  }
  ctx.lineTo(end.x, end.y);
  ctx.lineWidth = DIM.BELT_WIDTH + widthChange;
  ctx.stroke();

  draw_belt_end(ctx, start);
  draw_belt_end(ctx, end);
}

/**
 * Draw a closed belt as a continuous closed loop around its pulleys (the gN→g0 closure included), with no free ends.
 *
 * `wraps` (continuous per-via wrap, simulation) sizes each arc so a pulley losing contact (wrap → 0) is drawn straight-past.
 * `windings` (per via) draws a pulley wound past a full turn as a coil whose ends reach both tangent runs, instead of the surplus retracing the same circle.
 */
export function draw_belt_loop(
  ctx: CanvasRenderingContext2D,
  vias: BeltVia<"screen">[],
  wraps: number[],
  windings: (BeltWinding | undefined)[],
) {
  const arcs = belt_pieces(vias, true, wraps).filter((p) => p.kind === "arc");
  if (arcs.length === 0) return;
  const widthChange = ctx.lineWidth - STROKE_WIDTHS.STANDARD;
  ctx.lineCap = "square";

  // Straight tangent runs are the implicit lines between consecutive arcs (each arc's first sampled point); closePath() adds the final closure run.
  ctx.beginPath();
  arcs.forEach((arc, i) => {
    const [rStart, rEnd] = belt_arc_radii(arc, windings?.[arc.gearIndex]);
    if (i === 0) {
      const p0 = arc.center.add(Point2.from_polar(rStart, arc.startAngle));
      ctx.moveTo(p0.x, p0.y);
    }
    append_belt_arc(ctx, arc, rStart, rEnd);
  });
  ctx.closePath();
  ctx.lineWidth = DIM.BELT_WIDTH + widthChange;
  ctx.stroke();
}

export function draw_arrow_head(
  ctx: CanvasRenderingContext2D,
  position: ScreenPoint,
  angle: number,
  scale: number = 1,
) {
  ctx.save();
  ctx.translate(position.x, position.y);
  ctx.rotate(angle);

  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(
    DIM.ARROW_HEAD_LENGTH * scale,
    (-DIM.ARROW_HEAD_WIDTH / 2) * scale,
  );
  ctx.lineTo(DIM.ARROW_HEAD_LENGTH * scale, (DIM.ARROW_HEAD_WIDTH / 2) * scale);
  ctx.fill();

  ctx.restore();
}

export function draw_dimension(
  ctx: CanvasRenderingContext2D,
  start: ScreenPoint,
  end: ScreenPoint,
  position: ScreenPoint,
  value: number,
  hideText: boolean = false,
) {
  ctx.fillStyle = ctx.strokeStyle;

  const delta = end.sub(start);
  const length = delta.length();
  const t = position.parameter_on_segment(start, end);
  const np = delta.perp().normalize();
  const offset = position.sub(start).dot(np);

  // draw side lines

  if (Math.abs(offset) > 10) {
    const widthStart = ctx.lineWidth;
    ctx.lineWidth = 1;
    const side = position.is_on_left_side_of_line(start, end) ? -1 : 1;
    const startPos = start.add(np.mul(DIM.HELPER_LINE_BASE_OFFSET * side));
    const offsetStart = start.add(np.mul(offset).extend_length(5));
    ctx.beginPath();
    ctx.moveTo(startPos.x, startPos.y);
    ctx.lineTo(offsetStart.x, offsetStart.y);
    ctx.stroke();

    const endPos = end.add(np.mul(DIM.HELPER_LINE_BASE_OFFSET * side));
    const offsetEnd = end.add(np.mul(offset).extend_length(5));
    ctx.beginPath();
    ctx.moveTo(endPos.x, endPos.y);
    ctx.lineTo(offsetEnd.x, offsetEnd.y);
    ctx.stroke();
    ctx.lineWidth = widthStart;
  }

  // Draw dimension
  const d = start.add(np.mul(offset));
  const s = d.add(
    delta.with_length(t < 0 ? length * t + 16 : DIM.ARROW_HEAD_LENGTH),
  );
  const e = d.add(
    delta.with_length(t > 1 ? length * t - 16 : length - DIM.ARROW_HEAD_LENGTH),
  );
  draw_arrow_head(ctx, d, delta.angle());
  draw_arrow_head(ctx, d.add(delta), delta.angle() + TAU / 2);
  ctx.beginPath();
  ctx.moveTo(s.x, s.y);
  ctx.lineTo(e.x, e.y);
  ctx.stroke();

  if (!hideText) draw_dimension_text(ctx, position, value, "", LENGTH, true);
}

export function draw_dimension_to_segment(
  ctx: CanvasRenderingContext2D,
  point: ScreenPoint,
  start: ScreenPoint,
  end: ScreenPoint,
  position: ScreenPoint,
  value: number,
  hideText: boolean = false,
) {
  ctx.fillStyle = ctx.strokeStyle;
  const widthStart = ctx.lineWidth;
  ctx.lineWidth = 1;

  const ts = position.parameter_on_segment(start, end);
  const oppositePoint = point.project_on_line(start, end);
  const delta = point.sub(oppositePoint);
  const length = delta.length();
  const t = position.parameter_on_segment(oppositePoint, point);
  const np = end.sub(start).normalize();
  const offset = position.sub(oppositePoint).dot(np);
  const side =
    (position.is_on_left_side_of_line(oppositePoint, point) ? -1 : 1) *
    (position.is_on_left_side_of_line(start, end) ? -1 : 1);

  if (ts < 0 || ts > 1) {
    const startPos =
      ts < 0.5
        ? start.sub(np.mul(DIM.HELPER_LINE_BASE_OFFSET))
        : end.add(np.mul(DIM.HELPER_LINE_BASE_OFFSET));
    const offsetStart = oppositePoint.add(
      np.mul(offset).extend_length((ts < 0.5 ? 5 : -5) * side),
    );
    ctx.beginPath();
    ctx.moveTo(startPos.x, startPos.y);
    ctx.lineTo(offsetStart.x, offsetStart.y);
    ctx.stroke();
  }

  const endPos = point.sub(np.mul(DIM.HELPER_LINE_BASE_OFFSET * side));
  const offsetEnd = point.add(np.mul(offset).extend_length(5));
  ctx.beginPath();
  ctx.moveTo(endPos.x, endPos.y);
  ctx.lineTo(offsetEnd.x, offsetEnd.y);
  ctx.stroke();

  ctx.lineWidth = widthStart;

  // Draw dimension
  const d = oppositePoint.add(np.mul(offset));
  const s = d.add(
    delta.with_length(t < 0 ? length * t + 16 : DIM.ARROW_HEAD_LENGTH),
  );
  const e = d.add(
    delta.with_length(t > 1 ? length * t - 16 : length - DIM.ARROW_HEAD_LENGTH),
  );
  const sOffset = ts > 0 && ts < 1 ? DIM.BEAM_WIDTH / 2 - 1 : 0;
  draw_arrow_head(ctx, d.add(delta.with_length(sOffset)), delta.angle());
  draw_arrow_head(ctx, d.add(delta), delta.angle() + TAU / 2);
  ctx.beginPath();
  ctx.moveTo(s.x, s.y);
  ctx.lineTo(e.x, e.y);
  ctx.stroke();

  if (!hideText) draw_dimension_text(ctx, position, value, "", LENGTH, true);
}

export function draw_dimension_angle(
  ctx: CanvasRenderingContext2D,
  start1: ScreenPoint,
  end1: ScreenPoint,
  start2: ScreenPoint,
  end2: ScreenPoint,
  flipStart: boolean,
  flipEnd: boolean,
  position: ScreenPoint,
  value: number,
  hideText: boolean = false,
) {
  ctx.fillStyle = ctx.strokeStyle;

  const origin = Point2.lines_intersection(start1, end1, start2, end2);
  if (!origin) return;

  let alpha = end1
    .sub(start1)
    .mul(flipStart ? -1 : 1)
    .angle();
  let beta = end2
    .sub(start2)
    .mul(flipEnd ? -1 : 1)
    .angle();
  if ((alpha - beta + TAU) % TAU < TAU / 2) {
    [alpha, beta] = [beta, alpha];
  }
  const radius = origin.distance_to(position);
  const start = origin.add(Point2.from_polar(radius, alpha + 3 / radius));
  const end = origin.add(Point2.from_polar(radius, beta - 3 / radius));

  draw_arrow_head(ctx, start, alpha + TAU / 4);
  draw_arrow_head(ctx, end, beta - TAU / 4);

  ctx.beginPath();
  ctx.arc(
    origin.x,
    origin.y,
    Math.sqrt(radius ** 2 + 20 ** 2),
    alpha + DIM.ARROW_HEAD_LENGTH / radius,
    beta - DIM.ARROW_HEAD_LENGTH / radius,
  );
  ctx.stroke();

  // TODO: add arc to position TODO: add straight lines

  if (!hideText) draw_dimension_text(ctx, position, value, " deg");
}

export function draw_dimension_radius(
  ctx: CanvasRenderingContext2D,
  center: ScreenPoint,
  radius: number,
  position: ScreenPoint,
  value: number,
  hideText: boolean = false,
) {
  ctx.fillStyle = ctx.strokeStyle;

  const delta = position.sub(center);
  const length = delta.length();

  const d = center.add(delta.with_length(radius));
  const s = center.add(
    delta.with_length(
      length > radius
        ? radius + DIM.ARROW_HEAD_LENGTH
        : DIM.HELPER_LINE_BASE_OFFSET,
    ),
  );
  const e = center.add(
    delta.with_length(Math.max(radius - DIM.ARROW_HEAD_LENGTH, length)),
  );
  draw_arrow_head(ctx, d, delta.angle() + (length > radius ? 0 : TAU / 2));
  ctx.beginPath();
  ctx.moveTo(s.x, s.y);
  ctx.lineTo(e.x, e.y);
  ctx.stroke();

  if (!hideText) draw_dimension_text(ctx, position, value, "", LENGTH, true);
}

export function draw_dimension_belt(
  ctx: CanvasRenderingContext2D,
  vias: BeltVia<"screen">[],
  closed: boolean,
  position: ScreenPoint,
  value: number,
  hideText: boolean = false,
) {
  const closest = belt_project(vias, position, closed).point;
  ctx.beginPath();
  ctx.moveTo(position.x, position.y);
  ctx.lineTo(closest.x, closest.y);
  ctx.stroke();

  if (!hideText) draw_dimension_text(ctx, position, value, "", LENGTH, true);
}

/** How a badge shows that it is on its way out: under the eraser, or as the tombstone of a constraint an undo/redo has just removed. */
export type BadgeDeletion = "none" | "erasing" | "ghost";

/** The fill of a badge laid over the drawing — a ratio pill, a constraint icon box. */
function badge_fill(isSelected: boolean): string {
  return (
    (isSelected ? COLORS.BADGE_FILL_SELECTED : COLORS.BADGE_FILL) +
    COLORS.ICON_TRANSPARENCY
  );
}

/**
 * `kind` formats `value` as a physical quantity (its own unit replaces `extension`) — every caller but the angle dimension, whose degrees are already the number `element.value` itself stores, with no SI scaling to apply.
 *
 * `hideUnit` drops the unit symbol a `kind` would otherwise append: for a length dimension, always mm, so printing it on every single badge is noise once the reader has seen it once — unlike a load's, which is worth repeating because it moves (N, kN, MN…) with the value.
 */
export function draw_dimension_text(
  ctx: CanvasRenderingContext2D,
  position: ScreenPoint,
  value: number,
  extension: string = "",
  kind?: QuantityKind,
  hideUnit: boolean = false,
) {
  ctx.font = TEXT_SPECS.TEXT_FONT;
  ctx.textAlign = TEXT_SPECS.TEXT_ALIGN;
  ctx.textBaseline = TEXT_SPECS.TEXT_BASELINE;
  const text = kind
    ? hideUnit
      ? format_mantissa(value, kind)
      : format_quantity(value, kind)
    : (Math.round(value * 10) / 10).toString() + extension;
  const metrics = ctx.measureText(text);

  const lastShadowBlur = ctx.shadowBlur;
  const lastShadowColor = ctx.shadowColor;
  ctx.shadowBlur = INTERACTION_SPECS.ICON_HALO_SIZE;
  ctx.shadowColor = COLORS.BACKGROUND;
  // A value pill sits on the ground and keeps it even when selected: it labels the drawing rather than floating above it, and its outline and text already carry the selection.
  ctx.fillStyle = COLORS.BACKGROUND + COLORS.ICON_TRANSPARENCY;
  ctx.beginPath();
  ctx.roundRect(
    position.x - metrics.width / 2 - 8 / 2,
    position.y - 22 / 2 - 1,
    metrics.width + 8,
    22,
    5,
  );
  ctx.fill();

  ctx.shadowBlur = lastShadowBlur;
  ctx.shadowColor = lastShadowColor;
  ctx.fillStyle = ctx.strokeStyle;
  draw_text(ctx, position, text);
}

export function draw_gear_ratio(
  ctx: CanvasRenderingContext2D,
  position: ScreenPoint,
  value: number,
  selected = false,
  hovered = false,
  deletion: BadgeDeletion = "none",
) {
  ctx.font = TEXT_SPECS.TEXT_FONT;
  const text = value2ratio(value).join(" : ");
  const metrics = ctx.measureText(text);
  const lastStrokeStyle = ctx.strokeStyle;
  // At rest the pill carries an outline of its own.
  // Any other state has something to say, and says it in the stroke the caller chose.
  if (!selected && !hovered && deletion === "none")
    ctx.strokeStyle = COLORS.BADGE_STROKE;
  ctx.beginPath();
  ctx.roundRect(
    position.x - metrics.width / 2 - 14 / 2,
    position.y - 28 / 2,
    metrics.width + 14,
    28,
    28 / 2,
  );
  ctx.stroke();
  const lastShadowBlur = ctx.shadowBlur;
  const lastShadowColor = ctx.shadowColor;
  ctx.shadowBlur = INTERACTION_SPECS.ICON_HALO_SIZE;
  ctx.shadowColor = COLORS.BACKGROUND;
  ctx.fillStyle = badge_fill(selected);
  ctx.fill();
  ctx.shadowBlur = lastShadowBlur;
  ctx.shadowColor = lastShadowColor;
  ctx.strokeStyle = lastStrokeStyle;
  ctx.fillStyle = ctx.strokeStyle;
  draw_text(ctx, position, text);
}

export function draw_element_icon(
  ctx: CanvasRenderingContext2D,
  position: ScreenPoint,
  element: UnionElement,
  selected = false,
  hovered = false,
  deletion: BadgeDeletion = "none",
) {
  const side = DIM.ICON_SIZE;
  // At rest the box carries an outline of its own.
  // Any other state has something to say, and says it in the stroke the caller chose.
  if (deletion !== "none") ctx.strokeStyle = COLORS.DELETION_BOX;
  else if (!selected && !hovered) ctx.strokeStyle = COLORS.BADGE_STROKE;
  ctx.beginPath();
  ctx.roundRect(
    position.x - side / 2 - 1,
    position.y - side / 2 - 1,
    side + 2,
    side + 2,
    4,
  );
  ctx.stroke();
  const lastShadowBlur = ctx.shadowBlur;
  const lastShadowColor = ctx.shadowColor;
  ctx.shadowBlur = INTERACTION_SPECS.ICON_HALO_SIZE;
  ctx.shadowColor = COLORS.BACKGROUND;
  ctx.fillStyle = badge_fill(selected);
  ctx.fill();

  const iconUrl = get_element_icon(element);
  let img = iconImageCache.get(iconUrl);
  if (!img) {
    img = new Image();
    img.src = iconUrl;
    iconImageCache.set(iconUrl, img);
  }
  if (img.complete) {
    // The tint follows the theme's own palette, not the blend a theme fade passes through, so a fade does not rasterize a silhouette per frame.
    const tint =
      deletion !== "none"
        ? ICON_COLORS.DELETION_STROKE
        : selected
          ? ICON_COLORS.SELECTION_STROKE
          : undefined;
    ctx.drawImage(
      tint ? tinted_icon(img, iconUrl, tint, side) : img,
      position.x - side / 2,
      position.y - side / 2,
      side,
      side,
    );
  }
  ctx.shadowBlur = lastShadowBlur;
  ctx.shadowColor = lastShadowColor;
  if (deletion === "ghost") {
    // Strikes a badge through, corner to corner, in the stroke it is outlined with.
    ctx.beginPath();
    ctx.moveTo(position.x - side / 2, position.y + side / 2);
    ctx.lineTo(position.x + side / 2, position.y - side / 2);
    ctx.stroke();
  }
}

export function draw_text(
  ctx: CanvasRenderingContext2D,
  position: ScreenPoint,
  text: string,
) {
  ctx.fillText(text, position.x, position.y);

  if (ctx.lineWidth > 3) {
    ctx.font = "bold " + TEXT_SPECS.TEXT_FONT;
    ctx.fillText(text, position.x, position.y);
    ctx.font = TEXT_SPECS.TEXT_FONT;
  }
}

// ─── Load element drawing ─────────────────────────────────────────────────────

/** Draws a single force arrow from `base` in direction+magnitude of `vector` (world units). `textLineWidth` lets the value label be emphasized (or not) independently of the arrow, since hovering one part of a load must not light up the other. */
export function draw_force(
  ctx: CanvasRenderingContext2D,
  base: ScreenPoint,
  vector: ScreenPoint,
  value: number,
  hideText: boolean = false,
  kind: QuantityKind,
  textLineWidth?: number,
) {
  const length = vector.length();
  if (length >= 1) {
    draw_arrow_head(
      ctx,
      base.add(vector.extend_length(DIM.ARROW_HEAD_OFFSET)),
      vector.angle() + TAU / 2,
    );
    if (length > DIM.ARROW_HEAD_LENGTH) {
      const s = base.add(vector.with_length(DIM.ARROW_BASE_OFFSET));
      const e = base.add(
        vector.extend_length(DIM.ARROW_HEAD_OFFSET - DIM.ARROW_HEAD_LENGTH),
      );
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(e.x, e.y);
      ctx.stroke();
    }
  }

  if (hideText) return;
  const lastLineWidth = ctx.lineWidth;
  if (textLineWidth !== undefined) ctx.lineWidth = textLineWidth;
  draw_dimension_text(
    ctx,
    force_label_position_screen(base, vector),
    value,
    "",
    kind,
  );
  ctx.lineWidth = lastLineWidth;
}

/** Draws a curved moment arrow (arc with arrowhead) centered at `center`.
 * `value` is signed: positive is clockwise, negative counter-clockwise. */
export function draw_moment(
  ctx: CanvasRenderingContext2D,
  center: ScreenPoint,
  radius: number,
  value: number,
  hideText: boolean = false,
  textLineWidth?: number,
) {
  const clockwise = value >= 0;
  const C = 1 / 16;
  const D = 1 / 32;

  let startAngle = TAU * (clockwise ? C - 0.5 : -C);
  let endAngle = TAU * (clockwise ? -C - D : C - 0.5 + D);
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, startAngle, endAngle, !clockwise);
  ctx.stroke();
  const headAngle = clockwise
    ? endAngle - (1 / 4 - D) * TAU
    : endAngle + (1 / 4 - D) * TAU;
  const tip = center
    .add(Point2.from_polar(radius, endAngle))
    .sub(Point2.from_polar(DIM.ARROW_HEAD_LENGTH, headAngle));
  draw_arrow_head(ctx, tip, headAngle);

  startAngle += TAU / 2;
  endAngle += TAU / 2;
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, startAngle, endAngle, !clockwise);
  ctx.stroke();
  const headAngle2 = clockwise
    ? endAngle - (7 / 32) * TAU
    : endAngle + (7 / 32) * TAU;
  const tip2 = center
    .add(Point2.from_polar(radius, endAngle))
    .add(Point2.from_polar(DIM.ARROW_HEAD_LENGTH, headAngle));
  draw_arrow_head(ctx, tip2, headAngle2);

  if (hideText) return;
  const lastLineWidth = ctx.lineWidth;
  if (textLineWidth !== undefined) ctx.lineWidth = textLineWidth;
  draw_dimension_text(
    ctx,
    moment_value_label_position(center, radius),
    Math.abs(value),
    "",
    MOMENT,
  );
  ctx.lineWidth = lastLineWidth;
}

/**
 * Draws evenly-spaced force arrows along a beam segment, under the crest line joining the two endpoint arrows.
 * The drawing is proportional to the values across the whole span (see `distributed_display_gain`), so that crest line *is* the intensity profile — it is how the load is read, and it doubles as the handle the body drag grabs.
 * `crestLineWidth` emphasizes it on hover without lighting up the arrows.
 */
export function draw_distributed_force(
  ctx: CanvasRenderingContext2D,
  start: ScreenPoint,
  end: ScreenPoint,
  vectorStart: ScreenPoint,
  vectorEnd: ScreenPoint,
  crestLineWidth?: number,
) {
  const lastLineWidth = ctx.lineWidth;
  if (crestLineWidth !== undefined) ctx.lineWidth = crestLineWidth;
  ctx.beginPath();
  const vs = vectorStart.extend_length((2 / 3) * DIM.ARROW_HEAD_OFFSET);
  const ve = vectorEnd.extend_length((2 / 3) * DIM.ARROW_HEAD_OFFSET);
  ctx.moveTo(start.x + vs.x, start.y + vs.y);
  ctx.lineTo(end.x + ve.x, end.y + ve.y);
  ctx.stroke();
  ctx.lineWidth = lastLineWidth;

  for (let i = 1; i < DIM.NB_DISTRIBUTED_FORCE_ARROWS; i++) {
    const t = i / DIM.NB_DISTRIBUTED_FORCE_ARROWS;
    const base = start.lerp(end, t);
    const vector = vectorStart.lerp(vectorEnd, t);
    // A tapered load runs its arrows down to nothing: below a pixel there is no direction left to draw, and below a head length the shaft would point backwards out of `extend_length`.
    const length = vector.length();
    if (length < 1) continue;
    draw_arrow_head(
      ctx,
      base.add(vector.extend_length(DIM.ARROW_HEAD_OFFSET)),
      vector.angle() + TAU / 2,
    );
    if (length <= DIM.ARROW_HEAD_LENGTH) continue;
    const s = base.add(vector.with_length(DIM.ARROW_BASE_OFFSET));
    const e = base.add(
      vector.extend_length(DIM.ARROW_HEAD_OFFSET - DIM.ARROW_HEAD_LENGTH),
    );
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(e.x, e.y);
    ctx.stroke();
  }
}

/** Draws a small probe indicator (circle with crosshair). */
export function draw_probe(
  ctx: CanvasRenderingContext2D,
  position: ScreenPoint,
) {
  ctx.beginPath();
  ctx.arc(position.x, position.y, DIM.PROBE_RADIUS, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(position.x - DIM.PROBE_RADIUS + 1, position.y);
  ctx.lineTo(position.x + DIM.PROBE_RADIUS - 1, position.y);
  ctx.moveTo(position.x, position.y - DIM.PROBE_RADIUS + 1);
  ctx.lineTo(position.x, position.y + DIM.PROBE_RADIUS - 1);
  ctx.stroke();
}

// TODO: move to types/
/** A probed element's recorded path, ready to draw on the canvas. */
export interface TrajectoryDisplay {
  points: WorldPoint[];
  /** Number of points at or before the current playback time. */
  headCount: number;
  /**
   * How much of the path is drawn at all.
   * Equal to `headCount` while the recording is being extended: what lies past the cursor is not a preview of where the motion goes, it is wherever the worker happens to have got to — an amount that changes every frame, and that reads as a flicker running ahead of the point.
   */
  visibleCount: number;
  color: string;
}

/** Draws the trajectory of a probed point: the portion already travelled as a solid line, the rest of the recording (ahead of the cursor) faded. */
export function draw_trajectory(
  ctx: CanvasRenderingContext2D,
  viewport: ViewportState,
  trajectory: TrajectoryDisplay,
  dotted: boolean,
) {
  if (trajectory.points.length < 2) return;
  ctx.save();
  ctx.strokeStyle = trajectory.color;
  ctx.fillStyle = trajectory.color;
  ctx.lineWidth = DIM.TRAJECTORY_LINE_WIDTH;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const step = dotted ? DIM.TRAJECTORY_DOT_STEP : 1;

  const polyline = (from: number, to: number) => {
    if (from > to) return;

    ctx.beginPath();
    if (dotted) {
      for (let i = from; i <= to; i += step) {
        const p = world2screen(trajectory.points[i], viewport);
        ctx.moveTo(p.x + DIM.TRAJECTORY_DOT_RADIUS, p.y);
        ctx.arc(p.x, p.y, DIM.TRAJECTORY_DOT_RADIUS, 0, TAU);
      }
      ctx.fill();
    } else {
      const p0 = world2screen(trajectory.points[from], viewport);
      ctx.moveTo(p0.x, p0.y);
      for (let i = from + 1; i <= to; i++) {
        const pn = world2screen(trajectory.points[i], viewport);
        ctx.lineTo(pn.x, pn.y);
      }
      ctx.stroke();
    }
  };

  if (trajectory.headCount >= 2) {
    ctx.globalAlpha = 0.8;
    polyline(0, trajectory.headCount - 1);
  }
  if (trajectory.headCount < trajectory.visibleCount) {
    ctx.globalAlpha = 0.25;
    let startFuture = Math.max(0, trajectory.headCount - 1);
    if (dotted) {
      const remainder = startFuture % step;
      if (remainder !== 0) startFuture += step - remainder;
    }
    polyline(startFuture, trajectory.visibleCount - 1);
  }
  ctx.restore();
}

// ─── Physics overlay (velocity / reaction force) ───────────────────────────────

/**
 * One physics-overlay arrow (velocity or reaction force), ready to draw — see `element_velocity`/`element_reactions` in `probe-series.ts` for where the vector comes from.
 * Dynamic mode only: neither quantity exists in kinematic mode.
 * A reaction is further split by `ElementReaction.atAnchor`: a support reaction (against the ground) reads differently from an internal one (between two mobile parts), so they get distinct colours rather than folding into one generic "reaction" arrow.
 */
export interface OverlayArrow {
  /** World-space point the arrow is drawn from — the element's own probed point. */
  at: WorldPoint;
  /** World-space vector. Its direction is drawn as-is; its magnitude is remapped through the same log ruler a user-placed load uses (`stored2screen_load`), so an arrow stays legible whatever the underlying unit's typical scale — not calibrated for velocity (mm/s) specifically, a starting point to retune once both are on screen together. */
  vector: WorldPoint;
  kind: PhysicsOverlayKind;
}

/**
 * Screen-space base/tip of an overlay arrow — shared by the draw call and the hit test below, so hovering and drawing always agree on where the arrow actually sits.
 * `undefined` for a magnitude too small to draw at all, same guard `draw_overlay_arrow` applies before it.
 */
function overlay_arrow_screen_geometry(
  viewport: ViewportState,
  arrow: OverlayArrow,
): { base: ScreenPoint; vector: ScreenPoint; tip: ScreenPoint } | undefined {
  const magnitude = arrow.vector.length();
  if (magnitude < 1e-9) return undefined;
  const base = world2screen(arrow.at, viewport);
  const vector = world2screen_vec(arrow.vector, viewport).with_length(
    stored2screen_load(magnitude),
  );
  return { base, vector, tip: base.add(vector) };
}

/** Whether `mouseScreen` sits over `arrow`'s shaft or tip — same tolerance a user-placed force uses in `get-hover.ts`. */
export function overlay_arrow_hit(
  mouseScreen: ScreenPoint,
  viewport: ViewportState,
  arrow: OverlayArrow,
): boolean {
  const geom = overlay_arrow_screen_geometry(viewport, arrow);
  if (!geom) return false;
  return (
    mouseScreen.distance_to(geom.tip) <= HIT_TOLERANCE.NODE ||
    mouseScreen.distance2segment(geom.base, geom.tip) <= HIT_TOLERANCE.EDGE
  );
}

/**
 * Draws one physics-overlay arrow with `draw_force`'s own geometry (arrowhead, shaft), in a colour that marks it as measured rather than authored.
 * Never labelled itself — one recording can show one arrow per element with the overlay on, and a value on each would clutter faster than it would inform, so a value only ever appears for the one under the cursor, via `draw_overlay_arrow_label` below.
 */
export function draw_overlay_arrow(
  ctx: CanvasRenderingContext2D,
  viewport: ViewportState,
  arrow: OverlayArrow,
) {
  const magnitude = arrow.vector.length();
  if (magnitude < 1e-9) return;
  const base = world2screen(arrow.at, viewport);
  const screenVec = world2screen_vec(arrow.vector, viewport).with_length(
    stored2screen_load(magnitude),
  );
  ctx.save();
  ctx.strokeStyle = PHYSICS_OVERLAY_COLOR[arrow.kind];
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = STROKE_WIDTHS.STANDARD;
  draw_force(ctx, base, screenVec, magnitude, true, FORCE);
  ctx.restore();
}

/**
 * Draws only the value label of a hovered overlay arrow, at its own `force_label_position_screen`.
 * Meant to be called once, after every arrow and moment on screen, so the label sits on top and no other arrow can be drawn over it.
 */
export function draw_overlay_arrow_label(
  ctx: CanvasRenderingContext2D,
  viewport: ViewportState,
  arrow: OverlayArrow,
) {
  const geom = overlay_arrow_screen_geometry(viewport, arrow);
  if (!geom) return;
  ctx.save();
  ctx.strokeStyle = PHYSICS_OVERLAY_COLOR[arrow.kind];
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = STROKE_WIDTHS.STANDARD;
  draw_dimension_text(
    ctx,
    force_label_position_screen(geom.base, geom.vector),
    arrow.vector.length(),
    "",
    FORCE,
  );
  ctx.restore();
}

/**
 * A reaction moment, ready to draw — the couple a rigid (non-rotating) weld's two-point force pair reduces to (see `ElementReaction.moment` in `probe-series.ts`).
 * Only ever a support or internal reaction, like `OverlayArrow` minus its "velocity" case: nothing measures an angular velocity today.
 */
export interface OverlayMoment {
  /** World-space point the arc is centred on — the same point its paired force (if any) is drawn from. */
  at: WorldPoint;
  /** N·m, in the DATA MODEL's sign convention (positive = clockwise) — `draw_moment`'s own, the opposite of the solver's raw CCW-positive `ElementReaction.moment`, so this is negated once on the way in, at the one place that reads it (`use-simulation-playback.ts`) — the same flip `load-model.ts` already applies for a user-authored `MomentElement`. */
  torque: number;
  kind: Extract<PhysicsOverlayKind, "reaction-support" | "reaction-internal">;
}

/** Whether `mouseScreen` sits over `moment`'s arc — same tolerance `moment_screen_geometry`'s hit test uses in `get-hover.ts` for a user-placed moment. */
export function overlay_moment_hit(
  mouseScreen: ScreenPoint,
  viewport: ViewportState,
  moment: OverlayMoment,
): boolean {
  if (Math.abs(moment.torque) < 1e-9) return false;
  const center = world2screen(moment.at, viewport);
  const radius = stored2screen_moment(moment.torque);
  const dist = mouseScreen.distance_to(center);
  return (
    dist <= radius + HIT_TOLERANCE.EDGE && dist >= radius - HIT_TOLERANCE.EDGE
  );
}

/**
 * Draws one reaction moment with `draw_moment`'s own geometry (double arc, arrowheads), scaled on its own ruler (`stored2screen_moment`) and coloured like `draw_overlay_arrow`'s matching force so the two read as one reading split across a translation and a rotation.
 * Never labelled itself, same reasoning as `draw_overlay_arrow` — see `draw_overlay_moment_label`.
 */
export function draw_overlay_moment(
  ctx: CanvasRenderingContext2D,
  viewport: ViewportState,
  moment: OverlayMoment,
) {
  if (Math.abs(moment.torque) < 1e-9) return;
  const center = world2screen(moment.at, viewport);
  const radius = stored2screen_moment(moment.torque);
  ctx.save();
  ctx.strokeStyle = PHYSICS_OVERLAY_COLOR[moment.kind];
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = STROKE_WIDTHS.STANDARD;
  draw_moment(ctx, center, radius, moment.torque, true);
  ctx.restore();
}

/**
 * Draws only the value label of a hovered reaction moment, at its own `moment_value_label_position`.
 * Meant to be called once, after every arrow and moment on screen, same reasoning as `draw_overlay_arrow_label`.
 */
export function draw_overlay_moment_label(
  ctx: CanvasRenderingContext2D,
  viewport: ViewportState,
  moment: OverlayMoment,
) {
  if (Math.abs(moment.torque) < 1e-9) return;
  const center = world2screen(moment.at, viewport);
  const radius = stored2screen_moment(moment.torque);
  ctx.save();
  ctx.strokeStyle = PHYSICS_OVERLAY_COLOR[moment.kind];
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = STROKE_WIDTHS.STANDARD;
  draw_dimension_text(
    ctx,
    moment_value_label_position(center, radius),
    Math.abs(moment.torque),
    "",
    MOMENT,
  );
  ctx.restore();
}

// ─── Signed stress fill (normal beam-fill lens only, phase 9) ──────────────────

/** Linear interpolation on `SIGNED_STRESS_RAMP`, `t = stress/scaleMax` clamped to `[-1, 1]` —
 * docs/plan-efforts-interieurs.md phase 9, the `normal` lens' counterpart to `stress_ramp_color`.
 * No danger threshold of its own (no `STRESS_OVERSTRESS_COLOR` equivalent): unlike the utilization ratio, there is no `σ_adm`-style limit to step to.
 * `scaleMax <= 0` (nothing recorded yet) or a non-finite `stress` reads as the ramp's own neutral midpoint.
 * Only `normal` uses this diverging ramp — `bending` has no whole-section traction/compression state to sign (see `magnitude_stress_color`'s own doc), so it reads `STRESS_RAMP` on a plain magnitude instead. */
export function signed_stress_color(stress: number, scaleMax: number): string {
  if (!Number.isFinite(stress) || scaleMax <= 0) {
    const [r, g, b] = SIGNED_STRESS_RAMP[1].rgb;
    return `rgb(${r}, ${g}, ${b})`;
  }
  const t = Math.min(Math.max(stress / scaleMax, -1), 1);
  return interpolate_color_ramp(SIGNED_STRESS_RAMP, t);
}

/**
 * Converts `normal_stress_stops`' raw readings (`cohesion-field.ts`) into the beam's gradient stops.
 * No re-stepping needed here, unlike `beam_fill_stops`: a discontinuity already reaches this function as two stops at the same `offset` — `field.samples`' own "just before/after" pairing (phase 4) — so mapping straight through already draws it as a hard step.
 */
export function signed_stress_fill_stops(
  rawStops: { offset: number; stress: number }[],
  scaleMax: number,
): BeamFillStop[] {
  return rawStops.map((stop) => ({
    offset: stop.offset,
    color: signed_stress_color(stop.stress, scaleMax),
  }));
}

/**
 * The `normal` lens' own legend — screen-anchored bottom-left, same position and geometry as `draw_stress_legend`, a diverging gradient bar reading `SIGNED_STRESS_RAMP` from `-scaleMax` to `+scaleMax`.
 * No DANGER swatch: unlike the utilization ratio, `normal` has no threshold to mark past the bar's own two ends — just the value at each one.
 * `compressionLabel`/ `tensionLabel` name what the colour means: here, unlike `bending`, the sign really is a state of the whole section (pushed or pulled together), so a word earns its place.
 */
export function draw_signed_stress_legend(
  ctx: CanvasRenderingContext2D,
  height: number,
  scaleMax: number,
  compressionLabel: string,
  tensionLabel: string,
  /** Same swatch as `draw_stress_legend`'s: this lens reads the same fields, so it shows the
   * same indicative beams and owes the same explanation. */
  indeterminateLabel?: string,
) {
  const { MARGIN, BAR_WIDTH, BAR_HEIGHT, GAP, FONT } = STRESS_LEGEND;
  const barX = MARGIN;
  const barY = height - MARGIN - BAR_HEIGHT;

  ctx.save();
  ctx.font = FONT;

  const gradient = ctx.createLinearGradient(barX, 0, barX + BAR_WIDTH, 0);
  for (const stop of SIGNED_STRESS_RAMP) {
    const [r, g, b] = stop.rgb;
    // `SIGNED_STRESS_RAMP.t` runs -1…1, a canvas gradient stop 0…1.
    gradient.addColorStop((stop.t + 1) / 2, `rgb(${r}, ${g}, ${b})`);
  }
  ctx.fillStyle = gradient;
  ctx.strokeStyle = COLORS.BADGE_STROKE;
  ctx.lineWidth = 1;

  ctx.fillRect(barX, barY, BAR_WIDTH, BAR_HEIGHT);
  ctx.strokeRect(barX + 0.5, barY + 0.5, BAR_WIDTH - 1, BAR_HEIGHT - 1);

  ctx.textBaseline = "bottom";
  ctx.textAlign = "left";
  draw_graduation_label(
    ctx,
    `${format_quantity(-scaleMax, STRESS, 1)} · ${compressionLabel}`,
    barX,
    barY - GAP,
  );
  ctx.textAlign = "right";
  draw_graduation_label(
    ctx,
    `${format_quantity(scaleMax, STRESS, 1)} · ${tensionLabel}`,
    barX + BAR_WIDTH,
    barY - GAP,
  );

  if (indeterminateLabel !== undefined) {
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    draw_legend_swatch(
      ctx,
      barX + BAR_WIDTH + GAP,
      barY,
      BAR_HEIGHT,
      GAP,
      STRESS_INDETERMINATE_COLOR,
      indeterminateLabel,
    );
  }

  ctx.restore();
}

/** Draws how a redundant constraint yields: a glyph, not a measurement — see `REDUNDANCY_SYMBOL`. `phase` is `performance.now()` in ms; the pulse it drives is a plain sine, so every symbol on screen breathes together whatever mechanism they belong to. */
export function draw_redundancy_symbol(
  ctx: CanvasRenderingContext2D,
  viewport: ViewportState,
  symbol: RedundancySymbol,
  phase: number,
) {
  const S = REDUNDANCY_SYMBOL;
  const pulse = Math.sin((phase / 1000) * (TAU / MODE_ANIMATION.PERIOD_S));

  ctx.save();
  ctx.strokeStyle = COLORS.DELETION_STROKE;
  ctx.fillStyle = COLORS.DELETION_STROKE;
  ctx.lineWidth = STROKE_WIDTHS.STANDARD;
  ctx.lineCap = "round";

  if (symbol.kind === "gap") {
    const a = world2screen(symbol.a, viewport);
    const b = world2screen(symbol.b, viewport);
    const axis = b.sub(a);
    if (axis.length_squared() < 1e-6) {
      ctx.restore();
      return;
    }
    const dir = axis.normalize();
    const perp = dir.perp();
    const mid = a.lerp(b, 0.5);
    // Base offset keeps the two ticks apart even at the pulse's low point, so the gap never fully closes back into a single mark.
    const offset = S.GAP_AMPLITUDE_PX * (0.6 + 0.4 * pulse);
    const p1 = mid.sub(dir.mul(offset));
    const p2 = mid.add(dir.mul(offset));

    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    ctx.setLineDash([]);

    for (const p of [p1, p2]) {
      ctx.beginPath();
      ctx.moveTo(p.x - perp.x * S.GAP_TICK_PX, p.y - perp.y * S.GAP_TICK_PX);
      ctx.lineTo(p.x + perp.x * S.GAP_TICK_PX, p.y + perp.y * S.GAP_TICK_PX);
      ctx.stroke();
    }
  } else if (symbol.kind === "diverge") {
    const vertex = world2screen(symbol.vertex, viewport);
    const dir1 = world2screen_vec(symbol.arm1, viewport).normalize();
    const dir2 = world2screen_vec(symbol.arm2, viewport).normalize();
    const swing = (S.ARM_SWING_DEG * Math.PI) / 180;
    const angle1 = dir1.angle() + swing * pulse;
    const angle2 = dir2.angle() - swing * pulse;

    for (const angle of [angle1, angle2]) {
      const tip = vertex.add(
        Point2.from_angle<"screen">(angle).mul(S.ARM_LENGTH_PX),
      );
      ctx.beginPath();
      ctx.moveTo(vertex.x, vertex.y);
      ctx.lineTo(tip.x, tip.y);
      ctx.stroke();
    }

    // A short arc between the two live directions, so the spread reads as an angle opening rather than as two unrelated ticks.
    ctx.beginPath();
    ctx.arc(vertex.x, vertex.y, S.ARM_ARC_PX, angle1, angle2, angle1 > angle2);
    ctx.stroke();
  } else {
    const at = world2screen(symbol.at, viewport);
    const normal = world2screen_vec(symbol.normal, viewport).normalize();
    const tangent = normal.perp();

    ctx.beginPath();
    ctx.moveTo(
      at.x - tangent.x * S.RAIL_TICK_PX,
      at.y - tangent.y * S.RAIL_TICK_PX,
    );
    ctx.lineTo(
      at.x + tangent.x * S.RAIL_TICK_PX,
      at.y + tangent.y * S.RAIL_TICK_PX,
    );
    ctx.stroke();

    // Rises from the rail to the peak and settles back, never dipping below it: the node is shown coming loose, not oscillating through the rail it is pinned to.
    const lift = S.LIFT_PX * (0.5 + 0.5 * pulse);
    const lifted = at.add(normal.mul(lift));

    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(at.x, at.y);
    ctx.lineTo(lifted.x, lifted.y);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.arc(lifted.x, lifted.y, S.GAP_TICK_PX * 0.6, 0, TAU);
    ctx.fill();
  }

  ctx.restore();
}
