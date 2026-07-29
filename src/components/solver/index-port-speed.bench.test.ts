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

/**
 * TEMPORARY — the before/after of the index port (chantier 1). Reports ms per simulated
 * frame at the production sweep count. Delete once the port is measured.
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

const loadFixture = (json: string) => load_mechanism(JSON.parse(json)).mechanism;

const WARMUP = 10;
const TIMED = 40;
// Wall-clock on this machine drifts by ±25 % between runs, which swamps the effect being
// measured. The minimum over many repeats estimates the unloaded cost far more stably
// than a mean, but it needs enough samples for one of them to land in a quiet window.
const REPEATS = 9;

/** Min over repeats: the fastest run is the one least polluted by GC and OS noise. */
function msPerFrame(json: string): number {
  let best = Infinity;
  for (let r = 0; r < REPEATS; r++) {
    const model = compile_simulation_model(loadFixture(json));
    let positions: Map<string, Point2> | null = null;
    let angles: Map<string, number> | null = null;
    const step = (i: number) => {
      const s = step_simulation(model, i / 60, positions, angles, 1 / 60);
      positions = s.positions;
      angles = s.angles;
    };
    for (let i = 0; i < WARMUP; i++) step(i);
    const t0 = performance.now();
    for (let i = WARMUP; i < WARMUP + TIMED; i++) step(i);
    best = Math.min(best, (performance.now() - t0) / TIMED);
  }
  return best;
}

describe("chantier 1 — vitesse par frame", () => {
  it("ms par frame, par mécanisme", () => {
    console.log("\n  | mécanisme | ms / frame |");
    console.log("  |---|---|");
    for (const [name, json] of MECHANISMS)
      console.log(`  | ${name} | ${msPerFrame(json).toFixed(3)} |`);
  }, 600_000);
});
