import { describe, expect, it } from "vitest";
import { apply_actions } from "./apply-actions";
import { Point2, ZERO } from "../../types/point2";
import { DEFAULT_METADATA, Mechanism } from "../../types/mechanism";
import type { ID, MassElement, PivotElement } from "../../types";

const id = (n: number): ID =>
  `00000000-0000-0000-0000-${String(n).padStart(12, "0")}` as ID;
const P = (x: number, y: number) => new Point2(x, y);
const MASS = id(1);
const NODE = id(2);

const mechanism = (): Mechanism => ({
  metadata: DEFAULT_METADATA,
  viewport: { scale: 1, pan: ZERO },
  mechanicalElements: [
    {
      type: "mass",
      id: MASS,
      probes: [],
      overlays: {},
      position: P(0, 0),
      isGrounded: false,
      fixedEdgesIDs: [],
      mass: 1,
    } as MassElement,
    {
      type: "pivot",
      id: NODE,
      probes: [],
      overlays: {},
      position: P(0, 0),
      isGrounded: true,
      rotatingEdgesIDs: [],
      fixedGearsIDs: [],
    } as PivotElement,
  ],
  constraintElements: [],
  loads: [],
  history: [],
  future: [],
});

/**
 * Mimics what React 18 StrictMode does to a `setState(prev => ...)` functional
 * updater in development: call it twice against the SAME `prev`, keep only the
 * second call's return value — exactly what App.tsx's `applyActions` is.
 */
function strictModeApply(
  prev: Mechanism,
  actions: Parameters<typeof apply_actions>[1],
): Mechanism {
  apply_actions(prev, actions);
  return apply_actions(prev, actions);
}

describe("apply_actions under StrictMode-style double invocation", () => {
  it("does not double the accumulated delta of a coalesced ChangeMass edit", () => {
    let mech = mechanism();
    mech = strictModeApply(mech, [{ type: "ChangeMass", id: MASS, delta: 2 }]);
    mech = strictModeApply(mech, [{ type: "ChangeMass", id: MASS, delta: 3 }]);

    expect((mech.history[0][0] as { delta: number }).delta).toBe(5);
    expect((mech.mechanicalElements[0] as MassElement).mass).toBeCloseTo(6);
  });

  it("does not append the mouse-up Blank twice", () => {
    let mech = mechanism();
    mech = strictModeApply(mech, [{ type: "ChangeMass", id: MASS, delta: 2 }]);
    mech = strictModeApply(mech, [{ type: "Blank" }]);

    expect(mech.history[0]).toHaveLength(2);
    expect(mech.history[0][1]).toEqual({ type: "Blank" });
  });

  it("does not corrupt a merged MoveNode drag either", () => {
    let mech = mechanism();
    mech = strictModeApply(mech, [
      { type: "MoveNode", id: NODE, newPosition: P(50, 0), oldPosition: P(0, 0) },
    ]);
    mech = strictModeApply(mech, [
      { type: "MoveNode", id: NODE, newPosition: P(80, 20), oldPosition: P(50, 0) },
    ]);
    mech = strictModeApply(mech, [{ type: "Blank" }]);

    expect(mech.history).toHaveLength(1);
    expect(mech.history[0]).toHaveLength(3);
    const master = mech.history[0][0] as { newPosition: Point2; oldPosition: Point2 };
    expect(master.newPosition.equals(P(80, 20))).toBe(true);
    expect(master.oldPosition.equals(P(0, 0))).toBe(true);
  });
});
