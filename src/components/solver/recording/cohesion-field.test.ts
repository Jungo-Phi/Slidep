import { describe, expect, it } from "vitest";
import { Point2 } from "../../../types";
import { DEFAULT_METADATA, DEFAULT_SIMULATION, Mechanism } from "../../../types/mechanism";
import type {
  BeamElement,
  ForceElement,
  ID,
  JoinElement,
  LoadElement,
  MechanicalElement,
} from "../../../types/element";
import type { MaterialDef, ProfileDef } from "../../../types/material";
import type { BeamCohesion, DynamicSnapshot, SnapshotLayout } from "../../../types/runtime-state";
import { RECORD_DT, compile_simulation_model, step_dynamic_simulation } from "../dynamics/simulation-engine";
import {
  bending_stress_stops,
  CohesionField,
  compute_cohesion_field,
  normal_stress_stops,
  shear_admissible_stress,
  shear_utilization_stops,
  stress_utilization_stops,
} from "./cohesion-field";
import { section_properties } from "../../../utils/section-properties";

const GRAVITY_Y = -9.81;

let nextID = 0;
const id = (): ID => `00000000-0000-0000-0000-${String(++nextID).padStart(12, "0")}` as ID;

/** A fresh material+profile pair whose `ρ·A` is exactly `linearMass` — a 1×1 m rectangle so
 *  `A = 1` and `ρ` alone carries the whole value, letting every test keep asserting on the
 *  same linear mass it always has, without caring how it decomposes into `MaterialDef`/
 *  `ProfileDef`. */
function material_profile(linearMass: number): {
  materialID: ID;
  profileID: ID;
  materials: MaterialDef[];
  profiles: ProfileDef[];
} {
  const materialID = id();
  const profileID = id();
  return {
    materialID,
    profileID,
    materials: [{ id: materialID, name: "test", E: 210e9, Re: 1, rho: linearMass }],
    profiles: [{ id: profileID, name: "test", shape: { kind: "rect", b: 1, h: 1 } }],
  };
}

function mechanism(
  mechanicalElements: MechanicalElement[],
  loads: LoadElement[],
  materials: MaterialDef[] = [],
  profiles: ProfileDef[] = [],
): Mechanism {
  return {
    metadata: DEFAULT_METADATA,
    viewport: { scale: 1, pan: new Point2(0, 0) },
    simulation: DEFAULT_SIMULATION,
    mechanicalElements,
    constraintElements: [],
    loads,
    materials,
    profiles,
    history: [],
    future: [],
  };
}

