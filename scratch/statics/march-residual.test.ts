import { describe, it, vi } from "vitest";
import { appendFileSync, writeFileSync } from "node:fs";
const OUT = "scratch/statics/out7.txt";
const LOG = (s: string) => appendFileSync(OUT, s + String.fromCharCode(10));

let ALTERNATE = true;
vi.mock("../../src/components/solver/kinematics/sweep-order", async (orig) => {
  const real = await orig<typeof import("../../src/components/solver/kinematics/sweep-order")>();
  return {
    ...real,
    reversed_sweep_order: (...args: Parameters<typeof real.reversed_sweep_order>) =>
      ALTERNATE ? real.reversed_sweep_order(...args) : null,
  };
});

import trussRaw from "../../test-mechanisms/Masse suspendue.slidep?raw";
import { Point2 } from "../../src/types";
import { DynamicSnapshot } from "../../src/types/runtime-state";
import { load_mechanism } from "../../src/utils/load-mechanism";
import { shown_element_name } from "../../src/utils/string-math";
import {
  RECORD_DT,
  compile_simulation_model,
  step_dynamic_simulation,
} from "../../src/components/solver/dynamics/simulation-engine";
import { compute_cohesion_field } from "../../src/components/solver/recording/cohesion-field";
import { snapshot_point } from "../../src/components/solver/snapshot";
import { beam_linear_mass } from "../../src/utils/section-properties";

const G = new Point2(0, -9.81);

function run(dropMidpoint: boolean, alternate: boolean) {
  ALTERNATE = alternate;
  const mechanism = load_mechanism(JSON.parse(trussRaw)).mechanism;
  const names = new Map(mechanism.mechanicalElements.map((e) => [e.id, shown_element_name(e)]));
  const model = compile_simulation_model(mechanism, true);
  const midpoints = model.dynamicMasses.beamMidpoints.length;
  if (dropMidpoint) model.dynamicMasses.beamMidpoints = [];

  let snapshot: DynamicSnapshot | null = null;
  for (let i = 0; i < 400; i++)
    snapshot = step_dynamic_simulation(model, i * RECORD_DT, snapshot, RECORD_DT, G);

  LOG(
    `\n--- alternance=${alternate ? "ON " : "OFF"}  ${dropMidpoint ? "SANS" : "AVEC"} nœud milieu (compilés: ${midpoints})`,
  );
  for (const beam of mechanism.mechanicalElements) {
    if (beam.type !== "beam") continue;
    const c = (snapshot!.beamCohesion ?? []).find((x) => x.beamID === beam.id);
    if (!c) continue;
    const f = compute_cohesion_field(
      beam,
      mechanism.materials,
      mechanism.profiles,
      c,
      mechanism.loads,
      snapshot!,
      G,
    );
    const p0 = snapshot_point(snapshot!, `${beam.id}:start`)!;
    const p1 = snapshot_point(snapshot!, `${beam.id}:end`)!;
    const xhat = p1.sub(p0).normalize();
    const N = c.start.fx * xhat.x + c.start.fy * xhat.y;
    const weight =
      beam_linear_mass(beam.materialID, beam.profileID, mechanism.materials, mechanism.profiles) *
      p1.distance_to(p0) *
      9.81;
    const r = Math.hypot(f!.loopResidual.fx, f!.loopResidual.fy);
    LOG(
      `  ${names.get(beam.id)!.padEnd(12)} N=${(N / 1000).toFixed(3)} kN   |residu|=${r.toFixed(3)} N = ${(r / weight).toFixed(3)} x poids propre (${weight.toFixed(2)} N)`,
    );
  }
}

describe("résidu de marche : nœud milieu et alternance", () => {
  it("2x2", () => {
    writeFileSync(OUT, "");
    LOG("Masse suspendue, densite reelle. Vérité : Epan +114.5  Iqla +34.3  Ulsu -59.8  Lukn -119.5  Dode +49.05 kN");
    for (const alternate of [true, false])
      for (const drop of [false, true]) run(drop, alternate);
  }, 300_000);
});
