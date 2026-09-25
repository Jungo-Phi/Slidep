import { writeFileSync } from "node:fs";
import { describe, it } from "vitest";
import json from "../test-mechanisms/Jansen's linkage.slidep?raw";
import { Point2 } from "../src/types";
import { DynamicSnapshot } from "../src/types/runtime-state";
import { load_mechanism } from "../src/utils/load-mechanism";
import { RECORD_DT, compile_simulation_model, step_dynamic_simulation } from "../src/components/solver/dynamics/simulation-engine";

function run(substeps: number, tolScale = 1) {
  (globalThis as any).__tolScale = tolScale;
  const model = compile_simulation_model(load_mechanism(JSON.parse(json)).mechanism);
  let s: DynamicSnapshot | null = null;
  const nm: number[] = [], spd: number[] = [];
  const t0 = performance.now();
  for (let f = 0; f < 240; f++) {
    s = step_dynamic_simulation(model, f * RECORD_DT, s, RECORD_DT, new Point2(0, -9.81), undefined, 200, true, false, false, substeps);
    nm.push(s.motor![0].nm); spd.push(s.motor![0].speed);
  }
  const ms = (performance.now() - t0) / 240;
  // Peak = largest frame-to-frame jump of the torque after start-up.
  let jump = 0, spdMin = Infinity, spdMax = -Infinity;
  for (let f = 60; f < 240; f++) { jump = Math.max(jump, Math.abs(nm[f] - nm[f - 1])); spdMin = Math.min(spdMin, -spd[f]); spdMax = Math.max(spdMax, -spd[f]); }
  return `sub${substeps} tol${tolScale}: ${ms.toFixed(1)} ms/frame, max jump ${jump.toFixed(2)} N·m, speed ${spdMin.toFixed(3)}..${spdMax.toFixed(3)}`;
}

describe("cost", () => {
  it("substeps", () => {
    const rows: string[] = [];
    for (const [s, t] of [[16, 1], [64, 1], [64, 0.25], [16, 0], [64, 0]]) rows.push(run(s, t));
    writeFileSync("C:/Users/arnol/Documents/slidep/scratch/jansen-cost.txt", rows.join("\n"));
  }, 900_000);
});
