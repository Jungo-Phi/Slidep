import { describe, it, expect } from "vitest";
import { Point2 } from "../../types/point2";
import type {
  BeltElement,
  GearElement,
  ID,
  JoinElement,
  MechanicalElement,
  PivotElement,
} from "../../types/element";
import type { Action } from "../../types/actions";
import type { CanvasState } from "../../types/canvas-state";
import type { HoveredPart } from "../../types/hovered-part";
import { get_hovered_part } from "./get-hover";
import { handle_placing_element } from "./placing-element-actions";
import { legality_for_state } from "../mechanism/connection-rules";

const P = (x: number, y: number) => new Point2(x, y);
const AX_A = "ax-a" as ID;
const AX_B = "ax-b" as ID;
const G_A = "g-a" as ID;
const G_B = "g-b" as ID;

const axle = (id: ID, x: number, gearID: ID): PivotElement => ({
  type: "pivot",
  id,
  probes: [],
  overlays: {},
  position: P(x, 0),
  isGrounded: false,
  rotatingEdgesIDs: [],
  fixedGearsIDs: [gearID],
  motor: undefined,
});
const gear = (id: ID, x: number, axleID: ID): GearElement => ({
  type: "gear",
  id,
  probes: [],
  overlays: {},
  position: P(x, 0),
  angle: 0,
  radius: 40,
  parentAxleID: axleID,
  fixedNodesBodyIDs: [],
  meshedGearsIDs: [],
  attachedBeltID: undefined,
});

const MECH: MechanicalElement[] = [
  axle(AX_A, 0, G_A),
  gear(G_A, 0, AX_A),
  axle(AX_B, 300, G_B),
  gear(G_B, 300, AX_B),
];

/** Belt routed from gear A's rim over both pulleys, cursor back on its start. */
const START = P(0, -40);
const routing: Extract<CanvasState, { type: "PlacingBeltEnd" }> = {
  type: "PlacingBeltEnd",
  startHover: { type: "GearTooth", id: G_A, position: START, deleting: false },
  attachedGearsIDs: [
    { id: G_A, direction: false },
    { id: G_B, direction: false },
  ],
};

describe("closing a belt while placing it", () => {
  it("offers the closure when the cursor returns to the start", () => {
    const hovered = get_hovered_part(MECH, [], [], new Map(), START, routing);
    expect(hovered.type).toBe("BeltClosure");
  });

  // The gear a belt starts on is folded into the route only at finalisation, so
  // the real gesture — start on A, click B, come back — reaches the closure with
  // a single routed pulley, and its own start gear under the cursor.
  it("offers the closure over the start gear, which the route lists last", () => {
    const gesture: CanvasState = {
      ...routing,
      attachedGearsIDs: [{ id: G_B, direction: false }],
    };
    const hovered = get_hovered_part(MECH, [], [], new Map(), START, gesture);
    expect(hovered.type).toBe("BeltClosure");
  });

  // The closure names no element, so `sim.holds` cannot vouch for it. It used to
  // be dropped on that ground, and the belt was created open.
  it("creates the junction and closes the loop", () => {
    const closure: HoveredPart = { type: "BeltClosure", position: START };
    const { actions, actionBundleType } = handle_placing_element(
      routing,
      closure,
      MECH,
      [],
      [],
    );

    const created = actions.filter((a) => a.type === "CreateElement");
    expect(created.map((a) => a.element.type).sort()).toEqual(["belt", "join"]);
    expect(actions).toContainEqual(
      expect.objectContaining({ type: "CloseBelt", closed: true }),
    );

    // Both terminals must land on the junction, otherwise the loop is only
    // closed as far as the `closed` flag is concerned.
    const join = created.find((a) => a.element.type === "join")!.element;
    for (const type of ["ConnectsFixedNodeStart", "ConnectsFixedNodeEnd"])
      expect(actions).toContainEqual(
        expect.objectContaining({ type, connectID: join.id }),
      );

    // The junction has to be solved onto the loop, which "Other" would skip.
    expect(actionBundleType).toBe("Connects");
  });

  // The route is attached after the belt is created, so the closure used to run
  // on a belt with no pulleys yet: there was no loop to seat the junction on and
  // it stayed under the cursor, letting the solver drag the pulleys to meet it.
  it("seats the junction on the loop, away from the closing cursor", () => {
    const far = P(0, -200); // start well above the gears, rims at y = -40
    const fromVoid: Extract<CanvasState, { type: "PlacingBeltEnd" }> = {
      type: "PlacingBeltEnd",
      startHover: { type: "Void", position: far },
      attachedGearsIDs: [
        { id: G_A, direction: false },
        { id: G_B, direction: false },
      ],
    };
    const { actions } = handle_placing_element(
      fromVoid,
      { type: "BeltClosure", position: far },
      MECH,
      [],
      [],
    );
    const created = actions.filter((a) => a.type === "CreateElement");
    const join = created.find((a) => a.element.type === "join")!
      .element as JoinElement;
    expect(join.position.y).toBeCloseTo(-40);

    // Both terminals are born on the loop too. Left under the cursor they would
    // drag the junction back off it: the coincidence fusion seeds the fused node
    // at the plain midpoint of the three.
    const belt = created.find((a) => a.element.type === "belt")!
      .element as BeltElement;
    expect(belt.positionStart.y).toBeCloseTo(-40);
    expect(belt.positionEnd.y).toBeCloseTo(-40);
  });

  // Started in the void and over nothing, so the pick reaches the closure rule
  // instead of being answered by whatever lies under the start.
  it("refuses to close a belt that runs over no pulley", () => {
    const loose = P(500, -300);
    const pulleyless: CanvasState = {
      type: "PlacingBeltEnd",
      startHover: { type: "Void", position: loose },
      attachedGearsIDs: [],
    };
    const hovered = get_hovered_part(
      MECH,
      [],
      [],
      new Map(),
      loose,
      pulleyless,
    );
    expect(hovered.type).toBe("Void");
    expect(hovered).toHaveProperty("rejected");
  });

  // A band around a single wheel transmits nothing, so one pulley is not enough
  // even though the geometry would draw.
  it("refuses to close a belt that runs over a single pulley", () => {
    const oneGear: CanvasState = {
      ...routing,
      attachedGearsIDs: [{ id: G_A, direction: false }],
    };
    const hovered = get_hovered_part(MECH, [], [], new Map(), START, oneGear);
    expect(hovered.type).toBe("Void");
    expect(hovered).toHaveProperty("rejected");
  });
});

