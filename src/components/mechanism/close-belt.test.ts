import { describe, expect, it } from "vitest";
import { close_belt_actions } from "./connect-actions";
import { apply_actions } from "./apply-actions";
import { validate_mechanism } from "../../utils/validate-mechanism";
import { Point2 } from "../../types/point2";
import { DEFAULT_METADATA, Mechanism } from "../../types/mechanism";
import type {
  BeltElement,
  ID,
  JoinElement,
  MechanicalElement,
} from "../../types";

const P = (x: number, y: number) => new Point2(x, y);
const id = (s: string) => s as ID;

const BELT = id("blt");
const J1 = id("j1");
const J2 = id("j2");

const join = (jid: ID, over: Partial<JoinElement> = {}): JoinElement => ({
  type: "join",
  id: jid,
  probes: [],
  overlays: {},
  position: P(0, 0),
  isGrounded: false,
  fixedEdgesIDs: [BELT],
  ...over,
});

const belt = (over: Partial<BeltElement> = {}): BeltElement => ({
  type: "belt",
  id: BELT,
  probes: [],
  overlays: {},
  positionStart: P(0, 0),
  positionEnd: P(0, 0),
  fixedNodeStartID: undefined,
  fixedNodeEndID: undefined,
  attachedGearsIDs: [
    { id: id("g1"), direction: false },
    { id: id("g2"), direction: false },
  ],
  closed: false,
  ...over,
});

const types = (actions: { type: string }[]) => actions.map((a) => a.type);

/** The belt's two pulleys, radius 30 at (0,0) and (200,0), with their axles. */
const PULLEYS = loose_belt_on_join().filter((el) => el.type !== "belt");

describe("close_belt_actions", () => {
  it("mints a fresh junction holding both ends when both are free", () => {
    const actions = close_belt_actions(
      belt(),
      P(5, 5),
      [...PULLEYS, belt()],
      [],
    );
    expect(types(actions)).toEqual([
      "CreateElement",
      "ConnectsFixedEdges",
      "ConnectsFixedNodeStart",
      "ConnectsFixedNodeEnd",
      "CloseBelt",
    ]);
  });

  // Seated under the cursor, the junction starts off the loop and the geometric
  // BeltJunction pulls the pulleys toward it — the belt moves to meet the join.
  it("seats a fresh junction on the loop, not under the cursor", () => {
    const b = belt();
    // Well above the loop, so the nearest belt point is the top run at y = -30.
    const actions = close_belt_actions(b, P(100, -400), [...PULLEYS, b], []);
    const join = actions.find((a) => a.type === "CreateElement")!
      .element as JoinElement;
    expect(join.position.x).toBeCloseTo(100);
    expect(join.position.y).toBeCloseTo(-30);
  });

  // The cursor sits inside the loop here, so the junction is pulled out onto the
  // nearest run rather than left floating between the pulleys.
  it("seats it on the loop from inside too", () => {
    const b = belt();
    const actions = close_belt_actions(b, P(100, -5), [...PULLEYS, b], []);
    const join = actions.find((a) => a.type === "CreateElement")!
      .element as JoinElement;
    expect(join.position.y).toBeCloseTo(-30);
  });

  it("only sets the flag when both ends already share one node", () => {
    const b = belt({ fixedNodeStartID: J1, fixedNodeEndID: J1 });
    const actions = close_belt_actions(b, P(0, 0), [b, join(J1)], []);
    expect(actions).toEqual([{ type: "CloseBelt", id: BELT, closed: true }]);
  });

  it("reuses the pinned node and joins the free end to it, no new join", () => {
    const b = belt({ fixedNodeStartID: J1 });
    const actions = close_belt_actions(b, P(0, 0), [b, join(J1)], []);
    expect(actions).toEqual([
      {
        type: "ConnectsFixedNodeEnd",
        disconnect: false,
        elementID: BELT,
        connectID: J1,
      },
      { type: "CloseBelt", id: BELT, closed: true },
    ]);
  });

  it("fuses two distinct junction nodes, then closes — no new join", () => {
    const b = belt({ fixedNodeStartID: J1, fixedNodeEndID: J2 });
    const mels: MechanicalElement[] = [
      b,
      join(J1, { fixedEdgesIDs: [BELT] }),
      join(J2, { fixedEdgesIDs: [BELT] }),
    ];
    const actions = close_belt_actions(b, P(0, 0), mels, []);
    expect(types(actions)).not.toContain("CreateElement");
    // The end's node is absorbed; the belt end is retargeted onto the start's.
    expect(actions).toContainEqual({ type: "DeleteElement", element: mels[2] });
    expect(actions[actions.length - 1]).toEqual({
      type: "CloseBelt",
      id: BELT,
      closed: true,
    });
  });
});

/** Loose belt over two pulleys, start pinned to a join, end free. */
function loose_belt_on_join(): MechanicalElement[] {
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
    axle(id("ax1"), id("g1"), 0),
    gear(id("g1"), id("ax1"), 0),
    axle(id("ax2"), id("g2"), 200),
    gear(id("g2"), id("ax2"), 200),
    join(J1, { fixedEdgesIDs: [BELT] }),
    belt({ fixedNodeStartID: J1, fixedNodeEndID: undefined }),
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

describe("apply_actions auto-closes a belt a gesture makes looped", () => {
  // Bringing the free end onto the node that already holds the start makes the
  // belt looped; the correction must close it without an explicit CloseBelt.
  it("closes when both terminals end up on one node", () => {
    const mech = mechanism(loose_belt_on_join());
    const result = apply_actions(
      mech,
      [
        {
          type: "ConnectsFixedNodeEnd",
          disconnect: false,
          elementID: BELT,
          connectID: J1,
        },
      ],
      "Connects",
    );
    const b = result.mechanicalElements.find(
      (el): el is BeltElement => el.type === "belt",
    );
    expect(b?.closed).toBe(true);
    expect(validate_mechanism(result)).toBeNull();
  });
});