describe("cohesion-field — le champ N/T/Mf par coupe (docs/plan-efforts-interieurs.md phase 4)", () => {
  it("cantilever chargé en bout : Mf = -P·L à l'encastrement, 0 au bout libre, linéaire entre les deux", () => {
    // The plan's own reference shape for a cantilever: Mf negative (diagram drawn above the
    // beam), magnitude P·L at the fixed end, tapering LINEARLY to zero at the free tip — not
    // growing toward the tip, which is what an un-flipped moment reading would give instead
    // (see cohesion-field.ts's r_coh_start doc). No gravity: the tip load is the only action.
    const JOIN = id();
    const BEAM = id();
    const join: JoinElement = {
      type: "join",
      id: JOIN,
      probes: [],
      overlays: {},
      position: new Point2(0, 0),
      isGrounded: true,
      fixedEdgesIDs: [BEAM],
    };
    // negligible self-weight/inertia: isolate the tip load's own shape
    const { materialID, profileID, materials, profiles } = material_profile(0.001);
    const beam: BeamElement = {
      type: "beam",
      id: BEAM,
      probes: [],
      overlays: {},
      positionStart: new Point2(0, 0),
      positionEnd: new Point2(1, 0),
      fixedNodeStartID: JOIN,
      fixedNodesBodyIDs: [],
      materialID,
      profileID,
    };
    const force: ForceElement = {
      type: "force",
      id: id(),
      targetID: BEAM,
      anchor: "end",
      vector: new Point2(0, -100),
      frame: "world",
    };
    const loads = [force];

    const model = compile_simulation_model(
      mechanism([join, beam], loads, materials, profiles),
      true,
    );
    let snapshot: DynamicSnapshot | null = null;
    for (let i = 0; i < 30; i++)
      snapshot = step_dynamic_simulation(model, i * RECORD_DT, snapshot, RECORD_DT, new Point2(0, 0));

    const cohesion = snapshot!.beamCohesion?.find((c) => c.beamID === BEAM);
    expect(cohesion).toBeDefined();

    const field = compute_cohesion_field(
      beam,
      materials,
      profiles,
      cohesion!,
      loads,
      snapshot!,
      new Point2(0, 0),
    );
    expect(field).toBeDefined();

    const at = (s: number) => {
      // Nearest sample: dense enough sampling makes this exact to well within tolerance,
      // except exactly at a discontinuity where two samples share the same `s` — pick either.
      let best = field!.samples[0];
      for (const sample of field!.samples)
        if (Math.abs(sample.s - s) < Math.abs(best.s - s)) best = sample;
      return best;
    };

    expect(at(0).N).toBeCloseTo(0, 0);
    expect(at(0).T).toBeCloseTo(-100, 0);
    expect(at(0).Mf).toBeCloseTo(-100, 0);
    expect(at(0.5).Mf).toBeCloseTo(-50, 0);
    expect(at(1).Mf).toBeCloseTo(0, 0);

    // Loop residual: this field's own march to s = L should land back on phase 3's
    // independently-derived reading there.
    expect(field!.loopResidual.fx).toBeCloseTo(0, 0);
    expect(field!.loopResidual.fy).toBeCloseTo(0, 0);
    expect(field!.loopResidual.m).toBeCloseTo(0, 0);
  });

  it("poutre isolée en chute libre : N = T = Mf = 0 partout (d'Alembert)", () => {
    // No support at all: the beam's own weight and its inertia (phase 2's acceleration
    // field) must cancel EXACTLY, everywhere along the span. If the inertia term were
    // missing, this would instead show the beam's own weight as a parabolic Mf — the
    // "diagnostic of a bug that doesn't exist" the plan warns about, made concrete: get the
    // sign/magnitude of phase 2's acceleration wrong and this test catches it immediately.
    const BEAM = id();
    const { materialID, profileID, materials, profiles } = material_profile(1);
    const beam: BeamElement = {
      type: "beam",
      id: BEAM,
      probes: [],
      overlays: {},
      positionStart: new Point2(0, 100),
      positionEnd: new Point2(1, 100),
      fixedNodesBodyIDs: [],
      materialID,
      profileID,
    };
    const model = compile_simulation_model(mechanism([beam], [], materials, profiles));
    let snapshot: DynamicSnapshot | null = null;
    for (let i = 0; i < 5; i++)
      snapshot = step_dynamic_simulation(
        model,
        i * RECORD_DT,
        snapshot,
        RECORD_DT,
        new Point2(0, GRAVITY_Y),
      );

    const cohesion = snapshot!.beamCohesion?.find((c) => c.beamID === BEAM);
    expect(cohesion).toBeDefined();
    const field = compute_cohesion_field(
      beam,
      materials,
      profiles,
      cohesion!,
      [],
      snapshot!,
      new Point2(0, GRAVITY_Y),
    );
    expect(field).toBeDefined();

    for (const sample of field!.samples) {
      expect(sample.N).toBeCloseTo(0, 3);
      expect(sample.T).toBeCloseTo(0, 3);
      expect(sample.Mf).toBeCloseTo(0, 2);
    }
  });

  it("poutre isolée en rotation libre autour de son centre : T = Mf = 0, N en traction parabolique", () => {
    // The plan's other d'Alembert test, and the one the free-fall case above cannot cover:
    // that one has ω = α = 0 throughout, so it never exercises the centrifugal −ω²·s·x̂ term
    // at all. Here a beam spinning about its own midpoint, no gravity, no support, has
    // nothing BUT that term: every element pulls inward on its neighbor to stay on its
    // circular path, so N should be a symmetric TENSION peaking at the centre and vanishing
    // at both free ends, with T and Mf zero everywhere (no bending, no shear — pure axial).
    const BEAM = id();
    const { materialID, profileID, materials, profiles } = material_profile(1);
    const beam: BeamElement = {
      type: "beam",
      id: BEAM,
      probes: [],
      overlays: {},
      positionStart: new Point2(-0.5, 0),
      positionEnd: new Point2(0.5, 0),
      fixedNodesBodyIDs: [],
      materialID,
      profileID,
    };
    const model = compile_simulation_model(mechanism([beam], [], materials, profiles));

    // Rest frame, to get a valid layout/positions to warm-start from.
    const atRest = step_dynamic_simulation(model, 0, null, RECORD_DT, new Point2(0, 0));

    // Hand-seed a rigid rotation about the beam's own centre (the origin): v = ω × r, ω = 2
    // rad/s about +z, so v = ω·perp(r) in this codebase's `perp` (CCW) convention.
    const omega0 = 2;
    const velocities = new Float64Array(atRest.velocities);
    const setV = (key: string, v: Point2) => {
      const slot = model.layout.index.get(key)!;
      velocities[2 * slot] = v.x;
      velocities[2 * slot + 1] = v.y;
    };
    setV(`${BEAM}:start`, new Point2(-0.5, 0).perp().mul(omega0));
    setV(`${BEAM}:end`, new Point2(0.5, 0).perp().mul(omega0));
    let snapshot: DynamicSnapshot = { ...atRest, velocities };
    // One hand-seeded step does not yet behave like steady rotation — the length constraint
    // has not caught up with the injected velocity, so the frame's own (v_after−v_before)/dt
    // badly violates phase 2's own rigidity guard-rail ((a_end−a_start)·x̂ should be −ω²L).
    // A few more steps, warm-starting from the solver's OWN solved velocities each time
    // (not re-seeded), let it settle onto its circular path before this reads the field.
    for (let i = 0; i < 10; i++)
      snapshot = step_dynamic_simulation(
        model,
        (i + 1) * RECORD_DT,
        snapshot,
        RECORD_DT,
        new Point2(0, 0),
      );

    const cohesion = snapshot.beamCohesion?.find((c) => c.beamID === BEAM);
    expect(cohesion).toBeDefined();
    const field = compute_cohesion_field(
      beam,
      materials,
      profiles,
      cohesion!,
      [],
      snapshot,
      new Point2(0, 0),
    );
    expect(field).toBeDefined();

    for (const sample of field!.samples) {
      expect(sample.T).toBeCloseTo(0, 1);
      expect(sample.Mf).toBeCloseTo(0, 1);
      expect(sample.N).toBeGreaterThanOrEqual(-1e-6); // tension (or zero), never compression
    }
    // Peaks at the centre (s = L/2 = 0.5) and vanishes at both free ends — the continuum
    // answer, which is what the field now reports: the beam owns its whole mass, so there is
    // no lump sitting at the tip needing a force of its own to stay on its circular path.
    expect(field!.extremum.N.s).toBeCloseTo(0.5, 1);
    expect(field!.extremum.N.value).toBeGreaterThan(0);
  });

  // Nearest sample to abscissa `s` — dense sampling makes this exact to well within
  // tolerance, except exactly at a discontinuity where two samples share the same `s`
  // (the first one in array order is the "just before" reading; see `compute_cohesion_field`).
  const at = (field: CohesionField, s: number) => {
    let best = field.samples[0];
    for (const sample of field.samples) if (Math.abs(sample.s - s) < Math.abs(best.s - s)) best = sample;
    return best;
  };

  it("cas de référence sur deux appuis : T = -P/2, Mf = +PL/4 à mi-portée", () => {
    // The plan's own reference case ("Décisions actées"): a simply-supported beam under a
    // point load P at mid-span. `compute_cohesion_field` is pure — state in, field out — so
    // the reference torsor is injected directly rather than driven through the full dynamic
    // solver: grounding BOTH of a beam's own endpoints hits a separate, unrelated solver
    // limitation (its own rigid-length link then has two simultaneously-anchored dofs, an
    // indeterminate split `PBD_kinematic_solver` declines to report — see
    // beam-cohesion.test.ts's mid-span-mass test), nothing this case needs to exercise. Both
    // supports are simple PINS (no moment reaction — unlike the cantilever's encastrement),
    // so `start`/`end` carry force only.
    const BEAM = id();
    const MASS = id();
    const L = 2;
    const P = 100;

    // isolate the point load's own shape — no self-weight/inertia term
    const { materialID, profileID, materials, profiles } = material_profile(0);
    const beam: BeamElement = {
      type: "beam",
      id: BEAM,
      probes: [],
      overlays: {},
      positionStart: new Point2(0, 0),
      positionEnd: new Point2(L, 0),
      fixedNodesBodyIDs: [MASS],
      materialID,
      profileID,
    };

    // Statics: each pin carries P/2 up. The raw `LinkReaction` sense read at start/end
    // (unflipped, both alike — see cohesion-field.ts's own doc) is what the BEAM applies
    // BACK onto its support, i.e. the negative of that.
    const cohesion: BeamCohesion = {
      beamID: BEAM,
      start: { fx: 0, fy: -P / 2, m: 0 },
      end: { fx: 0, fy: -P / 2, m: 0 },
      attachedNodes: [{ nodeID: MASS, s: 0.5, fx: 0, fy: -P }],
      determinate: true,
    };

    const layout: SnapshotLayout = {
      keys: [`${BEAM}:start`, `${BEAM}:end`],
      index: new Map([
        [`${BEAM}:start`, 0],
        [`${BEAM}:end`, 1],
      ]),
      angleKeys: [],
      angleIndex: new Map(),
      belts: [],
      beltIndex: new Map(),
      beltStart: new Int32Array(0),
      wrapBase: 0,
      detachBase: 0,
      arrivalBase: 0,
    };
    const snapshot: DynamicSnapshot = {
      t: 0,
      layout,
      positions: Float64Array.from([0, 0, L, 0]),
      angles: new Float64Array(0),
      velocities: new Float64Array(4),
      accelerations: new Float64Array(4),
      angleVelocities: new Float64Array(0),
    };

    const field = compute_cohesion_field(
      beam,
      materials,
      profiles,
      cohesion,
      [],
      snapshot,
      new Point2(0, 0),
    );
    expect(field).toBeDefined();

    expect(at(field!, 0).T).toBeCloseTo(-P / 2, 6);
    expect(at(field!, 1).T).toBeCloseTo(-P / 2, 6); // still just BEFORE mid-span
    expect(field!.extremum.Mf.s).toBeCloseTo(1, 6);
    expect(field!.extremum.Mf.value).toBeCloseTo((P * L) / 4, 6);

    // Loop residual: this field's own march to s = L lands back on the injected `end`.
    expect(field!.loopResidual.fx).toBeCloseTo(0, 6);
    expect(field!.loopResidual.fy).toBeCloseTo(0, 6);
    expect(field!.loopResidual.m).toBeCloseTo(0, 6);
  });

  it("charge répartie uniforme sur deux appuis : Mf parabolique, T linéaire passant par zéro à mi-portée", () => {
    // Same rig as the point-load reference case, a uniform distributed load instead: shear
    // linear from -wL/2 to +wL/2 (zero at mid-span), moment the classic parabola peaking at
    // wL²/8 there — textbook shapes this integrator has to reproduce from `density_at_ends`
    // alone (no attached-node discontinuity this time, so nothing jumps).
    const BEAM = id();
    const L = 2;
    const w = 50; // N/m

    const { materialID, profileID, materials, profiles } = material_profile(0);
    const beam: BeamElement = {
      type: "beam",
      id: BEAM,
      probes: [],
      overlays: {},
      positionStart: new Point2(0, 0),
      positionEnd: new Point2(L, 0),
      fixedNodesBodyIDs: [],
      materialID,
      profileID,
    };
    const load: LoadElement = {
      type: "distributed-force",
      id: id(),
      targetID: BEAM,
      direction: new Point2(0, -1),
      magnitudeStart: w,
      magnitudeEnd: w,
      frame: "world",
    };

    const cohesion: BeamCohesion = {
      beamID: BEAM,
      start: { fx: 0, fy: (-w * L) / 2, m: 0 },
      end: { fx: 0, fy: (-w * L) / 2, m: 0 },
      attachedNodes: [],
      determinate: true,
    };

    const layout: SnapshotLayout = {
      keys: [`${BEAM}:start`, `${BEAM}:end`],
      index: new Map([
        [`${BEAM}:start`, 0],
        [`${BEAM}:end`, 1],
      ]),
      angleKeys: [],
      angleIndex: new Map(),
      belts: [],
      beltIndex: new Map(),
      beltStart: new Int32Array(0),
      wrapBase: 0,
      detachBase: 0,
      arrivalBase: 0,
    };
    const snapshot: DynamicSnapshot = {
      t: 0,
      layout,
      positions: Float64Array.from([0, 0, L, 0]),
      angles: new Float64Array(0),
      velocities: new Float64Array(4),
      accelerations: new Float64Array(4),
      angleVelocities: new Float64Array(0),
    };

    const field = compute_cohesion_field(
      beam,
      materials,
      profiles,
      cohesion,
      [load],
      snapshot,
      new Point2(0, 0),
    );
    expect(field).toBeDefined();

    expect(at(field!, 0).T).toBeCloseTo((-w * L) / 2, 1);
    expect(at(field!, L / 2).T).toBeCloseTo(0, 1);
    expect(at(field!, L).T).toBeCloseTo((w * L) / 2, 1);
    expect(field!.extremum.Mf.s).toBeCloseTo(L / 2, 1);
    expect(field!.extremum.Mf.value).toBeCloseTo((w * L * L) / 8, 1);

    expect(field!.loopResidual.fx).toBeCloseTo(0, 6);
    expect(field!.loopResidual.fy).toBeCloseTo(0, 6);
    expect(field!.loopResidual.m).toBeCloseTo(0, 6);
  });

  it("retournement départ/arrivée : Mf change de signe, T garde sa valeur, N est invariant", () => {
    // The SAME physical cantilever (fixed at one physical point, loaded at the other), built
    // twice with which physical point is labelled "start" vs "end" swapped. That labelling
    // alone fixes x̂ (and so ŷ, and the abscissa's own direction) — never the world's
    // vertical (see "Décisions actées": the sign must not come from the world frame, since
    // this flip has to be a discontinuous, orientation-driven fact, never something that
    // could happen mid-animation as a beam merely passes through vertical).
    const buildField = (reversed: boolean): CohesionField => {
      const JOIN = id();
      const BEAM = id();
      const FIXED = new Point2(0, 0);
      const TIP = new Point2(1, 0);
      const join: JoinElement = {
        type: "join",
        id: JOIN,
        probes: [],
        overlays: {},
        position: FIXED,
        isGrounded: true,
        fixedEdgesIDs: [BEAM],
      };
      // negligible self-weight/inertia: isolate the tip load's own shape
      const { materialID, profileID, materials, profiles } = material_profile(0.001);
      const beam: BeamElement = {
        type: "beam",
        id: BEAM,
        probes: [],
        overlays: {},
        positionStart: reversed ? TIP : FIXED,
        positionEnd: reversed ? FIXED : TIP,
        fixedNodeStartID: reversed ? undefined : JOIN,
        fixedNodeEndID: reversed ? JOIN : undefined,
        fixedNodesBodyIDs: [],
        materialID,
        profileID,
      };
      const force: ForceElement = {
        type: "force",
        id: id(),
        targetID: BEAM,
        anchor: reversed ? "start" : "end",
        vector: new Point2(0, -100),
        frame: "world",
      };
      const loads = [force];

      const model = compile_simulation_model(
        mechanism([join, beam], loads, materials, profiles),
        true,
      );
      let snapshot: DynamicSnapshot | null = null;
      for (let i = 0; i < 30; i++)
        snapshot = step_dynamic_simulation(model, i * RECORD_DT, snapshot, RECORD_DT, new Point2(0, 0));

      const cohesion = snapshot!.beamCohesion?.find((c) => c.beamID === BEAM);
      expect(cohesion).toBeDefined();
      const field = compute_cohesion_field(
        beam,
        materials,
        profiles,
        cohesion!,
        loads,
        snapshot!,
        new Point2(0, 0),
      );
      expect(field).toBeDefined();
      return field!;
    };

    const normal = buildField(false);
    const reversed = buildField(true);

    // N invariant and T keeping its VALUE at the mirrored abscissa (s' = L - s) — only Mf
    // flips sign, per the plan's own statement of this invariant.
    for (const s of [0, 0.25, 0.5, 0.75, 1]) {
      const a = at(normal, s);
      const b = at(reversed, 1 - s);
      expect(b.N).toBeCloseTo(a.N, 0);
      expect(b.T).toBeCloseTo(a.T, 0);
      expect(b.Mf).toBeCloseTo(-a.Mf, 0);
    }
    // Concretely, not just relatively: the SAME physical fixed end now reads the OPPOSITE
    // sign from the plan's own cantilever reference (Mf = -P·L there, +P·L here).
    expect(at(reversed, 1).Mf).toBeCloseTo(100, 0);
  });

  it("charge répartie triangulaire sur cantilever : T et Mf suivent la vraie forme, résidu de bouclage fermé (correction 2)", () => {
    // Same rig as "cantilever chargé en bout", a triangular distributed load instead — zero
    // at the fixed end, full at the free tip. Non-uniform: the case a plain 50/50 nodal split
    // (the old `resolve_load_forces`) got the encastrement's reaction wrong by the load's full
    // resultant, not a rounding error — a `resolve_beam_cohesion` gap (see beam-cohesion.ts's
    // own doc on `isExternalAtEnd`) that correction 2 also exposed and fixed: a distributed
    // load's own nodal share landing exactly on a GROUNDED endpoint was invisible to
    // `cohesion.start`, reported only as an anchor-only `"External"` `LinkReaction`. The
    // symmetric gap at the FREE tip (no `"External"` reaction ever exists there — see
    // `distributed_end_share`'s own doc) is closed too.
    //
    // Closed form: T(s) = 50s² − 50, Mf(s) = 50s − (50/3)s³ − 33.33 (from dMf/ds = −T, with
    // Mf(0) = −start.m matching the encastrement's own moment reaction).
    const JOIN = id();
    const BEAM = id();
    const join: JoinElement = {
      type: "join",
      id: JOIN,
      probes: [],
      overlays: {},
      position: new Point2(0, 0),
      isGrounded: true,
      fixedEdgesIDs: [BEAM],
    };
    // negligible self-weight/inertia: isolate the distributed load's own effect
    const { materialID, profileID, materials, profiles } = material_profile(0.001);
    const beam: BeamElement = {
      type: "beam",
      id: BEAM,
      probes: [],
      overlays: {},
      positionStart: new Point2(0, 0),
      positionEnd: new Point2(1, 0),
      fixedNodeStartID: JOIN,
      fixedNodesBodyIDs: [],
      materialID,
      profileID,
    };
    const load: LoadElement = {
      type: "distributed-force",
      id: id(),
      targetID: BEAM,
      direction: new Point2(0, -1),
      magnitudeStart: 0,
      magnitudeEnd: 100,
      frame: "world",
    };

    const model = compile_simulation_model(
      mechanism([join, beam], [load], materials, profiles),
      true,
    );
    let snapshot: DynamicSnapshot | null = null;
    for (let i = 0; i < 30; i++)
      snapshot = step_dynamic_simulation(model, i * RECORD_DT, snapshot, RECORD_DT, new Point2(0, 0));

    const cohesion = snapshot!.beamCohesion?.find((c) => c.beamID === BEAM);
    expect(cohesion).toBeDefined();

    const field = compute_cohesion_field(
      beam,
      materials,
      profiles,
      cohesion!,
      [load],
      snapshot!,
      new Point2(0, 0),
    );
    expect(field).toBeDefined();

    expect(at(field!, 0).T).toBeCloseTo(-50, 0);
    expect(at(field!, 1).T).toBeCloseTo(0, 0);
    expect(at(field!, 0).Mf).toBeCloseTo(-100 / 3, 0);
    expect(at(field!, 1).Mf).toBeCloseTo(0, 0);
    expect(at(field!, 0.5).Mf).toBeCloseTo(25 - 50 / 24 - 100 / 3, 0);

    expect(field!.loopResidual.fx).toBeCloseTo(0, 0);
    expect(field!.loopResidual.fy).toBeCloseTo(0, 0);
    expect(field!.loopResidual.m).toBeCloseTo(0, 0);
  });
});

