import { describe, expect, it } from "vitest";
import { resolveGeometricConstraints } from "../kinematics/geometric-solver";
import { DEFAULT_METADATA, DEFAULT_SIMULATION, Mechanism } from "../../../types/mechanism";
import { Point2 } from "../../../types/point2";
import {
  BeamElement,
  ConstraintElement,
  ID,
  MechanicalElement,
  PivotElement,
} from "../../../types/element";
import { Action } from "../../../types/actions";
import { MaterialDef, ProfileDef } from "../../../types/material";

/**
 * The edition rules, as a CAD sketcher has them: the grabbed part goes where the cursor is, and everything else changes as little as it can.
 */

const MATERIAL_ID = "material" as ID;
const PROFILE_ID = "profile" as ID;

function beam(id: string, start: Point2, end: Point2, extra: Partial<BeamElement> = {}): BeamElement {
  return {
    type: "beam",
    id: id as ID,
    probes: [],
    overlays: {},
    positionStart: start,
    positionEnd: end,
    fixedNodeStartID: undefined,
    fixedNodeEndID: undefined,
    fixedNodesBodyIDs: [],
    materialID: MATERIAL_ID,
    profileID: PROFILE_ID,
    ...extra,
  };
}

function pivot(id: string, position: Point2, isGrounded = false): PivotElement {
  return {
    type: "pivot",
    id: id as ID,
    probes: [],
    overlays: {},
    position,
    isGrounded,
    rotatingEdgesIDs: [],
    fixedGearsIDs: [],
    rotationalFriction: 0,
  };
}

function mechanism(elements: MechanicalElement[], constraints: ConstraintElement[] = []): Mechanism {
  const materials: MaterialDef[] = [{ id: MATERIAL_ID, name: "test", E: 210e9, Re: 1, rho: 1 }];
  const profiles: ProfileDef[] = [{ id: PROFILE_ID, name: "test", shape: { kind: "rect", b: 1, h: 1 } }];
  return {
    metadata: DEFAULT_METADATA,
    viewport: { scale: 1, pan: new Point2(0, 0) },
    simulation: DEFAULT_SIMULATION,
    mechanicalElements: elements,
    constraintElements: constraints,
    loads: [],
    materials,
    profiles,
    history: [],
    future: [],
  };
}

function solve(m: Mechanism, action: Record<string, unknown>) {
  const trigger = action as unknown as Action;
  return resolveGeometricConstraints(m, [trigger], [trigger]).positions;
}

function expectAt(actual: Point2 | undefined, x: number, y: number, tolerance = 1e-3) {
  expect(actual).toBeDefined();
  expect(Math.abs(actual!.x - x)).toBeLessThan(tolerance);
  expect(Math.abs(actual!.y - y)).toBeLessThan(tolerance);
}

const P = (x: number, y: number) => new Point2(x, y);

