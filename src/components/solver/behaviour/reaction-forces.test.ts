import { describe, expect, it } from "vitest";
import { Link, Point2 } from "../../../types";
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
import { DynamicSnapshot, LinkReaction } from "../../../types/runtime-state";
import { DynamicsInput, PBD_kinematic_solver } from "../kinematics/PBD_kinematic_solver";
import {
  RECORD_DT,
  compile_simulation_model,
  step_dynamic_simulation,
} from "../dynamics/simulation-engine";
import { element_reactions } from "../recording/probe-series";
import { is_node_element } from "../../../utils/element-queries";

const GRAVITY_Y = -9.81; // world is Y-up, so "down" is negative
const DT = 1 / 120;

/** A mass hanging at rest directly below a grounded anchor, on a rigid rod — the simplest
 * case with a known answer: at equilibrium the rod's tension exactly cancels gravity, so the reaction is `mass · g` at each end, opposite in sign. */
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

/** The term `BalanceSample` leaves to its reader: every support reaction, and its moment about
 * the world origin — summed exactly as `use-simulation-playback` sums it for the canvas. */
function support_total(
  elements: MechanicalElement[],
  snapshot: DynamicSnapshot,
): { force: Point2; moment: number } {
  let force = new Point2(0, 0);
  let moment = 0;
  for (const element of elements) {
    // Only a node ever reads as a support reaction, the same test the canvas applies: a beam end at an anchor says what the BEAM applies there, which is the opposite and would cancel it.
    if (!is_node_element(element)) continue;
    for (const reaction of element_reactions(element, snapshot))
      if (reaction.atAnchor) {
        force = force.add(reaction.vector);
        moment +=
          reaction.at.x * reaction.vector.y -
          reaction.at.y * reaction.vector.x +
          (reaction.moment ?? 0);
      }
  }
  return { force, moment };
}

