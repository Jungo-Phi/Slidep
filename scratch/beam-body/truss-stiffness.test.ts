import { describe, it } from "vitest";
import { appendFileSync, writeFileSync, readFileSync } from "node:fs";
import { Point2 } from "../../src/types";
import { DynamicSnapshot } from "../../src/types/runtime-state";
import { load_mechanism } from "../../src/utils/load-mechanism";
import {
  RECORD_DT,
  compile_simulation_model,
  step_dynamic_simulation,
} from "../../src/components/solver/dynamics/simulation-engine";

/**
 * The case compliance exists for: on a hyperstatic truss the share of load between members is
 * a matter of their stiffnesses. Rigid, it was whatever the sweep order chose. Three runs —
 * rigid, compliant, and compliant with one member made softer — say whether it now follows EA.
 */
const OUT = "scratch/beam-body/truss-stiffness.txt";
const say = (...a: unknown[]) => appendFileSync(OUT, a.map(String).join(" ") + "\n", "utf8");

function run(mode: "rigide" | "souple" | "souple, un membre allégé") {
  const mech = load_mechanism(
    JSON.parse(readFileSync("test-mechanisms/Treillis.slidep", "utf8")),
  ).mechanism;
  const model = compile_simulation_model(mech, true);
  const distances = model.links.filter((l) => l.type === "Distance" && l.compliance);
  if (mode === "rigide") for (const l of distances) if (l.type === "Distance") l.compliance = 0;
  if (mode === "souple, un membre allégé") {
    const first = distances[0];
    if (first && first.type === "Distance") first.compliance = (first.compliance ?? 0) * 10;
  }
  let snapshot: DynamicSnapshot | null = null;
  for (let i = 0; i < 30; i++)
    snapshot = step_dynamic_simulation(
      model,
      i * RECORD_DT,
      snapshot,
      RECORD_DT,
      new Point2(0, -9.81),
    );
  return { snapshot: snapshot!, n: distances.length };
}

describe("treillis hyperstatique", () => {
  it("la répartition suit-elle les raideurs ?", () => {
    writeFileSync(OUT, "", "utf8");
    for (const mode of ["rigide", "souple", "souple, un membre allégé"] as const) {
      const { snapshot, n } = run(mode);
      const rows = (snapshot.beamCohesion ?? [])
        .map((c) => `${c.beamID.slice(0, 4)}:${c.start.fy.toFixed(2)}`)
        .join("  ");
      say(`${mode.padEnd(28)} (${n} liens compliants)  start.fy = ${rows}`);
    }
  }, 300_000);
});
