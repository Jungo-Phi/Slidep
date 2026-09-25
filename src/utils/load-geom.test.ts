import { describe, expect, it } from "vitest";
import { HIT_TOLERANCE } from "../constants/interaction-specs";
import { Point2 } from "../types";
import type { ScreenPoint } from "../types";
import { arrow_hit } from "./load-geom";

const P = (x: number, y: number): ScreenPoint => new Point2<"screen">(x, y);

describe("arrow_hit", () => {
  const base = P(0, 0);
  const tip = P(200, 0);

  it("hits along the shaft, past what the base claims", () => {
    expect(arrow_hit(P(100, 0), base, tip)).toBe(true);
    expect(arrow_hit(P(100, HIT_TOLERANCE.EDGE - 1), base, tip)).toBe(true);
    expect(arrow_hit(P(100, HIT_TOLERANCE.EDGE + 1), base, tip)).toBe(false);
  });

  it("hits the tip handle", () => {
    expect(arrow_hit(P(200, HIT_TOLERANCE.NODE - 1), base, tip)).toBe(true);
  });

  it("leaves the disc a node claims around the base to the node", () => {
    expect(arrow_hit(P(HIT_TOLERANCE.NODE - 1, 0), base, tip)).toBe(false);
    expect(arrow_hit(P(HIT_TOLERANCE.NODE + 1, 0), base, tip)).toBe(true);
  });

  it("does not let a vanished arrow claim its base through its tip", () => {
    expect(arrow_hit(P(1, 0), base, base)).toBe(false);
  });
});
