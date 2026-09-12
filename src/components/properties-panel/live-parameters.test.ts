import { describe, expect, it } from "vitest";
import { live_parameters } from "./live-parameters";
import { PARAMETER_ACTIONS } from "../mechanism/action-kind";
import { Point2 } from "../../types/point2";
import type { ID, MechanicalElement } from "../../types";

/**
 * The live values the simulation panel offers, and the one promise they all make: editing any of them lets the run continue.
 */

const id = (n: number) => `00000000-0000-0000-0000-00000000000${n}` as ID;

const node = { position: new Point2(0, 0), isGrounded: false, probes: [], overlays: {} };
const edge = {
  positionStart: new Point2(0, 0),
  positionEnd: new Point2(1, 0),
  probes: [],
  overlays: {},
};

const elements: MechanicalElement[] = [
  { type: "mass", id: id(1), ...node, fixedEdgesIDs: [], mass: 3 },
  {
    type: "gear",
    id: id(2),
    position: new Point2(0, 0),
    angle: 0,
    probes: [],
    overlays: {},
    radius: 0.2,
    parentAxleID: id(9),
    fixedNodesBodyIDs: [],
    meshedGearsIDs: [],
    surfaceMass: 4,
  },
  { type: "spring", id: id(3), ...edge, stiffness: 100 },
  { type: "damper", id: id(4), ...edge, damping: 5 },
  {
    type: "pivot",
    id: id(5),
    ...node,
    rotatingEdgesIDs: [],
    fixedGearsIDs: [],
    rotationalFriction: 0.5,
    motor: { speed: 2, torque: 7 },
  },
  { type: "slider", id: id(6), ...node, fixedEdgesIDs: [], slidingFriction: 0.1 },
  {
    type: "slidep",
    id: id(7),
    ...node,
    rotatingEdgesIDs: [],
    fixedGearsIDs: [],
    rotationalFriction: 0.5,
    slidingFriction: 0.1,
  },
];

describe("live_parameters", () => {
  it("only ever offers values a running simulation absorbs", () => {
    for (const element of elements)
      for (const parameter of live_parameters(element))
        for (const action of parameter.change(parameter.value + 1))
          expect(
            PARAMETER_ACTIONS,
            `${element.type} · ${parameter.label}`,
          ).toContain(action.type);
  });

  it("aims each edit at the value asked for, not at the step it takes", () => {
    for (const element of elements)
      // A gear's inertia is the exception: it writes the surface mass behind it, so its own step is in another unit — see the test below.
      for (const parameter of live_parameters(element).filter(
        (p) => p.label !== "J",
      )) {
        const target = parameter.value + 5;
        for (const action of parameter.change(target)) {
          const where = `${element.type} · ${parameter.label}`;
          if ("delta" in action) expect(action.delta, where).toBeCloseTo(5);
          else if ("newValue" in action)
            expect(action.newValue, where).toBeCloseTo(target);
        }
      }
  });

  it("names a gear's inertia and its surface mass as one stored value", () => {
    const gear = elements.find((el) => el.type === "gear")!;
    const [surfaceMass, inertia] = live_parameters(gear);
    expect(surfaceMass.label).toBe("mₛ");
    expect(inertia.label).toBe("J");
    // Doubling the inertia doubles the surface mass: the gear stores only the latter.
    const [action] = inertia.change(2 * inertia.value);
    expect("delta" in action && action.delta).toBeCloseTo(surfaceMass.value);
  });
});
