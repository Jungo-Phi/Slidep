import { describe, expect, it } from "vitest";
import json from "../../../../test-mechanisms/Puente.slidep?raw";
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

// A motor-driven truss bridge on a fixed pivot, the motor's own axle, and a grounded slider whose rail is the beam it holds horizontal.
// That slider is prismatic: it passes a couple to its rail, about 6.8 N·m here, which the moment balance needs from it.

const GRAVITY = new Point2(0, -9.81);
const SLIDER = "28c760e3-fb68-4c7e-a295-e679a3628e26";

describe("Puente: the force and moment balance closes", () => {
  it("reads the grounded slider's couple and closes the balance at every instant", () => {
    const mechanism = load_mechanism(JSON.parse(json)).mechanism;
    const model = compile_simulation_model(mechanism, true, true);
    let snapshot: DynamicSnapshot | null = null;
    let worstForce = 0;
    let worstMoment = 0;
    for (let i = 0; i < Math.round(3 / RECORD_DT); i++) {
      snapshot = step_dynamic_simulation(model, i * RECORD_DT, snapshot, RECORD_DT, GRAVITY);
      // The first two frames are still settling the initial velocities.
      if (i < 2) continue;
      const balance = compute_force_balance(
        apply_dynamic_snapshot_to_mechanism(mechanism, snapshot),
        snapshot,
        GRAVITY,
      )!;
      const slider = balance.actions.find((a) => a.id === `support:${SLIDER}`);
      expect(Math.abs(slider!.couple)).toBeGreaterThan(5);
      worstForce = Math.max(worstForce, balance.gap.length());
      worstMoment = Math.max(worstMoment, Math.abs(balance.gapMoment));
    }
    // Against a 78 N weight and support moments near 47 N·m.
    // The motor axle carries no beam: its reaction must come from the same statics solve as the others, or the sweep's own error shows here as 0.2 N.
    expect(worstForce).toBeLessThan(1e-6);
    expect(worstMoment).toBeLessThan(1e-2);
  }, 30_000);
});
