import { describe, it } from "vitest";
import coreXY2 from "../../../test-mechanisms/Core XY - 2 moteurs.slidep?raw";
import disconnect from "../../../test-mechanisms/Déconnexion courroie.slidep?raw";
import huygens from "../../../test-mechanisms/Huygen's chain drive.slidep?raw";
import jansen from "../../../test-mechanisms/Jansen's linkage.slidep?raw";
import poulie from "../../../test-mechanisms/Poulie bloqueuse.slidep?raw";
import { Point2 } from "../../types/point2";
import { load_mechanism } from "../../utils/load-mechanism";
import { serialize_mechanism } from "../../utils/serialization";
import { Recorder } from "./recorder";
import { RECORD_DT, compile_simulation_model, step_simulation } from "./kinematic-simulation";

/**
 * TEMPORARY — where the wait before the simulation starts moving actually goes. Splits the
 * cold start into what pre-compiling during edition would remove and what it would not:
 * serialise + revive + compile on one side, the first solves from rest on the other.
 *
 * Wall-clock, so only the ratios within one run mean anything (±25 % between runs).
 */

const loadFixture = (json: string) => load_mechanism(JSON.parse(json)).mechanism;

const MECHANISMS: [string, string][] = [
  ["Core XY - 2 moteurs", coreXY2],
  ["Déconnexion courroie", disconnect],
  ["Poulie bloqueuse", poulie],
  ["Huygen's chain drive", huygens],
  ["Jansen's linkage", jansen],
];

const REPEATS = 5;
const best = (n: number, body: () => void): number => {
  let ms = Infinity;
  for (let k = 0; k < n; k++) {
    const t0 = performance.now();
    body();
    ms = Math.min(ms, performance.now() - t0);
  }
  return ms;
};

describe("démarrage à froid", () => {
  it("où va l'attente avant que ça bouge", () => {
    console.log(
      "\n  | mécanisme | sérialiser+revivre | compiler | 1er pas | pas 2-10 (moy) | régime établi |",
    );
    console.log("  |---|---|---|---|---|---|");

    for (const [name, json] of MECHANISMS) {
      const mechanism = loadFixture(json);

      // What `load` pays: the mechanism crosses as the save format, then is compiled.
      const wireMs = best(REPEATS, () => {
        const wire = serialize_mechanism(mechanism);
        load_mechanism(JSON.parse(JSON.stringify(wire)));
      });
      const compileMs = best(REPEATS, () => {
        compile_simulation_model(mechanism);
      });

      // The first solves, from rest: no warm start, and the mechanism settles.
      let firstMs = Infinity;
      let earlyMs = Infinity;
      for (let k = 0; k < REPEATS; k++) {
        const model = compile_simulation_model(mechanism);
        let positions: Map<string, Point2> | null = null;
        let angles: Map<string, number> | null = null;
        const t0 = performance.now();
        let s = step_simulation(model, 0, positions, angles, RECORD_DT);
        const t1 = performance.now();
        positions = s.positions;
        angles = s.angles;
        for (let i = 1; i < 10; i++) {
          s = step_simulation(model, i * RECORD_DT, positions, angles, RECORD_DT);
          positions = s.positions;
          angles = s.angles;
        }
        const t2 = performance.now();
        firstMs = Math.min(firstMs, t1 - t0);
        earlyMs = Math.min(earlyMs, (t2 - t1) / 9);
      }

      // Steady state, after the start-up transient has died down.
      const model = compile_simulation_model(mechanism);
      let positions: Map<string, Point2> | null = null;
      let angles: Map<string, number> | null = null;
      for (let i = 0; i < 40; i++) {
        const s = step_simulation(model, i * RECORD_DT, positions, angles, RECORD_DT);
        positions = s.positions;
        angles = s.angles;
      }
      let steadyMs = Infinity;
      for (let k = 0; k < REPEATS; k++) {
        const t0 = performance.now();
        const s = step_simulation(model, 40 * RECORD_DT, positions, angles, RECORD_DT);
        steadyMs = Math.min(steadyMs, performance.now() - t0);
        positions = s.positions;
        angles = s.angles;
      }

      console.log(
        `  | ${name} | ${wireMs.toFixed(1)} ms | ${compileMs.toFixed(1)} ms | ` +
          `**${firstMs.toFixed(1)} ms** | ${earlyMs.toFixed(1)} ms | ${steadyMs.toFixed(1)} ms |`,
      );
    }
  }, 300_000);

  it("combien d'images avant que le régime établi soit atteint", () => {
    console.log("\n  | mécanisme | coût des 20 premiers pas (ms) |");
    console.log("  |---|---|");
    for (const [name, json] of MECHANISMS) {
      const model = compile_simulation_model(loadFixture(json));
      let positions: Map<string, Point2> | null = null;
      let angles: Map<string, number> | null = null;
      const costs: number[] = [];
      for (let i = 0; i < 20; i++) {
        const t0 = performance.now();
        const s = step_simulation(model, i * RECORD_DT, positions, angles, RECORD_DT);
        costs.push(performance.now() - t0);
        positions = s.positions;
        angles = s.angles;
      }
      console.log(`  | ${name} | ${costs.map((c) => c.toFixed(1)).join(" ")} |`);
    }
  }, 300_000);

  it("ce que le Recorder produit dans un budget, à froid puis à chaud", () => {
    console.log("\n  | mécanisme | 1re tranche de 8 ms | tranches 2-5 (moy) |");
    console.log("  |---|---|---|");
    for (const [name, json] of MECHANISMS) {
      const rec = new Recorder();
      rec.load(loadFixture(json), null);
      const counts: number[] = [];
      let t = 0;
      for (let slice = 0; slice < 5; slice++) {
        t += 0.5;
        counts.push(rec.advance(t, 1).snapshots.length);
      }
      const later = counts.slice(1).reduce((a, b) => a + b, 0) / (counts.length - 1);
      console.log(`  | ${name} | ${counts[0]} pas | ${later.toFixed(1)} pas |`);
    }
  }, 300_000);
});
