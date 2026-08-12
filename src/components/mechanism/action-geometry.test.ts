import { describe, expect, it } from "vitest";
import { bundle_geometry, continues_previous_gesture } from "./action-geometry";
import type { Action, ID } from "../../types";
import { Point2 } from "../../types/point2";

const id = (n: number): ID =>
  `00000000-0000-0000-0000-${String(n).padStart(12, "0")}` as ID;

const A = id(1);
const B = id(2);

const move_node = (overrides: Partial<Extract<Action, { type: "MoveNode" }>> = {}) =>
  ({
    type: "MoveNode",
    id: A,
    newPosition: new Point2(1, 0),
    oldPosition: new Point2(0, 0),
    ...overrides,
  }) as Action;

describe("bundle_geometry", () => {
  it("solves before the bundle for a drag, taking it as the trigger", () => {
    const drag = move_node();
    expect(bundle_geometry([drag])).toEqual({ solve: "before", trigger: drag });
  });

  it("solves after the bundle for a value it merely reads back, with no trigger", () => {
    const connect: Action = {
      type: "ConnectsFixedNodeStart",
      disconnect: false,
      elementID: A,
      connectID: B,
    };
    expect(bundle_geometry([connect])).toEqual({ solve: "after" });
  });

  it("does not solve for a load creation: a force rides its host, it does not constrain it", () => {
    const create: Action = {
      type: "CreateElement",
      element: {
        type: "force",
        id: A,
        targetID: B,
        anchor: 0,
        vector: new Point2(1, 0),
      } as never,
    };
    expect(bundle_geometry([create])).toEqual({ solve: "none" });
  });

  // The bug the table exists to make impossible: a gear dropped onto a belt
  // mid-route attaches via `ConnectsAttachedGears`, created alongside the gear
  // and its axle. Naming that bundle "Other" by hand (as the old dispatch did)
  // skipped the solve the junction needs — here it is derived instead.
  it("solves after a bundle that creates a mechanical element and connects it", () => {
    const createGear: Action = {
      type: "CreateElement",
      element: { type: "gear" } as never,
    };
    const attach: Action = {
      type: "ConnectsAttachedGears",
      disconnect: false,
      elementID: A,
      connectID: B,
      index: 0,
      clockwise: true,
    };
    expect(bundle_geometry([createGear, attach])).toEqual({ solve: "after" });
  });

  it("lets the trigger's own timing settle a mixed bundle, a drag that also fuses two edges", () => {
    const drag = move_node();
    const fusion: Action = {
      type: "ConnectsFixedNodeStart",
      disconnect: false,
      elementID: A,
      connectID: B,
    };
    const deleted: Action = {
      type: "DeleteElement",
      element: { type: "spring" } as never,
    };
    expect(bundle_geometry([drag, fusion, deleted])).toEqual({
      solve: "before",
      trigger: drag,
    });
  });

  it("does nothing for a bundle with no geometric meaning", () => {
    const rename: Action = { type: "UpdateElementName", id: A, newName: "x" };
    expect(bundle_geometry([rename])).toEqual({ solve: "none" });
  });
});

describe("continues_previous_gesture", () => {
  it("continues for an uncommitted drag frame", () => {
    expect(continues_previous_gesture([move_node({ committed: false })])).toBe(
      true,
    );
  });

  it("starts a new entry for a committed (typed) value, even of a coalescing type", () => {
    expect(continues_previous_gesture([move_node({ committed: true })])).toBe(
      false,
    );
  });

  it("starts a new entry for a bundle with no gesture to continue", () => {
    const attach: Action = {
      type: "ConnectsFixedNodeStart",
      disconnect: false,
      elementID: A,
      connectID: B,
    };
    expect(continues_previous_gesture([attach])).toBe(false);
  });
});
