import { Point2 } from "../../../types/point2";
import { ID, Link } from "../../../types";
import {
  belt_arrival_angle,
  belt_has_arc,
  belt_pieces,
  belt_shared_scratch,
  belt_solve_arc,
  belt_solve_pair,
  BeltScratch,
  BeltVia,
  BeltPiece,
} from "../../../utils/belt-path";
import { LinkSlots } from "../link-slots";
import { Nodes, SimNodes } from "../nodes";

/**
 * The belt's no-slip law, one instance per tangent strand: what the upstream pulley pays
 * out, minus what the downstream one takes in, equals that strand's elongation — CONTACT
 * ARCS INCLUDED. Ignoring the arcs is wrong by 88 px on a motion whose answer is known
 * exactly, and by up to 22 % on the Core XY.
 *
 * It writes ANGLES ONLY. That is a measured decision, not an omission: given authority
 * over the positions, strand by strand, each one satisfies its equation by deforming the
 * belt — precisely the slip it exists to forbid. The positional grip lives one level up,
 * in `BeltSubChainAggregate`, whose telescoped sum has no interior degree of freedom to
 * relax into.
 *
 * Law of one tangent segment a→b:  q_a − q_b = Δh,  h = ℓ + u_a − v_b,
 * q_k = r_k·ε_k·θ_k,  ε_k = dir?−1:1. The half-arcs u_a (departure on a) and v_b
 * (arrival on b) are in belt-px in the lab frame; h⁰ is baked at rest.
 */

type Seg = Extract<Link, { type: "BeltSegmentNoSlip" }>;

const TAU = 2 * Math.PI;

/** Snapshot maps may use fused keys; a link can still name a bare part. */
function at(positions: Map<string, Point2>, key: string): Point2 | undefined {
  return positions.get(key) ?? positions.get(key.split(",")[0]);
}

/** Continuous (unwrapped) angle nearest to `ref`, so the ±π atan2 seam never
 *  injects 2π of phantom belt between sweeps. Same trick as BeltLength's psiArr. */
export function unwrapArrival(raw: number, ref: number | undefined): number {
  if (ref === undefined) return raw;
  let d = raw - (((ref % TAU) + TAU) % TAU);
  while (d > Math.PI) d -= TAU;
  while (d <= -Math.PI) d += TAU;
  return ref + d;
}

export function viasFrom(
  positions: Map<string, Point2>,
  link: Pick<
    Seg,
    "gearPosKeys" | "radii" | "directions" | "closed" | "startKey" | "endKey"
  >,
): BeltVia[] | null {
  const vias: BeltVia[] = [];
  if (!link.closed && link.startKey) {
    const s = at(positions, link.startKey);
    if (!s) return null;
    vias.push({ pos: s, radius: 0, clockwise: false });
  }
  for (let i = 0; i < link.gearPosKeys.length; i++) {
    const p = at(positions, link.gearPosKeys[i]);
    if (!p) return null;
    vias.push({ pos: p, radius: link.radii[i], clockwise: link.directions[i] });
  }
  if (!link.closed && link.endKey) {
    const e = at(positions, link.endKey);
    if (!e) return null;
    vias.push({ pos: e, radius: 0, clockwise: false });
  }
  return vias;
}

function arcOf(pieces: BeltPiece[], viaIndex: number) {
  const a = pieces.find((p) => p.kind === "arc" && p.gearIndex === viaIndex);
  return a && a.kind === "arc" ? a : null;
}

/**
 * h = ℓ + u_a − v_b for the segment `segIndex` (whose endpoints are vias
 * `viaA`→`viaB`). `arrivals` (per via) is the continuous-angle reference and is
 * updated in place when `track` is set. Returns null on a degenerate geometry.
 */
export function segmentH(
  vias: BeltVia[],
  pieces: BeltPiece[],
  segIndex: number,
  arrivals: number[] | undefined,
  track: boolean,
): { h: number; ell: number; uMinusV: number; tangent: Point2 } | null {
  const seg = pieces[segIndex];
  if (!seg || seg.kind !== "segment") return null;
  const a = seg.gearIndexA;
  const b = seg.gearIndexB;
  const ell = seg.length;

  const rEps = (v: number) => vias[v].radius * (vias[v].clockwise ? -1 : 1);

  // u_a = departure half-arc on a = r_a·ε_a·ψ_arr(a) + r_a·wrap_a  (0 for a terminal)
  let u = 0;
  const arcA = arcOf(pieces, a);
  if (arcA) {
    const psiA = unwrapArrival(arcA.startAngle, arrivals?.[a]);
    if (arrivals && track) arrivals[a] = psiA;
    u = rEps(a) * psiA + vias[a].radius * arcA.wrap;
  }
  // v_b = arrival half-arc on b = r_b·ε_b·ψ_arr(b)  (0 for a terminal)
  let v = 0;
  const arcB = arcOf(pieces, b);
  if (arcB) {
    const psiB = unwrapArrival(arcB.startAngle, arrivals?.[b]);
    if (arrivals && track) arrivals[b] = psiB;
    v = rEps(b) * psiB;
  }

  const dir = seg.to.sub(seg.from);
  const tangent =
    dir.length_squared() > 1e-12 ? dir.normalize() : new Point2(1, 0);
  return { h: ell + u - v, ell, uMinusV: u - v, tangent };
}

