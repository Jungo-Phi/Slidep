import type { Link } from "../../../types";
import type { SolveNodes } from "../nodes";
import type { LinkSlots } from "../kinematics/link-slots";
import { ResolvedDrive, arm_rotation, tangent } from "../dynamics/drive-constraint";
import { beltViaCount, beltViaSlot, strandH } from "../experimental/belt-noslip-q";
import { strand_limit } from "../kinematics/belt-validity";

/**
 * The constraints the direct solve handles, each written as scalar rows `C(x) = 0` with their exact gradient.
 * Each row imposes what the matching projection in `constraint-functions.ts` imposes; a type missing here stays with the sweep (see `direct-solve.ts`).
 *
 * Unknowns are numbered `2n`, `2n + 1` for the position slot `n`, then `2·count + a` for the angle slot `a`.
 */
export const DIRECT_LINK_TYPES: ReadonlySet<Link["type"]> = new Set<Link["type"]>([
  "Distance",
  "FixedOnSegment",
  "SlideOnSegment",
  "KeepOrientation",
  "Angle",
  "GearPerimeterPin",
  "BeamFollowsAngle",
  "GearMeshAngle",
  "CoaxialAngle",
  "BeltSegmentNoSlip",
  // A belt's length is the sum of its strands, so neither of these writes it again; see their cases below.
  "BeltLength",
  "BeltSubChainAggregate",
]);

/**
 * A link the direct solve leaves to the sweep without splitting the solve: it only places a node nothing else reads, so one pass after the system settles it.
 * A closed belt's junction pin is the one kind (see `belt_pin_link`).
 */
export const direct_follower = (link: Link): boolean => link.type === "BeltPin" && link.passive === true;

/**
 * The collision contacts the direct solve handles, as unilateral rows `C(x) ≥ 0` whose multiplier may only push.
 * Which of them join the system is decided at each iteration, in `direct-solve.ts`.
 */
export const DIRECT_CONTACT_TYPES: ReadonlySet<Link["type"]> = new Set<Link["type"]>([
  "MinDistance",
  "MinDistanceToSegment",
  "MinDistanceToLine",
]);

/** Most unknowns one row touches: an `Angle` between two segments. `Rows` stores every row on this stride. */
export const MAX_WIDTH = 8;

/** Rows most links may produce. */
export const ROWS_PER_LINK = 2;

/** Rows `link` may produce: a belt's guards take one per pulley and one per free end. */
const row_budget = (link: Link): number =>
  link.type === "BeltLength" ? link.gearPosKeys.length + 2 : ROWS_PER_LINK;

const SLOTS = new WeakMap<Link[], { first: Int32Array; total: number }>();

/** Where each link's multipliers start, and how many there are in all. */
export function row_slots(links: Link[]): { first: Int32Array; total: number } {
  const known = SLOTS.get(links);
  if (known && known.first.length === links.length) return known;
  const first = new Int32Array(links.length);
  let total = 0;
  for (let k = 0; k < links.length; k++) {
    first[k] = total;
    total += row_budget(links[k]);
  }
  const out = { first, total };
  SLOTS.set(links, out);
  return out;
}

/**
 * Rows of every handled link at the current nodes, in flat typed arrays reused from one evaluation to the next.
 * Row `r` touches `width[r]` unknowns, listed in `vars`/`grads` from `r · MAX_WIDTH`.
 */
export class Rows {
  count = 0;
  width = new Int32Array(0);
  vars = new Int32Array(0);
  grads = new Float64Array(0);
  /** `C` at the current nodes. */
  value = new Float64Array(0);
  /** `α̃ = compliance / dt²`; 0 for a rigid row. */
  alphaTilde = new Float64Array(0);
  /** What one unit of the row is worth in metres, for the tolerance and the diagnostics. */
  scale = new Float64Array(0);
  /** The link the row belongs to, and its multiplier's slot (the link's first slot + `sub`, see `row_slots`). */
  link = new Int32Array(0);
  slot = new Int32Array(0);
  /** 1 for a contact's row: `C ≥ 0` is enough, and its multiplier stays positive. */
  unilateral = new Uint8Array(0);
  /** 1 for a contact that stops without bouncing: a guard on the geometry rather than a collision. */
  inelastic = new Uint8Array(0);
  /** Each link's first multiplier slot, set by `evaluate_rows`. */
  first: Int32Array = new Int32Array(0);
  /**
   * The sliders standing at an end stop: `stopRow[i]` is the first of the two rows holding one there, `stopX/Y[i]` the unit axis pointing out past the stop.
   * What a bounce off the stop reverses is the slider's speed along that axis.
   */
  stops = 0;
  stopRow = new Int32Array(0);
  stopX = new Float64Array(0);
  stopY = new Float64Array(0);

