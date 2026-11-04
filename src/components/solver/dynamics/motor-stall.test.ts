import { describe, expect, it } from "vitest";
import type { ID } from "../../../types";
import type { MotorSample } from "../../../types/runtime-state";
import { CompiledMotor, stalled_motors } from "./motor-model";

const PIVOT = "pivot" as ID;
const MOTOR: CompiledMotor = { kind: "angle", pivotID: PIVOT, angleKey: "gear", omega: 1, torqueLimit: 1 };
const DT = 1 / 120;

const sample = (speed: number): MotorSample => ({ pivotID: PIVOT, watts: 0, nm: 1, speed, saturated: true });

/** Steps the verdict through `speeds`, one frame each, feeding every frame its predecessor as the engine does. */
function verdicts(speeds: number[]): boolean[] {
  let previous: MotorSample[] | undefined;
  let previousStalled: ID[] | undefined;
  return speeds.map((speed) => {
    const samples = [sample(speed)];
    const stalled = stalled_motors([MOTOR], samples, previous, previousStalled, DT);
    previous = samples;
    previousStalled = stalled;
    return stalled.includes(PIVOT);
  });
}

describe("stall hysteresis", () => {
  it("stalls at once", () => {
    expect(verdicts([1, 1, 0])).toEqual([false, false, true]);
  });

  it("holds the stall through a motor that catches up only briefly", () => {
    // Thrown back, then back at full speed for 75 ms, then thrown back again: jaws bouncing on a part.
    const bounce = [0, ...Array(9).fill(1), 0];
    expect(verdicts(bounce).every((s) => s)).toBe(true);
  });

  it("lets go once the motor has run again for a quarter of a second", () => {
    const frames = verdicts([0, ...Array(40).fill(1)]);
    // 0.25 s at 120 Hz is 30 frames; the last one held is the 29th after the stall.
    expect(frames.slice(0, 30).every((s) => s)).toBe(true);
    expect(frames.slice(30).every((s) => !s)).toBe(true);
  });
});
