import { describe, expect, it } from "vitest";
import { is_structure_action, is_structure_bundle } from "./action-kind";
import { Action } from "../../types";
import { ForceElement, ID, MassElement } from "../../types/element";
import { ZERO } from "../../types/point2";

const id = (n: number): ID =>
  `00000000-0000-0000-0000-${String(n).padStart(12, "0")}` as ID;

const load: ForceElement = {
  type: "force",
  id: id(1),
  targetID: id(2),
  vector: ZERO,
  frame: "world",
};

const mass: MassElement = {
  type: "mass",
  id: id(3),
  position: ZERO,
  mass: 1,
  isGrounded: false,
  fixedEdgesIDs: [],
  probes: [],
  overlays: {},
};

/**
 * What a running simulation can absorb. The panel greys a control out from the same
 * verdict that decides whether an edit exits to edition, so the two cannot drift apart.
 */
describe("is_structure_action", () => {
  it("reads a creation from the element, not the action type", () => {
    // A load is an input, like a motor's speed; anything else is the model itself.
    expect(is_structure_action({ type: "CreateElement", element: load })).toBe(
      false,
    );
    expect(is_structure_action({ type: "DeleteElement", element: load })).toBe(
      false,
    );
    expect(is_structure_action({ type: "CreateElement", element: mass })).toBe(
      true,
    );
  });

  it("answers a bare type conservatively", () => {
    // A control names what it emits before it has an element to hand, so a creation it
    // cannot qualify locks — the safe way round.
    expect(is_structure_action("CreateElement")).toBe(true);
    expect(is_structure_action("DeleteElement")).toBe(true);
  });

  it("ignores the undo boundary marker", () => {
    expect(is_structure_action({ type: "Blank" })).toBe(false);
    expect(is_structure_bundle([{ type: "Blank" }])).toBe(false);
  });

  it("takes one structural action to make a bundle structural", () => {
    const bundle: Action[] = [
      {
        type: "SetMotorConfig",
        id: id(4),
        newConfig: undefined,
        oldConfig: undefined,
      },
      { type: "GroundNode", id: id(4), grounded: true },
    ];
    expect(is_structure_bundle(bundle)).toBe(true);
    expect(is_structure_bundle([bundle[0]])).toBe(false);
  });
});
