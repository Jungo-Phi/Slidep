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
import { EMPTY_WORST_BEAM_SERIES } from "../../../types/runtime-state";
import type {
  BeamReadingBuffer,
  BeamReadingKey,
  BeamStressSeries,
  StressScaleCache,
  WorstBeamSeries,
} from "../../../types/runtime-state";
import { snapshot_acceleration, snapshot_point, snapshot_velocity } from "../snapshot";
import {
  beam_linear_mass,
  beam_strength,
  max_fiber_stress,
  max_shear_stress,
  SectionProperties,
} from "../../../utils/section-properties";

/**
 * The internal-force field along one beam, by cut — see docs/plan-efforts-interieurs.md phase 4.
 * Pure: takes a state (this beam, its phase-3 interface torsor, the loads aimed at it, and the frame's own kinematics) and returns a field.
 * Knows nothing about drawing.
 *
 * Sign convention (see the plan's "Décisions actées"): local frame `x̂ = (end−start)/L`, `ŷ = x̂` turned +90° (trig sense).
 * Cut at abscissa `s` (0 at start, L at end), upstream part `[0, s]`.
 * `N = R_coh·x̂`, `T = R_coh·ŷ`, `Mf = M_coh·ẑ`, with `R_coh(s)` the action of the downstream part on the upstream part.
 * Reference case (simply-supported beam, load `P` at mid-span): `T(L/2⁻) = −P/2`, `Mf(L/2⁻) = +PL/4` — positive `Mf` is "the beam smiles".
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
   * (same `s`, different values) so a discontinuity draws as a jump, never smoothed. */
  samples: CohesionSample[];
  /** Abscissas where the field is discontinuous or its slope kinks: 0, `length`, and every
   * attached node. */
  discontinuities: number[];
  extremum: { N: CohesionExtremum; T: CohesionExtremum; Mf: CohesionExtremum };
  /**
   * The gap between this field's own `R_coh(L⁻)` (integrated all the way from `s = 0`) and phase 3's OWN, independently-derived reading at the far end (`BeamCohesion.end`, sign- converted the same way `start` was).
   * Near zero on a well-converged frame; a real gap is either a solver residual or — on a hyperstatic chain — expected, since XPBD then splits effort by compliance and iteration order rather than true stiffness (`ChainMobility. hyperstaticity`, `mobility-probe.ts`): plausible values, not necessarily correct ones.
   *
   */
  loopResidual: { fx: number; fy: number; m: number };
  /** Carried through from `BeamCohesion.determinate`: whether the boundary torsor this field
   * marches from is a statement about the mechanism, or the solver's own account of how it got there.
   * The march itself is exact either way — it can only be as good as its start. */
  determinate: boolean;
}

/**
 * `BeamCohesion.start`/`.end` hold one reading in one sense at both ends and for all three components (`publish.ts`): what the beam applies onto whatever is coincident there.
 * The cut torsor `R_coh(s)` is the action of the downstream part on the upstream one, and at `s = 0` the beam itself IS that downstream part — so its own outward action there already is `R_coh(0⁺)`, while at `s = L` it is that action's Newton's-third-law opposite.
 * Hence an identity here and a plain negation in `r_coh_end`: two mirrors of one rule, not two rules.
 *
 * Both ends are pinned by a reference case, since the march itself never reads the far one and so cannot expose a sign error there: a cantilever fixed at 0 under a tip load must give the textbook `Mf(0) = −P·L` tapering to zero at the free tip, and its mirror — fixed at its END, loaded at its start — must give `Mf(L) = −P·L` and close `loopResidual`, the only shape that tests the far end at all, `Mf(L)` being zero in every other one.
 */
function r_coh_start(cohesion: BeamCohesion): { fx: number; fy: number; m: number } {
  return { fx: cohesion.start.fx, fy: cohesion.start.fy, m: cohesion.start.m };
}

