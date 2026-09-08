import { describe, expect, it } from "vitest";
import { Point2 } from "../types/point2";
import {
  clamp_pan,
  clamp_scale,
  screen2world,
  zoom_on_point,
  WORLD_FRAME_HALF_EXTENT,
} from "./viewport";
import { MAX_GRID_SCALE, MIN_GRID_SCALE } from "./grid";

const screen = (x: number, y: number) => new Point2(x, y).as_space<"screen">();

describe("clamp_scale", () => {
  it("leaves a scale inside the grid's zoom range untouched", () => {
    expect(clamp_scale(1)).toBe(1);
  });

  it("floors at the coarsest grid step (10 km)", () => {
    expect(clamp_scale(MIN_GRID_SCALE / 1000)).toBe(MIN_GRID_SCALE);
  });

  it("caps at the finest grid step (1 µm)", () => {
    expect(clamp_scale(MAX_GRID_SCALE * 1000)).toBe(MAX_GRID_SCALE);
  });
});

describe("clamp_pan", () => {
  it("centres the frame once it is narrower than the canvas", () => {
    // 1e-6 px/m: the 1000 km frame is 1 m wide on screen, far short of a 1000×800 canvas.
    const pan = clamp_pan(screen(12345, -6789), 1e-6, 1000, 800);
    expect(pan.x).toBe(500);
    expect(pan.y).toBe(400);
  });

  it("keeps the frame's edge from clearing the canvas edge once it exceeds it", () => {
    // 1 px/m: the 1000 km frame is 1,000,000 px wide, far past a 1000×800 canvas.
    const half = WORLD_FRAME_HALF_EXTENT; // px, at scale 1
    const farRight = clamp_pan(screen(1e9, 0), 1, 1000, 800);
    expect(farRight.x).toBe(half); // left edge pinned to the canvas's own left edge
    const farLeft = clamp_pan(screen(-1e9, 0), 1, 1000, 800);
    expect(farLeft.x).toBe(1000 - half); // right edge pinned to the canvas's own right edge
    const farDown = clamp_pan(screen(0, 1e9), 1, 1000, 800);
    expect(farDown.y).toBe(half);
    const farUp = clamp_pan(screen(0, -1e9), 1, 1000, 800);
    expect(farUp.y).toBe(800 - half);
  });

  it("leaves a pan already inside the frame's slack untouched", () => {
    const pan = clamp_pan(screen(500, 400), 1, 1000, 800);
    expect(pan.x).toBe(500);
    expect(pan.y).toBe(400);
  });
});

describe("zoom_on_point", () => {
  it("keeps the world point under the cursor fixed when the zoom is not clamped", () => {
    const viewport = { pan: screen(500, 400), scale: 1 };
    const point = screen(700, 250);
    const before = screen2world(point, viewport);
    const after = zoom_on_point(-100, point, viewport, 1000, 800);
    const afterWorld = screen2world(point, after);
    expect(afterWorld.x).toBeCloseTo(before.x, 9);
    expect(afterWorld.y).toBeCloseTo(before.y, 9);
  });

  it("stops at the coarsest grid step without drifting the pan further", () => {
    const atMin = { pan: screen(500, 400), scale: MIN_GRID_SCALE };
    const once = zoom_on_point(400, screen(700, 250), atMin, 1000, 800);
    const twice = zoom_on_point(400, screen(700, 250), once, 1000, 800);
    expect(once.scale).toBe(MIN_GRID_SCALE);
    expect(twice.scale).toBe(MIN_GRID_SCALE);
    expect(twice.pan.x).toBe(once.pan.x);
    expect(twice.pan.y).toBe(once.pan.y);
  });

  it("stops at the finest grid step without drifting the pan further", () => {
    const atMax = { pan: screen(500, 400), scale: MAX_GRID_SCALE };
    const once = zoom_on_point(-400, screen(700, 250), atMax, 1000, 800);
    const twice = zoom_on_point(-400, screen(700, 250), once, 1000, 800);
    expect(once.scale).toBe(MAX_GRID_SCALE);
    expect(twice.scale).toBe(MAX_GRID_SCALE);
    expect(twice.pan.x).toBe(once.pan.x);
    expect(twice.pan.y).toBe(once.pan.y);
  });

  it("never leaves the world frame, even zooming in right at its corner", () => {
    const nearCorner = {
      pan: screen(1000 - WORLD_FRAME_HALF_EXTENT, WORLD_FRAME_HALF_EXTENT),
      scale: 1,
    };
    const after = zoom_on_point(-1000, screen(0, 800), nearCorner, 1000, 800);
    // A pan already inside the frame is a fixed point of `clamp_pan`: re-clamping it changes nothing, which is exactly what "still inside the frame" means.
    const reclamped = clamp_pan(after.pan, after.scale, 1000, 800);
    expect(reclamped.x).toBe(after.pan.x);
    expect(reclamped.y).toBe(after.pan.y);
  });
});
