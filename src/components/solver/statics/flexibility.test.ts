import { describe, expect, it } from "vitest";
import { ID, Link, MechanicalElement, Point2 } from "../../../types";
import { BeamCohesionSpec } from "../dynamics/beam-cohesion";
import { StaticsFrame, build_statics_system } from "./equilibrium-model";
import { solve_statics } from "./equilibrium-solve";
import { build_flexibility } from "./flexibility";

/**
 * The hyperstatic cases, against the textbook — see docs/plan-efforts-interieurs.md phase 10.
 *
 * These are the whole justification for carrying a flexibility form at all: equilibrium alone
 * leaves a family of answers here, and the figures below (`3wL/8`, `wL²/8`, `wL²/12`) are what
 * a beam made of a real material actually does. They are equalities, not tolerances — the only
 * slack allowed is quadrature and floating point.
 *
 * The frame is INJECTED rather than simulated: a beam anchored at both ends is a known limit of
 * the PBD solver (its own `Distance` link then has two anchored dofs, indeterminate and never
 * reported), and it is beside the point here. What is under test is the statics formulation,
 * which does not care what produced the geometry.
 */
const L = 3;
const W = 400; // N/m, downward
const EA = 210e9 * 1e-3;
const EI = 210e9 * 8e-7;
const ZERO = new Point2(0, 0);

const BEAM = "beam" as ID;
const START = "n0" as ID;
const END = "n1" as ID;
const BELT = "belt" as ID;

/** `startType` and `endType` are what makes the case: `join` is a fixed end, `pivot` a pinned one.
 * `beltTip` swaps the far end's support for a belt pin — something this model has no term for, hence an unknown of its own.
 * Everything else — span, load, section — is shared. */
function stand(
  startType: "join" | "pivot",
  endType: "join" | "pivot",
  beltTip = false,
) {
  const elements = [
    { type: "beam", id: BEAM },
    { type: startType, id: START },
    { type: endType, id: END },
  ] as unknown as MechanicalElement[];

  const spec: BeamCohesionSpec = {
    beamID: BEAM,
    k0: START,
    k1: END,
    mass: 0,
    attachedNodes: [],
    midKey: `${BEAM}:mid`,
  };
  // One link naming both ends, so neither node reads as touched by something unmodelled.
  const links: Link[] = [
    { type: "Distance", ddl: 1, key1: START, key2: END, distance: L, owner: BEAM },
  ];
  if (beltTip)
    links.push({
      type: "BeltPin",
      ddl: 2,
      beltID: BELT,
      nodeKey: END,
      gearPosKeys: [],
      gearAngleKeys: [],
      radii: [],
      directions: [],
      refIndex: 0,
      refAngleKey: BELT,
      s0: 0,
      thetaRef0: 0,
    } as unknown as Link);

  const positions = new Map<string, Point2>([
    [START, new Point2(0, 0)],
    [END, new Point2(L, 0)],
  ]);
  const frame: StaticsFrame = {
    gravity: ZERO, // the beam is weightless here: the reference figures are the UDL's alone
    positionOf: (key) => positions.get(key),
    velocityOf: () => ZERO,
    accelerationOf: () => ZERO,
    externalForceAt: () => ZERO,
    nodeMassAt: () => 0,
    beamMass: () => 0,
    distributedDensityOn: () => ({ at0: new Point2(0, -W), slope: ZERO }),
    beamStiffness: () => ({ EA, EI }),
    gearAngularAcceleration: () => 0,
  };

  const system = build_statics_system(
    [spec],
    [],
    links,
    elements,
    (key) => key === START || (!beltTip && key === END),
  );
  const flexibility = build_flexibility(system, [spec], frame);
  expect(flexibility).toBeDefined();
  const solution = solve_statics(system, [spec], frame, flexibility)!;
  return {
    solution,
    /** What the beam applies onto the node at that end. */
    beamAt: (node: ID) =>
      solution.torsors.find((t) => t.beamID === BEAM && t.nodeKey === node)!,
    /** What the frame supplies there. */
    supportAt: (node: ID) =>
      solution.torsors.find((t) => t.beamID === undefined && t.nodeKey === node)!,
  };
}

