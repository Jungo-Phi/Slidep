import { describe, it, expect } from "vitest";
import { apply_actions } from "./apply-actions";
import {
  DEFAULT_METADATA,
  DEFAULT_SIMULATION,
  Mechanism,
} from "../../types/mechanism";
import { Point2 } from "../../types/point2";
import { Action, ID, SpringElement } from "../../types";

const id = (s: string) => `00000000-0000-0000-0000-${s.padStart(12, "0")}` as ID;
const SPRING_ID = id("spring1");

const SPRING: SpringElement = {
  type: "spring",
  id: SPRING_ID,
  probes: [],
  overlays: {},
  positionStart: new Point2(0, 0),
  positionEnd: new Point2(1, 0),
  fixedNodeStartID: undefined,
  fixedNodeEndID: undefined,
  stiffness: 1,
};

function mechanism(restLength?: number): Mechanism {
  return {
    metadata: DEFAULT_METADATA,
    viewport: { scale: 1, pan: new Point2(0, 0) },
    simulation: DEFAULT_SIMULATION,
    mechanicalElements: [{ ...SPRING, restLength }],
    constraintElements: [],
    loads: [],
    materials: [],
    profiles: [],
    history: [],
    future: [],
  };
}

const setRestLength = (newValue?: number, oldValue?: number): Action => ({
  type: "UpdateElementRestLength",
  id: SPRING_ID,
  newValue,
  oldValue,
});

const SEAL: Action = { type: "Blank" };

/** What a Ctrl+Z on the newest entry would restore, or `"nothing to undo"`. */
const undoes_to = (m: Mechanism) => {
  const entry = m.history[m.history.length - 1];
  if (!entry) return "nothing to undo";
  const master = entry.find((a) => a.type === "UpdateElementRestLength");
  return master?.type === "UpdateElementRestLength"
    ? master.oldValue
    : "nothing to undo";
};

describe("history coalescing of value edits", () => {
  it("folds a run of steps into one entry", () => {
    let m = mechanism(0.5);
    m = apply_actions(m, [setRestLength(0.6, 0.5)]);
    m = apply_actions(m, [setRestLength(0.7, 0.6)]);
    expect(m.history).toHaveLength(1);
    expect(undoes_to(m)).toBe(0.5);
  });

  it("drops a run that came back to where it started", () => {
    let m = mechanism(0.5);
    m = apply_actions(m, [setRestLength(0.6, 0.5)]);
    m = apply_actions(m, [setRestLength(0.5, 0.6)]);
    expect(m.history).toHaveLength(0);
  });

  it("records nothing for a seal that has no entry to close", () => {
    const m = apply_actions(mechanism(0.5), [SEAL]);
    expect(m.history).toHaveLength(0);
  });

  it("keeps a sealed edit and the next one apart", () => {
    let m = mechanism(0.5);
    m = apply_actions(m, [setRestLength(0.6, 0.5)]);
    m = apply_actions(m, [SEAL]);
    m = apply_actions(m, [setRestLength(0.7, 0.6)]);
    expect(m.history).toHaveLength(2);
    expect(undoes_to(m)).toBe(0.6);
  });

  it("undoes a rest length reset back to the value it replaced", () => {
    let m = mechanism();
    m = apply_actions(m, [setRestLength(0.5, undefined)]);
    m = apply_actions(m, [SEAL]);
    m = apply_actions(m, [setRestLength(undefined, 0.5)]);
    expect(m.history).toHaveLength(2);
    expect(undoes_to(m)).toBe(0.5);
    expect((m.mechanicalElements[0] as SpringElement).restLength).toBeUndefined();
  });
});
