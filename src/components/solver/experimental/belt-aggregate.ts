import { ID, Link } from "../../../types";
import { Point2 } from "../../../types/point2";
import {
  belt_arrival_angle,
  belt_has_arc,
  belt_pieces,
  belt_shared_scratch,
  belt_solve_arc,
  belt_solve_pair,
} from "../../../utils/belt-path";
import {
  beltViaCount,
  beltViaSlot,
  loadBeltVia,
  rimWeight,
  segmentH,
  unwrapArrival,
  viasFrom,
} from "./belt-noslip-q";
import { LinkSlots } from "../link-slots";
import { SimNodes } from "../nodes";

type Agg = Extract<Link, { type: "BeltSubChainAggregate" }>;

/**
 * The cut criterion for belt sub-chain aggregates.
 *
 * Summing a belt's segment laws telescopes its interior `q`s away, leaving a purely
 * positional equation. That elimination is only legitimate while nobody outside the
 * belt has a say in those angles: the moment someone does, eliminating an angle hides
 * what they had to say about it. So a sub-chain must end wherever that happens.
 */

/** Link types that constitute a belt's own machinery, as opposed to a stakeholder. */
const BELT_MACHINERY = new Set([
  "BeltLength",
  "BeltPin",
  "BeltJunction",
  "BeltSegmentNoSlip",
  "BeltSubChainAggregate",
  "BeltFollowsTangent",
]);

/** Every position/angle key a link names. */
export function linkKeys(link: Link): string[] {
  const r = link as unknown as Record<string, unknown>;
  const out: string[] = [];
  for (const field of [
    "key1",
    "key2",
    "key3",
    "key4",
    "nodeKey",
    "centerKey",
    "pivotKey",
    "drivenKey",
    "anchorKey",
    "anchorPivotKey",
    "angleKey",
    "angleKey1",
    "angleKey2",
    "refAngleKey",
    "posKey1",
    "posKey2",
    "posKeyA",
    "posKeyB",
    "phaseKey",
    "startKey",
    "endKey",
    "grabbedKey",
  ]) {
    const v = r[field];
    if (typeof v === "string") out.push(v);
  }
  const gears = r.gearPosKeys;
  if (Array.isArray(gears)) out.push(...(gears as string[]));
  return out;
}

/**
 * Does anything other than this belt have a say in `angleKey`?
 *
 * A stakeholder can speak in either of two syntactic forms, and both count equally:
 * by WRITING the angle outright — a motor assigns it and shares no key at all — or by
 * SHARING a DOF with it, as a pin, a gear mesh or a beam does. Testing only one form
 * misses half the cases: a coupling test misses motors, a writing test misses pins.
 * Hence the single question above rather than a list of link types to special-case.
 *
 * A belt's own machinery does not count, but ANOTHER belt's does — a pulley shared by
 * two belts is a stakeholder of each.
 */
export function hasStakeholderBeyond(
  links: Link[],
  angleKey: string,
  beltOwner: ID | undefined,
): boolean {
  return links.some(
    (l) =>
      !(BELT_MACHINERY.has(l.type) && l.owner === beltOwner) &&
      linkKeys(l).includes(angleKey),
  );
}

/** Who those stakeholders are, for diagnostics. Same rule as `hasStakeholderBeyond`. */
export function stakeholdersOf(
  links: Link[],
  angleKey: string,
  beltOwner: ID | undefined,
): Link[] {
  return links.filter(
    (l) =>
      !(BELT_MACHINERY.has(l.type) && l.owner === beltOwner) &&
      linkKeys(l).includes(angleKey),
  );
}

