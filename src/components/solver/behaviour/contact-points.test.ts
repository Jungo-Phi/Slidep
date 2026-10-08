import { describe, expect, it } from "vitest";
import { DEFAULT_METADATA, DEFAULT_SIMULATION, Mechanism } from "../../../types/mechanism";
import { Point2 } from "../../../types/point2";
import { GRAVITY } from "../../../constants/physics-specs";
import type { BeamElement, ID, MassElement, MechanicalElement, PivotElement } from "../../../types/element";
import type { MaterialDef, ProfileDef } from "../../../types/material";
import {
  RECORD_DT,
  compile_simulation_model,
  is_retained,
  step_dynamic_simulation,
} from "../dynamics/simulation-engine";
import { CONTACT_EPS_RATIO } from "../dynamics/collision-detection";
import { CONTACT_SLACK_RATIO } from "../dynamics/collision-restitution";
import { DynamicSnapshot } from "../../../types/runtime-state";
import { contact_point, snapshot_point } from "../snapshot";
import { Recorder } from "../recording/recorder";

/** End-to-end: where a falling mass's contacts are recorded as touching, against the floor and against a beam. */

let nextID = 0;
const id = (): ID =>
  `00000000-0000-0000-0000-${String(++nextID).padStart(12, "0")}` as ID;

const pivot = (pid: ID, position: Point2): PivotElement => ({
  type: "pivot", id: pid, probes: [], overlays: {}, position, isGrounded: true,
  rotatingEdgesIDs: [], fixedGearsIDs: [], rotationalFriction: 0,
});
const MATERIAL_ID = id();
const PROFILE_ID = id();
const MATERIALS: MaterialDef[] = [
  { id: MATERIAL_ID, name: "test", E: 210e9, Re: 1, rho: 1 },
];
const PROFILES: ProfileDef[] = [
  { id: PROFILE_ID, name: "test", shape: { kind: "rect", b: 1, h: 1 } },
];
const beam = (bid: ID, start: Point2, end: Point2, startID?: ID, endID?: ID): BeamElement => ({
  type: "beam", id: bid, probes: [], overlays: {}, positionStart: start, positionEnd: end,
  fixedNodeStartID: startID, fixedNodeEndID: endID, fixedNodesBodyIDs: [],
  materialID: MATERIAL_ID, profileID: PROFILE_ID,
});
const mass = (mid: ID, position: Point2): MassElement => ({
  type: "mass", id: mid, probes: [], overlays: {}, position, isGrounded: false,
  fixedEdgesIDs: [], mass: 1,
});
function mechanism(mechanicalElements: MechanicalElement[], floor = false): Mechanism {
  return { metadata: DEFAULT_METADATA, viewport: { scale: 1, pan: new Point2(0, 0) },
    simulation: floor
      ? { ...DEFAULT_SIMULATION, floor: { enabled: true, height: 0, angle: 0 } }
      : DEFAULT_SIMULATION,
    mechanicalElements, constraintElements: [], loads: [],
    materials: MATERIALS, profiles: PROFILES, history: [], future: [] };
}

/** Steps a dynamic run the way the recorder does, and returns every solved step. */
function run(
  m: Mechanism,
  frames: number,
  collisionsOn: boolean,
  floorOn: boolean,
): { snapshots: DynamicSnapshot[]; extent: number } {
  const model = compile_simulation_model(m, true, true);
  const snapshots: DynamicSnapshot[] = [];
  let snapshot: DynamicSnapshot | null = null;
  for (let i = 0; i < frames; i++) {
    const t = i * RECORD_DT;
    const first = snapshot === null;
    snapshot = step_dynamic_simulation(
      model, t, snapshot, first ? 0 : RECORD_DT, GRAVITY,
      undefined, undefined, is_retained(t), collisionsOn, floorOn,
    );
    // The recorder's own probe of the first instant's efforts, which the model's caches see too.
    if (first) {
      const probe = step_dynamic_simulation(
        model, t, null, RECORD_DT, GRAVITY, undefined, undefined, undefined, collisionsOn, floorOn,
      );
      snapshot = {
        ...snapshot,
        reactions: probe.reactions,
        accelerations: probe.accelerations,
        angleAccelerations: probe.angleAccelerations,
        beamCohesion: probe.beamCohesion,
        beltStrands: probe.beltStrands,
        balance: probe.balance,
      };
    }
    snapshots.push(snapshot);
  }
  return { snapshots, extent: model.extent };
}

