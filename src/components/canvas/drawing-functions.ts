/**
 * Fonctions de dessin pour les éléments mécaniques
 */

import {
  COLORS,
  ICON_COLORS,
  STROKE_WIDTHS,
  DIM,
  INTERACTION_SPECS,
  TEXT_SPECS,
} from "../../constants/rendering-specs";
import { Point2 } from "../../types/point2";
import { get_element_icon } from "../element-palette/elementIcon";
import {
  ScreenPoint,
  UnionElement,
  ViewportState,
  WorldPoint,
} from "../../types";
import {
  grid_metrics,
  value2ratio,
  world2screen,
  world2screen_vec,
} from "../../utils";
import {
  force_label_position_screen,
  moment_value_label_position,
} from "../../utils/load-geom";
import {
  BeltVia,
  BeltPiece,
  belt_pieces,
  belt_project,
} from "../../utils/belt-path";
import type { SnapFeedback } from "./snap-corridor";

const TAU = 2 * Math.PI;

// Cache pour les images d'icônes préchargées
const iconImageCache = new Map<string, HTMLImageElement>();

/** Flat silhouettes of the icons, one per (source, colour). */
const tintedIconCache = new Map<string, HTMLCanvasElement>();

/** Rendered above the drawn size so the silhouette stays crisp when scaled down. */
const TINT_SUPERSAMPLE = 4;

/**
 * The icon painted over in a single colour, for the states an icon has to read
 * in — selected, about to be deleted.
 *
 * A silhouette rather than a filter over the original: an icon's own hues come
 * from the theme, and any relative operation (brightness, hue-rotate) lands
 * somewhere different in each one — on a pure black or pure grey ink, nowhere at
 * all. Cached, since it costs a rasterization.
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
  tinted.width = side * TINT_SUPERSAMPLE;
  tinted.height = side * TINT_SUPERSAMPLE;
  const tintedCtx = tinted.getContext("2d")!;
  tintedCtx.drawImage(img, 0, 0, tinted.width, tinted.height);
  // Keeps the glyph's shape and drops all of its colours.
  tintedCtx.globalCompositeOperation = "source-in";
  tintedCtx.fillStyle = color;
  tintedCtx.fillRect(0, 0, tinted.width, tinted.height);
  tintedIconCache.set(key, tinted);
  return tinted;
}

/**
 * Opacity of a grid line as the zoom crosses a decade, from its start to its end.
 *
 * Two interlocking ladders — powers of ten, and multiples of five — whose steps are chosen so that a line moving up one level at a decade boundary keeps the opacity it had just before.
 * That is what makes the change of level invisible.
 */
const POWER_ALPHAS = [0, 0.1, 0.3, 0.6];
const FIVE_ALPHAS = [0, 0.25, 0.45];

/** The alpha `COLORS.GRID` stands for: the weight the strongest line reaches. Turn this to make the whole grid heavier or lighter. */
const ALPHA_FULL = 0.4;

/** Below this a line is not worth a path — it lands on the ground's own pixel value. */
const ALPHA_INVISIBLE = 1 / 100;

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
    if (alpha < ALPHA_INVISIBLE) return;
    ctx.globalAlpha = alpha / ALPHA_FULL;
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

  stroke_level(1, 5, between(POWER_ALPHAS[0], POWER_ALPHAS[1]));
  stroke_level(5, 10, between(FIVE_ALPHAS[0], FIVE_ALPHAS[1]));
  stroke_level(10, 50, between(POWER_ALPHAS[1], POWER_ALPHAS[2]));
  stroke_level(50, 100, between(FIVE_ALPHAS[1], FIVE_ALPHAS[2]));
  stroke_level(100, 0, between(POWER_ALPHAS[2], POWER_ALPHAS[3]));

  ctx.globalAlpha = 1;
}

/** How close to the edge an axis that has left the view is held. */
const AXIS_EDGE_MARGIN = 1;

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
    Math.min(Math.max(origin, AXIS_EDGE_MARGIN), extent - AXIS_EDGE_MARGIN);
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

