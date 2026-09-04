import { describe, expect, it } from "vitest";
import { DEFAULT_METADATA, DEFAULT_SIMULATION, Mechanism } from "../../../types/mechanism";
import { Point2 } from "../../../types/point2";
import type {
  BeamElement,
  GearElement,
  ID,
  JoinElement,
  MassElement,
  MechanicalElement,
  PivotElement,
} from "../../../types/element";
import type { MaterialDef, ProfileDef } from "../../../types/material";
import { build_collision_candidates } from "./collision-candidates";

/**
 * Structural exclusions: what `build_collision_candidates` must never propose as a
 * collision, because it is already held together by a real constraint. Uses the identity
 * key map (no coincidence fusion) — the exclusions under test read raw `fixedNodesBodyIDs`/
 * `meshedGearsIDs`/`parentAxleID`, not fused keys, so fusion is orthogonal to what is
 * checked here (it is exercised end-to-end through `compile_simulation_model` elsewhere).
 */

let nextID = 0;
const id = (): ID =>
  `00000000-0000-0000-0000-${String(++nextID).padStart(12, "0")}` as ID;

const pivot = (
  pid: ID,
  position: Point2,
  extra: Partial<PivotElement> = {},
): PivotElement => ({
  type: "pivot",
  id: pid,
  probes: [],
  overlays: {},
  position,
  isGrounded: true,
  rotatingEdgesIDs: [],
  fixedGearsIDs: [],
  rotationalFriction: 0,
  ...extra,
});

const join = (jid: ID, position: Point2): JoinElement => ({
  type: "join",
  id: jid,
  probes: [],
  overlays: {},
  position,
  isGrounded: false,
  fixedEdgesIDs: [],
});

const mass = (mid: ID, position: Point2): MassElement => ({
  type: "mass",
  id: mid,
  probes: [],
  overlays: {},
  position,
  isGrounded: false,
  fixedEdgesIDs: [],
  mass: 1,
});

const MATERIAL_ID = id();
const PROFILE_ID = id();
const MATERIALS: MaterialDef[] = [
  { id: MATERIAL_ID, name: "test", E: 210e9, Re: 1, rho: 1 },
];
const PROFILES: ProfileDef[] = [
  { id: PROFILE_ID, name: "test", shape: { kind: "rect", b: 1, h: 1 } },
];

const beam = (
  bid: ID,
  start: Point2,
  end: Point2,
  fixedNodesBodyIDs: ID[] = [],
): BeamElement => ({
  type: "beam",
  id: bid,
  probes: [],
  overlays: {},
  positionStart: start,
  positionEnd: end,
  fixedNodesBodyIDs,
  materialID: MATERIAL_ID,
  profileID: PROFILE_ID,
});

const gear = (
  gid: ID,
  position: Point2,
  parentAxleID: ID,
  extra: Partial<GearElement> = {},
): GearElement => ({
  type: "gear",
  id: gid,
  probes: [],
  overlays: {},
  position,
  angle: 0,
  radius: 10,
  parentAxleID,
  fixedNodesBodyIDs: [],
  meshedGearsIDs: [],
  surfaceMass: 1,
  ...extra,
});

function mechanism(mechanicalElements: MechanicalElement[]): Mechanism {
  return {
    metadata: DEFAULT_METADATA,
    viewport: { scale: 1, pan: new Point2(0, 0) },
    simulation: DEFAULT_SIMULATION,
    mechanicalElements,
    constraintElements: [],
    loads: [],
    materials: MATERIALS,
    profiles: PROFILES,
    history: [],
    future: [],
  };
}

const IDENTITY = new Map<string, string>();

