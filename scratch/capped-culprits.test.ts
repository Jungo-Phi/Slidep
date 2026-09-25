import { writeFileSync } from "node:fs";
import { describe, it } from "vitest";
import { Point2 } from "../src/types";
import { DynamicSnapshot } from "../src/types/runtime-state";
import { load_mechanism } from "../src/utils/load-mechanism";
import { RECORD_DT, compile_simulation_model, step_dynamic_simulation } from "../src/components/solver/dynamics/simulation-engine";

const files = import.meta.glob("../test-mechanisms/*.slidep", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const NAMES = ["Hoist.slidep", "Huygen's chain drive.slidep", "Poulie bloqueuse.slidep", "Jansen's linkage.slidep", "Line from rotation.slidep", "Vilbrequin + masse lourde.slidep", "CP.slidep", "Puente.slidep", "Masse suspendue.slidep", "Test slider.slidep", "Core XY - 2 moteurs.slidep", "Déconnexion courroie.slidep"];

describe("capped culprits", () => {
  it("which link", () => {
    (globalThis as any).__exitRatio = 1e-3;
    const rows: string[] = [];
    for (const [path, json] of Object.entries(files)) {
      const name = path.split("/").pop()!;
      if (!NAMES.includes(name)) continue;
      const mechanism = load_mechanism(JSON.parse(json)).mechanism;
      const model = compile_simulation_model(mechanism);
      const sim = mechanism.simulation;
      const log: string[] = [];
      (globalThis as any).__typeLog = log;
      let s: DynamicSnapshot | null = null;
      for (let f = 0; f < 90; f++)
        s = step_dynamic_simulation(model, f * RECORD_DT, s, RECORD_DT, sim.gravity ? new Point2(0, -9.81) : new Point2(0, 0), undefined, 200, true, sim.collisions, sim.floor.enabled);
      const byType = new Map<string, number>();
      const ratios = new Map<string, number[]>();
      for (const e of log) { const [t, r] = e.split(":"); byType.set(t, (byType.get(t) ?? 0) + 1); ratios.set(t, [...(ratios.get(t) ?? []), Number(r)]); }
      const summary = [...byType].sort((a, b) => b[1] - a[1]).map(([t, n]) => { const rs = ratios.get(t)!.sort((a, b) => a - b); return `${t}×${n} (gap/tol median ${rs[rs.length >> 1].toExponential(0)}, max ${rs[rs.length - 1].toExponential(0)})`; }).join("; ");
      rows.push(`${name}: capped ${log.length}/${90 * 16} — ${summary}`);
      writeFileSync("C:/Users/arnol/Documents/slidep/scratch/capped-culprits.txt", rows.join("\n"));
    }
    (globalThis as any).__typeLog = undefined;
  }, 1_800_000);
});
