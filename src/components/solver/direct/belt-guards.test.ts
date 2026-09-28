import { describe, expect, it } from "vitest";
import { Link, Point2 } from "../../../types";
import { PBD_kinematic_solver } from "../kinematics/PBD_kinematic_solver";

type Belt = Extract<Link, { type: "BeltLength" }>;

const DT = 1 / 480;

/**
 * Run `steps` direct substeps of `belt` alone, from `start` positions and velocities, with no gravity.
 * The belt's length needs its strands, which are left out: what is solved here is only its guards.
 */
function run(
  belt: Belt,
  start: Record<string, { at: Point2; v: Point2; mass: number }>,
  steps: number,
  restitution = 0.9,
) {
  const positions = new Map(Object.entries(start).map(([k, s]) => [k, s.at]));
  const velocities = new Map(Object.entries(start).map(([k, s]) => [k, s.v]));
  const masses = new Map(Object.entries(start).map(([k, s]) => [k, s.mass]));
  for (let i = 0; i < steps; i++)
    PBD_kinematic_solver(positions, new Map(), masses, new Map(), [belt], 50, 1e-9, new Map(), false, "motion", 0, {
      dt: DT,
      gx: 0,
      gy: 0,
      velocities,
      angleVelocities: new Map(),
      direct: true,
      restitution: { coefficient: restitution, lost: 0 },
    });
  return { positions, velocities };
}

describe("les gardes d'une courroie dans le solveur direct", () => {
  it("arrête une extrémité libre sur la jante de sa poulie, sans rebond", () => {
    const belt: Belt = {
      type: "BeltLength",
      ddl: 1,
      startKey: "s",
      endKey: "e",
      gearPosKeys: ["p"],
      gearAngleKeys: ["p"],
      radii: [0.1],
      directions: [false],
      length: 1,
      closed: false,
    };
    const { positions, velocities } = run(
      belt,
      {
        p: { at: new Point2(0, 0), v: new Point2(0, 0), mass: 0 },
        s: { at: new Point2(0.2, 0), v: new Point2(-5, 0), mass: 1 },
        e: { at: new Point2(-0.5, 0), v: new Point2(0, 0), mass: 0 },
      },
      20,
    );
    expect(positions.get("s")!.length()).toBeGreaterThan(0.1 - 1e-9);
    // A bounce would send it back out at nine tenths of its approach speed.
    expect(Math.abs(velocities.get("s")!.x)).toBeLessThan(1e-3);
  });

  it("garde deux poulies voisines assez loin pour que leur brin croisé existe", () => {
    const belt: Belt = {
      type: "BeltLength",
      ddl: 1,
      startKey: "",
      endKey: "",
      gearPosKeys: ["a", "b"],
      gearAngleKeys: ["a", "b"],
      radii: [0.2, 0.1],
      directions: [true, false],
      length: 1,
      closed: true,
    };
    const { positions, velocities } = run(
      belt,
      {
        a: { at: new Point2(0, 0), v: new Point2(0, 0), mass: 0 },
        b: { at: new Point2(0.4, 0), v: new Point2(-5, 0), mass: 1 },
      },
      20,
    );
    expect(positions.get("b")!.x).toBeGreaterThan(0.3 - 1e-9);
    expect(Math.abs(velocities.get("b")!.x)).toBeLessThan(1e-3);
  });

  it("tient la longueur d'une courroie qui n'a plus de poulie", () => {
    const belt: Belt = {
      type: "BeltLength",
      ddl: 1,
      startKey: "s",
      endKey: "e",
      gearPosKeys: ["p"],
      gearAngleKeys: ["p"],
      radii: [0.1],
      directions: [false],
      length: 0.5,
      closed: false,
      disconnected: [true],
    };
    const { positions } = run(
      belt,
      {
        p: { at: new Point2(0, 1), v: new Point2(0, 0), mass: 0 },
        s: { at: new Point2(0, 0), v: new Point2(0, 0), mass: 0 },
        e: { at: new Point2(0.5, 0), v: new Point2(3, 1), mass: 1 },
      },
      20,
    );
    expect(positions.get("e")!.length()).toBeCloseTo(0.5, 6);
  });
});