/** The angles at which a belt's sub-chains must end. */
export function beltCutAngles(
  links: Link[],
  gearAngleKeys: string[],
  beltOwner: ID | undefined,
): Set<string> {
  return new Set(
    gearAngleKeys.filter((a) => hasStakeholderBeyond(links, a, beltOwner)),
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Building a belt's aggregates
// ───────────────────────────────────────────────────────────────────────────

export interface BeltAggregateSpec {
  gearPosKeys: string[];
  gearAngleKeys: string[];
  radii: number[];
  directions: boolean[];
  closed: boolean;
  startKey?: string;
  endKey?: string;
  owner?: ID;
  angleMetric?: "rim";
  /** Bench-only override of where to cut. Absent = the stakeholder criterion. */
  cutAngles?: Set<string>;
}

/**
 * One aggregate per sub-chain of a belt, cut wherever an angle has a stakeholder
 * beyond the belt. Returns NOTHING when the belt has no cut: its single sub-chain
 * would run dead end to dead end, where the aggregate is `BeltLength` term for term
 * and carries no information the length constraint does not already hold.
 *
 * On a closed belt the strands after the last cut wrap around to join those before
 * the first, so N cuts give exactly N sub-chains. A single cut therefore yields ONE
 * sub-chain whose two bounds are the same angle — `q` cancels and it degenerates to
 * `BeltLength` again.
 */
export function buildBeltAggregateLinks(
  positions: Map<string, Point2>,
  angles: Map<string, number>,
  links: Link[],
  spec: BeltAggregateSpec,
): Agg[] {
  const cuts =
    spec.cutAngles ?? beltCutAngles(links, spec.gearAngleKeys, spec.owner);
  if (cuts.size === 0) return [];

  const vias = viasFrom(positions, spec);
  if (!vias) return [];
  const pieces = belt_pieces(vias, spec.closed);
  const arrivals = new Array(vias.length).fill(0);
  for (const p of pieces)
    if (p.kind === "arc") arrivals[p.gearIndex] = p.startAngle;

  const shift = spec.closed || !spec.startKey ? 0 : 1;
  const isTerminal = (via: number) => vias[via].radius <= 0;
  const angleOfVia = (via: number) =>
    isTerminal(via) ? undefined : spec.gearAngleKeys[via - shift];
  const rEpsOfVia = (via: number) =>
    isTerminal(via) ? 0 : vias[via].radius * (vias[via].clockwise ? -1 : 1);

  // Ordered strands, and where each one ends.
  const strands = pieces
    .map((p, i) => ({ piece: p, i }))
    .filter((s) => s.piece.kind === "segment");

  const runs: { idx: number[]; from: number; to: number }[] = [];
  let cur: number[] = [];
  for (const s of strands) {
    const piece = s.piece;
    if (piece.kind !== "segment") continue;
    cur.push(s.i);
    const endAngle = angleOfVia(piece.gearIndexB);
    if (endAngle === undefined || cuts.has(endAngle)) {
      const first = pieces[cur[0]];
      runs.push({
        idx: cur,
        from: first.kind === "segment" ? first.gearIndexA : 0,
        to: piece.gearIndexB,
      });
      cur = [];
    }
  }
  if (cur.length > 0) {
    if (spec.closed && runs.length > 0) {
      const head = runs[0];
      const first = pieces[cur[0]];
      head.idx = [...cur, ...head.idx];
      head.from = first.kind === "segment" ? first.gearIndexA : head.from;
    } else {
      const first = pieces[cur[0]];
      const last = pieces[cur[cur.length - 1]];
      runs.push({
        idx: cur,
        from: first.kind === "segment" ? first.gearIndexA : 0,
        to: last.kind === "segment" ? last.gearIndexB : 0,
      });
    }
  }

  return runs.map((run) => {
    const h0Sum = run.idx.reduce(
      (a, i) =>
        a + (segmentH(vias, pieces, i, arrivals.slice(), false)?.h ?? 0),
      0,
    );
    const viaIndices = run.idx.map((i) => {
      const piece = pieces[i];
      return piece.kind === "segment" ? piece.gearIndexA : 0;
    });
    const angleKeyStart = angleOfVia(run.from);
    const angleKeyEnd = angleOfVia(run.to);
    return {
      type: "BeltSubChainAggregate" as const,
      ddl: 1 as const,
      angleKeyStart,
      angleKeyEnd,
      rEpsStart: rEpsOfVia(run.from),
      rEpsEnd: rEpsOfVia(run.to),
      theta0Start: angleKeyStart ? (angles.get(angleKeyStart) ?? 0) : 0,
      theta0End: angleKeyEnd ? (angles.get(angleKeyEnd) ?? 0) : 0,
      h0Sum,
      gearPosKeys: spec.gearPosKeys,
      radii: spec.radii,
      directions: spec.directions,
      closed: spec.closed,
      startKey: spec.startKey,
      endKey: spec.endKey,
      segIndices: run.idx,
      viaIndices,
      arrivals,
      angleMetric: spec.angleMetric,
      owner: spec.owner,
    };
  });
}

// ───────────────────────────────────────────────────────────────────────────
// The aggregate constraint
// ───────────────────────────────────────────────────────────────────────────

/** Per-via gradient accumulators, grown once and reused (see `BeltScratch`). */
let gradX = new Float64Array(16);
let gradY = new Float64Array(16);

/**
 * The same residual and gradients, on the scalar core: the run's tangent pairs are
 * solved into the shared scratch and everything else is read from it, so an application
 * allocates nothing. Gradients land in `gradX`/`gradY`, indexed by via, over the
 * `viaCount` vias the run touches from `link.viaIndices[0]` onwards.
 */
function evaluateScalar(
  nodes: SimNodes,
  s: LinkSlots,
  link: Agg,
  track: boolean,
): { C: number; firstVia: number; viaCount: number } | null {
  const n = beltViaCount(link);
  const pairs = link.closed ? n : n - 1;
  if (pairs <= 0) return null;
  const sc = belt_shared_scratch(n);
  if (gradX.length < n) {
    gradX = new Float64Array(n);
    gradY = new Float64Array(n);
  }
  const iStart = s.pos[0];
  const iEnd = s.pos[1];
  const load = (v: number) =>
    loadBeltVia(sc, nodes, s, link, 2, iStart, iEnd, v);

  // The run is cyclically contiguous, so its vias run from the first strand's departure
  // via to the last one's arrival — and the pair BEFORE the first carries that first
  // via's contact arc.
  const first = link.viaIndices[0];
  const viaCount = Math.min(link.viaIndices.length + 1, n);
  for (let k = 0; k < viaCount; k++) {
    const v = (first + k) % n;
    if (!load(v)) return null;
    gradX[v] = 0;
    gradY[v] = 0;
  }
  for (const p of link.viaIndices) belt_solve_pair(sc, p, n);
  // The arc closing on the first via needs the pair before the run.
  const before = (first - 1 + pairs) % pairs;
  if (belt_has_arc(sc, first, n, link.closed)) {
    if (!load(before)) return null;
    belt_solve_pair(sc, before, n);
  }

  let hSum = 0;
  for (const p of link.viaIndices) {
    const a = p;
    const b = (p + 1) % n;
    const ell = sc.ell[p];

    let u = 0;
    if (belt_has_arc(sc, a, n, link.closed)) {
      if (!belt_solve_arc(sc, a, n, link.closed)) return null;
      const psiA = unwrapArrival(sc.arcAngle[a], link.arrivals?.[a]);
      if (link.arrivals && track) link.arrivals[a] = psiA;
      u = sc.r[a] * (sc.ccw[a] === 1 ? -1 : 1) * psiA + sc.r[a] * sc.arcWrap[a];
    }
    let v = 0;
    if (belt_has_arc(sc, b, n, link.closed)) {
      const psiB = unwrapArrival(
        belt_arrival_angle(sc, b, n, link.closed),
        link.arrivals?.[b],
      );
      if (link.arrivals && track) link.arrivals[b] = psiB;
      v = sc.r[b] * (sc.ccw[b] === 1 ? -1 : 1) * psiB;
    }
    hSum += ell + u - v;

    // ∂C/∂c_a = (d + (s_a − s_b)·n̂)/ℓ, ∂C/∂c_b = −∂C/∂c_a (see segmentPositionalGradient).
    const dirX = sc.arrX[p] - sc.depX[p];
    const dirY = sc.arrY[p] - sc.depY[p];
    if (ell < 1e-9 || dirX * dirX + dirY * dirY < 1e-12) continue;
    const tLen = Math.sqrt(dirX * dirX + dirY * dirY);
    const nx = -(dirY / tLen);
    const ny = dirX / tLen;
    const sA = sc.r[a] * (sc.ccw[a] === 1 ? -1 : 1);
    const sB = sc.r[b] * (sc.ccw[b] === 1 ? -1 : 1);
    const gx = (sc.cx[b] - sc.cx[a] + nx * (sA - sB)) * (1 / ell);
    const gy = (sc.cy[b] - sc.cy[a] + ny * (sA - sB)) * (1 / ell);
    gradX[a] += gx;
    gradY[a] += gy;
    gradX[b] -= gx;
    gradY[b] -= gy;
  }

  const thetaS = s.ang[0] >= 0 ? nodes.angle[s.ang[0]] : 0;
  const thetaE = s.ang[1] >= 0 ? nodes.angle[s.ang[1]] : 0;
  const qS = link.rEpsStart * (thetaS - link.theta0Start);
  const qE = link.rEpsEnd * (thetaE - link.theta0End);

  return { C: qS - qE - (hSum - link.h0Sum), firstVia: first, viaCount };
}

/**
 * Apply one sub-chain aggregate. Writes both bound angles and every mobile centre of
 * the run. Returns the residual |C| in belt-px.
 */
export function applyBeltSubChainAggregate(
  nodes: SimNodes,
  s: LinkSlots,
  link: Agg,
  stiffness = 1.0,
): number {
  // pos slots: [start, end, ...one per pulley] (see link-slots.ts)
  const iStart = s.pos[0];
  const iEnd = s.pos[1];
  const ev = evaluateScalar(nodes, s, link, true);
  if (!ev) return 0;
  const C = ev.C;
  const n = beltViaCount(link);
  /** Visits every via the run touches, with its node slot and gradient. */
  const eachVia = (visit: (slot: number, gx: number, gy: number) => void) => {
    for (let k = 0; k < ev.viaCount; k++) {
      const via = (ev.firstVia + k) % n;
      visit(beltViaSlot(s, 2, iStart, iEnd, link, via), gradX[via], gradY[via]);
    }
  };

  const iS = s.ang[0];
  const iE = s.ang[1];
  const wS = rimWeight(link.rEpsStart);
  const wE = rimWeight(link.rEpsEnd);
  const writeS = iS >= 0 && Math.abs(link.rEpsStart) > 1e-9;
  const writeE = iE >= 0 && Math.abs(link.rEpsEnd) > 1e-9;

  let denom = 0;
  if (writeS) denom += wS * link.rEpsStart * link.rEpsStart;
  if (writeE) denom += wE * link.rEpsEnd * link.rEpsEnd;
  eachVia((slot, gx, gy) => {
    // Anchored: out of the denominator AND unwritten.
    if (slot < 0 || nodes.w[slot] === 0) return;
    denom += nodes.w[slot] * (gx * gx + gy * gy);
  });
  if (denom < 1e-12) return Math.abs(C);

  const lambda = -(C / denom) * stiffness;

  if (writeS) nodes.angle[iS] += lambda * wS * link.rEpsStart;
  if (writeE) nodes.angle[iE] -= lambda * wE * link.rEpsEnd;
  eachVia((slot, gx, gy) => {
    if (slot < 0) return;
    const w = nodes.w[slot];
    if (w === 0) return;
    const k = lambda * w;
    nodes.x[slot] += gx * k;
    nodes.y[slot] += gy * k;
  });
  return Math.abs(C);
}
