import {
  BeamCohesion,
  DynamicSnapshot,
  ID,
  LoadElement,
  LoadFrame,
  MaterialDef,
  MechanicalElement,
  Point2,
  ProfileDef,
} from "../../../types";
import type { BeamElement } from "../../../types/element";
import { snapshot_acceleration, snapshot_point, snapshot_velocity } from "../snapshot";
import {
  beam_linear_mass,
  beam_strength,
  max_fiber_stress,
  max_shear_stress,
  SectionProperties,
} from "../../../utils/section-properties";

/**
 * The internal-force field along one beam, by cut — see docs/plan-efforts-interieurs.md
 * phase 4. Pure: takes a state (this beam, its phase-3 interface torsor, the loads aimed at
 * it, and the frame's own kinematics) and returns a field. Knows nothing about drawing.
 *
 * Sign convention (see the plan's "Décisions actées"): local frame `x̂ = (end−start)/L`,
 * `ŷ = x̂` turned +90° (trig sense). Cut at abscissa `s` (0 at start, L at end), upstream part
 * `[0, s]`. `N = R_coh·x̂`, `T = R_coh·ŷ`, `Mf = M_coh·ẑ`, with `R_coh(s)` the action of the
 * downstream part on the upstream part. Reference case (simply-supported beam, load `P` at
 * mid-span): `T(L/2⁻) = −P/2`, `Mf(L/2⁻) = +PL/4` — positive `Mf` is "the beam smiles".
 */
export interface CohesionSample {
  s: number;
  N: number;
  T: number;
  Mf: number;
}

export interface CohesionExtremum {
  s: number;
  value: number;
}

export interface CohesionField {
  beamID: ID;
  length: number;
  /** Sampled points, in increasing `s` — a station's "just before"/"just after" both appear
   *  (same `s`, different values) so a discontinuity draws as a jump, never smoothed. */
  samples: CohesionSample[];
  /** Abscissas where the field is discontinuous or its slope kinks: 0, `length`, and every
   *  attached node. */
  discontinuities: number[];
  extremum: { N: CohesionExtremum; T: CohesionExtremum; Mf: CohesionExtremum };
  /**
   * The gap between this field's own `R_coh(L⁻)` (integrated all the way from `s = 0`) and
   * phase 3's OWN, independently-derived reading at the far end (`BeamCohesion.end`, sign-
   * converted the same way `start` was). Near zero on a well-converged frame; a real gap is
   * either a solver residual or — on a hyperstatic chain — expected, since XPBD then splits
   * effort by compliance and iteration order rather than true stiffness (`ChainMobility.
   * hyperstaticity`, `mobility-probe.ts`): plausible values, not necessarily correct ones.
   *
   */
  loopResidual: { fx: number; fy: number; m: number };
  /** Carried through from `BeamCohesion.determinate`: whether the boundary torsor this field
   *  marches from is a statement about the mechanism, or the solver's own account of how it
   *  got there. The march itself is exact either way — it can only be as good as its start. */
  determinate: boolean;
}

/**
 * Phase 3's `BeamCohesion.start`/`.end` read as "what this beam's OWN rigidity applies onto
 * whatever's coincident there" (the raw `LinkReaction` sense, uniform at both ends — no
 * anchor-conditional flip). Converting that into the cut torsor `R_coh` needs care, and the
 * FORCE and MOMENT components turn out to need DIFFERENT treatment, each verified
 * independently against known-correct physics rather than assumed symmetric:
 *
 * Force: `k0` sits at the start of every upstream region for any `s > 0`, so its own raw
 * reading already IS `R_coh(0⁺)` directly — no flip. `k1` sits on the downstream side of
 * every cut before `L`, so reading it at its own end needs a Newton's-third-law flip.
 * (Verified against the plan's reference case and independently against a two-force-member
 * truss joint — both need this exact asymmetry to come out consistent.)
 *
 * Moment: the underlying `LinkReaction` "torque" is computed differently from "force" in
 * `PBD_kinematic_solver` — the SAME value, reference-independent, at both of a link's ends
 * (a couple, not a per-dof impulse) — so it does not inherit force's k0-vs-k1 asymmetry.
 * Read directly it is already the couple the weld applies ONTO the beam, so `M_coh` needs a
 * flip at BOTH ends uniformly. Verified against a plain cantilever (fixed at 0, tip load at
 * L): only `Mf(0) = −start.m` reproduces the textbook `Mf(0) = −P·L`, `Mf(L) = 0`, linear
 * between — the un-flipped reading gives a moment that GROWS toward the free tip instead of
 * tapering to zero there, the wrong shape entirely, not just the wrong sign.
 */