describe("réaction d'appui d'une poutre montée sur un pivot ancré", () => {
  it("apparaît au pivot, à travers la fusion de coïncidence", () => {
    // The exact repro: a beam's start welded to a grounded pivot (Coincidence-fused, see `compile_simulation_model`), a force at its free end.
    // The pivot's own key is never the reaction's `key` post-fusion — `element_reactions` has to match the fused, comma-joined one instead.
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

  it("le corps libre boucle en rotation : ΣF et ΣM sur une poutre lâchée", () => {
    // A uniform rod released horizontally about one of its own ends: it turns, so the balance has to carry the terms a static one never exercises — the centre's own `m·a`, and the rod's `mL²/12·α` about it.
    // Read a few frames in, while α is still large.
    const PIVOT = id();
    const BEAM = id();
    const LENGTH = 2;
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
      positionEnd: new Point2(LENGTH, 0),
      fixedNodeStartID: PIVOT,
      fixedNodesBodyIDs: [],
      materialID: MATERIAL_ID,
      profileID: PROFILE_ID,
    };

    const model = compile_simulation_model(mechanism([pivot, beam], []), true);
    let snapshot: DynamicSnapshot | null = null;
    for (let i = 0; i < 6; i++)
      snapshot = step_dynamic_simulation(model, i * RECORD_DT, snapshot, RECORD_DT, new Point2(0, -9.81));

    const balance = snapshot!.balance;
    expect(balance).toBeDefined();
    const support = support_total([pivot, beam], snapshot!);
    // It really is turning, so the terms below are not all zero on both sides.
    expect(Math.abs(balance!.inertiaM)).toBeGreaterThan(1);

    // 1 % of the rod's own weight, the same relative bound the readings above hold to.
    const weight = LENGTH * 9.81;
    expect(
      Math.abs(balance!.appliedY + balance!.weightY + support.force.y - balance!.inertiaY),
    ).toBeLessThanOrEqual(0.01 * weight);
    expect(
      Math.abs(balance!.appliedM + balance!.weightM + support.moment - balance!.inertiaM),
    ).toBeLessThanOrEqual(0.01 * weight * LENGTH);
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
    // The repro this whole chain of fixes started from: `add_rigidity_links` anchors (mass 0) BOTH ends of an endpoint-welded beam under a grounded join — correct kinematic geometry, but in dynamic mode the Distance link between two anchored dofs is "indeterminate, see above" (`anchoredPosCount !== 1`) and reports nothing.
    // `dynamicRigidity` is what fixes it — this guards that the OLD, still-default (kinematic/analysis) behavior stays as documented, not silently "fixed" by accident.
    // Both of the beam's ends are anchored in that state, so the frozen model transmits nothing along it either: the load reaches the tip's own anchor without passing through the beam, and the beam's torsor says so at both ends.
    const { join, beam, mech } = cantilever();
    const model = compile_simulation_model(mech); // dynamicRigidity defaults to false
    let snapshot: DynamicSnapshot | null = null;
    for (let i = 0; i < 30; i++)
      snapshot = step_dynamic_simulation(model, i * RECORD_DT, snapshot, RECORD_DT, new Point2(0, 0));
    expect(element_reactions(join, snapshot!)).toEqual([]);
    const atBeam = element_reactions(beam, snapshot!);
    expect(atBeam).toHaveLength(2);
    for (const reaction of atBeam) expect(reaction.vector.length()).toBeCloseTo(0, 6);
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
    // Read to a share of the load, not to a fixed newton figure: `reversed_sweep_order` moves a little of a member's load between its two ends, so the bound has to scale with what is being read.
    // The resultant itself stays exact.
    const tolerance = 0.01 * 100; // 1 % of the tip load below
    // Negligible beam mass, no gravity, one load: the support opposes it exactly (`element_reactions` negates whatever the mechanism imposes at an anchored point — the classical "reaction opposes the load" reading, not the raw internal-force one).
    expect(Math.abs(atJoin[0].vector.x)).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(atJoin[0].vector.y - 100)).toBeLessThanOrEqual(tolerance);
    // Textbook cantilever, downward tip load 1 m out: the fixed end also carries a reaction MOMENT, +100 N·m (counter-clockwise — opposing the load's own clockwise tendency).
    // Moments are never negated (see `moment_at`), so this reads directly as the support's own.
    expect(atJoin[0].moment).toBeCloseTo(100, 0);

    // The free end carries a real, non-anchored reaction of its own, where the load is applied.
    // Not a "support", so its force isn't negated: this is the internal force holding the tip up, same sign as what balances the load there.
    // Its couple is ZERO: a free tip has nothing past it to bend, whatever the fixed end carries — the two ends are independent readings of the beam's own torsor (`beam_end_reaction`), not one couple reported twice.
    const atBeamEnd = element_reactions(beam, snapshot!).find((r) => !r.atAnchor);
    expect(atBeamEnd).toBeDefined();
    expect(atBeamEnd!.vector.y).toBeCloseTo(100, 0);
    expect(atBeamEnd!.moment).toBeCloseTo(0, 6);
  });

  it("compte la charge posée sur l'appui lui-même, qu'aucune poutre ne porte", () => {
    // A support reads what the beams reaching it apply, and that alone cannot see a load landing on the node itself: it reaches the ground without passing through a beam.
    // The solver files exactly it as an `"External"` reaction on the anchored dof, which is what closes the sum here.
    const { join, beam, force } = cantilever();
    const onNode: ForceElement = {
      type: "force",
      id: id(),
      targetID: join.id,
      vector: new Point2(0, -50),
      frame: "world",
    };
    const model = compile_simulation_model(
      mechanism([join, beam], [force, onNode]),
      true,
    );
    let snapshot: DynamicSnapshot | null = null;
    for (let i = 0; i < 30; i++)
      snapshot = step_dynamic_simulation(model, i * RECORD_DT, snapshot, RECORD_DT, new Point2(0, 0));

    const atJoin = element_reactions(join, snapshot!);
    expect(atJoin).toHaveLength(1);
    // 100 N through the beam plus the 50 N put straight on the support.
    expect(atJoin[0].vector.y).toBeCloseTo(150, 0);
    // The node's own load has no lever arm about the node, so the couple is the tip load's alone.
    expect(atJoin[0].moment).toBeCloseTo(100, 0);

    // The beam carries only what passes through it.
    const [atBeamRoot] = element_reactions(beam, snapshot!);
    expect(atBeamRoot.vector.y).toBeCloseTo(-100, 0);
  });
});

