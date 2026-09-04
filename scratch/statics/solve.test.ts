import { describe, it } from "vitest";
import { appendFileSync, writeFileSync } from "node:fs";
const OUT = "scratch/statics/out8.txt";
const LOG = (s: string) => appendFileSync(OUT, s + String.fromCharCode(10));
import trussRaw from "../../test-mechanisms/Masse suspendue.slidep?raw";
import dcRaw from "../../test-mechanisms/Double Cantilever.slidep?raw";
import { Point2 } from "../../src/types";
import { DynamicSnapshot } from "../../src/types/runtime-state";
import { load_mechanism } from "../../src/utils/load-mechanism";
import { shown_element_name } from "../../src/utils/string-math";
import {
  RECORD_DT,
  compile_simulation_model,
  step_dynamic_simulation,
} from "../../src/components/solver/dynamics/simulation-engine";
import { resolve_load_forces } from "../../src/components/solver/dynamics/load-model";
import { build_statics_system } from "../../src/components/solver/statics/equilibrium-model";
import { solve_statics } from "../../src/components/solver/statics/equilibrium-solve";
import { statics_frame } from "../../src/components/solver/statics/statics-frame";
import { snapshot_point } from "../../src/components/solver/snapshot";

const G = new Point2(0, -9.81);
const ZERO = new Point2(0, 0);

function run(raw: string, frames: number, label: string) {
  const mechanism = load_mechanism(JSON.parse(raw)).mechanism;
  const names = new Map(mechanism.mechanicalElements.map((e) => [e.id, shown_element_name(e)]));
  const model = compile_simulation_model(mechanism, true);
  let snapshot: DynamicSnapshot | null = null;
  for (let i = 0; i < frames; i++)
    snapshot = step_dynamic_simulation(model, i * RECORD_DT, snapshot, RECORD_DT, G);

  const isAnchored = (key: string) => (model.dynamicMasses.posMasses.get(key) ?? 1) <= 0;
  const system = build_statics_system(
    model.beamCohesionSpecs,
    model.links,
    mechanism.mechanicalElements,
    isAnchored,
  );

  const positions = new Map<string, Point2>();
  for (const spec of model.beamCohesionSpecs)
    for (const k of [spec.k0, spec.k1, ...spec.attachedNodes.map((n) => n.nodeKey)]) {
      for (const part of k.split(",")) {
        const p = snapshot_point(snapshot!, part);
        if (p) { positions.set(k, p); break; }
      }
    }
  const loads = resolve_load_forces(model.compiledLoads, positions);

  const frame = statics_frame(
    mechanism, model.beamCohesionSpecs, model.dynamicMasses, snapshot!, G,
    (k) => loads.forces.get(k) ?? ZERO,
    (k) => loads.distributed.get(k) ?? ZERO,
  );
  const solution = solve_statics(system, model.beamCohesionSpecs, frame)!;

  LOG(`\n===== ${label} =====`);
  LOG(`inconnues=${system.columns} lignes=${system.rows} indetermination=${solution.indeterminacy} residu=${solution.residual.toFixed(4)} (echelle ${solution.scale.toFixed(1)})`);
  for (const t of solution.torsors) {
    const who = t.beamID ? names.get(t.beamID)! : "APPUI/EXT";
    const node = t.nodeKey.split(",").map((p) => names.get(p.replace(/:(start|end)$/, "")) ?? p.slice(0, 6)).join("+");
    const det = `${t.determined.fx ? "F" : "f"}${t.determined.fy ? "F" : "f"}${t.determined.m ? "M" : "m"}`;
    LOG(`  ${who.padEnd(12)} -> ${node.slice(0, 40).padEnd(42)} s=${Number.isNaN(t.s) ? "  -  " : t.s.toFixed(3)} F=(${t.fx.toFixed(2)}, ${t.fy.toFixed(2)}) M=${t.m.toFixed(3)} [${det}]${t.foreign ? " ETRANGER" : ""}`);
  }
  // N per beam, from the torsor at its start: R_coh(0+) is what the beam applies onto k0.
  for (const spec of model.beamCohesionSpecs) {
    const t = solution.torsors.find((x) => x.beamID === spec.beamID && x.s === 0);
    if (!t) continue;
    const p0 = snapshot_point(snapshot!, `${spec.beamID}:start`)!;
    const p1 = snapshot_point(snapshot!, `${spec.beamID}:end`)!;
    const xhat = p1.sub(p0).normalize();
    LOG(`  N ${names.get(spec.beamID)!.padEnd(12)} = ${((t.fx * xhat.x + t.fy * xhat.y) / 1000).toFixed(3)} kN`);
  }
}

describe("solve de statique", () => {
  it("mesure", () => {
    writeFileSync(OUT, "");
    LOG("Verite Masse suspendue : Epan +114.5  Iqla +34.3  Ulsu -59.8  Lukn -119.5  Dode +49.05 kN ; appuis Dicu -114.5, Uqin +163.5");
    LOG("Verite Double Cantilever : encastrement 40.804 N, moment 25.402 N.m");
    run(dcRaw, 400, "Double Cantilever");
    run(trussRaw, 600, "Masse suspendue");
  }, 300_000);
});
