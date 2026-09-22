import { Link, Point2 } from "../../../types";
import { ONE } from "../../../types/point2";
import {
  BeltVia,
  belt_at,
  belt_locate,
  belt_pieces,
  belt_shared_scratch,
  belt_solve_arc,
  belt_solve_pairs,
  belt_total,
  nearest_point_on_piece,
} from "../../../utils/belt-path";
import {
  EditNodes,
  Nodes,
  SimNodes,
  SolveNodes,
  point,
  setPoint,
} from "../nodes";
import { LinkSlots } from "./link-slots";
import { unwrapArrival } from "../experimental/belt-noslip-q";

/**
 * The single writer of a gear radius, so its floor cannot be forgotten at one of the sites that move one.
 *
 * That floor is per slot and settled when the solve starts (`solveNodesFromMaps`): a numerical guard against the zero that meshing, belt geometry and ratios all divide into, raised to the smallest gear one can still see and grab at the current zoom.
 * It is one-sided — a gear held at its floor grows back as soon as there is room — and what it refuses to absorb comes back as an error the next sweep, which the free positions then take instead.
 * That is how two meshed gears pushed together stop moving their centres rather than shrinking to nothing.
 */
function write_radius(nodes: EditNodes, slot: number, value: number): void {
  nodes.radius[slot] = Math.max(nodes.minRadius[slot], value);
}

/* ════════════════════════════════════════════════════════════════════════
 * OnSegment: a point held on the segment (start, end)════════════════════════════════════════════════════════════════════════
 *
 * Vector constraint C(p) = pNode − lerp(start, end, t) = 0.
 * The target point on the segment is L(t) = (1−t)·start + t·end, so
 *
 *     ∂C/∂pNode = +I            ‖∇_node‖² = 1
 *     ∂C/∂start = −(1−t)·I      ‖∇_start‖² = (1−t)²
 *     ∂C/∂end   = −t·I          ‖∇_end‖²  = t²
 *
 * The PBD projection splits the correction by wᵢ‖∇ᵢ‖²:
 *
 * denom = w_node·1 + w_start·(1−t)² + w_end·t²
 *     λ     = C / denom            (vector: C is a Point2)
 * Δp_node = −λ · w_node·1 Δp_start = +λ · w_start·(1−t)
 *     Δp_end   = +λ · w_end·t
 *
 * The lever arm `t` has to be in the weights: weighing each end as if t = 0.5 over-loads the FAR end of a node sitting close to one end, injects spurious motion into the neighbouring links, and takes ~6 sweeps where this exact projection converges in one.
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Shared core of both OnSegment constraints: projects pNode onto lerp(start, end, t) with the lever arm `t` in the weights.
 * `t` comes from the caller: fixed for Fixed, reprojected for Slide.
 * `normalOffset` shifts the target perpendicular to the segment, on the side the node already sits.
 * As in `DistanceToLine`, the normal is read off the current geometry and its rotation stays out of the gradient: the target manifold is exact, only the split of the correction is approximate.
 */
function projectOnSegment(
  nodes: Nodes,
  iStart: number,
  iEnd: number,
  iNode: number,
  t: number,
  stiffness: number,
  normalOffset: number = 0,
  /** Which side (of `end − start`'s left normal) the offset is applied on. Omitted, the side
   * is read off the node's own current position — reproducible but not remembered between calls, which is what `FixedOnSegment`/`SlideOnSegment` want.
   * A contact (see `applyPointSegmentContactConstraint`) instead fixes it once, so a single oversized correction (a grab, in particular) landing the node past the segment does not read as "already on its other, now-current side" and stop pushing back. */
  forcedSide?: number,
): number {
  const wNode = nodes.w[iNode];
  const wStart = nodes.w[iStart];
  const wEnd = nodes.w[iEnd];

  const a = 1 - t;
  const denom = wNode + wStart * a * a + wEnd * t * t;
  if (denom < 1e-12) return 0; // everything anchored: nothing to correct

  const sx = nodes.x[iStart];
  const sy = nodes.y[iStart];
  const ex = nodes.x[iEnd];
  const ey = nodes.y[iEnd];
  // foot = lerp(start, end, t), then C = pNode − foot (vector constraint)
  let Cx = nodes.x[iNode] - (sx + (ex - sx) * t);
  let Cy = nodes.y[iNode] - (sy + (ey - sy) * t);
  if (normalOffset !== 0) {
    const dx = ex - sx;
    const dy = ey - sy;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 0) {
      const nx = -dy / len;
      const ny = dx / len;
      // A node right on the segment has no side: the left normal decides, which makes the offset reproducible rather than arbitrary.
      const side = forcedSide ?? (Cx * nx + Cy * ny < 0 ? -1 : 1);
      Cx -= normalOffset * side * nx;
      Cy -= normalOffset * side * ny;
    }
  }
  const error = Math.sqrt(Cx * Cx + Cy * Cy);

  // λ = C / denom, then Δpᵢ = ∓ λ wᵢ ‖∂ᵢ‖, which an anchored point (wᵢ = 0) cancels on its own.
  const lx = Cx * (stiffness / denom);
  const ly = Cy * (stiffness / denom);
  nodes.x[iNode] -= lx * wNode;
  nodes.y[iNode] -= ly * wNode;
  nodes.x[iStart] = sx + lx * (wStart * a);
  nodes.y[iStart] = sy + ly * (wStart * a);
  nodes.x[iEnd] = ex + lx * (wEnd * t);
  nodes.y[iEnd] = ey + ly * (wEnd * t);

  return error;
}

/**
 * Holds a point (keyNode) on the segment (keyStart, keyEnd).
 * `t` is reprojected every sweep and clamped to the segment, so the constraint only acts perpendicular to it: the node slides freely along it.
 */
export function applySlideOnSegmentConstraint(
  nodes: Nodes,
  iStart: number,
  iEnd: number,
  iNode: number,
  stiffness: number = 1.0,
  normalOffset: number = 0,
): number {
  if (iStart < 0 || iEnd < 0 || iNode < 0) return 0;
  const sx = nodes.x[iStart];
  const sy = nodes.y[iStart];
  const dx = nodes.x[iEnd] - sx;
  const dy = nodes.y[iEnd] - sy;

  const edgeLength = Math.sqrt(Math.pow(dx, 2) + Math.pow(dy, 2));
  if (edgeLength === 0) return 0;

  // parameter_on_segment: (node − start)·d / ‖d‖²
  const onSegment =
    ((nodes.x[iNode] - sx) * dx + (nodes.y[iNode] - sy) * dy) /
    (dx * dx + dy * dy);
  // The whole segment, ends included: keeping the slider clear of them would be a rule of the drawing — the block is a fixed number of pixels wide — written into the model, where it would not survive a change of the mechanism's size.
  const t = Math.max(0, Math.min(onSegment, 1));
  return projectOnSegment(
    nodes,
    iStart,
    iEnd,
    iNode,
    t,
    stiffness,
    normalOffset,
  );
}

/**
 * Holds a point (keyNode) exactly at the FIXED ratio `t` along the segment (keyStart, keyEnd), i.e. at lerp(start, end, t).
 * Unlike Slide, `t` is constant, so the constraint acts both along and across the segment.
 */
export function applyFixedOnSegmentConstraint(
  nodes: Nodes,
  iStart: number,
  iEnd: number,
  iNode: number,
  t: number,
  stiffness: number = 1.0,
  normalOffset: number = 0,
): number {
  if (iStart < 0 || iEnd < 0 || iNode < 0) return 0;
  return projectOnSegment(
    nodes,
    iStart,
    iEnd,
    iNode,
    t,
    stiffness,
    normalOffset,
  );
}

/**
 * Non-penetration between a point (keyNode) and a segment (keyStart, keyEnd): keeps the node at least `offset` from its nearest point on the segment — extremities included, never projected past them — on the fixed `side` (of `end − start`'s left normal; `+1` or `-1`) it is presumed to be approaching from.
 * `offset` is a contact margin, not a physical size: a plain point-vs-beam contact and a gear-vs-beam contact (`offset` = the gear's radius) share this one function.
 *
 * `side` is deliberately an input, not read off the node's own current position the way `SlideOnSegment`/`FixedOnSegment` read theirs: an UNSIGNED gate (violated only when closer than `offset`, whichever side that is) reads a node a single oversized correction has thrown clean across the segment — a grab in particular, whose per-iteration step can exceed the whole contact band — as newly arrived on its far side, and lets it go.
 * Fixing the allowed side once (see `collision_links`, which reads it off the previous frame, before anything this frame could have moved it) makes the gate SIGNED instead: negative once truly past the segment, however far, so it stays violated and gets pulled back rather than being waved through.
 *
 * That signed gate only applies where the node projects INSIDE the segment's span (`t` strictly between the ends): there, `point − foot` is purely along the normal, so "which side" is exactly what a crossing means.
 * At a clamped end, `point − foot` also carries a TANGENTIAL component (how far past the corner it is), which the segment's side does not describe — a point that flew off the end AND past the line should not be dragged back from arbitrarily far away just because of which side it lands on.
 * There, this falls back to the plain (unsigned) Euclidean distance from the corner, same as `MinDistance`.
 */
export function applyPointSegmentContactConstraint(
  nodes: Nodes,
  iStart: number,
  iEnd: number,
  iNode: number,
  offset: number,
  side: number,
  stiffness: number = 1.0,
): number {
  if (iStart < 0 || iEnd < 0 || iNode < 0) return 0;
  const sx = nodes.x[iStart];
  const sy = nodes.y[iStart];
  const dx = nodes.x[iEnd] - sx;
  const dy = nodes.y[iEnd] - sy;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return 0;

  const raw = ((nodes.x[iNode] - sx) * dx + (nodes.y[iNode] - sy) * dy) / lenSq;
  const t = Math.max(0, Math.min(raw, 1));
  const footX = sx + dx * t;
  const footY = sy + dy * t;
  const ndx = nodes.x[iNode] - footX;
  const ndy = nodes.y[iNode] - footY;

  if (raw > 0 && raw < 1) {
    const len = Math.sqrt(lenSq);
    const signedDist = (ndx * -dy + ndy * dx) * (side / len);
    if (signedDist >= offset) return 0; // clear, on the allowed side
  } else if (ndx * ndx + ndy * ndy >= offset * offset) {
    return 0; // clamped to a corner and clear of it, whichever side
  }

  return projectOnSegment(nodes, iStart, iEnd, iNode, t, stiffness, offset, side);
}

