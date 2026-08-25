import { Point2, ScreenPoint, ViewportState, WorldPoint, ZERO } from "../types";
import { Bounds } from "./mechanism-bounds";
import { MAX_GRID_SCALE, MIN_GRID_SCALE } from "./grid";

const VIEWPORT_ZOOM_SENSITIVITY = 400; // Nombre de "crans" de molette nécessaires pour multiplier le zoom par 2

/** Half-side of the square the viewport may pan within: a 1000 km world. */
export const WORLD_FRAME_HALF_EXTENT = 500_000;

export function clamp_scale(scale: number): number {
  return Math.min(MAX_GRID_SCALE, Math.max(MIN_GRID_SCALE, scale));
}

/**
 * Keeps one screen axis from panning the world frame's edge past the canvas's own — the
 * mechanism stays reachable, never scrolled off into empty space it cannot be brought back
 * from. Symmetric in `pan` because the frame is centred on the world origin: `x` and `y`
 * (mirrored or not) clamp the same way.
 *
 * Once the frame is narrower than the canvas — zoomed out enough that the whole 1000 km
 * square fits with room to spare — there is no useful position to pan to inside that slack,
 * so it is centred instead of left wherever the last unclamped pan happened to leave it.
 */
function clamp_axis(pan: number, scale: number, viewportSize: number): number {
  const frameSize = 2 * WORLD_FRAME_HALF_EXTENT * scale;
  if (frameSize <= viewportSize) return viewportSize / 2;
  const half = WORLD_FRAME_HALF_EXTENT * scale;
  return Math.min(half, Math.max(viewportSize - half, pan));
}

/** `pan`, kept inside the world frame at `scale` for a `width` × `height` canvas. */
export function clamp_pan(
  pan: ScreenPoint,
  scale: number,
  width: number,
  height: number,
): ScreenPoint {
  return new Point2(
    clamp_axis(pan.x, scale, width),
    clamp_axis(pan.y, scale, height),
  ).as_space<"screen">();
}

export function screen2world(
  screenPos: ScreenPoint,
  viewport: ViewportState,
): WorldPoint {
  return screenPos
    .sub(viewport.pan)
    .div(viewport.scale)
    .mirrorY()
    .as_space<"world">();
}
export function world2screen(
  worldPos: WorldPoint,
  viewport: ViewportState,
): ScreenPoint {
  return worldPos
    .mirrorY()
    .mul(viewport.scale)
    .as_space<"screen">()
    .add(viewport.pan);
}

export function screen2world_vec(
  screenVec: ScreenPoint,
  viewport: ViewportState,
): WorldPoint {
  return screenVec.div(viewport.scale).mirrorY().as_space<"world">();
}
export function world2screen_vec(
  worldVec: WorldPoint,
  viewport: ViewportState,
): ScreenPoint {
  return worldVec.mirrorY().mul(viewport.scale).as_space<"screen">();
}

/** A length (a distance, a radius, a hit tolerance) from world to screen px. */
export function world2screen_length(
  worldLength: number,
  viewport: ViewportState,
): number {
  return worldLength * viewport.scale;
}

/** Inverse of `world2screen_length`. */
export function screen2world_length(
  screenLength: number,
  viewport: ViewportState,
): number {
  return screenLength / viewport.scale;
}

/**
 * An angle from world to screen. The y flip reverses the sense of rotation, so a world angle θ is drawn at −θ, and what turns counter-clockwise in world turns clockwise on screen.
 *
 * Its own inverse, hence the single function.
 */
export function world2screen_angle(angle: number): number {
  return -angle;
}

/** The wheel delta that takes a viewport from `fromScale` to `toScale`, so a control aiming
 *  at an exact scale goes through the same path as a gesture. */
export function zoom_delta_to(fromScale: number, toScale: number): number {
  return -VIEWPORT_ZOOM_SENSITIVITY * Math.log2(toScale / fromScale);
}

/**
 * Zooms on `point`, clamped to the grid's own zoom range and the world frame.
 *
 * The scale is clamped first, and the pan that keeps `point` fixed is computed from that
 * clamped scale rather than the raw one — so a scroll that would overshoot a bound instead
 * eases to a stop at it: the ratio `clampedScale / oldScale` is 1 right at the bound, which
 * leaves `pan` exactly where it was, rather than snapping to a value consistent with a scale
 * the viewport never actually reached.
 */
export function zoom_on_point(
  deltaY: number,
  point: ScreenPoint,
  viewport: ViewportState,
  width: number,
  height: number,
): ViewportState {
  const scale = clamp_scale(
    viewport.scale * 2 ** (-deltaY / VIEWPORT_ZOOM_SENSITIVITY),
  );
  const pan = point.sub(point.sub(viewport.pan).mul(scale / viewport.scale));
  return { pan: clamp_pan(pan, scale, width, height), scale };
}

export interface FitViewportOptions {
  ratioMarginX?: number;
  ratioMarginY?: number;
  defaultZoom: number;
}

/**
 * Zoom and pan framing `bounds` inside a `width` × `height` viewport.
 *
 * No margin beyond `ratioMargin` is added around the content: a fixed
 * world-unit margin would swamp a small mechanism, shrinking it toward the
 * middle of the frame instead of filling it.
 */
export function fit_viewport_to_bounds(
  bounds: Bounds | undefined,
  width: number,
  height: number,
  { ratioMarginX = 0.08, ratioMarginY = 0.12, defaultZoom }: FitViewportOptions,
): ViewportState {
  const center: ScreenPoint = new Point2(width / 2, height / 2);
  if (!bounds) return { scale: defaultZoom, pan: center };

  const contentWidth = bounds.max.x - bounds.min.x;
  const contentHeight = bounds.max.y - bounds.min.y;
  const innerWidth = width * (1 - 2 * ratioMarginX);
  const innerHeight = height * (1 - 2 * ratioMarginY);
  const fitScale = Math.min(
    innerWidth / contentWidth,
    innerHeight / contentHeight,
  );
  const scale = Number.isFinite(fitScale) ? fitScale : defaultZoom;

  // The pan that lands the content's centre on the viewport's centre. `world2screen`
  // flips y on the way, so what has to be cancelled is the flipped offset.
  const contentCenter = bounds.min.lerp(bounds.max, 0.5);
  return {
    scale,
    pan: center.sub(world2screen_vec(contentCenter, { scale, pan: ZERO })),
  };
}