describe("edition rules", () => {
  it("slides a body node freely along its beam, leaving the beam where it is", () => {
    const m = mechanism([
      beam("B", P(0, 0), P(100, 0), { fixedNodesBodyIDs: ["N" as ID] }),
      pivot("N", P(50, 0)),
    ]);
    const solved = solve(m, { type: "MoveNode", id: "N", newPosition: P(70, 0), oldPosition: P(50, 0) });
    expectAt(solved.get("N"), 70, 0);
    expectAt(solved.get("B:start"), 0, 0);
    expectAt(solved.get("B:end"), 100, 0);
  });

  it("slides a body node that is also another beam's end", () => {
    const m = mechanism([
      beam("B", P(0, 0), P(100, 0), { fixedNodesBodyIDs: ["N" as ID] }),
      beam("C", P(50, 0), P(50, 50), { fixedNodeStartID: "N" as ID }),
      pivot("N", P(50, 0)),
    ]);
    const solved = solve(m, { type: "MoveNode", id: "N", newPosition: P(70, 0), oldPosition: P(50, 0) });
    expectAt(solved.get("N"), 70, 0);
    expectAt(solved.get("C:start"), 70, 0);
    expectAt(solved.get("B:start"), 0, 0);
    expectAt(solved.get("B:end"), 100, 0);
    expectAt(solved.get("C:end"), 50, 50);
  });

  it("slides the body node rather than moving its beam when a neighbour pulls on it", () => {
    const m = mechanism(
      [
        beam("B", P(0, 0), P(100, 0), { fixedNodesBodyIDs: ["N" as ID] }),
        beam("C", P(50, 0), P(80, 40), { fixedNodeStartID: "N" as ID }),
        pivot("N", P(50, 0)),
      ],
      [{ type: "dimension-edge", id: "D" as ID, position: P(60, 25), edgeID: "C" as ID, value: 50 } as ConstraintElement],
    );
    const solved = solve(m, { type: "MoveEdgeEnd", id: "C", newPosition: P(100, 40), oldPosition: P(80, 40) });
    expectAt(solved.get("C:end"), 100, 40);
    // Sliding costs next to nothing, so the beam gives way by a few thousandths at most.
    expectAt(solved.get("N"), 70, 0, 0.05);
    expectAt(solved.get("B:start"), 0, 0, 0.05);
    expectAt(solved.get("B:end"), 100, 0, 0.05);
  });

  it("case A: dragging a beam's end turns it about its other end, leaving the next beam alone", () => {
    const m = mechanism([
      beam("B", P(0, 0), P(100, 0), { fixedNodeEndID: "F" as ID }),
      beam("C", P(100, 0), P(200, 0), { fixedNodeStartID: "F" as ID }),
      pivot("F", P(100, 0)),
    ]);
    const solved = solve(m, { type: "MoveEdgeStart", id: "B", newPosition: P(0, 30), oldPosition: P(0, 0) });
    expectAt(solved.get("B:start"), 0, 30);
    expectAt(solved.get("F"), 100, 0);
    expectAt(solved.get("C:end"), 200, 0);
  });

  it("case B: a beam whose body node is pulled sideways translates more than it turns", () => {
    const m = mechanism([
      beam("B", P(0, 0), P(100, 0), { fixedNodesBodyIDs: ["N" as ID] }),
      pivot("N", P(25, 0)),
    ]);
    const solved = solve(m, { type: "MoveNode", id: "N", newPosition: P(25, 10), oldPosition: P(25, 0) });
    expectAt(solved.get("N"), 25, 10);
    const start = solved.get("B:start")!;
    const end = solved.get("B:end")!;
    // Least displacement alone would move the ends by 12 and 4; the orientation weight evens them out.
    expect(end.y).toBeGreaterThan(6);
    expect(start.y).toBeLessThan(11.5);
    // The node stays on its beam.
    const t = (25 - start.x) / (end.x - start.x);
    expect(Math.abs(start.y + t * (end.y - start.y) - 10)).toBeLessThan(1e-3);
  });

  it("case C: a dimensioned beam dragged by one end pivots, its other end following as little as it can", () => {
    const m = mechanism(
      [
        beam("B", P(0, 0), P(100, 0), { fixedNodeEndID: "F" as ID }),
        beam("C", P(100, 0), P(200, 0), { fixedNodeStartID: "F" as ID }),
        pivot("F", P(100, 0)),
      ],
      [{ type: "dimension-edge", id: "D" as ID, position: P(50, 10), edgeID: "B" as ID, value: 100 } as ConstraintElement],
    );
    const target = P(-20, 30);
    const solved = solve(m, { type: "MoveEdgeStart", id: "B", newPosition: target, oldPosition: P(0, 0) });
    expectAt(solved.get("B:start"), target.x, target.y);
    const f = solved.get("F")!;
    expect(Math.abs(f.distance_to(target) - 100)).toBeLessThan(1e-3);
    // The point of the circle around the grab closest to where F was.
    const expected = target.add(P(100, 0).sub(target).normalize().mul(100));
    expectAt(f, expected.x, expected.y, 0.05);
    expectAt(solved.get("C:end"), 200, 0);
  });

  it("leaves the far side of a chain untouched", () => {
    const m = mechanism([
      beam("A", P(0, 0), P(100, 0), { fixedNodeEndID: "J1" as ID }),
      beam("B", P(100, 0), P(200, 0), { fixedNodeStartID: "J1" as ID, fixedNodeEndID: "J2" as ID }),
      beam("C", P(200, 0), P(300, 0), { fixedNodeStartID: "J2" as ID }),
      pivot("J1", P(100, 0)),
      pivot("J2", P(200, 0)),
    ]);
    const solved = solve(m, { type: "MoveNode", id: "J1", newPosition: P(110, 40), oldPosition: P(100, 0) });
    expectAt(solved.get("J1"), 110, 40);
    expectAt(solved.get("A:start"), 0, 0, 1e-6);
    expectAt(solved.get("J2"), 200, 0, 1e-6);
    expectAt(solved.get("C:end"), 300, 0, 1e-6);
  });

  it("translates a beam dragged by its body, carrying its body nodes", () => {
    const m = mechanism([
      beam("B", P(0, 0), P(100, 0), { fixedNodesBodyIDs: ["N" as ID] }),
      pivot("N", P(30, 0)),
    ]);
    const solved = solve(m, {
      type: "MoveEdgeBody",
      id: "B",
      t: 0.5,
      newPosition: P(50, 40),
      oldPosition: P(50, 0),
    });
    expectAt(solved.get("B:start"), 0, 40);
    expectAt(solved.get("B:end"), 100, 40);
    expectAt(solved.get("N"), 30, 40);
  });

  // Grabbed off its middle, a beam would share each step unevenly between its ends and turn a little every time — enough, over a drag, to leave the direction it was drawn on.
  it("keeps the direction and length of a beam dragged off its middle, step after step", () => {
    let start = P(0, 0);
    let end = P(100, 0);
    for (let k = 0; k < 60; k++) {
      const grabbed = start.lerp(end, 0.1);
      const target = grabbed.add(P(3 * Math.cos(k * 0.7), 4 * Math.sin(k * 0.3) + 2));
      const solved = solve(mechanism([beam("B", start, end)]), {
        type: "MoveEdgeBody",
        id: "B",
        t: 0.1,
        newPosition: target,
        oldPosition: grabbed,
      });
      start = solved.get("B:start")!;
      end = solved.get("B:end")!;
      expectAt(start.lerp(end, 0.1), target.x, target.y);
    }
    expect(Math.abs(end.y - start.y)).toBeLessThan(1e-6);
    expect(Math.abs(end.distance_to(start) - 100)).toBeLessThan(1e-6);
  });

  it("gets as close as it can to a grab out of reach, without breaking a dimension", () => {
    const m = mechanism(
      [
        beam("B", P(0, 0), P(100, 0), { fixedNodeStartID: "G" as ID }),
        pivot("G", P(0, 0), true),
      ],
      [{ type: "dimension-edge", id: "D" as ID, position: P(50, 10), edgeID: "B" as ID, value: 100 } as ConstraintElement],
    );
    const solved = solve(m, { type: "MoveEdgeEnd", id: "B", newPosition: P(0, 300), oldPosition: P(100, 0) });
    expectAt(solved.get("G"), 0, 0, 1e-9);
    expectAt(solved.get("B:end"), 0, 100, 0.01);
  });

  it("never moves a grounded pivot to follow a beam dragged by its body", () => {
    const m = mechanism([
      beam("B", P(0, 0), P(100, 0), { fixedNodeStartID: "G" as ID }),
      pivot("G", P(0, 0), true),
    ]);
    const solved = solve(m, {
      type: "MoveEdgeBody",
      id: "B",
      t: 1,
      newPosition: P(80, 60),
      oldPosition: P(100, 0),
    });
    expectAt(solved.get("G"), 0, 0, 1e-9);
    expectAt(solved.get("B:end"), 80, 60);
  });

  // A beam is oriented start → end: a typed angle more than a quarter turn away must not settle on the same line pointing backwards.
  it.each([(2 * Math.PI) / 3, Math.PI, -Math.PI / 2])("turns a beam to a typed angle of %f rad, not half a turn off it", (newAngle) => {
    const m = mechanism([
      beam("B", P(0, 0), P(100, 0), { fixedNodeStartID: "G" as ID }),
      pivot("G", P(0, 0), true),
    ]);
    const solved = solve(m, { type: "ChangeEdgeAngle", id: "B", newAngle, oldAngle: 0 });
    const direction = solved.get("B:end")!.sub(solved.get("B:start")!);
    expect(Math.abs(Point2.from_polar(1, newAngle).angle_to(direction))).toBeLessThan(1e-6);
  });
});
