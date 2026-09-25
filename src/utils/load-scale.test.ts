import { describe, expect, it } from "vitest";
import { velocity2screen } from "./load-scale";

describe("velocity2screen", () => {
  // Injected rather than read from the app's ruler: what is checked is how a ruler is applied, not which values it currently holds.
  const ruler = { PX_PER_DIAGONAL_PER_SECOND: 100, MIN_PX: 20, MAX_PX: 200 };

  it("is linear in the speed between the bounds", () => {
    expect(velocity2screen(0.5, 1, ruler)).toBeCloseTo(50);
    expect(velocity2screen(1, 1, ruler)).toBeCloseTo(100);
  });

  it("scales with the mechanism: the same length stands for a speed proportional to its diagonal", () => {
    expect(velocity2screen(0.5, 1, ruler)).toBeCloseTo(
      velocity2screen(5, 10, ruler),
    );
  });

  it("clamps to the ruler's bounds", () => {
    expect(velocity2screen(0.01, 1, ruler)).toBe(20);
    expect(velocity2screen(50, 1, ruler)).toBe(200);
  });

  it("reads a reverse speed as its magnitude", () => {
    expect(velocity2screen(-0.5, 1, ruler)).toBeCloseTo(50);
  });

  it("stays finite on a mechanism with no measurable size", () => {
    expect(Number.isFinite(velocity2screen(1, 0, ruler))).toBe(true);
  });
});
