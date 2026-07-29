import { describe, it } from "vitest";

/**
 * TEMPORARY — the cursor clock, simulated. NOT a measurement of the app: it replays the
 * arithmetic of the RAF loop against a synthetic producer, to see whether the current
 * policy can turn a bursty producer into a jerky cursor, and what removes it.
 *
 * The producer is a worker: it works in slices of `sliceMs`, yields between them (a
 * `setTimeout(0)` is clamped to a few ms), and whatever it emitted lands at the next
 * display frame. So its output arrives in lumps, at a rate unrelated to the frame rate.
 */

const FRAME_MS = 1000 / 60;
const FRAMES = 600;

interface Producer {
  /** Wall-clock ms one simulated step costs. */
  stepCostMs: number;
  sliceMs: number;
  yieldMs: number;
}

/** Simulated seconds the producer has finished by wall-clock time `ms`. */
function producedBy(p: Producer, ms: number, stepDt: number): number {
  const cycle = p.sliceMs + p.yieldMs;
  const whole = Math.floor(ms / cycle);
  const inCycle = Math.min(ms - whole * cycle, p.sliceMs);
  const stepsPerSlice = Math.max(1, Math.floor(p.sliceMs / p.stepCostMs));
  const steps =
    whole * stepsPerSlice + Math.floor(inCycle / p.stepCostMs);
  return steps * stepDt;
}

/** Coefficient of variation of the per-frame cursor advance — 0 is perfectly smooth. */
function jerk(deltas: number[]): number {
  const kept = deltas.slice(60); // ignore the start-up
  const mean = kept.reduce((a, b) => a + b, 0) / kept.length;
  if (mean === 0) return NaN;
  const varr =
    kept.reduce((a, b) => a + (b - mean) * (b - mean), 0) / kept.length;
  return Math.sqrt(varr) / mean;
}

/** Current policy: the cursor may lead the frontier by exactly one step. */
function clamped(p: Producer, speed: number, stepDt: number) {
  let time = 0;
  const deltas: number[] = [];
  for (let f = 1; f <= FRAMES; f++) {
    const reached = producedBy(p, f * FRAME_MS, stepDt);
    const requested = time + (FRAME_MS / 1000) * speed;
    const next = Math.min(requested, reached + stepDt);
    deltas.push(Math.max(0, next - time));
    time = Math.max(time, next);
  }
  return { deltas, time };
}

/**
 * Buffered + rate-smoothed: run at the requested speed while the buffer holds, and when it
 * is dry run at a LOW-PASSED estimate of what the producer sustains, rather than at
 * whatever happened to arrive this frame.
 */
function smoothed(
  p: Producer,
  speed: number,
  stepDt: number,
  bufferSec: number,
  alpha: number,
) {
  let time = 0;
  let rate = speed; // simulated seconds per real second, smoothed
  let prevReached = 0;
  const deltas: number[] = [];
  for (let f = 1; f <= FRAMES; f++) {
    const reached = producedBy(p, f * FRAME_MS, stepDt);
    const observed = (reached - prevReached) / (FRAME_MS / 1000);
    prevReached = reached;
    rate = (1 - alpha) * rate + alpha * Math.min(observed, speed);

    const buffer = reached - time;
    const wanted = buffer > bufferSec ? speed : rate;
    let next = time + (FRAME_MS / 1000) * wanted;
    if (next > reached) next = reached; // never read what does not exist
    deltas.push(Math.max(0, next - time));
    time = Math.max(time, next);
  }
  return { deltas, time };
}

describe("horloge du curseur", () => {
  it("gigue du curseur selon la politique", () => {
    const stepDt = 1 / 120;
    // Measured in `startup.bench.test.ts`, steady state.
    const CASES: [string, Producer][] = [
      ["Core XY (5.2 ms/pas)", { stepCostMs: 5.2, sliceMs: 8, yieldMs: 4 }],
      ["Poulie bloqueuse (1.8)", { stepCostMs: 1.8, sliceMs: 8, yieldMs: 4 }],
      ["Jansen (0.3)", { stepCostMs: 0.3, sliceMs: 8, yieldMs: 4 }],
      ["Core XY, tranche 50 ms", { stepCostMs: 5.2, sliceMs: 50, yieldMs: 4 }],
    ];

    for (const speed of [1, 4]) {
      console.log(`\n  ### vitesse ×${speed}`);
      console.log(
        "  | producteur | débit / demande | gigue actuelle | gigue lissée | vitesse réelle |",
      );
      console.log("  |---|---|---|---|---|");
      for (const [name, p] of CASES) {
        const stepsPerSec =
          (Math.max(1, Math.floor(p.sliceMs / p.stepCostMs)) * 1000) /
          (p.sliceMs + p.yieldMs);
        const supply = stepsPerSec * stepDt; // simulated seconds per real second
        const a = clamped(p, speed, stepDt);
        const b = smoothed(p, speed, stepDt, 0.15, 0.1);
        const realSpeed = b.time / ((FRAMES * FRAME_MS) / 1000);
        console.log(
          `  | ${name} | ${(supply / speed).toFixed(2)}× | ` +
            `**${jerk(a.deltas).toFixed(2)}** | ${jerk(b.deltas).toFixed(2)} | ` +
            `×${realSpeed.toFixed(2)} |`,
        );
      }
    }
  });

  it("taille du tampon : ce qu'elle achète", () => {
    const stepDt = 1 / 120;
    const p: Producer = { stepCostMs: 5.2, sliceMs: 8, yieldMs: 4 };
    console.log("\n  | tampon visé | gigue | vitesse réelle (×1 demandé) |");
    console.log("  |---|---|---|");
    for (const buf of [0, 0.05, 0.15, 0.5, 1]) {
      const r = smoothed(p, 1, stepDt, buf, 0.1);
      console.log(
        `  | ${buf.toFixed(2)} s | ${jerk(r.deltas).toFixed(2)} | ×${(r.time / ((FRAMES * FRAME_MS) / 1000)).toFixed(2)} |`,
      );
    }
  });
});