/**
 * `MinDistanceToSegment`'s counterpart for an infinite line instead of a bounded segment: keeps a point (`iNode`) at least `offset` from the line through `iAnchor`, in the direction `normal` already points, and says nothing once it is.
 *
 * No `side`, no projection, no corner case.
 * `MinDistanceToSegment` needs `side` fixed once per frame because a real segment's own endpoints can move — its "which side" would otherwise be re-derived from live geometry an oversized correction could have already crossed.
 * A floor's anchor is pinned (`invMass = 0`) and `normal` is baked in from its angle at compile time: neither ever moves during a run, so the direction never goes stale and there is nothing to fix ahead of time.
 * Nor is there a corner to fall off of.
 */
export function applyPointLineContactConstraint(
  nodes: Nodes,
  iAnchor: number,
  iNode: number,
  normal: Point2,
  offset: number,
  stiffness: number = 1.0,
): number {
  if (iAnchor < 0 || iNode < 0) return 0;
  const dx = nodes.x[iNode] - nodes.x[iAnchor];
  const dy = nodes.y[iNode] - nodes.y[iAnchor];
  const signedDist = dx * normal.x + dy * normal.y;
  if (signedDist >= offset) return 0;

  const wAnchor = nodes.w[iAnchor];
  const wNode = nodes.w[iNode];
  const totalW = wAnchor + wNode;
  if (totalW === 0) return 0;

  const error = (offset - signedDist) * stiffness;
  if (wNode !== 0) {
    const k = (wNode / totalW) * error;
    nodes.x[iNode] += normal.x * k;
    nodes.y[iNode] += normal.y * k;
  }
  if (wAnchor !== 0) {
    const k = (wAnchor / totalW) * error;
    nodes.x[iAnchor] -= normal.x * k;
    nodes.y[iAnchor] -= normal.y * k;
  }
  return offset - signedDist;
}

/* ════════════════════════════════════════════════════════════════════════
 * EqualLength: two segments of the same length════════════════════════════════════════════════════════════════════════
 *
 * Target = the common length both segments are pulled toward.
 * The more MOBILE segment has to adapt the most, so it weighs the LEAST in the target: mobility is CROSSED.
 *
 * targetLen = (l1·w2 + l2·w1) / (w1 + w2)
 *
 * Uncrossed weights break the anchored case: with segment 1 fully anchored (w1 = 0) the only solution is seg2 → l1, but they would aim at l2 and ask the anchored segment to comply, correcting nothing while reporting the error every sweep.
 *
 * Ordering: applyDistanceConstraint is called twice in the same pass.
 * The second call already sees the first one's effect through shared positions, but the target is computed BEFORE any write, so both segments aim at the same value.
 * The solver sweeps again anyway, and absorbs the residual between segments in the next passes.
 * ──────────────────────────────────────────────────────────────────────── */

/** Contraint deux segments à avoir la même longueur. */
export function applyEqualLengthConstraint(
  nodes: Nodes,
  s1: number,
  e1: number,
  s2: number,
  e2: number,
  stiffness: number = 1.0,
): number {
  if (s1 < 0 || e1 < 0 || s2 < 0 || e2 < 0) return 0;
  const ps1 = point(nodes, s1);
  const pe1 = point(nodes, e1);
  const ps2 = point(nodes, s2);
  const pe2 = point(nodes, e2);

  const len1 = pe1.sub(ps1).length();
  const len2 = pe2.sub(ps2).length();

  const w1 = nodes.w[s1] + nodes.w[e1];
  const w2 = nodes.w[s2] + nodes.w[e2];
  const totalW = w1 + w2;

  // CROSSED mobility: the less mobile segment pulls the target toward its own length.
  const targetLen =
    totalW > 0 ? (len1 * w2 + len2 * w1) / totalW : (len1 + len2) / 2;

  const error = Math.abs(len1 - len2);

  applyDistanceConstraint(nodes, s1, e1, targetLen, stiffness);
  applyDistanceConstraint(nodes, s2, e2, targetLen, stiffness);
  return error;
}

/* ════════════════════════════════════════════════════════════════════════
 * PBD projection of 4-point angular constraints════════════════════════════════════════════════════════════════════════
 *
 * Every constraint below imposes a scalar function of the form
 *
 *     C(p) = θ(v₂) − θ(v₁) − θ_cible          (v₁ = e₁−s₁,  v₂ = e₂−s₂)
 *
 * The standard PBD projection of a scalar constraint is
 *
 *     λ    = −C / Σᵢ wᵢ ‖∇ᵢC‖²
 * Δpᵢ = λ · wᵢ · ∇ᵢC
 *
 * with, for the angle (perp(x,y) = (−y, x)):
 *
 *     ∇_{s₁}C = +perp(v₁)/‖v₁‖²     ∇_{e₁}C = −perp(v₁)/‖v₁‖²
 *     ∇_{s₂}C = −perp(v₂)/‖v₂‖²     ∇_{e₂}C = +perp(v₂)/‖v₂‖²
 *
 * Properties that come for free, without any guard:
 * • an anchored point (wᵢ = 0) does not move, Δpᵢ cancels in the formula;
 * • the segment then pivots about that point, the only motion the gradient leaves the free one;
 * • every Δpᵢ is ⟂ to its segment, so the length is only touched to second order;
 * • the correction asked for is the one obtained, so stiffness and convergence are predictable.
 *
 * Since ‖perp(vᵢ)‖² = ‖vᵢ‖², ‖∇ᵢC‖² = 1/‖vᵢ‖² as long as the four points are distinct, which is not guaranteed: see `projectAngleC`.
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Shared core: projects the scalar constraint `C` (already wrapped to (−π, π]) onto the four ends of both segments, point by point according to their mobility.
 * Used by Angle, Parallel and Normal, which only differ in how they compute `C`.
 *
 * Two of the four ends may be the SAME node: a `join` welding one beam's end onto the next's start puts that node on both segments at once.
 * Its gradient is then the sum of the two it would carry separately, and both the denominator and the correction are built on that merged gradient — written per end instead, the second write would silently overwrite the first and the node would move by one of its two shares.
 *
 * Does nothing and returns |C| when no correction is possible (a degenerate segment, or every point anchored).
 */
function projectAngleC(
  nodes: Nodes,
  s1: number,
  e1: number,
  s2: number,
  e2: number,
  v1: Point2,
  v2: Point2,
  C: number,
  stiffness: number,
): number {
  const l1sq = v1.length_squared();
  const l2sq = v2.length_squared();
  if (l1sq === 0 || l2sq === 0) return Math.abs(C);

  // One gradient per point, each of squared norm 1/lᵢ².
  const g_s1 = v1.perp().mul(1 / l1sq); //  +perp(v₁)/‖v₁‖²
  const g_e1 = g_s1.mul(-1); //  −perp(v₁)/‖v₁‖²
  const g_s2 = v2.perp().mul(-1 / l2sq); //  −perp(v₂)/‖v₂‖²
  const g_e2 = g_s2.mul(-1); //  +perp(v₂)/‖v₂‖²

  if (s1 === e1 || s1 === s2 || s1 === e2 || e1 === s2 || e1 === e2 || s2 === e2)
    return projectAngleCMerged(nodes, s1, e1, s2, e2, g_s1, g_s2, C, stiffness);

  const w_s1 = nodes.w[s1];
  const w_e1 = nodes.w[e1];
  const w_s2 = nodes.w[s2];
  const w_e2 = nodes.w[e2];

  // Σ wᵢ‖∇ᵢC‖² = (w_s1+w_e1)/l1² + (w_s2+w_e2)/l2²
  const denom = (w_s1 + w_e1) / l1sq + (w_s2 + w_e2) / l2sq;
  if (denom < 1e-12) return Math.abs(C); // everything anchored: nothing to do

  const lambda = (-C / denom) * stiffness;

  // Δpᵢ = λ · wᵢ · ∇ᵢC, which an anchored point (wᵢ = 0) cancels without an `if`.
  const ps1 = point(nodes, s1);
  const pe1 = point(nodes, e1);
  const ps2 = point(nodes, s2);
  const pe2 = point(nodes, e2);
  setPoint(nodes, s1, ps1.add(g_s1.mul(lambda * w_s1)));
  setPoint(nodes, e1, pe1.add(g_e1.mul(lambda * w_e1)));
  setPoint(nodes, s2, ps2.add(g_s2.mul(lambda * w_s2)));
  setPoint(nodes, e2, pe2.add(g_e2.mul(lambda * w_e2)));

  return Math.abs(C);
}

/** Scratch for the merged projection below — at most four ends. */
const angleSlot = new Int32Array(4);
const angleGradX = new Float64Array(4);
const angleGradY = new Float64Array(4);

/**
 * `projectAngleC` where two of the four ends are the same node: its gradient is the sum of the two it would carry separately, so the four ends are merged per node first and both `Σ wᵢ‖∇ᵢC‖²` and the corrections are built on the merged gradients.
 * Written per end instead, the second `setPoint` would overwrite the first and the node would move by one of its two shares alone.
 *
 * Split out rather than folded in so that a link whose ends ARE distinct — every one but a weld — keeps the closed-form denominator it had, to the bit.
 */
