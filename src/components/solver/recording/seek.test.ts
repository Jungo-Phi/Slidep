import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_RUNTIME_STATE, SimulationSnapshot } from "../../../types/runtime-state";
import { set_sim_clock, sim_clock } from "../dynamics/sim-clock";
import { seek_to, step_through_recording } from "./seek";

/** A recording of `count` instants, 0.1 s apart: only `t` is read here. */
const recording = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ t: i / 10 }) as SimulationSnapshot);

const at = (time: number, isPlaying = false) =>
  set_sim_clock({
    ...DEFAULT_RUNTIME_STATE,
    simulationSnapshots: recording(31),
    time,
    isPlaying,
  });

describe("step_through_recording", () => {
  beforeEach(() => at(1));

  it("goes to the neighbouring recorded instant, and pauses", () => {
    at(1, true);
    step_through_recording(1, false);
    expect(sim_clock().time).toBeCloseTo(1.1);
    expect(sim_clock().isPlaying).toBe(false);
    step_through_recording(-1, false);
    step_through_recording(-1, false);
    expect(sim_clock().time).toBeCloseTo(0.9);
  });

  it("steps back onto the instant just behind, from between two", () => {
    at(1.05);
    step_through_recording(-1, false);
    expect(sim_clock().time).toBeCloseTo(1);
  });

  it("stays within the recording", () => {
    at(0);
    step_through_recording(-1, false);
    expect(sim_clock().time).toBe(0);
    at(3);
    step_through_recording(1, false);
    expect(sim_clock().time).toBeCloseTo(3);
  });

  it("is a replay behind the end, and not on it", () => {
    seek_to(1);
    expect(sim_clock().scrubbed).toBe(true);
    seek_to(3);
    expect(sim_clock().scrubbed).toBe(false);
  });
});
