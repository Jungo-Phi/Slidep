import { describe, expect, it } from "vitest";
import { Link, Point2 } from "../../../types";
import { sort_links } from "../utils";
import { PBD_kinematic_solver } from "../kinematics/PBD_kinematic_solver";

/**
 * A grab reaches its target in the one solve that asks for it, wherever the mechanism lets it.
 * An edition drag snapped onto the grid asks once and then holds still: no later frame catches up what this solve leaves short.
 */

const P = (x: number, y: number) => new Point2(x, y);

/** Where `key` ends up, a solve after being grabbed toward `target`. */
function grabbed_to(
  points: [string, Point2, number][],
  links: Link[],
  key: string,
  target: Point2,
): Point2 {
  const positions = new Map(points.map(([k, p]) => [k, p]));
  const masses = new Map(points.map(([k, , w]) => [k, w]));
  const all: Link[] = [...links, { type: "HandleGrab", ddl: 1, grabbedKey: key, value: target }];
  const solved = PBD_kinematic_solver(positions, new Map(), masses, new Map(), sort_links(all, masses), 300, undefined, undefined, false, "constraints");
  return solved.positions.get(key)!;
}

const bar = (key1: string, key2: string): Link => ({ type: "Distance", ddl: 1, key1, key2, distance: 1 });

describe("a grab reaches its target in a single solve", () => {
  it("on a free beam", () => {
    const target = P(-0.03, 0.04);
    const end = grabbed_to([["a", P(0, 0), 1], ["b", P(1, 0), 1]], [bar("a", "b")], "a", target);
    expect(end.distance_to(target)).toBeLessThan(1e-5);
  });

  it("at the end of a two-bar chain", () => {
    const target = P(1.95, 0.3);
    const end = grabbed_to(
      [["o", P(0, 0), 0], ["a", P(1, 0), 1], ["b", P(2, 0), 1]],
      [bar("o", "a"), bar("a", "b")],
      "b",
      target,
    );
    expect(end.distance_to(target)).toBeLessThan(1e-4);
  });

  // Out of reach, it stops as near as the mechanism allows instead of tearing it.
  it("on a pendulum, aimed off its circle", () => {
    const target = P(1, 0.05);
    const end = grabbed_to([["o", P(0, 0), 0], ["a", P(1, 0), 1]], [bar("o", "a")], "a", target);
    expect(end.length()).toBeCloseTo(1, 5);
    expect(end.distance_to(target)).toBeCloseTo(target.length() - 1, 5);
  });
});
