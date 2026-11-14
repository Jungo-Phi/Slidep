import { describe, expect, it } from "vitest";
import { scale_precision, snapped_scale } from "./transform-gizmo";

describe("snapped_scale", () => {
  it.each([
    [0.0113, 0.01],
    [0.0137, 0.015],
    [0.031, 0.03],
    [0.098, 0.1],
    [0.17, 0.15],
    [0.22, 0.2],
    [0.33, 0.3],
    [1.04, 1],
    [2.43, 2.4],
    [2.7, 2.5],
    [3.3, 3.5],
    [9.8, 10],
    [12.4, 12],
    [27, 25],
    [33, 35],
    [140, 140],
    [260, 250],
  ])("snaps %f to %f", (scale, expected) => {
    expect(snapped_scale(scale)).toBe(expected);
  });
});

describe("scale_precision", () => {
  it("keeps two decimals, and two significant digits for a smaller factor", () => {
    expect(scale_precision(1.5)).toBe(2);
    expect(scale_precision(0.15)).toBe(2);
    expect(scale_precision(0.015)).toBe(3);
    expect(scale_precision(0.0015)).toBe(4);
  });
});
