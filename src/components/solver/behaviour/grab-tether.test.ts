import { describe, expect, it } from "vitest";
import { DEFAULT_METADATA, DEFAULT_SIMULATION, Mechanism } from "../../../types/mechanism";
import { Point2 } from "../../../types/point2";
import type { BeamElement, ID, PivotElement } from "../../../types/element";
import type { MaterialDef, ProfileDef } from "../../../types/material";
import type { KinematicSnapshot } from "../../../types/runtime-state";
import {
  RECORD_DT,
  compile_simulation_model,
  step_simulation,
  type SimGrab,
} from "../dynamics/simulation-engine";
import { snapshot_point } from "../snapshot";

const PIVOT = "00000000-0000-0000-0000-000000000001" as ID;
const ARM = "00000000-0000-0000-0000-000000000002" as ID;
const MATERIAL_ID = "00000000-0000-0000-0000-000000000003" as ID;
const PROFILE_ID = "00000000-0000-0000-0000-000000000004" as ID;
const MATERIALS: MaterialDef[] = [{ id: MATERIAL_ID, name: "test", E: 210e9, Re: 1, rho: 1 }];
const PROFILES: ProfileDef[] = [
  { id: PROFILE_ID, name: "test", shape: { kind: "rect", b: 1, h: 1 } },
];

const pivot: PivotElement = {
  type: "pivot",
  id: PIVOT,
  probes: [],
  overlays: {},
  position: new Point2(0, 0),
  isGrounded: true,
  rotatingEdgesIDs: [],
  fixedGearsIDs: [],
  rotationalFriction: 0,
};

/** An arm 20 long turning about a grounded pivot at the origin: whatever the cursor does, its tip stays on that circle. */
const arm: BeamElement = {
  type: "beam",
  id: ARM,
  probes: [],
  overlays: {},
  positionStart: new Point2(0, 0),
  positionEnd: new Point2(20, 0),
  fixedNodeStartID: PIVOT,
  fixedNodesBodyIDs: [],
  materialID: MATERIAL_ID,
  profileID: PROFILE_ID,
};

const MECHANISM: Mechanism = {
  metadata: DEFAULT_METADATA,
  viewport: { scale: 1, pan: new Point2(0, 0) },
  simulation: DEFAULT_SIMULATION,
  mechanicalElements: [pivot, arm],
  constraintElements: [],
  loads: [],
  materials: MATERIALS,
  profiles: PROFILES,
  history: [],
  future: [],
};

function pull(grab: SimGrab | undefined, frames = 30): KinematicSnapshot {
  const model = compile_simulation_model(MECHANISM);
  let snapshot: KinematicSnapshot | null = null;
  for (let i = 0; i < frames; i++)
    snapshot = step_simulation(model, i * RECORD_DT, snapshot, RECORD_DT, grab);
  return snapshot!;
}

describe("a kinematic grab's tether", () => {
  it("runs from the grabbed point as solved to the cursor it cannot reach", () => {
    const target = new Point2(0, 40);
    const snapshot = pull({ key: `${ARM}:end`, target });
    const tip = snapshot_point(snapshot, `${ARM}:end`)!;
    expect(snapshot.grab).toEqual({ elementID: ARM, x: tip.x, y: tip.y, tx: 0, ty: 40 });
    // The tip stays on its circle, so the tether spans what the arm cannot reach.
    expect(Math.hypot(snapshot.grab!.tx - tip.x, snapshot.grab!.ty - tip.y)).toBeGreaterThan(15);
  });

  it("names the beam held by its body", () => {
    const snapshot = pull({ edgeID: ARM, t: 0.5, target: new Point2(0, 40) });
    expect(snapshot.grab?.elementID).toBe(ARM);
    // Mid-span of an arm 20 long: 10 from the pivot.
    expect(Math.hypot(snapshot.grab!.x, snapshot.grab!.y)).toBeCloseTo(10, 1);
  });

  it("is absent once the cursor lets go", () => {
    expect(pull(undefined, 1).grab).toBeUndefined();
  });
});
