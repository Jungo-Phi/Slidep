// Throwaway: leaving far contacts out of the sweep must not change a single bit of the trajectory.
import { writeFileSync } from "node:fs";
import { describe, it } from "vitest";
import { Point2 } from "../src/types";
import { DynamicSnapshot } from "../src/types/runtime-state";
import { load_mechanism } from "../src/utils/load-mechanism";
import { RECORD_DT, compile_simulation_model, step_dynamic_simulation } from "../src/components/solver/dynamics/simulation-engine";

const files = import.meta.glob("../test-mechanisms/*.slidep", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const PICK: Record<string, number> = { "Pendulum clock.slidep": 24, "Jansen's linkage.slidep": 60, "Vilbrequin.slidep": 60, "Core XY.slidep": 40, "Test slider.slidep": 60, "Huygen's chain drive.slidep": 40 };

function run(json: string, frames: number, cull: boolean) {
  const mechanism = load_mechanism(JSON.parse(json)).mechanism;
  const model = compile_simulation_model(mechanism);
  (globalThis as any).__noCull = !cull;
  const perf = { solves: 0, sweeps: 0, types: {} as Record<string, number>, ls: [] as string[], end: {} as Record<string, number>, ratio: [] as number[], judged: 0, live: 0 };
  (globalThis as any).__perf = cull ? perf : undefined;
  const out: DynamicSnapshot[] = [];
  let s: DynamicSnapshot | null = null;
  const t0 = performance.now();
  for (let f = 0; f < frames; f++) {
    s = step_dynamic_simulation(model, f * RECORD_DT, s, RECORD_DT, new Point2(0, -9.81), undefined, 200, true, true, mechanism.simulation.floor.enabled);
    out.push(s);
  }
  const ms = performance.now() - t0;
  (globalThis as any).__noCull = undefined;
  (globalThis as any).__perf = undefined;
  return { out, ms, perf };
}

describe("contact culling", () => {
  it("bit-identical", () => {
    const rows: string[] = [];
    for (const [path, json] of Object.entries(files)) {
      const name = path.split("/").pop()!;
      const frames = PICK[name];
      if (!frames) continue;
      const full = run(json, frames, false);
      const culled = run(json, frames, true);
      let firstDiff = -1;
      for (let f = 0; f < frames && firstDiff < 0; f++) {
        const a = full.out[f], b = culled.out[f];
        const same = (x: ArrayLike<number>, y: ArrayLike<number>) => x.length === y.length && Array.from(x).every((v, i) => Object.is(v, y[i]));
        if (!same(a.positions, b.positions) || !same(a.angles, b.angles) || !same(a.velocities, b.velocities)) firstDiff = f;
      }
      const p = culled.perf;
      rows.push(`${name}: ${firstDiff < 0 ? "IDENTICAL" : "DIFFERS from frame " + firstDiff} | full ${full.ms.toFixed(0)} ms, culled ${culled.ms.toFixed(0)} ms | judgements/solve ${(p.judged / Math.max(1, p.solves)).toFixed(2)}, live links per judgement ${(p.live / Math.max(1, p.judged)).toFixed(0)} of ${(Object.values(p.types).reduce((a, b) => a + b, 0) / Math.max(1, p.solves)).toFixed(0)}`);
      writeFileSync("C:/Users/arnol/Documents/slidep/scratch/contact-culling.txt", rows.join("\n"));
    }
  }, 3_600_000);
});
