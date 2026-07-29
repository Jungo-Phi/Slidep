import { describe, expect, it } from "vitest";
import { delete_element, deletion_closure } from "./connect-actions";
import { Point2 } from "../../types/point2";
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
