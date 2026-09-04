import { describe, it } from "vitest";
import { appendFileSync, writeFileSync } from "node:fs";
import { Point2 } from "../../src/types";
import type { BeamElement, ID } from "../../src/types/element";
import { DEFAULT_METADATA, DEFAULT_SIMULATION, Mechanism } from "../../src/types/mechanism";
import type { MaterialDef, ProfileDef } from "../../src/types/material";
import { DynamicSnapshot } from "../../src/types/runtime-state";
import {
  RECORD_DT,
  compile_simulation_model,
  step_dynamic_simulation,
} from "../../src/components/solver/dynamics/simulation-engine";
import { resolve_beam_cohesion } from "../../src/components/solver/dynamics/beam-cohesion";

/**
 * A beam falling freely, held by nothing: no constraint acts on it, so its internal force is
 * exactly zero everywhere. The truth is known AND the acceleration is not — which is what the
 * three static cantilevers could not check.
 */
const OUT = "scratch/beam-body/free-fall.txt";
const say = (...a: unknown[]) => appendFileSync(OUT, a.map(String).join(" ") + "\n", "utf8");

let n = 0;
const id = (): ID => `ff${++n}` as ID;
const MATERIAL_ID = id();
const PROFILE_ID = id();
const MATERIALS: MaterialDef[] = [{ id: MATERIAL_ID, name: "t", E: 1, Re: 1, rho: 1 }];
const PROFILES: ProfileDef[] = [{ id: PROFILE_ID, name: "t", shape: { kind: "rect", b: 1, h: 1 } }];

describe("poutre en chute libre", () => {
  it("cohésion nulle, lecture par bilan contre lecture par réactions", () => {
    writeFileSync(OUT, "", "utf8");
    const BEAM = id();
    const beam = {
      type: "beam",
      id: BEAM,
      probes: [],
      overlays: {},
      positionStart: new Point2(0, 0),
      positionEnd: new Point2(3, 0),
      fixedNodesBodyIDs: [],
      materialID: MATERIAL_ID,
      profileID: PROFILE_ID,
    } as unknown as BeamElement;
    const mech: Mechanism = {
      metadata: DEFAULT_METADATA,
      viewport: { scale: 1, pan: new Point2(0, 0) },
      simulation: DEFAULT_SIMULATION,
      mechanicalElements: [beam],
      constraintElements: [],
      loads: [],
      materials: MATERIALS,
      profiles: PROFILES,
      history: [],
      future: [],
    };
    const model = compile_simulation_model(mech, true);
    let snapshot: DynamicSnapshot | null = null;
    for (let i = 0; i < 30; i++) {
      snapshot = step_dynamic_simulation(
        model,
        i * RECORD_DT,
        snapshot,
        RECORD_DT,
        new Point2(0, -9.81),
      );
      if (i % 10 !== 9) continue;
      const positions = new Map<string, Point2>();
      const { keys, firstParts } = model.fill;
      for (let k = 0; k < keys.length; k++) {
        const slot =
          snapshot.layout.index.get(firstParts[k]) ?? snapshot.layout.index.get(keys[k]);
        if (slot === undefined) continue;
        positions.set(
          keys[k],
          new Point2(snapshot.positions[2 * slot], snapshot.positions[2 * slot + 1]),
        );
      }
      const raw = resolve_beam_cohesion(
        model.beamCohesionSpecs,
        snapshot.reactions ?? [],
        positions,
      )[0];
      const bal = snapshot.beamCohesion?.[0];
      say(
        `f=${i}  bilan |R|=${Math.hypot(bal!.start.fx, bal!.start.fy).toExponential(3)}` +
          `   réactions |R|=${Math.hypot(raw.start.fx, raw.start.fy).toExponential(3)}` +
          `   (vérité: 0)`,
      );
    }
  }, 300_000);
});
