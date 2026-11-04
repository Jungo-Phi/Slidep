import { describe, expect, it } from "vitest";
import { Point2 } from "../types/point2";
import type {
  BeltElement,
  GearElement,
  ID,
  MechanicalElement,
  PivotElement,
} from "../types/element";
import type { Link } from "../types";
import { applyBeltLengthConstraint } from "../test/constraint-map-api";
import { belt_length_link, elements_by_id } from "../components/solver/kinematics/parsing";
import { belt_wound_wraps, measure_belt_length } from "./belt-geom";

const P = (x: number, y: number) => new Point2(x, y);

const axle: PivotElement = {
  type: "pivot",
  id: "ax" as ID,
  probes: [],
  overlays: {},
  position: P(0, 0),
  isGrounded: true,
  rotatingEdgesIDs: [],
  fixedGearsIDs: ["g" as ID],
  motor: undefined,
  rotationalFriction: 0,
};
const gear: GearElement = {
  type: "gear",
  id: "g" as ID,
  probes: [],
  overlays: {},
  position: P(0, 0),
  angle: 0,
  radius: 40,
  parentAxleID: axle.id,
  fixedNodesBodyIDs: [],
  meshedGearsIDs: [],
  attachedBeltID: "belt" as ID,
  surfaceMass: 1,
};
const belt = (turns?: number): BeltElement => ({
  type: "belt",
  id: "belt" as ID,
  probes: [],
  overlays: {},
  positionStart: P(-150, 100),
  positionEnd: P(150, 100),
  fixedNodeStartID: undefined,
  fixedNodeEndID: undefined,
  attachedGearsIDs: [{ id: gear.id, clockwise: false, ...(turns ? { turns } : {}) }],
  closed: false,
});
const mech = (b: BeltElement): MechanicalElement[] => [axle, gear, b];

/** How far the length link built for `b` is from holding, in the pose it was built in: everything anchored, so nothing can move to close the gap. */
const gap = (b: BeltElement, link: Link = belt_length_link(b, elements_by_id(mech(b)), mech(b))!) => {
  const positions = new Map<string, Point2>([
    [gear.id, gear.position],
    [`${b.id}:start`, b.positionStart],
    [`${b.id}:end`, b.positionEnd],
  ]);
  const anchored = new Map<string, number>([...positions.keys()].map((k) => [k, 0]));
  return applyBeltLengthConstraint(positions, anchored, new Map(), link as Extract<Link, { type: "BeltLength" }>);
};

describe("a pulley wound by whole turns", () => {
  it("counts r·2π of belt per turn in the belt's length", () => {
    const bare = measure_belt_length(belt(), mech(belt()));
    expect(measure_belt_length(belt(2), mech(belt(2))) - bare).toBeCloseTo(2 * 2 * Math.PI * 40, 6);
  });

  it("is wrapped by its geometry plus 2π per turn", () => {
    const shown = belt_wound_wraps({ ...belt(), attachedGearsIDs: [{ id: gear.id, clockwise: false, turns: 0 }] }, mech(belt()));
    expect(shown).toBeUndefined();
    const [wrap] = belt_wound_wraps(belt(2), mech(belt(2)))!;
    expect(wrap).toBeGreaterThan(4 * Math.PI);
    expect(wrap).toBeLessThan(6 * Math.PI);
  });

  it("holds as it stands when the length is built for it, so nothing moves when the simulation starts", () => {
    expect(gap(belt())).toBeCloseTo(0, 6);
    expect(gap(belt(2))).toBeCloseTo(0, 6);
  });

  it("would be short of exactly its turns without the wound reference", () => {
    const link = belt_length_link(belt(2), elements_by_id(mech(belt(2))), mech(belt(2)))! as Extract<Link, { type: "BeltLength" }>;
    expect(gap(belt(2), { ...link, wraps: undefined })).toBeCloseTo(2 * 2 * Math.PI * 40, 3);
  });
});
