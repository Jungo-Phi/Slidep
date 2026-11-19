import { describe, expect, it } from "vitest";
import { Point2, ViewportState } from "../../../types";
import { arrow_step, in_reading_order, next_stop } from "./keyboard-canvas";

const VIEWPORT: ViewportState = { scale: 100, pan: new Point2<"screen">(0, 0) };

describe("next_stop", () => {
  it("starts at an end and walks to the other, then lets the focus go", () => {
    expect(next_stop(3, -1, false)).toBe(0);
    expect(next_stop(3, -1, true)).toBe(2);
    expect(next_stop(3, 0, false)).toBe(1);
    expect(next_stop(3, 2, false)).toBeUndefined();
    expect(next_stop(3, 0, true)).toBeUndefined();
    expect(next_stop(0, -1, false)).toBeUndefined();
  });
});

describe("in_reading_order", () => {
  it("reads the top of the screen first, then left to right along a line", () => {
    // The world's y points up, so the highest point is read first.
    const points = [
      new Point2<"world">(2, 0),
      new Point2<"world">(0, 0),
      new Point2<"world">(5, 1),
    ];
    expect(in_reading_order(points, (point) => point, VIEWPORT)).toEqual([
      points[2],
      points[1],
      points[0],
    ]);
  });
});

describe("arrow_step", () => {
  it("moves up the screen for the up arrow, five times as far with Shift", () => {
    const up = arrow_step("ArrowUp", VIEWPORT, false);
    expect(up.x).toBeCloseTo(0);
    expect(up.y).toBeGreaterThan(0);
    const far = arrow_step("ArrowUp", VIEWPORT, true);
    expect(far.y).toBeCloseTo(up.y * 5);
  });
});
