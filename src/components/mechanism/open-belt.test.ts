import { describe, expect, it } from "vitest";
import { open_belt, delete_element } from "./connect-actions";
import { apply_actions } from "./apply-actions";
import { validate_mechanism } from "../../utils/validate-mechanism";
import { Point2 } from "../../types/point2";
import { DEFAULT_METADATA, Mechanism } from "../../types/mechanism";
import type { BeltElement, ID, MechanicalElement } from "../../types";

const P = (x: number, y: number) => new Point2(x, y);
const id = (s: string) => s as ID;

const BELT = id("blt");
const JOIN = id("j1");
const G1 = id("g1");
const G2 = id("g2");
const AX1 = id("ax1");
const AX2 = id("ax2");

const belt = (over: Partial<BeltElement> = {}): BeltElement => ({
  type: "belt",
  id: BELT,
  probes: [],
  overlays: {},
  positionStart: P(0, 0),
  positionEnd: P(0, 0),
  fixedNodeStartID: JOIN,
  fixedNodeEndID: JOIN,
  attachedGearsIDs: [
    { id: G1, direction: false },
    { id: G2, direction: false },
  ],
  closed: true,
  ...over,
});

describe("open_belt", () => {
  it("frees the start and clears the flag when a junction still fuses both ends", () => {
    expect(open_belt(belt())).toEqual([
      {
        type: "ConnectsFixedNodeStart",
        disconnect: true,
        elementID: BELT,
        connectID: JOIN,
      },
      { type: "CloseBelt", id: BELT, closed: false },
    ]);
  });

  it("only clears the flag when the ends are already free of a junction", () => {
    const freed = belt({
      fixedNodeStartID: undefined,
      fixedNodeEndID: undefined,
    });
    expect(open_belt(freed)).toEqual([
      { type: "CloseBelt", id: BELT, closed: false },
    ]);
  });

  it("treats two different junctions as no junction to free", () => {
    const split = belt({ fixedNodeEndID: id("j2") });
    expect(open_belt(split)).toEqual([
      { type: "CloseBelt", id: BELT, closed: false },
    ]);
  });
});

/** A coherent closed belt over two pulleys, junction holding both terminals. */
function closed_belt(): MechanicalElement[] {
  const gear = (gid: ID, axle: ID, x: number): MechanicalElement => ({
    type: "gear",
    id: gid,
    probes: [],
    overlays: {},
    position: P(x, 0),
    angle: 0,
    radius: 30,
    parentAxleID: axle,
    fixedNodesBodyIDs: [],
    meshedGearsIDs: [],
    attachedBeltID: BELT,
  });
  const axle = (aid: ID, gid: ID, x: number): MechanicalElement => ({
    type: "pivot",
    id: aid,
    probes: [],
    overlays: {},
    position: P(x, 0),
    isGrounded: false,
    rotatingEdgesIDs: [],
    fixedGearsIDs: [gid],
    motor: undefined,
  });
  return [
    axle(AX1, G1, 0),
    gear(G1, AX1, 0),
    axle(AX2, G2, 200),
    gear(G2, AX2, 200),
    {
      type: "join",
      id: JOIN,
      probes: [],
      overlays: {},
      position: P(0, 0),
      isGrounded: false,
      fixedEdgesIDs: [BELT],
    },
    belt(),
  ];
}

function mechanism(mechanicalElements: MechanicalElement[]): Mechanism {
  return {
    metadata: DEFAULT_METADATA,
    viewport: { zoom: 1, pan: P(0, 0) },
    mechanicalElements,
    constraintElements: [],
    loads: [],
    history: [],
    future: [],
  };
}

describe("apply_actions opens a belt whose loop the bundle breaks", () => {
  // Deleting the junction node leaves the belt closed with nothing holding its
  // ends — the correction must open it so the mechanism stays valid.
  it("opens the belt when its junction node is deleted", () => {
    const mech = mechanism(closed_belt());
    const actions = delete_element(JOIN, mech.mechanicalElements, [], []);
    const result = apply_actions(mech, actions, "Connects");

    const openedBelt = result.mechanicalElements.find(
      (el): el is BeltElement => el.type === "belt",
    );
    expect(openedBelt?.closed).toBe(false);
    expect(validate_mechanism(result)).toBeNull();
  });

  // Cases 2 & 3: disconnecting a closed belt from its junction (from either
  // panel side) runs open_belt. The junction must keep the other terminal.
  it("keeps the belt attached to its junction by one end when opened", () => {
    const mech = mechanism(closed_belt());
    const beltEl = mech.mechanicalElements.find(
      (el): el is BeltElement => el.type === "belt",
    )!;
    const result = apply_actions(mech, open_belt(beltEl), "Connects");

    const opened = result.mechanicalElements.find(
      (el): el is BeltElement => el.type === "belt",
    )!;
    expect(opened.closed).toBe(false);
    const stillOnJoin = [opened.fixedNodeStartID, opened.fixedNodeEndID].filter(
      (nodeID) => nodeID === JOIN,
    );
    expect(stillOnJoin).toEqual([JOIN]);

    const join = result.mechanicalElements.find((el) => el.id === JOIN);
    expect(join && "fixedEdgesIDs" in join && join.fixedEdgesIDs).toContain(
      BELT,
    );
    expect(validate_mechanism(result)).toBeNull();
  });

  it("leaves a still-looped belt untouched", () => {
    const mech = mechanism(closed_belt());
    // A no-op disconnect that breaks no loop: nothing to correct.
    const result = apply_actions(mech, [{ type: "Blank" }], "Other");
    const stillClosed = result.mechanicalElements.find(
      (el): el is BeltElement => el.type === "belt",
    );
    expect(stillClosed?.closed).toBe(true);
  });
});
