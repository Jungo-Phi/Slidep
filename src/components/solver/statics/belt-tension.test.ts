import { describe, expect, it } from "vitest";
import { ID, Link, MechanicalElement, Point2 } from "../../../types";
import { StaticsFrame, StaticsGear, build_statics_system } from "./equilibrium-model";
import { solve_statics } from "./equilibrium-solve";

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
