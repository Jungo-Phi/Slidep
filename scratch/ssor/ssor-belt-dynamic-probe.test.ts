import { describe, it } from "vitest";
import { appendFileSync } from "node:fs";
import huygensJson from "../../test-mechanisms/Huygen's chain drive.slidep?raw";
import { Mechanism, Point2 } from "../../src/types";
import { DynamicSnapshot } from "../../src/types/runtime-state";
import { load_mechanism } from "../../src/utils/load-mechanism";
import {
  RECORD_DT,
  compile_simulation_model,
  step_dynamic_simulation,
} from "../../src/components/solver/simulation-engine";
import { snapshot_angle } from "../../src/components/solver/snapshot";

/**
 * A closed belt's circulation is a free mode, and reversing the sweep direction picks a
 * different point along it each pass — measured in kinematic mode as unbounded drift (72 % of
 * the travel). Kinematic no longer alternates, but DYNAMIC does, and no test covers a closed
 * belt there. This asks the same question of `step_dynamic_simulation`: listing the belt from
 * another pulley must not change where the mechanism ends up.
 */
const GRAVITY = new Point2(0, -9.81);
const deg = (r: number) => (r * 180) / Math.PI;

/** The same mechanism, its closed belts listed from pulley `by` onwards. */
function rotated(by: number): Mechanism {
  const mechanism = load_mechanism(JSON.parse(huygensJson)).mechanism;
  for (const el of mechanism.mechanicalElements) {
    if (el.type !== "belt" || !el.closed) continue;
    const n = el.attachedGearsIDs.length;
    const k = by % n;
    const rot = <T>(a: T[]) => [...a.slice(k), ...a.slice(0, k)];
    el.attachedGearsIDs = rot(el.attachedGearsIDs);
    if (el.gearWraps) el.gearWraps = rot(el.gearWraps);
    if (el.disconnectedGearIndices)
      el.disconnectedGearIndices = el.disconnectedGearIndices.map(
        (i) => (i - k + n) % n,
      );
  }
  return mechanism;
}

function angles_at(mech: Mechanism, frames: number): Map<string, number> {
  const model = compile_simulation_model(mech);
  let snapshot: DynamicSnapshot | null = null;
  for (let i = 0; i < frames; i++)
    snapshot = step_dynamic_simulation(
      model,
      i * RECORD_DT,
      snapshot,
      RECORD_DT,
      GRAVITY,
    );
  const out = new Map<string, number>();
  for (const el of mech.mechanicalElements)
    if (el.type === "gear") out.set(el.id, snapshot_angle(snapshot!, el.id) ?? NaN);
  return out;
}

function max_gap(a: Map<string, number>, b: Map<string, number>): number {
  let worst = 0;
  for (const [id, angle] of a)
    worst = Math.max(worst, Math.abs(deg(angle - (b.get(id) ?? NaN))));
  return worst;
}

describe("closed belt, dynamic mode", () => {
  it("Huygens", () => {
    const lines = ["### Huygens en DYNAMIQUE — écart entre deux listages, par horizon"];
    for (const frames of [30, 60, 120]) {
      const reference = angles_at(rotated(0), frames);
      const gap = Math.max(
        max_gap(reference, angles_at(rotated(1), frames)),
        max_gap(reference, angles_at(rotated(2), frames)),
      );
      lines.push(`frames=${frames}\técartMax=${gap.toFixed(5)}°`);
    }
    appendFileSync(process.env.SSOR_OUT!, lines.join("\n") + "\n", "utf8");
  }, 900_000);
});
