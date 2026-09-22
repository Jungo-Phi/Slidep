import { describe, expect, it } from "vitest";
import { Point2 } from "../../../types";
import { DEFAULT_METADATA, DEFAULT_SIMULATION, Mechanism } from "../../../types/mechanism";
import type { BeamElement, ID, MechanicalElement } from "../../../types/element";
import type { DynamicSnapshot } from "../../../types/runtime-state";
import { RECORD_DT, compile_simulation_model, step_dynamic_simulation } from "../dynamics/simulation-engine";
import { CohesionField, CohesionSample, compute_cohesion_field } from "../recording/cohesion-field";

/**
 * Internal forces of small mechanisms at rest, against answers worked out by hand.
 * Each rig runs through the whole pipeline — dynamics, statics solve, field along the beam — so a defect anywhere between the drawing and the diagram shows up as a wrong figure here.
 * Beams are nearly weightless and every load is a 10 kg mass under gravity, so the reference ignores self-weight.
 */
const GRAVITY = new Point2(0, -9.81);
const M = 10;
const P = M * 9.81;
const COS30 = Math.cos(Math.PI / 6);
const SIN30 = 0.5;

let nextID = 0;
const id = (): ID => `00000000-0000-0000-0000-${String(++nextID).padStart(12, "0")}` as ID;

const MATERIAL = id();
const PROFILE = id();
const base = { probes: [], overlays: {} };

const pivot = (at: Point2, grounded: boolean, edges: ID[]): MechanicalElement => ({
  ...base,
  type: "pivot",
  id: id(),
  position: at,
  isGrounded: grounded,
  rotatingEdgesIDs: edges,
  fixedGearsIDs: [],
  rotationalFriction: 0,
});

const join = (at: Point2, grounded: boolean, edges: ID[]): MechanicalElement => ({
  ...base,
  type: "join",
  id: id(),
  position: at,
  isGrounded: grounded,
  fixedEdgesIDs: edges,
});

const mass = (at: Point2, edges: ID[]): MechanicalElement => ({
  ...base,
  type: "mass",
  id: id(),
  position: at,
  isGrounded: false,
  fixedEdgesIDs: edges,
  mass: M,
});

/** A grounded rail joint the beam slides through: a `slidep` also lets it turn, a `slider` does not. */
const rail = (kind: "slider" | "slidep", at: Point2, beam: ID): MechanicalElement =>
  kind === "slider"
    ? { ...base, type: "slider", id: id(), position: at, isGrounded: true, parentBeamID: beam, fixedEdgesIDs: [], slidingFriction: 0 }
    : { ...base, type: "slidep", id: id(), position: at, isGrounded: true, parentBeamID: beam, rotatingEdgesIDs: [], fixedGearsIDs: [], slidingFriction: 0, rotationalFriction: 0 };

const beam = (beamID: ID, from: Point2, to: Point2): BeamElement => ({
  ...base,
  type: "beam",
  id: beamID,
  positionStart: from,
  positionEnd: to,
  fixedNodesBodyIDs: [],
  materialID: MATERIAL,
  profileID: PROFILE,
});

function simulate(elements: MechanicalElement[], frames = 240) {
  const mechanism: Mechanism = {
    metadata: DEFAULT_METADATA,
    viewport: { scale: 1, pan: new Point2(0, 0) },
    simulation: DEFAULT_SIMULATION,
    mechanicalElements: elements,
    constraintElements: [],
    loads: [],
    // A 1 m² section so that `rho` alone is the linear mass.
    materials: [{ id: MATERIAL, name: "test", E: 210e9, Re: 235e6, rho: 0.001 }],
    profiles: [{ id: PROFILE, name: "test", shape: { kind: "rect", b: 1, h: 1 } }],
    history: [],
    future: [],
  };
  const model = compile_simulation_model(mechanism, true);
  let snapshot: DynamicSnapshot | null = null;
  for (let i = 0; i < frames; i++)
    snapshot = step_dynamic_simulation(model, i * RECORD_DT, snapshot, RECORD_DT, GRAVITY);
  return (beamID: ID): CohesionField => {
    const element = elements.find((e) => e.id === beamID) as BeamElement;
    const cohesion = snapshot!.beamCohesion!.find((c) => c.beamID === beamID)!;
    return compute_cohesion_field(element, mechanism.materials, mechanism.profiles, cohesion, [], snapshot!, GRAVITY)!;
  };
}

/** The field just before (`side = 0`) or just after (`side = 1`) abscissa `s`; away from a station both are the same sample. */
function at(field: CohesionField, s: number, side: 0 | 1 = 0): CohesionSample {
  const near = field.samples.filter((sample) => Math.abs(sample.s - s) < 1e-3 * field.length);
  if (near.length > 0) return side === 0 ? near[0] : near[near.length - 1];
  let best = field.samples[0];
  for (const sample of field.samples) if (Math.abs(sample.s - s) < Math.abs(best.s - s)) best = sample;
  return best;
}

/** Within 1 % of `reference`, or of `scale` when the reference is zero. */
function close(value: number, reference: number, scale: number = Math.abs(reference)) {
  expect(Math.abs(value - reference)).toBeLessThan(0.01 * scale);
}