function projectAngleCMerged(
  nodes: Nodes,
  s1: number,
  e1: number,
  s2: number,
  e2: number,
  g_s1: Point2,
  g_s2: Point2,
  C: number,
  stiffness: number,
): number {
  let n = 0;
  const push = (slot: number, gx: number, gy: number) => {
    for (let k = 0; k < n; k++)
      if (angleSlot[k] === slot) {
        angleGradX[k] += gx;
        angleGradY[k] += gy;
        return;
      }
    angleSlot[n] = slot;
    angleGradX[n] = gx;
    angleGradY[n] = gy;
    n++;
  };
  push(s1, g_s1.x, g_s1.y);
  push(e1, -g_s1.x, -g_s1.y);
  push(s2, g_s2.x, g_s2.y);
  push(e2, -g_s2.x, -g_s2.y);

  let denom = 0;
  for (let k = 0; k < n; k++)
    denom +=
      nodes.w[angleSlot[k]] *
      (angleGradX[k] * angleGradX[k] + angleGradY[k] * angleGradY[k]);
  if (denom < 1e-12) return Math.abs(C);

  const lambda = (-C / denom) * stiffness;
  for (let k = 0; k < n; k++) {
    const slot = angleSlot[k];
    const w = nodes.w[slot];
    setPoint(
      nodes,
      slot,
      point(nodes, slot).add(
        new Point2(angleGradX[k] * lambda * w, angleGradY[k] * lambda * w),
      ),
    );
  }

  return Math.abs(C);
}


/** Ramène un écart angulaire dans (−π, π]. */
function wrapPi(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a <= -Math.PI) a += 2 * Math.PI;
  return a;
}

/* ════════════════════════════════════════════════════════════════════════
 * applyAngleConstraint (PBD projection)════════════════════════════════════════════════════════════════════════ */

/**
 * Holds the oriented angle between two segments at targetAngle.
 *
 * flipStart/flipEnd and couterClockwise only read the target in the right quadrant; they leave the geometry of the correction unchanged.
 *
 * PBD projection: see the header above.
 * An anchored point stays put and the segment pivots about it, with no special case and no shortening.
 */
export function applyAngleConstraint(
  nodes: Nodes,
  s1: number,
  e1: number,
  s2: number,
  e2: number,
  flipStart: boolean,
  flipEnd: boolean,
  couterClockwise: boolean,
  targetAngle: number,
  stiffness: number = 1.0,
): number {
  if (s1 < 0 || e1 < 0 || s2 < 0 || e2 < 0) return 0;
  const ps1 = point(nodes, s1);
  const pe1 = point(nodes, e1);
  const ps2 = point(nodes, s2);
  const pe2 = point(nodes, e2);

  const delta1 = pe1.sub(ps1);
  const delta2 = pe2.sub(ps2);
  if (delta1.length_squared() === 0 || delta2.length_squared() === 0) return 0;

  // The target is read on the flipped, "virtual" vectors.
  // The gradient is computed on the real ones: a flip is a global negation, which leaves perp(v)/‖v‖² unchanged up to a sign that C absorbs.
  const virtV1 = flipStart ? delta1.mul(-1) : delta1;
  const virtV2 = flipEnd ? delta2.mul(-1) : delta2;
  const currentAngle = virtV1.angle_to(virtV2);

  const C = wrapPi(currentAngle - targetAngle * (couterClockwise ? -1 : 1));
  // A numerical zero only: any wider band is backlash, a weld that rattles within it and snaps at its edge.
  if (Math.abs(C) < 1e-9) return 0;

  // Projected with the real delta1/delta2: θ(virtV) and θ(delta) differ by a constant (0 or π) per segment, so ∂C/∂p is the same.
  return projectAngleC(nodes, s1, e1, s2, e2, delta1, delta2, C, stiffness);
}

/* ════════════════════════════════════════════════════════════════════════
 * applyParallelConstraint (PBD projection)════════════════════════════════════════════════════════════════════════ */

/**
 * Holds two segments parallel.
 *
 * Target: a relative angle of 0, modulo π since segments are not oriented.
 * The shortest correction is picked by wrapping C to (−π/2, π/2].
 * Same PBD projection as Angle.
 */
export function applyParallelConstraint(
  nodes: Nodes,
  s1: number,
  e1: number,
  s2: number,
  e2: number,
  stiffness: number = 1.0,
): number {
  if (s1 < 0 || e1 < 0 || s2 < 0 || e2 < 0) return 0;
  const ps1 = point(nodes, s1);
  const pe1 = point(nodes, e1);
  const ps2 = point(nodes, s2);
  const pe2 = point(nodes, e2);

  const v1 = pe1.sub(ps1);
  const v2 = pe2.sub(ps2);
  if (v1.length_squared() === 0 || v2.length_squared() === 0) return 0;

  // Modulo π: the shortest correction lives in (−π/2, π/2].
  let C = v1.angle_to(v2);
  while (C > Math.PI / 2) C -= Math.PI;
  while (C <= -Math.PI / 2) C += Math.PI;

  return projectAngleC(nodes, s1, e1, s2, e2, v1, v2, C, stiffness);
}

/* ════════════════════════════════════════════════════════════════════════
 * applyNormalConstraint (PBD projection)════════════════════════════════════════════════════════════════════════ */

/**
 * Holds two segments perpendicular (angle = π/2).
 *
 * Same as Parallel with the target shifted by π/2, and the same PBD projection.
 */
export function applyNormalConstraint(
  nodes: Nodes,
  s1: number,
  e1: number,
  s2: number,
  e2: number,
  stiffness: number = 1.0,
): number {
  if (s1 < 0 || e1 < 0 || s2 < 0 || e2 < 0) return 0;
  const ps1 = point(nodes, s1);
  const pe1 = point(nodes, e1);
  const ps2 = point(nodes, s2);
  const pe2 = point(nodes, e2);

  const v1 = pe1.sub(ps1);
  const v2 = pe2.sub(ps2);
  if (v1.length_squared() === 0 || v2.length_squared() === 0) return 0;

  // Gap to π/2, wrapped modulo π to (−π/2, π/2].
  let C = v1.angle_to(v2) - Math.PI / 2;
  while (C > Math.PI / 2) C -= Math.PI;
  while (C <= -Math.PI / 2) C += Math.PI;

  return projectAngleC(nodes, s1, e1, s2, e2, v1, v2, C, stiffness);
}

/* ════════════════════════════════════════════════════════════════════════
 * applyKeepOrientationConstraint (PBD projection)════════════════════════════════════════════════════════════════════════
 *
 * A single segment, aligned on a fixed direction.
 * It is the angle constraint with the target direction as an immobile "second segment" (infinite weight, so no gradient on that side).
 * What remains is a scalar constraint on (s, e):
 *
 *     C(p) = θ(e−s) − θ_dir      (wrapped to (−π, π])
 *     ∇_e C = +perp(v)/‖v‖²      ∇_s C = −perp(v)/‖v‖²
 * λ = −C / [(w_s + w_e)/‖v‖²]
 *
 * (v = e−s: moving `e` by +perp(v) increases θ(v), hence the + on ∇_e.)
 *
 * As with the angle, an anchored end stays put and the segment pivots about it, not about its middle, and without shortening.
 * ──────────────────────────────────────────────────────────────────────── */

/** Holds the segment (keyStart, keyEnd) parallel to `direction`. */
export function applyKeepOrientationConstraint(
  nodes: Nodes,
  iStart: number,
  iEnd: number,
  direction: Point2,
  stiffness: number = 1.0,
): number {
  if (iStart < 0 || iEnd < 0) return 0;
  const start = point(nodes, iStart);
  const end = point(nodes, iEnd);
  if (direction.length_squared() === 0) return 0;

  const v = end.sub(start);
  const lsq = v.length_squared();
  if (lsq === 0) return 0;

  // Orientation gap, modulo π since a segment is not oriented.
  let C = direction.angle_to(v);
  while (C > Math.PI / 2) C -= Math.PI;
  while (C <= -Math.PI / 2) C += Math.PI;
  if (Math.abs(C) < 1e-9) return 0;

  const wS = nodes.w[iStart];
  const wE = nodes.w[iEnd];

  const denom = (wS + wE) / lsq;
  if (denom < 1e-12) return Math.abs(C);

  const lambda = (-C / denom) * stiffness;
  const g_e = v.perp().mul(1 / lsq); // +perp(v)/‖v‖²
  const g_s = g_e.mul(-1); // −perp(v)/‖v‖²

  setPoint(nodes, iStart, start.add(g_s.mul(lambda * wS)));
  setPoint(nodes, iEnd, end.add(g_e.mul(lambda * wE)));

  return Math.abs(C);
}

/**
 * Pulls a position or a radius toward targetValue.
 * Keep `stiffness` under 1 for a pull weaker than the other constraints.
 */
export function applyHandleGrabConstraint(
  nodes: Nodes,
  /** The radius DOF array — edition only, where a grab can target a radius. */
  radii: Float64Array | undefined,
  iPos: number,
  iRad: number,
  targetValue: Point2 | number,
  stiffness: number = 0.5,
  maxAmplitude: number = 10,
): number {
  if (typeof targetValue === "number") {
    // Radius
    if (radii === undefined || iRad < 0) return 0;
    const r = radii[iRad];
    if (!r) return 0;
    const delta = targetValue - r;
    let target = delta * stiffness;
    if (target > maxAmplitude) target = maxAmplitude;
    if (target < -maxAmplitude) target = -maxAmplitude;
    radii[iRad] = r + target;
    return Math.abs(delta);
  } else {
    // Position — respect mass (grounded elements cannot be moved)
    if (iPos < 0) return 0;
    if (nodes.w[iPos] === 0) return 0;
    const p = point(nodes, iPos);
    const delta = targetValue.sub(p);
    const target = delta.mul(stiffness).limit_length_max(maxAmplitude);
    setPoint(nodes, iPos, p.add(target));
    return delta.length();
  }
}