describe("réactions aux extrémités de deux poutres soudées en ligne", () => {
  // Two beams welded end to end under one tip load: the shape that separates a beam's OWN couple at a point from whatever else is reported at the same fused key.
  // Read off the constraint impulses, the weld and the encastrement both answer `P·L` — the encastrement's `KeepOrientation` files its couple at BOTH of its keys, and the weld's own `Angle` link reports none at all (its effort comes out as a force triple).
  // Each beam's torsor is its own, so the couple tapers the way bending does: `P·L` at the fixed end, `P·L/2` at the weld, zero at the free tip.
  const TIP_LOAD = 100;
  /** Both beams together: half a metre each at ρ·A = 1 kg/m. */
  const BEAM_MASS = 1;
  const G = 9.81;

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
    const near: BeamElement = {
      type: "beam",
      id: NEAR,
      probes: [],
      overlays: {},
      positionStart: new Point2(0, 0),
      positionEnd: new Point2(0.5, 0),
      fixedNodeStartID: ROOT,
      fixedNodeEndID: WELD,
      fixedNodesBodyIDs: [],
      materialID: MATERIAL_ID,
      profileID: PROFILE_ID,
    };
    const far: BeamElement = {
      type: "beam",
      id: FAR,
      probes: [],
      overlays: {},
      positionStart: new Point2(0.5, 0),
      positionEnd: new Point2(1, 0),
      fixedNodeStartID: WELD,
      fixedNodesBodyIDs: [],
      materialID: MATERIAL_ID,
      profileID: PROFILE_ID,
    };
    const force: ForceElement = {
      type: "force",
      id: id(),
      targetID: FAR,
      anchor: "end",
      vector: new Point2(0, -TIP_LOAD),
      frame: "world",
    };
    return { root, weld, near, far, force };
  }

  it("le couple décroît le long de la portée au lieu de se répéter", () => {
    const { root, weld, near, far, force } = welded_pair();
    // No gravity: the tip load is the only action, so every figure below is exact statics.
    const model = compile_simulation_model(mechanism([root, weld, near, far], [force]), true);
    let snapshot: DynamicSnapshot | null = null;
    for (let i = 0; i < 30; i++)
      snapshot = step_dynamic_simulation(model, i * RECORD_DT, snapshot, RECORD_DT, new Point2(0, 0));

    const tolerance = 0.01 * TIP_LOAD; // same 1 % of the load the cantilever above reads to
    const [nearRoot, nearWeld] = element_reactions(near, snapshot!);
    const [farWeld, farTip] = element_reactions(far, snapshot!);

    // At the encastrement the beam pulls DOWN on the wall, with the load's full lever arm — a beam end says what the beam applies, opposed nowhere, so both of its own ends read one continuous effort.
    expect(nearRoot.atAnchor).toBe(true);
    expect(Math.abs(nearRoot.vector.y + TIP_LOAD)).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(nearRoot.moment! + TIP_LOAD * 1)).toBeLessThanOrEqual(tolerance);

    // Half a metre out, the other way round and half the lever arm — the same load still passing through.
    expect(nearWeld.atAnchor).toBe(false);
    expect(Math.abs(nearWeld.vector.y - TIP_LOAD)).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(nearWeld.moment! - TIP_LOAD * 0.5)).toBeLessThanOrEqual(tolerance);

    // The far beam reads the same weld from its other side: Newton's third law, component by component.
    expect(Math.abs(farWeld.vector.y + nearWeld.vector.y)).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(farWeld.moment! + nearWeld.moment!)).toBeLessThanOrEqual(tolerance);

    // The free tip holds the load up and bends nothing past itself.
    expect(Math.abs(farTip.vector.y - TIP_LOAD)).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(farTip.moment!)).toBeLessThanOrEqual(tolerance);
  });

  it("le nœud défère aux poutres qui l'atteignent", () => {
    const { root, weld, near, far, force } = welded_pair();
    const model = compile_simulation_model(mechanism([root, weld, near, far], [force]), true);
    let snapshot: DynamicSnapshot | null = null;
    for (let i = 0; i < 30; i++)
      snapshot = step_dynamic_simulation(model, i * RECORD_DT, snapshot, RECORD_DT, new Point2(0, 0));

    const tolerance = 0.01 * TIP_LOAD;
    const [nearRoot] = element_reactions(near, snapshot!);

    // One beam reaches the support, so the sum is that beam's own reading, opposed — the classical support reaction, to the last digit rather than to the 1 % the raw impulses hold.
    // The two arrows at that point are the action/reaction pair: the beam pulls down on the wall, the wall pushes back up.
    const atRoot = element_reactions(root, snapshot!);
    expect(atRoot).toHaveLength(1);
    expect(atRoot[0].atAnchor).toBe(true);
    expect(atRoot[0].vector.y).toBeCloseTo(-nearRoot.vector.y, 9);
    expect(atRoot[0].moment).toBeCloseTo(-nearRoot.moment!, 9);

    // The weld holds nothing of its own: its two sides cancel by Newton's third law, and what passes through it is on the two beam ends instead.
    const atWeld = element_reactions(weld, snapshot!);
    expect(atWeld).toHaveLength(1);
    expect(atWeld[0].vector.length()).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(atWeld[0].moment!)).toBeLessThanOrEqual(tolerance);
  });

  it("le corps libre boucle : charges + poids + réactions = m·a", () => {
    // Under gravity this time, so the weight term is the one carrying most of the sum.
    const { root, weld, near, far, force } = welded_pair();
    const model = compile_simulation_model(
      mechanism([root, weld, near, far], [force]),
      true,
    );
    let snapshot: DynamicSnapshot | null = null;
    for (let i = 0; i < 40; i++)
      snapshot = step_dynamic_simulation(model, i * RECORD_DT, snapshot, RECORD_DT, new Point2(0, -G));

    const balance = snapshot!.balance;
    expect(balance).toBeDefined();
    // Continuum masses, not the solver's ⅙/⅔/⅙ lumps: the sixth sitting on the anchored root belongs to its beam, so the whole metre of beam weighs here.
    expect(balance!.weightY).toBeCloseTo(-BEAM_MASS * G, 6);

    const support = support_total([root, weld], snapshot!);
    expect(
      Math.abs(balance!.appliedY + balance!.weightY + support.force.y - balance!.inertiaY),
    ).toBeLessThanOrEqual(0.01 * TIP_LOAD);
    // Every moment about the world origin, which sits on the encastrement here — so the support's own force makes none and its couple carries the whole of it.
    expect(
      Math.abs(balance!.appliedM + balance!.weightM + support.moment - balance!.inertiaM),
    ).toBeLessThanOrEqual(0.01 * TIP_LOAD);
  });
});

describe("réaction d'un nœud ancré isolé", () => {
  it("reporte la force externe directement appliquée, sans aucun lien pour la porter", () => {
    // The other half of the same underlying gap: `PBD_kinematic_solver`'s reaction bookkeeping is entirely link-based (`links.forEach`), so a `Force` load on a grounded node with nothing else attached — no link ever touches its key — was reported as reaction-free, even though the whole load lands straight on the ground.
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
    // Same node, no `Force` element this time — gravity alone has to reach the anchored-dof reaction fallback.
    // It does so via `DynamicMassModel.groundedMasses` (`step_dynamic_simulation` restates `mass · gravity` as an ordinary force there, since an anchored node never feels the predict step's acceleration in the first place).
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
    // A grounded join with nothing attached lumps no mass at all (`compute_dynamic_mass_model` leaves it unfloored for anchored keys, on purpose — see `groundedMasses`'s doc).
    // It must stay silent under gravity, not report `MASS_FLOOR`'s worth of weight from nothing.
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
