// Throwaway: warm-started substeps against cold ones, judged against how much the cold solver itself moves when converged harder.
import { writeFileSync } from "node:fs";
import { describe, it } from "vitest";
import { Point2 } from "../src/types";
import { DynamicSnapshot } from "../src/types/runtime-state";
import { load_mechanism } from "../src/utils/load-mechanism";
import { RECORD_DT, compile_simulation_model, step_dynamic_simulation } from "../src/components/solver/dynamics/simulation-engine";

const files = import.meta.glob("../test-mechanisms/*.slidep", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const ONLY = process.env.WARM_ONLY;

function run(json: string, frames: number, warm: boolean, sweeps: number) {
  const mechanism = load_mechanism(JSON.parse(json)).mechanism;
  const sim = mechanism.simulation;
  const gravity = sim.gravity ? new Point2(0, -9.81) : new Point2(0, 0);
  const model = compile_simulation_model(mechanism);
  const perf = { solves: 0, sweeps: 0 };
  (globalThis as any).__perf = perf;
  (globalThis as any).__warm = warm;
  const out: DynamicSnapshot[] = [];
  let s: DynamicSnapshot | null = null;
  const t0 = performance.now();
  for (let f = 0; f < frames; f++) {
    s = step_dynamic_simulation(model, f * RECORD_DT, s, RECORD_DT, gravity, undefined, sweeps, f % 2 === 0, sim.collisions, sim.floor.enabled);
    out.push(s);
  }
  const ms = performance.now() - t0;
  (globalThis as any).__perf = undefined;
  (globalThis as any).__warm = undefined;
  return { out, ms, sweeps: perf.sweeps / Math.max(1, perf.solves), extent: model.extent };
}

/** Largest gap between two runs, each quantity against the largest value of its own kind in the reference. */
function drift(ref: ReturnType<typeof run>, other: ReturnType<typeof run>, frames: number) {
  let pos = 0;
  const coh: number[] = [];
  let motor = 0;
  for (let f = 0; f < frames; f++) {
    const a = ref.out[f], b = other.out[f];
    for (let i = 0; i < a.positions.length; i++) if (Number.isFinite(a.positions[i])) pos = Math.max(pos, Math.abs(a.positions[i] - b.positions[i]) / ref.extent);
    if (f % 2 !== 0 || f === 0) continue;
    const ca = a.beamCohesion ?? [], cb = new Map((b.beamCohesion ?? []).map((c) => [c.beamID, c]));
    let fPeak = 0, mPeak = 0, fDiff = 0, mDiff = 0;
    for (const c of ca) {
      const d = cb.get(c.beamID);
      for (const end of ["start", "end"] as const) {
        fPeak = Math.max(fPeak, Math.abs(c[end].fx), Math.abs(c[end].fy));
        mPeak = Math.max(mPeak, Math.abs(c[end].m));
        if (!d) continue;
        fDiff = Math.max(fDiff, Math.abs(c[end].fx - d[end].fx), Math.abs(c[end].fy - d[end].fy));
        mDiff = Math.max(mDiff, Math.abs(c[end].m - d[end].m));
      }
    }
    if (fPeak > 0) coh.push(Math.max(fDiff / fPeak, mPeak > 0 ? mDiff / mPeak : 0));
    const ma = a.motor ?? [], mb = b.motor ?? [];
    const mp = Math.max(1e-12, ...ma.map((m) => Math.abs(m.nm)));
    for (let k = 0; k < ma.length; k++) motor = Math.max(motor, Math.abs(ma[k].nm - (mb[k]?.nm ?? 0)) / mp);
  }
  coh.sort((x, y) => x - y);
  const e = (v: number | undefined) => (v === undefined ? "-" : v.toExponential(1));
  return `pos ${e(pos)}, torsors med ${e(coh[coh.length >> 1])} max ${e(coh[coh.length - 1])}, motor ${e(motor)}`;
}

describe("warm start", () => {
  it("compare", () => {
    const rows = ["mechanism | sweeps/sub cold→warm (cold400) | time cold→warm ms | WARM vs cold | COLD400 vs cold (the solver's own sensitivity)"];
    for (const [path, json] of Object.entries(files)) {
      const name = path.split("/").pop()!;
      if (ONLY && !name.includes(ONLY)) continue;
      const frames = name.startsWith("Pendulum") ? 24 : 60;
      const cold = run(json, frames, false, 200);
      const warm = run(json, frames, true, 200);
      const deep = run(json, frames, false, 400);
      rows.push(`${name} | ${cold.sweeps.toFixed(1)} → ${warm.sweeps.toFixed(1)} (${deep.sweeps.toFixed(1)}) | ${cold.ms.toFixed(0)} → ${warm.ms.toFixed(0)} | ${drift(cold, warm, frames)} | ${drift(cold, deep, frames)}`);
      writeFileSync("C:/Users/arnol/Documents/slidep/scratch/warm-start.txt", rows.join("\n"));
    }
  }, 7_200_000);
});
