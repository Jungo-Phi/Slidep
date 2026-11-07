import type { Link } from "../../../types";
import type { ContactSpin } from "../../../types/kinematic-solver-links";
import type { SolveNodes } from "../nodes";
import type { LinkSlots } from "../kinematics/link-slots";

/**
 * Coulomb friction at the collision contacts, as Mueller and others treat it in "Detailed Rigid Body Simulation with Extended Position Based Dynamics" (2020).
 *
 * A contact sticks when holding it takes no more tangential impulse than `μs` times the normal one the solve gave it: `hold_contacts` then cancels its tangential slip, at the position level, so a part rests on a slope without creeping.
 * One that cannot stick slides, and `slide_contacts` brakes its tangential speed by at most `μd` times that normal impulse, at the velocity level.
 * A gear's rim slips by its centre's motion and by its own rotation, so friction turns it too: a wheel rolls rather than skids.
 */
export interface ContactFrictionInput {
  /** Static coefficient, dimensionless. */
  static: number;
  /** Dynamic coefficient, dimensionless. */
  dynamic: number;
  /** Output: kinetic energy (J) the slipping contacts dissipated, added up. */
  lost: number;
}

/** Whether a friction input acts at all: both coefficients zero leaves the contacts frictionless, at no cost. */
export function friction_acts(friction: ContactFrictionInput | undefined): friction is ContactFrictionInput {
  return !!friction && (friction.static > 0 || friction.dynamic > 0);
}

/**
 * The static threshold actually held.
 * Never below `μd`: a contact that a sliding brake would stop each substep has to be held there too, or it creeps down a slope by the predict step's own drift.
 */
const holding_coefficient = (friction: ContactFrictionInput): number => Math.max(friction.static, friction.dynamic);

/** One contact's tangential direction and the dofs its slip reads, reused from one contact to the next. */
class TangentRow {
  tx = 0;
  ty = 0;
  /** `Σ w·c²` over the positions alone: the inverse mass the contact's normal push met. */
  normalW = 0;
  /** The same, rotations included: the inverse mass a tangential impulse meets. */
  tangentW = 0;
  posCount = 0;
  readonly pos = new Int32Array(3);
  /** Each position's share of the slip, along `t`. */
  readonly posCoef = new Float64Array(3);
  angCount = 0;
  readonly ang = new Int32Array(2);
  /** Each angle's share of the slip: the rim's lever about the centre, signed. */
  readonly angCoef = new Float64Array(2);
}

function add_pos(row: TangentRow, nodes: SolveNodes, slot: number, coef: number): void {
  row.pos[row.posCount] = slot;
  row.posCoef[row.posCount++] = coef;
  row.normalW += nodes.w[slot] * coef * coef;
}

/** The gear centred at the contact's `sign` side, touching along `nx, ny` (pointing from the other side towards this one). */
function add_spin(row: TangentRow, nodes: SolveNodes, spin: ContactSpin | undefined, sign: number, nx: number, ny: number): void {
  if (!spin) return;
  const a = nodes.angleIndex.get(spin.angleKey);
  if (a === undefined) return;
  // The rim point touching, from the centre: back along the normal on this side.
  const rx = -sign * spin.radius * nx;
  const ry = -sign * spin.radius * ny;
  // A counter-clockwise turn ω moves it by ω·(−ry, rx).
  row.ang[row.angCount] = a;
  row.angCoef[row.angCount++] = sign * (-ry * row.tx + rx * row.ty);
}

