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
import { collect_sweeps } from "./sweep-probe";

/**
 * What a simulated step costs as a function of its size — the curve the adaptive recording
 * step of `plan-fluidite.md` (chantier 1) rides without anyone having measured it.
 *
 * It answers three questions at once: whether a finer step is cheaper per second of
 * simulated time (the old "120 or 240 Hz" question, chantier 2), how many sweeps a step
 * really executes, and whether the recording loop's feedback — coarser step, worse warm
 * start, more sweeps, coarser step — has a stable fixed point or runs to a bound.
 *
 * Two rules of the dossier shape the method:
 *  - **the mechanism state must be comparable across steps**, so every configuration is
 *    measured over the SAME simulated duration, not the same frame count. At dt = 1/480
 *    that is 240 steps and at 1/30 it is 15, which is exactly the point;
 *  - **never compare two timings taken at different moments**: the step sizes alternate
 *    inside one process, the order flips every pass, and the minimum is kept.
 *
 * Sweeps and milliseconds are measured in SEPARATE passes: the sweep probe allocates once
 * per sweep, so a timing taken with it installed is not the timing of production.
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

// Down to 1/6: that is where the step lands when the budget saturates at one step per
// frame and the playback speed is ×10 (60 fps × 10 ⇒ 1/6 s of simulated time per frame).
// Stopping at 1/30 would leave the whole fast-forward regime unmeasured.
const STEPS: [string, number][] = [
  ["1/480", 1 / 480],
  ["1/240", 1 / 240],
  ["1/120", 1 / 120],
  ["1/60", 1 / 60],
  ["1/30", 1 / 30],
  ["1/15", 1 / 15],
  ["1/6", 1 / 6],
];

/** Simulated seconds discarded before measuring, so every step starts warm. */
const WARMUP_S = 0.125;
/** Simulated seconds measured. A coarse step must still get several of them. */
const MEASURE_S = 1.5;
/** Timing passes; the minimum is kept. */
const PASSES = 3;
/** The sweep ceiling production runs at (`DEFAULT_SWEEPS`). */
const SWEEP_CAP = 300;

const loadFixture = (json: string) => load_mechanism(JSON.parse(json)).mechanism;

/**
 * Steps a fresh model, handing each step to `onStep` so the caller can time it or watch its
 * sweeps. Warm-up steps are run outside `onStep`.
 */
function run(
  json: string,
  dt: number,
  onStep: (body: () => void) => void,
  onResiduals?: (unsatisfied: { type: string; residual: number }[]) => void,
): void {
  const model = compile_simulation_model(loadFixture(json));
  let positions: Map<string, Point2> | null = null;
  let angles: Map<string, number> | null = null;
  let t = 0;
  const step = () => {
    t += dt;
    const s = step_simulation(model, t, positions, angles, dt);
    positions = s.positions;
    angles = s.angles;
    onResiduals?.(s.unsatisfied ?? []);
  };
  for (let i = 0; i < Math.round(WARMUP_S / dt); i++) step();
  for (let i = 0; i < Math.round(MEASURE_S / dt); i++) onStep(step);
}

/**
 * Worst constraint the solver left unsatisfied over the measured window, and how many it
 * left per step on average — what a coarser step costs in constraint satisfaction, as
 * opposed to in trajectory error.
 */
function violations(
  json: string,
  dt: number,
): { worst: number; perStep: number; kind: string } {
  let worst = 0;
  let kind = "—";
  let count = 0;
  let steps = 0;
  let measuring = false;
  run(
    json,
    dt,
    (body) => {
      measuring = true;
      body();
    },
    (unsatisfied) => {
      if (!measuring) return;
      steps++;
      count += unsatisfied.length;
      for (const u of unsatisfied)
        if (u.residual > worst) {
          worst = u.residual;
          kind = u.type;
        }
    },
  );
  return { worst, perStep: count / Math.max(1, steps), kind };
}

/** Sweeps executed by each measured step. */
function sweepsPerStep(json: string, dt: number): number[] {
  const counts: number[] = [];
  run(json, dt, (body) => {
    counts.push(collect_sweeps(body).length);
  });
  return counts;
}

/** Wall-clock ms for the whole measured window, probe off. */
function msForWindow(json: string, dt: number): number {
  let total = 0;
  run(json, dt, (body) => {
    const from = performance.now();
    body();
    total += performance.now() - from;
  });
  return total;
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length === 0 ? 0 : s[s.length >> 1];
};

describe("coût d'un pas contre sa taille", () => {
  it("rend la courbe, par mécanisme", () => {
    // Timings first, all step sizes alternating inside this one process, order flipped
    // every pass — a configuration run second inherits the other's warm-up otherwise.
    const ms = new Map<string, number>();
    for (let pass = 0; pass < PASSES; pass++) {
      const order = pass % 2 === 0 ? STEPS : [...STEPS].reverse();
      for (const [name, json] of MECHANISMS)
        for (const [label, dt] of order) {
          const key = `${name}|${label}`;
          const got = msForWindow(json, dt);
          const best = ms.get(key);
          if (best === undefined || got < best) ms.set(key, got);
        }
    }

    for (const [name, json] of MECHANISMS) {
      console.log(`\n  ### ${name}`);
      console.log(
        "\n  | pas | pas exécutés | balayages (médian) | plafonnés | ms / pas | ms / s simulée | pire violation | violées / pas |",
      );
      console.log("  |---|---|---|---|---|---|---|---|");
      for (const [label, dt] of STEPS) {
        const counts = sweepsPerStep(json, dt);
        const capped = counts.filter((c) => c >= SWEEP_CAP).length;
        const window = ms.get(`${name}|${label}`) ?? 0;
        const perStep = window / Math.max(1, counts.length);
        const v = violations(json, dt);
        console.log(
          `  | ${label} | ${counts.length} | ${median(counts)} | ` +
            `${((100 * capped) / Math.max(1, counts.length)).toFixed(0)} % | ` +
            `${perStep.toFixed(2)} | ${(window / MEASURE_S).toFixed(0)} | ` +
            `${v.worst.toExponential(2)} (${v.kind}) | ${v.perStep.toFixed(1)} |`,
        );
      }
    }

    console.log(
      `\n  Lecture : « ms / s simulée » est la seule colonne comparable d'une ligne à` +
        ` l'autre.\n  Plate ⇒ raffiner est gratuit. Croissante vers le fin ⇒ le pas` +
        ` grossier paie.\n  Décroissante vers le fin ⇒ raffiner est un gain net, et la` +
        ` boucle devrait le chercher.`,
    );
  }, 1_800_000);
});
