import { describe, expect, it } from "vitest";
import {
  connect_elements,
  delete_element,
  deletion_closure,
  fuse_nodes,
} from "./connect-actions";
import { apply_actions } from "./apply-actions";
import { validate_mechanism } from "../../utils/validate-mechanism";
import { Point2 } from "../../types/point2";
import { DEFAULT_METADATA, Mechanism } from "../../types/mechanism";
import type {
  ConstraintElement,
  ID,
  LoadElement,
  MechanicalElement,
} from "../../types/element";

/**
 * What the eraser highlights must be what it removes. These pin the closure to
 * the deletion itself: whatever `delete_element` decides to take, the hover has
 * to have shown in red first.
 */

const id = (n: number): ID =>
  `00000000-0000-0000-0000-${String(n).padStart(12, "0")}` as ID;

const AXLE = id(1);
const GEAR_A = id(2);
const GEAR_B = id(3);
const BEAM = id(4);
const LONE = id(5);
const DIM_RADIUS = id(6);
const FORCE = id(7);
const FRAMED_FORCE = id(8);

/** An axle carrying two gears, a beam hosting a force, and a lone pivot. */
function build(): {
  mechanical: MechanicalElement[];
  constraints: ConstraintElement[];
  loads: LoadElement[];
} {
  return {
    mechanical: [
      {
        type: "pivot",
        id: AXLE,
        probes: [],
        overlays: {},
        position: new Point2(0, 0),
        isGrounded: false,
        rotatingEdgesIDs: [],
        fixedGearsIDs: [GEAR_A, GEAR_B],
      },
      {
        type: "gear",
        id: GEAR_A,
        probes: [],
        overlays: {},
        position: new Point2(0, 0),
        angle: 0,
        radius: 20,
        parentAxleID: AXLE,
        fixedNodesBodyIDs: [],
        meshedGearsIDs: [],
        attachedBeltID: undefined,
      },
      {
        type: "gear",
        id: GEAR_B,
        probes: [],
        overlays: {},
        position: new Point2(0, 0),
        angle: 0,
        radius: 40,
        parentAxleID: AXLE,
        fixedNodesBodyIDs: [],
        meshedGearsIDs: [],
        attachedBeltID: undefined,
      },
      {
        type: "beam",
        id: BEAM,
        probes: [],
        overlays: {},
        positionStart: new Point2(300, 0),
        positionEnd: new Point2(340, 0),
        fixedNodeStartID: undefined,
        fixedNodeEndID: undefined,
        fixedNodesBodyIDs: [],
      },
      {
        type: "pivot",
        id: LONE,
        probes: [],
        overlays: {},
        position: new Point2(600, 0),
        isGrounded: false,
        rotatingEdgesIDs: [],
        fixedGearsIDs: [],
      },
    ],
    constraints: [
      {
        type: "dimension-radius",
        id: DIM_RADIUS,
        position: new Point2(0, 60),
        gearID: GEAR_A,
        value: 20,
      },
    ],
    loads: [
      {
        type: "force",
        id: FORCE,
        targetID: BEAM,
        anchor: "start",
        vector: new Point2(0, 100),
        frame: "world",
      },
      // Hosted elsewhere, merely framed on the beam: survives, reframed.
      {
        type: "force",
        id: FRAMED_FORCE,
        targetID: LONE,
        vector: new Point2(0, 100),
        frame: { mode: "edge", edgeID: BEAM },
      },
    ],
  };
}

const closure_of = (target: ID) => {
  const { mechanical, constraints, loads } = build();
  return deletion_closure(target, mechanical, constraints, loads);
};

