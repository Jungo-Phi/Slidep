import { describe, it, expect } from "vitest";
import { gear_inertia, gear_mass, surface_mass_for_inertia } from "./gear-mass";

describe("gear mass properties", () => {
  it("is a solid disk: J = ½mr²", () => {
    const surfaceMass = 12;
    const radius = 0.08;
    const mass = gear_mass(surfaceMass, radius);
    expect(mass).toBeCloseTo(surfaceMass * Math.PI * radius * radius, 12);
    expect(gear_inertia(surfaceMass, radius)).toBeCloseTo(0.5 * mass * radius * radius, 12);
  });

  it("round-trips a surface mass through the inertia the panel edits", () => {
    for (const radius of [0.005, 0.05, 0.5]) {
      const surfaceMass = 78.5;
      const back = surface_mass_for_inertia(gear_inertia(surfaceMass, radius), radius);
      expect(back).toBeCloseTo(surfaceMass, 9);
    }
  });

  it("answers 0 for a degenerate radius rather than dividing by zero", () => {
    expect(surface_mass_for_inertia(1, 0)).toBe(0);
  });
});
