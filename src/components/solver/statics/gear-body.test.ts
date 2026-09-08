import { describe, expect, it } from "vitest";
import { ID, Link, MechanicalElement, Point2 } from "../../../types";
import { BeamCohesionSpec } from "../dynamics/beam-cohesion";
import { StaticsFrame, StaticsGear, build_statics_system } from "./equilibrium-model";
import { solve_statics } from "./equilibrium-solve";
import { build_flexibility } from "./flexibility";

/**
 * A crank, against the lever arm anyone would write on paper — see docs/plan-efforts-interieurs.md phase 10.
 *
 * A gear is a body that TRANSMITS, so what has to be right is what comes out at its axle: the force, and the couple its motor holds the load with. Both follow from one arm and one reaction here, which is the point of choosing a case this small.
 *
 * The frame is INJECTED rather than simulated, same reasoning as `flexibility.test.ts`: what is under test is the assembly, not the geometry that fed it.
 */
const R = 1; // crank radius, centre at the origin and the rim pin on +x
const SPAN = 3;
const W = 400; // N/m of uniform load, downward
const ZERO = new Point2(0, 0);

const BEAM = "beam" as ID;
const GEAR = "gear" as ID;
const AXLE = "axle" as ID;
const RIM = "rim" as ID;
const FAR = "far" as ID;

/** `motorised` is the whole question: a driven axle passes a couple, a free one cannot. */
function crank(motorised: boolean) {
  const elements = [
    { type: "beam", id: BEAM },
    { type: "pivot", id: AXLE },
    { type: "pivot", id: RIM },
    { type: "pivot", id: FAR },
    { type: "gear", id: GEAR },
  ] as unknown as MechanicalElement[];

  const spec: BeamCohesionSpec = {
    beamID: BEAM,
    k0: RIM,
    k1: FAR,
    mass: 0,
    attachedNodes: [],
    midKey: `${BEAM}:mid`,
  };

  // A weightless disc: the arm is what this checks, and its own inertia would only add a term the hand calculation would have to carry too.
  const gears: StaticsGear[] = [
    { id: GEAR, centreKey: AXLE, radius: R, mass: 0, inertia: 0 },
  ];

  const links: Link[] = [
    { type: "Distance", ddl: 1, key1: RIM, key2: FAR, distance: SPAN, owner: BEAM },
    {
      type: "GearPerimeterPin",
      ddl: 2,
      nodeKey: RIM,
      centerKey: AXLE,
      angleKey: GEAR,
      radius: R,
      offset: 0,
    },
  ];
  if (motorised)
    links.push({ type: "MotorAngle", ddl: 1, angleKey: GEAR, omega: 1, targetAngle: 0 });

  const positions = new Map<string, Point2>([
    [AXLE, new Point2(0, 0)],
    [RIM, new Point2(R, 0)],
    [FAR, new Point2(R + SPAN, 0)],
  ]);
  const frame: StaticsFrame = {
    gravity: ZERO, // only the load acts, so every figure below is the load's alone
    positionOf: (key) => positions.get(key),
    velocityOf: () => ZERO,
    accelerationOf: () => ZERO,
    externalForceAt: () => ZERO,
    nodeMassAt: () => 0,
    beamMass: () => 0,
    distributedDensityOn: () => ({ at0: new Point2(0, -W), slope: ZERO }),
    beamStiffness: () => ({ EA: 210e9 * 1e-3, EI: 210e9 * 8e-7 }),
    gearAngularAcceleration: () => 0,
  };

  const system = build_statics_system(
    [spec],
    gears,
    links,
    elements,
    (key) => key === AXLE || key === FAR,
  );
  // With the flexibility, as the engine always calls it: the beam's own axial pair is a redundancy here, and leaving it open would report an `N` nobody asked about as unknown.
  const solution = solve_statics(
    system,
    [spec],
    frame,
    build_flexibility(system, [spec], frame),
  )!;
  const at = (owner: "beam" | "gear", node: ID) =>
    solution.torsors.find((t) =>
      owner === "beam" ? t.beamID === BEAM && t.nodeKey === node : t.gearID === GEAR && t.nodeKey === node,
    )!;
  return { system, solution, at };
}

describe("une manivelle portée comme un corps", () => {
  it("porte le pignon et ses deux interfaces", () => {
    const { system } = crank(true);
    expect(system.gears.map((g) => g.id)).toEqual([GEAR]);
    expect(system.bodies.filter((b) => b.kind === "gear")).toHaveLength(1);
  });

  it("rend le bras de levier au couple d'axe", () => {
    // The beam is simply supported on two pivots, so each end carries `wL/2` and hands it back down onto its node. The rim pin passes that to the disc, which turns it about the centre through the crank radius.
    const { at } = crank(true);
    const half = (W * SPAN) / 2;
    expect(at("beam", RIM).fy).toBeCloseTo(-half, 6);
    expect(at("gear", RIM).fy).toBeCloseTo(half, 6);
    // What the gear hands its axle: the load straight through, and the couple the motor holds it with, `R × wL/2`.
    expect(at("gear", AXLE).fy).toBeCloseTo(-half, 6);
    expect(at("gear", AXLE).m).toBeCloseTo(-R * half, 6);
    expect(at("gear", AXLE).determined).toEqual({ fx: true, fy: true, m: true });
  });

  it("un axe libre ne peut retenir aucun couple, et le dit", () => {
    // Without a motor the bearing passes no couple, so nothing balances the crank's moment: the assembly cannot be satisfied, and it is the residual that says so rather than a quietly invented torque.
    const { solution, at } = crank(false);
    expect(at("gear", AXLE).m).toBe(0);
    expect(solution.residual).toBeGreaterThan(0.01 * solution.scale);
  });
});
