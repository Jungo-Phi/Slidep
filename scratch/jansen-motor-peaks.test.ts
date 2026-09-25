import { writeFileSync } from "node:fs";
import { describe, it } from "vitest";
import json from "../test-mechanisms/Jansen's linkage.slidep?raw";
import { Point2 } from "../src/types";
import { DynamicSnapshot } from "../src/types/runtime-state";
import { load_mechanism } from "../src/utils/load-mechanism";
import {
  RECORD_DT,
  compile_simulation_model,
  step_dynamic_simulation,
} from "../src/components/solver/dynamics/simulation-engine";

function run(sweeps: number, substeps: number, frames: number) {
  const mechanism = load_mechanism(JSON.parse(json)).mechanism;
  const model = compile_simulation_model(mechanism);
  let s: DynamicSnapshot | null = null;
  const nm: number[] = [];
  const spd: number[] = [];
  const sat: boolean[] = [];
  for (let f = 0; f < frames; f++) {
    s = step_dynamic_simulation(model, f * RECORD_DT, s, RECORD_DT, new Point2(0, -9.81), undefined, sweeps, true, false, false, substeps);
    const m = s.motor![0];
    nm.push(m.nm);
    spd.push(m.speed);
    sat.push(m.saturated);
  }
  return { nm, spd, sat };
}

describe("Jansen motor peaks", () => {
  it("trace", () => {
    const frames = 240;
    const rows: string[] = [];
    const configs: [number, number][] = [
      [200, 16],
      [2000, 16],
      [200, 64],
    ];
    const runs = configs.map(([sw, sub]) => run(sw, sub, frames));
    rows.push(configs.map(([sw, sub]) => `sw${sw}/sub${sub}`.padEnd(26)).join(" | "));
    for (let f = 0; f < frames; f++)
      rows.push(
        `${String(f).padStart(3)} ` +
          runs
            .map((r) => `${r.nm[f].toFixed(2).padStart(7)} ${r.spd[f].toFixed(3)}${r.sat[f] ? "*" : " "}`.padEnd(26))
            .join(" | "),
      );
    writeFileSync("C:/Users/arnol/Documents/slidep/scratch/jansen-trace.txt", rows.join("\n"));
  }, 600_000);
});
