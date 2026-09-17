import { describe, expect, it } from "vitest";
import { DEFAULT_METADATA, DEFAULT_SIMULATION, Mechanism } from "../../../types/mechanism";
import { Point2 } from "../../../types/point2";
import type {
  BeamElement,
  ID,
  JoinElement,
  MassElement,
  MechanicalElement,
  PivotElement,
} from "../../../types/element";
import type { MaterialDef, ProfileDef } from "../../../types/material";
import {
  RECORD_DT,
  compile_simulation_model,
  step_dynamic_simulation,
} from "../dynamics/simulation-engine";
import { DynamicSnapshot } from "../../../types/runtime-state";
import { snapshot_velocity } from "../snapshot";

/**
 * The mass a node with none of its own is given so the solve never divides by zero has to stay small next to what it hangs off.
 * A limb carrying nothing — a rod welded to a pendulum's bob, ending on a bare join — is the case: every node it adds is massless, so whatever the floor lends them is pure invention, and the pendulum must swing as though the limb were not there.
 */

let nextID = 0;
const id = (): ID =>
  `00000000-0000-0000-0000-${String(++nextID).padStart(12, "0")}` as ID;

const LENGTH = 1;
const BOB_MASS = 1;
const GRAVITY = new Point2(0, -9.81);
const FRAMES = 20;

/** A material+profile pair whose `ρ·A` is `linearMass` — a 1×1 m rectangle, so `ρ` alone carries it. */
function material_profile(linearMass: number) {
  const materialID = id();
  const profileID = id();
  return {
    materialID,
    profileID,
    materials: [{ id: materialID, name: "test", E: 210e9, Re: 1, rho: linearMass }] as MaterialDef[],
    profiles: [{ id: profileID, name: "test", shape: { kind: "rect", b: 1, h: 1 } }] as ProfileDef[],
  };
}

/** The bob's speed after `FRAMES`, on a pendulum carrying a weightless limb or nothing at all. */
function bob_speed(withLimb: boolean): number {
  const HUB = id();
  const ROD = id();
  const BOB = id();
  const { materialID, profileID, materials, profiles } = material_profile(0);

  const hub: PivotElement = {
    type: "pivot",
    id: HUB,
    probes: [],
    overlays: {},
    position: new Point2(0, 0),
    isGrounded: true,
    rotatingEdgesIDs: [ROD],
    fixedGearsIDs: [],
    rotationalFriction: 0,
  };
  const bob: MassElement = {
    type: "mass",
    id: BOB,
    probes: [],
    overlays: {},
    position: new Point2(LENGTH, 0),
    isGrounded: false,
    fixedEdgesIDs: [ROD],
    mass: BOB_MASS,
  };
  const rod: BeamElement = {
    type: "beam",
    id: ROD,
    probes: [],
    overlays: {},
    positionStart: new Point2(0, 0),
    positionEnd: new Point2(LENGTH, 0),
    fixedNodeStartID: HUB,
    fixedNodeEndID: BOB,
    fixedNodesBodyIDs: [],
    materialID,
    profileID,
  };
  const elements: MechanicalElement[] = [hub, bob, rod];

  if (withLimb) {
    const LIMB = id();
    const TIP = id();
    const tip: JoinElement = {
      type: "join",
      id: TIP,
      probes: [],
      overlays: {},
      position: new Point2(LENGTH, -LENGTH),
      isGrounded: false,
      fixedEdgesIDs: [LIMB],
    };
    const limb: BeamElement = {
      type: "beam",
      id: LIMB,
      probes: [],
      overlays: {},
      positionStart: new Point2(LENGTH, 0),
      positionEnd: new Point2(LENGTH, -LENGTH),
      fixedNodeStartID: BOB,
      fixedNodeEndID: TIP,
      fixedNodesBodyIDs: [],
      materialID,
      profileID,
    };
    bob.fixedEdgesIDs = [ROD, LIMB];
    elements.push(tip, limb);
  }

  const mechanism: Mechanism = {
    metadata: DEFAULT_METADATA,
    viewport: { scale: 1, pan: new Point2(0, 0) },
    simulation: DEFAULT_SIMULATION,
    mechanicalElements: elements,
    constraintElements: [],
    loads: [],
    materials,
    profiles,
    history: [],
    future: [],
  };

  const model = compile_simulation_model(mechanism);
  let snapshot: DynamicSnapshot | null = null;
  for (let i = 0; i < FRAMES; i++)
    snapshot = step_dynamic_simulation(model, i * RECORD_DT, snapshot, RECORD_DT, GRAVITY);
  return snapshot_velocity(snapshot!, BOB)!.length();
}

describe("plancher de masse d'un nœud sans masse", () => {
  it("un appendice sans masse ne freine pas le pendule qui le porte", () => {
    const alone = bob_speed(false);
    const withLimb = bob_speed(true);

    // A pendulum's swing does not depend on its bob's mass, so a limb weighing a share of that bob is the only thing that could slow this one down.
    // What the floor lends its weightless nodes is all that is left in the gap: a few percent at most, where a floor of the tied mass itself costs a third of the swing.
    expect(alone).toBeGreaterThan(0);
    expect(withLimb / alone).toBeGreaterThan(0.95);
    expect(withLimb / alone).toBeLessThanOrEqual(1);
  }, 30_000);
});
