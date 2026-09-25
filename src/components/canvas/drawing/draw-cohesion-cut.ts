import { COHESION_DIAGRAM_COLOR } from "../../../constants/physics-display-specs";
import { STROKE_WIDTHS } from "../../../constants/rendering-specs";
import { ViewportState, WorldPoint } from "../../../types";
import { world2screen, world2screen_vec } from "../../../utils";
import { is_zero_load, stored2screen_load, stored2screen_moment } from "../../../utils/load-scale";
import { FORCE } from "../../../utils/quantity-format";
import type { CohesionSample } from "../../solver/recording/cohesion-field";
import { draw_force, draw_moment } from "./drawing-functions";

/**
 * The internal torsor of a beam at one cut, drawn where the cut is: `N` along the beam, `T` across it, `Mf` as a couple, each in its diagram's own colour.
 * What is drawn is the action of the downstream part on the upstream one (`CohesionField`'s own convention), so a positive `N` points along `axis` and a positive `T` a quarter turn from it.
 * `axis` is the beam's unit direction, start to end.
 * Sized on the loads' rulers, so a reading and a load of the same value are the same length.
 */
export function draw_cohesion_cut(
  ctx: CanvasRenderingContext2D,
  viewport: ViewportState,
  at: WorldPoint,
  axis: WorldPoint,
  sample: CohesionSample,
) {
  const base = world2screen(at, viewport);
  ctx.save();
  ctx.shadowBlur = 0;
  ctx.lineWidth = STROKE_WIDTHS.HOVERED;

  const force = (value: number, direction: WorldPoint, color: string) => {
    if (is_zero_load(value)) return;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    draw_force(
      ctx,
      base,
      world2screen_vec(direction.mul(Math.sign(value)), viewport).with_length(
        stored2screen_load(value),
      ),
      Math.abs(value),
      false,
      FORCE,
      STROKE_WIDTHS.STANDARD,
    );
  };
  force(sample.N, axis, COHESION_DIAGRAM_COLOR.N);
  force(sample.T, axis.perp(), COHESION_DIAGRAM_COLOR.T);

  if (!is_zero_load(sample.Mf)) {
    ctx.strokeStyle = COHESION_DIAGRAM_COLOR.Mf;
    ctx.fillStyle = COHESION_DIAGRAM_COLOR.Mf;
    // `Mf` is counter-clockwise positive, `draw_moment`'s value clockwise positive.
    draw_moment(
      ctx,
      base,
      stored2screen_moment(sample.Mf),
      -sample.Mf,
      false,
      STROKE_WIDTHS.STANDARD,
    );
  }
  ctx.restore();
}