describe("build_collision_candidates", () => {
  it("exclut les extrémités d'une poutre contre elle-même", () => {
    const B = id();
    const beamEl = beam(B, new Point2(0, 0), new Point2(100, 0));
    const { pointSegment } = build_collision_candidates(
      mechanism([beamEl]),
      IDENTITY,
    );
    const own = pointSegment.filter(
      (c) => c.segKey1 === `${B}:start` && c.segKey2 === `${B}:end`,
    );
    expect(own.some((c) => c.pointKey === `${B}:start`)).toBe(false);
    expect(own.some((c) => c.pointKey === `${B}:end`)).toBe(false);
  });

  it("exclut un nœud soudé sur le corps d'une poutre, mais pas contre une autre poutre", () => {
    const J = id();
    const B1 = id();
    const B2 = id();
    const before = mechanism([
      join(J, new Point2(50, 0)),
      beam(B1, new Point2(0, 0), new Point2(100, 0), [J]),
      beam(B2, new Point2(0, 50), new Point2(100, 50)),
    ]);
    const { pointSegment } = build_collision_candidates(before, IDENTITY);
    const againstB1 = pointSegment.filter((c) => c.segKey1 === `${B1}:start`);
    const againstB2 = pointSegment.filter((c) => c.segKey1 === `${B2}:start`);
    expect(againstB1.some((c) => c.pointKey === J)).toBe(false);
    expect(againstB2.some((c) => c.pointKey === J)).toBe(true);
  });

  it("exclut l'axe d'une roue contre elle-même, une fois fusionnés", () => {
    // `compile_simulation_model` fuses a gear's centre with its axle (Coincidence) before
    // this runs — reproduced here by mapping both raw keys to the same fused one, exactly
    // what that fusion pass leaves behind.
    const P = id();
    const G = id();
    const before = mechanism([
      pivot(P, new Point2(0, 0), { fixedGearsIDs: [G] }),
      gear(G, new Point2(0, 0), P),
    ]);
    const fused = new Map([
      [P, `${P},${G}`],
      [G, `${P},${G}`],
    ]);
    const { pointCircle } = build_collision_candidates(before, fused);
    expect(pointCircle.some((c) => c.pointKey === `${P},${G}`)).toBe(false);
  });

  it("exclut un nœud soudé sur le pourtour d'une roue", () => {
    const P = id();
    const G = id();
    const M = id();
    const before = mechanism([
      pivot(P, new Point2(0, 0), { fixedGearsIDs: [G] }),
      gear(G, new Point2(0, 0), P, { fixedNodesBodyIDs: [M] }),
      mass(M, new Point2(10, 0)),
    ]);
    const { pointCircle } = build_collision_candidates(before, IDENTITY);
    expect(pointCircle.some((c) => c.pointKey === M)).toBe(false);
  });

  it("exclut deux roues déjà maillées, garde les autres paires", () => {
    const P1 = id();
    const P2 = id();
    const P3 = id();
    const G1 = id();
    const G2 = id();
    const G3 = id();
    const before = mechanism([
      pivot(P1, new Point2(0, 0), { fixedGearsIDs: [G1] }),
      pivot(P2, new Point2(20, 0), { fixedGearsIDs: [G2] }),
      pivot(P3, new Point2(-20, 0), { fixedGearsIDs: [G3] }),
      gear(G1, new Point2(0, 0), P1, { meshedGearsIDs: [G2] }),
      gear(G2, new Point2(20, 0), P2),
      gear(G3, new Point2(-20, 0), P3),
    ]);
    const { circleCircle } = build_collision_candidates(before, IDENTITY);
    const has = (a: ID, b: ID) =>
      circleCircle.some(
        (c) =>
          (c.key1 === a && c.key2 === b) || (c.key1 === b && c.key2 === a),
      );
    expect(has(G1, G2)).toBe(false); // meshed
    expect(has(G1, G3)).toBe(true);
    expect(has(G2, G3)).toBe(true);
  });

  it("exclut une roue soudée (par son axe) sur le corps d'une poutre", () => {
    const P = id();
    const G = id();
    const B = id();
    const before = mechanism([
      pivot(P, new Point2(50, 0), { fixedGearsIDs: [G] }),
      gear(G, new Point2(50, 0), P),
      // The beam welds the AXLE's id, never the gear's — the fusion the solver applies at
      // compile time is what makes them the same node.
      beam(B, new Point2(0, 0), new Point2(100, 0), [P]),
    ]);
    const { circleSegment } = build_collision_candidates(before, IDENTITY);
    expect(circleSegment.some((c) => c.centerKey === G)).toBe(false);
  });

  it("propose tout point/roue contre le plancher, sans exclusion structurelle", () => {
    const P = id();
    const B = id();
    const G = id();
    const GA = id();
    const before = mechanism([
      pivot(P, new Point2(0, 0)),
      beam(B, new Point2(10, 0), new Point2(20, 0)),
      pivot(GA, new Point2(30, 0), { fixedGearsIDs: [G] }),
      gear(G, new Point2(30, 0), GA),
    ]);
    const { pointFloor, circleFloor } = build_collision_candidates(before, IDENTITY);
    const pointKeys = pointFloor.map((c) => c.pointKey);
    expect(pointKeys).toContain(P);
    expect(pointKeys).toContain(`${B}:start`);
    expect(pointKeys).toContain(`${B}:end`);
    expect(pointKeys).toContain(GA); // a gear's axle is a node too
    expect(circleFloor).toEqual([{ centerKey: G, radius: 10 }]);
  });
});
