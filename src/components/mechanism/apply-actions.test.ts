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

const mass: MassElement = {
  type: "mass",
  id: MASS,
  probes: [],
  overlays: {},
  position: P(0, 0),
  isGrounded: false,
  fixedEdgesIDs: [],
  mass: 1,
};

const node: PivotElement = {
  type: "pivot",
  id: NODE,
  probes: [],
  overlays: {},
  position: P(0, 0),
  isGrounded: true,
  rotatingEdgesIDs: [],
  fixedGearsIDs: [],
  rotationalFriction: 0,
};

const mechanism = (): Mechanism => ({
  metadata: DEFAULT_METADATA,
  viewport: { scale: 1, pan: ZERO },
  mechanicalElements: [mass, node],
  constraintElements: [],
  loads: [],
  history: [],
  future: [],
});

describe("apply_actions — no-op edits do not enter the history", () => {
  it("does not record a value-only edit with a zero delta", () => {
    const after = apply_actions(mechanism(), [
      { type: "ChangeMass", id: MASS, delta: 0 },
    ]);
    expect(after.history).toHaveLength(0);
  });

  it("still records a real value-only edit", () => {
    const after = apply_actions(mechanism(), [
      { type: "ChangeMass", id: MASS, delta: 2 },
    ]);
    expect(after.history).toHaveLength(1);
  });

  // A coalescing value edit (e.g. holding the stepper button) has no "end of
  // gesture" signal the way a canvas drag has the mouse-up Blank — nothing
  // calls apply_actions again to notice the cancellation on its own. It is
  // cleaned up lazily instead: the next unrelated edit finds it stale, once
  // nothing will ever merge into it again, and drops it before recording
  // itself.
  it("keeps a cancelled-out entry until the next unrelated edit sweeps it away", () => {
    const mech = mechanism();
    const grown = apply_actions(mech, [
      { type: "ChangeMass", id: MASS, delta: 2 },
    ]);
    expect(grown.history).toHaveLength(1);
    const settled = apply_actions(grown, [
      { type: "ChangeMass", id: MASS, delta: -2 },
    ]);
    expect(settled.history).toHaveLength(1);

    const swept = apply_actions(settled, [
      { type: "ChangeStiffness", id: MASS, delta: 3 },
    ]);
    expect(swept.history).toHaveLength(1);
    expect(swept.history[0]).toEqual([
      { type: "ChangeStiffness", id: MASS, delta: 3 },
    ]);
  });

  it("collapses a drag that ends exactly where it started, sealed by the mouse-up Blank", () => {
    let mech = mechanism();
    // Frame 1: grab and move away.
    mech = apply_actions(mech, [
      {
        type: "MoveNode",
        id: NODE,
        newPosition: P(50, 0),
        oldPosition: P(0, 0),
      },
    ]);
    expect(mech.history).toHaveLength(1);
    // Frame 2: back to the exact starting point.
    mech = apply_actions(mech, [
      {
        type: "MoveNode",
        id: NODE,
        newPosition: P(0, 0),
        oldPosition: P(50, 0),
      },
    ]);
    // Mouse-up: nothing to connect to.
    mech = apply_actions(mech, [{ type: "Blank" }]);
    expect(mech.history).toHaveLength(0);
  });

  it("keeps a drag that ends somewhere new, sealed by the same Blank", () => {
    let mech = mechanism();
    mech = apply_actions(mech, [
      {
        type: "MoveNode",
        id: NODE,
        newPosition: P(50, 0),
        oldPosition: P(0, 0),
      },
    ]);
    mech = apply_actions(mech, [{ type: "Blank" }]);
    expect(mech.history).toHaveLength(1);
    const entry = mech.history[0];
    expect(entry[entry.length - 1]).toEqual({ type: "Blank" });
  });
});