describe("poutre encastrée-appuyée sous charge répartie", () => {
  // Fixed at one end, pinned at the other, uniform `w` over `L`. Statics alone cannot answer:
  // five reaction components against three equations. The textbook does — R = 3wL/8 at the
  // propped end, M = wL²/8 at the fixed one.
  const run = () => stand("join", "pivot");

  it("est hyperstatique, et la flexibilité tranche", () => {
    const { solution } = run();
    // Two redundancies: the classical bending one, plus the axial pair no roller relieves.
    expect(solution.indeterminacy).toBe(2);
    expect(solution.residual).toBeLessThan(1e-6 * solution.scale);
  });

  it("rend 3wL/8 à l'appui simple et wL²/8 à l'encastrement", () => {
    const { supportAt, beamAt } = run();
    expect(supportAt(END).fy).toBeCloseTo((3 * W * L) / 8, 6);
    expect(supportAt(START).fy).toBeCloseTo((5 * W * L) / 8, 6);
    // `Mf` at the fixed end, in the plan's own cut convention: the beam hogs there, so it is
    // the negative of the textbook magnitude.
    expect(beamAt(START).m).toBeCloseTo(-(W * L * L) / 8, 6);
    // And the propped end passes no couple at all — it is a hinge.
    expect(beamAt(END).m).toBe(0);
  });

  it("ne met aucun effort normal dans une poutre chargée en travers", () => {
    // The axial redundancy has no load to carry, and least energy puts nothing in it. Minimum
    // NORM would have done the same here; the case below is the one that tells them apart.
    const { beamAt } = run();
    expect(beamAt(START).fx).toBeCloseTo(0, 6);
  });
});

describe("poutre bi-encastrée sous charge répartie", () => {
  // Both ends fixed: three redundancies, and the classic `wL²/12` at the supports against
  // `wL²/24` at mid-span — the case every course uses to show that fixing both ends halves
  // the worst moment.
  const run = () => stand("join", "join");

  it("compte trois redondances", () => {
    const { solution } = run();
    expect(solution.indeterminacy).toBe(3);
    expect(solution.residual).toBeLessThan(1e-6 * solution.scale);
  });

  it("rend wL²/12 aux encastrements et wL/2 de réaction", () => {
    const { supportAt, beamAt } = run();
    expect(supportAt(START).fy).toBeCloseTo((W * L) / 2, 6);
    expect(supportAt(END).fy).toBeCloseTo((W * L) / 2, 6);
    expect(beamAt(START).m).toBeCloseTo(-(W * L * L) / 12, 6);
    // Read from the far end the cut convention flips the sign, the two ends hogging alike.
    expect(beamAt(END).m).toBeCloseTo((W * L * L) / 12, 6);
  });

  it("le moment à mi-portée vaut wL²/24", () => {
    // Not an unknown of the system: it is `M_coh(L/2)`, marched from the fixed end — the
    // property that makes the two figures one answer rather than two.
    const { beamAt } = run();
    const start = beamAt(START);
    // `M_coh(s) = Σ_{sⱼ<s}[(sⱼ−s)·(x̂ × Fⱼ) + Mⱼ] − Mw(s)` at `s = L/2`, the beam lying on +x:
    // one upstream interface at `s = 0`, and `Mw(L/2) = wL²/8` for a uniform `w`.
    const atMid = (-L / 2) * start.fy + start.m - (W * L * L) / 8;
    expect(atMid).toBeCloseTo((W * L * L) / 24, 6);
  });
});

describe("ce que la passe déclare résolu", () => {
  it("une redondance entre poutres est une réponse, pas une inconnue", () => {
    // Three redundancies, and nothing unknown: the flexibility chose among them, so what the
    // reader is owed is the diagram and not a warning over it.
    const { solution, beamAt } = stand("join", "join");
    expect(solution.indeterminacy).toBe(3);
    for (const node of [START, END])
      expect(beamAt(node).determined).toEqual({ fx: true, fy: true, m: true });
  });

  it("laisse indéterminé ce qu'une action non modélisée peut atteindre", () => {
    // The same beam with its far end held by a belt instead of by the frame.
    // A belt is not a body here, so its pull is an unknown carrying no energy of its own — and an unknown that costs nothing is the cheapest place to put the load, which would answer the split by arithmetic rather than by physics.
    // Neither end may be reported as settled.
    const { beamAt } = stand("join", "join", true);
    expect(beamAt(END).determined.fy).toBe(false);
    expect(beamAt(START).determined.fy).toBe(false);
  });
});
