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
import { LinkSlots } from "../kinematics/link-slots";
import { SimNodes } from "../nodes";

type Agg = Extract<Link, { type: "BeltSubChainAggregate" }>;
type LoopClosure = Extract<Link, { type: "BeltLoopClosure" }>;

/**
 * The cut criterion for belt sub-chain aggregates.
 *
 * Summing a belt's segment laws telescopes its interior `q`s away, leaving a purely positional equation.
 * That elimination is only legitimate while nobody outside the belt has a say in those angles: the moment someone does, eliminating an angle hides what they had to say about it.
 * So a sub-chain must end wherever that happens.
 */

/** Link types that constitute a belt's own machinery, as opposed to a stakeholder. */
const BELT_MACHINERY = new Set([
  "BeltLength",
  "BeltPin",
  "BeltJunction",
  "BeltSegmentNoSlip",
  "BeltSubChainAggregate",
  "BeltLoopClosure",
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
 * A stakeholder can speak in either of two syntactic forms, and both count equally: by WRITING the angle outright — a motor assigns it and shares no key at all — or by SHARING a DOF with it, as a pin, a gear mesh or a beam does.
 * Testing only one form misses half the cases: a coupling test misses motors, a writing test misses pins.
 * Hence the single question above rather than a list of link types to special-case.
 *
 * A belt's own machinery does not count, but ANOTHER belt's does — a pulley shared by two belts is a stakeholder of each.
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
 * One aggregate per sub-chain of a belt, cut wherever an angle has a stakeholder beyond the belt.
 * Returns NOTHING when the belt has no cut: its single sub-chain would run dead end to dead end, where the aggregate is `BeltLength` term for term and carries no information the length constraint does not already hold.
 *
 * On a closed belt the strands after the last cut wrap around to join those before the first, so N cuts give exactly N sub-chains.
 * A single cut therefore yields ONE sub-chain whose two bounds are the same angle — `q` cancels and it degenerates to `BeltLength` again.
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
 * The same residual and gradients, on the scalar core: the run's tangent pairs are solved into the shared scratch and everything else is read from it, so an application allocates nothing.
 * Gradients land in `gradX`/`gradY`, indexed by via, over the `viaCount` vias the run touches from `link.viaIndices[0]` onwards.
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

  // The run is cyclically contiguous, so its vias run from the first strand's departure via to the last one's arrival — and the pair BEFORE the first carries that first via's contact arc.
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
 * Apply one sub-chain aggregate.
 * Writes both bound angles and every mobile centre of the run.
 * Returns the residual |C| in belt-px.
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
  // Bound angles weigh as a point of their own rim kinematically, and by their real inertia in dynamics, where the centres' `w` are real masses too.
  const wS = nodes.inertialAngles && iS >= 0 ? nodes.wAngle[iS] : rimWeight(link.rEpsStart);
  const wE = nodes.inertialAngles && iE >= 0 ? nodes.wAngle[iE] : rimWeight(link.rEpsEnd);
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
  if (denom < (nodes.inertialAngles ? Number.MIN_VALUE : 1e-12)) return Math.abs(C);

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

// ───────────────────────────────────────────────────────────────────────────
// The loop closure link (closed belt, fewer than two stakeholders)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Build the loop closure link for a closed belt with fewer than two stakeholders — the case `buildBeltAggregateLinks` cannot cover, since a single cut (or none) degenerates its telescoped sum to `BeltLength` again (see its own doc comment).
 * Returns nothing on an open belt, on too few pulleys, or once two stakeholders already give the loop a `BeltSubChainAggregate`.
 */
export function buildBeltLoopClosureLink(
  positions: Map<string, Point2>,
  angles: Map<string, number>,
  links: Link[],
  spec: BeltAggregateSpec,
): LoopClosure[] {
  if (!spec.closed || spec.gearAngleKeys.length < 2) return [];
  const cuts = spec.cutAngles ?? beltCutAngles(links, spec.gearAngleKeys, spec.owner);
  if (cuts.size >= 2) return [];

  const vias = viasFrom(positions, spec);
  if (!vias) return [];
  const pieces = belt_pieces(vias, true);
  const arrivals = new Array(vias.length).fill(0);
  for (const p of pieces)
    if (p.kind === "arc") arrivals[p.gearIndex] = p.startAngle;

  const segs = pieces
    .map((piece, i) => ({ piece, i }))
    .filter((s) => s.piece.kind === "segment");
  if (segs.length !== spec.gearPosKeys.length) return [];

  const h0 = segs.map(
    (s) => segmentH(vias, pieces, s.i, arrivals.slice(), false)?.h ?? 0,
  );
  const theta0 = spec.gearAngleKeys.map((k) => angles.get(k) ?? 0);

  return [
    {
      type: "BeltLoopClosure",
      ddl: 1,
      gearPosKeys: spec.gearPosKeys,
      gearAngleKeys: spec.gearAngleKeys,
      radii: spec.radii,
      directions: spec.directions,
      h0,
      theta0,
      arrivals,
      owner: spec.owner,
    },
  ];
}

/** Per-via scratch for `applyBeltLoopClosure`, grown once and reused. */
let psiScratch = new Float64Array(16);
let cScratch = new Float64Array(16);
let sScratch = new Float64Array(16);

/**
 * Apply the loop closure: the minimum rim-weighted correction that makes every segment's no-slip law hold AT ONCE, computed directly rather than by relaxing segments one at a time.
 * The per-segment law `q_i − q_{i+1} = Δh_i`, summed cyclically, telescopes to an identity — the loop's residuals `C_i` are consistent (sum to ~0) but individually meaningless in isolation; only their cumulative shape (the prefix sum `S`) says how a rim-length correction has to be shared out.
 * Centering `S` on its own mean picks the unique correction of least weighted norm, the same choice `applyBeltSegmentNoSlip` makes for a single strand — here made for the whole loop in one shot, so it does not depend on which strand a sweep happens to visit first.
 */
export function applyBeltLoopClosure(
  nodes: SimNodes,
  s: LinkSlots,
  link: LoopClosure,
  stiffness = 1.0,
): number {
  const n = link.radii.length;
  if (n < 2) return 0;
  const sc = belt_shared_scratch(n);
  for (let v = 0; v < n; v++) {
    const slot = s.pos[v];
    if (slot < 0) return 0;
    sc.cx[v] = nodes.x[slot];
    sc.cy[v] = nodes.y[slot];
    sc.r[v] = link.radii[v];
    sc.ccw[v] = link.directions[v] ? 1 : 0;
  }
  for (let p = 0; p < n; p++) belt_solve_pair(sc, p, n);

  if (psiScratch.length < n) {
    psiScratch = new Float64Array(n);
    cScratch = new Float64Array(n);
    sScratch = new Float64Array(n);
  }
  for (let v = 0; v < n; v++) {
    if (sc.r[v] > 0 && belt_solve_arc(sc, v, n, true)) {
      const psi = unwrapArrival(sc.arcAngle[v], link.arrivals?.[v]);
      psiScratch[v] = psi;
      if (link.arrivals) link.arrivals[v] = psi;
    } else {
      psiScratch[v] = 0;
    }
  }

  const rEps = (v: number) => link.radii[v] * (link.directions[v] ? -1 : 1);

  let maxAbsC = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const u = sc.r[i] > 0 ? rEps(i) * psiScratch[i] + sc.r[i] * sc.arcWrap[i] : 0;
    const v = sc.r[j] > 0 ? rEps(j) * psiScratch[j] : 0;
    const h = sc.ell[i] + u - v;

    const iAng = s.ang[i];
    const jAng = s.ang[j];
    const thetaI = iAng >= 0 ? nodes.angle[iAng] : 0;
    const thetaJ = jAng >= 0 ? nodes.angle[jAng] : 0;
    const qI = rEps(i) * (thetaI - link.theta0[i]);
    const qJ = rEps(j) * (thetaJ - link.theta0[j]);

    const c = qI - qJ - (h - link.h0[i]);
    cScratch[i] = c;
    maxAbsC = Math.max(maxAbsC, Math.abs(c));
  }

  sScratch[0] = 0;
  for (let i = 1; i < n; i++) sScratch[i] = sScratch[i - 1] + cScratch[i - 1];
  // The least-norm offset is the mean of `S` weighted by each pulley's rim mass: 1 kinematically, J/r² in dynamics, so a heavier pulley is the one that moves less.
  const rimMass = (i: number): number => {
    if (!nodes.inertialAngles) return 1;
    const ang = s.ang[i];
    const re = rEps(i);
    if (ang < 0 || Math.abs(re) < 1e-9 || nodes.wAngle[ang] <= 0) return 0;
    return 1 / (nodes.wAngle[ang] * re * re);
  };
  let weightedS = 0;
  let totalMass = 0;
  for (let i = 0; i < n; i++) {
    const m = rimMass(i);
    weightedS += m * sScratch[i];
    totalMass += m;
  }
  const meanS = totalMass > 0 ? weightedS / totalMass : 0;

  for (let i = 0; i < n; i++) {
    const ang = s.ang[i];
    if (ang < 0) continue;
    const re = rEps(i);
    if (Math.abs(re) < 1e-9) continue;
    nodes.angle[ang] += ((sScratch[i] - meanS) / re) * stiffness;
  }

  return maxAbsC;
}
