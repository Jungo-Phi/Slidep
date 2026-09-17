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
import { build_analysis_model } from "./analysis-model";
import { probe_chain_mobility } from "./mobility-probe";
import { canonical_modes } from "./motion-modes";

/**
 * A motion nothing weighs is a motion the dynamics cannot answer for: the solver floors the mass it divides by, and whatever speed comes out is that floor's, not the mechanism's.
 * Telling those motions apart is what lets the panel say so instead of showing a figure.
 */

let nextID = 0;
const id = (): ID =>
  `00000000-0000-0000-0000-${String(++nextID).padStart(12, "0")}` as ID;

const LENGTH = 1;

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

/** A rod hanging off a grounded pivot, weightless but for whatever its tip carries. */
function pendulum(tipMass: number): Mechanism {
  const HUB = id();
  const ROD = id();
  const TIP = id();
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
  const tip: MassElement | JoinElement =
    tipMass > 0
      ? {
          type: "mass",
          id: TIP,
          probes: [],
          overlays: {},
          position: new Point2(LENGTH, 0),
          isGrounded: false,
          fixedEdgesIDs: [ROD],
          mass: tipMass,
        }
      : {
          type: "join",
          id: TIP,
          probes: [],
          overlays: {},
          position: new Point2(LENGTH, 0),
          isGrounded: false,
          fixedEdgesIDs: [ROD],
        };
  const rod: BeamElement = {
    type: "beam",
    id: ROD,
    probes: [],
    overlays: {},
    positionStart: new Point2(0, 0),
    positionEnd: new Point2(LENGTH, 0),
    fixedNodeStartID: HUB,
    fixedNodeEndID: TIP,
    fixedNodesBodyIDs: [],
    materialID,
    profileID,
  };
  const elements: MechanicalElement[] = [hub, tip, rod];

  return {
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
}

/** Whether each mode of the mechanism's one mobile chain carries any inertia. */
function inertia_free_modes(mechanism: Mechanism): boolean[] {
  const model = build_analysis_model(mechanism);
  return model.chains.flatMap((chain) =>
    canonical_modes(model, chain, probe_chain_mobility(model, chain)).map(
      (mode) => mode.inertiaFree,
    ),
  );
}

describe("mouvement sans inertie", () => {
  it("une tige sans masse qui pend n'emporte aucune inertie", () => {
    const flags = inertia_free_modes(pendulum(0));

    expect(flags.length).toBeGreaterThan(0);
    expect(flags.every(Boolean)).toBe(true);
  });

  it("la même tige lestée en emporte une", () => {
    const flags = inertia_free_modes(pendulum(2));

    expect(flags.length).toBeGreaterThan(0);
    expect(flags.some(Boolean)).toBe(false);
  });
});