describe("stress_utilization_stops — le taux d'utilisation du panneau/canvas (phase 6)", () => {
  const section = section_properties({ kind: "rect", b: 0.02, h: 0.04 });
  const Re = 250e6;

  const field: CohesionField = {
    beamID: id(),
    length: 2,
    samples: [
      { s: 0, N: 1000, T: 0, Mf: 0 },
      { s: 1, N: 1000, T: 0, Mf: 100 },
      { s: 2, N: 1000, T: 0, Mf: 0 },
    ],
    discontinuities: [0, 2],
    extremum: {
      N: { s: 0, value: 1000 },
      T: { s: 0, value: 0 },
      Mf: { s: 1, value: 100 },
    },
    loopResidual: { fx: 0, fy: 0, m: 0 },
    determinate: true,
  };

  it("one stop per sample, offset as a fraction of the beam's own length", () => {
    const stops = stress_utilization_stops(field, section, Re);
    expect(stops.map((s) => s.offset)).toEqual([0, 0.5, 1]);
  });

  it("ratio = |σ|max/Re, matching max_fiber_stress directly", () => {
    const stops = stress_utilization_stops(field, section, Re);
    const expectedMid = (1000 / section.A + (100 * section.v) / section.I) / Re;
    expect(stops[1].ratio).toBeCloseTo(expectedMid, 10);
    expect(stops[0].ratio).toBeCloseTo(1000 / section.A / Re, 10);
  });

  it("stress = ratio·Re — the absolute reading the legend and ramp position themselves on", () => {
    const stops = stress_utilization_stops(field, section, Re);
    for (const stop of stops) expect(stop.stress).toBeCloseTo(stop.ratio * Re, 3);
  });
});

