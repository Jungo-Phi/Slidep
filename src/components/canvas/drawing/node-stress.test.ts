import { describe, expect, it } from "vitest";
import {
  beam_offset,
  reading_at,
  worst_reading,
  type StressReading,
} from "./node-stress";

const reading = (
  offset: number,
  severity: number,
  color = `c${severity}`,
): StressReading => ({ offset, severity, color });

describe("reading_at", () => {
  it("keeps the worst of the two readings a jump leaves at one station", () => {
    const readings = [reading(0, 1), reading(0.5, 2), reading(0.5, 7), reading(1, 3)];
    expect(reading_at(readings, 0.5)?.severity).toBe(7);
  });

  it("reads the nearest station when none is exactly there", () => {
    const readings = [reading(0, 1), reading(1, 5)];
    expect(reading_at(readings, 0.8)?.severity).toBe(5);
    expect(reading_at(readings, 0.2)?.severity).toBe(1);
  });

  it("has nothing to read on an empty field", () => {
    expect(reading_at([], 0.5)).toBeUndefined();
  });
});

describe("worst_reading", () => {
  it("skips absent readings and picks the highest severity", () => {
    expect(worst_reading([undefined, reading(0, 2), reading(0, 4)])?.severity).toBe(4);
  });

  it("returns undefined when nothing is left", () => {
    expect(worst_reading([undefined])).toBeUndefined();
  });

  it("ranks a real reading above an unranked one", () => {
    const flat = reading(0, -Infinity, "flat");
    expect(worst_reading([flat, reading(0, 0, "real")])?.color).toBe("real");
  });
});

describe("beam_offset", () => {
  const start = { x: 0, y: 0 };
  const end = { x: 10, y: 0 };

  it("projects the point on the beam", () => {
    expect(beam_offset(start, end, { x: 2.5, y: 3 })).toBeCloseTo(0.25);
  });

  it("clamps to the beam's ends", () => {
    expect(beam_offset(start, end, { x: -4, y: 0 })).toBe(0);
    expect(beam_offset(start, end, { x: 40, y: 0 })).toBe(1);
  });

  it("reads 0 on a zero-length beam", () => {
    expect(beam_offset(start, start, { x: 1, y: 1 })).toBe(0);
  });
});