/** Fills `row` for contact `link` at the current positions; false when its geometry says nothing (a node missing, a degenerate segment). */
function tangent_row(link: Link, s: LinkSlots, nodes: SolveNodes, row: TangentRow): boolean {
  row.posCount = 0;
  row.angCount = 0;
  row.normalW = 0;
  const { x, y } = nodes;
  let nx: number;
  let ny: number;
  switch (link.type) {
    case "MinDistanceToLine": {
      const [anchor, node] = [s.pos[0], s.pos[1]];
      if (anchor < 0 || node < 0) return false;
      nx = link.normal.x;
      ny = link.normal.y;
      row.tx = -ny;
      row.ty = nx;
      add_pos(row, nodes, node, 1);
      add_pos(row, nodes, anchor, -1);
      add_spin(row, nodes, link.spin3, 1, nx, ny);
      break;
    }
    case "MinDistance": {
      const [a, b] = [s.pos[0], s.pos[1]];
      if (a < 0 || b < 0 || a === b) return false;
      const dx = x[a] - x[b];
      const dy = y[a] - y[b];
      const d = Math.hypot(dx, dy);
      if (d < 1e-12) return false;
      nx = dx / d;
      ny = dy / d;
      row.tx = -ny;
      row.ty = nx;
      add_pos(row, nodes, a, 1);
      add_pos(row, nodes, b, -1);
      add_spin(row, nodes, link.spin1, 1, nx, ny);
      add_spin(row, nodes, link.spin2, -1, nx, ny);
      break;
    }
    case "MinDistanceToSegment": {
      const [start, end, node] = [s.pos[0], s.pos[1], s.pos[2]];
      if (start < 0 || end < 0 || node < 0) return false;
      const dx = x[end] - x[start];
      const dy = y[end] - y[start];
      const l2 = dx * dx + dy * dy;
      if (l2 === 0) return false;
      const t = Math.max(0, Math.min(1, ((x[node] - x[start]) * dx + (y[node] - y[start]) * dy) / l2));
      const ox = x[node] - (x[start] + dx * t);
      const oy = y[node] - (y[start] + dy * t);
      const d = Math.hypot(ox, oy);
      if (d > 1e-12) {
        nx = ox / d;
        ny = oy / d;
      } else {
        const len = Math.sqrt(l2);
        nx = (-dy * link.side) / len;
        ny = (dx * link.side) / len;
      }
      row.tx = -ny;
      row.ty = nx;
      add_pos(row, nodes, node, 1);
      add_pos(row, nodes, start, -(1 - t));
      add_pos(row, nodes, end, -t);
      add_spin(row, nodes, link.spin3, 1, nx, ny);
      break;
    }
    default:
      return false;
  }
  let w = row.normalW;
  for (let j = 0; j < row.angCount; j++) w += nodes.wAngle[row.ang[j]] * row.angCoef[j] * row.angCoef[j];
  row.tangentW = w;
  return w > 0;
}

/** `Σ c·(u·t)` over the positions plus `Σ c·ω` over the angles, for the per-dof quantities given. */
function tangential(row: TangentRow, ux: ArrayLike<number>, uy: ArrayLike<number>, ua: ArrayLike<number>): number {
  let sum = 0;
  for (let j = 0; j < row.posCount; j++) {
    const p = row.pos[j];
    sum += row.posCoef[j] * (ux[p] * row.tx + uy[p] * row.ty);
  }
  for (let j = 0; j < row.angCount; j++) sum += row.angCoef[j] * ua[row.ang[j]];
  return sum;
}

/** Moves every dof of `row` by its share of a tangential impulse `p` into `ux, uy, ua`: positions for a position-level one, velocities for a velocity-level one. */
function apply(row: TangentRow, nodes: SolveNodes, p: number, ux: Float64Array, uy: Float64Array, ua: Float64Array): void {
  for (let j = 0; j < row.posCount; j++) {
    const slot = row.pos[j];
    const k = nodes.w[slot] * row.posCoef[j] * p;
    if (k === 0) continue;
    ux[slot] += k * row.tx;
    uy[slot] += k * row.ty;
  }
  for (let j = 0; j < row.angCount; j++) {
    const a = row.ang[j];
    ua[a] += nodes.wAngle[a] * row.angCoef[j] * p;
  }
}

/**
 * The normal impulses a solve gave its collision contacts, from which their friction is bounded.
 * Kept in impulse·time (kg·m), the unit of an XPBD multiplier: `pushed / w` for what the sweep moved, the multiplier itself for what the direct solve held.
 */
export class ContactPushes {
  /** By contact (link index − `contactsFrom`), the relative normal displacement the sweep's corrections added up to. */
  readonly swept: Float64Array;
  /** By contact, the direct solve's multiplier, or nothing when the sweep holds every contact. */
  direct: ((k: number) => number) | null = null;