/** Dash pattern of a construction line: fine enough to read as an aid rather than as something drawn. */
const GUIDE_DASH = [12, 8];

/**
 * What a snap took hold of, drawn under the mechanism.
 *
 * One colour and one dash throughout, and neither belongs to the grid: a hold is a different statement from « here is the paper », and drawn in a step of the grid ramp it read as one more grid line — vanishing outright where it fell on an axis. The grid line a point landed on is therefore not darkened in place but overdrawn, in the same dashes as the direction holding it, so every indicator reads as one family.
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

/** Dessine un carré pour les Edges à l'état "PlacingStartX" */
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
  ctx.arc(
    position.x,
    position.y,
    DIM.JOIN_RADIUS - ctx.lineWidth / 2 - 0.5,
    0,
    TAU,
  );

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
  const text = value + " kg";
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

export function draw_beam(
  ctx: CanvasRenderingContext2D,
  start: ScreenPoint,
  end: ScreenPoint,
  isStartJoin: boolean = false,
  isEndJoin: boolean = false,
) {
  const sL = DIM.BEAM_WIDTH - STROKE_WIDTHS.STANDARD + ctx.lineWidth;
  const sideS = DIM.BEAM_WIDTH - STROKE_WIDTHS.STANDARD - ctx.lineWidth;
  const startJ = isStartJoin ? DIM.JOIN_RADIUS + STROKE_WIDTHS.STANDARD + 1 : 0;
  const endJ = isEndJoin ? DIM.JOIN_RADIUS + STROKE_WIDTHS.STANDARD + 1 : 0;
  const oldFillStyle = ctx.fillStyle;

  ctx.save();
  ctx.translate(start.x, start.y);
  ctx.rotate(end.sub(start).angle());
  const length = start.distance_to(end);

  ctx.fillStyle = ctx.strokeStyle;
  ctx.fillRect(-sL / 2 + startJ, -sL / 2, length + sL - endJ - startJ, sL);
  ctx.fillStyle = oldFillStyle;
  ctx.fillRect(-sideS / 2, -sideS / 2, length + sideS, sideS);

  ctx.restore();
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
  const oldGlobalAlpha = ctx.globalAlpha;
  const widthChange = ctx.lineWidth - STROKE_WIDTHS.STANDARD;

  ctx.lineCap = "round";
  ctx.lineWidth = STROKE_WIDTHS.SPIRE + widthChange;
  ctx.globalAlpha *= DIM.SPRING_BACK_COIL_OPACITY;
  for (let i = 1; i <= coilNb - 1; i++) {
    ctx.beginPath();
    ctx.moveTo(deca(i, 0.25), DIM.SPRING_COIL_RADIUS);
    ctx.lineTo(deca(i, 0.75), -DIM.SPRING_COIL_RADIUS);
    ctx.stroke();
  }
  ctx.globalAlpha = oldGlobalAlpha;

  // Barre de fond
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

  // Spires en premier-plan
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
 * How far down its travel the piston sits, as a fraction, for a damper stretched
 * to `stretch` times its rest length: half way at rest, sliding back toward the
 * cylinder's mouth as the damper extends.
 *
 * One function of the stretch, normalised on its own value at rest, so edition —
 * which *is* rest — and simulation cannot disagree. Two separate expressions
 * would have to be kept equal at `stretch === 1` by hand, and a mismatch there
 * jumps the piston the instant the simulation starts, with nothing having moved.
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
  // No rest length to compare against means edition, where the damper is drawn
  // at its natural length by definition.
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

  // Barre centrale
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

/**
 * The arc the rotation-direction arrow rides on, shared with the hit-test so
 * a click only lands where the arrow is actually drawn.
 */
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

/**
 * `hovered` fills the body at 80% opacity instead of the usual half. The belt
 * arc rides on the very circle the outline draws, so the outline alone cannot
 * carry the hover: the body does.
 */
export function draw_gear(
  ctx: CanvasRenderingContext2D,
  position: ScreenPoint,
  radius: number,
  angle: number,
  hovered = false,
) {
  // if (radius < DIM.MIN_GEAR_RADIUS) radius = DIM.MIN_GEAR_RADIUS; // TODO : afficher en grisé ?

  //const teethCount = Math.floor(radius * 0.5);
  const r1 = (radius + DIM.PIVOT_OUTER_RADIUS) / 2;
  const r2 = Math.max(1, (radius - DIM.PIVOT_OUTER_RADIUS) / 3);
  const holesNb = 3;

  // Corps principal de l'engrenage
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

  // Dessine les dents
  /*
  for (let i = 0; i < teethCount; i++) {
    const angle = (i / teethCount) * TAU;
    const x1 = Math.cos(angle) * radius;
    const y1 = Math.sin(angle) * radius;
    const x2 = Math.cos(angle) * (radius + DIM.GEAR_TEETH_SIZE);
    const y2 = Math.sin(angle) * (radius + DIM.GEAR_TEETH_SIZE);

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  */
}

/**
 * Winding of one belt arc: the belt climbs `growth` px total across the wrap
 * (one BELT_WIDTH per turn) so surplus turns read as a coil, not a retraced
 * circle. Applied at the arrival end (`atStart`) or the departure end; the other
 * end stays on the rim. `growth` > 0 grows outward (the free run leaves from the
 * top layer), < 0 inward (winch: keep the free run on the rim so it doesn't lean).
 */
export type BeltWinding = { growth: number; atStart: boolean };

/**
 * Radii at the arrival / departure ends of an arc given its optional winding.
 * The grown end is kept ≥ 1px so an inward (winch) coil deep enough to reach the
 * centre never flips across it.
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
 * Append a belt arc to the current path as a polyline from `rStart` (at its
 * arrival angle) to `rEnd` (at its departure angle), the radius interpolated
 * across the swept wrap. rStart === rEnd → a plain circular arc; differing radii
 * → a coil (spiral) that reaches both tangent runs — a belt wound past a full
 * turn. The straight run into the arc is the implicit line from the current
 * point to the first sampled point.
 */
function append_belt_arc(
  ctx: CanvasRenderingContext2D,
  arc: BeltPiece<"screen">,
  rStart: number,
  rEnd: number,
) {
  if (arc.kind !== "arc") return [0, 0];
  const sign = arc.direction ? -1 : 1;
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
 * Draw a loose (open) belt from its ordered geometric pieces: the tangent runs
 * from the start terminal, the gear arcs, and the run to the end terminal, plus
 * the two end dots. `wraps` (continuous per-via wrap, simulation) sizes each arc
 * so a pulley losing contact (wrap → 0) is drawn straight-past; `windings`
 * (per via) turns a wound pulley's arc into a coil (see `draw_belt_loop`).
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
 * Draw a closed belt as a continuous closed loop around its pulleys (the gN→g0
 * closure included), with no free ends.
 *
 * `wraps` (continuous per-via wrap, simulation) sizes each arc so a pulley
 * losing contact (wrap → 0) is drawn straight-past. `windings` (per via) draws a
 * pulley wound past a full turn as a coil whose ends reach both tangent runs,
 * instead of the surplus retracing the same circle.
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

  // Straight tangent runs are the implicit lines between consecutive arcs (each
  // arc's first sampled point); closePath() adds the final closure run.
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

  if (!hideText) draw_dimension_text(ctx, position, value);
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

  if (!hideText) draw_dimension_text(ctx, position, value);
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

  // TODO : add arc to position
  // TODO : add straight lines

  if (!hideText) draw_dimension_text(ctx, position, value, " °");
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

  if (!hideText) draw_dimension_text(ctx, position, value);
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

  if (!hideText) draw_dimension_text(ctx, position, value);
}

/**
 * How a badge shows that it is on its way out: under the eraser, or as the
 * tombstone of a constraint an undo/redo has just removed.
 */
export type BadgeDeletion = "none" | "erasing" | "ghost";

/** The fill of a badge laid over the drawing — a ratio pill, a constraint icon box. */
function badge_fill(isSelected: boolean): string {
  return (
    (isSelected ? COLORS.BADGE_FILL_SELECTED : COLORS.BADGE_FILL) +
    COLORS.ICON_TRANSPARENCY
  );
}

export function draw_dimension_text(
  ctx: CanvasRenderingContext2D,
  position: ScreenPoint,
  value: number,
  extension: string = "",
) {
  ctx.font = TEXT_SPECS.TEXT_FONT;
  ctx.textAlign = TEXT_SPECS.TEXT_ALIGN;
  ctx.textBaseline = TEXT_SPECS.TEXT_BASELINE;
  const text = (Math.round(value * 10) / 10).toString() + extension;
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
  // At rest the pill carries an outline of its own. Any other state has
  // something to say, and says it in the stroke the caller chose.
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
  // At rest the box carries an outline of its own. Any other state has something
  // to say, and says it in the stroke the caller chose.
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
    // The tint follows the theme's own palette, not the blend a theme fade
    // passes through, so a fade does not rasterize a silhouette per frame.
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

/** Draws a single force arrow from `base` in direction+magnitude of `vector` (world units).
 *  `textLineWidth` lets the value label be emphasized (or not) independently of
 *  the arrow, since hovering one part of a load must not light up the other.
 *  `labelVector` places the value elsewhere than along the arrow — a tapered
 *  distributed load has ends with no arrow left to hang their "0" on. */
export function draw_force(
  ctx: CanvasRenderingContext2D,
  base: ScreenPoint,
  vector: ScreenPoint,
  value: number,
  hideText: boolean = false,
  extension: string,
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
    extension,
  );
  ctx.lineWidth = lastLineWidth;
}

/** Draws a curved moment arrow (arc with arrowhead) centered at `center`.
 *  `value` is signed: positive is clockwise, negative counter-clockwise. */
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
    " Nm",
  );
  ctx.lineWidth = lastLineWidth;
}

