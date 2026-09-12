import { describe, expect, it } from "vitest";
import { Point2 } from "../../../types";
import { DEFAULT_METADATA, DEFAULT_SIMULATION, Mechanism } from "../../../types/mechanism";
import type {
  BeamElement,
  ForceElement,
  ID,
  JoinElement,
  MassElement,
  MechanicalElement,
  PivotElement,
} from "../../../types/element";
import type { MaterialDef, ProfileDef } from "../../../types/material";
import { DynamicSnapshot } from "../../../types/runtime-state";
import { RECORD_DT, compile_simulation_model, step_dynamic_simulation } from "./simulation-engine";

let nextID = 0;
const id = (): ID => `00000000-0000-0000-0000-${String(++nextID).padStart(12, "0")}` as ID;

/**
 * How close an internal-force reading has to be, as a share of the load it carries.
 *
 * A share and not a newton figure: the reading's error scales with what is being read, so the same bound holds whatever a test pushes with.
 * `reversed_sweep_order` is what sets the floor — reversing the sweep direction moves a little of a member's load from one of its ends to the other, leaving the resultant exact and the split off by about this much.
 */
const READING_TOLERANCE = 0.01;

/** `actual` matches `expected` to `READING_TOLERANCE` of `scale`, the load in play. */
function expect_reading(actual: number, expected: number, scale: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(READING_TOLERANCE * scale);
}

/** The load the cantilever cases push with, named so the assertions can scale to it. */
const TIP_LOAD = 100;

/** Every beam in this file wants a linear mass of exactly 1 (kg/m) — a single default couple
 * (1×1 m rectangle, ρ = 1) shared by all of them, so a beam literal only has to name it. */
const MATERIAL_ID = id();
const PROFILE_ID = id();
const MATERIALS: MaterialDef[] = [
  { id: MATERIAL_ID, name: "test", E: 210e9, Re: 1, rho: 1 },
];
const PROFILES: ProfileDef[] = [
  { id: PROFILE_ID, name: "test", shape: { kind: "rect", b: 1, h: 1 } },
];

function mechanism(
  mechanicalElements: MechanicalElement[],
  loads: ForceElement[],
  materials: MaterialDef[] = MATERIALS,
  profiles: ProfileDef[] = PROFILES,
): Mechanism {
  return {
    metadata: DEFAULT_METADATA,
    viewport: { scale: 1, pan: new Point2(0, 0) },
    simulation: DEFAULT_SIMULATION,
    mechanicalElements,
    constraintElements: [],
    loads,
    materials,
    profiles,
    history: [],
    future: [],
  };
}

const pivot = (pid: ID, position: Point2, rotatingEdgesIDs: ID[]): PivotElement => ({
  type: "pivot",
  id: pid,
  probes: [],
  overlays: {},
  position,
  isGrounded: true,
  rotatingEdgesIDs,
  fixedGearsIDs: [],
  rotationalFriction: 0,
});

