import { describe, expect, it } from "vitest";
import { Link, Point2 } from "../../types";
import { DEFAULT_METADATA, DEFAULT_SIMULATION, Mechanism } from "../../types/mechanism";
import type {
  BeamElement,
  ForceElement,
  ID,
  JoinElement,
  MassElement,
  MechanicalElement,
  PivotElement,
} from "../../types/element";
import type { MaterialDef, ProfileDef } from "../../types/material";
import { DynamicSnapshot, LinkReaction } from "../../types/runtime-state";
import { DynamicsInput, PBD_kinematic_solver } from "./PBD_kinematic_solver";
import {
  RECORD_DT,
  compile_simulation_model,
  step_dynamic_simulation,
} from "./simulation-engine";
import { element_reactions } from "./probe-series";

const GRAVITY_Y = -9.81; // world is Y-up, so "down" is negative
const DT = 1 / 120;

/** A mass hanging at rest directly below a grounded anchor, on a rigid rod — the simplest
 *  case with a known answer: at equilibrium the rod's tension exactly cancels gravity, so
 *  the reaction is `mass · g` at each end, opposite in sign. */
function pendulum_at_rest(mass: number) {
  const positions = new Map<string, Point2>([
    ["anchor", new Point2(0, 0)],
    ["mass", new Point2(0, -100)],
  ]);
  const posMasses = new Map<string, number>([
    ["anchor", 0], // grounded
    ["mass", 1 / mass],
  ]);
  const links: Link[] = [
    { type: "Distance", ddl: 1, key1: "anchor", key2: "mass", distance: 100, owner: "rod" as never },
  ];
  const reactions: LinkReaction[] = [];
  const dynamics: DynamicsInput = {
    dt: DT,
    gx: 0,
    gy: GRAVITY_Y,
    velocities: new Map(),
    angleVelocities: new Map(),
    reactions,
  };
  PBD_kinematic_solver(
    positions,
    new Map(),
    posMasses,
    new Map(),
    links,
    50,
    undefined,
    new Map(),
    false,
    "motion",
    0,
    dynamics,
  );
  return reactions;
}

describe("reaction forces", () => {
  it("supports the weight at both ends of a rod holding a mass at rest", () => {
    const reactions = pendulum_at_rest(1);
    expect(reactions).toHaveLength(2);

    const atMass = reactions.find((r) => r.key === "mass");
    const atAnchor = reactions.find((r) => r.key === "anchor");
    expect(atMass?.kind).toBe("force");
    expect(atAnchor?.kind).toBe("force");
    if (atMass?.kind !== "force" || atAnchor?.kind !== "force") return;

    // The rod holds the mass up against gravity...
    expect(atMass.fx).toBeCloseTo(0, 6);
    expect(atMass.fy).toBeCloseTo(9.81, 2);
    expect(atMass.atAnchor).toBe(false);
    // ...and by Newton's third law, the mass pulls the anchor down by the same amount.
    expect(atAnchor.fx).toBeCloseTo(0, 6);
    expect(atAnchor.fy).toBeCloseTo(-9.81, 2);
    expect(atAnchor.atAnchor).toBe(true);
  });

  it("scales with mass", () => {
    const reactions = pendulum_at_rest(3);
    const atMass = reactions.find((r) => r.key === "mass");
    expect(atMass?.kind).toBe("force");
    if (atMass?.kind !== "force") return;
    expect(atMass.fy).toBeCloseTo(3 * 9.81, 1);
  });

  it("reports nothing when collection is not requested", () => {
    const positions = new Map<string, Point2>([
      ["anchor", new Point2(0, 0)],
      ["mass", new Point2(0, -100)],
    ]);
    const posMasses = new Map<string, number>([
      ["anchor", 0],
      ["mass", 1],
    ]);
    const links: Link[] = [
      { type: "Distance", ddl: 1, key1: "anchor", key2: "mass", distance: 100 },
    ];
    const result = PBD_kinematic_solver(
      positions,
      new Map(),
      posMasses,
      new Map(),
      links,
      50,
      undefined,
      new Map(),
      false,
      "motion",
      0,
      {
        dt: DT,
        gx: 0,
        gy: GRAVITY_Y,
        velocities: new Map(),
        angleVelocities: new Map(),
        // no `reactions` array — opt-out, per `DynamicsInput`'s doc.
      },
    );
    expect(result.posMasses).toBe(posMasses); // sanity: still ran
  });
});