  reset(capacity: number): void {
    this.count = 0;
    this.stops = 0;
    if (this.width.length >= capacity) return;
    this.stopRow = new Int32Array(capacity);
    this.stopX = new Float64Array(capacity);
    this.stopY = new Float64Array(capacity);
    this.unilateral = new Uint8Array(capacity);
    this.inelastic = new Uint8Array(capacity);
    this.width = new Int32Array(capacity);
    this.vars = new Int32Array(capacity * MAX_WIDTH);
    this.grads = new Float64Array(capacity * MAX_WIDTH);
    this.value = new Float64Array(capacity);
    this.alphaTilde = new Float64Array(capacity);
    this.scale = new Float64Array(capacity);
    this.link = new Int32Array(capacity);
    this.slot = new Int32Array(capacity);
  }

  begin(link: number, sub: number, value: number, alphaTilde: number, scale: number): number {
    const r = this.count++;
    this.width[r] = 0;
    this.unilateral[r] = 0;
    this.inelastic[r] = 0;
    this.value[r] = value;
    this.alphaTilde[r] = alphaTilde;
    this.scale[r] = scale;
    this.link[r] = link;
    this.slot[r] = link >= 0 ? this.first[link] + sub : -1;
    return r;
  }

  add(r: number, unknown: number, gradient: number): void {
    const at = r * MAX_WIDTH + this.width[r]++;
    this.vars[at] = unknown;
    this.grads[at] = gradient;
  }
}

const wrap = (a: number): number => {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a <= -Math.PI) a += 2 * Math.PI;
  return a;
};

/** Wrapped to (−π/2, π/2]: a segment is not oriented. */
const wrap_half = (a: number): number => {
  while (a > Math.PI / 2) a -= Math.PI;
  while (a <= -Math.PI / 2) a += Math.PI;
  return a;
};

/**
 * Start `rows` afresh with the rows of `links[k]` for every `k` with `handled[k]`, leaving room for `reserve` more.
 * `invDtSq` turns a `Distance`'s compliance into its `α̃`.
 */
