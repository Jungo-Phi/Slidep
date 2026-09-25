import { writeFileSync } from "node:fs";
import { describe, it } from "vitest";
import json from "../test-mechanisms/Jansen's linkage.slidep?raw";
import { Point2 } from "../src/types";
import { DynamicSnapshot } from "../src/types/runtime-state";
import { load_mechanism } from "../src/utils/load-mechanism";
import { RECORD_DT, compile_simulation_model, step_dynamic_simulation } from "../src/components/solver/dynamics/simulation-engine";

function run(gapTol: number | undefined, substeps: number, warm = 0) {
  (globalThis as any).__warm = warm; (globalThis as any).__warmTorques = undefined;
  (globalThis as any).__gapTol = gapTol;
  const model = compile_simulation_model(load_mechanism(JSON.parse(json)).mechanism);
  let s: DynamicSnapshot | null = null;
  const out: { nm: number; spd: number; sat: boolean; sweeps: number; maxSw: number }[] = [];
  const t0 = performance.now();
  for (let f = 0; f < 240; f++) {
    const log: any[] = [];
    (globalThis as any).__dbg = log;
    s = step_dynamic_simulation(model, f * RECORD_DT, s, RECORD_DT, new Point2(0, -9.81), undefined, 200, true, false, false, substeps);
    const m = s.motor![0];
    out.push({ nm: m.nm, spd: m.speed, sat: m.saturated, sweeps: log.reduce((a, e) => a + e.sweeps + 1, 0), maxSw: Math.max(...log.map((e) => e.sweeps + 1)) });
  }
  return { out, ms: performance.now() - t0 };
}

describe("Jansen gap fix", () => {
  it("trace", () => {
    const step = 2.617993877991494 * RECORD_DT / 16; const cfgs: [number | undefined, number, number][] = [[undefined, 16, 0], [0.1 * step, 16, 0], [0.03 * step, 16, 0], [0.01 * step, 16, 0]];
    const runs = cfgs.map(([g, s, w]) => run(g, s, w));
    const rows = [cfgs.map(([g, s, w], i) => `tol${g}/w${w} ${runs[i].ms.toFixed(0)}ms`.padEnd(34)).join("| ")];
    for (let f = 0; f < 240; f++)
      rows.push(`${String(f).padStart(3)} ` + runs.map((r) => { const o = r.out[f]; return `${o.nm.toFixed(2).padStart(7)} ${o.spd.toFixed(3)}${o.sat ? "*" : " "} ${String(o.sweeps).padStart(5)} ${String(o.maxSw).padStart(3)}`.padEnd(34); }).join("| "));
    writeFileSync("C:/Users/arnol/Documents/slidep/scratch/jansen-gapfix.txt", rows.join("\n"));
  }, 900_000);
});
