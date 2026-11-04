import { describe, expect, it } from "vitest";
import json from "../../../../test-mechanisms/Pince.slidep?raw";
import { load_mechanism } from "../../../utils/load-mechanism";
import { Point2 } from "../../../types";
import { DynamicSnapshot } from "../../../types/runtime-state";
import {
  RECORD_DT,
  compile_simulation_model,
  is_retained,
  step_dynamic_simulation,
} from "../dynamics/simulation-engine";

// A motor closes two jaws on a free disc, collisions on, gravity off.
// The jaws reach the disc at 1.28 s and bounce on it until about 2 s, the motor thrown back and catching up with its command by turns; by 3 s they hold it shut and the motor sits at its torque limit, standing still but for the contacts' jitter — about 1e-7 rad/s from frame to frame.
// Neither the jitter nor the bounce may read as the motor running again.

describe("a motor clamped shut at its torque limit (Pince)", () => {
  it("stalls once, on the first contact, and stays stalled", () => {
    const mechanism = load_mechanism(JSON.parse(json)).mechanism;
    const model = compile_simulation_model(mechanism, true, true);
    let snapshot: DynamicSnapshot | null = null;
    let clamped = 0;
    let running = 0;
    let changes = 0;
    let was = false;
    for (let i = 0; i < Math.round(7 / RECORD_DT); i++) {
      const t = i * RECORD_DT;
      // Stepped as the recorder steps it: a re-projection first, efforts only on the instants it keeps.
      snapshot = step_dynamic_simulation(
        model,
        t,
        snapshot,
        snapshot ? RECORD_DT : 0,
        new Point2(0, 0),
        undefined,
        undefined,
        is_retained(t),
        true,
        false,
      );
      const stalled = (snapshot.stalledMotors?.length ?? 0) > 0;
      if (stalled !== was) changes++;
      was = stalled;
      if (t < 3) continue;
      expect(snapshot.motor?.[0]?.saturated).toBe(true);
      if (stalled) clamped++;
      else running++;
    }
    expect(clamped).toBeGreaterThan(0);
    expect(running).toBe(0);
    // Running, then stalled for good: the bounce does not let it go in between.
    expect(changes).toBe(1);
  }, 60_000);
});