export function evaluate_rows(
  nodes: SolveNodes,
  links: Link[],
  slots: LinkSlots[],
  handled: Uint8Array,
  invDtSq: number,
  rows: Rows,
  reserve = 0,
): void {
  const budget = row_slots(links);
  rows.reset(budget.total + reserve);
  rows.first = budget.first;
  const P = (n: number) => 2 * n;
  const A = (a: number) => 2 * nodes.count + a;
  const x = nodes.x;
  const y = nodes.y;

  /** `θ(tip − pivot) − θ − offset`, the angle of a segment against an angle unknown (omitted: a fixed direction). */
  const angle_row = (k: number, sub: number, pivot: number, tip: number, angle: number, offset: number, half: boolean) => {
    const vx = x[tip] - x[pivot];
    const vy = y[tip] - y[pivot];
    const l2 = vx * vx + vy * vy;
    if (l2 < 1e-24) return;
    const raw = Math.atan2(vy, vx) - (angle >= 0 ? nodes.angle[angle] : 0) - offset;
    const r = rows.begin(k, sub, half ? wrap_half(raw) : wrap(raw), 0, Math.sqrt(l2));
    rows.add(r, P(tip), -vy / l2);
    rows.add(r, P(tip) + 1, vx / l2);
    rows.add(r, P(pivot), vy / l2);
    rows.add(r, P(pivot) + 1, -vx / l2);
    if (angle >= 0) rows.add(r, A(angle), -1);
  };

  /**
   * `node − lerp(start, end, t) − offset·side·n`, the two rows of a point held at a fixed ratio along a segment, `n` its unit left normal.
   * The side is the one the node already sits on, as in `projectOnSegment`; the normal turns with the segment, and that turn is in the gradient.
   */
  const on_segment_rows = (k: number, start: number, end: number, node: number, t: number, offset: number) => {
    const dx = x[end] - x[start];
    const dy = y[end] - y[start];
    let cx = x[node] - (x[start] + dx * t);
    let cy = y[node] - (y[start] + dy * t);
    // How `offset·side·n` moves with `end − start`, for each of the two rows.
    let turnXX = 0;
    let turnXY = 0;
    let turnYX = 0;
    let turnYY = 0;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (offset !== 0 && len > 0) {
      const nx = -dy / len;
      const ny = dx / len;
      const shift = offset * (cx * nx + cy * ny < 0 ? -1 : 1);
      cx -= shift * nx;
      cy -= shift * ny;
      const k3 = shift / (len * len * len);
      turnXX = k3 * dx * dy;
      turnXY = -k3 * dx * dx;
      turnYX = k3 * dy * dy;
      turnYY = -k3 * dx * dy;
    }
    const components = [
      [0, cx, turnXX, turnXY],
      [1, cy, turnYX, turnYY],
    ] as const;
    for (const [axis, value, turnX, turnY] of components) {
      const r = rows.begin(k, axis, value, 0, 1);
      rows.add(r, P(node) + axis, 1);
      rows.add(r, P(start) + axis, -(1 - t));
      rows.add(r, P(end) + axis, -t);
      if (turnX !== 0 || turnY !== 0) {
        rows.add(r, P(end), -turnX);
        rows.add(r, P(end) + 1, -turnY);
        rows.add(r, P(start), turnX);
        rows.add(r, P(start) + 1, turnY);
      }
    }
  };

  /** `|b − a| − min ≥ 0`, a contact keeping two points apart; coincident points have no direction to part along, and are left to the other links. */
  const apart_row = (k: number, a: number, b: number, min: number, sub = 0, inelastic = false) => {
    const dx = x[b] - x[a];
    const dy = y[b] - y[a];
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return;
    const r = rows.begin(k, sub, len - min, 0, 1);
    rows.unilateral[r] = 1;
    if (inelastic) rows.inelastic[r] = 1;
    rows.add(r, P(b), dx / len);
    rows.add(r, P(b) + 1, dy / len);
    rows.add(r, P(a), -dx / len);
    rows.add(r, P(a) + 1, -dy / len);
  };

  for (let k = 0; k < links.length; k++) {
    if (!handled[k]) continue;
    const link = links[k];
    const s = slots[k];
    switch (link.type) {
      case "Distance": {
        const a = s.pos[0];
        const b = s.pos[1];
        if (a < 0 || b < 0) break;
        const dx = x[b] - x[a];
        const dy = y[b] - y[a];
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len === 0) break;
        const r = rows.begin(k, 0, len - link.distance, link.compliance ? link.compliance * invDtSq : 0, 1);
        rows.add(r, P(b), dx / len);
        rows.add(r, P(b) + 1, dy / len);
        rows.add(r, P(a), -dx / len);
        rows.add(r, P(a) + 1, -dy / len);
        break;
      }
      case "FixedOnSegment": {
        const [start, end, node] = [s.pos[0], s.pos[1], s.pos[2]];
        if (start < 0 || end < 0 || node < 0) break;
        on_segment_rows(k, start, end, node, link.t, link.normalOffset ?? 0);
        break;
      }
      case "SlideOnSegment": {
        const [start, end, node] = [s.pos[0], s.pos[1], s.pos[2]];
        if (start < 0 || end < 0 || node < 0) break;
        const dx = x[end] - x[start];
        const dy = y[end] - y[start];
        const l2 = dx * dx + dy * dy;
        if (l2 === 0) break;
        const qx = x[node] - x[start];
        const qy = y[node] - y[start];
        const t = (qx * dx + qy * dy) / l2;
        // Past an end, the node is held at that end, as `applySlideOnSegmentConstraint` clamps it.
        if (t <= 0 || t >= 1) {
          const first = rows.count;
          on_segment_rows(k, start, end, node, t <= 0 ? 0 : 1, link.normalOffset ?? 0);
          const out = (t <= 0 ? -1 : 1) / Math.sqrt(l2);
          rows.stopRow[rows.stops] = first;
          rows.stopX[rows.stops] = dx * out;
          rows.stopY[rows.stops] = dy * out;
          rows.stops++;
          break;
        }
        // Inside: only the distance to the line, `n·(node − start)`, with `n` the unit left normal of the segment.
        const len = Math.sqrt(l2);
        const c = (dx * qy - dy * qx) / len;
        const offset = link.normalOffset ?? 0;
        const value = offset === 0 ? c : c - offset * (c < 0 ? -1 : 1);
        const r = rows.begin(k, 0, value, 0, 1);
        const gex = qy / len - (c * dx) / l2;
        const gey = -qx / len - (c * dy) / l2;
        rows.add(r, P(node), -dy / len);
        rows.add(r, P(node) + 1, dx / len);
        rows.add(r, P(end), gex);
        rows.add(r, P(end) + 1, gey);
        rows.add(r, P(start), dy / len - gex);
        rows.add(r, P(start) + 1, -dx / len - gey);
        break;
      }
      case "KeepOrientation": {
        const [start, end] = [s.pos[0], s.pos[1]];
        if (start < 0 || end < 0) break;
        const d = link.direction;
        if (d.x === 0 && d.y === 0) break;
        angle_row(k, 0, start, end, -1, Math.atan2(d.y, d.x), true);
        break;
      }
      case "Angle": {
        const [s1, e1, s2, e2] = [s.pos[0], s.pos[1], s.pos[2], s.pos[3]];
        if (s1 < 0 || e1 < 0 || s2 < 0 || e2 < 0) break;
        const d1x = x[e1] - x[s1];
        const d1y = y[e1] - y[s1];
        const d2x = x[e2] - x[s2];
        const d2y = y[e2] - y[s2];
        const l1 = d1x * d1x + d1y * d1y;
        const l2 = d2x * d2x + d2y * d2y;
        if (l1 === 0 || l2 === 0) break;
        // The target is read on the flipped vectors; a flip is a constant π, so the gradient is that of the real ones.
        const v1 = link.flipStart ? Math.atan2(-d1y, -d1x) : Math.atan2(d1y, d1x);
        const v2 = link.flipEnd ? Math.atan2(-d2y, -d2x) : Math.atan2(d2y, d2x);
        const target = link.angle_rad * (link.couterClockwise ? -1 : 1);
        const r = rows.begin(k, 0, wrap(wrap(v2 - v1) - target), 0, Math.sqrt(Math.max(l1, l2)));
        rows.add(r, P(e2), -d2y / l2);
        rows.add(r, P(e2) + 1, d2x / l2);
        rows.add(r, P(s2), d2y / l2);
        rows.add(r, P(s2) + 1, -d2x / l2);
        rows.add(r, P(e1), d1y / l1);
        rows.add(r, P(e1) + 1, -d1x / l1);
        rows.add(r, P(s1), -d1y / l1);
        rows.add(r, P(s1) + 1, d1x / l1);
        break;
      }
      case "GearPerimeterPin": {
        const [node, centre, angle] = [s.pos[0], s.pos[1], s.ang[0]];
        if (node < 0 || centre < 0 || angle < 0) break;
        angle_row(k, 0, centre, node, angle, link.offset, false);
        const dx = x[node] - x[centre];
        const dy = y[node] - y[centre];
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len === 0) break;
        const r = rows.begin(k, 1, len - link.radius, 0, 1);
        rows.add(r, P(node), dx / len);
        rows.add(r, P(node) + 1, dy / len);
        rows.add(r, P(centre), -dx / len);
        rows.add(r, P(centre) + 1, -dy / len);
        break;
      }
      case "BeamFollowsAngle": {
        const [pivot, driven, angle] = [s.pos[0], s.pos[1], s.ang[0]];
        if (pivot < 0 || driven < 0 || angle < 0) break;
        angle_row(k, 0, pivot, driven, angle, link.offset, false);
        break;
      }
      case "GearMeshAngle": {
        const [a1, a2] = [s.ang[0], s.ang[1]];
        if (a1 < 0 || a2 < 0) break;
        // As `applyGearMeshAngleConstraint`: the line of centres is a hint held for the substep, not an unknown.
        const dAlpha = link.alpha - link.alpha0;
        const value =
          link.r1 * (nodes.angle[a1] - link.theta1_0 - dAlpha) + link.r2 * (nodes.angle[a2] - link.theta2_0 - dAlpha);
        const r = rows.begin(k, 0, value, 0, 1);
        rows.add(r, A(a1), link.r1);
        rows.add(r, A(a2), link.r2);
        break;
      }
      case "CoaxialAngle": {
        const [a1, a2] = [s.ang[0], s.ang[1]];
        if (a1 < 0 || a2 < 0) break;
        const r = rows.begin(k, 0, nodes.angle[a1] - nodes.angle[a2] - link.offset, 0, 1);
        rows.add(r, A(a1), 1);
        rows.add(r, A(a2), -1);
        break;
      }
      case "BeltSegmentNoSlip": {
        // Reuses the sweep's own `strandH`: its dependence on every via but the strand's own two endpoints cancels exactly (checked numerically — see scratch/belt-strand-gradient.test.ts), so the row only ever needs those two.
        const h = strandH(nodes, s, link, true);
        if (h === null) break;
        const iA = s.ang[0];
        const iB = s.ang[1];
        const thetaA = iA >= 0 ? nodes.angle[iA] : 0;
        const thetaB = iB >= 0 ? nodes.angle[iB] : 0;
        const qA = link.rEpsA * (thetaA - link.theta0A);
        const qB = link.rEpsB * (thetaB - link.theta0B);
        const r = rows.begin(k, 0, qA - qB - (h - link.h0), 0, 1);
        if (iA >= 0 && Math.abs(link.rEpsA) > 1e-9) rows.add(r, A(iA), link.rEpsA);
        if (iB >= 0 && Math.abs(link.rEpsB) > 1e-9) rows.add(r, A(iB), -link.rEpsB);
        // The centres' own gradient is NOT the plain tangent tension: moving a pulley also turns its own arc's occupied angle, a term the sweep's PBD projection drops (fine under many soft iterations, wrong for Newton).
        // Central-differenced on `strandH` itself, read-only (`track = false`), so the gradient matches the exact value above rather than a hand-reconstructed approximation of it.
        const n = beltViaCount(link);
        const slotA = beltViaSlot(s, 4, s.pos[2], s.pos[3], link, link.viaA);
        const slotB = beltViaSlot(s, 4, s.pos[2], s.pos[3], link, (link.viaA + 1) % n);
        if (slotA >= 0 && slotB >= 0) {
          const scale = Math.hypot(x[slotB] - x[slotA], y[slotB] - y[slotA]) || 1;
          const step = 1e-6 * scale;
          const partial = (slot: number, arr: Float64Array) => {
            const x0 = arr[slot];
            arr[slot] = x0 + step;
            const plus = strandH(nodes, s, link, false);
            arr[slot] = x0 - step;
            const minus = strandH(nodes, s, link, false);
            arr[slot] = x0;
            return plus === null || minus === null ? 0 : (plus - minus) / (2 * step);
          };
          rows.add(r, P(slotA), -partial(slotA, x));
          rows.add(r, P(slotA) + 1, -partial(slotA, y));
          rows.add(r, P(slotB), -partial(slotB, x));
          rows.add(r, P(slotB) + 1, -partial(slotB, y));
        }
        break;
      }
      // Redundant with the strands between the same two angles: summing their laws gives it exactly.
      case "BeltSubChainAggregate":
        break;
      case "BeltLength": {
        // The strands already hold the length; what is left are the guards that keep the belt's geometry one the strands can be read on, as in `applyBeltLengthConstraint` and `applyBeltValidityContacts`.
        if (link.radKeys) break;
        const pulleys: number[] = [];
        for (let i = 0; i < link.gearPosKeys.length; i++) {
          if (link.disconnected?.[i]) continue;
          if (s.pos[2 + i] < 0) break;
          pulleys.push(i);
        }
        const start = s.pos[0];
        const end = s.pos[1];
        // An open belt left without a pulley is a straight segment of its full length.
        if (!link.closed && pulleys.length === 0) {
          if (start < 0 || end < 0) break;
          const dx = x[end] - x[start];
          const dy = y[end] - y[start];
          const len = Math.sqrt(dx * dx + dy * dy);
          if (len === 0) break;
          const r = rows.begin(k, 0, len - link.length, 0, 1);
          rows.add(r, P(end), dx / len);
          rows.add(r, P(end) + 1, dy / len);
          rows.add(r, P(start), -dx / len);
          rows.add(r, P(start) + 1, -dy / len);
          break;
        }
        let sub = 0;
        const at = (i: number) => s.pos[2 + pulleys[i]];
        const n = pulleys.length;
        // A free end rests on its pulley's rim at most, never inside it.
        if (!link.closed && n > 0) {
          if (start >= 0) apart_row(k, at(0), start, link.radii[pulleys[0]], sub++, true);
          if (end >= 0) apart_row(k, at(n - 1), end, link.radii[pulleys[n - 1]], sub++, true);
        }
        // Two pulleys that follow each other along the belt keep the strand between them.
        const pairs = link.closed && n > 2 ? n : n - 1;
        for (let p = 0; p < pairs; p++) {
          const a = pulleys[p];
          const b = pulleys[(p + 1) % n];
          const limit = strand_limit(link.radii[a], link.directions[a], link.radii[b], link.directions[b]);
          if (limit > 0) apart_row(k, at(p), at((p + 1) % n), limit, sub++, true);
        }
        break;
      }
      case "MinDistance": {
        const [a, b] = [s.pos[0], s.pos[1]];
        if (a < 0 || b < 0 || a === b) break;
        apart_row(k, a, b, link.distance);
        break;
      }
      case "MinDistanceToSegment": {
        const [start, end, node] = [s.pos[0], s.pos[1], s.pos[2]];
        if (start < 0 || end < 0 || node < 0) break;
        const dx = x[end] - x[start];
        const dy = y[end] - y[start];
        const l2 = dx * dx + dy * dy;
        if (l2 === 0) break;
        const qx = x[node] - x[start];
        const qy = y[node] - y[start];
        const t = (qx * dx + qy * dy) / l2;
        // Past an end, the corner is the nearest point, whichever side the node is on, as in `applyPointSegmentContactConstraint`.
        if (t <= 0 || t >= 1) {
          apart_row(k, t <= 0 ? start : end, node, link.offset);
          break;
        }
        // Inside: the signed distance to the line on the allowed side, `side·n·(node − start)`.
        const len = Math.sqrt(l2);
        const c = (dx * qy - dy * qx) / len;
        const side = link.side;
        const r = rows.begin(k, 0, side * c - link.offset, 0, 1);
        rows.unilateral[r] = 1;
        const gex = qy / len - (c * dx) / l2;
        const gey = -qx / len - (c * dy) / l2;
        rows.add(r, P(node), (side * -dy) / len);
        rows.add(r, P(node) + 1, (side * dx) / len);
        rows.add(r, P(end), side * gex);
        rows.add(r, P(end) + 1, side * gey);
        rows.add(r, P(start), side * (dy / len - gex));
        rows.add(r, P(start) + 1, side * (-dx / len - gey));
        break;
      }
      case "MinDistanceToLine": {
        const [anchor, node] = [s.pos[0], s.pos[1]];
        if (anchor < 0 || node < 0) break;
        const n = link.normal;
        const r = rows.begin(k, 0, (x[node] - x[anchor]) * n.x + (y[node] - y[anchor]) * n.y - link.offset, 0, 1);
        rows.unilateral[r] = 1;
        rows.add(r, P(node), n.x);
        rows.add(r, P(node) + 1, n.y);
        rows.add(r, P(anchor), -n.x);
        rows.add(r, P(anchor) + 1, -n.y);
        break;
      }
    }
  }
}

