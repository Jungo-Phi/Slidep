import { describe, it, expect } from "vitest";
import disconnectJson from "../../../test-mechanisms/Déconnexion courroie.slidep?raw";
import { KinematicSnapshot } from "../../types/runtime-state";
import { load_mechanism } from "../../utils/load-mechanism";
import { Recorder } from "./recorder";
import { apply_snapshot_to_mechanism, RECORD_DT } from "./kinematic-simulation";
import { snapshot_belt_detached } from "./snapshot";

/**
 * Pausing must not change what is simulated.
 *
 * The worker is aimed past the cursor on purpose, so a pause always drops instants it had
 * already solved and goes back to the last one shown. Going back used to mean recompiling
 * the mechanism, which silently put every belt back on the pulleys the run had taken it off
 * — and the two runs parted company a few seconds later.
 */

const fixture = () => load_mechanism(JSON.parse(disconnectJson)).mechanism;

/** Everything recorded up to `to`, and the recorder left sitting there. */
function record(recorder: Recorder, to: number): KinematicSnapshot[] {
  // No budget: a test measures a trajectory, not how much of it fits in a frame.
  return recorder.advance(to, Infinity).snapshots;
}

/** Largest distance between two instants, over every slot both carry. */
function biggestGap(a: KinematicSnapshot, b: KinematicSnapshot): number {
  let worst = 0;
  for (let i = 0; i < a.layout.keys.length; i++) {
    const d = Math.hypot(
      b.positions[2 * i] - a.positions[2 * i],
      b.positions[2 * i + 1] - a.positions[2 * i + 1],
    );
    // A slot with no value gives NaN, which never wins the comparison.
    if (d > worst) worst = d;
  }
  return worst;
}

const last = <T,>(xs: T[]): T => xs[xs.length - 1];

/** Long enough for the fixture's belt to drop a pulley and take it back. */
const END = 3.5;
/** Solving the same seconds over and over is the whole cost of this file. */
let reference: KinematicSnapshot[] | null = null;

describe("reprise après une pause", () => {
  const PAUSE = 2;

  const uninterrupted = () => {
    if (reference) return reference;
    const recorder = new Recorder();
    recorder.load(fixture(), null);
    return (reference = record(recorder, END));
  };

  it("détache puis rattache une poulie en cours de route", () => {
    // What makes this fixture worth resuming on: it is not on the same pulleys throughout.
    const series = uninterrupted();
    const belt = series[0].layout.belts[0];
    const detached = series.map(
      (s) => (snapshot_belt_detached(s, belt) ?? []).length,
    );
    expect(Math.max(...detached)).toBeGreaterThan(0);
    expect(detached[0]).toBe(0);
    expect(last(detached)).toBe(0);
  }, 30000);

  /** Pause on the recorded instant nearest `at`, having recorded a lead past it. */
  const pauseAt = (at: number): KinematicSnapshot => {
    const recorder = new Recorder();
    recorder.load(fixture(), null);
    const shown = record(recorder, at + 4 * RECORD_DT);
    const base = shown.find((s) => Math.abs(s.t - at) < RECORD_DT)!;
    expect(base).toBeDefined();
    recorder.rewind(base);
    return last(record(recorder, END));
  };

  it("reprend sur l'instant montré sans rien changer à la suite", () => {
    // The instants re-solved from there are the ones that were already solved, so the two
    // runs land on the very same state — not merely on a close one.
    expect(biggestGap(last(uninterrupted()), pauseAt(PAUSE))).toBeLessThan(1e-9);
  }, 30000);

  it("reprend même quand la courroie a lâché dans les images jetées", () => {
    // The case the flip journal is there for: a pause drops instants a belt changed
    // topology in, so the no-slip links and junction references it re-baked at the flip
    // have to be taken back. Measuring them afresh lands close, not on the same state.
    const series = uninterrupted();
    const belt = series[0].layout.belts[0];
    const flags = (s: KinematicSnapshot) =>
      (snapshot_belt_detached(s, belt) ?? []).join(",");
    const flip = series.findIndex(
      (s, i) => i > 0 && flags(s) !== flags(series[i - 1]),
    );
    expect(flip).toBeGreaterThan(0);

    // One instant short of the flip, so it falls inside the span the pause discards.
    expect(
      biggestGap(last(series), pauseAt(series[flip - 1].t)),
    ).toBeLessThan(1e-9);
  }, 30000);

  it("garde la courroie sur les poulies qu'elle a quittées", () => {
    // The same rewind, read through what the drawing consumes.
    const recorder = new Recorder();
    recorder.load(fixture(), null);
    const shown = record(recorder, PAUSE + 4 * RECORD_DT);
    const base = shown.find((s) => Math.abs(s.t - PAUSE) < RECORD_DT / 2)!;
    const belt = base.layout.belts[0];
    expect(snapshot_belt_detached(base, belt)).not.toEqual([]);

    recorder.rewind(base);
    const next = record(recorder, PAUSE + 8 * RECORD_DT)[0];
    expect(snapshot_belt_detached(next, belt)).toEqual(
      snapshot_belt_detached(base, belt),
    );
  }, 30000);

  it("retrouve la topologie quand une édition force la recompilation", () => {
    // An edit during simulation has no journal to fall back on: the model is new, and the
    // belt's state has to be read back off the snapshot it resumes on.
    const recorder = new Recorder();
    recorder.load(fixture(), null);
    const shown = record(recorder, PAUSE);
    const base = last(shown);
    const belt = base.layout.belts[0];
    const dropped = snapshot_belt_detached(base, belt);
    expect(dropped).not.toEqual([]);

    const edited = new Recorder();
    edited.load(apply_snapshot_to_mechanism(fixture(), base), base);
    const next = record(edited, PAUSE + 4 * RECORD_DT)[0];
    expect(snapshot_belt_detached(next, belt)).toEqual(dropped);
  }, 30000);
});
