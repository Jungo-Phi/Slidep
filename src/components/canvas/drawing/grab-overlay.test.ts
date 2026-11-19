import { describe, expect, it } from "vitest";
import { overlay_arrow_hit, type OverlayArrow } from "./drawing-functions";
import { Point2 } from "../../../types/point2";
import type { ID, ScreenPoint, ViewportState, WorldPoint } from "../../../types";

const VIEWPORT: ViewportState = { scale: 1, pan: new Point2<"screen">(0, 0) };

/** A grab pulling rightwards from the origin, its spring stretched upwards: the spring and the force point different ways, as they do whenever the grabbed point lags. */
const GRAB: OverlayArrow = {
  at: new Point2(0, 0) as WorldPoint,
  vector: new Point2(100, 0) as WorldPoint,
  kind: "grab",
  id: "grab",
  elementID: "node" as ID,
  springTo: new Point2(0, 200) as WorldPoint,
};

/** The point `fraction` of the way from the origin to `world` on screen, where the y axis points down. */
const along = (world: WorldPoint, fraction = 0.5): ScreenPoint =>
  new Point2<"screen">(world.x * fraction, -world.y * fraction);

describe("the grab's overlay", () => {
  it("is reached through its spring", () => {
    expect(overlay_arrow_hit(along(GRAB.springTo!), VIEWPORT, GRAB)).toBe(true);
  });

  it("takes no hover on its force arrow while that one is not drawn", () => {
    const onArrow = new Point2<"screen">(20, 0);
    expect(overlay_arrow_hit(onArrow, VIEWPORT, GRAB)).toBe(false);
    expect(overlay_arrow_hit(onArrow, VIEWPORT, GRAB, true)).toBe(true);
  });
});
