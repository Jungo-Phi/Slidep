import { describe, it } from "vitest";
import { appendFileSync, writeFileSync } from "node:fs";
const OUT = "scratch/statics/out3.txt";
const LOG = (s: string) => appendFileSync(OUT, s + String.fromCharCode(10));
import raw from "../../test-mechanisms/Double Cantilever.slidep?raw";
import { Point2 } from "../../src/types";
import { DynamicSnapshot } from "../../src/types/runtime-state";
import { load_mechanism } from "../../src/utils/load-mechanism";
import { shown_element_name } from "../../src/utils/string-math";
import { beam_linear_mass } from "../../src/utils/section-properties";
import {
  RECORD_DT,
  compile_simulation_model,
  step_dynamic_simulation,
} from "../../src/components/solver/dynamics/simulation-engine";
import { snapshot_point } from "../../src/components/solver/snapshot";

describe("Double Cantilever — masses et liens", () => {
  it("mesure", () => {
    writeFileSync(OUT, "");
    const mechanism = load_mechanism(JSON.parse(raw)).mechanism;
    const names = new Map(mechanism.mechanicalElements.map((e) => [e.id, shown_element_name(e)]));
    for (const e of mechanism.mechanicalElements) {
      if (e.type !== "beam") continue;
      const L = e.positionEnd.distance_to(e.positionStart);
      const mu = beam_linear_mass(e.materialID, e.profileID, mechanism.materials, mechanism.profiles);
      LOG(`${names.get(e.id)} L=${L.toFixed(4)} mu=${mu.toFixed(4)} kg/m  m=${(mu * L).toFixed(4)} kg  poids=${(mu * L * 9.81).toFixed(3)} N  mat=${e.materialID?.slice(0, 6)} prof=${e.profileID?.slice(0, 6)}`);
    }
    LOG("loads " + JSON.stringify(mechanism.loads));
    const model = compile_simulation_model(mechanism, true);
    LOG("\nLIENS:");
    for (const l of model.links) LOG(`  ${l.type} ddl=${l.ddl} ${JSON.stringify(l).slice(0, 220)}`);

    let snapshot: DynamicSnapshot | null = null;
    for (let i = 0; i < 400; i++)
      snapshot = step_dynamic_simulation(model, i * RECORD_DT, snapshot, RECORD_DT, new Point2(0, -9.81));
    LOG("\nCOHESION (massif):");
    for (const c of snapshot!.beamCohesion ?? []) {
      const p0 = snapshot_point(snapshot!, `${c.beamID}:start`)!;
      const p1 = snapshot_point(snapshot!, `${c.beamID}:end`)!;
      const d = p1.sub(p0), L = d.length(), xh = d.mul(1 / L), yh = xh.perp();
      LOG(`  ${names.get(c.beamID)} det=${c.determinate} T(0)=${(c.start.fx * yh.x + c.start.fy * yh.y).toFixed(3)} Mf(0)=${(-c.start.m).toFixed(3)} startAnchor=${c.start.atAnchor} endAnchor=${c.end.atAnchor} attached=${JSON.stringify(c.attachedNodes)}`);
    }
    LOG("\nREACTIONS (toutes):");
    for (const r of snapshot!.reactions ?? [])
      LOG(`  ${r.type.padEnd(16)} anchor=${r.atAnchor} ${r.key.slice(0, 60).padEnd(62)} ${r.kind === "force" ? `f=(${r.fx.toFixed(3)},${r.fy.toFixed(3)})` : `m=${r.torque.toFixed(3)}`}`);
  }, 120000);
});
