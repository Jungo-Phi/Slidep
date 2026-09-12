import { describe, expect, it } from "vitest";
import { Point2 } from "../../../types";
import type { BeamElement, ID, MechanicalElement, PivotElement } from "../../../types/element";
import { DEFAULT_METADATA, DEFAULT_SIMULATION, Mechanism } from "../../../types/mechanism";
import type { MaterialDef, ProfileDef } from "../../../types/material";
import { DynamicSnapshot } from "../../../types/runtime-state";
import { GRAVITY } from "../../../constants/physics-specs";
import { CohesionField, compute_cohesion_field } from "../recording/cohesion-field";
import { Recorder } from "../recording/recorder";

/**
 * `t = 0` is the one instant the recording does not solve like the others: its pose is a plain re-projection of the edition geometry, and every effort it carries comes from a separate probe step (`Recorder.advance`).
 * What is guarded here is that the probe's d'Alembert term reaches the cohesion field along with its torsor — read against zero accelerations, a body that is in fact accelerating carries its whole weight as a fictitious internal effort, growing from the boundary the field marches from.
 */

let n = 0;
const id = (): ID => `fz${++n}` as ID;

const MATERIAL_ID = id();
const PROFILE_ID = id();
/** ρ = 1 on a 1×1 section: a beam's mass in kg is its length in metres. */
const MATERIALS: MaterialDef[] = [{ id: MATERIAL_ID, name: "test", E: 210e9, Re: 1, rho: 1 }];
const PROFILES: ProfileDef[] = [
  { id: PROFILE_ID, name: "test", shape: { kind: "rect", b: 1, h: 1 } },
];
const G = 9.81;
const LENGTH = 2; // so the beam weighs 2 kg

function beam_at(BEAM: ID, supportID: ID | undefined): BeamElement {
  return {
    type: "beam",
    id: BEAM,
    probes: [],
    overlays: {},
    positionStart: new Point2(0, 0),
    positionEnd: new Point2(LENGTH, 0),
    fixedNodeStartID: supportID,
    fixedNodeEndID: undefined,
    fixedNodesBodyIDs: [],
    materialID: MATERIAL_ID,
    profileID: PROFILE_ID,
  };
}

/** The cohesion field of `beam` on the frame the recording opens on, taken through the recorder so the probe step is exactly the one the app runs. */
function frame_zero_field(beam: BeamElement, elements: MechanicalElement[]): CohesionField {
  const mechanism: Mechanism = {
    metadata: DEFAULT_METADATA,
    viewport: { scale: 1, pan: new Point2(0, 0) },
    simulation: DEFAULT_SIMULATION,
    mechanicalElements: elements,
    constraintElements: [],
    loads: [],
    materials: MATERIALS,
    profiles: PROFILES,
    history: [],
    future: [],
  };
  const recorder = new Recorder();
  recorder.load("dynamic", mechanism, null);
  const { snapshots } = recorder.advance(0, Number.POSITIVE_INFINITY);
  const snapshot = snapshots[0] as DynamicSnapshot;
  expect(snapshot.t).toBe(0);
  const cohesion = snapshot.beamCohesion!.find((c) => c.beamID === beam.id)!;
  return compute_cohesion_field(
    beam,
    MATERIALS,
    PROFILES,
    cohesion,
    [],
    snapshot,
    GRAVITY,
  )!;
}

describe("efforts intérieurs à l'instant zéro", () => {
  it("une poutre en chute libre ne porte rien", () => {
    const BEAM = id();
    const beam = beam_at(BEAM, undefined);
    const field = frame_zero_field(beam, [beam]);

    // Gravity and inertia cancel at every cut, so the only honest reading is zero — anywhere, in any component.
    const weight = LENGTH * G;
    for (const sample of field.samples) {
      expect(Math.abs(sample.N)).toBeLessThan(weight * 1e-6);
      expect(Math.abs(sample.T)).toBeLessThan(weight * 1e-6);
      expect(Math.abs(sample.Mf)).toBeLessThan(weight * LENGTH * 1e-6);
    }
  });

  it("une poutre lâchée sur un pivot au sol coupe en mg/4 au support", () => {
    const HUB = id();
    const BEAM = id();
    const hub: PivotElement = {
      type: "pivot",
      id: HUB,
      probes: [],
      overlays: {},
      position: new Point2(0, 0),
      isGrounded: true,
      rotatingEdgesIDs: [BEAM],
      fixedGearsIDs: [],
      rotationalFriction: 0,
      motor: undefined,
    };
    const beam = beam_at(BEAM, HUB);
    const field = frame_zero_field(beam, [hub, beam]);

    // A uniform rod released horizontally about one of its own ends: α = 3g/2L, and the support is left holding mg/4 — statics, once the d'Alembert term is in.
    const root = field.samples[0];
    expect(root.T).toBeCloseTo((-LENGTH * G) / 4, 3);
    // The pivot transmits no couple, so the march starts free of one.
    expect(Math.abs(root.Mf)).toBeLessThan(LENGTH * LENGTH * G * 1e-6);
    // The march ends on the torsor the statics pass read at the far end independently: a field that marched on the wrong density would not land there.
    expect(Math.abs(field.loopResidual.fy)).toBeLessThan(LENGTH * G * 1e-3);
    expect(Math.abs(field.loopResidual.m)).toBeLessThan(LENGTH * LENGTH * G * 1e-3);
  });
});
