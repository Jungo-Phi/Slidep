import { describe, it } from "vitest";
import coreXY2Json from "../../../test-mechanisms/Core XY - 2 moteurs.slidep?raw";
import coreXYModJson from "../../../test-mechanisms/Core XY modifié.slidep?raw";
import coreXYJson from "../../../test-mechanisms/Core XY.slidep?raw";
import deconnexionJson from "../../../test-mechanisms/Déconnexion courroie.slidep?raw";
import huygensJson from "../../../test-mechanisms/Huygen's chain drive.slidep?raw";
import jansenJson from "../../../test-mechanisms/Jansen's linkage.slidep?raw";
import poulieJson from "../../../test-mechanisms/Poulie bloqueuse.slidep?raw";
import sliderJson from "../../../test-mechanisms/Test slider.slidep?raw";
import vilbrequinJson from "../../../test-mechanisms/Vilbrequin.slidep?raw";
import { Point2 } from "../../types/point2";
import { Link } from "../../types";
import { load_mechanism } from "../../utils/load-mechanism";
import {
  compile_simulation_model,
  step_simulation,
  RECORD_DT,
} from "./kinematic-simulation";
import { PBD_kinematic_solver, set_early_exit_bounds } from "./PBD_kinematic_solver";
import { collect_sweeps, with_sweep_probe, SweepSample } from "./sweep-probe";

/**
 * TEMPORARY — chantier 6, first measurement. Why does the solver never settle: it keeps
 * moving by a geometrically decreasing amount, sweep after sweep. Three readings:
 *
 *  (a) the decay rate `r` per mechanism, ON THE PRODUCTION MODEL — the rates that shaped
 *      the early exit were taken before the belt model was switched over;
 *  (b) the SHAPE of the motion, by power iteration: a single dominant mode holds its
 *      direction, two constraints duelling alternate;
 *  (c) `r` against chain length, which is the signature of a slow global mode.
 *
 * Delete once chantier 6 is decided.
 */

const SWEEPS = 300;
/** Sweeps to skip before fitting: the first ones are the grab/motor transient. */
const TAIL_FROM = 200;

const loadFixture = (json: string) => load_mechanism(JSON.parse(json)).mechanism;

const MECHANISMS: [string, string][] = [
  ["Core XY - 2 moteurs", coreXY2Json],
  ["Core XY modifié", coreXYModJson],
  ["Core XY", coreXYJson],
  ["Déconnexion courroie", deconnexionJson],
  ["Huygen's chain drive", huygensJson],
  ["Poulie bloqueuse", poulieJson],
  ["Vilbrequin", vilbrequinJson],
  ["Jansen's linkage", jansenJson],
  ["Test slider", sliderJson],
];

/** Geometric rate fitted over the tail: (last/first)^(1/n). */
function fitRate(values: number[]): number {
  const positive = values.filter((v) => v > 0);
  if (positive.length < 3) return NaN;
  const first = positive[0];
  const last = positive[positive.length - 1];
  if (!(first > 0) || !(last > 0)) return NaN;
  return Math.pow(last / first, 1 / (positive.length - 1));
}

/** Runs `frames` steps from rest, returning the state to warm-start from. */
function warmUp(model: ReturnType<typeof compile_simulation_model>, frames: number) {
  let positions: Map<string, Point2> | null = null;
  let angles: Map<string, number> | null = null;
  for (let i = 0; i < frames; i++) {
    const s = step_simulation(model, i * RECORD_DT, positions, angles, RECORD_DT);
    positions = s.positions;
    angles = s.angles;
  }
  return { positions, angles, t: frames * RECORD_DT };
}

