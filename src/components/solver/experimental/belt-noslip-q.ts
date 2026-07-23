import { Point2 } from "../../../types/point2";
import { ID, Link } from "../../../types";
import { belt_pieces, BeltVia, BeltPiece } from "../../../utils/belt-path";

/**
 * EXPERIMENTAL measurement bench for the belt "q" model (per-segment no-slip),
 * behind the USE_Q_MODEL flag. Nothing here is emitted by the parser; only the
 * diagnostic tests build these links. The real solver stays untouched at flag
 * off — see doc/belt-q-model-design.md for the model and conventions.
 *
 * Law of one tangent segment a→b:  q_a − q_b = Δh,  h = ℓ + u_a − v_b,
 * q_k = r_k·ε_k·θ_k,  ε_k = dir?−1:1. The half-arcs u_a (departure on a),
 * v_b (arrival on b) are measured in belt-px in the lab frame. h⁰ is baked at
 * rest; Δh = h − h⁰. The segment writes θ_a, θ_b (option 1) and, if
 * `writePositions`, also the two pulley centres along the strand tangent
 * (option 2, the ℓ-gradient only — the same DOFs BeltLength writes).
 */

export const USE_Q_MODEL = { on: false };

type Seg = Extract<Link, { type: "BeltSegmentNoSlip" }>;

const TAU = 2 * Math.PI;

/** Snapshot maps may use fused keys; a link can still name a bare part. */
function at(positions: Map<string, Point2>, key: string): Point2 | undefined {
  return positions.get(key) ?? positions.get(key.split(",")[0]);
}

/** Continuous (unwrapped) angle nearest to `ref`, so the ±π atan2 seam never
 *  injects 2π of phantom belt between sweeps. Same trick as BeltLength's psiArr. */
function unwrap(raw: number, ref: number | undefined): number {
  if (ref === undefined) return raw;
  let d = raw - (((ref % TAU) + TAU) % TAU);
  while (d > Math.PI) d -= TAU;
  while (d <= -Math.PI) d += TAU;
  return ref + d;
}

function viasFrom(
  positions: Map<string, Point2>,
  link: Pick<
    Seg,
    | "gearPosKeys"
    | "radii"
    | "directions"
    | "closed"
    | "startKey"
    | "endKey"
  >,
): BeltVia[] | null {
  const vias: BeltVia[] = [];
  if (!link.closed && link.startKey) {
    const s = at(positions, link.startKey);
    if (!s) return null;
    vias.push({ pos: s, radius: 0, direction: false });
  }
  for (let i = 0; i < link.gearPosKeys.length; i++) {
    const p = at(positions, link.gearPosKeys[i]);
    if (!p) return null;
    vias.push({ pos: p, radius: link.radii[i], direction: link.directions[i] });
  }
  if (!link.closed && link.endKey) {
    const e = at(positions, link.endKey);
    if (!e) return null;
    vias.push({ pos: e, radius: 0, direction: false });
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
function segmentH(
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

  const rEps = (v: number) =>
    vias[v].radius * (vias[v].direction ? -1 : 1);

  // u_a = departure half-arc on a = r_a·ε_a·ψ_arr(a) + r_a·wrap_a  (0 for a terminal)
  let u = 0;
  const arcA = arcOf(pieces, a);
  if (arcA) {
    const psiA = unwrap(arcA.startAngle, arrivals?.[a]);
    if (arrivals && track) arrivals[a] = psiA;
    u = rEps(a) * psiA + vias[a].radius * arcA.wrap;
  }
  // v_b = arrival half-arc on b = r_b·ε_b·ψ_arr(b)  (0 for a terminal)
  let v = 0;
  const arcB = arcOf(pieces, b);
  if (arcB) {
    const psiB = unwrap(arcB.startAngle, arrivals?.[b]);
    if (arrivals && track) arrivals[b] = psiB;
    v = rEps(b) * psiB;
  }

  const dir = seg.to.sub(seg.from);
  const tangent =
    dir.length_squared() > 1e-12 ? dir.normalize() : new Point2(1, 0);
  return { h: ell + u - v, ell, uMinusV: u - v, tangent };
}

/**
 * Apply one segment no-slip. Writes θ_a, θ_b (option 1); also the two centres
 * along the strand tangent when `link.writePositions` (option 2). Returns the
 * residual |C| in belt-px.
 */
export function applyBeltSegmentNoSlip(
  positions: Map<string, Point2>,
  posMasses: Map<string, number>,
  angles: Map<string, number>,
  link: Seg,
  stiffness = 1.0,
): number {
  const vias = viasFrom(positions, link);
  if (!vias) return 0;
  const pieces = belt_pieces(vias, link.closed);
  const geom = segmentH(vias, pieces, link.segIndex, link.arrivals, true);
  if (!geom) return 0;

  const thetaA =
    link.angleKeyA !== undefined ? (angles.get(link.angleKeyA) ?? 0) : 0;
  const thetaB =
    link.angleKeyB !== undefined ? (angles.get(link.angleKeyB) ?? 0) : 0;
  const qA = link.rEpsA * (thetaA - link.theta0A);
  const qB = link.rEpsB * (thetaB - link.theta0B);

  const C = qA - qB - (geom.h - link.h0); // belt-px

  // ── Build the projection denominator over the DOFs this link writes ──
  // ∂C/∂θ_a = r_a·ε_a, ∂C/∂θ_b = −r_b·ε_b (angles, mass 1).
  let denom = 0;
  const writeA = link.angleKeyA !== undefined && Math.abs(link.rEpsA) > 1e-9;
  const writeB = link.angleKeyB !== undefined && Math.abs(link.rEpsB) > 1e-9;
  if (writeA) denom += link.rEpsA * link.rEpsA;
  if (writeB) denom += link.rEpsB * link.rEpsB;

  // Option 2: also relieve C by sliding the two centres along the strand tangent.
  // ∂h/∂posA = −t̂, ∂h/∂posB = +t̂ (envelope theorem on ℓ; arc terms neglected in
  // the positional path, still carried exactly by the angle residual).
  // ∂C/∂posA = +t̂, ∂C/∂posB = −t̂.
  const wA = posMasses.get(link.posKeyA) ?? 1;
  const wB = posMasses.get(link.posKeyB) ?? 1;
  const t = geom.tangent;
  if (link.writePositions) {
    denom += wA * 1 + wB * 1; // |t̂|² = 1
  }
  if (denom < 1e-12) return Math.abs(C);

  const k = -(C / denom) * stiffness;

  if (writeA)
    angles.set(link.angleKeyA!, thetaA + k * link.rEpsA);
  if (writeB)
    angles.set(link.angleKeyB!, thetaB + k * -link.rEpsB);

  if (link.writePositions) {
    if (wA !== 0) {
      const pA = at(positions, link.posKeyA);
      if (pA) positions.set(link.posKeyA, pA.add(t.mul(k * wA * 1)));
    }
    if (wB !== 0) {
      const pB = at(positions, link.posKeyB);
      if (pB) positions.set(link.posKeyB, pB.add(t.mul(k * wB * -1)));
    }
  }

  return Math.abs(C);
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

    const rEps = (v: number) => vias[v].radius * (vias[v].direction ? -1 : 1);
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
      arrivals, // shared across the belt's segments
      writePositions: spec.writePositions,
      owner: spec.owner,
    });
  });
  return links;
}
