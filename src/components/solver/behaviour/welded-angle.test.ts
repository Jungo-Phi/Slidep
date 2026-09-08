import { describe, expect, it } from "vitest";
import { Point2 } from "../../../types";
import { applyAngleConstraint } from "../../../test/constraint-map-api";

/**
 * An `Angle` link between two beams welded end to start: its four keys are only three nodes, the middle one standing for both `key2` and `key3`.
 * Measured on the gallery (`Double Cantilever.slidep`, `Double Cantilever bis.slidep`), that is the only place a link's own keys collide today — but nothing forbids `Normal`, `Parallel` or `EqualLength` from the same, and they share the projection tested here.
 *
 * The shared node's gradient is the SUM of the two it carries, one per segment.
 * Written per key instead, the second write overwrites the first, and the correction stops being `λ·wᵢ·∇ᵢC` on that node — which is what the assertions below are really about.
 */
describe("un angle dont deux clés sont le même nœud", () => {
  /** Two unit segments meeting at `mid`, currently straight, asked to fold by `target`. */
  const fold = (target: number, anchorA: boolean) => {
    const positions = new Map([
      ["a", new Point2(0, 0)],
      ["mid", new Point2(1, 0)],
      ["b", new Point2(2, 0)],
    ]);
    const before = new Map(positions);
    const residual = applyAngleConstraint(
      positions,
      new Map([
        ["a", anchorA ? 0 : 1],
        ["mid", 1],
        ["b", 1],
      ]),
      "a",
      "mid",
      "mid",
      "b",
      false,
      false,
      false,
      target,
    );
    const shift = (key: string) => positions.get(key)!.sub(before.get(key)!);
    const v1 = positions.get("mid")!.sub(positions.get("a")!);
    const v2 = positions.get("b")!.sub(positions.get("mid")!);
    return { residual, angle: v1.angle_to(v2), shift };
  };

  it("ne déplace pas le centre de masse", () => {
    const { residual, angle, shift } = fold(0.2, false);
    const net = shift("a").add(shift("mid")).add(shift("b"));

    expect(residual).toBeCloseTo(0.2, 6);
    expect(angle).toBeCloseTo(0.2, 2);
    // Equal masses, nothing anchored: an angle is internal to the chain, so its projection may turn the chain but never push it.
    // Half the shared node's correction going missing leaves exactly that push behind — measured at a quarter of the correction itself.
    expect(net.length()).toBeLessThan(1e-12);
  });

  it("laisse en place le nœud ancré, et lui seul", () => {
    const { angle, shift } = fold(0.2, true);

    expect(angle).toBeCloseTo(0.2, 2);
    expect(shift("a").length()).toBe(0);
    expect(shift("mid").length()).toBeGreaterThan(0);
    expect(shift("b").length()).toBeGreaterThan(0);
  });
});
