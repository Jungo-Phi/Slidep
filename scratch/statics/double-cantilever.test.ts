import { describe, it } from "vitest";
import { appendFileSync, writeFileSync } from "node:fs";
const OUT = "scratch/statics/out2.txt";
const LOG = (s: string) => appendFileSync(OUT, s + String.fromCharCode(10));
import raw from "../../test-mechanisms/Double Cantilever.slidep?raw";
import { Point2 } from "../../src/types";
import { DynamicSnapshot } from "../../src/types/runtime-state";
import { load_mechanism } from "../../src/utils/load-mechanism";
import { shown_element_name } from "../../src/utils/string-math";
import {
  RECORD_DT,
  compile_simulation_model,
  step_dynamic_simulation,
} from "../../src/components/solver/dynamics/simulation-engine";
import { snapshot_point } from "../../src/components/solver/snapshot";

function run(masslessBeams: boolean, frames: number) {
  const mechanism = load_mechanism(JSON.parse(raw)).mechanism;
  if (masslessBeams) for (const m of mechanism.materials) m.rho = 0;
  const names = new Map(
    mechanism.mechanicalElements.map((e) => [e.id, shown_element_name(e)]),
  );
  const model = compile_simulation_model(mechanism, true);
  let snapshot: DynamicSnapshot | null = null;
  for (let i = 0; i < frames; i++)
    snapshot = step_dynamic_simulation(
      model,
      i * RECORD_DT,
      snapshot,
      RECORD_DT,
      new Point2(0, -9.81),
    );
  LOG(`\n===== Double Cantilever | massless=${masslessBeams} =====`);
  for (const c of snapshot!.beamCohesion ?? []) {
    const p0 = snapshot_point(snapshot!, `${c.beamID}:start`)!;
    const p1 = snapshot_point(snapshot!, `${c.beamID}:end`)!;
    const d = p1.sub(p0);
    const L = d.length();
    const xh = d.mul(1 / L);
    const yh = xh.perp();
    // R_coh(0+) = start (unflipped force), Mf(0) = -start.m  — see cohesion-field.ts
    const N = c.start.fx * xh.x + c.start.fy * xh.y;
    const T = c.start.fx * yh.x + c.start.fy * yh.y;
    const Mf = -c.start.m;
    LOG(
      `${names.get(c.beamID)!.padEnd(12)} det=${String(c.determinate).padEnd(5)} p0=(${p0.x.toFixed(3)},${p0.y.toFixed(3)}) L=${L.toFixed(3)}  N(0)=${N.toFixed(3)}  T(0)=${T.toFixed(3)}  Mf(0)=${Mf.toFixed(3)}`,
    );
  }
  for (const r of snapshot!.reactions ?? []) {
    if (!r.atAnchor) continue;
    LOG(
      `  anchor ${r.key.padEnd(48)} ${r.type.padEnd(16)} ${r.kind === "force" ? `f=(${r.fx.toFixed(3)},${r.fy.toFixed(3)})` : `m=${r.torque.toFixed(3)}`}`,
    );
  }
}

describe("Double Cantilever", () => {
  it("mesure", () => {
    writeFileSync(OUT, "");
    run(true, 400);
    run(false, 400);
  }, 120000);
});