/** Draws evenly-spaced force arrows along a beam segment, under the crest line
 *  joining the two endpoint arrows. The drawing is proportional to the values
 *  across the whole span (see `distributed_display_gain`), so that crest line
 *  *is* the intensity profile — it is how the load is read, and it doubles as
 *  the handle the body drag grabs. `crestLineWidth` emphasizes it on hover
 *  without lighting up the arrows. */
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
    // A tapered load runs its arrows down to nothing: below a pixel there is
    // no direction left to draw, and below a head length the shaft would
    // point backwards out of `extend_length`.
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

/** Draws a small probe indicator (circle with crosshair). `hovered` thickens it,
 *  `deleting` marks it as going with the element that carries it. */
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

// TODO : move in "types/..."
/** A probed element's recorded path, ready to draw on the canvas. */
export interface TrajectoryDisplay {
  points: WorldPoint[];
  /** Number of points at or before the current playback time. */
  headCount: number;
  /**
   * How much of the path is drawn at all. Equal to `headCount` while the recording is being
   * extended: what lies past the cursor is not a preview of where the motion goes, it is
   * wherever the worker happens to have got to — an amount that changes every frame, and
   * that reads as a flicker running ahead of the point.
   */
  visibleCount: number;
  color: string;
}

/** Draws the trajectory of a probed point: the portion already travelled as a
 *  solid line, the rest of the recording (ahead of the cursor) faded. */
export function draw_trajectory(
  ctx: CanvasRenderingContext2D,
  viewport: ViewportState,
  trajectory: TrajectoryDisplay,
  dotted: boolean,
) {
  if (trajectory.points.length < 2) return;
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
      // POINTILLÉ
      for (let i = from; i <= to; i += step) {
        const p = world2screen(trajectory.points[i], viewport);
        ctx.moveTo(p.x + DIM.TRAJECTORY_DOT_RADIUS, p.y);
        ctx.arc(p.x, p.y, DIM.TRAJECTORY_DOT_RADIUS, 0, TAU);
      }
      ctx.fill();
    } else {
      // COURBE
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
}
