import { describe, expect, it } from "vitest";
import { Point2 } from "../../types";
import { DEFAULT_METADATA, DEFAULT_SIMULATION, Mechanism } from "../../types/mechanism";
import type {
  BeamElement,
  ID,
  MassElement,
  MechanicalElement,
  PivotElement,
} from "../../types/element";
import type { MaterialDef, ProfileDef } from "../../types/material";
import { DynamicSnapshot } from "../../types/runtime-state";
import { RECORD_DT, compile_simulation_model, step_dynamic_simulation } from "./simulation-engine";
import { snapshot_acceleration } from "./snapshot";

const GRAVITY_Y = -9.81; // world is Y-up, so "down" is negative

let nextID = 0;
const id = (): ID => `00000000-0000-0000-0000-${String(++nextID).padStart(12, "0")}` as ID;

/** The one beam here wants a near-massless 0.001 kg/m — a 1×1 m rectangle, ρ = 0.001. */
const MATERIAL_ID = id();
const PROFILE_ID = id();
const MATERIALS: MaterialDef[] = [
  { id: MATERIAL_ID, name: "test", E: 1, Re: 1, rho: 0.001 },
];
const PROFILES: ProfileDef[] = [
  { id: PROFILE_ID, name: "test", shape: { kind: "rect", b: 1, h: 1 } },
];

function mechanism(mechanicalElements: MechanicalElement[]): Mechanism {
  return {
    metadata: DEFAULT_METADATA,
    viewport: { scale: 1, pan: new Point2(0, 0) },
    simulation: DEFAULT_SIMULATION,
    mechanicalElements,
    constraintElements: [],
    loads: [],
    materials: MATERIALS,
    profiles: PROFILES,
    history: [],
    future: [],
  };
}

// This is what phase 4 (le champ, par coupe) leans on for the inertia term `−μ·a(s)`: the
// accumulated `(v_after − v_before) / dt` `step_dynamic_simulation` now exposes per dof —
// see docs/plan-efforts-interieurs.md phase 2.
describe("DynamicSnapshot.accelerations", () => {
  it("un point libre en chute libre accélère de g, dès la première frame", () => {
    const MASS = id();
    const mass: MassElement = {
      type: "mass",
      id: MASS,
      probes: [],
      overlays: {},
      position: new Point2(0, 0),
      isGrounded: false,
      fixedEdgesIDs: [],
      mass: 3, // any value: gravity is mass-independent
    };
    const model = compile_simulation_model(mechanism([mass]));
    const snapshot = step_dynamic_simulation(
      model,
      0,
      null,
      RECORD_DT,
      new Point2(0, GRAVITY_Y),
    );
    const a = snapshot_acceleration(snapshot, MASS);
    expect(a?.x).toBeCloseTo(0, 6);
    expect(a?.y).toBeCloseTo(GRAVITY_Y, 6);
  });

  it("une masse pendue à une tige, déjà à l'équilibre, n'accélère pas", () => {
    const ANCHOR = id();
    const MASS = id();
    const ROD = id();
    const anchor: PivotElement = {
      type: "pivot",
      id: ANCHOR,
      probes: [],
      overlays: {},
      position: new Point2(0, 0),
      isGrounded: true,
      rotatingEdgesIDs: [ROD],
      fixedGearsIDs: [],
      rotationalFriction: 0,
    };
    const mass: MassElement = {
      type: "mass",
      id: MASS,
      probes: [],
      overlays: {},
      position: new Point2(0, -100),
      isGrounded: false,
      fixedEdgesIDs: [ROD],
      mass: 1,
    };
    const rod: BeamElement = {
      type: "beam",
      id: ROD,
      probes: [],
      overlays: {},
      positionStart: new Point2(0, 0),
      positionEnd: new Point2(0, -100),
      fixedNodeStartID: ANCHOR,
      fixedNodeEndID: MASS,
      fixedNodesBodyIDs: [],
      materialID: MATERIAL_ID,
      profileID: PROFILE_ID, // near-massless: only the hanging mass should matter
    };
    const model = compile_simulation_model(mechanism([anchor, mass, rod]));
    let snapshot: DynamicSnapshot | null = null;
    for (let i = 0; i < 30; i++)
      snapshot = step_dynamic_simulation(
        model,
        i * RECORD_DT,
        snapshot,
        RECORD_DT,
        new Point2(0, GRAVITY_Y),
      );
    const a = snapshot_acceleration(snapshot!, MASS);
    expect(a?.x).toBeCloseTo(0, 1);
    expect(a?.y).toBeCloseTo(0, 1);
  });
});
