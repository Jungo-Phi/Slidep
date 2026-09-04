import { describe, it } from "vitest";
import { appendFileSync, writeFileSync } from "node:fs";
const OUT = "scratch/statics/out.txt";
const LOG = (s: string) => appendFileSync(OUT, s + String.fromCharCode(10));
import raw from "../../test-mechanisms/Masse suspendue.slidep?raw";
import { Point2 } from "../../src/types";
import { DynamicSnapshot } from "../../src/types/runtime-state";
import { load_mechanism } from "../../src/utils/load-mechanism";
import { shown_element_name } from "../../src/utils/string-math";
import {
  RECORD_DT,
  compile_simulation_model,
  step_dynamic_simulation,
} from "../../src/components/solver/dynamics/simulation-engine";
import { snapshot_point, snapshot_velocity } from "../../src/components/solver/snapshot";

function run(masslessBeams: boolean, frames: number) {
  const mechanism = load_mechanism(JSON.parse(raw)).mechanism;
  if (masslessBeams) for (const m of mechanism.materials) m.rho = 0;

  const beams = mechanism.mechanicalElements.filter((e) => e.type === "beam");
  const anchors = mechanism.mechanicalElements.filter(
    (e) => "isGrounded" in e && e.isGrounded,
  );
  const names = new Map(
    mechanism.mechanicalElements.map((e) => [e.id, shown_element_name(e)]),
  );

  const model = compile_simulation_model(mechanism, true);
  const out: {
    t: number;
    N: Map<string, number>;
    det: Map<string, boolean>;
    R: Map<string, Point2>;
    massV: number;
  }[] = [];
  let snapshot: DynamicSnapshot | null = null;
  const massNode = mechanism.mechanicalElements.find((e) => e.type === "mass")!;

  for (let i = 0; i < frames; i++) {
    snapshot = step_dynamic_simulation(
      model,
      i * RECORD_DT,
      snapshot,
      RECORD_DT,
      new Point2(0, -9.81),
    );
    const N = new Map<string, number>();
    const det = new Map<string, boolean>();
    for (const c of snapshot.beamCohesion ?? []) {
      const p0 = snapshot_point(snapshot, `${c.beamID}:start`);
      const p1 = snapshot_point(snapshot, `${c.beamID}:end`);
      if (!p0 || !p1) continue;
      const d = p1.sub(p0);
      const L = d.length();
      if (L < 1e-9) continue;
      const xh = d.mul(1 / L);
      N.set(names.get(c.beamID)!, c.start.fx * xh.x + c.start.fy * xh.y);
      det.set(names.get(c.beamID)!, c.determinate);
    }
    const R = new Map<string, Point2>();
    for (const a of anchors) {
      let fx = 0;
      let fy = 0;
      for (const r of snapshot.reactions ?? []) {
        if (r.kind !== "force" || !r.key.split(",").includes(a.id)) continue;
        fx += r.fx;
        fy += r.fy;
      }
      // `oppose_at_support`: what the ground pushes back with.
      R.set(names.get(a.id)!, new Point2(-fx, -fy));
    }
    const v = snapshot_velocity(snapshot, massNode.id);
    out.push({ t: i * RECORD_DT, N, det, R, massV: v ? v.length() : NaN });
  }
  return { out, beams: beams.map((b) => names.get(b.id)!), anchors: anchors.map((a) => names.get(a.id)!) };
}

function stats(vals: number[]) {
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  return { mean, min: Math.min(...vals), max: Math.max(...vals) };
}

describe("Masse suspendue — λ XPBD contre le calcul à la main", () => {
  it("mesure", () => {
    writeFileSync(OUT, "");
    for (const massless of [false, true]) {
      const frames = 600; // 10 s at RECORD_DT
      const { out, beams, anchors } = run(massless, frames);
      const tail = out.slice(Math.floor(frames * 0.5));
      LOG(`\n===== beams=${beams.join(", ")} | massless=${massless} =====`);
      LOG(`determinate: ${[...out[out.length - 1].det].map(([k, v]) => `${k}=${v}`).join(" ")}`);
      for (const b of beams) {
        const s = stats(tail.map((f) => f.N.get(b) ?? NaN));
        LOG(
          `N ${b.padEnd(14)} mean=${(s.mean / 1000).toFixed(2)} kN  [${(s.min / 1000).toFixed(2)} … ${(s.max / 1000).toFixed(2)}]`,
        );
      }
      for (const a of anchors) {
        const sx = stats(tail.map((f) => f.R.get(a)!.x));
        const sy = stats(tail.map((f) => f.R.get(a)!.y));
        LOG(
          `R ${a.padEnd(14)} x=${(sx.mean / 1000).toFixed(2)} kN [${(sx.min / 1000).toFixed(2)} … ${(sx.max / 1000).toFixed(2)}]  y=${(sy.mean / 1000).toFixed(2)} kN [${(sy.min / 1000).toFixed(2)} … ${(sy.max / 1000).toFixed(2)}]`,
        );
      }
      const sv = stats(tail.map((f) => f.massV));
      LOG(`|v| masse: mean=${sv.mean.toFixed(4)} m/s  max=${sv.max.toFixed(4)}`);
    }
  }, 120000);
});
