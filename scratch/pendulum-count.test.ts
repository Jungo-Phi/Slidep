// Throwaway: where a Pendulum clock step goes — sweeps per substep, links by type, statics size, time with and without statics.
import { writeFileSync } from "node:fs";
import { describe, it } from "vitest";
import clock from "../test-mechanisms/Pendulum clock.slidep?raw";
import { Point2 } from "../src/types";
import { DynamicSnapshot } from "../src/types/runtime-state";
import { load_mechanism } from "../src/utils/load-mechanism";
import { RECORD_DT, compile_simulation_model, step_dynamic_simulation } from "../src/components/solver/dynamics/simulation-engine";

const FRAMES = 120;
const mechanism = load_mechanism(JSON.parse(clock)).mechanism;
const sim = mechanism.simulation;
const gravity = sim.gravity ? new Point2(0, -9.81) : new Point2(0, 0);

function run(diagnostics: boolean) {
  const model = compile_simulation_model(mechanism);
  let s: DynamicSnapshot | null = null;
  const t0 = performance.now();
  for (let f = 0; f < FRAMES; f++)
    s = step_dynamic_simulation(model, f * RECORD_DT, s, RECORD_DT, gravity, undefined, 200, diagnostics, sim.collisions, sim.floor.enabled);
  return performance.now() - t0;
}

describe("pendulum clock count", () => {
  it("counts", () => {
    const out: string[] = [];
    const perf = { solves: 0, sweeps: 0, types: {} as Record<string, number>, ls: [] as string[] };
    (globalThis as any).__perf = perf;
    const counted = run(true);
    (globalThis as any).__perf = undefined;
    out.push(`frames ${FRAMES} (${(FRAMES * RECORD_DT).toFixed(2)} s simulated), counted run ${counted.toFixed(0)} ms`);
    out.push(`PBD solves ${perf.solves} (${(perf.solves / FRAMES).toFixed(1)}/frame), sweeps ${perf.sweeps} (${(perf.sweeps / perf.solves).toFixed(1)}/solve, ${(perf.sweeps / FRAMES).toFixed(0)}/frame)`);
    out.push("links per solve by type:");
    for (const [k, v] of Object.entries(perf.types).sort((a, b) => b[1] - a[1])) out.push(`  ${k}: ${(v / perf.solves).toFixed(1)}`);
    const dims: Record<string, number> = {};
    for (const d of perf.ls) dims[d] = (dims[d] ?? 0) + 1;
    out.push(`least squares calls ${perf.ls.length} (${(perf.ls.length / FRAMES).toFixed(2)}/frame): ${JSON.stringify(dims)}`);
    const times: string[] = [];
    for (let k = 0; k < 3; k++) times.push(`with statics ${run(true).toFixed(0)} ms / without ${run(false).toFixed(0)} ms`);
    out.push(...times);
    writeFileSync("C:/Users/arnol/Documents/slidep/scratch/pendulum-count.txt", out.join("\n"));
  }, 3_600_000);
});