/**
 * Weight of an angle DOF in the projection metric. "rim" (w_θ = 1/r²) makes the
 * angle exactly as mobile as a point of its own rim, so a strand shares its
 * correction equally between its two pulleys instead of ∝ r².
 */
/** The `rim` metric: an angle of radius r is as mobile as a point on its own rim. */
export const rimWeight = (rEps: number): number =>
  Math.abs(rEps) < 1e-9 ? 1 : 1 / (rEps * rEps);

/** How many vias the belt has: its pulleys, plus the terminals when it is open. */
export function beltViaCount(
  link: Pick<Seg, "radii" | "closed" | "startKey" | "endKey">,
): number {
  const head = !link.closed && link.startKey !== undefined ? 1 : 0;
  const tail = !link.closed && link.endKey !== undefined ? 1 : 0;
  return link.radii.length + head + tail;
}

/** Node slot of via `v`, in belt order, without building the slot array. */
export function beltViaSlot(
  s: LinkSlots,
  gearOffset: number,
  iStart: number,
  iEnd: number,
  link: Pick<Seg, "radii" | "closed" | "startKey">,
  v: number,
): number {
  const head = !link.closed && link.startKey !== undefined ? 1 : 0;
  if (head && v === 0) return iStart;
  const gear = v - head;
  return gear < link.radii.length ? s.pos[gearOffset + gear] : iEnd;
}

/** Copy via `v` from the node arrays into the scratch. False when it has no slot. */
export function loadBeltVia(
  sc: BeltScratch,
  nodes: Nodes,
  s: LinkSlots,
  link: Pick<Seg, "radii" | "directions" | "closed" | "startKey">,
  gearOffset: number,
  iStart: number,
  iEnd: number,
  v: number,
): boolean {
  const slot = beltViaSlot(s, gearOffset, iStart, iEnd, link, v);
  if (slot < 0) return false;
  const head = !link.closed && link.startKey !== undefined ? 1 : 0;
  const gear = v - head;
  const isGear = gear >= 0 && gear < link.radii.length;
  sc.cx[v] = nodes.x[slot];
  sc.cy[v] = nodes.y[slot];
  sc.r[v] = isGear ? link.radii[gear] : 0;
  sc.ccw[v] = isGear && link.directions[gear] ? 1 : 0;
  return true;
}

/**
 * h = ℓ + u_a − v_b of one strand, solving only the two tangent pairs it rests on: its
 * own (strand length, arrival on b) and the previous one (arrival on a, whose contact
 * arc closes between the two). The rest of the belt does not enter the answer, and this
 * is the hot path — one instance per strand, three hundred sweeps a frame.
 */
function strandH(
  nodes: SimNodes,
  s: LinkSlots,
  link: Seg,
  track: boolean,
): number | null {
  const n = beltViaCount(link);
  const closed = link.closed;
  const pairs = closed ? n : n - 1;
  if (pairs <= 0) return null;
  const sc = belt_shared_scratch(n);
  const iStart = s.pos[2];
  const iEnd = s.pos[3];
  const a = link.viaA;
  const b = (a + 1) % n;
  const load = (v: number) =>
    loadBeltVia(sc, nodes, s, link, 4, iStart, iEnd, v);
  if (!load(a) || !load(b)) return null;
  belt_solve_pair(sc, a, n);

  // u_a = departure half-arc on a = r_a·ε_a·ψ_arr(a) + r_a·wrap_a  (0 for a terminal)
  let u = 0;
  if (belt_has_arc(sc, a, n, closed)) {
    const prev = (a - 1 + pairs) % pairs;
    if (!load(prev)) return null;
    belt_solve_pair(sc, prev, n);
    if (!belt_solve_arc(sc, a, n, closed)) return null;
    const psiA = unwrapArrival(sc.arcAngle[a], link.arrivals?.[a]);
    if (link.arrivals && track) link.arrivals[a] = psiA;
    u = sc.r[a] * (sc.ccw[a] === 1 ? -1 : 1) * psiA + sc.r[a] * sc.arcWrap[a];
  }
  // v_b = arrival half-arc on b = r_b·ε_b·ψ_arr(b)  (0 for a terminal)
  let v = 0;
  if (belt_has_arc(sc, b, n, closed)) {
    const psiB = unwrapArrival(
      belt_arrival_angle(sc, b, n, closed),
      link.arrivals?.[b],
    );
    if (link.arrivals && track) link.arrivals[b] = psiB;
    v = sc.r[b] * (sc.ccw[b] === 1 ? -1 : 1) * psiB;
  }
  return sc.ell[a] + u - v;
}

