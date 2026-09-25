import { describe, expect, it } from "vitest";
import { Point2 } from "../src/types";
import type { BeamElement, ID, JoinElement } from "../src/types/element";
import { DEFAULT_METADATA, DEFAULT_SIMULATION, Mechanism } from "../src/types/mechanism";
import type { MaterialDef, ProfileDef } from "../src/types/material";
import { DynamicSnapshot } from "../src/types/runtime-state";
import {
  RECORD_DT,
  compile_simulation_model,
  step_dynamic_simulation,
} from "../src/components/solver/dynamics/simulation-engine";

/**
 * The simplest reading Slidep makes: a cantilever holding nothing but itself.
 * A uniform beam of mass m fixed at one end carries m·g of shear and m·g·L/2 of moment at its root — no modelling choice, no tolerance, statics.
 *
 * It is also the one case where the beam's virtual midpoint carries the mass it exists for (two thirds of it, `BEAM_END_MASS_FRACTION`), so nothing here can be isolated by removing it: the comparison has to be against the truth.
 */

let n = 0;
const id = (): ID => `sw${++n}` as ID;

const MATERIAL_ID = id();
const PROFILE_ID = id();
/** ρ = 1 on a 1×1 section: a beam's mass in kg is its length in metres. */
const MATERIALS: MaterialDef[] = [{ id: MATERIAL_ID, name: "test", E: 210e9, Re: 1, rho: 1 }];
const PROFILES: ProfileDef[] = [
  { id: PROFILE_ID, name: "test", shape: { kind: "rect", b: 1, h: 1 } },
];
const G = 9.81;

/** Root cohesion of a beam of `length` m hanging off a grounded encastrement, under gravity. */
function root_of(length: number) {
  const JOIN = id();
  const BEAM = id();
  const join = {
    type: "join",
    id: JOIN,
    probes: [],
    overlays: {},
    position: new Point2(0, 0),
    isGrounded: true,
    fixedEdgesIDs: [BEAM],
  } as unknown as JoinElement;
  const beam = {
    type: "beam",
    id: BEAM,
    probes: [],
    overlays: {},
    positionStart: new Point2(0, 0),
    positionEnd: new Point2(length, 0),
    fixedNodeStartID: JOIN,
    fixedNodesBodyIDs: [],
    materialID: MATERIAL_ID,
    profileID: PROFILE_ID,
  } as unknown as BeamElement;
  const mechanism: Mechanism = {
    metadata: DEFAULT_METADATA,
    viewport: { scale: 1, pan: new Point2(0, 0) },
    simulation: DEFAULT_SIMULATION,
    mechanicalElements: [join, beam],
    constraintElements: [],
    loads: [],
    materials: MATERIALS,
    profiles: PROFILES,
    history: [],
    future: [],
  };

  const model = compile_simulation_model(mechanism, true);
  let snapshot: DynamicSnapshot | null = null;
  for (let i = 0; i < 40; i++)
    snapshot = step_dynamic_simulation(
      model,
      i * RECORD_DT,
      snapshot,
      RECORD_DT,
      new Point2(0, -G),
    );
  const cohesion = snapshot!.beamCohesion?.find((c) => c.beamID === BEAM);
  return { cohesion, weight: length * G, moment: (length * G * length) / 2 };
}

describe("un cantilever qui ne porte que lui-même", () => {
  it("lit son propre poids à la racine, pour une poutre courte", () => {
    const { cohesion, weight, moment } = root_of(1);
    expect(cohesion).toBeDefined();
    // 1 % of the quantity read — the tolerance the effort readings are documented to hold (docs/ratio-masse-convergence-dynamique.md), not a figure fitted to what comes out.
    expect(cohesion!.start.fy).toBeCloseTo(-weight, 2);
    expect(cohesion!.start.m).toBeCloseTo(-moment, 2);
  }, 60_000);

  // The reading that made this file worth writing: read off the links, the same beam made longer lost a whole `BEAM_END_MASS_FRACTION` lump — −16.67 % at 1.5 m and 2 m, −33.33 % at 3 m and 5 m — while the POSITIONS it came from were exact to 1e-19.
  // A torsor is now balanced off the converged state instead wherever nothing is transmitted at the far end (`BeamCohesionSpec.balanceable`), which is what this length sweep guards.
  it("lit son propre poids à la racine, quelle que soit sa longueur", () => {
    for (const length of [1.5, 2, 3, 5]) {
      const { cohesion, weight, moment } = root_of(length);
      expect(cohesion).toBeDefined();
      expect(cohesion!.start.fy).toBeCloseTo(-weight, 2);
      expect(cohesion!.start.m).toBeCloseTo(-moment, 2);
      // And it says so: a reading balanced off the state is the one a reader may take as a figure rather than as an indication (`BeamCohesion.determinate`).
      expect(cohesion!.determinate).toBe(true);
    }
  }, 60_000);
});

import { writeFileSync } from "node:fs";
describe("instrument", () => {
  it("sweeps", () => {
    const out: string[] = [];
    for (const gate of [true, false]) for (const L of [1, 1.5, 2, 3, 5]) { (globalThis as any).__gate = gate; (globalThis as any).__parity = gate;
      const log: string[] = []; (globalThis as any).__typeLog = log;
      const { cohesion, weight } = root_of(L);
      (globalThis as any).__typeLog = undefined;
      out.push(`gate=${gate} L=${L} fy=${cohesion!.start.fy} expected ${-weight}; last frame substeps: ${log.slice(-16).join(" ")}; first: ${log.slice(0, 16).join(" ")}`);
    }
    writeFileSync("C:/Users/arnol/Documents/slidep/scratch/selfweight.txt", out.join("\n"));
  }, 120000);
});
