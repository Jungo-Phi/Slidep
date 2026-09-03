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

function finalAngles(mechanism: Mechanism, frames: number, sweeps: number): Map<string, number> {
  const model = compile_simulation_model(mechanism);
  const gears = mechanism.mechanicalElements.filter((e) => e.type === "gear");
  let snapshot: DynamicSnapshot | null = null;
  for (let i = 0; i < frames; i++)
    snapshot = step_dynamic_simulation(
      model,
      i * RECORD_DT,
      snapshot,
      RECORD_DT,
      new Point2(0, -9.81),
      undefined,
      sweeps,
    );
  const out = new Map<string, number>();
  for (const gear of gears) out.set(gear.id, snapshot_angle(snapshot!, gear.id) ?? NaN);
  return out;
}

function maxGap(a: Map<string, number>, b: Map<string, number>): number {
  let worst = 0;
  for (const [id, angle] of a) worst = Math.max(worst, Math.abs(deg(angle - (b.get(id) ?? NaN))));
  return worst;
}

describe("sensibilite au budget de sweeps, en dynamique, sur la course complete", () => {
  it("200 vs 3200 sweeps, 60 frames, by=0 vs by=1", () => {
    for (const sweeps of [200, 3200]) {
      const a = finalAngles(rotated(huygensJson, 0), 60, sweeps);
      const b = finalAngles(rotated(huygensJson, 1), 60, sweeps);
      const gap = maxGap(a, b);
      // eslint-disable-next-line no-console
      console.log(`sweeps=${sweeps}: gap max = ${gap.toFixed(4)}°`);
    }
  }, 120_000);
});
