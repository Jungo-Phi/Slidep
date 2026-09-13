import { describe, expect, it } from "vitest";
import { Point2 } from "../../types";
import { DEFAULT_METADATA, DEFAULT_SIMULATION, Mechanism } from "../../types/mechanism";
import type { BeamElement, ForceElement, ID, PivotElement } from "../../types/element";
import type { MaterialDef, ProfileDef } from "../../types/material";
import { parameter_snapshot } from "../solver/dynamics/simulation-engine";
import { actionReducer } from "./action-reducer";
import { rebased_bundle } from "./parameter-rebase";

let nextID = 0;
const id = (): ID => `00000000-0000-0000-0000-${String(++nextID).padStart(12, "0")}` as ID;

const PIVOT_ID = id();
const BEAM_ID = id();
const LOAD_ID = id();
const MATERIAL_ID = id();
const LATE_MATERIAL_ID = id();
const PROFILE_ID = id();

const pivot = (rotationalFriction: number): PivotElement => ({
  type: "pivot",
  id: PIVOT_ID,
  probes: [],
  overlays: {},
  position: new Point2(0, 0),
  isGrounded: true,
  rotatingEdgesIDs: [BEAM_ID],
  fixedGearsIDs: [],
  rotationalFriction,
});

const beam = (materialID: ID): BeamElement => ({
  type: "beam",
  id: BEAM_ID,
  probes: [],
  overlays: {},
  positionStart: new Point2(0, 0),
  positionEnd: new Point2(1, 0),
  fixedNodeStartID: PIVOT_ID,
  fixedNodeEndID: PIVOT_ID,
  fixedNodesBodyIDs: [],
  materialID,
  profileID: PROFILE_ID,
});

const LOAD: ForceElement = {
  type: "force",
  id: LOAD_ID,
  targetID: PIVOT_ID,
  vector: new Point2(0, -1),
  frame: "world",
};

const material = (mid: ID, rho: number): MaterialDef => ({ id: mid, name: "m", E: 1, Re: 1, rho });

const PROFILES: ProfileDef[] = [
  { id: PROFILE_ID, name: "p", shape: { kind: "rect", b: 1, h: 1 } },
];

function mechanism(parts: Partial<Mechanism>): Mechanism {
  return {
    metadata: DEFAULT_METADATA,
    viewport: { scale: 1, pan: new Point2(0, 0) },
    simulation: DEFAULT_SIMULATION,
    mechanicalElements: [],
    constraintElements: [],
    loads: [],
    materials: [],
    profiles: PROFILES,
    history: [],
    future: [],
    ...parts,
  };
}

describe("rebased_bundle", () => {
  // As the mechanism stood at the instant edited, then as later edits in the same run left it.
  const atInstant = mechanism({
    simulation: { ...DEFAULT_SIMULATION, gravity: true },
    mechanicalElements: [pivot(0.1), beam(MATERIAL_ID)],
    loads: [LOAD],
    materials: [material(MATERIAL_ID, 1)],
  });
  const stored = mechanism({
    simulation: { ...DEFAULT_SIMULATION, gravity: false },
    mechanicalElements: [pivot(0.5), beam(LATE_MATERIAL_ID)],
    loads: [],
    materials: [material(MATERIAL_ID, 3), material(LATE_MATERIAL_ID, 4)],
  });
  const shown = parameter_snapshot(2, atInstant);

  it("brings every later edit back to the instant edited", () => {
    const result = actionReducer(stored, rebased_bundle(stored, shown, []), false);
    expect((result.mechanicalElements[0] as PivotElement).rotationalFriction).toBeCloseTo(0.1);
    expect((result.mechanicalElements[1] as BeamElement).materialID).toBe(MATERIAL_ID);
    expect(result.loads.map((load) => load.id)).toEqual([LOAD_ID]);
    expect(result.materials.map((m) => m.id)).toEqual([MATERIAL_ID]);
    expect(result.materials[0].rho).toBeCloseTo(1);
    expect(result.simulation.gravity).toBe(true);
  });

  it("leaves what the edit itself sets to the edit, built against the stored value", () => {
    const edit = { type: "ChangeRotationalFriction" as const, id: PIVOT_ID, delta: 0.8 - 0.5 };
    const result = actionReducer(stored, rebased_bundle(stored, shown, [edit]), false);
    expect((result.mechanicalElements[0] as PivotElement).rotationalFriction).toBeCloseTo(0.8);
  });

  it("recreates an entry the edit may target before the edit runs", () => {
    const edit = {
      type: "ChangeForce" as const,
      id: LOAD_ID,
      newVector: new Point2(0, -2),
      oldVector: LOAD.vector,
    };
    const result = actionReducer(stored, rebased_bundle(stored, shown, [edit]), false);
    expect((result.loads[0] as ForceElement).vector).toEqual(new Point2(0, -2));
  });

  it("adds nothing when the stored parameters already are the instant's", () => {
    expect(rebased_bundle(atInstant, shown, [])).toEqual([]);
  });
});