function closes(field: CohesionField) {
  close(Math.hypot(field.loopResidual.fx, field.loopResidual.fy), 0, P);
  close(field.loopResidual.m, 0, P * field.length);
}

/**
 * A 1 m beam rising at `angle` from the origin: pivot at its start, a grounded rail joint at mid-span, the mass at its end.
 * With a `slidep` it is isostatic; with a `slider` it is hyperstatic of degree 1, and beam theory puts NOTHING transverse on the pivot — the slider clamps the slope where it holds the deflection, which leaves the span behind it unloaded.
 */
function overhang(kind: "slider" | "slidep", angle: number) {
  const BEAM = id();
  const dir = new Point2(Math.cos(angle), Math.sin(angle));
  const start = new Point2(0, 0);
  const end = dir;
  const b = beam(BEAM, start, end);
  const p = pivot(start, true, [BEAM]);
  const r = rail(kind, dir.mul(0.5), BEAM);
  const m = mass(end, [BEAM]);
  Object.assign(b, { fixedNodeStartID: p.id, fixedNodeEndID: m.id, fixedNodesBodyIDs: [r.id] });
  return simulate([p, b, r, m])(BEAM);
}

describe("statique de référence — poutre sur pivot et glissière", () => {
  it("porte-à-faux sur slidep : Mf culmine au slidep, nul aux deux bouts", () => {
    const field = overhang("slidep", 0);
    closes(field);
    close(at(field, 0).Mf, 0, P);
    close(Math.abs(at(field, 0.5, 1).Mf), P * 0.5);
    close(at(field, 1).Mf, 0, P);
    close(Math.abs(at(field, 0.25).T), P);
    close(Math.abs(at(field, 0.75).T), P);
  }, 30_000);

  // A rail passes no force along the beam, so the axial share of the load all goes back through the pivot.
  // Left free, that share would be indeterminate, and the minimum-energy pick would route it through the rail — the path that loads the least material.
  it("porte-à-faux incliné sur slidep : l'effort normal passe entièrement par le pivot", () => {
    const field = overhang("slidep", Math.PI / 6);
    closes(field);
    close(at(field, 0.75).N, -P * SIN30);
    close(at(field, 0.25).N, -P * SIN30);
    close(Math.abs(at(field, 0.5, 1).Mf), P * 0.5 * COS30);
  }, 30_000);

  it("porte-à-faux sur slider (hyperstatique) : le pivot ne porte rien en travers", () => {
    const field = overhang("slider", 0);
    closes(field);
    close(at(field, 0.25).T, 0, P);
    close(at(field, 0.5, 0).Mf, 0, P);
    close(Math.abs(at(field, 0.5, 1).Mf), P * 0.5);
    close(at(field, 1).Mf, 0, P);
  }, 30_000);

  it("porte-à-faux incliné sur slider : l'effort normal passe entièrement par le pivot", () => {
    const field = overhang("slider", Math.PI / 6);
    closes(field);
    close(at(field, 0.75).N, -P * SIN30);
    close(at(field, 0.25).N, -P * SIN30);
  }, 30_000);

  it("poutre sur deux appuis, slidep en bout : Mf = PL/4 à mi-portée", () => {
    const BEAM = id();
    const b = beam(BEAM, new Point2(0, 0), new Point2(1, 0));
    const p = pivot(new Point2(0, 0), true, [BEAM]);
    const r = rail("slidep", new Point2(1, 0), BEAM);
    const m = mass(new Point2(0.5, 0), [BEAM]);
    Object.assign(b, { fixedNodeStartID: p.id, fixedNodesBodyIDs: [r.id, m.id] });
    const field = simulate([p, b, r, m])(BEAM);
    closes(field);
    close(at(field, 0.5).Mf, P / 4);
    close(Math.abs(at(field, 0.25).T), P / 2);
    close(Math.abs(at(field, 0.75).T), P / 2);
    close(at(field, 1).Mf, 0, P);
  }, 30_000);
});

describe("statique de référence — cadre soudé", () => {
  it("équerre encastrée : le moment traverse la soudure, le montant travaille en compression", () => {
    const POST = id();
    const ARM = id();
    const post = beam(POST, new Point2(0, 0), new Point2(0, 1));
    const arm = beam(ARM, new Point2(0, 1), new Point2(1, 1));
    const ground = join(new Point2(0, 0), true, [POST]);
    const weld = join(new Point2(0, 1), false, [POST, ARM]);
    const m = mass(new Point2(1, 1), [ARM]);
    Object.assign(post, { fixedNodeStartID: ground.id, fixedNodeEndID: weld.id });
    Object.assign(arm, { fixedNodeStartID: weld.id, fixedNodeEndID: m.id });
    const field = simulate([ground, post, weld, arm, m], 480);

    const armField = field(ARM);
    closes(armField);
    close(Math.abs(at(armField, 0).Mf), P);
    close(at(armField, 1).Mf, 0, P);

    const postField = field(POST);
    closes(postField);
    close(Math.abs(at(postField, 0).Mf), P);
    close(Math.abs(at(postField, 1).Mf), P);
    close(at(postField, 0.5).N, -P);
    close(at(postField, 0.5).T, 0, P);
  }, 30_000);
});