/** Holds the distance between two points at targetDist.
 * The error is corrected along the p1→p2 axis, each point moving in proportion to its mobility (w/totalW) and to stiffness.
 *
 * Coincident points carry no axis, so the separation borrows `preferredAxis` when the caller knows which way the points should part (a belt terminal leaves along the loop tangent); without one it falls back to a fixed diagonal, which keeps the outcome deterministic instead of frame-dependent. */
/**
 * XPBD state for ONE compliant constraint: the multiplier accumulated since the substep started, and the compliance divided by `dt²` that the accumulation is weighed against.
 * Absent, the constraint is rigid and the projection is exactly the one it always was.
 */
export interface Compliance {
  /** `α/dt²`, in the same units as `Σ wᵢ‖∇ᵢC‖²`. */
  alphaTilde: number;
  /** Read and written in place — λ is per constraint and per SUBSTEP, never per sweep. */
  lambda: Float64Array;
  index: number;
}

export function applyDistanceConstraint(
  nodes: Nodes,
  i1: number,
  i2: number,
  targetDist: number,
  stiffness: number = 1.0,
  preferredAxis?: Point2,
  compliance?: Compliance,
): number {
  if (i1 < 0 || i2 < 0) return 0;
  const w1 = nodes.w[i1];
  const w2 = nodes.w[i2];

  const totalW = w1 + w2;
  if (totalW === 0) return 0;

  const x1 = nodes.x[i1];
  const y1 = nodes.y[i1];
  const dx = nodes.x[i2] - x1;
  const dy = nodes.y[i2] - y1;
  if (dx * dx + dy * dy === 0) {
    // Already satisfied, and the null length would divide into NaN below.
    if (targetDist === 0) return 0;
    const axis =
      preferredAxis && preferredAxis.length_squared() > 0 ? preferredAxis : ONE;
    const step = axis.normalize().mul(targetDist * stiffness);
    if (w1 !== 0)
      setPoint(nodes, i1, point(nodes, i1).sub(step.mul(w1 / totalW)));
    if (w2 !== 0)
      setPoint(nodes, i2, point(nodes, i2).add(step.mul(w2 / totalW)));
    return targetDist;
  }
  const length = Math.sqrt(dx * dx + dy * dy);
  const error = length - targetDist;

  // XPBD: Δλ = (−C − α̃·λ) / (Σ wᵢ‖∇ᵢC‖² + α̃), and Δpᵢ = Δλ·wᵢ·∇ᵢC. With α̃ = 0 this is −C/Σwᵢ and λ never appears — the rigid projection this has always been, to the bit.
  // A real compliance instead lets the constraint hold a finite force, which is what makes the share of load between the members of a hyperstatic structure their stiffnesses' business rather than the sweep order's.
  let scaled: number;
  if (compliance && compliance.alphaTilde > 0) {
    const { alphaTilde, lambda, index } = compliance;
    const dLambda = (-error - alphaTilde * lambda[index]) / (totalW + alphaTilde);
    lambda[index] += dLambda;
    scaled = -dLambda;
  } else {
    scaled = error / totalW;
  }

  const k1 = (scaled / length) * w1 * stiffness;
  const k2 = (scaled / length) * w2 * stiffness;
  nodes.x[i1] = x1 + dx * k1;
  nodes.y[i1] = y1 + dy * k1;
  nodes.x[i2] = nodes.x[i2] - dx * k2;
  nodes.y[i2] = nodes.y[i2] - dy * k2;
  return Math.abs(error);
}

/**
 * Keeps two points from coming closer than `minDistance`, and says nothing while they are further apart.
 *
 * An inequality is the only right form for a floor: a `Distance` would also pull the points together when they are too far, turning the bar into one of fixed length.
 * What it refuses to absorb comes back at the next sweep and goes to the other degrees of freedom, which is how a mechanism pushed past its stroke stops instead of collapsing.
 *
 * Two coincident points have no axis: separating them is left to `applyDistanceConstraint`, which picks one.
 */
export function applyMinDistanceConstraint(
  nodes: Nodes,
  i1: number,
  i2: number,
  minDistance: number,
  stiffness: number = 1.0,
): number {
  if (i1 < 0 || i2 < 0 || i1 === i2) return 0;
  const dx = nodes.x[i2] - nodes.x[i1];
  const dy = nodes.y[i2] - nodes.y[i1];
  if (dx * dx + dy * dy >= minDistance * minDistance) return 0;
  return applyDistanceConstraint(nodes, i1, i2, minDistance, stiffness);
}

/**
 * Holds the perpendicular distance between a point (keyNode) and the line through (keyStart, keyEnd).
 * Each point moves in proportion to its mobility to reduce the error.
 */
export function applyDistanceToLineConstraint(
  nodes: Nodes,
  iStart: number,
  iEnd: number,
  iNode: number,
  targetDist: number,
  stiffness: number = 1.0,
): number {
  if (iStart < 0 || iEnd < 0 || iNode < 0) return 0;
  const pNode = point(nodes, iNode);
  const start = point(nodes, iStart);
  const end = point(nodes, iEnd);
  const wNode = nodes.w[iNode];
  const wStart = nodes.w[iStart];
  const wEnd = nodes.w[iEnd];

  // Unit normal of the line, pointing toward the node.
  const proj = pNode.project_on_line(start, end);
  const vec = pNode.sub(proj); // from the foot of the perpendicular to the node
  const len = vec.length();

  let perpDir: Point2;
  if (len === 0) {
    // A node on the line has no side: any normal will do.
    perpDir = end.sub(start).perp().normalize();
  } else {
    perpDir = vec.mul(1 / len);
  }

  const currentDist = len;
  const error = currentDist - targetDist; // signed: positive when too far

  // wNode moves the node, (wStart+wEnd)/2 moves the line.
  const wLine = (wStart + wEnd) / 2;
  const totalW = wNode + wLine;
  if (totalW === 0) return 0;

  // The node takes its `wNode/totalW` share of the error.
  const nodeCorrection = perpDir.mul(-error * (wNode / totalW) * stiffness);
  if (wNode !== 0) setPoint(nodes, iNode, pNode.add(nodeCorrection));

  // The line takes the `wLine/totalW` rest, moving away from the node.
  const lineCorrection = perpDir.mul(error * (wLine / totalW) * stiffness);
  if (wStart !== 0) setPoint(nodes, iStart, start.add(lineCorrection));
  if (wEnd !== 0) setPoint(nodes, iEnd, end.add(lineCorrection));

  return Math.abs(error);
}

/**
 * Holds both points at the same Y (horizontal alignment).
 * The target Y is the mobility-weighted mean of the two.
 */
export function applyHorizontalConstraint(
  nodes: Nodes,
  iStart: number,
  iEnd: number,
  stiffness: number = 1.0,
): number {
  if (iStart < 0 || iEnd < 0) return 0;
  const start = point(nodes, iStart);
  const end = point(nodes, iEnd);
  const wStart = nodes.w[iStart];
  const wEnd = nodes.w[iEnd];

  const totalW = wStart + wEnd;
  if (totalW === 0) return 0;

  const error = start.y - end.y;

  if (wStart !== 0)
    setPoint(
      nodes,
      iStart,
      new Point2(start.x, start.y - error * (wStart / totalW) * stiffness),
    );
  if (wEnd !== 0) {
    setPoint(
      nodes,
      iEnd,
      new Point2(end.x, end.y + error * (wEnd / totalW) * stiffness),
    );
  }
  return Math.abs(error);
}

/**
 * Holds both points at the same X (vertical alignment).
 * The target X is the mobility-weighted mean of the two.
 */
export function applyVerticalConstraint(
  nodes: Nodes,
  iStart: number,
  iEnd: number,
  stiffness: number = 1.0,
): number {
  if (iStart < 0 || iEnd < 0) return 0;
  const start = point(nodes, iStart);
  const end = point(nodes, iEnd);
  const wStart = nodes.w[iStart];
  const wEnd = nodes.w[iEnd];

  const totalW = wStart + wEnd;
  if (totalW === 0) return 0;

  const error = start.x - end.x;

  if (wStart !== 0)
    setPoint(
      nodes,
      iStart,
      new Point2(start.x - error * (wStart / totalW) * stiffness, start.y),
    );
  if (wEnd !== 0)
    setPoint(
      nodes,
      iEnd,
      new Point2(end.x + error * (wEnd / totalW) * stiffness, end.y),
    );
  return Math.abs(error);
}

/**
 * Holds the distance between two gear centres at exactly r1+r2, the meshing condition.
 * The correction is shared between positions and radii by their mobility: blocked centres leave it to the radii, and the other way round.
 */
export function applyGearMeshingConstraint(
  nodes: EditNodes,
  g1: number,
  g2: number,
  rg1: number,
  rg2: number,
  stiffness: number = 1.0,
): number {
  // r1/r2 may be 0 (the zero-radius bridge a radius grab uses): test that the node exists, not falsiness, or the constraint cancels itself.
  if (g1 < 0 || g2 < 0 || rg1 < 0 || rg2 < 0) return 0;
  const p1 = point(nodes, g1);
  const p2 = point(nodes, g2);
  const r1 = nodes.radius[rg1];
  const r2 = nodes.radius[rg2];
  const wPos1 = nodes.w[g1];
  const wPos2 = nodes.w[g2];
  const wRad1 = nodes.wRadius[rg1];
  const wRad2 = nodes.wRadius[rg2];

  const dist = p1.distance_to(p2);
  const targetDist = r1 + r2;
  const error = dist - targetDist; // signed: positive when too far apart

  // Positions and radii weigh the same: a radius corrects the distance error one for one, like a point.
  const totalW = wPos1 + wPos2 + wRad1 + wRad2;
  if (totalW === 0) return 0;

  // Positions: the centres move along their own axis.
  if (wPos1 !== 0 || wPos2 !== 0) {
    const posW = wPos1 + wPos2;
    applyDistanceConstraint(
      nodes,
      g1,
      g2,
      targetDist,
      (posW / totalW) * stiffness,
    );
  }

  // Radii absorb the rest of the error, both in the same direction: both grow when dist > r1+r2.
  const radCorrection = error * stiffness;
  if (wRad1 !== 0)
    write_radius(nodes, rg1, r1 + radCorrection * (wRad1 / totalW));
  if (wRad2 !== 0)
    write_radius(nodes, rg2, r2 + radCorrection * (wRad2 / totalW));
  return Math.abs(error);
}

