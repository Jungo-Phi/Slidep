import { describe, it } from "vitest";
import { appendFileSync } from "node:fs";
import cpJson from "../../test-mechanisms/CP.slidep?raw";
import { load_mechanism } from "../../src/utils/load-mechanism";
import { Mechanism, Point2 } from "../../src/types";
import type { BeamElement, ID, MassElement, PivotElement } from "../../src/types/element";
import { DynamicSnapshot } from "../../src/types/runtime-state";
import {
  RECORD_DT,
  compile_simulation_model,
  step_dynamic_simulation,
} from "../../src/components/solver/simulation-engine";
import { snapshot_point } from "../../src/components/solver/snapshot";

const GRAVITY = new Point2(0, -9.81);

function find_pivot_and_beam1(mech: Mechanism): {
  pivot: PivotElement;
  beam1: BeamElement;
} {
  const pivot = mech.mechanicalElements.find(
    (e): e is PivotElement => e.type === "pivot",
  )!;
  const beam1 = mech.mechanicalElements.find(
    (e): e is BeamElement =>
      e.type === "beam" && e.fixedNodesBodyIDs.includes(pivot.id),
  )!;
  return { pivot, beam1 };
}

function find_heavy_mass(mech: Mechanism, beam1: BeamElement): MassElement {
  return mech.mechanicalElements.find(
    (e): e is MassElement => e.type === "mass" && !e.fixedEdgesIDs.includes(beam1.id),
  )!;
}

function with_mass(mech: Mechanism, massID: ID, mass: number): Mechanism {
  return {
    ...mech,
    mechanicalElements: mech.mechanicalElements.map((e) =>
      e.id === massID ? { ...e, mass } : e,
    ),
  };
}

function pivot_residual(snapshot: DynamicSnapshot, beam1: ID, pivot: ID): number {
  const s = snapshot_point(snapshot, `${beam1}:start`)!;
  const e = snapshot_point(snapshot, `${beam1}:end`)!;
  const p = snapshot_point(snapshot, pivot)!;
  return p.distance_to(s.lerp(e, 0.5));
}

function worst_pivot_residual(mech: Mechanism, frames: number): number {
  const { pivot, beam1 } = find_pivot_and_beam1(mech);
  const model = compile_simulation_model(mech);
  let snapshot: DynamicSnapshot | null = null;
  let worst = 0;
  for (let i = 0; i < frames; i++) {
    snapshot = step_dynamic_simulation(
      model,
      i * RECORD_DT,
      snapshot,
      RECORD_DT,
      GRAVITY,
    );
    worst = Math.max(worst, pivot_residual(snapshot, beam1.id, pivot.id));
  }
  return worst;
}

describe("SSOR mass-ratio probe", () => {
  it("CP.slidep", () => {
    const base = load_mechanism(JSON.parse(cpJson)).mechanism;
    const { beam1 } = find_pivot_and_beam1(base);
    const heavy = find_heavy_mass(base, beam1);
    const lines = [`### CP.slidep — SSOR=${process.env.SLIDEP_SSOR ?? "off"}`];
    for (const mass of [1, 100, 300, 1000, 3000]) {
      const r = worst_pivot_residual(with_mass(base, heavy.id, mass), 40);
      lines.push(`mass=${mass}\tworstResidual=${r.toExponential(3)}`);
    }
    appendFileSync(process.env.SSOR_OUT!, lines.join("\n") + "\n", "utf8");
  }, 600_000);
});
