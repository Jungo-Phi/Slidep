import { describe, expect, it } from "vitest";
import json from "../../../../test-mechanisms/Poulie tombante.slidep?raw";
import { load_mechanism } from "../../../utils/load-mechanism";
import { Point2 } from "../../../types";
import { DynamicSnapshot } from "../../../types/runtime-state";
import {
  RECORD_DT,
  apply_dynamic_snapshot_to_mechanism,
  compile_simulation_model,
  step_dynamic_simulation,
} from "../dynamics/simulation-engine";
import { compute_force_balance } from "../analysis/force-balance";
import { snapshot_point } from "../snapshot";

// An open belt from a 50 g mass, over a grounded pulley, under a free pulley, to a grounded end.
// The free pulley climbs until its rim lands on that grounded end, rolls over it for some 150 ms and drops off the belt.
// While it rests there the end carries it radially — the dynamics' non-penetration contact — a push no strand tension can stand for.

const GRAVITY = new Point2(0, -9.81);
const FREE_AXLE = "6c589291-1a28-4653-ae8b-f9c3f876ba2a";
const ANCHOR = new Point2(0.1500020671287006, 0.1999999841091484);
const RADIUS = 0.045;

describe("a belt's free end resting on its pulley's rim (Poulie tombante)", () => {
  it("closes the force balance while the pulley rolls on the anchored end", () => {
    const mechanism = load_mechanism(JSON.parse(json)).mechanism;
    const model = compile_simulation_model(mechanism, true, true);
    let snapshot: DynamicSnapshot | null = null;
    let resting = 0;
    let worstForce = 0;
    let worstMoment = 0;
    for (let i = 0; i < Math.round(1.7 / RECORD_DT); i++) {
      snapshot = step_dynamic_simulation(model, i * RECORD_DT, snapshot, RECORD_DT, GRAVITY);
      if (i < 2) continue;
      const balance = compute_force_balance(
        apply_dynamic_snapshot_to_mechanism(mechanism, snapshot),
        snapshot,
        GRAVITY,
      )!;
      const gap = snapshot_point(snapshot, FREE_AXLE)!.distance_to(ANCHOR) - RADIUS;
      if (Math.abs(gap) < 1e-5) resting++;
      worstForce = Math.max(worstForce, balance.gap.length());
      // The grounded pulley's joint friction included: its bearing passes that couple to the ground.
      worstMoment = Math.max(worstMoment, Math.abs(balance.gapMoment));
    }
    // The scenario still happens: without it this test would pass on nothing.
    expect(resting).toBeGreaterThan(10);
    // Against a 1.9 N total weight; the missing contact read 0.6 N here.
    expect(worstForce).toBeLessThan(1e-3);
    expect(worstMoment).toBeLessThan(1e-3);
  }, 30_000);
});
