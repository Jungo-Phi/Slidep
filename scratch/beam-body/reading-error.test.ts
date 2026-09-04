import { describe, it } from "vitest";
import { appendFileSync, writeFileSync, readdirSync, readFileSync } from "node:fs";
import { Point2 } from "../../src/types";
import { DynamicSnapshot } from "../../src/types/runtime-state";
import { load_mechanism } from "../../src/utils/load-mechanism";
import {
  RECORD_DT,
  compile_simulation_model,
  step_dynamic_simulation,
} from "../../src/components/solver/dynamics/simulation-engine";
import { resolve_beam_cohesion } from "../../src/components/solver/dynamics/beam-cohesion";

/**
 * How wrong is the reaction-based reading, on real mechanisms? On a balanceable beam the
 * converged-state balance is exact (three analytic truths check it), so running BOTH readings
 * on the same frame and differencing them measures the old one's error — no toy case needed.
 */
const OUT = "scratch/beam-body/reading-error.txt";
const say = (...a: unknown[]) => appendFileSync(OUT, a.map(String).join("") + "\n", "utf8");
const G = new Point2(0, -9.81);

describe("erreur de la lecture par réactions", () => {
  it("écart entre les deux lectures, galerie entière", () => {
    writeFileSync(OUT, "", "utf8");
    const rows: [string, string, number, number][] = [];
    for (const file of readdirSync("test-mechanisms").filter((f) => f.endsWith(".slidep"))) {
      const mech = load_mechanism(
        JSON.parse(readFileSync(`test-mechanisms/${file}`, "utf8")),
      ).mechanism;
      const model = compile_simulation_model(mech, true);
      const balanceable = new Set(
        model.beamCohesionSpecs.filter((s) => s.balanceable).map((s) => s.beamID),
      );
      if (balanceable.size === 0) continue;

      let snapshot: DynamicSnapshot | null = null;
      const worst = new Map<string, [number, number]>();
      for (let i = 0; i < 30; i++) {
        snapshot = step_dynamic_simulation(model, i * RECORD_DT, snapshot, RECORD_DT, G);
        // `beamCohesion` on the snapshot is the BALANCED reading; re-resolving without the
        // balance input gives the old one on exactly the same frame.
        const balanced = snapshot.beamCohesion ?? [];
        const raw = resolveRaw(model, snapshot);
        for (const b of balanced) {
          if (!balanceable.has(b.beamID)) continue;
          const r = raw.find((x) => x.beamID === b.beamID);
          if (!r) continue;
          const d = Math.hypot(r.start.fx - b.start.fx, r.start.fy - b.start.fy);
          const scale = Math.max(
            Math.hypot(b.start.fx, b.start.fy),
            Math.hypot(r.start.fx, r.start.fy),
            1e-9,
          );
          const prev = worst.get(b.beamID) ?? [0, 0];
          if (d > prev[0]) worst.set(b.beamID, [d, (100 * d) / scale]);
        }
      }
      for (const [beamID, [abs, pct]] of worst)
        rows.push([file.replace(".slidep", ""), beamID.slice(0, 6), abs, pct]);
    }
    rows.sort((a, b) => b[3] - a[3]);
    say("mécanisme".padEnd(32), "poutre".padEnd(8), "écart N".padStart(12), "  % de la lecture");
    for (const [m, b, abs, pct] of rows)
      say(m.padEnd(32), b.padEnd(8), abs.toFixed(4).padStart(12), "  ", pct.toFixed(2), " %");
  }, 900_000);
});

/** The same frame, resolved without the balance — i.e. the reading as it was. */
function resolveRaw(
  model: ReturnType<typeof compile_simulation_model>,
  snapshot: DynamicSnapshot,
) {
  const positions = new Map<string, Point2>();
  const { keys, firstParts } = model.fill;
  for (let i = 0; i < keys.length; i++) {
    const slot = snapshot.layout.index.get(firstParts[i]) ?? snapshot.layout.index.get(keys[i]);
    if (slot === undefined) continue;
    positions.set(keys[i], new Point2(snapshot.positions[2 * slot], snapshot.positions[2 * slot + 1]));
  }
  return resolve(model, snapshot, positions);
}

function resolve(
  model: ReturnType<typeof compile_simulation_model>,
  snapshot: DynamicSnapshot,
  positions: Map<string, Point2>,
) {
  return resolve_beam_cohesion(model.beamCohesionSpecs, snapshot.reactions ?? [], positions);
}
