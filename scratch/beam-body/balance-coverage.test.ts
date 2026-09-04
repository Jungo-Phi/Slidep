import { describe, it } from "vitest";
import { appendFileSync, writeFileSync, readdirSync, readFileSync } from "node:fs";
import { load_mechanism } from "../../src/utils/load-mechanism";
import { compile_simulation_model } from "../../src/components/solver/dynamics/simulation-engine";

/** How much of the gallery the converged-state torsor actually covers. */
const OUT = "scratch/beam-body/balance-coverage.txt";
const say = (...a: unknown[]) => appendFileSync(OUT, a.map(String).join("") + "\n", "utf8");

describe("couverture du torseur par bilan", () => {
  it("poutres équilibrables par mécanisme", () => {
    writeFileSync(OUT, "", "utf8");
    let total = 0;
    let ok = 0;
    for (const file of readdirSync("test-mechanisms").filter((f) => f.endsWith(".slidep"))) {
      const mech = load_mechanism(
        JSON.parse(readFileSync(`test-mechanisms/${file}`, "utf8")),
      ).mechanism;
      const model = compile_simulation_model(mech, true);
      const specs = model.beamCohesionSpecs;
      const n = specs.filter((s) => s.balanceable).length;
      total += specs.length;
      ok += n;
      say(`${file.replace(".slidep", "").padEnd(34)} ${n}/${specs.length}`);
    }
    say(`\nTOTAL ${ok}/${total} poutres`);
  }, 300_000);
});
