import { describe, expect, it } from "vitest";
import { legality_for_state } from "./connection-rules";
import { Point2 } from "../../types/point2";
import type { ID, MechanicalElement } from "../../types/element";

const id = (n: number): ID =>
  `00000000-0000-0000-0000-${String(n).padStart(12, "0")}` as ID;

const AXLE = id(1);
const GEAR_A = id(2);
const GEAR_B = id(3);
const PIVOT = id(4);
const SPRING = id(5);
const BEAM = id(6);

/** One axle carrying two gears, plus a lone pivot, a spring and a beam. */
function build(): MechanicalElement[] {
  return [
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
      type: "pivot",
      id: PIVOT,
      probes: [],
      overlays: {},
      position: new Point2(200, 0),
      isGrounded: false,
      rotatingEdgesIDs: [],
      fixedGearsIDs: [],
    },
    {
      type: "spring",
      id: SPRING,
      probes: [],
      overlays: {},
      positionStart: new Point2(300, 0),
      positionEnd: new Point2(340, 0),
      fixedNodeStartID: undefined,
      fixedNodeEndID: undefined,
      stiffness: 1,
    },
    {
      type: "beam",
      id: BEAM,
      probes: [],
      overlays: {},
      positionStart: new Point2(300, 100),
      positionEnd: new Point2(340, 100),
      fixedNodeStartID: undefined,
      fixedNodeEndID: undefined,
      fixedNodesBodyIDs: [],
    },
  ];
}

const element_of = (elements: MechanicalElement[], target: ID) =>
  elements.find((element) => element.id === target)!;

describe("legality_for_state", () => {
  it("refuse d'engrener deux engrenages du même axe", () => {
    const elements = build();
    const verdict = legality_for_state(
      { type: "ChangingGearRadius", elementID: GEAR_A },
      elements,
    )(element_of(elements, GEAR_B));
    expect(verdict.allowed).toBe(false);
  });

  it("laisse dimensionner un engrenage vers un autre axe", () => {
    const elements = build();
    const verdict = legality_for_state(
      { type: "ChangingGearRadius", elementID: GEAR_A },
      elements,
    )(element_of(elements, PIVOT));
    expect(verdict.allowed).toBe(true);
  });

  it("refuse un nœud au corps d'un ressort traîné", () => {
    const elements = build();
    const verdict = legality_for_state(
      { type: "MovingEdgeBody", elementID: SPRING, t: 0.5 },
      elements,
    )(element_of(elements, PIVOT));
    expect(verdict.allowed).toBe(false);
  });

  it("laisse le corps d'une barre porter un nœud", () => {
    const elements = build();
    const verdict = legality_for_state(
      { type: "MovingEdgeBody", elementID: BEAM, t: 0.5 },
      elements,
    )(element_of(elements, PIVOT));
    expect(verdict.allowed).toBe(true);
  });
});