/**
 * Holds the ratio of two gear radii at `ratio` (r1/r2 = ratio).
 * The correction is shared between both radii by their mobility, so the free radius moves more than the anchored one.
 */
export function applyGearRatioConstraint(
  nodes: EditNodes,
  g1: number,
  g2: number,
  ratio: number,
  stiffness: number = 1.0,
): number {
  if (g1 < 0 || g2 < 0) return 0;
  const r1 = nodes.radius[g1];
  const r2 = nodes.radius[g2];
  const w1 = nodes.wRadius[g1];
  const w2 = nodes.wRadius[g2];
  if (!r1 || !r2) return 0;

  const totalW = w1 + w2;
  if (totalW === 0) return 0;

  const currentRatio = r1 / r2;
  const ratioError = currentRatio - ratio; // signed
  const error = Math.abs(ratioError);

  // Each radius is pulled toward the value that would satisfy the ratio if the other held still, by its share of the mobility.
  const targetR1 = ratio * r2; // r1 if r2 held still
  const targetR2 = r1 / ratio; // r2 if r1 held still
  if (w1 !== 0)
    write_radius(nodes, g1, r1 + (targetR1 - r1) * (w1 / totalW) * stiffness);
  if (w2 !== 0)
    write_radius(nodes, g2, r2 + (targetR2 - r2) * (w2 / totalW) * stiffness);

  return error;
}

/** Wrap an angle difference to (−π, π]. */
function wrap_angle(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a <= -Math.PI) a += 2 * Math.PI;
  return a;
}

/**
 * Motor on a beam: turns `drivenKey` about `pivotKey` toward the absolute world angle `targetAngle` of pivot→driven.
 * Ordinary priority: a blocked mechanism keeps a residual rather than reaching an invalid state.
 */
export function applyMotorBeamConstraint(
  nodes: Nodes,
  iPivot: number,
  iDriven: number,
  targetAngle: number,
  stiffness: number = 1.0,
): number {
  if (iPivot < 0 || iDriven < 0) return 0;
  if (nodes.w[iDriven] === 0) return 0;
  const pivot = point(nodes, iPivot);
  const driven = point(nodes, iDriven);

  const v = driven.sub(pivot);
  if (v.length_squared() < 1e-12) return 0;
  const diff = wrap_angle(targetAngle - v.angle());
  setPoint(nodes, iDriven, pivot.add(v.rotate(diff * stiffness)));
  return Math.abs(diff);
}

/** Motor on a gear: pushes the angle node `iAngle` toward `targetAngle`. */
export function applyMotorAngleConstraint(
  nodes: SimNodes,
  iAngle: number,
  targetAngle: number,
  stiffness: number = 1.0,
): number {
  if (iAngle < 0) return 0;
  const a = nodes.angle[iAngle];
  const diff = targetAngle - a; // cumulative, never wrapped
  nodes.angle[iAngle] = a + diff * stiffness;
  return Math.abs(diff);
}

/**
 * Epicyclic meshing in angle space, a passive layer that only writes angle nodes.
 * `alpha` is the continuous angle of the line of centres.
 * C = r1·((θ1−θ1₀) − Δα) + r2·((θ2−θ2₀) − Δα), Δα = alpha − alpha0.
 */
export function applyGearMeshAngleConstraint(
  nodes: SimNodes,
  iAngle1: number,
  iAngle2: number,
  r1: number,
  r2: number,
  theta1_0: number,
  theta2_0: number,
  alpha0: number,
  alpha: number,
  stiffness: number = 1.0,
): number {
  if (iAngle1 < 0 || iAngle2 < 0) return 0;
  const a1 = nodes.angle[iAngle1];
  const a2 = nodes.angle[iAngle2];
  const w1 = nodes.wAngle[iAngle1];
  const w2 = nodes.wAngle[iAngle2];

  const dAlpha = alpha - alpha0;
  const C = r1 * (a1 - theta1_0 - dAlpha) + r2 * (a2 - theta2_0 - dAlpha);
  const denom = w1 * r1 * r1 + w2 * r2 * r2;
  if (denom === 0) return 0;

  nodes.angle[iAngle1] = a1 - (w1 * r1 * C * stiffness) / denom;
  nodes.angle[iAngle2] = a2 - (w2 * r2 * C * stiffness) / denom;
  return Math.abs(C);
}

/**
 * A node fixed on a gear's perimeter, its position coupled to the angle θ: angle(N − centre) = θ + offset and |N − centre| = radius.
 * Both ways: the angular correction is shared between turning N and θ, then the radius is held by moving N AND the centre by their masses, so an anchored N moves the gear centre.
 */
export function applyGearPerimeterPinConstraint(
  nodes: SimNodes,
  iNode: number,
  iCenter: number,
  iAngle: number,
  radius: number,
  offset: number,
  stiffness: number = 1.0,
): number {
  if (iNode < 0 || iCenter < 0 || iAngle < 0) return 0;
  const cx = nodes.x[iCenter];
  const cy = nodes.y[iCenter];
  const theta = nodes.angle[iAngle];

  const vx = nodes.x[iNode] - cx;
  const vy = nodes.y[iNode] - cy;
  if (vx * vx + vy * vy < 1e-12) return 0;
  const ang = Math.atan2(vy, vx);

  const wN = nodes.w[iNode];
  // Kinematic metric: the centre holds still for the angular part, and θ weighs 1 against the node's own mobility.
  // Inertial metric: node and centre turn about each other as a lever of length |v|, which is what weighs them against θ's real inertia.
  const wC = nodes.inertialAngles ? nodes.w[iCenter] : 0;
  const wRot = nodes.inertialAngles ? (wN + wC) / (vx * vx + vy * vy) : wN;
  const wTheta = nodes.inertialAngles ? nodes.wAngle[iAngle] : 1;
  const denom = wRot + wTheta;

  let C = ang - theta - offset;
  // Wrapped to (−π, π] for the shortest correction; the angle node itself stays cumulative.
  while (C > Math.PI) C -= 2 * Math.PI;
  while (C <= -Math.PI) C += 2 * Math.PI;

  if (denom > 0) {
    const dAng = -C * (wRot / denom) * stiffness;
    const dTheta = ((C * wTheta) / denom) * stiffness;
    if (wC !== 0) {
      // The lever turns about its mobility-weighted fixed point, as in `applyBeamFollowsAngleConstraint`.
      const centre = point(nodes, iCenter);
      const node = point(nodes, iNode);
      const c = centre.mul(wN / (wN + wC)).add(node.mul(wC / (wN + wC)));
      if (wN !== 0) setPoint(nodes, iNode, c.add(node.sub(c).rotate(dAng)));
      setPoint(nodes, iCenter, c.add(centre.sub(c).rotate(dAng)));
    } else if (wN !== 0) {
      const cos = Math.cos(dAng);
      const sin = Math.sin(dAng);
      nodes.x[iNode] = cx + (vx * cos - vy * sin);
      nodes.y[iNode] = cy + (vx * sin + vy * cos);
    }
    nodes.angle[iAngle] = theta + dTheta;
  }

  // The radius is held by moving both points by their masses, so the gear centre moves too, which is what lets N be anchored elsewhere.
  const radiusError = applyDistanceConstraint(
    nodes,
    iNode,
    iCenter,
    radius,
    stiffness,
  );

  return Math.abs(C) + radiusError;
}

/**
 * A beam attached to a join fixed on a gear, its orientation following θ.
 * Turns `drivenKey` about `pivotKey` so that angle(driven − pivot) = θ + offset, both ways with θ.
 */
export function applyBeamFollowsAngleConstraint(
  nodes: SimNodes,
  iPivot: number,
  iDriven: number,
  iAngle: number,
  offset: number,
  stiffness: number = 1.0,
): number {
  if (iPivot < 0 || iDriven < 0 || iAngle < 0) return 0;
  const pivot = point(nodes, iPivot);
  const driven = point(nodes, iDriven);
  const theta = nodes.angle[iAngle];

  const v = driven.sub(pivot);
  if (v.length_squared() < 1e-12) return 0;
  const ang = v.angle();

  let C = ang - theta - offset;
  while (C > Math.PI) C -= 2 * Math.PI;
  while (C <= -Math.PI) C += 2 * Math.PI;

  // Symmetric projection: rotate the beam AND advance θ, split by mobility.
  // The beam turns about its mobility-weighted fixed point c = (w_driven·pivot + w_pivot· driven)/(w_pivot+w_driven): an anchored pivot (w_pivot = 0) gives c = pivot (driven swings about it), a free pivot (a grabbed far end) moves too and GearPerimeterPin turns the gear.
  const wP = nodes.w[iPivot];
  const wD = nodes.w[iDriven];
  const wBeam = wP + wD; // beam-rotation mobility (0 = both ends anchored)
  // The kinematic metric weighs θ as 1 against the ends' own mobility; the inertial one weighs the ends through the beam's length and θ by its real inertia.
  const wRot = nodes.inertialAngles ? wBeam / v.length_squared() : wBeam;
  const wTheta = nodes.inertialAngles ? nodes.wAngle[iAngle] : 1;
  const denom = wRot + wTheta;
  if (denom < (nodes.inertialAngles ? Number.MIN_VALUE : 1e-12)) return Math.abs(C);

  const dPhi = -C * (wRot / denom) * stiffness; // beam rotation
  const dTheta = ((C * wTheta) / denom) * stiffness; // gear angle
  if (wBeam > 0 && dPhi !== 0) {
    const c = pivot.mul(wD / wBeam).add(driven.mul(wP / wBeam));
    if (wP !== 0) setPoint(nodes, iPivot, c.add(pivot.sub(c).rotate(dPhi)));
    if (wD !== 0) setPoint(nodes, iDriven, c.add(driven.sub(c).rotate(dPhi)));
  }
  nodes.angle[iAngle] = theta + dTheta;
  return Math.abs(C);
}

