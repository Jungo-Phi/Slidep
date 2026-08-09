import { describe, expect, it } from "vitest";
import { Point2, ZERO } from "./point2";

const finite = (p: Point2) => Number.isFinite(p.x) && Number.isFinite(p.y);

describe("Point2 on a degenerate segment", () => {
  const P = new Point2(3, 4);
  const A = new Point2(-100, 50);
  const B = new Point2(-100, 50);

  it("gives finite local coordinates rather than dividing by zero", () => {
    expect(P.parameter_on_segment(A, B)).toBe(0);
    expect(P.to_segment_coordinates(A, B)).toEqual(new Point2(0, 0));
    expect(P.to_double_segment_coordinates(A, B, A, B)).toEqual(
      new Point2(0, 0),
    );
  });

  it("gives a finite point back when the local frame is rebuilt", () => {
    const local = P.to_segment_coordinates(A, B);
    expect(finite(local.from_segment_coordinates(A, B))).toBe(true);
    expect(finite(local.from_double_segment_coordinates(A, B, A, B)!)).toBe(
      true,
    );
  });

  it("tolerates a segment that is short rather than exactly null", () => {
    const near = new Point2(-100, 50 + 1e-12);
    expect(finite(P.to_segment_coordinates(A, near))).toBe(true);
  });

  // Callers do mutate what they get back, so a shared constant must never leak.
  it("returns a fresh point, not the shared ZERO", () => {
    expect(P.to_segment_coordinates(A, B)).not.toBe(ZERO);
    expect(new Point2(1, 1).div(0)).not.toBe(ZERO);
    expect(new Point2(0, 0).normalize()).not.toBe(ZERO);
    expect(ZERO).toEqual(new Point2(0, 0));
  });
});
