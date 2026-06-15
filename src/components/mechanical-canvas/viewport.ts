import { ScreenPoint, ViewportState, WorldPoint } from "../../types";

export function screen_to_world(
  screenPos: ScreenPoint,
  viewport: ViewportState,
): WorldPoint {
  return screenPos.sub(viewport.pan).div(viewport.zoom);
}

export function world_to_screen(
  worldPos: WorldPoint,
  viewport: ViewportState,
): ScreenPoint {
  return worldPos.mul(viewport.zoom).add(viewport.pan);
}
