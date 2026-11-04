import { describe, expect, it } from "vitest";
import tombante from "../../../../test-mechanisms/Poulie tombante.slidep?raw";
import { Point2 } from "../../../types";
import { DEFAULT_RUNTIME_STATE, DynamicSnapshot, RuntimeState } from "../../../types/runtime-state";
import { load_mechanism } from "../../../utils/load-mechanism";
import {
  RECORD_DT,
  compile_simulation_model,
  parameter_snapshot,
  step_dynamic_simulation,
} from "../dynamics/simulation-engine";
import { analysed_mechanism, structure_references } from "../recording/use-simulation-playback";
import { snapshot_belt_detached } from "../snapshot";
import { build_analysis_model } from "./analysis-model";
import { probe_mobility } from "./mobility-probe";
import { PoseMeasurement, structural_mobility } from "./structural-mobility";

const measure = (mechanism: Parameters<typeof build_analysis_model>[0]): PoseMeasurement => {
  const model = build_analysis_model(mechanism);
  return { model, mobilities: probe_mobility(model) };
};

/** Poulie tombante recorded to `until`, as the panel's clock holds it. */
function record(until: number) {
  const { mechanism } = load_mechanism(JSON.parse(tombante));
  const model = compile_simulation_model(mechanism, true, true);
  const snapshots: DynamicSnapshot[] = [];
  let snapshot: DynamicSnapshot | null = null;
  for (let i = 0; i < Math.round(until / RECORD_DT); i++) {
    snapshot = step_dynamic_simulation(model, i * RECORD_DT, snapshot, RECORD_DT, new Point2(0, -9.81));
    snapshots.push(snapshot);
  }
  const clock = (time: number): RuntimeState => ({
    ...DEFAULT_RUNTIME_STATE,
    time,
    simulationSnapshots: snapshots,
    parameterSnapshots: [parameter_snapshot(0, mechanism)],
  });
  return { mechanism, snapshots, clock };
}

/** What the panel shows at `t`: `m/h` per chain. */
function shown(rec: ReturnType<typeof record>, t: number): string {
  const clock = rec.clock(t);
  const current = measure(analysed_mechanism(rec.mechanism, "dynamic", clock));
  const references = structure_references(rec.mechanism, "dynamic", clock).map((r) => measure(r.mechanism));
  return structural_mobility(current, references)
    .map(({ mobility }) => `${mobility.mobility}/${mobility.hyperstaticity}`)
    .join(" ");
}

describe("mobilité structurelle", () => {
  it("une poulie que la courroie frôle avant de la lâcher n'ajoute ni ne retire de mode", () => {
    // From 1.48 s the belt only grazes the falling pulley, its wrap shrinking to nothing by the 1.6 s detach.
    // Measured alone, those poses read 4/1, 2/-1 or 5/2.
    const rec = record(2);
    const beltId = rec.mechanism.mechanicalElements.find((e) => e.type === "belt")!.id;
    const detach = rec.snapshots.findIndex((s) => snapshot_belt_detached(s, beltId)?.length);
    expect(rec.snapshots[detach].t).toBeCloseTo(1.6, 1);
    const before = new Set<string>();
    for (const s of rec.snapshots.slice(0, detach)) if (s.t >= 1.44) before.add(shown(rec, s.t));
    expect(before).toEqual(new Set(["3/0"]));

    // After the detach the pulley falls on its own: two chains.
    expect(shown(rec, 1.8)).toBe("1/0 3/0");
  }, 120_000);

  it("les modes de la pose affichée sont aussi nombreux que la mobilité", () => {
    const rec = record(1.6);
    for (const t of [1.5, 1.583, 1.592]) {
      const clock = rec.clock(t);
      const current = measure(analysed_mechanism(rec.mechanism, "dynamic", clock));
      const references = structure_references(rec.mechanism, "dynamic", clock).map((r) => measure(r.mechanism));
      for (const { mobility } of structural_mobility(current, references)) {
        expect(mobility.modes).toHaveLength(mobility.mobility);
        // Orthonormal, over the unknowns of the pose on screen.
        for (const [i, a] of mobility.modes.entries())
          for (const [j, b] of mobility.modes.entries()) {
            let d = 0;
            for (let k = 0; k < a.length; k++) d += a[k] * b[k];
            expect(d).toBeCloseTo(i === j ? 1 : 0, 6);
          }
      }
    }
  }, 120_000);

  it("sans pose de référence, la pose affichée répond seule", () => {
    const { mechanism } = load_mechanism(JSON.parse(tombante));
    const current = measure(mechanism);
    const [chain] = structural_mobility(current, []);
    expect(chain.mobility.mobility).toBe(current.mobilities[0].mobility);
    expect(chain.mobility.modes).toBe(current.mobilities[0].modes);
  });
});