describe("the gear a belt is started on", () => {
  // It enters the route only at finalisation, so it used to be caught solely by
  // the click on a *second* gear: a belt started and ended on one pulley each
  // came out attached to neither.
  const attached = (actions: Action[]) =>
    actions
      .filter((a) => a.type === "ConnectsAttachedGears")
      .map((a) => a.connectID);

  it("is attached when the belt ends without a second gear click", () => {
    const startOnly: Extract<CanvasState, { type: "PlacingBeltEnd" }> = {
      type: "PlacingBeltEnd",
      startHover: {
        type: "GearTooth",
        id: G_A,
        position: START,
        deleting: false,
      },
      attachedGearsIDs: [],
    };
    const { actions } = handle_placing_element(
      startOnly,
      { type: "Void", position: P(200, -200) },
      MECH,
      [],
      [],
    );
    expect(attached(actions)).toEqual([G_A]);
  });

  it("stays first in the route, ahead of the gears clicked after it", () => {
    const { actions } = handle_placing_element(
      { ...routing, attachedGearsIDs: [{ id: G_B, direction: false }] },
      { type: "Void", position: P(500, -200) },
      MECH,
      [],
      [],
    );
    expect(attached(actions)).toEqual([G_A, G_B]);
  });

  it("is not attached twice when it is already in the route", () => {
    const { actions } = handle_placing_element(
      routing,
      { type: "Void", position: P(500, -200) },
      MECH,
      [],
      [],
    );
    expect(attached(actions)).toEqual([G_A, G_B]);
  });
});

describe("routing a belt over two gears of one axle", () => {
  const G_A2 = "g-a2" as ID;
  const mech: MechanicalElement[] = [
    { ...axle(AX_A, 0, G_A), fixedGearsIDs: [G_A, G_A2] },
    gear(G_A, 0, AX_A),
    { ...gear(G_A2, 0, AX_A), radius: 80 },
    axle(AX_B, 300, G_B),
    gear(G_B, 300, AX_B),
  ];

  it("refuses the second gear of an axle the belt already runs over", () => {
    const legal = legality_for_state(routing, mech);
    expect(legal(mech[2])).toMatchObject({ allowed: false, blocks: false });
  });

  it("still allows a gear on another axle", () => {
    const legal = legality_for_state(
      { ...routing, attachedGearsIDs: [{ id: G_A, direction: false }] },
      mech,
    );
    expect(legal(mech[4])).toMatchObject({ allowed: true });
  });
});

