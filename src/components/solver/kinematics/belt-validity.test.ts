import { describe, expect, it } from "vitest";
import { Link } from "../../../types";
import { Point2 } from "../../../types/point2";
import { solveNodesFromMaps } from "../nodes";
import { applyBeltValidityContacts } from "./belt-validity";
import { resolve_slots } from "./link-slots";

type Belt = Extract<Link, { type: "BeltLength" }>;

/** A closed belt over the given pulleys, every node free and of unit mass. */
function rig(pulleys: { key: string; at: Point2; r: number; cw: boolean }[]) {
  const positions = new Map(pulleys.map((p) => [p.key, p.at]));
  const belt: Belt = {
    type: "BeltLength",
    ddl: 1,
    startKey: "",
    endKey: "",
    gearPosKeys: pulleys.map((p) => p.key),
    gearAngleKeys: pulleys.map((p) => p.key),
    radii: pulleys.map((p) => p.r),
    directions: pulleys.map((p) => p.cw),
    length: 1,
    closed: true,
  };
  const nodes = solveNodesFromMaps(positions, new Map(pulleys.map((p) => [p.key, 1])), new Map(), new Map(), new Map());
  const slots = resolve_slots([belt], nodes)[0];
  const at = (key: string) => {
    const i = nodes.index.get(key)!;
    return new Point2(nodes.x[i], nodes.y[i]);
  };
  const apply = (times = 1) => {
    for (let k = 0; k < times; k++) applyBeltValidityContacts(nodes, slots, belt);
  };
  return { at, apply };
}

describe("contacts de validité de la courroie", () => {
  it("écarte deux poulies voisines dont le brin croisé disparaîtrait", () => {
    const { at, apply } = rig([
      { key: "a", at: new Point2(0, 0), r: 0.2, cw: true },
      { key: "b", at: new Point2(0.25, 0), r: 0.1, cw: false },
    ]);
    apply();
    expect(at("a").distance_to(at("b"))).toBeGreaterThanOrEqual(0.3);
  });

  it("laisse se chevaucher deux poulies dont le brin droit existe encore", () => {
    const { at, apply } = rig([
      { key: "a", at: new Point2(0, 0), r: 0.2, cw: false },
      { key: "b", at: new Point2(0.15, 0), r: 0.1, cw: false },
    ]);
    apply();
    expect(at("a").distance_to(at("b"))).toBeCloseTo(0.15, 12);
  });

  it("sort une poulie avalée par sa voisine sur un brin droit", () => {
    const { at, apply } = rig([
      { key: "a", at: new Point2(0, 0), r: 0.2, cw: false },
      { key: "b", at: new Point2(0.05, 0), r: 0.1, cw: false },
    ]);
    apply();
    expect(at("a").distance_to(at("b"))).toBeGreaterThanOrEqual(0.1);
  });
});
