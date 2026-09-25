import { writeFileSync } from "node:fs";
import { describe, it } from "vitest";
import json from "../test-mechanisms/Core XY.slidep?raw";
import { Point2 } from "../src/types";
import { DynamicSnapshot } from "../src/types/runtime-state";
import { load_mechanism } from "../src/utils/load-mechanism";
import { RECORD_DT, compile_simulation_model, step_dynamic_simulation } from "../src/components/solver/dynamics/simulation-engine";

function run(ratio: number) {
  (globalThis as any).__exitRatio = ratio;
  const mechanism = load_mechanism(JSON.parse(json)).mechanism;
  const model = compile_simulation_model(mechanism);
  const sim = mechanism.simulation;
  const gravity = sim.gravity ? new Point2(0, -9.81) : new Point2(0, 0);
  let s: DynamicSnapshot | null = null;
  let e0: number | undefined; let input = 0;
  const rows: string[] = [`gravity=${sim.gravity} collisions=${sim.collisions} floor=${sim.floor.enabled} motors=${JSON.stringify(model.compiledMotors.map((m) => [m.omega, m.torqueLimit]))} extent=${model.extent}`];
  for (let f = 0; f < 180; f++) {
    const log: number[] = []; (globalThis as any).__swLog = log;
    s = step_dynamic_simulation(model, f * RECORD_DT, s, RECORD_DT, gravity, undefined, 200, true, sim.collisions, sim.floor.enabled);
    const e = s.energy!; const mech = e.kinetic + e.potentialGravity + e.potentialSpring;
    const ms = s.motor ?? [];
    if (e0 === undefined) e0 = mech; else input += (ms.reduce((a, m) => a + m.watts, 0) + e.loadPower - e.damperPower - e.frictionPower) * RECORD_DT - e.impactLoss;
    rows.push(`${String(f).padStart(3)} sw=${log.join(",")} ke=${e.kinetic.toFixed(4)} drift=${(mech - e0 - input).toFixed(4)} imp=${e.impactLoss.toFixed(4)} ` + ms.map((m) => `[${m.nm.toFixed(2)} ${m.speed.toFixed(3)}${m.saturated ? "*" : ""}]`).join(" ") + ` unsat=${s.unsatisfied?.length}`);
  }
  (globalThis as any).__swLog = undefined;
  return rows;
}

describe("corexy", () => {
  it("trace", () => {
    writeFileSync("C:/Users/arnol/Documents/slidep/scratch/corexy-old.txt", run(0).join("\n"));
    writeFileSync("C:/Users/arnol/Documents/slidep/scratch/corexy-new.txt", run(1e-3).join("\n"));
    writeFileSync("C:/Users/arnol/Documents/slidep/scratch/corexy-old2.txt", run(0).join("\n"));
    writeFileSync("C:/Users/arnol/Documents/slidep/scratch/corexy-new2.txt", run(1e-3).join("\n"));
  }, 900_000);
});
