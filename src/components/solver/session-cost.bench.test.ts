import { describe, it } from "vitest";
import coreXY2 from "../../../test-mechanisms/Core XY - 2 moteurs.slidep?raw";
import huygens from "../../../test-mechanisms/Huygen's chain drive.slidep?raw";
import jansen from "../../../test-mechanisms/Jansen's linkage.slidep?raw";
import vilbrequin from "../../../test-mechanisms/Vilbrequin.slidep?raw";
import { KinematicSnapshot } from "../../types/runtime-state";
import { load_mechanism } from "../../utils/load-mechanism";
import {
  RECORD_DT,
  RETAIN_DT,
  apply_snapshot_to_mechanism,
  compile_simulation_model,
  step_simulation,
} from "./kinematic-simulation";
import { get_links_simulation, get_sim_nodes } from "./parsing";
import { get_probe_series } from "./probe-series";
import { GRAB_KEYS } from "./snapshot";
import { get_sim_degrees_of_freedom } from "./utils";

/**
 * TEMPORARY — what a render of the analysis panel costs, and what a long session costs in
 * memory. Both are chantier 6 items that no bench had ever looked at.
 */

// The project has no `@types/node`; this bench is the only thing here that reads the heap.
declare const process: {
  memoryUsage(): { heapUsed: number; external: number };
};

/**
 * What a session retains, in bytes.
 *
 * `heapUsed` ALONE IS WRONG HERE: a typed array's contents live outside the JS heap, so it
 * reports a snapshot's object headers and its belt `Map`s but not its numbers — which are
 * now nearly all of it. Measured that way, `Jansen` came out at 0.50 ko for two arrays that
 * are 0.55 ko on their own. `external` is where those bytes are counted.
 */
const retained = () => {
  const m = process.memoryUsage();
  return m.heapUsed + m.external;
};
declare const globalThis: { gc?: () => void };

/** Settle the heap before reading it. Needs `--expose-gc`; without it the reading is noise. */
function settle(): boolean {
  if (!globalThis.gc) return false;
  for (let i = 0; i < 4; i++) globalThis.gc();
  return true;
}

const loadFixture = (json: string) => load_mechanism(JSON.parse(json)).mechanism;

const MECHANISMS: [string, string][] = [
  ["Core XY - 2 moteurs", coreXY2],
  ["Huygen's chain drive", huygens],
  ["Jansen's linkage", jansen],
  ["Vilbrequin", vilbrequin],
];

/** Median of `runs` timings of `body`, in milliseconds. */
function median(runs: number, body: () => void): number {
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    body();
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  return times[times.length >> 1];
}

function record(json: string, frames: number): KinematicSnapshot[] {
  const model = compile_simulation_model(loadFixture(json));
  const snapshots: KinematicSnapshot[] = [];
  let prev: KinematicSnapshot | null = null;
  for (let i = 0; i < frames; i++) {
    prev = step_simulation(model, i * RECORD_DT, prev);
    snapshots.push(prev);
  }
  return snapshots;
}