function r_coh_start(cohesion: BeamCohesion): { fx: number; fy: number; m: number } {
  return { fx: cohesion.start.fx, fy: cohesion.start.fy, m: -cohesion.start.m };
}

/** The mirror of `r_coh_start` at the far end: the same reading, taken at the other boundary
 *  of the same body, and flipped by Newton's third law — see `r_coh_start` for why the force
 *  needs that flip and the moment does not. `beam-cohesion.ts` has already freed both ends of
 *  the solver's own boundary artefacts (the endpoint mass lump, a distributed load's nodal
 *  share), so nothing is added back here. */
function r_coh_end(cohesion: BeamCohesion): { fx: number; fy: number; m: number } {
  return { fx: -cohesion.end.fx, fy: -cohesion.end.fy, m: -cohesion.end.m };
}

function resolve_frame_vector(vector: Point2, frame: LoadFrame, snapshot: DynamicSnapshot): Point2 {
  if (frame === "world") return vector;
  const start = snapshot_point(snapshot, `${frame.edgeID}:start`);
  const end = snapshot_point(snapshot, `${frame.edgeID}:end`);
  const delta = start && end ? end.sub(start) : undefined;
  const xhat = delta && delta.length() > 1e-9 ? delta.normalize() : new Point2(1, 0);
  const yhat = xhat.perp();
  return xhat.mul(vector.x).add(yhat.mul(vector.y));
}

/** A force applied directly to the beam material at one abscissa (0 or `length`) — never
 *  interior: a `ForceElement` only ever anchors on `"start"`/`"end"`; an interior point
 *  action can only arrive through an attached node (`BeamCohesion.attachedNodes`). */
interface PointAction {
  s: number;
  force: Point2;
}

function direct_point_actions(
  beam: BeamElement,
  loads: LoadElement[],
  snapshot: DynamicSnapshot,
  length: number,
): PointAction[] {
  const actions: PointAction[] = [];
  for (const load of loads) {
    if (load.targetID !== beam.id) continue;
    if (load.type === "force" && (load.anchor === "start" || load.anchor === "end")) {
      const force = resolve_frame_vector(load.vector, load.frame, snapshot);
      actions.push({ s: load.anchor === "start" ? 0 : length, force });
    } else if (load.type === "moment") {
      // Never a genuine point couple: this solver has no rotational dof for a beam, so
      // `resolve_load_forces` realizes a moment as an equal-and-opposite force pair at the
      // two ends (see load-model.ts's "couple" case) — mirrored here exactly, so the field
      // sees precisely what the dynamics step itself applies.
      if (length < 1e-9) continue;
      const torque = -load.value; // data model: positive = clockwise; solver: the opposite.
      const start = snapshot_point(snapshot, `${beam.id}:start`);
      const end = snapshot_point(snapshot, `${beam.id}:end`);
      if (!start || !end) continue;
      const yhat = end.sub(start).normalize().perp();
      const k = torque / length;
      actions.push({ s: 0, force: yhat.mul(-k) });
      actions.push({ s: length, force: yhat.mul(k) });
    }
  }
  return actions;
}

/** Density (force per unit length) at the beam's two ends: self-weight net of d'Alembert
 *  inertia (`μ·(g − a(s))`, phase 1/2) plus every `distributed-force` load aimed at the
 *  beam, each resolved to world and evaluated at its own `magnitudeStart`/`magnitudeEnd` —
 *  the exact trapezoidal shape (`resolve_load_forces` now solves with an equivalent, not an
 *  approximate, nodal split for the same shape — see its own doc). */
