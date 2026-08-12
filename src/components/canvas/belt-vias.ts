import { GearElement, ScreenPoint, ViewportState, WorldPoint } from "../../types";
import { BeltVia, belt_project } from "../../utils/belt-path";
import { world2screen, world2screen_length } from "../../utils";
import { draw_belt_end, draw_hover_circle } from "./drawing-functions";

/**
 * A belt's vias in screen space.
 *
 * `clockwise` is flipped along with the coordinates: it is the wrap sense, read
 * by `belt_pieces` as the `counterClockwise` flag of `ctx.arc`, and the y flip of
 * `world2screen` reverses every sense of rotation. Mirroring the positions alone
 * does not give a mirrored path — it gives a different belt, tangent to the
 * wrong side of each pulley.
 */
export function screen_vias(
  vias: BeltVia[],
  viewport: ViewportState,
): BeltVia<"screen">[] {
  return vias.map(({ pos, radius, clockwise }) => ({
    pos: world2screen(pos, viewport),
    radius: world2screen_length(radius, viewport),
    clockwise: !clockwise,
  }));
}

/** The vias of a belt drawn around `attachedGears`, terminals included. */
export function open_belt_vias(
  start: WorldPoint,
  attachedGears: { gear: GearElement; clockwise: boolean }[],
  end: WorldPoint,
): BeltVia[] {
  return [
    { pos: start, radius: 0, clockwise: false },
    ...attachedGears.map(({ gear, clockwise }) => ({
      pos: gear.position,
      radius: gear.radius,
      clockwise,
    })),
    { pos: end, radius: 0, clockwise: false },
  ];
}

/**
 * Marks of a closing gesture: the junction the loop will carry, and the terminal
 * the cursor aims at. The junction is shown on the loop whatever the click does
 * with it — mint a join there, or reuse the node a terminal already holds, which
 * `BeltJunction` then seats on the loop all the same.
 */
export function draw_belt_closure_marks(
  ctx: CanvasRenderingContext2D,
  loopVias: BeltVia<"screen">[],
  cursor: ScreenPoint,
  withHandle: boolean,
) {
  const junction = belt_project(loopVias, cursor, true).point;
  draw_belt_end(ctx, junction);
  if (!withHandle) return;
  draw_hover_circle(ctx, cursor);
}
