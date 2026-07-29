import { describe, it } from "vitest";
import coreXY2 from "../../../test-mechanisms/Core XY - 2 moteurs.slidep?raw";
import coreXYMod from "../../../test-mechanisms/Core XY modifié.slidep?raw";
import coreXY from "../../../test-mechanisms/Core XY.slidep?raw";
import disconnect from "../../../test-mechanisms/Déconnexion courroie.slidep?raw";
import huygens from "../../../test-mechanisms/Huygen's chain drive.slidep?raw";
import jansen from "../../../test-mechanisms/Jansen's linkage.slidep?raw";
import poulie from "../../../test-mechanisms/Poulie bloqueuse.slidep?raw";
import slider from "../../../test-mechanisms/Test slider.slidep?raw";
import vilbrequin from "../../../test-mechanisms/Vilbrequin.slidep?raw";
import { Point2 } from "../../types/point2";
import { load_mechanism } from "../../utils/load-mechanism";
import { compile_simulation_model, step_simulation } from "./kinematic-simulation";
import { set_early_exit_bounds } from "./PBD_kinematic_solver";
import { collect_sweeps } from "./sweep-probe";

/**
 * TEMPORARY — chantier 2: what the early exit buys and what it costs. Both arms run in
 * the SAME process, back to back, so the comparison is not exposed to the ±25 % drift
 * that made the chantier 1 timings unusable. Sweeps, not milliseconds.
 */

const MECHANISMS: [string, string][] = [
  ["Core XY - 2 moteurs", coreXY2],
  ["Core XY modifié", coreXYMod],
  ["Core XY", coreXY],
  ["Déconnexion courroie", disconnect],
  ["Huygen's chain drive", huygens],
  ["Jansen's linkage", jansen],
  ["Poulie bloqueuse", poulie],
  ["Test slider", slider],
  ["Vilbrequin", vilbrequin],
];

const DEFAULT_PX = 1e-3;
const DEFAULT_RAD = 1e-6;
const loadFixture = (json: string) => load_mechanism(JSON.parse(json)).mechanism;

interface Run {
  sweeps: number[];
  positions: Map<string, Point2>;
}

function run(json: string, frames: number): Run {
  const model = compile_simulation_model(loadFixture(json));
  let positions: Map<string, Point2> | null = null;
  let angles: Map<string, number> | null = null;
  const sweeps: number[] = [];
  for (let i = 0; i < frames; i++) {
    const samples = collect_sweeps(() => {
      const s = step_simulation(model, i / 60, positions, angles, 1 / 60);
      positions = s.positions;
      angles = s.angles;
    });
    sweeps.push(samples.length);
  }
  return { sweeps, positions: positions! };
}

/** Worst per-node distance between two runs' final states. */
function drift(a: Map<string, Point2>, b: Map<string, Point2>): number {
  let worst = 0;
  for (const [key, p] of a) {
    const q = b.get(key);
    if (q) worst = Math.max(worst, p.distance_to(q));
  }
  return worst;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe("chantier 2 — ce que la sortie anticipée gagne et ce qu'elle coûte", () => {
  it("balayages économisés et dérive, à plusieurs bornes", () => {
    for (const frames of [60, 200]) {
      console.log(`\n=== ${frames} frames ===`);
      console.log(
        "  | mécanisme | balayages sans sortie (moy) | " +
          "1e-3 px : balayages / dérive | 1e-2 px : balayages / dérive |",
      );
      console.log("  |---|---|---|---|");
      for (const [name, json] of MECHANISMS) {
        set_early_exit_bounds(0, 0);
        const reference = run(json, frames);
        const cells: string[] = [];
        for (const [px, rad] of [
          [1e-3, 1e-6],
          [DEFAULT_PX, DEFAULT_RAD],
        ] as const) {
          set_early_exit_bounds(px, rad);
          const r = run(json, frames);
          cells.push(
            `${mean(r.sweeps).toFixed(0)} / ${drift(reference.positions, r.positions).toExponential(2)} px`,
          );
        }
        console.log(
          `  | ${name} | ${mean(reference.sweeps).toFixed(0)} | ${cells.join(" | ")} |`,
        );
      }
    }
    set_early_exit_bounds(DEFAULT_PX, DEFAULT_RAD);
  }, 900_000);
});