describe("ce qu'une session coûte", () => {
  it("le corps de rendu du panneau d'analyse, par rendu", () => {
    console.log(
      "\n  Rejoué à chaque rendu du panneau, soit 10 fois par seconde" +
        " (× 2 en dev, StrictMode).\n",
    );
    console.log("  | mécanisme | nœuds + liens + DDL | × 10 Hz | × 10 Hz en dev |");
    console.log("  |---|---|---|---|");
    for (const [name, json] of MECHANISMS) {
      const mechanism = loadFixture(json);
      const ms = median(40, () => {
        const nodes = get_sim_nodes(mechanism.mechanicalElements);
        const links = get_links_simulation(mechanism.mechanicalElements, nodes);
        get_sim_degrees_of_freedom(nodes, links);
      });
      console.log(
        `  | ${name} | ${ms.toFixed(2)} ms | ${(ms * 10).toFixed(0)} ms/s | ` +
          `${(ms * 20).toFixed(0)} ms/s |`,
      );
    }
  }, 600_000);

  it("ce que la boucle RAF refait à chaque image", () => {
    console.log(
      "\n  `apply_snapshot_to_mechanism` reconstruit le mécanisme dessiné, 60 fois par" +
        " seconde.\n",
    );
    console.log("  | mécanisme | par image | × 60 Hz |");
    console.log("  |---|---|---|");
    for (const [name, json] of MECHANISMS) {
      const mechanism = loadFixture(json);
      const snapshots = record(json, 120);
      const snapshot = snapshots[snapshots.length - 1];
      const ms = median(200, () => {
        apply_snapshot_to_mechanism(mechanism, snapshot);
      });
      console.log(
        `  | ${name} | ${ms.toFixed(3)} ms | ${(ms * 60).toFixed(0)} ms/s |`,
      );
    }
  }, 600_000);

  it("le tracé d'une sonde contre la longueur de l'enregistrement", () => {
    const mechanism = loadFixture(coreXY2);
    const element = mechanism.mechanicalElements.find((e) => "position" in e)!;
    console.log(
      "\n  `get_probe_series` reparcourt tout l'historique à chaque rendu, par sonde.\n",
    );
    console.log("  | enregistré | snapshots | par appel | × 10 Hz |");
    console.log("  |---|---|---|---|");
    for (const seconds of [5, 15, 30, 60]) {
      const snapshots = record(coreXY2, Math.round(seconds / RECORD_DT));
      // The call is now cheap enough that collecting the PREVIOUS recording lands inside the
      // timed window and dominates it: measured without this, 30 s came out five times
      // faster than 15 s. Settle first so what is timed is the walk, not the allocator.
      settle();
      const ms = median(20, () => {
        get_probe_series(element, "position", snapshots);
      });
      console.log(
        `  | ${seconds} s | ${snapshots.length} | ${ms.toFixed(2)} ms | ` +
          `${(ms * 10).toFixed(0)} ms/s |`,
      );
    }
  }, 900_000);

  it("la mémoire des snapshots sur une longue session", () => {
    if (!settle()) {
      console.log(
        "\n  Mesure impossible sans `--expose-gc` : sans GC forcé, le tas lu est du bruit" +
          " (la première tentative a rendu des tailles NÉGATIVES).",
      );
      return;
    }
    // Held to the end of the test: what is measured is what a session RETAINS, so nothing
    // here may become collectable while the heap is being read.
    const kept: KinematicSnapshot[][] = [];
    console.log(
      "\n  `tableaux` est la taille des deux Float64Array seuls : le plancher que le retenu" +
        " ne peut pas passer. Ce qui le dépasse est l'objet, les Map de courroie et le bruit" +
        " de la mesure — lire une valeur SOUS le plancher, c'est lire du bruit.\n",
    );
    console.log(
      "\n  | mécanisme | nœuds | tableaux | par snapshot | par minute simulée | 10 min |",
    );
    console.log("  |---|---|---|---|---|---|");
    for (const [name, json] of MECHANISMS) {
      const FRAMES = Math.round(20 / RECORD_DT); // 20 simulated seconds
      // A first recording warms the allocator and the compiled code, so the second one
      // measures the snapshots rather than the machinery around them.
      record(json, 240);
      settle();
      const before = retained();
      const snapshots = record(json, FRAMES);
      kept.push(snapshots);
      settle();
      const perSnapshot = (retained() - before) / snapshots.length;
      // A session keeps one instant per `RETAIN_DT`, not one per solved step.
      const perMinute = (perSnapshot * (60 / RETAIN_DT)) / 1024 / 1024;
      const arrays =
        (snapshots[0].positions.length + snapshots[0].angles.length) * 8;
      console.log(
        `  | ${name} | ${snapshots[0].layout.keys.length - GRAB_KEYS.length} | ` +
          `${(arrays / 1024).toFixed(2)} ko | ` +
          `${(perSnapshot / 1024).toFixed(2)} ko | ${perMinute.toFixed(1)} Mo | ` +
          `${(perMinute * 10).toFixed(0)} Mo |`,
      );
    }
    console.log(`  (${kept.length} enregistrements tenus jusqu'ici)`);
  }, 900_000);
});
