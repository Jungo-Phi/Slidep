import { writeFileSync } from "node:fs";
import { describe, it } from "vitest";
import json from "../test-mechanisms/Jansen's linkage.slidep?raw";
import { Point2 } from "../src/types";
import { DynamicSnapshot } from "../src/types/runtime-state";
import { load_mechanism } from "../src/utils/load-mechanism";
import { RECORD_DT, compile_simulation_model, step_dynamic_simulation } from "../src/components/solver/dynamics/simulation-engine";

describe("Jansen substeps", () => {
  it("trace", () => {
    const model = compile_simulation_model(load_mechanism(JSON.parse(json)).mechanism);
    let s: DynamicSnapshot | null = null;
    const rows: string[] = [];
    for (let f = 0; f < 212; f++) {
      const log: any[] = [];
      (globalThis as any).__dbg = log;
      s = step_dynamic_simulation(model, f * RECORD_DT, s, RECORD_DT, new Point2(0, -9.81));
      if (f >= 180)
        rows.push(`${f} spd=${s.motor![0].speed.toFixed(3)} :: ` + log.map((e) => `${e.nm.toFixed(1)}${e.sat ? "*" : ""}/${e.sweeps}/${e.gap.toExponential(0)}`).join(" "));
    }
    writeFileSync("C:/Users/arnol/Documents/slidep/scratch/jansen-sub.txt", rows.join("\n"));
  }, 600_000);
});
