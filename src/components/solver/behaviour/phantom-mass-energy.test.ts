import { describe, expect, it } from "vitest";
import decon from "../../../../test-mechanisms/Déconnexion courroie.slidep?raw";
import { Point2 } from "../../../types";
import { DynamicSnapshot } from "../../../types/runtime-state";
import { load_mechanism } from "../../../utils/load-mechanism";
import {
  RECORD_DT,
  compile_simulation_model,
  step_dynamic_simulation,
} from "../dynamics/simulation-engine";

/**
 * A mass the solver invented to avoid dividing by zero must stay out of what the mechanism reports.
 * `Déconnexion courroie`'s junction is the case: a massless `join` on a closed belt, placed by a passive `BeltPin` and projected by nothing, so `MASS_FLOOR` gives it a kilogram that rides the belt.
 */

const GRAVITY = new Point2(0, -9.81);
/** Frames before the measured frame-18 disconnect, whose re-bake and the impact after it both move real energy about. */
const FRAMES = 18;

describe("masse fantôme d'un nœud passif", () => {
  it("ne compte ni dans l'énergie du mécanisme ni dans son poids", () => {
    const { mechanism } = load_mechanism(JSON.parse(decon));
    const model = compile_simulation_model(mechanism);

    let snapshot: DynamicSnapshot | null = null;
    let mechanical0 = 0;
    let work = 0;
    let peakKinetic = 0;
    let created = 0;
    for (let i = 0; i < FRAMES; i++) {
      snapshot = step_dynamic_simulation(model, i * RECORD_DT, snapshot, RECORD_DT, GRAVITY);
      const energy = snapshot.energy!;
      const mechanical = energy.kinetic + energy.potentialGravity + energy.potentialSpring;
      if (i === 0) mechanical0 = mechanical;
      else {
        const motor = (snapshot.motor ?? []).reduce((sum, m) => sum + m.watts, 0);
        work +=
          (motor + energy.loadPower - energy.damperPower - energy.frictionPower) *
          RECORD_DT;
      }
      peakKinetic = Math.max(peakKinetic, energy.kinetic);
      created = mechanical - mechanical0 - work;
    }

    // Nothing drives this mechanism but gravity, so what it gains has to come from what its own weight gives up, to whatever accuracy the integrator holds.
    // The phantom kilogram this guards against read as two thirds of the kinetic energy, being dragged along the belt free of charge.
    expect(Math.abs(created)).toBeLessThan(0.1 * peakKinetic);
  }, 30_000);

  it("garde le plancher dans le solveur, qu'une collision pourrait diviser", () => {
    const { mechanism } = load_mechanism(JSON.parse(decon));
    const { dynamicMasses } = compile_simulation_model(mechanism);

    expect(dynamicMasses.phantomKeys.size).toBeGreaterThan(0);
    for (const key of dynamicMasses.phantomKeys)
      expect(dynamicMasses.posMasses.get(key)).toBeGreaterThan(0);
  }, 30_000);
});
