import { describe, expect, it } from "vitest";
import { Point2 } from "../../../types";
import type { BeamElement } from "../../../types/element";
import type { DynamicSnapshot } from "../../../types/runtime-state";
import { load_mechanism } from "../../../utils/load-mechanism";
import { RECORD_DT, compile_simulation_model, step_dynamic_simulation } from "../dynamics/simulation-engine";
import { compute_cohesion_field } from "../recording/cohesion-field";

/**
 * Every mechanism of the gallery, against the one check that needs no reference answer: marching the internal forces along a beam from its start must land on what the statics solve says at its end.
 * A gap means an action the solve balanced never reached the field, or one the dynamics applied never reached the solve — the way a dropped couple, a missing motor force or a lagging acceleration all showed up first.
 */
const files = import.meta.glob("../../../../test-mechanisms/*.slidep", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** Out for now: its frames cost about a second each, and it adds nothing the others do not cover. */
const SKIPPED = new Set(["Pendulum clock.slidep"]);

/** Where the check fails for a reason known and not yet fixed. */
const KNOWN = new Set<string>();

const FRAMES = 60;
const EVERY = 3;
const TOLERANCE = 1e-3;
const GRAVITY = new Point2(0, -9.81);

/** Worst loop gap over the run, against the largest force (and force × length) any beam of the mechanism carries at that frame — a beam carrying next to nothing is judged by the mechanism's scale, not by its own dust. */
function worst_gap(json: string): number {
  const mechanism = load_mechanism(JSON.parse(json)).mechanism;
  const model = compile_simulation_model(mechanism, true);
  const gravity = mechanism.simulation.gravity ? GRAVITY : new Point2(0, 0);
  const beams = new Map(
    mechanism.mechanicalElements
      .filter((e): e is BeamElement => e.type === "beam")
      .map((b) => [b.id, b]),
  );
  let worst = 0;
  let snapshot: DynamicSnapshot | null = null;
  for (let i = 0; i < FRAMES; i++) {
    snapshot = step_dynamic_simulation(model, i * RECORD_DT, snapshot, RECORD_DT, gravity);
    if (i % EVERY !== EVERY - 1) continue;
    let force = 0;
    let moment = 0;
    const gaps: { force: number; moment: number }[] = [];
    for (const cohesion of snapshot.beamCohesion ?? []) {
      const beam = beams.get(cohesion.beamID);
      if (!beam) continue;
      const field = compute_cohesion_field(beam, mechanism.materials, mechanism.profiles, cohesion, mechanism.loads, snapshot, gravity);
      if (!field) continue;
      for (const sample of field.samples) {
        force = Math.max(force, Math.abs(sample.N), Math.abs(sample.T));
        moment = Math.max(moment, Math.abs(sample.Mf));
      }
      moment = Math.max(moment, force * field.length);
      const r = field.loopResidual;
      gaps.push({ force: Math.hypot(r.fx, r.fy), moment: Math.abs(r.m) });
    }
    if (force <= 0) continue;
    for (const gap of gaps)
      worst = Math.max(worst, gap.force / force, gap.moment / Math.max(moment, 1e-12));
  }
  return worst;
}

describe("la galerie referme ses efforts intérieurs le long de chaque poutre", () => {
  for (const [path, json] of Object.entries(files)) {
    const name = path.split("/").pop()!;
    if (SKIPPED.has(name)) continue;
    (KNOWN.has(name) ? it.fails : it)(name, () => {
      expect(worst_gap(json)).toBeLessThan(TOLERANCE);
    }, 120_000);
  }
});