/** The mirror of `r_coh_start` at the far end: the same reading, taken at the other boundary
 * of the same body, and flipped by Newton's third law — see `r_coh_start` for why this end needs that flip and the other one does not.
 * `beam-cohesion.ts` has already freed both ends of the solver's own boundary artefacts (the endpoint mass lump, a distributed load's nodal share), so nothing is added back here. */
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
 * interior: a `ForceElement` only ever anchors on `"start"`/`"end"`; an interior point action can only arrive through an attached node (`BeamCohesion.attachedNodes`). */
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
      // Never a genuine point couple: this solver has no rotational dof for a beam, so `resolve_load_forces` realizes a moment as an equal-and-opposite force pair at the two ends (see load-model.ts's "couple" case) — mirrored here exactly, so the field sees precisely what the dynamics step itself applies.
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
 * inertia (`μ·(g − a(s))`, phase 1/2) plus every `distributed-force` load aimed at the beam, each resolved to world and evaluated at its own `magnitudeStart`/`magnitudeEnd` — the exact trapezoidal shape (`resolve_load_forces` now solves with an equivalent, not an approximate, nodal split for the same shape — see its own doc). */
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
  // The two are the same field whenever the frame's recorded accelerations satisfy rigidity — `a(σ)` is affine, so its mean over the span is its midpoint value.
  // They differ when they do not, and then anchoring on `aStart` inherits that one endpoint's whole error: measured on a freely spinning beam, an endpoint reading 27× short of its own centripetal acceleration turned a pure tension into a monotone compression.
  // The centre is the average of both ends, so it carries half of each error instead of all of one — and it is the same figure the beam's Newton equation uses (`equilibrium-solve.ts`), which is what keeps the march and the torsor it starts from talking about one body.
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
 * action(s) landing there, grouped so two coincident actions do not open a zero-length segment.
 * Always includes 0 and `length`, even with nothing to report there. */
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
    // Jump the running torsor by this station's own point action — except at a BOUNDARY (s = 0 or s = length, symmetric): whatever sits exactly there already shows up in `cohesion.start`/`.end` (the true reaction if anchored; if free, its exact negative, since a free dof's net force is zero at rest).
    // Subtracting it here too would double it.
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
 * The field's reading at the sample nearest `s`, in metres from the beam's start.
 * Nearest rather than interpolated: a station's "just before" and "just after" sit at the very same abscissa with different values (`CohesionField.samples`), so averaging across one would invent a reading the beam never has.
 */
export function cohesion_sample_at(
  field: CohesionField,
  s: number,
): CohesionSample | undefined {
  let best: CohesionSample | undefined;
  for (const sample of field.samples)
    if (!best || Math.abs(sample.s - s) < Math.abs(best.s - s)) best = sample;
  return best;
}

/**
 * `|σ|max(s)` at every sample of `field` — the stress overlay's own field, one reading per `field.samples` entry, `offset` its fraction of `field.length` (0 at `start`).
 * Carries both `stress` (Pa, absolute — what the overlay's ramp positions itself against, and what its legend labels) and `ratio` (`stress/Re` — what decides overstress, a per-beam boundary the absolute value alone cannot).
 * Stays un-colored on purpose: this is still the physics half, same as the rest of this file — the canvas overlay picks colors from it.
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
 * `τ_max(s) = |T|·Q/(I·b)` at every sample of `field`, at the neutral axis — the `shear` lens' own field, docs/plan-efforts-interieurs.md phase 9 chantier 2.
 * Same shape as `stress_utilization_stops`: `ratio = τ_max/τ_adm` decides overstress, `stress` is the absolute reading the ramp/legend position themselves on.
 * `τ_adm` is passed in, not derived here — chantier 2 settled on `Re/√3` (von Mises reduced to pure shear), but this function stays agnostic of which constant a caller chooses.
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
 * `N(s)/A` at every sample of `field`, signed — docs/plan-efforts-interieurs.md phase 9.
 * Same sign as `N` itself (traction positive, compression negative): `A > 0` always, so dividing by it never flips it.
 * Un-coloured on purpose, same as `stress_utilization_stops`.
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
 * Keeps `Mf`'s own sign convention (positive when the beam smiles, `v > 0` its own extreme fibre) rather than picking a fibre and evaluating `±`: a single overlay reading needs one signed value per cut, not two fibre stresses.
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
 * chantier 2.
 * Not a coefficient-of-safety choice, same reasoning as `σ_adm = Re` for `max_fiber_stress`: this is what the criterion itself gives for shear alone, not a second margin stacked on top. */