let nextID = 0;
const id = (): ID =>
  `00000000-0000-0000-0000-${String(++nextID).padStart(12, "0")}` as ID;

/** Every beam in this file wants a linear mass of 1 (kg/m) — a 1×1 m rectangle, ρ = 1. */
const MATERIAL_ID = id();
const PROFILE_ID = id();
const MATERIALS: MaterialDef[] = [
  { id: MATERIAL_ID, name: "test", E: 1, Re: 1, rho: 1, readOnly: false },
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

describe("réaction d'appui d'une poutre montée sur un pivot ancré", () => {
  it("apparaît au pivot, à travers la fusion de coïncidence", () => {
    // The exact repro: a beam's start welded to a grounded pivot (Coincidence-fused, see
    // `compile_simulation_model`), a force at its free end. The pivot's own key is never
    // the reaction's `key` post-fusion — `element_reactions` has to match the fused,
    // comma-joined one instead.
    const PIVOT = id();
    const BEAM = id();
    const pivot: PivotElement = {
      type: "pivot",
      id: PIVOT,
      probes: [],
      overlays: {},
      position: new Point2(0, 0),
      isGrounded: true,
      rotatingEdgesIDs: [BEAM],
      fixedGearsIDs: [],
      rotationalFriction: 0,
    };
    const beam: BeamElement = {
      type: "beam",
      id: BEAM,
      probes: [],
      overlays: {},
      positionStart: new Point2(0, 0),
      positionEnd: new Point2(200, 0),
      fixedNodeStartID: PIVOT,
      fixedNodesBodyIDs: [],
      materialID: MATERIAL_ID,
      profileID: PROFILE_ID,
    };
    const force: ForceElement = {
      type: "force",
      id: id(),
      targetID: BEAM,
      anchor: "end",
      vector: new Point2(0, -100),
      frame: "world",
    };

    const model = compile_simulation_model(mechanism([pivot, beam], [force]));
    let snapshot: DynamicSnapshot | null = null;
    for (let i = 0; i < 30; i++)
      snapshot = step_dynamic_simulation(
        model,
        i * RECORD_DT,
        snapshot,
        RECORD_DT,
        new Point2(0, 0), // gravity off: the applied force alone must be enough
      );

    const atPivot = element_reactions(pivot, snapshot!);
    expect(atPivot).toHaveLength(1);
    expect(atPivot[0].atAnchor).toBe(true);
    expect(atPivot[0].vector.length()).toBeGreaterThan(1e-3);
  });
});

describe("réaction d'appui d'un cantilever (poutre encastrée sur un join ancré)", () => {
  function cantilever() {
    const JOIN = id();
    const BEAM = id();
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
      fixedNodesBodyIDs: [],
      materialID: MATERIAL_ID,
      profileID: PROFILE_ID,
    };
    const force: ForceElement = {
      type: "force",
      id: id(),
      targetID: BEAM,
      anchor: "end",
      vector: new Point2(0, -100),
      frame: "world",
    };
    return { join, beam, force, mech: mechanism([join, beam], [force]) };
  }

  it("reste invisible au vrai appui sans dynamicRigidity — le figeage cinématique du join rend le lien indéterminable", () => {
    // The repro this whole chain of fixes started from: `add_rigidity_links` anchors
    // (mass 0) BOTH ends of an endpoint-welded beam under a grounded join — correct
    // kinematic geometry, but in dynamic mode the Distance link between two anchored
    // dofs is "indeterminate, see above" (`anchoredPosCount !== 1`) and reports nothing.
    // `dynamicRigidity` is what fixes it — this guards that the OLD, still-default
    // (kinematic/analysis) behavior stays as documented, not silently "fixed" by
    // accident. The beam's own free end DOES now show something (the isolated-anchor
    // fix above catches the load applied directly there), just not at the join — the
    // load's true destination is still invisible without `dynamicRigidity`.
    const { join, beam, mech } = cantilever();
    const model = compile_simulation_model(mech); // dynamicRigidity defaults to false
    let snapshot: DynamicSnapshot | null = null;
    for (let i = 0; i < 30; i++)
      snapshot = step_dynamic_simulation(model, i * RECORD_DT, snapshot, RECORD_DT, new Point2(0, 0));
    expect(element_reactions(join, snapshot!)).toEqual([]);
    const atBeam = element_reactions(beam, snapshot!);
    expect(atBeam).toHaveLength(1);
    // atAnchor (both ends are, here) → negated: the support opposes the load.
    expect(atBeam[0].vector.y).toBeCloseTo(100, 6);
  });

  it("montre au join une force opposée ET un moment — la lecture RDM d'un encastrement", () => {
    const { join, beam, mech } = cantilever();
    const model = compile_simulation_model(mech, true);
    let snapshot: DynamicSnapshot | null = null;
    for (let i = 0; i < 30; i++)
      snapshot = step_dynamic_simulation(model, i * RECORD_DT, snapshot, RECORD_DT, new Point2(0, 0));

    const atJoin = element_reactions(join, snapshot!);
    expect(atJoin).toHaveLength(1);
    expect(atJoin[0].atAnchor).toBe(true);
    // Read to a share of the load, not to a fixed newton figure: `reversed_sweep_order` moves
    // a little of a member's load between its two ends, so the bound has to scale with what
    // is being read. The resultant itself stays exact.
    const tolerance = 0.01 * 100; // 1 % of the tip load below
    // Negligible beam mass, no gravity, one load: the support opposes it exactly
    // (`element_reactions` negates whatever the mechanism imposes at an anchored point —
    // the classical "reaction opposes the load" reading, not the raw internal-force one).
    expect(Math.abs(atJoin[0].vector.x)).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(atJoin[0].vector.y - 100)).toBeLessThanOrEqual(tolerance);
    // Textbook cantilever, downward tip load 1 m out: the fixed end also carries a reaction
    // MOMENT, +100 N·m (counter-clockwise — opposing the load's own clockwise tendency).
    // Moments are never negated (see `moment_at`), so this reads directly as the support's own.
    expect(atJoin[0].moment).toBeCloseTo(100, 0);

    // The free end sees a real, non-anchored reaction too — the load is no longer
    // silently dropped into a zero-mass dof. Not a "support", so its force isn't negated:
    // this is the internal force holding the tip up, same sign as what balances the load
    // there. Its moment is the SAME +100 — a couple's moment is reference-independent, so
    // it reads identically at either end of the rigid connection.
    const atBeamEnd = element_reactions(beam, snapshot!).find((r) => !r.atAnchor);
    expect(atBeamEnd).toBeDefined();
    expect(atBeamEnd!.vector.y).toBeCloseTo(100, 0);
    expect(atBeamEnd!.moment).toBeCloseTo(100, 0);
  });
});

