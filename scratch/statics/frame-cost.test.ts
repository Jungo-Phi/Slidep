import { describe, it } from "vitest";
import { writeFileSync, appendFileSync, readdirSync, readFileSync } from "node:fs";
const OUT = "scratch/statics/frame-cost.txt";
const LOG = (s: string) => appendFileSync(OUT, s + String.fromCharCode(10));
import { Point2 } from "../../src/types";
import { DynamicSnapshot } from "../../src/types/runtime-state";
import { load_mechanism } from "../../src/utils/load-mechanism";
import {
  RECORD_DT, compile_simulation_model, step_dynamic_simulation,
} from "../../src/components/solver/dynamics/simulation-engine";

const G = new Point2(0, -9.81);

describe("cout d'une image complete", () => {
  it("avec et sans diagnostics", () => {
    writeFileSync(OUT, "");
    LOG("mecanisme                        poutres   sans diag   avec diag (statique incluse)   surcout");
    for (const file of readdirSync("test-mechanisms").filter((f) => f.endsWith(".slidep")).sort()) {
      const raw = readFileSync(`test-mechanisms/${file}`, "utf8");
      const times: number[] = [];
      let beams = 0;
      for (const diag of [false, true]) {
        const mechanism = load_mechanism(JSON.parse(raw)).mechanism;
        const model = compile_simulation_model(mechanism, true);
        beams = model.beamCohesionSpecs.length;
        let snapshot: DynamicSnapshot | null = null;
        for (let i = 0; i < 40; i++)
          snapshot = step_dynamic_simulation(model, i * RECORD_DT, snapshot, RECORD_DT, G, undefined, undefined, diag);
        const N = 30;
        const t0 = performance.now();
        for (let i = 0; i < N; i++)
          snapshot = step_dynamic_simulation(model, (40 + i) * RECORD_DT, snapshot, RECORD_DT, G, undefined, undefined, diag);
        times.push((performance.now() - t0) / N);
      }
      if (beams === 0) continue;
      LOG(`${file.replace(".slidep", "").slice(0, 30).padEnd(33)}${String(beams).padStart(5)}   ${times[0].toFixed(2).padStart(8)} ms   ${times[1].toFixed(2).padStart(8)} ms   ${(times[1] - times[0] > 0 ? "+" : "") + (times[1] - times[0]).toFixed(2)} ms`);
    }
  }, 900_000);
});
