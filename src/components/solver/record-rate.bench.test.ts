import { describe, it } from "vitest";
import coreXY2 from "../../../test-mechanisms/Core XY - 2 moteurs.slidep?raw";
import disconnect from "../../../test-mechanisms/Déconnexion courroie.slidep?raw";
import huygens from "../../../test-mechanisms/Huygen's chain drive.slidep?raw";
import jansen from "../../../test-mechanisms/Jansen's linkage.slidep?raw";
import poulie from "../../../test-mechanisms/Poulie bloqueuse.slidep?raw";
import vilbrequin from "../../../test-mechanisms/Vilbrequin.slidep?raw";
import { Point2 } from "../../types/point2";
import { load_mechanism } from "../../utils/load-mechanism";
import {
  compile_simulation_model,
  step_simulation,
} from "./kinematic-simulation";
import { KinematicSnapshot } from "../../types/runtime-state";

/**
 * TEMPORARY — chantier 6. Now that the display interpolates between snapshots, the
 * recording rate no longer buys smoothness: it buys FIDELITY only. So the question is at
 * what step the recorded trajectory stops tracking the true one.
 *
 * Reference is the finest rate; every rate is compared to it at the SAME instants, through
 * the same interpolation the canvas uses — so what is measured is what would be drawn.
 */

const REFERENCE_HZ = 480;
const RATES = [30, 60, 120, 240];
const SECONDS = 2;
/** Instants at which trajectories are compared, independent of any rate under test. */
const SAMPLE_HZ = 30;
const REPEATS = 3;

const loadFixture = (json: string) => load_mechanism(JSON.parse(json)).mechanism;

const MECHANISMS: [string, string][] = [
  ["Core XY - 2 moteurs", coreXY2],
  ["Déconnexion courroie", disconnect],
  ["Huygen's chain drive", huygens],
  ["Jansen's linkage", jansen],
  ["Poulie bloqueuse", poulie],
  ["Vilbrequin", vilbrequin],
];

function record(json: string, hz: number, seconds: number) {
  const model = compile_simulation_model(loadFixture(json));
  const dt = 1 / hz;
  const frames = Math.round(seconds * hz);
  const snaps: KinematicSnapshot[] = [];
  let positions: Map<string, Point2> | null = null;
  let angles: Map<string, number> | null = null;
  const t0 = performance.now();
  for (let i = 0; i < frames; i++) {
    const s = step_simulation(model, i * dt, positions, angles, dt);
    positions = s.positions;
    angles = s.angles;
    snaps.push(s);
  }
  return { snaps, ms: performance.now() - t0, dt };
}

/** Drawn state at `t`, through the canvas's own interpolation. */
function stateAt(snaps: KinematicSnapshot[], dt: number, t: number) {
  // `snapshot_at` indexes on RECORD_DT; re-scale so it reads this recording's own step.
  const exact = t / dt;
  const i = Math.min(Math.max(0, Math.floor(exact)), snaps.length - 1);
  const j = Math.min(i + 1, snaps.length - 1);
  const u = exact - i;
  const a = snaps[i];
  const b = snaps[j];
  const out = new Map<string, Point2>();
  a.positions.forEach((pa, key) => {
    const pb = b.positions.get(key) ?? pa;
    out.set(key, new Point2(pa.x + (pb.x - pa.x) * u, pa.y + (pb.y - pa.y) * u));
  });
  return out;
}

function deviation(
  a: Map<string, Point2>,
  b: Map<string, Point2>,
): number {
  let worst = 0;
  a.forEach((pa, key) => {
    const pb = b.get(key);
    if (!pb) return;
    const d = Math.hypot(pa.x - pb.x, pa.y - pb.y);
    if (d > worst) worst = d;
  });
  return worst;
}

describe("fréquence d'enregistrement", () => {
  it("fidélité et coût contre la fréquence", () => {
    for (const [name, json] of MECHANISMS) {
      const ref = record(json, REFERENCE_HZ, SECONDS);
      const refDt = 1 / REFERENCE_HZ;
      const samples = Math.round(SECONDS * SAMPLE_HZ);

      console.log(`\n  ${name}`);
      console.log(
        "  | Hz | écart max à la réf. | écart final | ms / s simulée | balayages/s (relatif) |",
      );
      console.log("  |---|---|---|---|---|");

      for (const hz of RATES) {
        let best = Infinity;
        let snaps: KinematicSnapshot[] = [];
        let dt = 1 / hz;
        for (let k = 0; k < REPEATS; k++) {
          const r = record(json, hz, SECONDS);
          if (r.ms < best) {
            best = r.ms;
            snaps = r.snaps;
            dt = r.dt;
          }
        }
        let worst = 0;
        let last = 0;
        for (let s = 0; s <= samples; s++) {
          const t = s / SAMPLE_HZ;
          const d = deviation(stateAt(snaps, dt, t), stateAt(ref.snaps, refDt, t));
          if (d > worst) worst = d;
          last = d;
        }
        console.log(
          `  | ${hz} | ${worst.toExponential(2)} px | ${last.toExponential(2)} px | ` +
            `${(best / SECONDS).toFixed(1)} | ${(hz / 120).toFixed(2)}× |`,
        );
      }
    }
  }, 900_000);
});
