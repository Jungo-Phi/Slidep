import { describe, it, vi } from "vitest";
import { appendFileSync, writeFileSync, readFileSync } from "node:fs";
import { Mechanism, Point2 } from "../../src/types";
import { DynamicSnapshot } from "../../src/types/runtime-state";
import { load_mechanism } from "../../src/utils/load-mechanism";
import {
  RECORD_DT,
  compile_simulation_model,
  step_dynamic_simulation,
} from "../../src/components/solver/dynamics/simulation-engine";

/**
 * Second case for the "the taxe is alternation × midpoint, not alternation" claim. The
 * mid-span-mass cantilever gave a fixed 1.14 % bias; this one is the loud symptom —
 * `Double Cantilever bis` reads a non-damped limit cycle on a mechanism that barely moves.
 * If that also needs BOTH, the claim holds on the symptom that matters.
 */
const OUT = "scratch/beam-body/limit-cycle-out.txt";
const say = (...a: unknown[]) => appendFileSync(OUT, a.map(String).join(" ") + "\n", "utf8");

function run(dropMidpoint: boolean, alternate: boolean) {
  const mech: Mechanism = load_mechanism(
    JSON.parse(readFileSync("test-mechanisms/Double Cantilever bis.slidep", "utf8")),
  ).mechanism;
  process.env.SLIDEP_NO_SSOR = alternate ? "" : "1";
  const model = compile_simulation_model(mech, true);
  const midpoints = model.dynamicMasses.beamMidpoints.length;
  if (dropMidpoint) model.dynamicMasses.beamMidpoints = [];
  let snapshot: DynamicSnapshot | null = null;
  const series: number[][] = [];
  for (let i = 0; i < 24; i++) {
    snapshot = step_dynamic_simulation(model, i * RECORD_DT, snapshot, RECORD_DT, new Point2(0, -9.81));
    series.push((snapshot.beamCohesion ?? []).map((c) => c.start.fy));
  }
  return { midpoints, series };
}

describe("Double Cantilever bis — le cycle limite tient-il aux deux ?", () => {
  it("2x2 sur start.fy des deux poutres", () => {
    writeFileSync(OUT, "", "utf8");
    for (const alternate of [true, false])
      for (const drop of [false, true]) {
        const { midpoints, series } = run(drop, alternate);
        const tail = series.slice(8); // past the transient
        const spans = tail[0].map((_, b) => {
          const v = tail.map((f) => f[b]);
          return Math.max(...v) - Math.min(...v);
        });
        say(
          `alternance=${alternate ? "ON " : "OFF"}  milieux=${drop ? "NON" : `OUI(${midpoints})`}` +
            `  amplitude start.fy par poutre = [${spans.map((s) => s.toFixed(4)).join(", ")}]`,
        );
        say(`    dernières valeurs: ${tail.slice(-4).map((f) => f.map((x) => x.toFixed(2)).join("/")).join("  ")}`);
      }
  }, 300_000);
});