/**
 * Apply one segment no-slip. Writes θ_a, θ_b (option 1); also the two centres
 * along the strand tangent when `link.writePositions` (option 2). Returns the
 * residual |C| in belt-px.
 */
export function applyBeltSegmentNoSlip(
  nodes: SimNodes,
  s: LinkSlots,
  link: Seg,
  stiffness = 1.0,
): number {
  const h = strandH(nodes, s, link, true);
  if (h === null) return 0;

  const iA = s.ang[0];
  const iB = s.ang[1];
  const thetaA = iA >= 0 ? nodes.angle[iA] : 0;
  const thetaB = iB >= 0 ? nodes.angle[iB] : 0;
  const qA = link.rEpsA * (thetaA - link.theta0A);
  const qB = link.rEpsB * (thetaB - link.theta0B);

  const C = qA - qB - (h - link.h0); // belt-px

  // ∂C/∂θ_a = r_a·ε_a, ∂C/∂θ_b = −r_b·ε_b, in the `rim` metric (w_θ = 1/r²) that makes
  // an angle exactly as mobile as a point of its own rim. Angles only: giving a strand
  // authority over the positions makes it COMPLIANT — it satisfies its own equation by
  // deforming the belt, which is the slip it exists to forbid.
  const mobA = rimWeight(link.rEpsA);
  const mobB = rimWeight(link.rEpsB);
  const writeA = iA >= 0 && Math.abs(link.rEpsA) > 1e-9;
  const writeB = iB >= 0 && Math.abs(link.rEpsB) > 1e-9;
  let denom = 0;
  if (writeA) denom += mobA * link.rEpsA * link.rEpsA;
  if (writeB) denom += mobB * link.rEpsB * link.rEpsB;
  if (denom < 1e-12) return Math.abs(C);

  const k = -(C / denom) * stiffness; // = λ
  if (writeA) nodes.angle[iA] = thetaA + k * mobA * link.rEpsA;
  if (writeB) nodes.angle[iB] = thetaB + k * mobB * -link.rEpsB;

  return Math.abs(C);
}

/**
 * Δh = h − h⁰ of one segment, from the live positions. This is the signed
 * quantity a sub-chain's telescoping sum adds up to: summing `q_a − q_b = Δh`
 * along consecutive strands cancels every interior `q`, leaving
 * `q_début − q_fin = Σ Δh`. Between two points where q is held (a dead end, a
 * frozen pulley) the left side vanishes and what remains is PURELY positional.
 *
 * Read-only: `track` is off, so the shared continuous-arrivals array is never
 * mutated — a measurement must not perturb what it measures.
 */
export function beltSegmentDeltaH(
  positions: Map<string, Point2>,
  link: Seg,
): number | null {
  const vias = viasFrom(positions, link);
  if (!vias) return null;
  const pieces = belt_pieces(vias, link.closed);
  const geom = segmentH(vias, pieces, link.segIndex, link.arrivals, false);
  return geom ? geom.h - link.h0 : null;
}

/**
 * Angular mobilities derived from the links that ALREADY write each gear angle.
 * An angle is pinned (mobility 0) when another constraint assigns it outright,
 * so no correction sent there can survive the sweep:
 *  - a `GearPerimeterPin` whose node AND centre are both anchored — proven to
 *    give ∂θ_new/∂θ_old = 0 (see belt-gear-pin-arbitration.md §1);
 *  - a `MotorAngle`, when `includeMotors` — it likewise reassigns its target
 *    every sweep, though at stiffness 0.5, so it is a soft driver rather than a
 *    hard Dirichlet condition. Hence the switch: the two readings are measured
 *    separately, never assumed equivalent.
 * Angles nothing pins are absent from the map, i.e. mobility 1.
 */