function density_at_ends(
  beam: BeamElement,
  loads: LoadElement[],
  snapshot: DynamicSnapshot,
  gravity: Point2,
  start: Point2,
  end: Point2,
  length: number,
  linearMass: number,
): { w0: Point2; w1: Point2 } {
  const vStart = snapshot_velocity(snapshot, `${beam.id}:start`) ?? new Point2(0, 0);
  const vEnd = snapshot_velocity(snapshot, `${beam.id}:end`) ?? new Point2(0, 0);
  const aStart = snapshot_acceleration(snapshot, `${beam.id}:start`) ?? new Point2(0, 0);
  const aEnd = snapshot_acceleration(snapshot, `${beam.id}:end`) ?? new Point2(0, 0);
  const xhat = end.sub(start).normalize();
  const yhat = xhat.perp();
  const omega = length > 1e-9 ? vEnd.sub(vStart).dot(yhat) / length : 0;
  const alpha = length > 1e-9 ? aEnd.sub(aStart).dot(yhat) / length : 0;
  // The rigid-body field, written about the beam's CENTRE rather than about its start.
  //
  // The two are the same field whenever the frame's recorded accelerations satisfy rigidity —
  // `a(σ)` is affine, so its mean over the span is its midpoint value. They differ when they do
  // not, and then anchoring on `aStart` inherits that one endpoint's whole error: measured on a
  // freely spinning beam, an endpoint reading 27× short of its own centripetal acceleration
  // turned a pure tension into a monotone compression. The centre is the average of both ends,
  // so it carries half of each error instead of all of one — and it is the same figure the
  // beam's Newton equation uses (`equilibrium-solve.ts`), which is what keeps the march and
  // the torsor it starts from talking about one body.
  const aCentre = aStart.lerp(aEnd, 0.5);
  const a_of = (s: number) => {
    const fromCentre = s - length / 2;
    return aCentre
      .add(yhat.mul(alpha * fromCentre))
      .sub(xhat.mul(omega * omega * fromCentre));
  };

  let w0 = gravity.sub(a_of(0)).mul(linearMass);
  let w1 = gravity.sub(a_of(length)).mul(linearMass);

  for (const load of loads) {
    if (load.type !== "distributed-force" || load.targetID !== beam.id) continue;
    const direction = resolve_frame_vector(load.direction, load.frame, snapshot);
    w0 = w0.add(direction.mul(load.magnitudeStart));
    w1 = w1.add(direction.mul(load.magnitudeEnd));
  }
  return { w0, w1 };
}

/** Every discontinuity abscissa (length units, clamped to `[0, length]`) with the point
 *  action(s) landing there, grouped so two coincident actions do not open a zero-length
 *  segment. Always includes 0 and `length`, even with nothing to report there. */
function build_stations(
  length: number,
  cohesion: BeamCohesion,
  direct: PointAction[],
): { s: number; force: Point2 }[] {
  const byS = new Map<number, Point2>();
  const add = (s: number, force: Point2) => {
    const clamped = Math.max(0, Math.min(length, s));
    byS.set(clamped, (byS.get(clamped) ?? new Point2(0, 0)).add(force));
  };
  add(0, new Point2(0, 0));
  add(length, new Point2(0, 0));
  for (const node of cohesion.attachedNodes) add(node.s * length, new Point2(node.fx, node.fy));
  for (const action of direct) add(action.s, action.force);
  return [...byS.entries()].sort((a, b) => a[0] - b[0]).map(([s, force]) => ({ s, force }));
}

