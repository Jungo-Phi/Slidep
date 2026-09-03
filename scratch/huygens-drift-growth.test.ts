import { describe, it } from "vitest";
import huygensJson from "../test-mechanisms/Huygen's chain drive.slidep?raw";
import { Mechanism, Point2 } from "../src/types";
import { DynamicSnapshot } from "../src/types/runtime-state";
import { load_mechanism } from "../src/utils/load-mechanism";
import {
  RECORD_DT,
  compile_simulation_model,
  step_dynamic_simulation,
} from "../src/components/solver/dynamics/simulation-engine";
import { snapshot_angle } from "../src/components/solver/snapshot";

const deg = (r: number) => (r * 180) / Math.PI;

function rotated(json: string, by: number): Mechanism {
  const mechanism = load_mechanism(JSON.parse(json)).mechanism;
  for (const el of mechanism.mechanicalElements) {
    if (el.type !== "belt" || !el.closed) continue;
    const n = el.attachedGearsIDs.length;
    const k = by % n;
    const rot = <T>(a: T[]) => [...a.slice(k), ...a.slice(0, k)];
    el.attachedGearsIDs = rot(el.attachedGearsIDs);
    if (el.gearWraps) el.gearWraps = rot(el.gearWraps);
  }
  return mechanism;
}

/** Angles at EVERY frame (not just the last), so the growth shape is visible. */
function runTrace(mechanism: Mechanism, frames: number): Map<string, number>[] {
  const model = compile_simulation_model(mechanism);
  const gears = mechanism.mechanicalElements.filter((e) => e.type === "gear");
  let snapshot: DynamicSnapshot | null = null;
  const trace: Map<string, number>[] = [];
  for (let i = 0; i < frames; i++) {
    snapshot = step_dynamic_simulation(
      model,
      i * RECORD_DT,
      snapshot,
      RECORD_DT,
      new Point2(0, -9.81),
    );
    const now = new Map<string, number>();
    for (const gear of gears)
      now.set(gear.id, snapshot_angle(snapshot, gear.id) ?? NaN);
    trace.push(now);
  }
  return trace;
}

describe("croissance de l'écart de listage — Huygens dynamique", () => {
  it("trace frame par frame", () => {
    const traceA = runTrace(rotated(huygensJson, 0), 60);
    const traceB = runTrace(rotated(huygensJson, 1), 60);

    let cumTravel = 0;
    let prevA: Map<string, number> | null = null;
    const rows: string[] = [];
    for (let f = 0; f < 60; f++) {
      const a = traceA[f];
      const b = traceB[f];
      let maxGapDeg = 0;
      let maxStepDeg = 0;
      for (const [id, angleA] of a) {
        const angleB = b.get(id) ?? NaN;
        maxGapDeg = Math.max(maxGapDeg, Math.abs(deg(angleA - angleB)));
        if (prevA) maxStepDeg = Math.max(maxStepDeg, Math.abs(deg(angleA - (prevA.get(id) ?? angleA))));
      }
      cumTravel += maxStepDeg;
      rows.push(
        `frame ${String(f).padStart(2)}: gap=${maxGapDeg.toExponential(4)}°  ` +
          `cumTravel=${cumTravel.toFixed(3)}°  ratio=${((maxGapDeg / Math.max(cumTravel, 1e-12)) * 100).toExponential(4)}%`,
      );
      prevA = a;
    }
    // eslint-disable-next-line no-console
    console.log(rows.join("\n"));
  }, 60_000);
});
