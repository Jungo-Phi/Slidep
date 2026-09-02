import { describe, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { load_mechanism } from "../src/utils/load-mechanism";
import { GRAVITY } from "../src/constants/physics-specs";
import { DynamicSnapshot } from "../src/types/runtime-state";
import {
  RECORD_DT,
  compile_simulation_model,
  step_dynamic_simulation,
} from "../src/components/solver/dynamics/simulation-engine";
import { compute_cohesion_field } from "../src/components/solver/recording/cohesion-field";
import { beam_linear_mass } from "../src/utils/section-properties";
import type { BeamElement } from "../src/types/element";

describe("repro: Cantilever simple, self-weight only", () => {
  it("dumps beamCohesion + cohesion field over time", () => {
    const dir = resolve(__dirname, "../test-mechanisms");
    const mech = load_mechanism(
      JSON.parse(readFileSync(resolve(dir, "Cantilever simple.slidep"), "utf8")),
    ).mechanism;
    const beam = mech.mechanicalElements.find((e) => e.type === "beam") as BeamElement;
    const linearMass = beam_linear_mass(beam.materialID, beam.profileID, mech.materials, mech.profiles);
    // eslint-disable-next-line no-console
    console.log(`linearMass=${linearMass} kg/m, total weight=${(linearMass * 9.81).toFixed(3)} N`);

    const model = compile_simulation_model(mech, true, true);
    let snap: DynamicSnapshot | null = null;
    for (let i = 0; i < 60; i++) {
      snap = step_dynamic_simulation(model, i * RECORD_DT, snap, RECORD_DT, GRAVITY);
      const c = snap.beamCohesion?.find((k) => k.beamID === beam.id);
      if (!c) continue;
      const field = compute_cohesion_field(beam, mech.materials, mech.profiles, c, mech.loads, snap, GRAVITY);
      const s0 = field?.samples[0];
      const sL = field?.samples[field.samples.length - 1];
      // eslint-disable-next-line no-console
      console.log(
        `frame ${i}\traw start.fy=${c.start.fy.toFixed(3)} start.m=${c.start.m.toFixed(3)} end.fy=${c.end.fy.toFixed(3)} end.m=${c.end.m.toFixed(3)}` +
          `\t| field T(0)=${s0?.T.toFixed(3)} Mf(0)=${s0?.Mf.toFixed(3)} T(L)=${sL?.T.toFixed(3)} Mf(L)=${sL?.Mf.toFixed(3)}` +
          `\t| loopResidual fy=${field?.loopResidual.fy.toFixed(3)} m=${field?.loopResidual.m.toFixed(3)}`,
      );
    }
  });
});