  constructor(
    readonly links: Link[],
    readonly slots: LinkSlots[],
    readonly contactsFrom: number,
  ) {
    this.swept = new Float64Array(links.length - contactsFrom);
  }

  /** A correction of `err` metres the sweep just made at link `k`, which counts only if `k` is a contact. */
  record(k: number, err: number): void {
    if (k >= this.contactsFrom && err > 0) this.swept[k - this.contactsFrom] += err;
  }

  /** Contact `k`'s normal impulse, `row` filled at the current positions. */
  normal(k: number, row: TangentRow): number {
    const swept = this.swept[k - this.contactsFrom];
    return (swept > 0 && row.normalW > 0 ? swept / row.normalW : 0) + (this.direct ? this.direct(k) : 0);
  }

  /** Whether contact `k` pushed at all, before its geometry is worth reading. */
  pushed(k: number): boolean {
    return this.swept[k - this.contactsFrom] > 0 || (this.direct !== null && this.direct(k) > 0);
  }
}

const ROW = new TangentRow();

/**
 * Static friction: every contact that can stick has its tangential slip since the substep began undone, positions and gear angles alike.
 * Run at the end of a sweep, so the links swept or solved after it have the last word on the rest of the mechanism.
 * `startX/Y/A` are the positions and angles the substep began from, before its predict step.
 */
export function hold_contacts(
  friction: ContactFrictionInput,
  pushes: ContactPushes,
  nodes: SolveNodes,
  startX: Float64Array,
  startY: Float64Array,
  startA: Float64Array,
): void {
  const mu = holding_coefficient(friction);
  if (mu <= 0) return;
  const { links, slots, contactsFrom } = pushes;
  const count = nodes.count;
  for (let k = contactsFrom; k < links.length; k++) {
    if (!pushes.pushed(k) || !tangent_row(links[k], slots[k], nodes, ROW)) continue;
    const normal = pushes.normal(k, ROW);
    if (normal <= 0) continue;
    let slip = 0;
    for (let j = 0; j < ROW.posCount; j++) {
      const p = ROW.pos[j];
      if (p >= count) continue;
      slip += ROW.posCoef[j] * ((nodes.x[p] - startX[p]) * ROW.tx + (nodes.y[p] - startY[p]) * ROW.ty);
    }
    for (let j = 0; j < ROW.angCount; j++) slip += ROW.angCoef[j] * (nodes.angle[ROW.ang[j]] - startA[ROW.ang[j]]);
    const impulse = slip / ROW.tangentW;
    if (impulse === 0 || Math.abs(impulse) > mu * normal) continue;
    apply(ROW, nodes, -impulse, nodes.x, nodes.y, nodes.angle);
  }
}

/**
 * Dynamic friction: every contact's tangential speed, braked by at most `μd` times its normal impulse, down to zero and never past it.
 * Run on the velocities a substep reads back, `dt` its length; adds the kinetic energy taken to `friction.lost`.
 */
export function slide_contacts(friction: ContactFrictionInput, pushes: ContactPushes, nodes: SolveNodes, dt: number): void {
  if (friction.dynamic <= 0 || dt <= 0) return;
  const { links, slots, contactsFrom } = pushes;
  for (let k = contactsFrom; k < links.length; k++) {
    if (!pushes.pushed(k) || !tangent_row(links[k], slots[k], nodes, ROW)) continue;
    const normal = pushes.normal(k, ROW);
    if (normal <= 0) continue;
    const speed = tangential(ROW, nodes.vx, nodes.vy, nodes.vAngle);
    if (speed === 0) continue;
    const bound = (friction.dynamic * normal) / dt;
    const impulse = Math.max(-bound, Math.min(bound, -speed / ROW.tangentW));
    apply(ROW, nodes, impulse, nodes.vx, nodes.vy, nodes.vAngle);
    const after = speed + ROW.tangentW * impulse;
    friction.lost += (speed * speed - after * after) / (2 * ROW.tangentW);
  }
}