// Scratch for the belt length, grown once: the active vias (node slot + original gear index, disconnected pulleys skipped) and the slot-keyed gradient accumulation.
// Keyed by SLOT, not by via, because coincidence fusion can put two vias on one node.
let lenSlot = new Int32Array(16);
let lenGear = new Int32Array(16);
let lenArc = new Uint8Array(16);
let gradSlot = new Int32Array(16);
let gradX = new Float64Array(16);
let gradY = new Float64Array(16);

/**
 * Inextensible belt (simulation): holds the total geometric length at `targetLength`.
 * Moving a pulley redistributes the whole loop to keep the length, which is how the belt transmits.
 *
 * PBD projection of C = L − L₀: each centre moves by −C·w·∇/Σ(w·|∇|²), with ∂L/∂centre = −(sum of the adjacent unit tangents) by the envelope theorem, tangency points sliding freely.
 */
export function applyBeltLengthConstraint(
  /** The one constraint emitted in BOTH modes: the belt geometry is positional in
   * simulation, and in edition the pulley radii become DOFs too.
   * Which of the two it uses is decided by the link own fields (radKeys), never by the node set. */
  nodes: SolveNodes,
  s: LinkSlots,
  link: Extract<Link, { type: "BeltLength" }>,
  stiffness: number = 1.0,
): number {
  const {
    gearPosKeys,
    radii,
    directions,
    length: targetLength,
    closed,
    disconnected,
    wraps,
  } = link;

  // pos slots: [start, end, ...one per pulley] (see link-slots.ts)
  const iStart = s.pos[0];
  const iEnd = s.pos[1];

  const capacity = gearPosKeys.length + 2;
  if (lenSlot.length < capacity) {
    lenSlot = new Int32Array(capacity);
    lenGear = new Int32Array(capacity);
    lenArc = new Uint8Array(capacity);
    gradSlot = new Int32Array(capacity);
    gradX = new Float64Array(capacity);
    gradY = new Float64Array(capacity);
  }

  let n = 0;
  if (!closed) {
    if (iStart < 0) return 0;
    lenSlot[n] = iStart;
    lenGear[n] = -1;
    n++;
  }
  for (let i = 0; i < gearPosKeys.length; i++) {
    if (disconnected?.[i]) continue;
    if (s.pos[2 + i] < 0) return 0;
    lenSlot[n] = s.pos[2 + i];
    lenGear[n] = i;
    n++;
  }
  if (!closed) {
    if (iEnd < 0) return 0;
    lenSlot[n] = iEnd;
    lenGear[n] = -1;
    n++;
  }
  // A loose belt with NO active gears is an inert straight segment
  if (!closed && n === 2)
    return applyDistanceConstraint(
      nodes,
      iStart,
      iEnd,
      targetLength,
      stiffness,
    );
  if (n < (closed ? 2 : 3)) return 0;
  const last = n - 1;

  // ── Non-penetration FIRST, before any geometry is read ────────────────────
  // A terminal can never sit inside its adjacent pulley: `circles_link` switches from a TANGENT to a RADIAL spoke at d = r, so sampling a terminal that has drifted inside hands the projection a gradient rotated by 90° and the solver never settles.
  const radialContact = (iTerm: number, iCenter: number, rad: number) => {
    if (iTerm < 0 || iCenter < 0) return;
    const tx = nodes.x[iTerm];
    const ty = nodes.y[iTerm];
    const ccx = nodes.x[iCenter];
    const ccy = nodes.y[iCenter];
    const vx = tx - ccx;
    const vy = ty - ccy;
    const dd = Math.sqrt(vx * vx + vy * vy);
    if (dd >= rad || dd < 1e-9) return;
    const Cc = rad - dd;
    const ux = vx * (1 / dd);
    const uy = vy * (1 / dd);
    const wT = nodes.w[iTerm];
    const wC = nodes.w[iCenter];
    const tot = wT + wC;
    if (tot === 0) return;
    if (wT !== 0) {
      const f = Cc * (wT / tot) * stiffness;
      nodes.x[iTerm] = tx + ux * f;
      nodes.y[iTerm] = ty + uy * f;
    }
    if (wC !== 0) {
      const f = Cc * (wC / tot) * stiffness;
      nodes.x[iCenter] = ccx - ux * f;
      nodes.y[iCenter] = ccy - uy * f;
    }
  };
  if (!closed) {
    radialContact(iStart, lenSlot[1], radii[lenGear[1]]);
    radialContact(iEnd, lenSlot[last - 1], radii[lenGear[last - 1]]);
  }

  // Vias, from the now-valid positions.
  // In edition (radKeys present) the radii are live DOFs, so the geometry is measured from the RADII MAP — not the link's baked array — otherwise the length cannot see them change.
  const sc = belt_shared_scratch(n);
  for (let v = 0; v < n; v++) {
    const g = lenGear[v];
    sc.cx[v] = nodes.x[lenSlot[v]];
    sc.cy[v] = nodes.y[lenSlot[v]];
    sc.r[v] = g >= 0 ? (s.rad[g] >= 0 ? nodes.radius[s.rad[g]] : radii[g]) : 0;
    sc.ccw[v] = g >= 0 && directions[g] ? 1 : 0;
  }
  const pairs = belt_solve_pairs(sc, n, closed);

  // ∂L/∂centre = −(sum of adjacent tangent units): each straight span A→B adds minus its unit direction to A and plus it to B (envelope theorem: arcs add nothing to first-order translation).
  // For an open belt, also grab the two terminal runs (length + tangent point).
  let length = 0;
  let gradCount = 0;
  const add = (slot: number, gx: number, gy: number) => {
    for (let i = 0; i < gradCount; i++)
      if (gradSlot[i] === slot) {
        gradX[i] += gx;
        gradY[i] += gy;
        return;
      }
    gradSlot[gradCount] = slot;
    gradX[gradCount] = gx;
    gradY[gradCount] = gy;
    gradCount++;
  };

  let ptSX = 0;
  let ptSY = 0;
  let hasPtS = false;
  let ptEX = 0;
  let ptEY = 0;
  let hasPtE = false;

  /**
   * Contact arc of via `v`: its length, or −1 when it has none.
   * The wrap is the live one, unwrapped against the belt's continuous reference: that reference is only advanced once a substep, so read as it stands it would stay frozen while the sweep moves the pulleys, and it is what carries the whole turns a raw wrap in [0, 2π) cannot.
   */
  const arcOfVia = (v: number): number => {
    if (!belt_solve_arc(sc, v, n, closed)) {
      lenArc[v] = 0;
      return -1;
    }
    if (wraps !== undefined)
      sc.arcWrap[v] =
        lenGear[v] >= 0 ? Math.abs(unwrapArrival(sc.arcWrap[v], wraps[lenGear[v]])) : 0;
    lenArc[v] = 1;
    return sc.r[v] * sc.arcWrap[v];
  };

  const strand = (p: number) => {
    length += sc.ell[p];
    const a = p;
    const b = (p + 1) % n;
    // Terminal runs are captured FIRST: they must survive a ZERO-LENGTH run (an end resting on its pulley's rim).
    // Dropping them there would null the tangent points, and the terminals would stop being moved by the length at all.
    if (!closed && a === 0) {
      ptSX = sc.arrX[p];
      ptSY = sc.arrY[p];
      hasPtS = true;
    }
    if (!closed && b === last) {
      ptEX = sc.depX[p];
      ptEY = sc.depY[p];
      hasPtE = true;
    }
    // A terminal run's tangent is read off the rim below, never off the run vector — which vanishes at contact.
    // Its centre gradient is added there too.
    if (!closed && (a === 0 || b === last)) return;
    const dx = sc.arrX[p] - sc.depX[p];
    const dy = sc.arrY[p] - sc.depY[p];
    if (dx * dx + dy * dy < 1e-12) return; // no direction to read off a null run
    const len = Math.sqrt(dx * dx + dy * dy);
    const ux = dx / len;
    const uy = dy / len;
    // Terminals are excluded from the centre gradient — an open belt's ends ride their own tangent (projected below).
    if (lenGear[a] >= 0) add(lenSlot[a], -ux, -uy);
    if (lenGear[b] >= 0) add(lenSlot[b], ux, uy);
  };

  // Same traversal as `belt_pieces`: a closed belt starts on an arc, an open one on a run.
  if (closed) {
    for (let v = 0; v < n; v++) {
      const arc = arcOfVia(v);
      if (arc >= 0) length += arc;
      strand(v);
    }
  } else {
    for (let p = 0; p < pairs; p++) {
      strand(p);
      const arc = arcOfVia(p + 1);
      if (arc >= 0) length += arc;
    }
  }

  // Outward unit tangent at each free terminal, taken from the pulley's RIM rather than from the run vector `terminal − Ptan`: that vector vanishes as the end reaches the rim, so neither its direction nor — above all — its SIGN can be read off it there.
  // Belt travel at a rim point is perp(radial)·sign; the start run travels INTO its gear and the end run OUT of it, hence the flip on the start.
  let uSX = 0;
  let uSY = 0;
  let uEX = 0;
  let uEY = 0;
  const hasUS = !closed && hasPtS;
  const hasUE = !closed && hasPtE;
  if (hasUS) {
    const vx = ptSX - sc.cx[1];
    const vy = ptSY - sc.cy[1];
    const l = Math.sqrt(vx * vx + vy * vy);
    const sign = sc.ccw[1] === 1 ? -1 : 1;
    uSX = -(vy / l) * sign * -1;
    uSY = (vx / l) * sign * -1;
  }
  if (hasUE) {
    const vx = ptEX - sc.cx[last - 1];
    const vy = ptEY - sc.cy[last - 1];
    const l = Math.sqrt(vx * vx + vy * vy);
    const sign = sc.ccw[last - 1] === 1 ? -1 : 1;
    uEX = -(vy / l) * sign;
    uEY = (vx / l) * sign;
  }

  // Both terminal runs push their neighbouring gear centre along −(their own travel unit).
  if (hasUS) add(lenSlot[1], -uSX, -uSY);
  if (hasUE) add(lenSlot[last - 1], -uEX, -uEY);

  const C = length - targetLength;

  // ── One projection of C = L − L₀, the same in every branch ─────────────────
  // The DOFs are the pulley centres, the two free terminals (each along its own belt tangent), and in edition the radii.
  // A terminal JOINED to its adjacent pulley (a winch) is not free: its `GearPerimeterPin` carries it, and the belt it pays out is already counted in that pulley's growing arc.
  const startWound = !!link.startWound && lenGear[1] === 0;
  const endWound = !!link.endWound && lenGear[last - 1] === radii.length - 1;
  const wSf = hasUS && !startWound ? nodes.w[iStart] : 0;
  const wEf = hasUE && !endWound ? nodes.w[iEnd] : 0;

  let sPos = wSf + wEf;
  for (let i = 0; i < gradCount; i++)
    sPos += nodes.w[gradSlot[i]] * (gradX[i] * gradX[i] + gradY[i] * gradY[i]);

  // Edition-only: the radii are DOFs too.
  // Growing a pulley lengthens the belt by its wrap angle (∂L/∂r = wrap — the tangent-length and tangent-point terms cancel by the envelope theorem).
  // A dimension-radius freezes its pulley automatically (radMass 0).
  const radGrad = new Map<number, number>();
  if (s.rad.length > 0) {
    for (let v = 0; v < n; v++) {
      if (!lenArc[v]) continue;
      const gi = lenGear[v];
      if (gi < 0) continue;
      const rk = s.rad[gi];
      if (rk === undefined || rk < 0) continue;
      radGrad.set(rk, (radGrad.get(rk) ?? 0) + sc.arcWrap[v]);
    }
  }
  let sRad = 0;
  radGrad.forEach((g, slot) => {
    sRad += nodes.wRadius[slot] * g * g;
  });

  // Feel: when the centres are free to move, they should absorb the change TWICE as much as the radii (the principled split is 1:1 — set the factor to 1).
  const RADII_ABSORB = 0.5;
  let radScale = 1;
  if (sPos > 1e-12 && sRad > 1e-12)
    radScale = Math.min(1, (sPos * RADII_ABSORB) / sRad);

  const denom = sPos + radScale * sRad;
  if (denom < 1e-12) return Math.abs(C);
  const k = -(C / denom) * stiffness;
  for (let i = 0; i < gradCount; i++) {
    const slot = gradSlot[i];
    const w = nodes.w[slot];
    if (w === 0) continue;
    const kw = k * w;
    nodes.x[slot] += gradX[i] * kw;
    nodes.y[slot] += gradY[i] * kw;
  }
  if (hasUS && wSf > 0) {
    const kw = k * wSf;
    nodes.x[iStart] += uSX * kw;
    nodes.y[iStart] += uSY * kw;
  }
  if (hasUE && wEf > 0) {
    const kw = k * wEf;
    nodes.x[iEnd] += uEX * kw;
    nodes.y[iEnd] += uEY * kw;
  }
  radGrad.forEach((g, slot) => {
    const w = nodes.wRadius[slot] * radScale;
    if (w !== 0) write_radius(nodes, slot, nodes.radius[slot] + k * w * g);
  });
  return Math.abs(C);
}