export function compute_cohesion_field(
  beam: BeamElement,
  materials: MaterialDef[],
  profiles: ProfileDef[],
  cohesion: BeamCohesion,
  loads: LoadElement[],
  snapshot: DynamicSnapshot,
  gravity: Point2,
  samplesPerSegment: number = 20,
): CohesionField | undefined {
  const start = snapshot_point(snapshot, `${beam.id}:start`);
  const end = snapshot_point(snapshot, `${beam.id}:end`);
  if (!start || !end) return undefined;
  const length = end.sub(start).length();
  if (length < 1e-9) return undefined;
  const xhat = end.sub(start).normalize();
  const yhat = xhat.perp();

  const linearMass = beam_linear_mass(
    beam.materialID,
    beam.profileID,
    materials,
    profiles,
  );
  const direct = direct_point_actions(beam, loads, snapshot, length);
  const { w0, w1 } = density_at_ends(
    beam,
    loads,
    snapshot,
    gravity,
    start,
    end,
    length,
    linearMass,
  );
  const slope = w1.sub(w0).mul(1 / length); // dw/ds, constant — w is affine over the WHOLE beam
  const stations = build_stations(length, cohesion, direct);

  const samples: CohesionSample[] = [];
  const toNTM = (R: Point2, Mf: number): CohesionSample => ({ s: NaN, N: R.dot(xhat), T: R.dot(yhat), Mf });

  const r0 = r_coh_start(cohesion);
  let R: Point2 = new Point2(r0.fx, r0.fy);
  let Mf = r0.m;

  for (let i = 0; i < stations.length; i++) {
    const station = stations[i];
    const next = stations[i + 1];
    // Jump the running torsor by this station's own point action — except at a BOUNDARY
    // (s = 0 or s = length, symmetric): whatever sits exactly there already shows up in
    // `cohesion.start`/`.end` (the true reaction if anchored; if free, its exact negative,
    // since a free dof's net force is zero at rest). Subtracting it here too would double it.
    if (next && i > 0) R = R.sub(station.force);
    const before = toNTM(R, Mf);
    before.s = station.s;
    samples.push(before);

    if (!next) break;
    const segmentLength = next.s - station.s;
    const w_a = w0.add(slope.mul(station.s)); // density AT this station
    const nSamples = Math.max(2, Math.round(samplesPerSegment * (segmentLength / length)));
    const R_a = R;
    const Mf_a = Mf;
    const T_a = R_a.dot(yhat);
    for (let k = 1; k <= nSamples; k++) {
      const u = (segmentLength * k) / nSamples;
      const Ru = R_a.sub(w_a.mul(u)).sub(slope.mul(0.5 * u * u));
      const w_a_y = w_a.dot(yhat);
      const slope_y = slope.dot(yhat);
      const Mfu = Mf_a - T_a * u + (w_a_y / 2) * u * u + (slope_y / 6) * u * u * u;
      const sample = toNTM(Ru, Mfu);
      sample.s = station.s + u;
      samples.push(sample);
      if (k === nSamples) {
        R = Ru;
        Mf = Mfu;
      }
    }
  }

  const extremumOf = (pick: (s: CohesionSample) => number): CohesionExtremum => {
    let best = samples[0];
    for (const sample of samples) if (Math.abs(pick(sample)) > Math.abs(pick(best))) best = sample;
    return { s: best.s, value: pick(best) };
  };

  const rL = r_coh_end(cohesion);
  const RL_expected = new Point2(rL.fx, rL.fy);
  const loopResidual = {
    fx: R.x - RL_expected.x,
    fy: R.y - RL_expected.y,
    m: Mf - rL.m,
  };

  return {
    beamID: beam.id,
    length,
    samples,
    discontinuities: stations.map((s) => s.s),
    extremum: {
      N: extremumOf((s) => s.N),
      T: extremumOf((s) => s.T),
      Mf: extremumOf((s) => s.Mf),
    },
    loopResidual,
    determinate: cohesion.determinate,
  };
}

/**
 * `|σ|max(s)` at every sample of `field` — the stress overlay's own field, one reading per
 * `field.samples` entry, `offset` its fraction of `field.length` (0 at `start`). Carries both
 * `stress` (Pa, absolute — what the overlay's ramp positions itself against, and what its
 * legend labels) and `ratio` (`stress/Re` — what decides overstress, a per-beam boundary the
 * absolute value alone cannot). Stays un-colored on purpose: this is still the physics half,
 * same as the rest of this file — the canvas overlay picks colors from it.
 */
export function stress_utilization_stops(
  field: CohesionField,
  section: SectionProperties,
  Re: number,
): { offset: number; ratio: number; stress: number }[] {
  return field.samples.map((sample) => {
    const stress = max_fiber_stress(sample.N, sample.Mf, section);
    return { offset: sample.s / field.length, ratio: stress / Re, stress };
  });
}

