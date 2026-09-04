import { describe, it } from "vitest";
import { appendFileSync, writeFileSync } from "node:fs";
const OUT = "scratch/statics/out4.txt";
const LOG = (s: string) => appendFileSync(OUT, s + String.fromCharCode(10));
import trussRaw from "../../test-mechanisms/Masse suspendue.slidep?raw";
import dcRaw from "../../test-mechanisms/Double Cantilever.slidep?raw";
import { Point2 } from "../../src/types";
import { BeamCohesion, DynamicSnapshot } from "../../src/types/runtime-state";
import { load_mechanism } from "../../src/utils/load-mechanism";
import { shown_element_name } from "../../src/utils/string-math";
import {
  RECORD_DT,
  compile_simulation_model,
  step_dynamic_simulation,
} from "../../src/components/solver/dynamics/simulation-engine";
import { resolve_beam_cohesion } from "../../src/components/solver/dynamics/beam-cohesion";
import { snapshot_point } from "../../src/components/solver/snapshot";

/** Positions keyed by FUSED key, rebuilt from the snapshot — `resolve_beam_cohesion` wants
 *  the same map `step_dynamic_simulation` hands it. */
function fused_positions(snapshot: DynamicSnapshot, keys: string[]) {
  const out = new Map<string, Point2>();
  for (const fused of keys)
    for (const part of fused.split(",")) {
      const p = snapshot_point(snapshot, part);
      if (p) {
        out.set(fused, p);
        break;
      }
    }
  return out;
}

function readings(snapshot: DynamicSnapshot, cohesions: BeamCohesion[]) {
  return cohesions.map((c) => {
    const p0 = snapshot_point(snapshot, `${c.beamID}:start`)!;
    const p1 = snapshot_point(snapshot, `${c.beamID}:end`)!;
    const d = p1.sub(p0);
    const L = d.length();
    const xh = d.mul(1 / L);
    const yh = xh.perp();
    return {
      beamID: c.beamID,
      det: c.determinate,
      N: c.start.fx * xh.x + c.start.fy * xh.y,
      T: c.start.fx * yh.x + c.start.fy * yh.y,
      Mf: -c.start.m,
    };
  });
}

function run(raw: string, frames: number, label: string, exact: Record<string, string>) {
  const mechanism = load_mechanism(JSON.parse(raw)).mechanism;
  const names = new Map(mechanism.mechanicalElements.map((e) => [e.id, shown_element_name(e)]));
  const model = compile_simulation_model(mechanism, true);
  const fusedKeys = model.beamCohesionSpecs.flatMap((s) => [s.k0, s.k1]);

  let snapshot: DynamicSnapshot | null = null;
  const acc = new Map<string, { withB: number[]; noB: number[]; kind: string }[]>();
  for (let i = 0; i < frames; i++) {
    snapshot = step_dynamic_simulation(model, i * RECORD_DT, snapshot, RECORD_DT, new Point2(0, -9.81));
    if (i < frames / 2) continue; // let the transient die
    const lambdaOnly = resolve_beam_cohesion(
      model.beamCohesionSpecs,
      snapshot.reactions ?? [],
      fused_positions(snapshot, fusedKeys),
    );
    const a = readings(snapshot, snapshot.beamCohesion ?? []);
    const b = readings(snapshot, lambdaOnly);
    for (let k = 0; k < a.length; k++) {
      const name = names.get(a[k].beamID)!;
      if (!acc.has(name))
        acc.set(name, [
          { withB: [], noB: [], kind: "N" },
          { withB: [], noB: [], kind: "T" },
          { withB: [], noB: [], kind: "Mf" },
        ]);
      const rows = acc.get(name)!;
      rows[0].withB.push(a[k].N);
      rows[0].noB.push(b[k].N);
      rows[1].withB.push(a[k].T);
      rows[1].noB.push(b[k].T);
      rows[2].withB.push(a[k].Mf);
      rows[2].noB.push(b[k].Mf);
      rows[0].kind = `N${a[k].det ? " (det)" : ""}`;
    }
  }
  const mean = (v: number[]) => v.reduce((x, y) => x + y, 0) / v.length;
  LOG(`\n===== ${label} =====`);
  LOG(`${"poutre".padEnd(14)} ${"grandeur".padEnd(10)} ${"actuel".padStart(12)} ${"λ seul".padStart(12)}   exact`);
  for (const [name, rows] of acc)
    for (const r of rows)
      LOG(
        `${name.padEnd(14)} ${r.kind.padEnd(10)} ${mean(r.withB).toFixed(3).padStart(12)} ${mean(r.noB).toFixed(3).padStart(12)}   ${exact[`${name}|${r.kind.split(" ")[0]}`] ?? ""}`,
      );
}

describe("λ seul contre λ+balance", () => {
  it("mesure", () => {
    writeFileSync(OUT, "");
    run(dcRaw, 400, "Double Cantilever (10 N en bout, 15.402 N par demi-poutre)", {
      "Beam Kedi|T": "-40.804",
      "Beam Kedi|Mf": "-25.402",
      "Beam Lijl|T": "-25.402",
      "Beam Lijl|Mf": "-8.850",
      "Beam Kedi|N": "0",
      "Beam Lijl|N": "0",
    });
    run(trussRaw, 600, "Masse suspendue (5 T)", {
      "Beam Epan|N": "114500",
      "Beam Iqla|N": "34300",
      "Beam Ulsu|N": "-59800",
      "Beam Lukn|N": "-119500",
      "Beam Dode|N": "49050",
    });
  }, 240000);
});