/**
 * Junction of a taut belt: holds the node `nodeKey` (start and end fused) on the nearest piece of the belt's outline, any tangent segment or arc of the **closed cycle** of pulleys, so the loop stays continuous wherever the junction sits.
 * Symmetric: J and the pulley centre(s) bounding that piece move, radii baked in.
 * Tangency on an arc is structural, with no "duplicated" pulley.
 * Removes 1 DOF.
 */
export function applyBeltJunctionConstraint(
  nodes: EditNodes,
  s: LinkSlots,
  radii: number[],
  directions: boolean[],
  stiffness: number = 1.0,
): number {
  // pos slots: [junction node, ...one per pulley] (see link-slots.ts)
  const iNode = s.pos[0];
  const gearCount = s.pos.length - 1;
  if (iNode < 0 || gearCount === 0) return 0;
  const J = point(nodes, iNode);

  // Edition: the pulleys may be resized in the same solve (a length dimension), so read the LIVE radius from the radius DOF — the link's baked `radii` array is a frame behind and would drag the junction off the outline.
  const gearRadius = (i: number) =>
    s.rad[i] >= 0 ? nodes.radius[s.rad[i]] : radii[i];
  const vias: BeltVia[] = [];
  for (let i = 0; i < gearCount; i++) {
    if (s.pos[1 + i] < 0) return 0;
    vias.push({
      pos: point(nodes, s.pos[1 + i]),
      radius: gearRadius(i),
      clockwise: directions[i],
    });
  }

  // Nearest piece (segment or arc) of the closed gear cycle.
  // Distance is to the piece's clamped extent — for an arc, only its WRAPPED sector counts, so the junction can't rest on the free side of a pulley.
  const pieces = belt_pieces(vias, true);
  if (pieces.length === 0) return 0;
  let best = pieces[0];
  let bestDist = Infinity;
  for (const piece of pieces) {
    const d = J.distance_to(nearest_point_on_piece(J, piece));
    if (d < bestDist) {
      bestDist = d;
      best = piece;
    }
  }

  const wJ = nodes.w[iNode];

  if (best.kind === "segment") {
    // Move J and the segment's two bounding gears along the tangent normal (translating both centres translates the tangent line exactly).
    const iA = s.pos[1 + best.gearIndexA];
    const iB = s.pos[1 + best.gearIndexB];
    const cA = point(nodes, iA);
    const cB = point(nodes, iB);
    const wA = nodes.w[iA];
    const wB = nodes.w[iB];
    const n = best.to.sub(best.from).perp().normalize();
    const e = J.sub(best.from).dot(n); // signed perpendicular offset
    const wLine = (wA + wB) / 2;
    const totalW = wJ + wLine;
    if (totalW === 0) return Math.abs(e);
    if (wJ !== 0)
      setPoint(nodes, iNode, J.add(n.mul(-e * (wJ / totalW) * stiffness)));
    const lineShift = n.mul(e * (wLine / totalW) * stiffness);
    if (wA !== 0) setPoint(nodes, iA, cA.add(lineShift));
    if (iB !== iA && wB !== 0) setPoint(nodes, iB, cB.add(lineShift));
    return Math.abs(e);
  }

  // On an arc: |J − centre| = radius, shared between J and that centre.
  return applyDistanceConstraint(
    nodes,
    iNode,
    s.pos[1 + best.gearIndex],
    best.radius,
    stiffness,
  );
}

/**
 * Belt pin (simulation): the attached node `nodeKey` rides the belt at arc-length s = s0 + r_ref·ε_ref·(θ_ref − θ_ref0), so it travels as the belt turns.
 * Bidirectional/symmetric: the TANGENTIAL error advances θ_ref (→ every pulley turns via the strand no-slips) or slides the node, split by mass; the NORMAL error pulls the node back onto the belt, shared with the pulley(s) bounding that piece.
 * A closed belt is a closed pulley loop; a loose belt is the open path start-terminal → pulleys → end-terminal (`closed=false`, terminals from `startKey`/`endKey`).
 * Disconnected pulleys are skipped.
 * Radii + refs baked.
 *
 * `passive` makes it one-way — the node is moved onto its belt target and nothing else: a node nobody but the belt has a say in reads the belt travel, it does not hold it, and driving θ_ref from it would excite the free travel mode of a closed belt at the mercy of the sweep order.
 */

/** Scratch for the pin: the gear slot behind each via (−1 for a terminal), the wrap it
 * rides, and where the arc-length lands.
 * Grown once, reused every application. */
let pinSlot = new Int32Array(16);
let pinWrap = new Float64Array(16);
const pinAt = belt_at();

