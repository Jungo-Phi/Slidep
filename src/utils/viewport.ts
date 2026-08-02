import { ScreenPoint, ViewportState, WorldPoint } from "../types";

const VIEWPORT_ZOOM_SENSITIVITY = 400; // Nombre de "crans" de molette nécessaires pour multiplier le zoom par 2

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

export function zoom_on_point(
  deltaY: number,
  point: ScreenPoint,
  viewport: ViewportState,
): ViewportState {
  const scale = viewport.scale * 2 ** (-deltaY / VIEWPORT_ZOOM_SENSITIVITY);
  const pan = point.sub(point.sub(viewport.pan).mul(scale / viewport.scale));
  return { pan, scale };
}
