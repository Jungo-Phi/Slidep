import { describe, expect, it } from "vitest";
import { Point2 } from "../../../types/point2";
import type { Link } from "../../../types";
import { PBD_kinematic_solver } from "../kinematics/PBD_kinematic_solver";

/**
 * `MinDistanceToLine` is `MinDistanceToSegment`'s counterpart for an infinite line (the floor) instead of a bounded segment — no `side`, no clamp, no corner case.
 */

const P = (x: number, y: number) => new Point2(x, y);
const SWEEPS = 200;

/** A point pulled (via HandleGrab) from `from` toward `pullTo`, against a fixed line
 * through (`anchorX`, 0) with normal (0,1) — "up" is the allowed side — with or without the contact link.
 * Returns where the point ends up. */
function pull_against_line(
  offset: number | undefined,
  from: Point2,
  pullTo: Point2,
  anchorX: number = 0,
): Point2 {
  const positions = new Map([
    ["anchor", P(anchorX, 0)],
    ["node", from],
  ]);
  const links: Link[] = [
    { type: "HandleGrab", ddl: 1, grabbedKey: "node", value: pullTo },
  ];
  if (offset !== undefined)
    links.unshift({
      type: "MinDistanceToLine",
      ddl: 0,
      key1: "anchor",
      key3: "node",
      normal: P(0, 1),
      offset,
    });
  PBD_kinematic_solver(
    positions,
    new Map(),
    new Map([
      ["anchor", 0],
      ["node", 1],
    ]),
    new Map(),
    links,
    SWEEPS,
    undefined,
    undefined,
    false,
    "constraints",
  );
  return positions.get("node")!;
}

describe("MinDistanceToLine", () => {
  it("laisse un point hors de portée intact", () => {
    const stopped = pull_against_line(5, P(50, 20), P(50, 15));
    expect(stopped.distance_to(P(50, 15))).toBeLessThan(0.5);
  });

  it("arrête un point tiré dans la bande de contact à `offset` de la ligne", () => {
    const stopped = pull_against_line(5, P(50, 20), P(50, 2));
    expect(stopped.y).toBeCloseTo(5, 1);
  });

  it("bloque même un saut d'un seul coup qui traverserait toute la bande", () => {
    const stopped = pull_against_line(5, P(50, 20), P(50, -200));
    expect(stopped.y).toBeCloseTo(5, 0);
  });

  it("sans la contrainte, le point atteint sa cible", () => {
    const reached = pull_against_line(undefined, P(50, 20), P(50, 2));
    expect(reached.distance_to(P(50, 2))).toBeLessThan(0.5);
  });

  it("n'a pas d'extrémités : bloque tout aussi loin le long de la ligne", () => {
    const stopped = pull_against_line(5, P(100_000, 20), P(100_000, 2));
    expect(stopped.y).toBeCloseTo(5, 1);
  });

  it("l'ancre, invMass 0, ne bouge jamais", () => {
    const positions = new Map([
      ["anchor", P(0, 0)],
      ["node", P(50, 20)],
    ]);
    const links: Link[] = [
      { type: "MinDistanceToLine", ddl: 0, key1: "anchor", key3: "node", normal: P(0, 1), offset: 5 },
      { type: "HandleGrab", ddl: 1, grabbedKey: "node", value: P(50, -200) },
    ];
    PBD_kinematic_solver(
      positions,
      new Map(),
      new Map([
        ["anchor", 0],
        ["node", 1],
      ]),
      new Map(),
      links,
      SWEEPS,
      undefined,
      undefined,
      false,
      "constraints",
    );
    expect(positions.get("anchor")!.distance_to(P(0, 0))).toBeLessThan(1e-6);
  });
});
