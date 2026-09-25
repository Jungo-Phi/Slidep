import { writeFileSync } from "node:fs";
import { describe, it } from "vitest";
import { Point2 } from "../src/types";
import { DynamicSnapshot } from "../src/types/runtime-state";
import { load_mechanism } from "../src/utils/load-mechanism";
import { RECORD_DT, compile_simulation_model, step_dynamic_simulation } from "../src/components/solver/dynamics/simulation-engine";

const files = import.meta.glob("../test-mechanisms/*.slidep", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const FRAMES = 180;
const RATIOS = [0];
const OUT = process.env.OUT_FILE!;

function run(json: string, ratio: number) {

  const mechanism = load_mechanism(JSON.parse(json)).mechanism;
  const model = compile_simulation_model(mechanism);
  const sim = mechanism.simulation;
  const gravity = sim.gravity ? new Point2(0, -9.81) : new Point2(0, 0);
  const log: number[] = [];
  (globalThis as any).__swLog = log;
  let s: DynamicSnapshot | null = null;
  let e0: number | undefined;
  let input = 0, drift = 0, jump = 0, track = 0;
  let prevNm: number[] | undefined;
  const t0 = performance.now();
  for (let f = 0; f < FRAMES; f++) {
    s = step_dynamic_simulation(model, f * RECORD_DT, s, RECORD_DT, gravity, undefined, 200, true, sim.collisions, sim.floor.enabled);
    const e = s.energy!;
    const mech = e.kinetic + e.potentialGravity + e.potentialSpring;
    const motors = s.motor ?? [];
    if (e0 === undefined) e0 = mech;
    else input += (motors.reduce((a, m) => a + m.watts, 0) + e.loadPower - e.damperPower - e.frictionPower) * RECORD_DT - e.impactLoss;
    drift = Math.max(drift, Math.abs(mech - e0 - input));
    if (f >= 60) {
      motors.forEach((m, i) => {
        if (prevNm) jump = Math.max(jump, Math.abs(m.nm - prevNm[i]));
        const omega = model.compiledMotors[i]?.omega ?? 0;
        if (!m.saturated && omega !== 0) track = Math.max(track, Math.abs(m.speed - omega) / Math.abs(omega));
      });
    }
    prevNm = motors.map((m) => m.nm);
  }
  (globalThis as any).__swLog = undefined;
  const ms = (performance.now() - t0) / FRAMES;
  const capped = log.filter((n) => n >= 200).length / log.length;
  const perFrame = log.reduce((a, b) => a + b, 0) / FRAMES;
  return { ms, capped, perFrame, drift, jump, track, motors: prevNm?.length ?? 0 };
}

describe("gallery exit criterion", () => {
  it("ratios", () => {
    const rows: string[] = [`ratios ${RATIOS.join(", ")} (0 = old criterion); per ratio: ms/frame sweeps/frame capped% drift(J) jump(N·m) track(%)`];
    for (const [path, json] of Object.entries(files)) {
      const name = path.split("/").pop()!;
      if (name === "Pendulum clock.slidep") continue;
      rows.push(name);
      for (const r of RATIOS) {
        try {
          const o = run(json, r);
          rows.push(`  ${String(r).padEnd(6)} ${o.ms.toFixed(1).padStart(6)} ${o.perFrame.toFixed(0).padStart(5)} ${(o.capped * 100).toFixed(0).padStart(3)}% ${o.drift.toFixed(3).padStart(8)} ${o.motors ? o.jump.toFixed(2).padStart(6) : "     -"} ${o.motors ? (o.track * 100).toFixed(2).padStart(6) : "     -"}`);
        } catch (err) {
          rows.push(`  ${r} ERROR ${(err as Error).message}`);
        }
        writeFileSync(OUT, rows.join("\n"));
      }
    }
  }, 3_600_000);
});