export function shear_admissible_stress(Re: number): number {
  return Re / Math.sqrt(3);
}

const GROWTH_FLOOR = 256;

/** `buffer`, long enough to hold `needed` entries — the same one when it already is, a doubled copy otherwise.
 * Doubling makes the whole recording's worth of appends cost O(n) in total rather than O(n²). */
function grown(buffer: Float64Array, needed: number): Float64Array {
  if (buffer.length >= needed) return buffer;
  let size = Math.max(buffer.length, GROWTH_FLOOR);
  while (size < needed) size *= 2;
  const bigger = new Float64Array(size);
  bigger.set(buffer);
  return bigger;
}

function empty_reading(): BeamReadingBuffer {
  return { value: new Float64Array(0), s: new Float64Array(0) };
}

function empty_series(): BeamStressSeries {
  return {
    N: empty_reading(),
    T: empty_reading(),
    Mf: empty_reading(),
    sigma: empty_reading(),
    tau: empty_reading(),
  };
}

const READING_KEYS: BeamReadingKey[] = ["N", "T", "Mf", "sigma", "tau"];

/** `series` with every buffer long enough for `needed` instants, the new tail filled with `NaN` so an instant never folded in reads as "no value" rather than as 0. */
function grown_series(series: BeamStressSeries, needed: number): BeamStressSeries {
  const grown_one = (reading: BeamReadingBuffer): BeamReadingBuffer => {
    const value = grown(reading.value, needed);
    if (value === reading.value) return reading;
    value.fill(NaN, reading.value.length);
    const s = grown(reading.s, needed);
    s.fill(NaN, reading.s.length);
    return { value, s };
  };
  const out = {} as BeamStressSeries;
  for (const key of READING_KEYS) out[key] = grown_one(series[key]);
  return out;
}

/** `grown`'s counterpart for a flag buffer. */
function grown_flags(buffer: Uint8Array, needed: number): Uint8Array {
  if (buffer.length >= needed) return buffer;
  let size = Math.max(buffer.length, GROWTH_FLOOR);
  while (size < needed) size *= 2;
  const bigger = new Uint8Array(size);
  bigger.set(buffer);
  return bigger;
}

/** `worst` with every buffer long enough for `needed` instants, the new tail reading as "no beam could be read here". */
function grown_worst(worst: WorstBeamSeries, needed: number): WorstBeamSeries {
  if (worst.ratio.length >= needed) return worst;
  const ratio = grown(worst.ratio, needed);
  ratio.fill(NaN, worst.ratio.length);
  const s = grown(worst.s, needed);
  s.fill(NaN, worst.s.length);
  return {
    ratio,
    beamID: worst.beamID,
    s,
    determinate: grown_flags(worst.determinate, needed),
  };
}

/** An instant's own empty worst case, for a mechanism with no readable beam at it. */
const NO_WORST = { ratio: -1, beamID: null as ID | null, s: 0, determinate: false };

/** Writes one instant’s worst case, or leaves it reading “no beam could be read here” when nothing was. */
function put_worst(
  worst: WorstBeamSeries,
  i: number,
  at: { ratio: number; beamID: ID | null; s: number; determinate: boolean },
): void {
  if (at.beamID === null) return;
  worst.ratio[i] = at.ratio;
  worst.beamID[i] = at.beamID;
  worst.s[i] = at.s;
  worst.determinate[i] = at.determinate ? 1 : 0;
}

/** Writes one instant's reading into `buffer` at `i`. Indexed, never pushed — see `BeamReadingBuffer`. */
function put(buffer: BeamReadingBuffer, i: number, value: number, s: number): void {
  buffer.value[i] = value;
  buffer.s[i] = s;
}