export function applyBeltPinConstraint(
  nodes: SimNodes,
  s_: LinkSlots,
  radii: number[],
  directions: boolean[],
  refIndex: number,
  s0: number,
  thetaRef0: number,
  wraps?: number[],
  disconnected?: boolean[],
  closed: boolean = true,
  stiffness: number = 1.0,
  passive: boolean = false,
): number {
  // pos slots: [node, start, end, ...one per pulley] (see link-slots.ts)
  const iNode = s_.pos[0];
  const iStart = s_.pos[1];
  const iEnd = s_.pos[2];
  const gearCount = s_.pos.length - 3;
  if (iNode < 0 || gearCount === 0) return 0;
  const jx = nodes.x[iNode];
  const jy = nodes.y[iNode];

  // Ordered vias, straight into the scalar scratch: for an open belt the two r = 0 terminals bracket the still-connected pulleys.
  // `pinSlot[v]` is the via's gear slot, or −1 for a terminal, which owns no pulley to share the normal correction with.
  const capacity = gearCount + 2;
  if (pinSlot.length < capacity) {
    pinSlot = new Int32Array(capacity);
    pinWrap = new Float64Array(capacity);
  }
  const sc = belt_shared_scratch(capacity);
  let n = 0;
  const pushVia = (
    slot: number,
    radius: number,
    ccw: boolean,
    wrap: number,
  ) => {
    sc.cx[n] = nodes.x[slot];
    sc.cy[n] = nodes.y[slot];
    sc.r[n] = radius;
    sc.ccw[n] = ccw ? 1 : 0;
    pinSlot[n] = radius > 0 ? slot : -1;
    pinWrap[n] = wrap;
    n++;
  };
  if (!closed) {
    if (iStart < 0) return 0;
    pushVia(iStart, 0, false, 0);
  }
  for (let i = 0; i < gearCount; i++) {
    if (disconnected?.[i]) continue;
    const slot = s_.pos[3 + i];
    if (slot < 0) return 0;
    pushVia(slot, radii[i], directions[i], wraps?.[i] ?? 0);
  }
  if (!closed) {
    if (iEnd < 0) return 0;
    pushVia(iEnd, 0, false, 0);
  }
  // A closed loop needs ≥2 pulleys; an open path needs ≥1 pulley between its terminals (start + pulley + end).
  // Otherwise there is nothing to ride.
  if (n < (closed ? 2 : 3)) return 0;

  const iRefAngle = s_.ang[0];
  if (iRefAngle < 0) return 0;
  const thetaRef = nodes.angle[iRefAngle];

  const rEps = radii[refIndex] * (directions[refIndex] ? -1 : 1);
  if (Math.abs(rEps) < 1e-9) return 0;

  belt_solve_pairs(sc, n, closed);
  const viaWraps = wraps ? pinWrap : undefined;
  let s = s0 + rEps * (thetaRef - thetaRef0);
  // On an open belt the arc-length is bounded by the belt itself (no wrap-around).
  if (!closed)
    s = Math.max(0, Math.min(belt_total(sc, n, closed, viaWraps).total, s));
  belt_locate(sc, n, closed, s, viaWraps, pinAt);

  // Node relative to its belt target.
  const ex = jx - pinAt.px;
  const ey = jy - pinAt.py;
  const errLen = Math.sqrt(ex * ex + ey * ey);
  const wJ = nodes.w[iNode];

  if (passive) {
    if (wJ !== 0) {
      nodes.x[iNode] = jx - ex * stiffness;
      nodes.y[iNode] = jy - ey * stiffness;
    }
    return errLen;
  }

  const errT = ex * pinAt.tx + ey * pinAt.ty; // tangential (belt-travel) mismatch
  const nx = ex - pinAt.tx * errT; // normal (off-belt) offset
  const ny = ey - pinAt.ty * errT;

  // The kinematic metric weighs θ_ref as 1 in belt travel; the inertial one weighs its real inertia seen through the rim, `rEps` of travel per radian.
  const wTheta = nodes.inertialAngles ? nodes.wAngle[iRefAngle] * rEps * rEps : 1;
  const totalT = wJ + wTheta;

  // Tangential: share between sliding the node back and advancing the belt.
  let px = jx;
  let py = jy;
  if (wJ !== 0) {
    const shift = errT * (wJ / totalT) * stiffness;
    px -= pinAt.tx * shift;
    py -= pinAt.ty * shift;
  }
  if (totalT > 0)
    nodes.angle[iRefAngle] =
      thetaRef + (errT * (wTheta / totalT) * stiffness) / rEps;

  // Normal: pull the node back onto the belt, sharing with the pulley(s) bounding the piece at s (terminals own no pulley), so dragging the node off the belt drags those pulleys with it.
  // `viaA === viaB` on an arc, and coincidence fusion can put both on one slot — either way the pulley is counted once.
  const slotA = pinAt.viaA >= 0 ? pinSlot[pinAt.viaA] : -1;
  const slotBraw = pinAt.viaB >= 0 ? pinSlot[pinAt.viaB] : -1;
  const slotB = slotBraw === slotA ? -1 : slotBraw;
  const gearCountN = (slotA >= 0 ? 1 : 0) + (slotB >= 0 ? 1 : 0);
  const wGear =
    gearCountN > 0
      ? ((slotA >= 0 ? nodes.w[slotA] : 0) +
          (slotB >= 0 ? nodes.w[slotB] : 0)) /
        gearCountN
      : 0;
  const totalN = wJ + wGear;
  if (totalN > 0) {
    if (wJ !== 0) {
      const share = (wJ / totalN) * stiffness;
      px -= nx * share;
      py -= ny * share;
    }
    const gearShare = (wGear / totalN) * stiffness;
    if (slotA >= 0 && nodes.w[slotA] !== 0) {
      nodes.x[slotA] += nx * gearShare;
      nodes.y[slotA] += ny * gearShare;
    }
    if (slotB >= 0 && nodes.w[slotB] !== 0) {
      nodes.x[slotB] += nx * gearShare;
      nodes.y[slotB] += ny * gearShare;
    }
  }
  if (wJ !== 0) {
    nodes.x[iNode] = px;
    nodes.y[iNode] = py;
  }

  return errLen;
}

/**
 * Orientation of a beam welded to a belt junction (simulation): its angle follows the belt tangent, angle(driven − pivot) = tangentAngle(s) + offset.
 * Both ways, weighed by the local curvature: on an arc, turning the beam advances the belt (dTangentAngle/dθ_ref = curvature·r_ref·ε_ref); on a segment the tangent is fixed, so the beam aligns with it without moving the belt.
 */

/** Where the welded beam reads its tangent. Grown once, reused every application. */
const tangentAt = belt_at();

export function applyBeltFollowsTangentConstraint(
  nodes: SimNodes,
  s_: LinkSlots,
  radii: number[],
  directions: boolean[],
  refIndex: number,
  s0: number,
  thetaRef0: number,
  offset: number,
  disconnected?: boolean[],
  stiffness: number = 1.0,
): number {
  // pos slots: [pivot, driven, ...one per pulley] (see link-slots.ts)
  const iPivot = s_.pos[0];
  const iDriven = s_.pos[1];
  const gearCount = s_.pos.length - 2;
  if (iPivot < 0 || iDriven < 0 || gearCount === 0) return 0;
  const pivot = point(nodes, iPivot);
  const driven = point(nodes, iDriven);
  // Reduced loop: skip disconnected pulleys (the tangent is read from the same loop the belt is drawn on). s0/thetaRef0/refIndex are re-baked at disconnect.
  const sc = belt_shared_scratch(gearCount);
  let n = 0;
  for (let i = 0; i < gearCount; i++) {
    if (disconnected?.[i]) continue;
    const slot = s_.pos[2 + i];
    if (slot < 0) return 0;
    sc.cx[n] = nodes.x[slot];
    sc.cy[n] = nodes.y[slot];
    sc.r[n] = radii[i];
    sc.ccw[n] = directions[i] ? 1 : 0;
    n++;
  }
  if (n < 2) return 0; // a 0/1-gear loop is degenerate
  const iAngle = s_.ang[0];
  if (iAngle < 0) return 0;
  const thetaRef = nodes.angle[iAngle];

  const rEps = radii[refIndex] * (directions[refIndex] ? -1 : 1);
  const s = s0 + rEps * (thetaRef - thetaRef0);
  belt_solve_pairs(sc, n, true);
  belt_locate(sc, n, true, s, undefined, tangentAt);
  const curvature = tangentAt.curvature;

  const v = driven.sub(pivot);
  if (v.length_squared() < 1e-12) return 0;
  let C = v.angle() - Math.atan2(tangentAt.ty, tangentAt.tx) - offset;
  while (C > Math.PI) C -= 2 * Math.PI;
  while (C <= -Math.PI) C += 2 * Math.PI;

  const dTdTheta = curvature * rEps; // how the tangent angle moves per θ_ref
  // Symmetric projection over the three concerned DOFs: rotate the beam AND advance θ_ref, split by mobility.
  // The beam turns about its mobility-weighted fixed point c = (w_driven·pivot + w_pivot·driven)/(w_pivot+w_driven), so the less mobile end stays put: an anchored pivot (w_pivot = 0) gives c = pivot (driven swings about it), while a free pivot (a grabbed far end) moves too and BeltPin turns that motion into belt travel.
  const wP = nodes.w[iPivot];
  const wD = nodes.w[iDriven];
  const wBeam = wP + wD; // beam-rotation mobility (0 = both ends anchored)
  // Same two metrics as `applyBeamFollowsAngleConstraint`.
  const wRot = nodes.inertialAngles ? wBeam / v.length_squared() : wBeam;
  const wTheta = nodes.inertialAngles ? nodes.wAngle[iAngle] : 1;
  const denom = wRot + wTheta * dTdTheta * dTdTheta;
  if (denom < (nodes.inertialAngles ? Number.MIN_VALUE : 1e-12)) return Math.abs(C);

  const dPhi = -C * (wRot / denom) * stiffness; // beam rotation
  const dTheta = C * ((wTheta * dTdTheta) / denom) * stiffness; // belt travel
  if (wBeam > 0 && dPhi !== 0) {
    const c = pivot.mul(wD / wBeam).add(driven.mul(wP / wBeam));
    if (wP !== 0) setPoint(nodes, iPivot, c.add(pivot.sub(c).rotate(dPhi)));
    if (wD !== 0) setPoint(nodes, iDriven, c.add(driven.sub(c).rotate(dPhi)));
  }
  nodes.angle[iAngle] = thetaRef + dTheta;
  return Math.abs(C);
}

/** Coaxial gears: θ1 − θ2 = offset, one rotation with a constant offset. */
export function applyCoaxialAngleConstraint(
  nodes: SimNodes,
  iAngle1: number,
  iAngle2: number,
  offset: number,
  stiffness: number = 1.0,
): number {
  if (iAngle1 < 0 || iAngle2 < 0) return 0;
  const a1 = nodes.angle[iAngle1];
  const a2 = nodes.angle[iAngle2];
  const w1 = nodes.wAngle[iAngle1];
  const w2 = nodes.wAngle[iAngle2];
  const w = w1 + w2;

  const C = a1 - a2 - offset; // cumulative, never wrapped
  if (w === 0) return Math.abs(C);
  nodes.angle[iAngle1] = a1 - (w1 / w) * C * stiffness;
  nodes.angle[iAngle2] = a2 + (w2 / w) * C * stiffness;
  return Math.abs(C);
}
