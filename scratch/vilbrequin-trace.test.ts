import { writeFileSync } from "node:fs";
import { describe, it } from "vitest";
import json from "../test-mechanisms/Vilbrequin + masse lourde.slidep?raw";
import { Point2 } from "../src/types";
import { DynamicSnapshot } from "../src/types/runtime-state";
import { load_mechanism } from "../src/utils/load-mechanism";
import { RECORD_DT, compile_simulation_model, step_dynamic_simulation } from "../src/components/solver/dynamics/simulation-engine";

function run(substeps: number, tolScale = 1) {
  (globalThis as any).__tolScale = tolScale;
  const mechanism = load_mechanism(JSON.parse(json)).mechanism;
  const model = compile_simulation_model(mechanism);
  const sim = mechanism.simulation;
  const gravity = sim.gravity ? new Point2(0, -9.81) : new Point2(0, 0);
  let s: DynamicSnapshot | null = null;
  let e0: number | undefined; let input = 0;
  const rows: string[] = [];
  for (let f = 0; f < 240; f++) {
    s = step_dynamic_simulation(model, f * RECORD_DT, s, RECORD_DT, gravity, undefined, 200, true, sim.collisions, sim.floor.enabled, substeps);
    const e = s.energy!; const mech = e.kinetic + e.potentialGravity + e.potentialSpring;
    const m = s.motor?.[0];
    if (e0 === undefined) e0 = mech; else input += ((m?.watts ?? 0) + e.loadPower - e.damperPower - e.frictionPower) * RECORD_DT - e.impactLoss;
    rows.push(`${f} nm=${m?.nm.toFixed(2)} spd=${m?.speed.toFixed(3)} sat=${m?.saturated ? 1 : 0} ke=${e.kinetic.toFixed(3)} pg=${e.potentialGravity.toFixed(3)} drift=${(mech - e0 - input).toFixed(3)}`);
  }
  return rows;
}

describe("vilbrequin", () => {
  it("trace", () => {
    const a = run(16, 0), b = run(64, 0);
    writeFileSync("C:/Users/arnol/Documents/slidep/scratch/vilbrequin-trace.txt", a.map((r, i) => r.padEnd(90) + " || " + b[i]).join("\n"));
  }, 600_000);
});
