import { describe, expect, it } from "vitest";
import { DEFAULT_METADATA, DEFAULT_SIMULATION, Mechanism } from "../../types/mechanism";
import { Point2 } from "../../types/point2";
import { GRAVITY } from "../../constants/physics-specs";
import type { BeamElement, ID, MassElement, MechanicalElement, PivotElement } from "../../types/element";
import {
  RECORD_DT,
  compile_simulation_model,
  step_dynamic_simulation,
} from "./simulation-engine";
import { DynamicSnapshot } from "../../types/runtime-state";
import { snapshot_point, snapshot_velocity } from "./snapshot";

/** End-to-end: a falling mass, collisions and restitution both on, against a fixed floor. */

let nextID = 0;
const id = (): ID =>
  `00000000-0000-0000-0000-${String(++nextID).padStart(12, "0")}` as ID;

const pivot = (pid: ID, position: Point2): PivotElement => ({
  type: "pivot", id: pid, probes: [], overlays: {}, position, isGrounded: true,
  rotatingEdgesIDs: [], fixedGearsIDs: [], rotationalFriction: 0,
});
const beam = (bid: ID, start: Point2, end: Point2, startID?: ID, endID?: ID): BeamElement => ({
  type: "beam", id: bid, probes: [], overlays: {}, positionStart: start, positionEnd: end,
  fixedNodeStartID: startID, fixedNodeEndID: endID, fixedNodesBodyIDs: [], linearMass: 1,
});
const mass = (mid: ID, position: Point2): MassElement => ({
  type: "mass", id: mid, probes: [], overlays: {}, position, isGrounded: false,
  fixedEdgesIDs: [], mass: 1,
});
function mechanism(mechanicalElements: MechanicalElement[]): Mechanism {
  return { metadata: DEFAULT_METADATA, viewport: { scale: 1, pan: new Point2(0, 0) },
    simulation: DEFAULT_SIMULATION,
    mechanicalElements, constraintElements: [], loads: [], history: [], future: [] };
}

describe("rebond en mode dynamique", () => {
  it("une masse en chute libre rebondit au lieu de s'arrêter net sur le sol", () => {
    const MASS = id();
    const FS = id();
    const FE = id();
    const FLOOR = id();
    const before = mechanism([
      mass(MASS, new Point2(50, 100)),
      pivot(FS, new Point2(0, 0)),
      pivot(FE, new Point2(100, 0)),
      beam(FLOOR, new Point2(0, 0), new Point2(100, 0), FS, FE),
    ]);
    const model = compile_simulation_model(before);
    let snapshot: DynamicSnapshot | null = null;
    let maxUpwardVelocityAfterContact = -Infinity;
    // ~4.5 s to free-fall 100 units under GRAVITY from rest (0.5·g·t² = 100) — enough
    // frames to comfortably reach and bounce off the floor.
    const FRAMES = 700;
    for (let i = 0; i < FRAMES; i++) {
      snapshot = step_dynamic_simulation(
        model, i * RECORD_DT, snapshot, RECORD_DT, GRAVITY,
        undefined, undefined, undefined, true,
      );
      const p = snapshot_point(snapshot, MASS)!;
      if (p.y < 5) {
        const v = snapshot_velocity(snapshot, MASS);
        if (v) maxUpwardVelocityAfterContact = Math.max(maxUpwardVelocityAfterContact, v.y);
      }
    }
    // Once it has reached the floor, it must at some point be moving back UP — a plain
    // inelastic stop would keep vy at/near zero, never clearly positive.
    expect(maxUpwardVelocityAfterContact).toBeGreaterThan(1);
  });

  it("rebondit de la même façon sur le vrai plancher (ligne infinie, sans poutre)", () => {
    const MASS = id();
    const before: Mechanism = {
      ...mechanism([mass(MASS, new Point2(50, 100))]),
      simulation: {
        ...DEFAULT_SIMULATION,
        floor: { enabled: true, height: 0, angle: 0 },
      },
    };
    const model = compile_simulation_model(before, false, true);
    let snapshot: DynamicSnapshot | null = null;
    let maxUpwardVelocityAfterContact = -Infinity;
    const FRAMES = 700;
    for (let i = 0; i < FRAMES; i++) {
      snapshot = step_dynamic_simulation(
        model, i * RECORD_DT, snapshot, RECORD_DT, GRAVITY,
        undefined, undefined, undefined, false, true,
      );
      const p = snapshot_point(snapshot, MASS)!;
      if (p.y < 5) {
        const v = snapshot_velocity(snapshot, MASS);
        if (v) maxUpwardVelocityAfterContact = Math.max(maxUpwardVelocityAfterContact, v.y);
      }
    }
    expect(maxUpwardVelocityAfterContact).toBeGreaterThan(1);
  });
});