describe("closing a belt by dragging its terminal node onto the other end", () => {
  const NODE = "n1" as ID;
  const BELT = "blt" as ID;
  // Clear of the gear rims (gears at x=0 and x=300, y=0, radius 40).
  const START = P(0, -200);
  const END = P(300, -200);

  const node: MechanicalElement = {
    type: "join",
    id: NODE,
    probes: [],
    overlays: {},
    position: START,
    isGrounded: false,
    fixedEdgesIDs: [BELT],
  };
  const belt = (
    over: Partial<Extract<MechanicalElement, { type: "belt" }>> = {},
  ): MechanicalElement => ({
    type: "belt",
    id: BELT,
    probes: [],
    overlays: {},
    positionStart: START,
    positionEnd: END,
    fixedNodeStartID: NODE,
    fixedNodeEndID: undefined,
    attachedGearsIDs: [
      { id: G_A, direction: false },
      { id: G_B, direction: false },
    ],
    closed: false,
    ...over,
  });

  const moving: CanvasState = { type: "MovingNode", elementID: NODE };

  it("offers the free end when the node holds the start", () => {
    const mech = [...MECH, node, belt()];
    const hovered = get_hovered_part(mech, [], [], new Map(), END, moving);
    expect(hovered).toMatchObject({ type: "Edge", id: BELT, part: "end" });
  });

  // The inversion guard: a node holding the END must be offered the START, not
  // the end it already holds.
  it("offers the free start when the node holds the end", () => {
    const mech = [
      ...MECH,
      { ...node, position: END },
      belt({ fixedNodeStartID: undefined, fixedNodeEndID: NODE }),
    ];
    const hovered = get_hovered_part(mech, [], [], new Map(), START, moving);
    expect(hovered).toMatchObject({ type: "Edge", id: BELT, part: "start" });
  });

  it("refuses to close a pulley-less belt this way", () => {
    const mech = [...MECH, node, belt({ attachedGearsIDs: [] })];
    const hovered = get_hovered_part(mech, [], [], new Map(), END, moving);
    expect(hovered.type).toBe("Void");
    expect(hovered).toHaveProperty("rejected");
  });
});

describe("two belts never meet", () => {
  const OTHER = "blt-2" as ID;
  const NODE = "n-2" as ID;
  const START = P(0, -200);
  const END = P(300, -200);

  const other = (
    over: Partial<Extract<MechanicalElement, { type: "belt" }>> = {},
  ): MechanicalElement => ({
    type: "belt",
    id: OTHER,
    probes: [],
    overlays: {},
    positionStart: START,
    positionEnd: END,
    fixedNodeStartID: undefined,
    fixedNodeEndID: undefined,
    attachedGearsIDs: [],
    closed: false,
    ...over,
  });
  const holder: MechanicalElement = {
    type: "join",
    id: NODE,
    probes: [],
    overlays: {},
    position: START,
    isGrounded: false,
    fixedEdgesIDs: [OTHER],
  };
  const terminal: HoveredPart = {
    type: "Edge",
    id: OTHER,
    position: START,
    deleting: false,
    part: "start",
  };
  const body: HoveredPart = { ...terminal, part: "body" };

  it("refuses the bare terminal of another belt, opaquely", () => {
    const mech = [...MECH, other()];
    expect(legality_for_state(routing, mech)(mech[4], terminal)).toMatchObject({
      allowed: false,
      blocks: true,
    });
  });

  it("refuses the node holding it just the same", () => {
    const mech = [...MECH, other({ fixedNodeStartID: NODE }), holder];
    const node = mech[5];
    expect(legality_for_state(routing, mech)(node)).toMatchObject({
      allowed: false,
      blocks: true,
    });
  });

  // The body stays crossable: an opaque refusal there would hide whatever the
  // belt runs over from every belt gesture.
  it("lets the body of another belt be crossed", () => {
    const mech = [...MECH, other()];
    expect(legality_for_state(routing, mech)(mech[4], body)).toMatchObject({
      allowed: false,
      blocks: false,
    });
  });

  // A belt reaching its own junction is closing, not meeting a stranger. The
  // pair is refused as already connected, but transparently: made opaque, the
  // refusal would mask the terminal the closure aims at.
  it("never turns opaque on a belt's own junction", () => {
    const mech = [...MECH, other({ fixedNodeStartID: NODE }), holder];
    const dragging: CanvasState = {
      type: "MovingEdgeEndPoint",
      elementID: OTHER,
    };
    expect(legality_for_state(dragging, mech)(mech[5])).toMatchObject({
      blocks: false,
    });
  });
});
