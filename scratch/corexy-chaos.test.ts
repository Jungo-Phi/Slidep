import { writeFileSync } from "node:fs";
import { describe, it } from "vitest";
import json from "../test-mechanisms/Core XY.slidep?raw";
import { Point2 } from "../src/types";
import { DynamicSnapshot } from "../src/types/runtime-state";
import { load_mechanism } from "../src/utils/load-mechanism";
import { RECORD_DT, compile_simulation_model, step_dynamic_simulation } from "../src/components/solver/dynamics/simulation-engine";

function run(ratio: number, sweeps: number) {
  (globalThis as any).__exitRatio = ratio;
  const mechanism = load_mechanism(JSON.parse(json)).mechanism;
  const model = compile_simulation_model(mechanism);
  let s: DynamicSnapshot | null = null;
  let e0: number | undefined; let input = 0; let worst = 0; let worstF = -1; let maxKe = 0;
  for (let f = 0; f < 180; f++) {
    s = step_dynamic_simulation(model, f * RECORD_DT, s, RECORD_DT, new Point2(0, -9.81), undefined, sweeps);
    const e = s.energy!; const mech = e.kinetic + e.potentialGravity + e.potentialSpring;
    if (e0 === undefined) e0 = mech; else input += ((s.motor ?? []).reduce((a, m) => a + m.watts, 0) + e.loadPower - e.damperPower - e.frictionPower) * RECORD_DT - e.impactLoss;
    const d = Math.abs(mech - e0 - input);
    if (d > worst) { worst = d; worstF = f; }
    maxKe = Math.max(maxKe, e.kinetic);
  }
  return `ratio=${ratio} sweeps=${sweeps}: worst drift ${worst.toFixed(2)} J at frame ${worstF}, max KE ${maxKe.toFixed(2)} J`;
}

describe("corexy chaos", () => {
  it("perturb", () => {
    const rows: string[] = [];
    for (const [r, sw] of [[0, 190], [0, 199], [0, 201], [0, 210], [1e-3, 199], [1e-3, 201], [1e-3, 400]] as [number, number][]) {
      rows.push(run(r, sw));
      writeFileSync("C:/Users/arnol/Documents/slidep/scratch/corexy-chaos.txt", rows.join("\n"));
    }
  }, 1_800_000);
});