describe("BeamCohesion — torseur d'interface d'une poutre (docs/plan-efforts-interieurs.md phase 3)", () => {
  it("isole l'effort propre à A là où force_at sommait A et B (le cas diagnostic)", () => {
    // Same A-frame as beam-cohesion-diagnostic.test.ts: two struts from grounded supports meeting at a free apex, loaded straight down.
    // F_A = (50, 50), F_B = (-50, 50) — see that file for the full statics.
    // `beamCohesion` should recover F_A directly, unlike `element_reactions`'s fused-key sum (0, 100).
    const GA = id();
    const GB = id();
    const P0 = id();
    const BEAM_A = id();
    const BEAM_B = id();

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

    const ga = pivot(GA, new Point2(-100, 0), [BEAM_A]);
    const gb = pivot(GB, new Point2(100, 0), [BEAM_B]);
    const p0: PivotElement = { ...pivot(P0, new Point2(0, 100), [BEAM_A, BEAM_B]), isGrounded: false };
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

    const cohesionA = snapshot!.beamCohesion?.find((c) => c.beamID === BEAM_A);
    expect(cohesionA).toBeDefined();
    // "end" = the apex (beam A's own end): the free-dof reading, F_A directly.
    expect(cohesionA!.end.fx).toBeCloseTo(50, 0);
    expect(cohesionA!.end.fy).toBeCloseTo(50, 0);
    // "start" = GA (anchored): the raw `LinkReaction` sense — what beam A's own rigidity applies onto the ground — is the NEGATIVE of what A applies onto the apex (Newton's third law across a massless two-force member with no other load along it).
    expect(cohesionA!.start.fx).toBeCloseTo(-50, 0);
    expect(cohesionA!.start.fy).toBeCloseTo(-50, 0);

    const cohesionB = snapshot!.beamCohesion?.find((c) => c.beamID === BEAM_B);
    expect(cohesionB).toBeDefined();
    expect(cohesionB!.start.fx).toBeCloseTo(-50, 0); // B's own start IS the apex here — raw, unflipped
    expect(cohesionB!.start.fy).toBeCloseTo(50, 0);
    expect(cohesionB!.end.fx).toBeCloseTo(50, 0); // B's end is GB (anchored) — the third-law flip again
    expect(cohesionB!.end.fy).toBeCloseTo(-50, 0);
  });

  // `k1` is repositioned by FOUR independent links (`Distance`, `KeepOrientation`, and both `FixedOnSegment`s — the attached mass's and the beam's own rotational-inertia midpoint), so Gauss-Seidel has two competing paths to it and no way to attribute the true reaction between them, however many sweeps or substeps run.
  // The torsor never asks it: it is solved from equilibrium instead (docs/plan-efforts-interieurs.md phase 10).
  // See also docs/ratio-masse-convergence-dynamique.md.
  it("un cantilever avec une masse en cours de portée transmet la charge par le nœud attaché", () => {
    // A mass welded to the beam's BODY mid-span (fixedNodesBodyIDs, not an endpoint), on a beam fixed at the other end.
    // No gravity: the only action is the load on the mass, which must reach the beam entirely through the FixedOnSegment holding it — the "attached node" channel this phase adds.
    // `dynamicRigidity: true` for a REAL moment reaction at the join, same as reaction-forces.test.ts's cantilever.
    //
    // Deliberately only one end grounded: with BOTH beam endpoints anchored (a genuine simply-supported span), the beam's own `Distance`/`FixedOnSegment` links would have two simultaneously-anchored dofs each, and `PBD_kinematic_solver` explicitly declines to split an anchored reaction between more than one anchor ("indeterminate... left unreported") — a pre-existing solver limitation, not something phase 3 can read around.
    const JOIN = id();
    const BEAM = id();
    const MASS = id();
    const join: JoinElement = {
      type: "join",
      id: JOIN,
      probes: [],
      overlays: {},
      position: new Point2(0, 0),
      isGrounded: true,
      fixedEdgesIDs: [BEAM],
    };
    const beam: BeamElement = {
      type: "beam",
      id: BEAM,
      probes: [],
      overlays: {},
      positionStart: new Point2(0, 0),
      positionEnd: new Point2(1, 0),
      fixedNodeStartID: JOIN,
      fixedNodesBodyIDs: [MASS],
      materialID: MATERIAL_ID,
      profileID: PROFILE_ID,
    };
    const mass: MassElement = {
      type: "mass",
      id: MASS,
      probes: [],
      overlays: {},
      position: new Point2(0.5, 0),
      isGrounded: false,
      fixedEdgesIDs: [],
      mass: 1,
    };
    const force: ForceElement = {
      type: "force",
      id: id(),
      targetID: MASS,
      vector: new Point2(0, -TIP_LOAD),
      frame: "world",
    };

    const model = compile_simulation_model(mechanism([join, beam, mass], [force]), true);
    let snapshot: DynamicSnapshot | null = null;
    for (let i = 0; i < 30; i++)
      snapshot = step_dynamic_simulation(model, i * RECORD_DT, snapshot, RECORD_DT, new Point2(0, 0));

    const cohesion = snapshot!.beamCohesion?.find((c) => c.beamID === BEAM);
    expect(cohesion).toBeDefined();

    // The load reaches the beam through the mass's own pin, at its current abscissa.
    expect(cohesion!.attachedNodes).toHaveLength(1);
    const [atMass] = cohesion!.attachedNodes;
    expect(atMass.nodeID).toBe(MASS);
    expect(atMass.s).toBeCloseTo(0.5, 1);
    expect_reading(atMass.fx, 0, TIP_LOAD);
    expect_reading(atMass.fy, -TIP_LOAD, TIP_LOAD);

    // The lone support carries the whole load, plus the moment it creates half-way out — all three in the one sense `BeamCohesion` uses throughout: what the beam applies to the ground, the NEGATIVE of the classical "ground pushes back with" reading.
    expect_reading(cohesion!.start.fx, 0, TIP_LOAD);
    expect_reading(cohesion!.start.fy, -TIP_LOAD, TIP_LOAD);
    expect_reading(cohesion!.start.m, -TIP_LOAD * 0.5, TIP_LOAD);
    // Nothing beyond the mass: the free tip carries no cohesion at all.
    expect_reading(cohesion!.end.fx, 0, TIP_LOAD);
    expect_reading(cohesion!.end.fy, 0, TIP_LOAD);
    expect_reading(cohesion!.end.m, 0, TIP_LOAD);
  });

});