describe("réaction d'un nœud ancré isolé", () => {
  it("reporte la force externe directement appliquée, sans aucun lien pour la porter", () => {
    // The other half of the same underlying gap: `PBD_kinematic_solver`'s reaction
    // bookkeeping is entirely link-based (`links.forEach`), so a `Force` load on a
    // grounded node with nothing else attached — no link ever touches its key — was
    // reported as reaction-free, even though the whole load lands straight on the ground.
    const positions = new Map<string, Point2>([["anchor", new Point2(0, 0)]]);
    const posMasses = new Map<string, number>([["anchor", 0]]);
    const reactions: LinkReaction[] = [];
    PBD_kinematic_solver(
      positions,
      new Map(),
      posMasses,
      new Map(),
      [], // no links at all
      50,
      undefined,
      new Map(),
      false,
      "motion",
      0,
      {
        dt: DT,
        gx: 0,
        gy: 0,
        velocities: new Map(),
        angleVelocities: new Map(),
        forces: new Map([["anchor", new Point2(0, -100)]]),
        reactions,
      },
    );
    expect(reactions).toHaveLength(1);
    const [r] = reactions;
    expect(r.kind).toBe("force");
    if (r.kind !== "force") return;
    expect(r.atAnchor).toBe(true);
    expect(r.fx).toBeCloseTo(0, 9);
    expect(r.fy).toBeCloseTo(-100, 6);
  });

  it("ne dit rien pour un nœud mobile — la force y agit normalement, rien à réagir", () => {
    const positions = new Map<string, Point2>([["free", new Point2(0, 0)]]);
    const posMasses = new Map<string, number>([["free", 1]]);
    const reactions: LinkReaction[] = [];
    PBD_kinematic_solver(
      positions,
      new Map(),
      posMasses,
      new Map(),
      [],
      50,
      undefined,
      new Map(),
      false,
      "motion",
      0,
      {
        dt: DT,
        gx: 0,
        gy: 0,
        velocities: new Map(),
        angleVelocities: new Map(),
        forces: new Map([["free", new Point2(0, -100)]]),
        reactions,
      },
    );
    expect(reactions).toEqual([]);
  });

  it("apparaît aussi à travers le pipeline complet, sur un mass ancré sans arête", () => {
    const MASS = id();
    const mass: MassElement = {
      type: "mass",
      id: MASS,
      probes: [],
      overlays: {},
      position: new Point2(0, 0),
      isGrounded: true,
      fixedEdgesIDs: [],
      mass: 1,
    };
    const force: ForceElement = {
      type: "force",
      id: id(),
      targetID: MASS,
      vector: new Point2(0, -100),
      frame: "world",
    };
    const model = compile_simulation_model(mechanism([mass], [force]));
    let snapshot: DynamicSnapshot | null = null;
    for (let i = 0; i < 10; i++)
      snapshot = step_dynamic_simulation(model, i * RECORD_DT, snapshot, RECORD_DT, new Point2(0, 0));

    const atMass = element_reactions(mass, snapshot!);
    expect(atMass).toHaveLength(1);
    expect(atMass[0].atAnchor).toBe(true);
    // `element_reactions` negates at a support: the ground opposes the load, +100 not -100.
    expect(atMass[0].vector.x).toBeCloseTo(0, 6);
    expect(atMass[0].vector.y).toBeCloseTo(100, 6);
  });

  it("porte son propre poids sous gravité, sans aucune charge appliquée", () => {
    // Same node, no `Force` element this time — gravity alone has to reach the anchored-dof
    // reaction fallback. It does so via `DynamicMassModel.groundedMasses`
    // (`step_dynamic_simulation` restates `mass · gravity` as an ordinary force there, since
    // an anchored node never feels the predict step's acceleration in the first place).
    const MASS = id();
    const mass: MassElement = {
      type: "mass",
      id: MASS,
      probes: [],
      overlays: {},
      position: new Point2(0, 0),
      isGrounded: true,
      fixedEdgesIDs: [],
      mass: 2,
    };
    const model = compile_simulation_model(mechanism([mass], []));
    let snapshot: DynamicSnapshot | null = null;
    for (let i = 0; i < 10; i++)
      snapshot = step_dynamic_simulation(
        model,
        i * RECORD_DT,
        snapshot,
        RECORD_DT,
        new Point2(0, GRAVITY_Y),
      );

    const atMass = element_reactions(mass, snapshot!);
    expect(atMass).toHaveLength(1);
    expect(atMass[0].atAnchor).toBe(true);
    // Weight is `mass · g`; the ground opposes it, so the reported (negated) reaction is +.
    expect(atMass[0].vector.x).toBeCloseTo(0, 6);
    expect(atMass[0].vector.y).toBeCloseTo(2 * 9.81, 1);
  });

  it("ne prête aucun poids fantôme à un ancrage vide", () => {
    // A grounded join with nothing attached lumps no mass at all (`compute_dynamic_mass_model`
    // leaves it unfloored for anchored keys, on purpose — see `groundedMasses`'s doc). It must
    // stay silent under gravity, not report `MASS_FLOOR`'s worth of weight from nothing.
    const JOIN = id();
    const join: JoinElement = {
      type: "join",
      id: JOIN,
      probes: [],
      overlays: {},
      position: new Point2(0, 0),
      isGrounded: true,
      fixedEdgesIDs: [],
    };
    const model = compile_simulation_model(mechanism([join], []));
    let snapshot: DynamicSnapshot | null = null;
    for (let i = 0; i < 10; i++)
      snapshot = step_dynamic_simulation(
        model,
        i * RECORD_DT,
        snapshot,
        RECORD_DT,
        new Point2(0, GRAVITY_Y),
      );

    expect(element_reactions(join, snapshot!)).toEqual([]);
  });
});
