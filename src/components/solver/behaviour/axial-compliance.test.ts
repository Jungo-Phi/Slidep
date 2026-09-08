import { describe, expect, it } from "vitest";
import treillisJson from "../../../../test-mechanisms/Treillis.slidep?raw";
import { Point2 } from "../../../types";
import { DynamicSnapshot } from "../../../types/runtime-state";
import { load_mechanism } from "../../../utils/load-mechanism";
import {
  RECORD_DT,
  compile_simulation_model,
  step_dynamic_simulation,
} from "../dynamics/simulation-engine";

/**
 * On a hyperstatic structure the share of load between members is a matter of their stiffnesses — statics alone does not determine it.
 * A rigid solver has no stiffness to answer with, so it answered with its sweep order instead; `Distance` links now carry the beam's own axial compliance `L/EA` (`beam_axial_compliance`), which is what this guards.
 *
 * Softening ONE member and watching the others' share move is the whole test: the absolute figures are the solver's business, the dependence on EA is the physics.
 */
function truss(softenFirstBy: number) {
  const mechanism = load_mechanism(JSON.parse(treillisJson)).mechanism;
  const model = compile_simulation_model(mechanism, true);
  const compliant = model.links.filter((l) => l.type === "Distance" && l.compliance);
  const first = compliant[0];
  if (softenFirstBy !== 1 && first && first.type === "Distance")
    first.compliance = (first.compliance ?? 0) * softenFirstBy;

  let snapshot: DynamicSnapshot | null = null;
  for (let i = 0; i < 30; i++)
    snapshot = step_dynamic_simulation(
      model,
      i * RECORD_DT,
      snapshot,
      RECORD_DT,
      new Point2(0, -9.81),
    );
  return {
    members: compliant.length,
    readings: (snapshot!.beamCohesion ?? []).map((c) => c.start.fy),
  };
}

describe("raideur axiale d'un treillis hyperstatique", () => {
  it("chaque poutre porte une compliance, et la répartition la suit", () => {
    const asBuilt = truss(1);
    expect(asBuilt.members).toBeGreaterThan(0);

    const softened = truss(10);
    expect(softened.readings).toHaveLength(asBuilt.readings.length);

    // A member ten times softer sheds load onto its neighbours.
    // Measured as a share of each reading rather than in newtons: what must hold is that SOME member's share moves by more than solver noise, which a rigid solver could not produce at all.
    const moved = asBuilt.readings.map((v, i) =>
      Math.abs(v) < 1e-9 ? 0 : Math.abs((softened.readings[i] - v) / v),
    );
    expect(Math.max(...moved)).toBeGreaterThan(0.1);

    // …and the members carrying the statically determinate path barely move: their share is not the redundancy's to redistribute.
    const heaviest = asBuilt.readings.indexOf(
      asBuilt.readings.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a)),
    );
    expect(moved[heaviest]).toBeLessThan(0.01);
  }, 120_000);
});
