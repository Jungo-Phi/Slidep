import { describe, expect, it } from "vitest";
import { BeltElement, ID, Link, MechanicalElement, Point2 } from "../../../types";
import { StaticsFrame, StaticsGear, build_statics_system } from "./equilibrium-model";
import { solve_statics } from "./equilibrium-solve";
import { belt_strand_on_pose } from "../../../utils/belt-geom";

/**
 * A rope over a pulley, against the two lines anyone would write for it — see docs/plan-efforts-interieurs.md phase 10.
 *
 * What a belt has to get right is the pair of things a designer asks it for: what reaches the axle, and what the difference of tensions turns the pulley with. Both come out of one radius and two hanging loads here, which is why the case is this small.
 *
 * The frame is INJECTED, same reasoning as `flexibility.test.ts` and `gear-body.test.ts`: what is under test is the assembly.
 */
const R = 2;
const DROP = 10; // how far below the centre the two free ends hang
const ZERO = new Point2(0, 0);

const GEAR = "gear" as ID;
const BELT = "belt" as ID;
const AXLE = "axle" as ID;
const LEFT = "left" as ID;
const RIGHT = "right" as ID;

/** `left` and `right` are the loads hanging on the two ends, downward and positive. */
function rope(left: number, right: number) {
  const elements = [
    { type: "pivot", id: AXLE },
    { type: "gear", id: GEAR },
  ] as unknown as MechanicalElement[];

  const gears: StaticsGear[] = [
    { id: GEAR, centreKey: AXLE, radius: R, mass: 0, inertia: 0 },
  ];

  const links: Link[] = [
    {
      type: "BeltLength",
      ddl: 1,
      startKey: LEFT,
      endKey: RIGHT,
      gearPosKeys: [AXLE],
      gearAngleKeys: [GEAR],
      radii: [R],
      // Wrapping over the top, which is what puts both free ends straight below the rim.
      directions: [true],
      length: 2 * DROP + Math.PI * R,
      closed: false,
      owner: BELT,
    } as unknown as Link,
    // A motorised axle, so the pulley can hold a difference of tensions rather than spin free.
    { type: "MotorAngle", ddl: 1, angleKey: GEAR, omega: 0, targetAngle: 0 },
  ];

  // The two ends hang straight down from the rim, so each strand is vertical and carries its own load whole.
  const positions = new Map<string, Point2>([
    [AXLE, new Point2(0, 0)],
    [LEFT, new Point2(-R, -DROP)],
    [RIGHT, new Point2(R, -DROP)],
  ]);
  const pulls = new Map<string, Point2>([
    [LEFT, new Point2(0, -left)],
    [RIGHT, new Point2(0, -right)],
  ]);
  const frame: StaticsFrame = {
    gravity: ZERO, // the two hanging loads are the whole of what acts
    positionOf: (key) => positions.get(key),
    velocityOf: () => ZERO,
    accelerationOf: () => ZERO,
    externalForceAt: (key) => pulls.get(key) ?? ZERO,
    nodeMassAt: () => 0,
    beamMass: () => 0,
    distributedDensityOn: () => ({ at0: ZERO, slope: ZERO }),
    beamStiffness: () => undefined,
    gearAngularAcceleration: () => 0,
    externalTorqueOn: () => 0,
  };

  const system = build_statics_system([], gears, links, elements, (key) => key === AXLE);
  const solution = solve_statics(system, [], frame)!;
  return {
    system,
    solution,
    axle: solution.torsors.find((t) => t.gearID === GEAR && t.nodeKey === AXLE)!,
  };
}

describe("une corde sur une poulie", () => {
  it("porte une tension par brin, et rien pour les arcs", () => {
    const { system } = rope(100, 100);
    expect(system.belts).toHaveLength(1);
    // Two vias plus the pulley, an open path: one strand each side and no unknown under the wrap.
    expect(system.belts[0].columns).toHaveLength(2);
  });

  it("rend les deux charges à l'axe, et rien au couple quand elles s'équilibrent", () => {
    const { axle, solution } = rope(100, 100);
    expect(solution.residual).toBeLessThan(1e-9 * Math.max(solution.scale, 1));
    // Everything hung on the rope comes out at the axle: the pulley and the belt weigh nothing.
    expect(axle.fy).toBeCloseTo(-200, 6);
    expect(axle.fx).toBeCloseTo(0, 6);
    // Equal loads on equal radii turn it not at all.
    expect(axle.m).toBeCloseTo(0, 6);
  });

  it("tourne du produit de la différence par le rayon", () => {
    // The classic: it is the DIFFERENCE of the two tensions that a pulley transmits, through its own radius.
    const { axle, solution } = rope(150, 50);
    expect(solution.residual).toBeLessThan(1e-9 * Math.max(solution.scale, 1));
    expect(axle.fy).toBeCloseTo(-200, 6);
    expect(Math.abs(axle.m)).toBeCloseTo(R * 100, 6);
  });

  it("garde le couple déterminé, la tension étant un membre comme un autre", () => {
    const { axle } = rope(150, 50);
    expect(axle.determined).toEqual({ fx: true, fy: true, m: true });
  });
});

