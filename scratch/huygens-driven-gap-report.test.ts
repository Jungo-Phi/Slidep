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
    if (el.disconnectedGearIndices)
      el.disconnectedGearIndices = el.disconnectedGearIndices.map((i) => (i - k + n) % n);
  }
  return mechanism;
}

function fell(mechanism: Mechanism, frames: number, gravity: Point2) {
  const model = compile_simulation_model(mechanism);
  const gears = mechanism.mechanicalElements.filter((e) => e.type === "gear");
  const travel = new Map<string, number>();
  let snapshot: DynamicSnapshot | null = null;
  let previous: Map<string, number> | null = null;
  for (let i = 0; i < frames; i++) {
    snapshot = step_dynamic_simulation(model, i * RECORD_DT, snapshot, RECORD_DT, gravity);
    const now = new Map<string, number>();
    for (const gear of gears) now.set(gear.id, snapshot_angle(snapshot, gear.id) ?? NaN);
    if (previous)
      for (const [id, angle] of now)
        travel.set(id, (travel.get(id) ?? 0) + Math.abs(angle - previous.get(id)!));
    previous = now;
  }
  return { angles: previous!, travel };
}

function maxGap(a: Map<string, number>, b: Map<string, number>): number {
  let worst = 0;
  for (const [id, angle] of a) worst = Math.max(worst, Math.abs(deg(angle - (b.get(id) ?? NaN))));
  return worst;
}
function maxTravel(travel: Map<string, number>): number {
  return Math.max(...[...travel.values()].map((a) => Math.abs(deg(a))));
}

const GRAVITY = new Point2(0, -9.81);

describe("rapport: Huygens entraîné, gap par horizon", () => {
  it("60 et 100 frames", () => {
    for (const frames of [60, 100]) {
      const driven = (by: number) => fell(rotated(huygensJson, by), frames, GRAVITY);
      const reference = driven(0);
      const travelled = maxTravel(reference.travel);
      const gaps = [1, 2].map((by) => maxGap(reference.angles, driven(by).angles));
      // eslint-disable-next-line no-console
      console.log(
        `frames=${frames} travelled=${travelled.toFixed(3)}deg gaps=[${gaps.map((g) => g.toFixed(4)).join(", ")}]deg ratio=[${gaps.map((g) => ((100 * g) / travelled).toFixed(2)).join(", ")}]%`,
      );
    }
  }, 120_000);
});
