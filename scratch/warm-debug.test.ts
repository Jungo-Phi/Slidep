import { writeFileSync } from "node:fs";
import { describe, it } from "vitest";
import jansen from "../test-mechanisms/Jansen's linkage.slidep?raw";
import { Point2 } from "../src/types";
import { DynamicSnapshot } from "../src/types/runtime-state";
import { load_mechanism } from "../src/utils/load-mechanism";
import { RECORD_DT, compile_simulation_model, step_dynamic_simulation } from "../src/components/solver/dynamics/simulation-engine";

function run(warm: boolean | "cold2") {
  const mechanism = load_mechanism(JSON.parse(jansen)).mechanism;
  const model = compile_simulation_model(mechanism);
  (globalThis as any).__warm = warm === true;
  const out: DynamicSnapshot[] = [];
  let s: DynamicSnapshot | null = null;
  for (let f = 0; f < 12; f++) { s = step_dynamic_simulation(model, f * RECORD_DT, s, RECORD_DT, new Point2(0, -9.81), undefined, 200, f % 2 === 0, false, false); out.push(s); }
  (globalThis as any).__warm = undefined;
  return out;
}
const rmap = (s: DynamicSnapshot) => { const m = new Map<string, number>(); for (const r of s.reactions ?? []) if (r.kind === "force") { const k = `${r.type}|${r.owner?.slice(0, 4)}|${r.key.slice(0, 12)}`; m.set(k + " x", (m.get(k + " x") ?? 0) + r.fx); m.set(k + " y", (m.get(k + " y") ?? 0) + r.fy); } return m; };

describe("warm debug", () => {
  it("reactions", () => {
    const a = run(false), c = run("cold2"), b = run(true);
    const out: string[] = [];
    for (const f of [2, 6, 10]) {
      let dp = 0; for (let i = 0; i < a[f].positions.length; i++) if (Number.isFinite(a[f].positions[i])) dp = Math.max(dp, Math.abs(a[f].positions[i] - b[f].positions[i]));
      let dv = 0; const va = a[f].velocities!, vb = b[f].velocities!; for (let i = 0; i < va.length; i++) if (Number.isFinite(va[i])) dv = Math.max(dv, Math.abs(va[i] - vb[i]));
      const ra = rmap(a[f]), rb = rmap(b[f]), rc = rmap(c[f]);
      let coldcold = 0; for (const [k, v] of ra) coldcold = Math.max(coldcold, Math.abs(v - (rc.get(k) ?? 0)));
      const diffs = [...ra].map(([k, v]) => [k, v, rb.get(k) ?? 0] as const).sort((x, y) => Math.abs(y[1] - y[2]) - Math.abs(x[1] - x[2])).slice(0, 5);
      out.push(`frame ${f}: max pos diff ${dp.toExponential(2)} m, max vel diff ${dv.toExponential(2)} m/s, cold vs cold reactions ${coldcold}, reactions ${ra.size}/${rb.size}`);
      for (const [k, v, w] of diffs) out.push(`   ${k}: cold ${v.toFixed(3)} warm ${w.toFixed(3)}`);
      out.push(`   motor cold ${JSON.stringify(a[f].motor?.map((m) => m.nm.toFixed(3)))} warm ${JSON.stringify(b[f].motor?.map((m) => m.nm.toFixed(3)))}`);
    }
    writeFileSync("C:/Users/arnol/Documents/slidep/scratch/warm-debug.txt", out.join("\n"));
  }, 600_000);
});