const DRIVER = "driver" as ID;
const DRIVEN = "driven" as ID;
const AXLE_A = "axleA" as ID;
const AXLE_B = "axleB" as ID;
const SPAN = 10;

/** A closed belt over two equal pulleys on fixed axles, the driven one braked by `torque` through its own inertia. */
function drive(torque: number) {
  const elements = [
    { type: "pivot", id: AXLE_A },
    { type: "pivot", id: AXLE_B },
    { type: "gear", id: DRIVER },
    { type: "gear", id: DRIVEN },
  ] as unknown as MechanicalElement[];
  const gears: StaticsGear[] = [
    { id: DRIVER, centreKey: AXLE_A, radius: R, mass: 0, inertia: 0 },
    { id: DRIVEN, centreKey: AXLE_B, radius: R, mass: 0, inertia: 1 },
  ];
  const links: Link[] = [
    {
      type: "BeltLength",
      ddl: 1,
      startKey: "junction",
      endKey: "junction",
      gearPosKeys: [AXLE_A, AXLE_B],
      gearAngleKeys: [DRIVER, DRIVEN],
      radii: [R, R],
      directions: [true, true],
      length: 2 * SPAN + 2 * Math.PI * R,
      closed: true,
      owner: BELT,
    } as unknown as Link,
    { type: "MotorAngle", ddl: 1, angleKey: DRIVER, omega: 0, targetAngle: 0 },
  ];
  const positions = new Map<string, Point2>([
    [AXLE_A, new Point2(0, 0)],
    [AXLE_B, new Point2(SPAN, 0)],
  ]);
  const frame: StaticsFrame = {
    gravity: ZERO,
    positionOf: (key) => positions.get(key),
    velocityOf: () => ZERO,
    accelerationOf: () => ZERO,
    externalForceAt: () => ZERO,
    nodeMassAt: () => 0,
    beamMass: () => 0,
    distributedDensityOn: () => ({ at0: ZERO, slope: ZERO }),
    beamStiffness: () => undefined,
    // Unit inertia, so the driven pulley's angular acceleration is the torque it resists with.
    gearAngularAcceleration: (id) => (id === DRIVEN ? torque : 0),
    externalTorqueOn: () => 0,
  };
  const system = build_statics_system([], gears, links, elements, (key) => key === AXLE_A || key === AXLE_B);
  return solve_statics(system, [], frame)!;
}

describe("une courroie fermée entre deux axes fixes", () => {
  it("ne porte que la tension qu'il faut pour transmettre, son brin mou à zéro", () => {
    const solution = drive(30);
    const tensions = solution.strands.map((s) => s.tension).sort((a, b) => a - b);
    expect(tensions).toHaveLength(2);
    expect(tensions[0]).toBeCloseTo(0, 6);
    expect(tensions[1]).toBeCloseTo(30 / R, 6);
    expect(solution.strands.every((s) => s.determined)).toBe(true);
  });

  it("rend alors les réactions d'axe déterminées", () => {
    const solution = drive(30);
    // The pretension was what left each axle's pull along the line of centres open, at the pulley and at the support alike.
    for (const t of solution.torsors) expect(t.determined).toEqual({ fx: true, fy: true, m: true });
  });

  it("reste tendue sans rien à transmettre, à tension nulle", () => {
    const solution = drive(0);
    for (const s of solution.strands) {
      expect(s.tension).toBeCloseTo(0, 6);
      expect(s.determined).toBe(true);
    }
  });
  it("se retrouve sur le dessin, brin par brin, par les poulies qu'il relie", () => {
    // The canvas carries a strand's arrows onto the belt it draws by naming the pulleys at its ends; that must land on the very strand the solve wrote.
    const belt = {
      type: "belt",
      id: BELT,
      closed: true,
      positionStart: ZERO,
      positionEnd: ZERO,
      attachedGearsIDs: [
        { id: DRIVER, clockwise: true },
        { id: DRIVEN, clockwise: true },
      ],
    } as unknown as BeltElement;
    const elements = [
      belt,
      { type: "gear", id: DRIVER, position: new Point2(0, 0), radius: R },
      { type: "gear", id: DRIVEN, position: new Point2(SPAN, 0), radius: R },
    ] as unknown as MechanicalElement[];
    for (const strand of drive(30).strands) {
      const drawn = belt_strand_on_pose(belt, elements, strand.fromGear, strand.toGear)!;
      expect(drawn.from.distance_to(strand.from)).toBeLessThan(1e-9);
      expect(drawn.to.distance_to(strand.to)).toBeLessThan(1e-9);
    }
  });
});
