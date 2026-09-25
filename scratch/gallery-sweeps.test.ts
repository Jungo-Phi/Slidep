import { writeFileSync } from "node:fs";
import { describe, it } from "vitest";
import { Point2 } from "../src/types";
import { DynamicSnapshot } from "../src/types/runtime-state";
import { load_mechanism } from "../src/utils/load-mechanism";
import { RECORD_DT, compile_simulation_model, step_dynamic_simulation } from "../src/components/solver/dynamics/simulation-engine";

const files = import.meta.glob("../test-mechanisms/*.slidep", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const FRAMES = 120;

function run(json: string, substeps: number) {
  const mechanism = load_mechanism(JSON.parse(json)).mechanism;
  const model = compile_simulation_model(mechanism);
  const sim = mechanism.simulation;
  const gravity = sim.gravity ? new Point2(0, -9.81) : new Point2(0, 0);
  const log: number[] = [];
  (globalThis as any).__swLog = log;
  let s: DynamicSnapshot | null = null;
  for (let f = 0; f < FRAMES; f++)
    s = step_dynamic_simulation(model, f * RECORD_DT, s, RECORD_DT, gravity, undefined, 200, true, sim.collisions, sim.floor.enabled, substeps);
  (globalThis as any).__swLog = undefined;
  const mean = log.reduce((a, b) => a + b, 0) / log.length;
  const capped = log.filter((n) => n >= 200).length / log.length;
  return { mean, capped, perFrame: (mean * log.length) / FRAMES };
}

describe("gallery sweeps", () => {
  it("16 vs 64", () => {
    const rows = ["mechanism | sweeps/sub 16 | capped 16 | sweeps/frame 16 | sweeps/sub 64 | capped 64 | sweeps/frame 64 | ratio"];
    for (const [path, json] of Object.entries(files)) {
      const name = path.split("/").pop()!;
      if (name === "Pendulum clock.slidep") continue;
      const a = run(json, 16);
      const b = run(json, 64);
      rows.push(`${name} | ${a.mean.toFixed(1)} | ${(a.capped * 100).toFixed(0)}% | ${a.perFrame.toFixed(0)} | ${b.mean.toFixed(1)} | ${(b.capped * 100).toFixed(0)}% | ${b.perFrame.toFixed(0)} | ${(b.perFrame / a.perFrame).toFixed(2)}`);
      writeFileSync("C:/Users/arnol/Documents/slidep/scratch/gallery-sweeps.txt", rows.join("\n"));
    }
  }, 3_600_000);
});
