import { describe, expect, it } from "vitest";
import { attach_gear_to_belt } from "./connect-actions";
import { apply_actions } from "./apply-actions";
import { actionReducer } from "./action-reducer";
import { validate_mechanism } from "../../utils/validate-mechanism";
import { Point2 } from "../../types/point2";
import { DEFAULT_METADATA, Mechanism } from "../../types/mechanism";
import type { BeltElement, GearElement, ID, MechanicalElement } from "../../types";

const P = (x: number, y: number) => new Point2(x, y);
const id = (s: string) => s as ID;

const gear = (
  gid: string,
  axle: string,
  x: number,
  belt: string,
): GearElement => ({
  type: "gear",
  id: id(gid),
  probes: [],
  overlays: {},
  position: P(x, 0),
  angle: 0,
  radius: 30,
  parentAxleID: id(axle),
  fixedNodesBodyIDs: [],
  meshedGearsIDs: [],
  attachedBeltID: id(belt),
});

const axle = (aid: string, gid: string, x: number): MechanicalElement => ({
  type: "pivot",
  id: id(aid),
  probes: [],
  overlays: {},
  position: P(x, 0),
  isGrounded: false,
  rotatingEdgesIDs: [],
  fixedGearsIDs: [id(gid)],
  motor: undefined,
});

const belt = (bid: string, gears: string[], y: number): BeltElement => ({
  type: "belt",
  id: id(bid),
  probes: [],
  overlays: {},
  positionStart: P(-300, y),
  positionEnd: P(300, y),
  fixedNodeStartID: undefined,
  fixedNodeEndID: undefined,
  attachedGearsIDs: gears.map((g) => ({ id: id(g), direction: false })),
  closed: false,
});

/** Belt b1 over [g1, g2]; belt b2 over [g3]. g2 is about to be stolen by b2. */
function two_belts(): MechanicalElement[] {
  return [
    axle("ax1", "g1", -100),
    gear("g1", "ax1", -100, "b1"),
    axle("ax2", "g2", 100),
    gear("g2", "ax2", 100, "b1"),
    belt("b1", ["g1", "g2"], 0),
    axle("ax3", "g3", 0),
    { ...gear("g3", "ax3", 0, "b2"), position: P(0, 400) },
    belt("b2", ["g3"], 400),
  ];
}

function mechanism(mels: MechanicalElement[]): Mechanism {
  return {
    metadata: DEFAULT_METADATA,
    viewport: { zoom: 1, pan: P(0, 0) },
    mechanicalElements: mels,
    constraintElements: [],
    loads: [],
    history: [],
    future: [],
  };
}

const beltOf = (m: Mechanism, bid: string) =>
  m.mechanicalElements.find((e): e is BeltElement => e.id === id(bid))!;
const gearOf = (m: Mechanism, gid: string) =>
  m.mechanicalElements.find((e): e is GearElement => e.id === id(gid))!;

describe("attach_gear_to_belt evicts a prior belt", () => {
  const mels = two_belts();
  const g2 = gearOf(mechanism(mels), "g2");
  const b2 = beltOf(mechanism(mels), "b2");
  const actions = attach_gear_to_belt(
    g2.id,
    g2.position,
    b2,
    0,
    mels,
    "belt-onto-gear",
  );
  const forward = apply_actions(mechanism(two_belts()), actions, "Connects");

  it("the previous belt lets go of the gear, on both sides", () => {
    expect(beltOf(forward, "b1").attachedGearsIDs.map((g) => g.id)).toEqual([
      id("g1"),
    ]);
    expect(gearOf(forward, "g2").attachedBeltID).toBe(id("b2"));
    expect(validate_mechanism(forward)).toBeNull();
  });

  it("undo restores the gear on the previous belt, on both sides", () => {
    const bundle = forward.history[forward.history.length - 1];
    const undone = actionReducer(forward, [...bundle].reverse(), true);
    expect(beltOf(undone, "b1").attachedGearsIDs.map((g) => g.id)).toEqual([
      id("g1"),
      id("g2"),
    ]);
    expect(gearOf(undone, "g2").attachedBeltID).toBe(id("b1"));
    expect(validate_mechanism(undone)).toBeNull();
  });
});
