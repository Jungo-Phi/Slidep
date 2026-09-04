import { describe, it } from "vitest";
import { appendFileSync, writeFileSync } from "node:fs";
const OUT = "scratch/statics/out5.txt";
const LOG = (s: string) => appendFileSync(OUT, s + String.fromCharCode(10));
import trussRaw from "../../test-mechanisms/Masse suspendue.slidep?raw";
import dcRaw from "../../test-mechanisms/Double Cantilever.slidep?raw";
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

function run(raw: string, frames: number, label: string) {
  const mechanism = load_mechanism(JSON.parse(raw)).mechanism;
  const names = new Map(mechanism.mechanicalElements.map((e) => [e.id, shown_element_name(e)]));
  const model = compile_simulation_model(mechanism, true);
  let snapshot: DynamicSnapshot | null = null;
  for (let i = 0; i < frames; i++)
    snapshot = step_dynamic_simulation(model, i * RECORD_DT, snapshot, RECORD_DT, new Point2(0, -9.81));
  LOG(`\n===== ${label} =====`);
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
      new Point2(0, -9.81),
    );
    if (!f) continue;
    const r = f.loopResidual;
    LOG(
      `${names.get(beam.id)!.padEnd(14)} det=${String(f.determinate).padEnd(5)} residu fx=${r.fx.toFixed(3)} fy=${r.fy.toFixed(3)} m=${r.m.toFixed(3)}`,
    );
  }
}

describe("loopResidual", () => {
  it("mesure", () => {
    writeFileSync(OUT, "");
    run(dcRaw, 400, "Double Cantilever");
    run(trussRaw, 600, "Masse suspendue");
  }, 240000);
});
