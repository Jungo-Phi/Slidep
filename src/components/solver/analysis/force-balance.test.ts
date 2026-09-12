import { describe, expect, it } from "vitest";
import { Point2 } from "../../../types";
import { DEFAULT_METADATA, DEFAULT_SIMULATION, Mechanism } from "../../../types/mechanism";
import type {
  BeamElement,
  ForceElement,
  ID,
  JoinElement,
  MechanicalElement,
} from "../../../types/element";
import type { MaterialDef, ProfileDef } from "../../../types/material";
import { DynamicSnapshot } from "../../../types/runtime-state";
import {
  RECORD_DT,
  apply_dynamic_snapshot_to_mechanism,
  compile_simulation_model,
  step_dynamic_simulation,
} from "../dynamics/simulation-engine";
import { compute_force_balance } from "./force-balance";

/**
 * The itemised balance is derived in the UI while the `m·a` it is weighed against comes from the solver, so the two can only agree if the derivation is the same physics.
 * That agreement is exactly what `gap` measures, and what this file reads.
 */

let n = 0;
const id = (): ID => `fb${++n}` as ID;

/** ρ = 1 on a 1×1 section: a beam's mass in kg is its length in metres. */
const MATERIAL_ID = id();
const PROFILE_ID = id();
const MATERIALS: MaterialDef[] = [
  { id: MATERIAL_ID, name: "test", E: 210e9, Re: 1, rho: 1 },
];
const PROFILES: ProfileDef[] = [
  { id: PROFILE_ID, name: "test", shape: { kind: "rect", b: 1, h: 1 } },
];
const G = 9.81;
const TIP_LOAD = 100;

/**
 * Two beams of half a metre welded in line off a grounded encastrement at the origin, loaded at the free tip, under gravity.
 * Every figure it produces is exact statics: 1 kg of beam in all, `TIP_LOAD` one metre out.
 */
function welded_pair() {
  const ROOT = id();
  const WELD = id();
  const NEAR = id();
  const FAR = id();
  const root: JoinElement = {
    type: "join",
    id: ROOT,
    probes: [],
    overlays: {},
    position: new Point2(0, 0),
    isGrounded: true,
    fixedEdgesIDs: [NEAR],
  };
  const weld: JoinElement = {
    type: "join",
    id: WELD,
    probes: [],
    overlays: {},
    position: new Point2(0.5, 0),
    isGrounded: false,
    fixedEdgesIDs: [NEAR, FAR],
  };
  const beam = (
    bid: ID,
    from: number,
    to: number,
    startNode: ID,
    endNode?: ID,
  ): BeamElement => ({
    type: "beam",
    id: bid,
    probes: [],
    overlays: {},
    positionStart: new Point2(from, 0),
    positionEnd: new Point2(to, 0),
    fixedNodeStartID: startNode,
    fixedNodeEndID: endNode,
    fixedNodesBodyIDs: [],
    materialID: MATERIAL_ID,
    profileID: PROFILE_ID,
  });
  // Both ends of the near beam are named: the weld only holds if the beam says it reaches it.
  const near = beam(NEAR, 0, 0.5, ROOT, WELD);
  const far = beam(FAR, 0.5, 1, WELD);
  const force: ForceElement = {
    type: "force",
    id: id(),
    targetID: FAR,
    anchor: "end",
    vector: new Point2(0, -TIP_LOAD),
    frame: "world",
  };
  const mechanism: Mechanism = {
    metadata: DEFAULT_METADATA,
    viewport: { scale: 1, pan: new Point2(0, 0) },
    simulation: DEFAULT_SIMULATION,
    mechanicalElements: [root, weld, near, far] as MechanicalElement[],
    constraintElements: [],
    loads: [force],
    materials: MATERIALS,
    profiles: PROFILES,
    history: [],
    future: [],
  };

  const gravity = new Point2(0, -G);
  const model = compile_simulation_model(mechanism, true, true);
  let snapshot: DynamicSnapshot | null = null;
  for (let i = 0; i < 40; i++)
    snapshot = step_dynamic_simulation(model, i * RECORD_DT, snapshot, RECORD_DT, gravity);
  return compute_force_balance(
    apply_dynamic_snapshot_to_mechanism(mechanism, snapshot!),
    snapshot!,
    gravity,
  );
}

describe("bilan des forces du corps libre", () => {
  it("boucle en force et en moment", () => {
    const balance = welded_pair();
    expect(balance).toBeDefined();
    // 1 % of the tip load, the same relative bound every other reading of this mechanism holds to.
    expect(balance!.gap.length()).toBeLessThanOrEqual(0.01 * TIP_LOAD);
    expect(Math.abs(balance!.gapMoment)).toBeLessThanOrEqual(0.01 * TIP_LOAD);
  });

  it("une ligne par charge, par corps pesant et par appui", () => {
    const kinds = welded_pair()!.actions.map((action) => action.kind);
    expect(kinds.filter((kind) => kind === "load")).toHaveLength(1);
    expect(kinds.filter((kind) => kind === "weight")).toHaveLength(2);
    expect(kinds.filter((kind) => kind === "support")).toHaveLength(1);
  });

  it("chaque moment autour de l'origine, appui compris", () => {
    const balance = welded_pair()!;
    const load = balance.actions.find((action) => action.kind === "load")!;
    // The load is one metre out, so its moment about the origin is its own magnitude, clockwise.
    expect(load.force.y).toBeCloseTo(-TIP_LOAD, 1);
    expect(load.moment).toBeCloseTo(-TIP_LOAD, 1);

    // Each half-metre beam weighs half a kilo, at its own mid-span.
    const weights = balance.actions.filter((action) => action.kind === "weight");
    for (const weight of weights) expect(weight.force.y).toBeCloseTo(-0.5 * G, 6);
    expect(weights.map((w) => w.moment).sort((a, b) => a - b)).toEqual([
      expect.closeTo(-0.75 * 0.5 * G, 6),
      expect.closeTo(-0.25 * 0.5 * G, 6),
    ]);

    // The support sits ON the origin, so its force makes no moment there and its own couple carries the whole of it.
    const support = balance.actions.find((action) => action.kind === "support")!;
    expect(support.moment).toBeCloseTo(support.couple, 6);
    expect(support.force.y).toBeCloseTo(TIP_LOAD + 1 * G, 1);
  });
});
