// Throwaway: how the worst gap evolves over the sweeps of a Pendulum clock substep, and which link holds it.
import { writeFileSync } from "node:fs";
import { describe, it } from "vitest";
import clock from "../test-mechanisms/Pendulum clock.slidep?raw";
import { Point2 } from "../src/types";
import { DynamicSnapshot } from "../src/types/runtime-state";
import { load_mechanism } from "../src/utils/load-mechanism";
import { RECORD_DT, compile_simulation_model, step_dynamic_simulation } from "../src/components/solver/dynamics/simulation-engine";

describe("pendulum gap", () => {
  it("trace", () => {
    const mechanism = load_mechanism(JSON.parse(clock)).mechanism;
    const model = compile_simulation_model(mechanism);
    const names = new Map(mechanism.mechanicalElements.map((e) => [e.id, `${e.type}${"name" in e && e.name ? " " + e.name : ""}`]));
    let s: DynamicSnapshot | null = null;
    const out: string[] = [];
    const owners: Record<string, number> = {};
    for (let f = 0; f < 10; f++) {
      const trace: any[] = [];
      (globalThis as any).__trace = f >= 6 ? trace : undefined;
      s = step_dynamic_simulation(model, f * RECORD_DT, s, RECORD_DT, new Point2(0, -9.81), undefined, 200, true, true, false);
      (globalThis as any).__trace = undefined;
      if (f < 6) continue;
      // Split per substep: `i` restarts at 0.
      const subs: any[][] = [];
      for (const e of trace) { if (e.i === 0) subs.push([]); subs[subs.length - 1].push(e); }
      subs.forEach((sub, k) => {
        const last = sub[sub.length - 1];
        const key = `${last.type} ${names.get(last.owner) ?? last.owner}`;
        owners[key] = (owners[key] ?? 0) + 1;
        if (k % 5 === 0) {
          const pick = [0, 5, 10, 20, 40, 80, 120, 160, 199].filter((n) => n < sub.length).map((n) => sub[n].gap.toFixed(2));
          out.push(`frame ${f} sub ${k}: sweeps ${sub.length}, gap/exitGap at 0,5,10,20,40,80,120,160,199 = ${pick.join(" ")} | worst at end: ${key}`);
        }
      });
    }
    out.push("worst link at the end of each substep:");
    for (const [k, v] of Object.entries(owners).sort((a, b) => b[1] - a[1])) out.push(`  ${v}  ${k}`);
    // What the worst Distance links are.
    const distances = model.links.filter((l) => l.type === "Distance") as any[];
    out.push(`Distance links: ${distances.length}, compliant ${distances.filter((l) => l.compliance).length}, compliance range ${Math.min(...distances.map((l) => l.compliance ?? Infinity))} .. ${Math.max(...distances.map((l) => l.compliance ?? 0))}`);
    out.push(`extent ${model.extent}`);
    writeFileSync("C:/Users/arnol/Documents/slidep/scratch/pendulum-gap.txt", out.join("\n"));
  }, 3_600_000);
});