/**
 * `τ_max(s) = |T|·Q/(I·b)` at every sample of `field`, at the neutral axis — the `shear` lens'
 * own field, docs/plan-efforts-interieurs.md phase 9 chantier 2. Same shape as
 * `stress_utilization_stops`: `ratio = τ_max/τ_adm` decides overstress, `stress` is the
 * absolute reading the ramp/legend position themselves on. `τ_adm` is passed in, not derived
 * here — chantier 2 tranché on `Re/√3` (von Mises reduced to pure shear), but this function
 * stays agnostic of which constant a caller chooses.
 */
export function shear_utilization_stops(
  field: CohesionField,
  section: SectionProperties,
  tauAdm: number,
): { offset: number; ratio: number; stress: number }[] {
  return field.samples.map((sample) => {
    const stress = max_shear_stress(sample.T, section);
    return { offset: sample.s / field.length, ratio: stress / tauAdm, stress };
  });
}

/**
 * `N(s)/A` at every sample of `field`, signed — docs/plan-efforts-interieurs.md phase 9. Same
 * sign as `N` itself (traction positive, compression negative): `A > 0` always, so dividing by
 * it never flips it. Un-coloured on purpose, same as `stress_utilization_stops`.
 */
export function normal_stress_stops(
  field: CohesionField,
  section: SectionProperties,
): { offset: number; stress: number }[] {
  return field.samples.map((sample) => ({
    offset: sample.s / field.length,
    stress: sample.N / section.A,
  }));
}

/**
 * `Mf(s)·v/I` at every sample of `field`, signed — docs/plan-efforts-interieurs.md phase 9.
 * Keeps `Mf`'s own sign convention (positive when the beam smiles, `v > 0` its own extreme
 * fibre) rather than picking a fibre and evaluating `±`: a single overlay reading needs one
 * signed value per cut, not two fibre stresses.
 */
export function bending_stress_stops(
  field: CohesionField,
  section: SectionProperties,
): { offset: number; stress: number }[] {
  return field.samples.map((sample) => ({
    offset: sample.s / field.length,
    stress: (sample.Mf * section.v) / section.I,
  }));
}

/** `τ_adm = Re/√3` — von Mises reduced to pure shear, docs/plan-efforts-interieurs.md phase 9
 *  chantier 2. Not a coefficient-of-safety choice, same reasoning as `σ_adm = Re` for
 *  `max_fiber_stress`: this is what the criterion itself gives for shear alone, not a second
 *  margin stacked on top. */
export function shear_admissible_stress(Re: number): number {
  return Re / Math.sqrt(3);
}

/**
 * The shared scale of every beam-fill lens (phase 9, formerly phase 6 alone): the highest
 * magnitude ever RECORDED for each of the four, across every beam — `maxStress`/`maxShear`
 * (Pa, absolute, not a ratio — `stress_utilization_stops`/`shear_utilization_stops`'s own
 * `ratio` stays the per-beam overstress check, this cache only ever positions the ramp),
 * `maxNormal` (`|N/A|`, Pa) and `maxBending` (`|Mf·v/I|`, Pa). Absolute rather than `/Re` (or
 * `/τ_adm`) on purpose: both differ beam to beam, so a ratio-based scale could not be labelled
 * with one honest number, and the legend showing a real stress reads far more informative than
 * a bare percentage.
 *
 * Scanning the full recording instead of the current frame means each scale only ever ratchets
 * UP, and only when a genuinely new peak is recorded — never from scrubbing, panning, or
 * zooming. Without this, a lightly-loaded mechanism reads as flat/neutral everywhere, with no
 * contrast between its own more- and less-loaded members.
 *
 * `maxStress`/`maxShear`'s own contributions are each capped at ITS OWN beam's `Re`/`τ_adm`
 * before folding into the running max — otherwise a single grossly overstressed beam (already
 * flat `STRESS_OVERSTRESS_COLOR`, wherever it falls) would drag the scale far past any elastic
 * limit actually in play, and everything else washes back out to flat blue: the exact
 * regression this cache exists to fix, just triggered by an outlier instead of by a lightly-
 * loaded mechanism. `maxNormal`/`maxBending` have no such per-beam ceiling — no threshold of
 * their own to cap at, they are read on their own colour scale rather than checked against a
 * limit.
 */
