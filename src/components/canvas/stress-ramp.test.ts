import { describe, expect, it } from "vitest";
import { beam_fill_stops, stress_ramp_color } from "./drawing-functions";
import { STRESS_OVERSTRESS_COLOR, STRESS_RAMP } from "../../constants/rendering-specs";

const rgb = (stop: (typeof STRESS_RAMP)[number]) =>
  `rgb(${stop.rgb[0]}, ${stop.rgb[1]}, ${stop.rgb[2]})`;

describe("stress_ramp_color", () => {
  it("ratio at or past 1 is always the overstress color, whatever the absolute stress", () => {
    expect(stress_ramp_color(1, 500, 1000)).toBe(STRESS_OVERSTRESS_COLOR);
    expect(stress_ramp_color(2, 0, 1000)).toBe(STRESS_OVERSTRESS_COLOR);
  });

  it("stress = 0 reads as the bottom of the ramp, stress = scaleMaxStress as its top", () => {
    expect(stress_ramp_color(0, 0, 1000)).toBe(rgb(STRESS_RAMP[0]));
    expect(stress_ramp_color(0.5, 1000, 1000)).toBe(rgb(STRESS_RAMP[STRESS_RAMP.length - 1]));
  });

  it("a non-positive scaleMaxStress (nothing recorded yet) reads as the bottom of the ramp", () => {
    expect(stress_ramp_color(0.1, 500, 0)).toBe(rgb(STRESS_RAMP[0]));
    expect(stress_ramp_color(0.1, 500, -1)).toBe(rgb(STRESS_RAMP[0]));
  });

  it("a NaN ratio or stress resolves to a paintable color instead of rgb(NaN, NaN, NaN)", () => {
    expect(stress_ramp_color(NaN, 500, 1000)).toBe(rgb(STRESS_RAMP[0]));
    expect(stress_ramp_color(0.5, NaN, 1000)).toBe(rgb(STRESS_RAMP[0]));
  });
});

describe("beam_fill_stops — la rupture nette au franchissement de la limite élastique", () => {
  it("no crossing: one output stop per input, colored by the ramp alone", () => {
    const raw = [
      { offset: 0, ratio: 0.1, stress: 100 },
      { offset: 0.5, ratio: 0.4, stress: 400 },
      { offset: 1, ratio: 0.2, stress: 200 },
    ];
    const stops = beam_fill_stops(raw, 1000);
    expect(stops).toHaveLength(3);
    expect(stops.map((s) => s.offset)).toEqual([0, 0.5, 1]);
    for (const s of stops) expect(s.color).not.toBe(STRESS_OVERSTRESS_COLOR);
  });

  it("crossing into overstress inserts a hard step at the crossing sample's own offset", () => {
    const raw = [
      { offset: 0, ratio: 0.5, stress: 500 },
      { offset: 1, ratio: 1.2, stress: 1200 }, // crosses ratio = 1 here
    ];
    const stops = beam_fill_stops(raw, 1000);
    // Extra stop inserted right before the crossing sample: same offset, two colors.
    expect(stops.map((s) => s.offset)).toEqual([0, 1, 1]);
    expect(stops[1].color).not.toBe(STRESS_OVERSTRESS_COLOR); // the ramp, one instant before
    expect(stops[2].color).toBe(STRESS_OVERSTRESS_COLOR); // the sample itself
  });

  it("crossing back out of overstress steps the other way, at the same offset", () => {
    const raw = [
      { offset: 0, ratio: 1.5, stress: 1500 },
      { offset: 1, ratio: 0.3, stress: 300 }, // drops back under 1 here
    ];
    const stops = beam_fill_stops(raw, 1000);
    expect(stops.map((s) => s.offset)).toEqual([0, 1, 1]);
    expect(stops[1].color).toBe(STRESS_OVERSTRESS_COLOR); // overstress, right up to the boundary
    expect(stops[2].color).not.toBe(STRESS_OVERSTRESS_COLOR); // straight into the ramp
  });

  it("a beam that never crosses stays in overstress end to end — no spurious step", () => {
    const raw = [
      { offset: 0, ratio: 1.1, stress: 1100 },
      { offset: 1, ratio: 1.4, stress: 1400 },
    ];
    const stops = beam_fill_stops(raw, 1000);
    expect(stops).toHaveLength(2);
    expect(stops.every((s) => s.color === STRESS_OVERSTRESS_COLOR)).toBe(true);
  });
});
