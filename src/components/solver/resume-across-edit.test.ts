import { describe, it, expect } from "vitest";
import vilbrequin from "../../../test-mechanisms/Vilbrequin.slidep?raw";
import { KinematicSnapshot } from "../../types/runtime-state";
import { load_mechanism } from "../../utils/load-mechanism";
import {
  RECORD_DT,
  compile_simulation_model,
  step_simulation,
} from "./kinematic-simulation";
import { snapshot_point } from "./snapshot";

/**
 * An edit made while simulating recompiles the model and resumes the recording on the last
 * snapshot of the previous one — a snapshot whose slots belong to another layout. The warm
 * start therefore has to go through the keys, and a silent failure to do so does not throw:
 * it restarts the mechanism from the rest state it was compiled at.
 */

describe("reprise après recompilation", () => {
  it("repart de l'état enregistré, pas de l'état de repos du modèle", () => {
    const mechanism = load_mechanism(JSON.parse(vilbrequin)).mechanism;
    const recorded = compile_simulation_model(mechanism);
    let snapshot: KinematicSnapshot | null = null;
    for (let i = 0; i < 60; i++)
      snapshot = step_simulation(recorded, i * RECORD_DT, snapshot);

    // A fresh compile of the same mechanism: the same keys, another layout object.
    const resumed = compile_simulation_model(mechanism);
    expect(resumed.layout).not.toBe(snapshot!.layout);
    const next = step_simulation(resumed, 60 * RECORD_DT, snapshot);

    let carried = 0; // how far the resumed frame sits from the recording
    let fromRest = 0; // how far the model's own rest state sits from it
    resumed.fill.keys.forEach((fused, i) => {
      const key = resumed.fill.firstParts[i];
      const was = snapshot_point(snapshot!, key)!;
      carried = Math.max(carried, snapshot_point(next, key)!.distance_to(was));
      fromRest = Math.max(
        fromRest,
        resumed.nodes.positions.get(fused)!.distance_to(was),
      );
    });

    console.log(
      `  reprise à ${carried.toFixed(3)} px de l'enregistrement, dont le repos est à ${fromRest.toFixed(1)} px`,
    );
    // Half a second of a turning crank separates the two, so the check is not a close call.
    expect(fromRest).toBeGreaterThan(10);
    expect(carried).toBeLessThan(1);
  }, 60_000);
});
