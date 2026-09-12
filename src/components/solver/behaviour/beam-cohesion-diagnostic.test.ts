import { describe, expect, it } from "vitest";
import { Point2 } from "../../../types";
import { DEFAULT_METADATA, DEFAULT_SIMULATION, Mechanism } from "../../../types/mechanism";
import type {
  BeamElement,
  ForceElement,
  ID,
  MechanicalElement,
  PivotElement,
} from "../../../types/element";
import type { MaterialDef, ProfileDef } from "../../../types/material";
import { DynamicSnapshot } from "../../../types/runtime-state";
import { RECORD_DT, compile_simulation_model, step_dynamic_simulation } from "../dynamics/simulation-engine";
import { element_reactions } from "../recording/probe-series";

let nextID = 0;
const id = (): ID => `00000000-0000-0000-0000-${String(++nextID).padStart(12, "0")}` as ID;

/** The one beam here wants a linear mass of 1 (kg/m) — a 1×1 m rectangle, ρ = 1. */
const MATERIAL_ID = id();
const PROFILE_ID = id();
const MATERIALS: MaterialDef[] = [
  { id: MATERIAL_ID, name: "test", E: 210e9, Re: 1, rho: 1 },
];
const PROFILES: ProfileDef[] = [
  { id: PROFILE_ID, name: "test", shape: { kind: "rect", b: 1, h: 1 } },
];

function mechanism(mechanicalElements: MechanicalElement[], loads: ForceElement[]): Mechanism {
  return {
    metadata: DEFAULT_METADATA,
    viewport: { scale: 1, pan: new Point2(0, 0) },
    simulation: DEFAULT_SIMULATION,
    mechanicalElements,
    constraintElements: [],
    loads,
    materials: MATERIALS,
    profiles: PROFILES,
    history: [],
    future: [],
  };
}

describe("deux poutres réunies par un pivot (docs/plan-efforts-interieurs.md point 2)", () => {
  it("chaque poutre lit son propre effort, pas la somme à la clé fusionnée", () => {
    // A-frame: two pin-pin struts from grounded supports GA/GB meeting at a free apex P0, loaded straight down at the apex.
    // Statically determinate (each strut is a two-force member), so the true axial force each beam carries is known in closed form — a reference, not a guess.
    //
    // P0 (0, 100) / \
    //      /    \
    // GA ------- GB (-100,0) (100,0)
    //
    // Node equilibrium at P0 (massless-in-the-limit, no gravity): F_A + F_B + P_ext = 0, with F_A along the GA→P0 axis and F_B along the GB→P0 axis (two-force members).
    // Solving: F_A = (50, 50) — beam A alone pushes the apex up-and-right (compression, propping the apex up against the load).
    // F_B = (-50, 50), the mirror image.
    // F_A + F_B = (0, 100) = −P_ext: their combined reaction is trivially the opposite of the load, by node equilibrium — true of ANY strut arrangement here, and exactly the "quantity that tends toward the opposite of the external load, not the effort in A" the plan warns about.
    // Summing the constraint impulses at the fused apex key reads that sum; a beam's own cohesion torsor reads F_A, which is what this guards (`beam_end_reaction`).
    const GA = id();
    const GB = id();
    const P0 = id();
    const BEAM_A = id();
    const BEAM_B = id();

    const pivot = (pid: ID, position: Point2, isGrounded: boolean, rotatingEdgesIDs: ID[]): PivotElement => ({
      type: "pivot",
      id: pid,
      probes: [],
      overlays: {},
      position,
      isGrounded,
      rotatingEdgesIDs,
      fixedGearsIDs: [],
      rotationalFriction: 0,
    });

    const beam = (bid: ID, start: Point2, end: Point2, startNode: ID, endNode: ID): BeamElement => ({
      type: "beam",
      id: bid,
      probes: [],
      overlays: {},
      positionStart: start,
      positionEnd: end,
      fixedNodeStartID: startNode,
      fixedNodeEndID: endNode,
      fixedNodesBodyIDs: [],
      materialID: MATERIAL_ID,
      profileID: PROFILE_ID,
    });

    const ga = pivot(GA, new Point2(-100, 0), true, [BEAM_A]);
    const gb = pivot(GB, new Point2(100, 0), true, [BEAM_B]);
    const p0 = pivot(P0, new Point2(0, 100), false, [BEAM_A, BEAM_B]);
    const beamA = beam(BEAM_A, new Point2(-100, 0), new Point2(0, 100), GA, P0);
    const beamB = beam(BEAM_B, new Point2(0, 100), new Point2(100, 0), P0, GB);
    const force: ForceElement = {
      type: "force",
      id: id(),
      targetID: P0,
      vector: new Point2(0, -100),
      frame: "world",
    };

    const model = compile_simulation_model(mechanism([ga, gb, p0, beamA, beamB], [force]));
    let snapshot: DynamicSnapshot | null = null;
    for (let i = 0; i < 30; i++)
      snapshot = step_dynamic_simulation(model, i * RECORD_DT, snapshot, RECORD_DT, new Point2(0, 0));

    const atBeamAEnd = element_reactions(beamA, snapshot!).find((r) => !r.atAnchor);
    expect(atBeamAEnd).toBeDefined();

    // Beam A alone: it props the apex up and to the right.
    expect(atBeamAEnd!.vector.x).toBeCloseTo(50, 0);
    expect(atBeamAEnd!.vector.y).toBeCloseTo(50, 0);

    // Its mirror carries the mirror force, and only their sum is the opposite of the load — the reading a fused key cannot tell apart from either strut's own.
    const atBeamBEnd = element_reactions(beamB, snapshot!).find((r) => !r.atAnchor);
    expect(atBeamBEnd).toBeDefined();
    expect(atBeamBEnd!.vector.x).toBeCloseTo(-50, 0);
    expect(atBeamBEnd!.vector.y).toBeCloseTo(50, 0);
  });
});