describe("normal_stress_stops / bending_stress_stops — the normal/bending lenses (phase 9)", () => {
  const section = section_properties({ kind: "rect", b: 0.02, h: 0.04 });

  const field: CohesionField = {
    beamID: id(),
    length: 2,
    samples: [
      { s: 0, N: 1000, T: 0, Mf: 0 },
      { s: 1, N: -1000, T: 0, Mf: -100 },
      { s: 2, N: 1000, T: 0, Mf: 0 },
    ],
    discontinuities: [0, 2],
    extremum: {
      N: { s: 0, value: 1000 },
      T: { s: 0, value: 0 },
      Mf: { s: 1, value: -100 },
    },
    loopResidual: { fx: 0, fy: 0, m: 0 },
    determinate: true,
  };

  it("normal_stress_stops = N/A, signed like N itself", () => {
    const stops = normal_stress_stops(field, section);
    expect(stops.map((s) => s.stress)).toEqual([
      1000 / section.A,
      -1000 / section.A,
      1000 / section.A,
    ]);
  });

  it("bending_stress_stops = Mf·v/I, signed like Mf itself", () => {
    const stops = bending_stress_stops(field, section);
    expect(stops.map((s) => s.stress)).toEqual([
      0,
      (-100 * section.v) / section.I,
      0,
    ]);
  });

  it("both share stress_utilization_stops' offsets — a fraction of the beam's own length", () => {
    expect(normal_stress_stops(field, section).map((s) => s.offset)).toEqual([0, 0.5, 1]);
    expect(bending_stress_stops(field, section).map((s) => s.offset)).toEqual([0, 0.5, 1]);
  });
});