describe("deletion_closure", () => {
  it("takes the gears an axle carries", () => {
    const doomed = closure_of(AXLE);
    expect(doomed.has(AXLE)).toBe(true);
    expect(doomed.has(GEAR_A)).toBe(true);
    expect(doomed.has(GEAR_B)).toBe(true);
  });

  it("takes a constraint that names a cascaded gear", () => {
    // The dimension hangs off GEAR_A, which the axle takes with it: erasing the
    // axle must show the dimension going too, two links down.
    expect(closure_of(AXLE).has(DIM_RADIUS)).toBe(true);
  });

  it("takes a load hosted by the deleted element", () => {
    expect(closure_of(BEAM).has(FORCE)).toBe(true);
  });

  it("spares a load merely framed on the deleted edge", () => {
    // It survives in world coordinates, so it must not be shown as doomed.
    expect(closure_of(BEAM).has(FRAMED_FORCE)).toBe(false);
  });

  it("leaves untouched elements out", () => {
    const doomed = closure_of(AXLE);
    expect(doomed.has(BEAM)).toBe(false);
    expect(doomed.has(LONE)).toBe(false);
  });

  // A node fusion can bring both ends of a beam onto one node. That beam then
  // names the node twice, so the deletion reaches it twice — and two cuts
  // carrying the same index would splice the neighbour out on the second pass.
  it("cuts a node once when the deleted edge holds it by both ends", () => {
    const LOOPED = id(20);
    const NEIGHBOUR = id(21);
    const JOIN = id(22);
    const mechanical: MechanicalElement[] = [
      {
        type: "join",
        id: JOIN,
        probes: [],
        overlays: {},
        position: new Point2(0, 0),
        isGrounded: false,
        fixedEdgesIDs: [LOOPED, NEIGHBOUR],
      },
      {
        type: "beam",
        id: LOOPED,
        probes: [],
        overlays: {},
        positionStart: new Point2(0, 0),
        positionEnd: new Point2(0, 0),
        fixedNodeStartID: JOIN,
        fixedNodeEndID: JOIN,
        fixedNodesBodyIDs: [],
      },
      {
        type: "beam",
        id: NEIGHBOUR,
        probes: [],
        overlays: {},
        positionStart: new Point2(0, 0),
        positionEnd: new Point2(80, 0),
        fixedNodeStartID: JOIN,
        fixedNodeEndID: undefined,
        fixedNodesBodyIDs: [],
      },
    ];

    const cuts = delete_element(LOOPED, mechanical, [], []).filter(
      (action) =>
        action.type === "ConnectsFixedEdges" &&
        action.disconnect &&
        action.elementID === JOIN,
    );
    expect(cuts).toHaveLength(1);
  });

  // A fusion deletes the absorbed node outright rather than through
  // `delete_element`, so a force resting on it has to be carried over by hand or
  // it is left naming an element that no longer exists.
  it("carries a force off the node a fusion absorbs", () => {
    const KEPT = id(40);
    const ABSORBED = id(41);
    const FORCE = id(42);
    const node = (nid: ID, x: number): MechanicalElement => ({
      type: "pivot",
      id: nid,
      probes: [],
      overlays: {},
      position: new Point2(x, 0),
      isGrounded: false,
      rotatingEdgesIDs: [],
      fixedGearsIDs: [],
    });
    const mechanical = [node(KEPT, 0), node(ABSORBED, 40)];
    const loads: LoadElement[] = [
      {
        type: "force",
        id: FORCE,
        targetID: ABSORBED,
        vector: new Point2(0, 30),
        frame: "world",
      },
    ];
    const mechanism: Mechanism = {
      metadata: DEFAULT_METADATA,
      viewport: { scale: 1, pan: new Point2(0, 0) },
      mechanicalElements: mechanical,
      constraintElements: [],
      loads,
      history: [],
      future: [],
    };

    const after = apply_actions(
      mechanism,
      fuse_nodes(
        mechanical[0] as never,
        mechanical[1] as never,
        mechanical,
        [],
        loads,
      ),
    );

    expect(after.loads).toHaveLength(1);
    expect(after.loads[0].targetID).toBe(KEPT);
    expect(validate_mechanism(after)).toBeNull();
  });

  // The node lists that beam once for its two ends. Moving one end away must
  // leave the entry, or the end that stays is stranded.
  it("keeps the node's entry when only one of the two ends leaves", () => {
    const LOOPED = id(30);
    const OLD = id(31);
    const FRESH = id(32);
    const mechanical: MechanicalElement[] = [
      {
        type: "pivot",
        id: OLD,
        probes: [],
        overlays: {},
        position: new Point2(0, 0),
        isGrounded: false,
        rotatingEdgesIDs: [LOOPED],
        fixedGearsIDs: [],
      },
      {
        type: "pivot",
        id: FRESH,
        probes: [],
        overlays: {},
        position: new Point2(40, 0),
        isGrounded: false,
        rotatingEdgesIDs: [],
        fixedGearsIDs: [],
      },
      {
        type: "beam",
        id: LOOPED,
        probes: [],
        overlays: {},
        positionStart: new Point2(0, 0),
        positionEnd: new Point2(0, 0),
        fixedNodeStartID: OLD,
        fixedNodeEndID: OLD,
        fixedNodesBodyIDs: [],
      },
    ];

    const mechanism: Mechanism = {
      metadata: DEFAULT_METADATA,
      viewport: { scale: 1, pan: new Point2(0, 0) },
      mechanicalElements: mechanical,
      constraintElements: [],
      loads: [],
      history: [],
      future: [],
    };
    const after = apply_actions(
      mechanism,
      connect_elements(
        { type: "Edge", position: new Point2(0, 0), id: LOOPED, deleting: false, part: "start" },
        mechanical[1],
        { type: "Node", position: new Point2(40, 0), id: FRESH, deleting: false, beamBodyHover: false },
        mechanical,
        [],
        [],
      ),
    );

    expect(validate_mechanism(after)).toBeNull();
  });

  it("agrees with what the deletion actually removes", () => {
    // The guarantee the highlight rests on, stated directly.
    for (const target of [AXLE, GEAR_A, BEAM, LONE]) {
      const { mechanical, constraints, loads } = build();
      const removed = new Set(
        delete_element(target, mechanical, constraints, loads)
          .filter((action) => action.type === "DeleteElement")
          .map((action) => action.element.id),
      );
      expect(closure_of(target)).toEqual(removed);
    }
  });
});