/**
 * Extends the cache with whatever snapshots were recorded since the last call — never rebuilds from scratch on an append, same reasoning as `extend_probe_trajectories`: redoing the whole history every frame would cost the square of the recording's length.
 * Anything else (elements or loads edited, history truncated or reset) rebuilds from scratch.
 *
 * One field computed per beam per snapshot, feeding the four running maxima AND that beam's own series at once — the four lenses and the five dimensioning charts never need more than one `compute_cohesion_field` call between them.
 *
 * Re-running it over instants already folded in is harmless: every write is indexed by the instant's own position (see `BeamReadingBuffer`) and the maxima only ever ratchet up, so a second pass writes the same values into the same slots.
 * Which means a caller may hand it the same recording twice without having to know whether it already folded it in.
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

  const count = snapshots.length;
  const t = grown(appendable ? cache.t : new Float64Array(0), count);
  const worstStress = grown_worst(
    appendable ? cache.worstStress : EMPTY_WORST_BEAM_SERIES,
    count,
  );
  const worstShear = grown_worst(
    appendable ? cache.worstShear : EMPTY_WORST_BEAM_SERIES,
    count,
  );
  // A rebuild starts its series empty rather than growing what the cache holds: an index into them means a position in one specific recording, and a rebuild answers for a different one.
  const series = new Map<ID, BeamStressSeries>();
  for (const beam of beams)
    series.set(
      beam.id,
      grown_series(
        (appendable ? cache.beams.get(beam.id) : undefined) ?? empty_series(),
        count,
      ),
    );

  for (let i = appendable ? cache.consumed : 0; i < count; i++) {
    const snapshot = snapshots[i];
    t[i] = snapshot.t;
    // Which beam of this instant is closest to each of its two limits, filled in as the beams go by.
    const atStress = { ...NO_WORST };
    const atShear = { ...NO_WORST };
    for (const beam of beams) {
      // Left at NaN by `grown_series`, which is what an instant with nothing to say reads as.
      const buffers = series.get(beam.id)!;
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

      // The three efforts: the field already knows where each one peaks along the span.
      put(buffers.N, i, field.extremum.N.value, field.extremum.N.s);
      put(buffers.T, i, field.extremum.T.value, field.extremum.T.s);
      put(buffers.Mf, i, field.extremum.Mf.value, field.extremum.Mf.s);

      // The two stresses have no such extremum of their own — σ folds N and Mf together, so where IT peaks is neither's own peak — and are tracked across the samples here.
      let peakStress = -1;
      let peakStressAt = 0;
      let peakShear = -1;
      let peakShearAt = 0;
      for (const sample of field.samples) {
        const stress = max_fiber_stress(sample.N, sample.Mf, strength.section);
        if (stress > peakStress) {
          peakStress = stress;
          peakStressAt = sample.s;
        }
        const shear = max_shear_stress(sample.T, strength.section);
        if (shear > peakShear) {
          peakShear = shear;
          peakShearAt = sample.s;
        }
        // The running maxima take the same readings CAPPED, the charts take them raw — see `StressScaleCache`'s own doc for why a ramp needs the ceiling and a chart must not have it.
        const capped = Math.min(stress, strength.Re);
        if (capped > maxStress) maxStress = capped;
        const normal = Math.abs(sample.N) / strength.section.A;
        if (normal > maxNormal) maxNormal = normal;
        const bending = (Math.abs(sample.Mf) * strength.section.v) / strength.section.I;
        if (bending > maxBending) maxBending = bending;
        const cappedShear = Math.min(shear, tauAdm);
        if (cappedShear > maxShear) maxShear = cappedShear;
      }
      if (peakStress >= 0) put(buffers.sigma, i, peakStress, peakStressAt);
      if (peakShear >= 0) put(buffers.tau, i, peakShear, peakShearAt);

      // Ranked by the ratio, not by the stress — see `WorstBeamSeries`.
      const stressRatio = peakStress / strength.Re;
      if (stressRatio > atStress.ratio) {
        atStress.ratio = stressRatio;
        atStress.beamID = beam.id;
        atStress.s = peakStressAt;
        atStress.determinate = cohesion.determinate;
      }
      const shearRatio = peakShear / tauAdm;
      if (shearRatio > atShear.ratio) {
        atShear.ratio = shearRatio;
        atShear.beamID = beam.id;
        atShear.s = peakShearAt;
        atShear.determinate = cohesion.determinate;
      }
    }
    put_worst(worstStress, i, atStress);
    put_worst(worstShear, i, atShear);
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
    t,
    count,
    beams: series,
    worstStress,
    worstShear,
  };
}
