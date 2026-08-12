import { describe, expect, it } from "vitest";
import { is_noop_action, is_noop_entry } from "./no-op-action";
import type { Action, ID } from "../../types";
import { Point2 } from "../../types/point2";

const id = (n: number): ID =>
  `00000000-0000-0000-0000-${String(n).padStart(12, "0")}` as ID;

const A = id(1);

describe("is_noop_action", () => {
  it("is a no-op when a drag ends where it started", () => {
    const action: Action = {
      type: "MoveNode",
      id: A,
      newPosition: new Point2(5, 5),
      oldPosition: new Point2(5, 5),
    };
    expect(is_noop_action(action)).toBe(true);
  });

  it("is not a no-op when the position actually moved", () => {
    const action: Action = {
      type: "MoveNode",
      id: A,
      newPosition: new Point2(5, 6),
      oldPosition: new Point2(5, 5),
    };
    expect(is_noop_action(action)).toBe(false);
  });

  it("is a no-op for a zero accumulated delta", () => {
    const action: Action = { type: "ChangeMass", id: A, delta: 0 };
    expect(is_noop_action(action)).toBe(true);
  });

  it("is a no-op for a typed value equal to the current one", () => {
    const action: Action = {
      type: "ChangeDimensionEdgeValue",
      id: A,
      newValue: 100,
      oldValue: 100,
    };
    expect(is_noop_action(action)).toBe(true);
  });

  it("never treats a connection as a no-op, having no comparable pair", () => {
    const action: Action = {
      type: "ConnectsFixedNodeStart",
      disconnect: false,
      elementID: A,
      connectID: A,
    };
    expect(is_noop_action(action)).toBe(false);
  });
});

describe("is_noop_entry", () => {
  it("reads a bare value action directly", () => {
    const entry: Action[] = [{ type: "ChangeMass", id: A, delta: 0 }];
    expect(is_noop_entry(entry)).toBe(true);
  });

  it("reads the master action paired with its UpdatePositionsToValidState", () => {
    const move: Action = {
      type: "MoveNode",
      id: A,
      newPosition: new Point2(1, 1),
      oldPosition: new Point2(1, 1),
    };
    const entry: Action[] = [
      move,
      {
        type: "UpdatePositionsToValidState",
        masterActionType: "MoveNode",
        newNodes: { positions: new Map(), radii: new Map(), posMasses: new Map(), radMasses: new Map() },
        oldNodes: { positions: new Map(), radii: new Map(), posMasses: new Map(), radMasses: new Map() },
      },
    ];
    expect(is_noop_entry(entry)).toBe(true);
  });

  // A dimension typed right after placing the element folds into the creation's
  // entry (see apply_actions): dropping that entry for a no-op value would
  // discard the element creation along with it, so it must be left alone.
  it("leaves a creation folded with a dimension edit alone, even if the value is a no-op", () => {
    const entry: Action[] = [
      { type: "CreateElement", element: { type: "join" } as never },
      { type: "ChangeDimensionEdgeValue", id: A, newValue: 0, oldValue: 0 },
    ];
    expect(is_noop_entry(entry)).toBe(false);
  });

  it("leaves an already-sealed entry alone", () => {
    const entry: Action[] = [
      { type: "ChangeForce", id: A, newVector: new Point2(0, 0), oldVector: new Point2(0, 0) },
      { type: "Blank" },
    ];
    expect(is_noop_entry(entry)).toBe(false);
  });

  it("is false for an empty history", () => {
    expect(is_noop_entry(undefined)).toBe(false);
  });
});
