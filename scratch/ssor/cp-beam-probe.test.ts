import { describe, it } from "vitest";
import { appendFileSync } from "node:fs";
import cpJson from "../../test-mechanisms/CP.slidep?raw";
import { load_mechanism } from "../../src/utils/load-mechanism";
import { Mechanism, Point2 } from "../../src/types";
import type { ID } from "../../src/types/element";
import { DynamicSnapshot } from "../../src/types/runtime-state";
import { RECORD_DT, compile_simulation_model, step_dynamic_simulation } from "../../src/components/solver/simulation-engine";
import { snapshot_point } from "../../src/components/solver/snapshot";

/** Where the residual actually sits on CP.slidep now: the rider's place on its beam, or the
 *  beam's own length? */
const GRAVITY = new Point2(0, -9.81);
const first = (k: string): ID => k.split(",")[0] as ID;

function errors(mech: Mechanism, frames: number) {
  const model = compile_simulation_model(mech);
  const at = (s: DynamicSnapshot, k: string) => snapshot_point(s, first(k));
  let snap: DynamicSnapshot | null = null;
  let stretch = 0, ride = 0, stretchRel = 0;
  for (let i = 0; i < frames; i++) {
    snap = step_dynamic_simulation(model, i * RECORD_DT, snap, RECORD_DT, GRAVITY);
    for (const link of model.links) {
      if (link.type === "Distance") {
        const a = at(snap, link.key1), b = at(snap, link.key2);
        if (!a || !b) continue;
        const e = Math.abs(a.distance_to(b) - link.distance);
        stretch = Math.max(stretch, e);
        if (link.distance > 0) stretchRel = Math.max(stretchRel, e / link.distance);
      } else if (link.type === "FixedOnSegment") {
        const s = at(snap, link.key1), e2 = at(snap, link.key2), n = at(snap, link.key3);
        if (!s || !e2 || !n) continue;
        ride = Math.max(ride, n.distance_to(s.lerp(e2, link.t)));
      }
    }
  }
  return { stretch, ride, stretchRel };
}

describe("CP beam", () => {
  it("CP.slidep", () => {
    const base = load_mechanism(JSON.parse(cpJson)).mechanism;
    const lines = ["### CP.slidep — où est le résidu (production)"];
    for (const mass of [1, 100, 300, 1000, 3000]) {
      const m = { ...base, mechanicalElements: base.mechanicalElements.map((e) => e.type === "mass" ? { ...e, mass } : e) };
      const { stretch, ride, stretchRel } = errors(m as Mechanism, 40);
      lines.push(`mass=${mass}\tallongementPoutre=${stretch.toExponential(3)} (${(100*stretchRel).toFixed(3)} %)\tpositionCavalier=${ride.toExponential(3)}`);
    }
    appendFileSync(process.env.SSOR_OUT!, lines.join("\n") + "\n", "utf8");
  }, 600_000);
});
