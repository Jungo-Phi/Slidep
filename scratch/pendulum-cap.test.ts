// Throwaway: why every Pendulum clock substep runs to the sweep cap.
import { writeFileSync } from "node:fs";
import { describe, it } from "vitest";
import clock from "../test-mechanisms/Pendulum clock.slidep?raw";
import { Point2 } from "../src/types";
import { DynamicSnapshot } from "../src/types/runtime-state";
import { load_mechanism } from "../src/utils/load-mechanism";
import { RECORD_DT, compile_simulation_model, step_dynamic_simulation } from "../src/components/solver/dynamics/simulation-engine";

describe("pendulum clock cap", () => {
  it("why capped", () => {
    const mechanism = load_mechanism(JSON.parse(clock)).mechanism;
    const sim = mechanism.simulation;
    const model = compile_simulation_model(mechanism);
    const perf = { solves: 0, sweeps: 0, types: {} as Record<string, number>, ls: [] as string[], end: {} as Record<string, number>, ratio: [] as number[] };
    (globalThis as any).__perf = perf;
    let s: DynamicSnapshot | null = null;
    for (let f = 0; f < 12; f++)
      s = step_dynamic_simulation(model, f * RECORD_DT, s, RECORD_DT, new Point2(0, -9.81), undefined, 200, true, sim.collisions, sim.floor.enabled);
    (globalThis as any).__perf = undefined;
    const r = perf.ratio.slice().sort((a, b) => a - b);
    const out = [`solves ${perf.solves}, sweeps/solve ${(perf.sweeps / perf.solves).toFixed(1)}`, `end state: ${JSON.stringify(perf.end)}`,
      `worstGap/exitGap at end: min ${r[0]?.toFixed(2)} median ${r[r.length >> 1]?.toFixed(2)} max ${r[r.length - 1]?.toFixed(2)}`];
    writeFileSync("C:/Users/arnol/Documents/slidep/scratch/pendulum-cap.txt", out.join("\n"));
  }, 3_600_000);
});