describe("points de contact", () => {
  // Let go just above, so it settles within a few frames instead of bouncing for seconds.
  it("une masse posée sur le plancher le touche juste sous elle", () => {
    const MASS = id();
    const { snapshots } = run(mechanism([mass(MASS, new Point2(0.5, 0.002))], true), 120, false, true);
    const last = snapshots[snapshots.length - 1];
    expect(last.contacts).toHaveLength(1);
    const point = contact_point(last, last.contacts![0])!;
    expect(point.x).toBeCloseTo(snapshot_point(last, MASS)!.x, 9);
    expect(point.y).toBeCloseTo(0, 9);
  });

  it("une masse posée sur une poutre la touche sur la poutre, juste sous elle", () => {
    const MASS = id();
    const FS = id();
    const FE = id();
    const { snapshots } = run(
      mechanism([
        mass(MASS, new Point2(0.5, 0.002)),
        pivot(FS, new Point2(0, 0)),
        pivot(FE, new Point2(1, 0)),
        beam(id(), new Point2(0, 0), new Point2(1, 0), FS, FE),
      ]),
      120,
      true,
      false,
    );
    const last = snapshots[snapshots.length - 1];
    expect(last.contacts).toHaveLength(1);
    const point = contact_point(last, last.contacts![0])!;
    expect(point.x).toBeCloseTo(snapshot_point(last, MASS)!.x, 6);
    expect(point.y).toBeCloseTo(0, 6);
  });

  it("un choc déjà fini à la fin de l'image y reste relevé", () => {
    const MASS = id();
    const { snapshots, extent } = run(mechanism([mass(MASS, new Point2(0.5, 1))], true), 400, false, true);
    // Clear of the floor by more than any contact reaches.
    const clear = (CONTACT_EPS_RATIO + CONTACT_SLACK_RATIO) * extent;
    const leftWithinFrame = snapshots.filter(
      (s) => s.contacts && snapshot_point(s, MASS)!.y > clear,
    );
    expect(leftWithinFrame.length).toBeGreaterThan(0);
  });

  it("l'instant retenu porte aussi les contacts des pas qui ne le sont pas", () => {
    const MASS = id();
    const m = mechanism([mass(MASS, new Point2(0.5, 1))], true);
    const FRAMES = 400;
    const { snapshots: solved } = run(m, FRAMES, false, true);

    const recorder = new Recorder();
    recorder.setFloor(true);
    recorder.load("dynamic", m, null);
    const { snapshots: kept } = recorder.advance((FRAMES - 1) * RECORD_DT, Infinity);

    // What each kept instant should carry: every contact of the steps solved since the previous one.
    let pending = new Set<number>();
    let fromDropped = 0;
    let k = 0;
    for (const step of solved) {
      for (const c of step.contacts ?? []) pending.add(c.id);
      if (!is_retained(step.t)) continue;
      const own = new Set((step.contacts ?? []).map((c) => c.id));
      fromDropped += [...pending].filter((c) => !own.has(c)).length;
      const recorded = new Set((kept[k].contacts ?? []).map((c) => c.id));
      expect(kept[k].t).toBeCloseTo(step.t, 12);
      expect(recorded).toEqual(pending);
      pending = new Set();
      k++;
    }
    expect(k).toBe(kept.length);
    // Some impact has to have fallen on a dropped step, or this checked nothing.
    expect(fromDropped).toBeGreaterThan(0);
  });
});
