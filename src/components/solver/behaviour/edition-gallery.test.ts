import { describe, expect, it } from "vitest";
import coreXY from "../../../../test-mechanisms/Core XY.slidep?raw";
import huygens from "../../../../test-mechanisms/Huygen's chain drive.slidep?raw";
import jansen from "../../../../test-mechanisms/Jansen's linkage.slidep?raw";
import pendulum from "../../../../test-mechanisms/Pendulum clock.slidep?raw";
import pince from "../../../../test-mechanisms/Pince.slidep?raw";
import vilbrequin from "../../../../test-mechanisms/Vilbrequin.slidep?raw";
import { load_mechanism } from "../../../utils/load-mechanism";
import { resolveGeometricConstraints } from "../kinematics/geometric-solver";
import { Point2 } from "../../../types/point2";
import { Action } from "../../../types/actions";

/**
 * The edition solve on real mechanisms: a sketch that needs nothing is left alone, and dragging any free node gives a finite answer that leaves the rest of the sketch close to where it was.
 */
const MECHANISMS: Record<string, string> = {
  "Core XY": coreXY,
  "Huygen's chain drive": huygens,
  "Jansen's linkage": jansen,
  "Pendulum clock": pendulum,
  Vilbrequin: vilbrequin,
};

const DRAG = new Point2(0.01, 0.007);

describe("edition solve on the gallery", () => {
  for (const [name, raw] of Object.entries(MECHANISMS)) {
    const mechanism = load_mechanism(JSON.parse(raw)).mechanism;
    const nodes = mechanism.mechanicalElements.filter(
      (el): el is Extract<typeof el, { position: Point2 }> =>
        "position" in el && !("isGrounded" in el && el.isGrounded),
    );

    it(`${name}: a solve with nothing to do moves nothing`, () => {
      const solved = resolveGeometricConstraints(mechanism, [], []).positions;
      for (const el of mechanism.mechanicalElements)
        if ("position" in el) expect(solved.get(el.id)!.distance_to(el.position)).toBeLessThan(1e-3);
    });

    it(`${name}: dragging any free node stays finite and local`, () => {
      for (const node of nodes) {
        const action = {
          type: "MoveNode",
          id: node.id,
          newPosition: node.position.add(DRAG),
          oldPosition: node.position,
        } as unknown as Action;
        const solved = resolveGeometricConstraints(mechanism, [action], [action]).positions;
        for (const [, p] of solved) {
          expect(Number.isFinite(p.x)).toBe(true);
          expect(Number.isFinite(p.y)).toBe(true);
        }
        // Nothing has to travel much further than the cursor did.
        for (const el of mechanism.mechanicalElements)
          if ("position" in el)
            expect(solved.get(el.id)!.distance_to(el.position)).toBeLessThan(20 * DRAG.length());
      }
    });
  }
});

/**
 * The two bottom gears of the Pince are grounded, meshed and tied by a 1:1 ratio, and their rim joins are tied by a horizontal constraint.
 * At constant radii, the right gear can only travel the circle around the left one.
 */
describe("Pince", () => {
  const mechanism = load_mechanism(JSON.parse(pince)).mechanism;
  const byEnd = (suffix: string) =>
    mechanism.mechanicalElements.find((el) => el.id.endsWith(suffix)) as Extract<
      (typeof mechanism.mechanicalElements)[number],
      { position: Point2 }
    >;
  const left = byEnd("b218");
  const right = byEnd("f22d");
  const near = byEnd("f3e2");
  const far = byEnd("23e5");
  const radius = (id: string) =>
    (mechanism.mechanicalElements.find((el) => el.id === id) as { radius: number }).radius;
  const drag = (id: string, target: Point2) => {
    const element = byEnd(id.slice(-4));
    const action = {
      type: "MoveNode",
      id,
      newPosition: target,
      oldPosition: element.position,
    } as unknown as Action;
    return resolveGeometricConstraints(mechanism, [action], [action]);
  };
  /** A point of the circle the right gear travels at constant radii, `angle` from where it stands. */
  const on_circle = (angle: number) => {
    const arm = right.position.sub(left.position);
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return left.position.add(new Point2(arm.x * c - arm.y * s, arm.x * s + arm.y * c));
  };

  // Moving the gear must turn the bar next to it, not the one across the drawing.
  it("moving the right gear along its circle is taken up by its own join, the far one not moving at all", () => {
    const target = on_circle(-0.04);
    const solved = drag(right.id, target);
    expect(solved.positions.get(right.id)!.distance_to(target)).toBeLessThan(1e-9);
    expect(solved.positions.get(far.id)!.equals(far.position)).toBe(true);
    expect(solved.positions.get(near.id)!.distance_to(near.position)).toBeGreaterThan(0.005);
    expect(solved.radii.get(right.id)).toBe(radius(right.id));
    expect(solved.radii.get(left.id)).toBe(radius(left.id));
  });

  for (const [name, suffix] of [
    ["the gear", "f22d"],
    ["its axle", "dfe4"],
  ] as const)
    it(`pulling ${name} away grows both radii rather than blocking`, () => {
      const target = right.position.add(new Point2(0.02, 0));
      const solved = drag(byEnd(suffix).id, target);
      const at = solved.positions.get(right.id)!;
      expect(at.distance_to(target)).toBeLessThan(1e-6);
      const r1 = solved.radii.get(left.id)!;
      const r2 = solved.radii.get(right.id)!;
      expect(Math.abs(r1 - r2)).toBeLessThan(1e-6);
      expect(Math.abs(r1 + r2 - at.distance_to(left.position))).toBeLessThan(1e-6);
      expect(r2).toBeGreaterThan(radius(right.id) + 0.005);
    });

  // Straight down leaves the circle by 2e-4: the radii grow by just that, and the far join moves no more than they make it.
  it("a move just off the circle is held, resizing the gears by only what it takes", () => {
    const target = right.position.add(new Point2(0, -0.01));
    const solved = drag(right.id, target);
    expect(solved.positions.get(right.id)!.distance_to(target)).toBeLessThan(1e-6);
    const grown = solved.radii.get(right.id)! - radius(right.id);
    expect(grown).toBeGreaterThan(0);
    expect(grown).toBeLessThan(2e-4);
    expect(solved.positions.get(far.id)!.distance_to(far.position)).toBeLessThan(4e-4);
  });
});
