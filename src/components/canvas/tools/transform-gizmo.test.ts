import { describe, expect, it } from "vitest";
import { Point2 } from "../../../types/point2";
import type { ID, ViewportState } from "../../../types";
import type { CanvasState } from "../../../types/canvas-state";
import { world2screen } from "../../../utils";
import {
  dragged_angle,
  dragged_scale,
  gizmo_sizes,
  resumed_transform,
  scale_precision,
  snapped_scale,
} from "./transform-gizmo";

describe("resumed_transform", () => {
  const viewport: ViewportState = { scale: 10, pan: new Point2<"screen">(300, 300) };
  const pivot = new Point2<"world">(0, 0);
  const editing = (kind: "rotate" | "scale", value: number): CanvasState => ({
    type: "EditingSelectionTransform",
    elementIDs: ["a-b-c-d-e" as ID],
    kind,
    pivot,
    value,
  });
  const screenPivot = world2screen(pivot, viewport);
  const { RING, HANDLE_GAP, HANDLE_LENGTH } = gizmo_sizes();
  /** The middle of the scale handle, pushed out to a circle of `radius`. */
  const on_scale_handle = (radius: number) =>
    screenPivot.add(
      new Point2<"screen">(Math.SQRT1_2, Math.SQRT1_2).mul(
        radius + HANDLE_GAP + HANDLE_LENGTH / 2,
      ),
    );

  it("takes the ring up again from the box's value", () => {
    const resumed = resumed_transform(
      editing("rotate", 0.3),
      screenPivot.add(new Point2<"screen">(RING, 0)),
      viewport,
      null,
    );
    expect(resumed).toMatchObject({ type: "TransformingSelection", start: 0.3, value: 0.3 });
  });

  it("finds the scale handle where the scale pushed it, and goes on from a typed value", () => {
    const state = editing("scale", 2);
    expect(resumed_transform(state, on_scale_handle(RING), viewport, null)).toBeUndefined();
    expect(resumed_transform(state, on_scale_handle(RING * 2), viewport, null)).toMatchObject({
      start: 2,
    });
    expect(resumed_transform(state, on_scale_handle(RING * 3), viewport, 3)).toMatchObject({
      start: 3,
    });
  });

  it("ignores the other handle and empty space", () => {
    expect(
      resumed_transform(editing("scale", 1), screenPivot.add(new Point2<"screen">(RING, 0)), viewport, null),
    ).toBeUndefined();
    expect(
      resumed_transform(editing("rotate", 0), on_scale_handle(RING), viewport, null),
    ).toBeUndefined();
  });

  it("goes on from the start value", () => {
    const from = new Point2<"world">(1, 1);
    expect(dragged_scale(pivot, from, from, viewport, 2, false)).toBe(2);
    expect(dragged_angle(pivot, from, from, 0.3, false)).toBeCloseTo(0.3);
  });
});

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