describe("rampement du solveur", () => {
  /* ────────────────────────────────────────────────────────────────────────────
   * (a) The decay rate, on the production model.
   * ──────────────────────────────────────────────────────────────────────────── */
  it("(a) taux de décroissance par mécanisme", () => {
    set_early_exit_bounds(0, 0); // never exit: we want the full 300 sweeps
    try {
      console.log(
        "\n  mécanisme                | bal.50    bal.100   bal.200   bal.299   |   r      restant   résidu",
      );
      console.log(
        "  -------------------------|-------------------------------------------|----------------------------",
      );
      for (const [name, json] of MECHANISMS) {
        const model = compile_simulation_model(loadFixture(json));
        const warm = warmUp(model, 30);
        const samples = collect_sweeps(() => {
          step_simulation(model, warm.t, warm.positions, warm.angles, RECORD_DT, undefined, SWEEPS);
        });
        if (samples.length === 0) {
          console.log(`  ${name.padEnd(24)} | pas de balayage`);
          continue;
        }
        const at = (i: number) => samples[Math.min(i, samples.length - 1)];
        const tail = samples.slice(TAIL_FROM).map((s) => s.moved);
        const r = fitRate(tail);
        const last = at(samples.length - 1);
        const remaining = r < 1 ? (last.moved * r) / (1 - r) : Infinity;
        console.log(
          `  ${name.padEnd(24)} | ${at(50).moved.toExponential(2)}  ${at(100).moved.toExponential(2)}  ` +
            `${at(200).moved.toExponential(2)}  ${last.moved.toExponential(2)}  | ${r.toFixed(4)}  ` +
            `${remaining.toExponential(2)}  ${last.maxError.toExponential(2)}`,
        );
      }
    } finally {
      set_early_exit_bounds(1e-3, 1e-6);
    }
  }, 300_000);

  /* ────────────────────────────────────────────────────────────────────────────
   * (b) The shape of the motion — power iteration.
   *
   * cos(dₙ, dₙ₊₁) → +1 : one dominant mode, steady direction.
   * cos → −1            : alternating, i.e. two constraints trading the same error.
   * cos stays low       : no single mode.
   * ──────────────────────────────────────────────────────────────────────────── */
  it("(b) forme du mode lent", () => {
    set_early_exit_bounds(0, 0);
    try {
      for (const [name, json] of MECHANISMS) {
        const model = compile_simulation_model(loadFixture(json));
        const warm = warmUp(model, 30);

        let prev: Float64Array | null = null;
        const cosines: { sweep: number; cos: number }[] = [];
        let concentration = NaN;
        let topKeys: string[] = [];

        const probe = (s: SweepSample) => {
          if (s.sweep < TAIL_FROM) return;
          const n = s.shape.count;
          const d = new Float64Array(2 * n);
          for (let i = 0; i < n; i++) {
            d[2 * i] = s.shape.x[i] - s.shape.prevX[i];
            d[2 * i + 1] = s.shape.y[i] - s.shape.prevY[i];
          }
          let norm = 0;
          for (let i = 0; i < d.length; i++) norm += d[i] * d[i];
          norm = Math.sqrt(norm);
          if (norm === 0) return;
          for (let i = 0; i < d.length; i++) d[i] /= norm;

          if (prev) {
            let dot = 0;
            for (let i = 0; i < d.length; i++) dot += d[i] * prev[i];
            cosines.push({ sweep: s.sweep, cos: dot });
          }
          prev = d;

          if (s.sweep === SWEEPS - 1) {
            // Share of the motion carried by the three busiest nodes, and their names.
            const perNode = Array.from({ length: n }, (_, i) => ({
              i,
              m: Math.hypot(d[2 * i], d[2 * i + 1]),
            })).sort((a, b) => b.m - a.m);
            concentration = perNode.slice(0, 3).reduce((a, p) => a + p.m * p.m, 0);
            topKeys = perNode.slice(0, 3).map((p) => {
              const key = s.shape.keys[p.i] ?? `#${p.i}`;
              return `${key.slice(0, 8)}:${(p.m * p.m * 100).toFixed(0)}%`;
            });
          }
        };

        with_sweep_probe(probe, () => {
          step_simulation(model, warm.t, warm.positions, warm.angles, RECORD_DT, undefined, SWEEPS);
        });

        if (cosines.length === 0) {
          console.log(`\n  ${name} — aucun mouvement mesurable`);
          continue;
        }
        const early = cosines.slice(0, 5).map((c) => c.cos);
        const late = cosines.slice(-5).map((c) => c.cos);
        const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
        console.log(
          `\n  ${name}\n` +
            `    cos(dₙ, dₙ₊₁)  bal.~${TAIL_FROM} : ${mean(early).toFixed(4)}   bal.~${SWEEPS} : ${mean(late).toFixed(4)}\n` +
            `    part du mouvement sur les 3 nœuds les plus actifs : ${(100 * concentration).toFixed(1)} %  [${topKeys.join(" ")}]`,
        );
      }
    } finally {
      set_early_exit_bounds(1e-3, 1e-6);
    }
  }, 300_000);

  /* ────────────────────────────────────────────────────────────────────────────
   * (d) What the exit rule buys: the sweep it fires on, summing the motion left over the
   * REMAINING budget (what the solver does now) against summing it to infinity (what it
   * did before). Both are replayed offline from the same exit-free trace, so the
   * comparison is exact and needs no flag.
   * ──────────────────────────────────────────────────────────────────────────── */
  it("(d) règle de sortie : somme tronquée contre somme infinie", () => {
    const W = 8; // RATE_WINDOW
    const MIN = 24; // MIN_SWEEPS_BEFORE_EARLY_EXIT
    const BOUND_PX = 1e-3;
    const BOUND_RAD = 1e-6;

    const fireSweep = (
      samples: { moved: number; turned: number }[],
      truncated: boolean,
    ): number => {
      const bound = (
        series: number[],
        i: number,
        limit: number,
      ): boolean => {
        const now = series[i];
        const ago = series[i - W];
        if (now === 0) return true;
        if (ago === undefined || !(ago > 0)) return false;
        const rate = Math.pow(now / ago, 1 / W);
        const left = samples.length - 1 - i;
        let remaining: number;
        if (truncated) {
          if (left <= 0) remaining = 0;
          else if (Math.abs(rate - 1) < 1e-12) remaining = now * left;
          else remaining = (now * rate * (1 - Math.pow(rate, left))) / (1 - rate);
        } else {
          if (!(ago > now)) remaining = Infinity;
          else remaining = (now * rate) / (1 - rate);
        }
        return remaining < limit;
      };
      const moved = samples.map((s) => s.moved);
      const turned = samples.map((s) => s.turned);
      for (let i = MIN; i < samples.length; i++)
        if (bound(moved, i, BOUND_PX) && bound(turned, i, BOUND_RAD)) return i + 1;
      return samples.length;
    };

    set_early_exit_bounds(0, 0);
    try {
      console.log("\n  | mécanisme | somme infinie | somme tronquée | gain |");
      console.log("  |---|---|---|---|");
      for (const [name, json] of MECHANISMS) {
        const model = compile_simulation_model(loadFixture(json));
        const warm = warmUp(model, 30);
        const samples = collect_sweeps(() => {
          step_simulation(model, warm.t, warm.positions, warm.angles, RECORD_DT, undefined, SWEEPS);
        });
        if (samples.length === 0) continue;
        const before = fireSweep(samples, false);
        const after = fireSweep(samples, true);
        console.log(
          `  | ${name} | ${before} | ${after} | ${before === after ? "—" : `−${before - after}`} |`,
        );
      }
    } finally {
      set_early_exit_bounds(1e-3, 1e-6);
    }
  }, 300_000);

  /* ────────────────────────────────────────────────────────────────────────────
   * (c) `r` against chain length, on a bare articulated chain — no belts, no gears.
   * If `r → 1` as N grows, the creep is the one-link-per-sweep diffusion.
   * ──────────────────────────────────────────────────────────────────────────── */
  it("(c) taux contre longueur de chaîne", () => {
    set_early_exit_bounds(0, 0);
    try {
      console.log("\n  N liens |    r      restant / bougé   bal. pour ÷1000");
      console.log("  --------|------------------------------------------");
      for (const N of [2, 4, 8, 16, 32, 64]) {
        const positions = new Map<string, Point2>();
        const posMasses = new Map<string, number>();
        const links: Link[] = [];
        const SPAN = 40;
        for (let i = 0; i <= N; i++) {
          positions.set(`n${i}`, new Point2(i * SPAN, 0));
          posMasses.set(`n${i}`, i === 0 ? 0 : 1); // first node anchored
        }
        for (let i = 0; i < N; i++)
          links.push({
            type: "Distance",
            ddl: 1,
            key1: `n${i}`,
            key2: `n${i + 1}`,
            distance: SPAN,
          } satisfies Link);
        // Perturb the free end across the chain: the correction has to travel back.
        positions.get(`n${N}`)!.y = SPAN;

        const samples = collect_sweeps(() => {
          PBD_kinematic_solver(
            positions,
            new Map(),
            posMasses,
            new Map(),
            links,
            SWEEPS,
          );
        });
        const tail = samples.slice(TAIL_FROM).map((s) => s.moved);
        const r = fitRate(tail);
        const ratio = r < 1 ? r / (1 - r) : Infinity;
        const sweepsFor1000 = r < 1 ? Math.log(1e-3) / Math.log(r) : Infinity;
        console.log(
          `  ${String(N).padStart(7)} | ${r.toFixed(4)}  ${ratio.toExponential(2).padStart(12)}   ${sweepsFor1000.toFixed(0).padStart(10)}`,
        );
      }
    } finally {
      set_early_exit_bounds(1e-3, 1e-6);
    }
  }, 300_000);
});
