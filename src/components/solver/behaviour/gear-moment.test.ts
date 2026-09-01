import { describe, expect, it } from "vitest";
import { DEFAULT_METADATA, DEFAULT_SIMULATION, Mechanism } from "../../../types/mechanism";
import { Point2 } from "../../../types/point2";
import type {
  GearElement,
  ID,
  MechanicalElement,
  MomentElement,
  PivotElement,
} from "../../../types/element";
import {
  RECORD_DT,
  compile_simulation_model,
  step_dynamic_simulation,
} from "../dynamics/simulation-engine";
import { DynamicSnapshot } from "../../../types/runtime-state";
import { snapshot_angle_velocity } from "../snapshot";

/** A moment on a gear whose axle is grounded — the common case, and the one that hides a
 *  key-fusion bug: the gear's own position is Coincidence-fused to its pivot, but its angle
 *  DOF never is. */

let nextID = 0;
const id = (): ID =>
  `00000000-0000-0000-0000-${String(++nextID).padStart(12, "0")}` as ID;

function mechanism(
  mechanicalElements: MechanicalElement[],
  loads: MomentElement[],
): Mechanism {
  return {
    metadata: DEFAULT_METADATA,
    viewport: { scale: 1, pan: new Point2(0, 0) },
    simulation: DEFAULT_SIMULATION,
    mechanicalElements,
    constraintElements: [],
    loads,
    materials: [],
    profiles: [],
    history: [],
    future: [],
  };
}

describe("moment appliqué à un gear en mode dynamique", () => {
  it("fait tourner un gear seul, monté sur un axle grounded", () => {
    const GEAR = id();
    const AXLE = id();

    const axle: PivotElement = {
      type: "pivot",
      id: AXLE,
      probes: [],
      overlays: {},
      position: new Point2(0, 0),
      isGrounded: true,
      rotatingEdgesIDs: [],
      fixedGearsIDs: [GEAR],
      rotationalFriction: 0,
    };
    const gear: GearElement = {
      type: "gear",
      id: GEAR,
      probes: [],
      overlays: {},
      position: new Point2(0, 0),
      angle: 0,
      radius: 10,
      parentAxleID: AXLE,
      fixedNodesBodyIDs: [],
      meshedGearsIDs: [],
      surfaceMass: 1,
    };
    const moment: MomentElement = {
      type: "moment",
      id: id(),
      targetID: GEAR,
      value: 50,
    };

    const model = compile_simulation_model(mechanism([axle, gear], [moment]));
    let snapshot: DynamicSnapshot | null = null;
    for (let i = 0; i < 30; i++) {
      snapshot = step_dynamic_simulation(
        model,
        i * RECORD_DT,
        snapshot,
        RECORD_DT,
        new Point2(0, 0),
      );
    }
    const w = snapshot_angle_velocity(snapshot!, GEAR);
    expect(w).toBeDefined();
    // Positive `value` is clockwise, i.e. negative in the solver's raw angle convention
    // (see load-model.ts's sign flip) — the bug this guards against silently dropped the
    // torque, which would leave `w` at exactly 0 rather than merely small.
    expect(w).toBeLessThan(-1e-4);
  });
});