describe("shear_utilization_stops — le taux de cisaillement (phase 9, chantier 2)", () => {
  const section = section_properties({ kind: "rect", b: 0.02, h: 0.04 });
  const Re = 250e6;
  const tauAdm = shear_admissible_stress(Re);

  const field: CohesionField = {
    beamID: id(),
    length: 2,
    samples: [
      { s: 0, N: 0, T: 1000, Mf: 0 },
      { s: 1, N: 0, T: -1000, Mf: 0 },
      { s: 2, N: 0, T: 0, Mf: 0 },
    ],
    discontinuities: [0, 2],
    extremum: {
      N: { s: 0, value: 0 },
      T: { s: 0, value: 1000 },
      Mf: { s: 0, value: 0 },
    },
    loopResidual: { fx: 0, fy: 0, m: 0 },
    determinate: true,
  };

  it("shear_admissible_stress = Re/√3 — von Mises reduced to pure shear", () => {
    expect(tauAdm).toBeCloseTo(Re / Math.sqrt(3), 6);
  });

  it("one stop per sample, offset as a fraction of the beam's own length", () => {
    const stops = shear_utilization_stops(field, section, tauAdm);
    expect(stops.map((s) => s.offset)).toEqual([0, 0.5, 1]);
  });

  it("ratio = τ_max/τ_adm, matching max_shear_stress directly — sign of T does not matter", () => {
    const stops = shear_utilization_stops(field, section, tauAdm);
    const expectedRatio = 1.5 * (1000 / section.A) / tauAdm;
    expect(stops[0].ratio).toBeCloseTo(expectedRatio, 10);
    expect(stops[1].ratio).toBeCloseTo(expectedRatio, 10);
    expect(stops[2].ratio).toBeCloseTo(0, 10);
  });

  it("stress = ratio·τ_adm — the absolute reading the legend and ramp position themselves on", () => {
    const stops = shear_utilization_stops(field, section, tauAdm);
    for (const stop of stops) expect(stop.stress).toBeCloseTo(stop.ratio * tauAdm, 3);
  });
});
