import { describe, expect, it } from "vitest";
import { Point2 } from "../../../types";
import { DEFAULT_METADATA, DEFAULT_SIMULATION, Mechanism } from "../../../types/mechanism";
import type {
  BeamElement,
  ID,
  MechanicalElement,
  PivotElement,
  SliderElement,
} from "../../../types/element";
import type { MaterialDef, ProfileDef } from "../../../types/material";
import { DynamicSnapshot } from "../../../types/runtime-state";
import {
  RECORD_DT,
  compile_simulation_model,
  step_dynamic_simulation,
} from "../dynamics/simulation-engine";

const id = (s: string): ID =>
  `00000000-0000-0000-0000-${s.padStart(12, "0")}` as ID;
const P = (x: number, y: number) => new Point2(x, y);
const GRAVITY = P(0, -9.81);

const MATERIAL_ID = id("material");
const LIGHT_ID = id("light");
const PROFILE_ID = id("profile");
// 1 kg/m: a 1 m beam weighs 1 kg, so the numbers below read straight off.
// The light one is for a rail that only guides a block, whose own sag would otherwise drown out the block's energy.
const MATERIALS: MaterialDef[] = [
  { id: MATERIAL_ID, name: "test", E: 210e9, Re: 1, rho: 1 },
  { id: LIGHT_ID, name: "light", E: 210e9, Re: 1, rho: 0.001 },
];
const PROFILES: ProfileDef[] = [
  { id: PROFILE_ID, name: "test", shape: { kind: "rect", b: 1, h: 1 } },
];

const mechanism = (mechanicalElements: MechanicalElement[]): Mechanism => ({
  metadata: DEFAULT_METADATA,
  viewport: { scale: 1, pan: new Point2<"screen">(0, 0) },
  simulation: DEFAULT_SIMULATION,
  mechanicalElements,
  constraintElements: [],
  loads: [],
  materials: MATERIALS,
  profiles: PROFILES,
  history: [],
  future: [],
});

function pivot(
  n: string,
  pos: Point2,
  grounded: boolean,
  edges: ID[],
  rotationalFriction = 0,
): PivotElement {
  return {
    type: "pivot",
    id: id(n),
    probes: [],
    overlays: {},
    position: pos,
    isGrounded: grounded,
    rotatingEdgesIDs: edges,
    fixedGearsIDs: [],
    rotationalFriction,
  };
}

function beam(
  n: string,
  a: Point2,
  b: Point2,
  s?: string,
  e?: string,
  body: ID[] = [],
  materialID: ID = MATERIAL_ID,
): BeamElement {
  return {
    type: "beam",
    id: id(n),
    probes: [],
    overlays: {},
    positionStart: a,
    positionEnd: b,
    fixedNodeStartID: s ? id(s) : undefined,
    fixedNodeEndID: e ? id(e) : undefined,
    fixedNodesBodyIDs: body,
    materialID,
    profileID: PROFILE_ID,
  };
}

function slider(
  n: string,
  pos: Point2,
  rail: string,
  slidingFriction = 0,
): SliderElement {
  return {
    type: "slider",
    id: id(n),
    probes: [],
    overlays: {},
    position: pos,
    isGrounded: false,
    parentBeamID: id(rail),
    fixedEdgesIDs: [],
    slidingFriction,
  };
}

/** Free-runs `frames` frames from rest and hands back the last one. */
function run(elements: MechanicalElement[], frames: number): DynamicSnapshot {
  const model = compile_simulation_model(mechanism(elements));
  let snapshot: DynamicSnapshot | null = null;
  for (let f = 1; f <= frames; f++)
    snapshot = step_dynamic_simulation(
      model,
      f * RECORD_DT,
      snapshot,
      RECORD_DT,
      GRAVITY,
    );
  return snapshot!;
}

const mechanical = (s: DynamicSnapshot): number =>
  s.energy!.kinetic + s.energy!.potentialGravity;

/** A beam hanging horizontally off a grounded pivot, free to swing down under its own weight. */
const pendulum = (rotationalFriction: number): MechanicalElement[] => [
  pivot("p", P(0, 0), true, [id("b")], rotationalFriction),
  beam("b", P(0, 0), P(1, 0), "p"),
];

/**
 * A vertical rail held at both ends, with a block free to fall along it.
 * Long enough that the block never reaches the far end, where it would jam against the anchor and stop for a reason unrelated to friction.
 */
const chute = (slidingFriction: number): MechanicalElement[] => [
  pivot("top", P(0, 5), true, [id("rail")]),
  pivot("bottom", P(0, -5), true, [id("rail")]),
  beam("rail", P(0, 5), P(0, -5), "top", "bottom", [id("block")], LIGHT_ID),
  slider("block", P(0, 0), "rail", slidingFriction),
];

describe("frottement des liaisons, en simulation", () => {
  it("un pendule sur pivot frottant perd de l'énergie ; sans frottement il la garde", () => {
    const FRAMES = 60; // half a second, well into the first swing
    const ideal = run(pendulum(0), FRAMES);
    const rough = run(pendulum(0.05), FRAMES);

    expect(ideal.energy!.frictionPower).toBe(0);
    expect(rough.energy!.frictionPower).toBeGreaterThan(0);
    // The ideal pendulum only trades potential for kinetic; the frictional one has less of both left.
    expect(mechanical(rough)).toBeLessThan(mechanical(ideal));
  });

  it("le frottement de pivot ralentit la descente sans la bloquer", () => {
    const FRAMES = 60;
    const ideal = run(pendulum(0), FRAMES);
    const rough = run(pendulum(0.05), FRAMES);

    // Viscous friction slows the swing but can never hold it, so the beam is still moving.
    expect(rough.energy!.kinetic).toBeLessThan(ideal.energy!.kinetic);
    expect(rough.energy!.kinetic).toBeGreaterThan(0);
  });

  it("un patin sur rail frottant tombe moins vite", () => {
    const FRAMES = 60;
    const ideal = run(chute(0), FRAMES);
    const rough = run(chute(2), FRAMES);

    expect(rough.energy!.frictionPower).toBeGreaterThan(0);
    expect(rough.energy!.kinetic).toBeLessThan(ideal.energy!.kinetic);
    expect(rough.energy!.potentialGravity).toBeGreaterThan(
      ideal.energy!.potentialGravity,
    );
  });

  it("un coefficient énorme fige la liaison au lieu de faire diverger le solveur", () => {
    const rough = run(chute(1e9), 60);
    expect(Number.isFinite(rough.energy!.kinetic)).toBe(true);
    // Held where it started, to within the rail's own compliance.
    expect(rough.energy!.kinetic).toBeLessThan(run(chute(0), 60).energy!.kinetic / 100);
  });
});