export interface StressScaleCache {
  elements: MechanicalElement[];
  loads: LoadElement[];
  /** Number of snapshots consumed, and the last one consumed — its identity is what tells an
   *  append apart from a rewritten history, same test `TrajectoryCache` uses. */
  consumed: number;
  boundary: DynamicSnapshot | null;
  /** Highest `|σ|max` recorded so far, Pa — each sample capped at its own beam's `Re` first
   *  (see this interface's own doc). 0 until at least one beam with a resolvable
   *  material/profile has been recorded — drawing treats that as "nothing to scale yet". */
  maxStress: number;
  /** Highest `|N/A|` recorded so far, Pa. 0 until a resolvable beam has been recorded. */
  maxNormal: number;
  /** Highest `|Mf·v/I|` recorded so far, Pa. 0 until a resolvable beam has been recorded. */
  maxBending: number;
  /** Highest `τ_max` recorded so far, Pa — each sample capped at its own beam's `τ_adm` first,
   *  same reasoning as `maxStress`. 0 until a resolvable beam has been recorded. */
  maxShear: number;
}

export const EMPTY_STRESS_SCALE_CACHE: StressScaleCache = {
  elements: [],
  loads: [],
  consumed: 0,
  boundary: null,
  maxStress: 0,
  maxNormal: 0,
  maxBending: 0,
  maxShear: 0,
};

/**
 * Extends the cache with whatever snapshots were recorded since the last call — never rebuilds
 * from scratch on an append, same reasoning as `extend_probe_trajectories`: redoing the whole
 * history every frame would cost the square of the recording's length. Anything else (elements
 * or loads edited, history truncated or reset) rebuilds from scratch. One field computed per
 * beam per snapshot, feeding all four running maxima at once — the four lenses never need more
 * than one `compute_cohesion_field` call each.
 */
export function extend_stress_scale(
  cache: StressScaleCache,
  elements: MechanicalElement[],
  loads: LoadElement[],
  snapshots: DynamicSnapshot[],
  gravity: Point2,
  materials: MaterialDef[],
  profiles: ProfileDef[],
): StressScaleCache {
  const appendable =
    cache.elements === elements &&
    cache.loads === loads &&
    snapshots.length >= cache.consumed &&
    (cache.consumed === 0 || snapshots[cache.consumed - 1] === cache.boundary);

  const beams = elements.filter((el): el is BeamElement => el.type === "beam");
  let maxStress = appendable ? cache.maxStress : 0;
  let maxNormal = appendable ? cache.maxNormal : 0;
  let maxBending = appendable ? cache.maxBending : 0;
  let maxShear = appendable ? cache.maxShear : 0;

  for (let i = appendable ? cache.consumed : 0; i < snapshots.length; i++) {
    const snapshot = snapshots[i];
    for (const beam of beams) {
      const cohesion = snapshot.beamCohesion?.find((c) => c.beamID === beam.id);
      if (!cohesion) continue;
      const strength = beam_strength(beam.materialID, beam.profileID, materials, profiles);
      if (!strength) continue;
      const field = compute_cohesion_field(
        beam,
        materials,
        profiles,
        cohesion,
        loads,
        snapshot,
        gravity,
      );
      if (!field) continue;
      const tauAdm = shear_admissible_stress(strength.Re);
      for (const sample of field.samples) {
        const stress = Math.min(
          max_fiber_stress(sample.N, sample.Mf, strength.section),
          strength.Re,
        );
        if (stress > maxStress) maxStress = stress;
        const normal = Math.abs(sample.N) / strength.section.A;
        if (normal > maxNormal) maxNormal = normal;
        const bending = (Math.abs(sample.Mf) * strength.section.v) / strength.section.I;
        if (bending > maxBending) maxBending = bending;
        const shear = Math.min(max_shear_stress(sample.T, strength.section), tauAdm);
        if (shear > maxShear) maxShear = shear;
      }
    }
  }

  return {
    elements,
    loads,
    consumed: snapshots.length,
    boundary: snapshots.length > 0 ? snapshots[snapshots.length - 1] : null,
    maxStress,
    maxNormal,
    maxBending,
    maxShear,
  };
}