export function deriveAngleMobilities(
  links: Link[],
  posMasses: Map<string, number>,
  includeMotors: boolean,
): Map<string, number> {
  const mobilities = new Map<string, number>();
  for (const link of links) {
    if (link.type === "GearPerimeterPin") {
      const wNode = posMasses.get(link.nodeKey) ?? 1;
      const wCentre = posMasses.get(link.centerKey) ?? 1;
      if (wNode === 0 && wCentre === 0) mobilities.set(link.angleKey, 0);
    } else if (link.type === "MotorAngle" && includeMotors) {
      mobilities.set(link.angleKey, 0);
    }
  }
  return mobilities;
}

/** Parameters describing one belt's ordered geometry, for building its segments. */
export interface BeltNoSlipSpec {
  gearPosKeys: string[];
  gearAngleKeys: string[];
  radii: number[];
  directions: boolean[];
  closed: boolean;
  startKey?: string;
  endKey?: string;
  owner?: ID;
  writePositions: boolean;
  authority?: "full";
  /** Angular mobility per gear angle key (0 = pinned). Missing key = 1. */
  angleMobilities?: Map<string, number>;
  /** Angle metric of the projection; absent = w_θ = 1 (today's behaviour). */
  angleMetric?: "rim";
}

/**
 * Build one BeltSegmentNoSlip link per tangent segment of a belt, baking h⁰ and
 * θ⁰ from the current positions/angles. All segments of a belt share one
 * continuous-arrivals array so unwrapping stays consistent across the chain.
 */
export function buildBeltSegmentNoSlipLinks(
  positions: Map<string, Point2>,
  angles: Map<string, number>,
  spec: BeltNoSlipSpec,
): Seg[] {
  const stub = {
    gearPosKeys: spec.gearPosKeys,
    radii: spec.radii,
    directions: spec.directions,
    closed: spec.closed,
    startKey: spec.startKey,
    endKey: spec.endKey,
  };
  const vias = viasFrom(positions, stub);
  if (!vias) return [];
  const pieces = belt_pieces(vias, spec.closed);
  const arrivals = new Array(vias.length).fill(0);
  // Seed continuous arrivals from the raw geometry at rest.
  for (const p of pieces)
    if (p.kind === "arc") arrivals[p.gearIndex] = p.startAngle;

  // via index → gear index (closed: identity; open: shift by the start terminal).
  const gearOf = (viaIndex: number): number =>
    spec.closed || !spec.startKey ? viaIndex : viaIndex - 1;
  const isTerminal = (viaIndex: number) => vias[viaIndex].radius <= 0;

  const links: Seg[] = [];
  pieces.forEach((piece, segIndex) => {
    if (piece.kind !== "segment") return;
    const a = piece.gearIndexA;
    const b = piece.gearIndexB;

    const geom = segmentH(vias, pieces, segIndex, arrivals.slice(), false);
    if (!geom) return;

    const rEps = (v: number) => vias[v].radius * (vias[v].clockwise ? -1 : 1);
    const angleKeyA = isTerminal(a) ? undefined : spec.gearAngleKeys[gearOf(a)];
    const angleKeyB = isTerminal(b) ? undefined : spec.gearAngleKeys[gearOf(b)];
    const posKeyA = isTerminal(a)
      ? a === 0
        ? spec.startKey!
        : spec.endKey!
      : spec.gearPosKeys[gearOf(a)];
    const posKeyB = isTerminal(b)
      ? b === vias.length - 1
        ? spec.endKey!
        : spec.startKey!
      : spec.gearPosKeys[gearOf(b)];

    links.push({
      type: "BeltSegmentNoSlip",
      ddl: 1,
      angleKeyA,
      angleKeyB,
      posKeyA,
      posKeyB,
      rEpsA: isTerminal(a) ? 0 : rEps(a),
      rEpsB: isTerminal(b) ? 0 : rEps(b),
      theta0A: angleKeyA ? (angles.get(angleKeyA) ?? 0) : 0,
      theta0B: angleKeyB ? (angles.get(angleKeyB) ?? 0) : 0,
      h0: geom.h,
      gearPosKeys: spec.gearPosKeys,
      radii: spec.radii,
      directions: spec.directions,
      closed: spec.closed,
      startKey: spec.startKey,
      endKey: spec.endKey,
      segIndex,
      viaA: a,
      arrivals, // shared across the belt's segments
      writePositions: spec.writePositions,
      authority: spec.authority,
      angleMobA: angleKeyA ? spec.angleMobilities?.get(angleKeyA) : undefined,
      angleMobB: angleKeyB ? spec.angleMobilities?.get(angleKeyB) : undefined,
      angleMetric: spec.angleMetric,
      owner: spec.owner,
    });
  });
  return links;
}
