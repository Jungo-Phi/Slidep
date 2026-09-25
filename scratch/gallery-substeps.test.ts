import { writeFileSync } from "node:fs";
import { describe, it } from "vitest";
import { Point2 } from "../src/types";
import { DynamicSnapshot } from "../src/types/runtime-state";
import { load_mechanism } from "../src/utils/load-mechanism";
import { RECORD_DT, compile_simulation_model, step_dynamic_simulation } from "../src/components/solver/dynamics/simulation-engine";

const files = import.meta.glob("../test-mechanisms/*.slidep", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const SKIPPED = new Set(["Pendulum clock.slidep"]);
const FRAMES = 240;

function run(json: string, substeps: number) {
  const mechanism = load_mechanism(JSON.parse(json)).mechanism;
  const model = compile_simulation_model(mechanism);
  const sim = mechanism.simulation;
  const gravity = sim.gravity ? new Point2(0, -9.81) : new Point2(0, 0);
  let s: DynamicSnapshot | null = null;
  let e0: number | undefined;
  let input = 0;
  let worstDrift = 0;
  let maxJump = 0;
  let prevNm: number[] | undefined;
  const t0 = performance.now();
  for (let f = 0; f < FRAMES; f++) {
    s = step_dynamic_simulation(model, f * RECORD_DT, s, RECORD_DT, gravity, undefined, 200, true, sim.collisions, sim.floor.enabled, substeps);
    const e = s.energy!;
    const mech = e.kinetic + e.potentialGravity + e.potentialSpring;
    const motorW = (s.motor ?? []).reduce((a, m) => a + m.watts, 0);
    if (e0 === undefined) e0 = mech;
    else input += (motorW + e.loadPower - e.damperPower - e.frictionPower) * RECORD_DT - e.impactLoss;
    worstDrift = Math.max(worstDrift, Math.abs(mech - e0 - input));
    const nm = (s.motor ?? []).map((m) => m.nm);
    if (prevNm && f >= 60) nm.forEach((v, i) => (maxJump = Math.max(maxJump, Math.abs(v - prevNm![i]))));
    prevNm = nm;
  }
  return { ms: (performance.now() - t0) / FRAMES, worstDrift, maxJump, motors: prevNm?.length ?? 0 };
}

describe("gallery substeps", () => {
  it("16 vs 64", () => {
    const rows: string[] = ["mechanism | ms16 | ms64 | ratio | drift16 J | drift64 J | jump16 N·m | jump64 N·m"];
    for (const [path, json] of Object.entries(files)) {
      const name = path.split("/").pop()!;
      if (SKIPPED.has(name)) continue;
      try {
        const a = run(json, 16);
        const b = run(json, 64);
        rows.push(
          `${name} | ${a.ms.toFixed(1)} | ${b.ms.toFixed(1)} | ${(b.ms / a.ms).toFixed(2)} | ${a.worstDrift.toFixed(3)} | ${b.worstDrift.toFixed(3)} | ${a.motors ? a.maxJump.toFixed(2) : "-"} | ${b.motors ? b.maxJump.toFixed(2) : "-"}`,
        );
      } catch (err) {
        rows.push(`${name} | ERROR ${(err as Error).message}`);
      }
      writeFileSync("C:/Users/arnol/Documents/slidep/scratch/gallery-substeps.txt", rows.join("\n"));
    }
  }, 3_600_000);
});