/**
 * Append one row per motor: rotation of the driven body − rotation of what it turns against − ω·dt, as `apply_drives` reads it.
 * A drive's row carries `link = −1 − q`, `q` its index, and no multiplier slot: its multiplier lives on the drive, clamped to its torque.
 */
export function evaluate_drive_rows(nodes: SolveNodes, drives: ResolvedDrive[], rows: Rows): void {
  drives.forEach((d, q) => {
    const own = d.driven ? arm_rotation(nodes, d.driven) : nodes.angle[d.angle] - d.angle0;
    const against = d.anchor ? arm_rotation(nodes, d.anchor) : 0;
    const r = rows.begin(-1 - q, 0, own - against - d.step, 0, d.lever);
    rows.slot[r] = -1;
    if (d.driven) {
      const [gx, gy] = tangent(nodes, d.driven);
      rows.add(r, 2 * d.driven.tip, gx);
      rows.add(r, 2 * d.driven.tip + 1, gy);
      rows.add(r, 2 * d.driven.pivot, -gx);
      rows.add(r, 2 * d.driven.pivot + 1, -gy);
    } else rows.add(r, 2 * nodes.count + d.angle, 1);
    if (d.anchor) {
      const [gx, gy] = tangent(nodes, d.anchor);
      rows.add(r, 2 * d.anchor.tip, -gx);
      rows.add(r, 2 * d.anchor.tip + 1, -gy);
      rows.add(r, 2 * d.anchor.pivot, gx);
      rows.add(r, 2 * d.anchor.pivot + 1, gy);
    }
  });
}
