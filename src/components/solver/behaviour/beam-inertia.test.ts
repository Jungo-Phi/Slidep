import { describe, expect, it } from "vitest";
import { DEFAULT_METADATA, DEFAULT_SIMULATION, Mechanism } from "../../../types/mechanism";
import { Point2 } from "../../../types/point2";
import type { BeamElement, ID, MechanicalElement, PivotElement } from "../../../types/element";
import type { MaterialDef, ProfileDef } from "../../../types/material";
import {
  RECORD_DT,
  compile_simulation_model,
  step_dynamic_simulation,
} from "../dynamics/simulation-engine";
import { DynamicSnapshot } from "../../../types/runtime-state";
import { snapshot_velocity } from "../snapshot";

/**
 * A motor driving a beam pivoted at one of its own ends, saturated on its torque limit the
 * whole run (target speed far out of reach), isolates the beam's OWN rotational inertia: the
 * requested torque is clamped to `torqueLimit` regardless of any control-law estimate, so the
 * resulting angular acceleration is governed entirely by what the constraint solve thinks the
 * beam weighs where. A uniform rod pivoted at one end has `J = mL²/3` — the two-point
 * (½ mass at each end) model this guards against instead behaves like `J = (m/2)L²`, 1.5×
 * too stiff, and would undershoot the expected tip speed well outside solver noise.
 */

let nextID = 0;
const id = (): ID =>
  `00000000-0000-0000-0000-${String(++nextID).padStart(12, "0")}` as ID;

function mechanism(
  mechanicalElements: MechanicalElement[],
  materials: MaterialDef[] = [],
  profiles: ProfileDef[] = [],
): Mechanism {
  return {
    metadata: DEFAULT_METADATA,
    viewport: { scale: 1, pan: new Point2(0, 0) },
    simulation: DEFAULT_SIMULATION,
    mechanicalElements,
    constraintElements: [],
    loads: [],
    materials,
    profiles,
    history: [],
    future: [],
  };
}

/** A material+profile pair whose `ρ·A` is exactly `linearMass` — a 1×1 m rectangle so `A = 1`
 *  and `ρ` alone carries the value. */
function material_profile(linearMass: number): {
  materialID: ID;
  profileID: ID;
  materials: MaterialDef[];
  profiles: ProfileDef[];
} {
  const materialID = id();
  const profileID = id();
  return {
    materialID,
    profileID,
    materials: [{ id: materialID, name: "test", E: 1, Re: 1, rho: linearMass }],
    profiles: [{ id: profileID, name: "test", shape: { kind: "rect", b: 1, h: 1 } }],
  };
}

describe("inertie propre d'une poutre en mode dynamique", () => {
  it("répond à un moteur saturé selon J = mL²/3, pas (m/2)L²", () => {
    const HUB = id();
    const DRIVEN = id();
    const LENGTH = 10;
    const LINEAR_MASS = 1; // beam mass = 10 kg
    const { materialID, profileID, materials, profiles } = material_profile(LINEAR_MASS);
    const BEAM_MASS = LINEAR_MASS * LENGTH;
    const J_TRUE = (BEAM_MASS * LENGTH * LENGTH) / 3;
    const TORQUE = J_TRUE; // chosen so the true α is exactly 1 rad/s²

    const hub: PivotElement = {
      type: "pivot",
      id: HUB,
      probes: [],
      overlays: {},
      position: new Point2(0, 0),
      isGrounded: true,
      rotatingEdgesIDs: [DRIVEN],
      fixedGearsIDs: [],
      rotationalFriction: 0,
      motor: { parentBeamID: undefined, speed: 1000, torque: TORQUE },
    };
    const driven: BeamElement = {
      type: "beam",
      id: DRIVEN,
      probes: [],
      overlays: {},
      positionStart: new Point2(0, 0),
      positionEnd: new Point2(LENGTH, 0),
      fixedNodeStartID: HUB,
      fixedNodeEndID: undefined,
      fixedNodesBodyIDs: [],
      materialID,
      profileID,
    };

    const model = compile_simulation_model(mechanism([hub, driven], materials, profiles));
    let snapshot: DynamicSnapshot | null = null;
    const FRAMES = 12;
    for (let i = 0; i < FRAMES; i++) {
      snapshot = step_dynamic_simulation(
        model,
        i * RECORD_DT,
        snapshot,
        RECORD_DT,
        new Point2(0, 0),
      );
    }
    const elapsed = FRAMES * RECORD_DT;
    const tipSpeed = snapshot_velocity(snapshot!, `${DRIVEN}:end`)!.length();
    const expectedTipSpeed = (TORQUE / J_TRUE) * elapsed * LENGTH; // = elapsed * LENGTH here

    // The old two-point model gives J = (m/2)L² = 1.5× J_TRUE, i.e. 1.5× too slow — well
    // outside this tolerance, which the real distributed inertia comfortably clears.
    expect(tipSpeed).toBeGreaterThan(expectedTipSpeed * 0.8);
    expect(tipSpeed).toBeLessThan(expectedTipSpeed * 1.2);
  });
});
