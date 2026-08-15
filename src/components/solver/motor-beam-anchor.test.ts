import { describe, expect, it } from "vitest";
import { DEFAULT_METADATA, Mechanism } from "../../types/mechanism";
import { Point2 } from "../../types/point2";
import type { BeamElement, ID, MechanicalElement, PivotElement } from "../../types/element";
import { RECORD_DT, compile_simulation_model, step_simulation } from "./kinematic-simulation";
import { snapshot_point } from "./snapshot";

/**
 * A motor anchored to a beam (rather than the ground) drives its children relative to that
 * beam's own orientation. `compile_simulation_model` fuses coincident position keys and
 * rewrites every link's own key fields to the fused ones — a field the rewriter does not
 * know about keeps pointing at a key that fusion just deleted, so any position it reads back
 * silently reads as absent. That is what left an anchored motor frozen at its starting angle
 * regardless of speed: it read as though the driven beam had a `KeepOrientation` constraint.
 */

let nextID = 0;
const id = (): ID =>
  `00000000-0000-0000-0000-${String(++nextID).padStart(12, "0")}` as ID;

const pivot = (
  pid: ID,
  position: Point2,
  rotatingEdgesIDs: ID[],
  extra: Partial<PivotElement> = {},
): PivotElement => ({
  type: "pivot",
  id: pid,
  probes: [],
  overlays: {},
  position,
  isGrounded: true,
  rotatingEdgesIDs,
  fixedGearsIDs: [],
  ...extra,
});

const beam = (
  bid: ID,
  start: Point2,
  end: Point2,
  startID: ID | undefined,
  endID: ID | undefined,
): BeamElement => ({
  type: "beam",
  id: bid,
  probes: [],
  overlays: {},
  positionStart: start,
  positionEnd: end,
  fixedNodeStartID: startID,
  fixedNodeEndID: endID,
  fixedNodesBodyIDs: [],
});

function mechanism(mechanicalElements: MechanicalElement[]): Mechanism {
  return {
    metadata: DEFAULT_METADATA,
    viewport: { scale: 1, pan: new Point2(0, 0) },
    mechanicalElements,
    constraintElements: [],
    loads: [],
    history: [],
    future: [],
  };
}

describe("moteur ancré sur une poutre", () => {
  it("fait tourner son enfant, pas seulement le moteur au sol", () => {
    const HUB = id();
    const ANCHOR = id();
    const ANCHOR_END = id();
    const DRIVEN = id();

    // A fixed pedestal (ANCHOR, both ends grounded) the motor pushes against, and a free
    // arm (DRIVEN) with nothing else constraining its angle around HUB.
    const before = mechanism([
      pivot(HUB, new Point2(0, 0), [ANCHOR, DRIVEN], {
        motor: { parentBeamID: ANCHOR, speed: 60 }, // 1 rev/s
      }),
      pivot(ANCHOR_END, new Point2(100, 0), [ANCHOR]),
      beam(ANCHOR, new Point2(0, 0), new Point2(100, 0), HUB, ANCHOR_END),
      beam(DRIVEN, new Point2(0, 0), new Point2(0, 100), HUB, undefined),
    ]);

    const model = compile_simulation_model(before);
    let snapshot = step_simulation(model, 0, null);
    const start = snapshot_point(snapshot, `${DRIVEN}:end`)!;

    // A quarter turn at 1 rev/s: 120 fps × 0.25 s.
    for (let i = 1; i <= 30; i++)
      snapshot = step_simulation(model, i * RECORD_DT, snapshot);
    const quarterTurn = snapshot_point(snapshot, `${DRIVEN}:end`)!;

    // Frozen (the bug): stays within solver noise of where it started. Rotating (fixed):
    // a 100 px arm swung a quarter turn moves its tip by ~140 px.
    expect(quarterTurn.distance_to(start)).toBeGreaterThan(100);
  });
});
