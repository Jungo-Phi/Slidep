import type { Link } from "../../../types";
import type { SolveNodes } from "../nodes";
import type { LinkSlots } from "../kinematics/link-slots";
import { MAX_WIDTH, Rows, evaluate_drive_rows, evaluate_rows, row_slots } from "./direct-rows";
import type { ResolvedDrive } from "../dynamics/drive-constraint";
import { Analysis, analyse, factorise, solve } from "./sparse-ldl";

/**
 * The direct XPBD solve: every handled link at once, by Newton on the multipliers.
 *
 * Each iteration solves `(J·W·Jᵀ + α̃)·Δλ = −(C + α̃·λ)` and moves the nodes by `W·Jᵀ·Δλ` — the same equations `PBD_solve` relaxes one link at a time, taken together, so the answer is the one the sweeps converge towards without their slow convergence on long chains.
 * `W` holds the nodes' inverse masses and the angles' inverse inertias, the metric the sweeps project in.
 *
 * One `DirectState` lives for one solve: the multipliers accumulate across its iterations, and across the sweeps it is called from, like the sweep's own `λ`.
 */

/** Below this fraction of the largest diagonal entry, a pivot is a redundant row: floored rather than divided by. */
const PIVOT_FLOOR = 1e-12;

/** The system's structure, and what assembling its values needs, for one pattern of rows. */
interface Structure {
  /** Rows' widths then unknowns, restricted to movable ones: what decides whether a cached structure still fits. */
  signature: Int32Array;
  analysis: Analysis;
  /**
   * `values[pairAt[p]] += grads[pairA[p]] · w[pairVar[p]] · grads[pairB[p]]`.
   * The unknown and not its weight: a structure is shared by every solve with the same pattern, whatever their masses.
   */
  pairA: Int32Array;
  pairB: Int32Array;
  pairAt: Int32Array;
  pairVar: Int32Array;
  /** Where each system row's diagonal lies in `values`. */
  diagonal: Int32Array;
  values: Float64Array;
}

/**
 * The last few structures met, shared across solves: a simulation meets the same one substep after substep, and analysing it costs more than factorising.
 * A handful, so a mechanism whose sliders touch and leave their end stops finds its structures again.
 */
const STRUCTURES: Structure[] = [];
const STRUCTURE_CACHE_SIZE = 4;

/** The rows' storage, shared by every solve: sized to the links, contacts included, it would otherwise be allocated again at every substep. */
const SHARED_ROWS = new Rows();

export interface DirectState {
  rows: Rows;
  /** The motors, solved with the links; each keeps its multiplier, clamped to its torque. */
  drives: ResolvedDrive[];
  /** Accumulated multipliers, by `Rows.slot`. */
  lambda: Float64Array;
  /** Inverse mass of each unknown. */
  w: Float64Array;
  /** Row → system row, −1 for a row that moves nothing. */
  system: Int32Array;
  /**
   * By row, 1 for a row the solve holds: not a motor at its torque, nor a contact clear or let go.
   * An idle row keeps its place in the system as an identity row, so a contact coming and going leaves the system's structure, and its analysis, as they were.
   */
  active: Uint8Array;
  /** By row, what a bounded solve aims the row's change at while it holds it, and the bounds of its `Δλ`; see `solve_bounded`. */
  goal: Float64Array;
  lo: Float64Array;
  hi: Float64Array;
  /** By row, 1 for a kinematic motor, which stalls where it stands rather than giving its bound, and 2 once a bounded solve has stalled it. */
  stall: Uint8Array;
  /** By row, the `Δλ` of the last bounded solve. */
  dl: Float64Array;
  /** By unknown, the displacement `W·Jᵀ·Δλ` of the last bounded solve. */
  step: Float64Array;
  rhs: Float64Array;
  iterations: number;
}

export function create_direct_state(nodes: SolveNodes, links: Link[], drives: ResolvedDrive[]): DirectState {
  const unknowns = 2 * nodes.count + nodes.angle.length;
  const w = new Float64Array(unknowns);
  for (let n = 0; n < nodes.count; n++) w[2 * n] = w[2 * n + 1] = nodes.w[n];
  for (let a = 0; a < nodes.angle.length; a++) w[2 * nodes.count + a] = nodes.wAngle[a];
  return {
    rows: SHARED_ROWS,
    drives,
    lambda: new Float64Array(row_slots(links).total),
    w,
    system: new Int32Array(0),
    active: new Uint8Array(0),
    goal: new Float64Array(0),
    lo: new Float64Array(0),
    hi: new Float64Array(0),
    stall: new Uint8Array(0),
    dl: new Float64Array(0),
    step: new Float64Array(unknowns),
    rhs: new Float64Array(0),
    iterations: 0,
  };
}

/** Size the state's per-row arrays to the rows evaluated last. */
function fit_rows(state: DirectState): void {
  const count = state.rows.count;
  if (state.system.length >= count) return;
  state.system = new Int32Array(count);
  state.active = new Uint8Array(count);
  state.goal = new Float64Array(count);
  state.lo = new Float64Array(count);
  state.hi = new Float64Array(count);
  state.stall = new Uint8Array(count);
  state.dl = new Float64Array(count);
}

function signature_of(rows: Rows, w: Float64Array, system: Int32Array): Int32Array {
  let size = 1;
  for (let r = 0; r < rows.count; r++) size += 1 + rows.width[r];
  const out = new Int32Array(size);
  let at = 0;
  out[at++] = rows.count;
  for (let r = 0; r < rows.count; r++) {
    out[at++] = system[r] < 0 ? -1 : rows.width[r];
    for (let j = 0; j < rows.width[r]; j++) {
      const v = rows.vars[r * MAX_WIDTH + j];
      out[at++] = w[v] !== 0 ? v : -1;
    }
  }
  return out;
}

function same(a: Int32Array, b: Int32Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function build_structure(rows: Rows, w: Float64Array, system: Int32Array, m: number, signature: Int32Array): Structure {
  // The entries of every movable unknown, the unknowns in the order the rows first meet them.
  const compact = new Int32Array(w.length).fill(-1);
  const unknowns: number[] = [];
  const counts: number[] = [];
  for (let r = 0; r < rows.count; r++) {
    if (system[r] < 0) continue;
    for (let j = 0; j < rows.width[r]; j++) {
      const v = rows.vars[r * MAX_WIDTH + j];
      if (w[v] === 0) continue;
      if (compact[v] < 0) {
        compact[v] = unknowns.length;
        unknowns.push(v);
        counts.push(0);
      }
      counts[compact[v]]++;
    }
  }
  const u = unknowns.length;
  const uStart = new Int32Array(u + 1);
  for (let q = 0; q < u; q++) uStart[q + 1] = uStart[q] + counts[q];
  const entries = new Int32Array(uStart[u]);
  const filled = uStart.slice(0, u);
  for (let r = 0; r < rows.count; r++) {
    if (system[r] < 0) continue;
    for (let j = 0; j < rows.width[r]; j++) {
      const at = r * MAX_WIDTH + j;
      const v = rows.vars[at];
      if (w[v] !== 0) entries[filled[compact[v]]++] = at;
    }
  }
  const rowOfEntry = (at: number) => system[(at / MAX_WIDTH) | 0];

  // Pattern: two system rows are coupled when they share a movable unknown.
  const rowUnknowns: number[][] = Array.from({ length: m }, () => []);
  for (let q = 0; q < u; q++)
    for (let e = uStart[q]; e < uStart[q + 1]; e++) rowUnknowns[rowOfEntry(entries[e])].push(q);
  const colStart = new Int32Array(m + 1);
  const columns: Int32Array[] = [];
  const mark = new Int32Array(m).fill(-1);
  const scratch = new Int32Array(m);
  for (let i = 0; i < m; i++) {
    let count = 0;
    mark[i] = i;
    scratch[count++] = i;
    for (const q of rowUnknowns[i])
      for (let e = uStart[q]; e < uStart[q + 1]; e++) {
        const other = rowOfEntry(entries[e]);
        if (mark[other] === i) continue;
        mark[other] = i;
        scratch[count++] = other;
      }
    const column = scratch.slice(0, count).sort();
    columns.push(column);
    colStart[i + 1] = colStart[i] + count;
  }
  const rowIndex = new Int32Array(colStart[m]);
  for (let i = 0; i < m; i++) rowIndex.set(columns[i], colStart[i]);
  /** Where row `i` of column `j` lies in `rowIndex`. */
  const position = (j: number, i: number): number => {
    let lo = colStart[j];
    let hi = colStart[j + 1] - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (rowIndex[mid] < i) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  let pairCount = 0;
  for (let q = 0; q < u; q++) pairCount += (uStart[q + 1] - uStart[q]) ** 2;
  const pairA = new Int32Array(pairCount);
  const pairB = new Int32Array(pairCount);
  const pairAt = new Int32Array(pairCount);
  const pairVar = new Int32Array(pairCount);
  let p = 0;
  for (let q = 0; q < u; q++)
    for (let x = uStart[q]; x < uStart[q + 1]; x++)
      for (let y = uStart[q]; y < uStart[q + 1]; y++) {
        const a = entries[x];
        const b = entries[y];
        pairA[p] = a;
        pairB[p] = b;
        pairAt[p] = position(rowOfEntry(b), rowOfEntry(a));
        pairVar[p] = unknowns[q];
        p++;
      }
  const diagonal = new Int32Array(m);
  for (let i = 0; i < m; i++) diagonal[i] = position(i, i);

  return {
    signature,
    analysis: analyse({ n: m, colStart, rowIndex }),
    pairA,
    pairB,
    pairAt,
    pairVar,
    diagonal,
    values: new Float64Array(colStart[m]),
  };
}

function structure_for(rows: Rows, w: Float64Array, system: Int32Array, m: number): Structure {
  const signature = signature_of(rows, w, system);
  const found = STRUCTURES.findIndex((s) => same(s.signature, signature));
  if (found >= 0) {
    const s = STRUCTURES[found];
    if (found > 0) {
      STRUCTURES.splice(found, 1);
      STRUCTURES.unshift(s);
    }
    return s;
  }
  const s = build_structure(rows, w, system, m, signature);
  STRUCTURES.unshift(s);
  if (STRUCTURES.length > STRUCTURE_CACHE_SIZE) STRUCTURES.pop();
  return s;
}

/** `C + α̃·λ` of row `r`: what is left for the solve to close. */
function residual_of(state: DirectState, r: number): number {
  const { rows, lambda } = state;
  const alpha = rows.alphaTilde[r];
  return rows.value[r] + (alpha !== 0 ? alpha * lambda[rows.slot[r]] : 0);
}

/** How far row `r` is from satisfied, in its own unit: a contact that is clear and does not push is. */
function violation(state: DirectState, r: number): number {
  const residual = residual_of(state, r);
  if (state.rows.unilateral[r] && state.lambda[state.rows.slot[r]] === 0) return Math.max(0, -residual);
  return Math.abs(residual);
}

/** The worst violation, in metres, among the rows the solve holds and the contacts it does not; the rows are evaluated at the current nodes. */
function worst_residual(state: DirectState): number {
  const { rows, active } = state;
  let worst = 0;
  for (let r = 0; r < rows.count; r++) {
    if (!active[r] && !rows.unilateral[r]) continue;
    const residual = violation(state, r) * rows.scale[r];
    if (residual > worst) worst = residual;
  }
  return worst;
}

/** Whether a motor starts an iteration out of the system, at its torque, which `solve_bounded` may hold again; a motor with no torque at all never joins. */
function saturated(d: ResolvedDrive): boolean {
  return d.bound === 0 || Math.abs(d.lambda) >= d.bound;
}

/** How many times one bounded solve takes back rows it set at a bound before it settles for the set it has. */
const REENTRY_ROUNDS = 8;

/**
 * The one solve every limit goes through: each row's `Δλ` within its own `[lo, hi]`, a row held aiming its change at `goal`, a row at a bound giving that bound and the others solved against what it moves.
 * Rows start held as `state.active` says, which ends as the set the answer holds; a row outside the system, or with `lo = hi`, is never held.
 * A held row past a bound is set at it; a row at a bound whose gap pulls it back inside by more than `slack` (metres, per second in a bounce) is held again, up to `REENTRY_ROUNDS` times, so the answer always keeps every bound and the set is right but in a degenerate case.
 * A kinematic motor past its bound stalls instead: `Δλ = 0`, its `lo` and `hi` set to 0 and its `stall` to 2.
 * Leaves `Δλ` in `state.dl` and `W·Jᵀ·Δλ` in `state.step`, applied to nothing.
 */
function solve_bounded(state: DirectState, s: Structure, m: number, compliant: boolean, slack: number): void {
  const { rows, w, system, active, goal, lo, hi, stall, dl, step } = state;
  if (state.rhs.length < m) state.rhs = new Float64Array(m);
  const rhs = state.rhs;
  const moved = (r: number): number => {
    let sum = 0;
    for (let j = 0; j < rows.width[r]; j++) sum += rows.grads[r * MAX_WIDTH + j] * step[rows.vars[r * MAX_WIDTH + j]];
    return sum;
  };
  const spread = (r: number, amount: number): void => {
    for (let j = 0; j < rows.width[r]; j++) {
      const v = rows.vars[r * MAX_WIDTH + j];
      step[v] += w[v] * rows.grads[r * MAX_WIDTH + j] * amount;
    }
  };
  for (let r = 0; r < rows.count; r++) {
    if (system[r] < 0 || lo[r] === hi[r]) active[r] = 0;
    if (!active[r]) dl[r] = Math.max(lo[r], Math.min(hi[r], 0));
  }
  for (let round = 0; ; ) {
    step.fill(0);
    for (let r = 0; r < rows.count; r++) if (!active[r] && dl[r] !== 0) spread(r, dl[r]);
    assemble(state, s, compliant);
    for (let r = 0; r < rows.count; r++) {
      const i = system[r];
      if (i >= 0) rhs[i] = active[r] ? goal[r] - moved(r) : 0;
    }
    solve(s.analysis, rhs.length === m ? rhs : rhs.subarray(0, m));

    let dropped = false;
    for (let r = 0; r < rows.count; r++) {
      if (!active[r]) continue;
      dl[r] = rhs[system[r]];
      if (dl[r] >= lo[r] && dl[r] <= hi[r]) continue;
      active[r] = 0;
      dropped = true;
      if (stall[r]) {
        dl[r] = lo[r] = hi[r] = 0;
        stall[r] = 2;
      } else dl[r] = Math.max(lo[r], Math.min(hi[r], dl[r]));
    }
    if (dropped) continue;
    for (let r = 0; r < rows.count; r++) if (active[r]) spread(r, dl[r]);
    if (round++ === REENTRY_ROUNDS) return;

    let taken = false;
    for (let r = 0; r < rows.count; r++) {
      if (active[r] || system[r] < 0 || lo[r] === hi[r]) continue;
      const gap = (goal[r] - moved(r) - (compliant ? rows.alphaTilde[r] * dl[r] : 0)) * rows.scale[r];
      if ((dl[r] !== hi[r] && gap > slack) || (dl[r] !== lo[r] && gap < -slack)) {
        active[r] = 1;
        taken = true;
      }
    }
    if (!taken) return;
  }
}

/**
 * Newton iterations on the handled links until every row is within `tolerance` metres, or `maxIterations` have run.
 * Returns the worst residual left, in metres.
 *
 * Each step is a bounded solve: a motor gives at most its torque, a contact or an end stop only pushes, and the rest of the mechanism is solved against what they give.
 */
export function direct_iterate(
  state: DirectState,
  nodes: SolveNodes,
  links: Link[],
  slots: LinkSlots[],
  handled: Uint8Array,
  invDtSq: number,
  tolerance: number,
  maxIterations: number,
): number {
  const { rows, lambda, w, drives } = state;
  let worst = Infinity;
  for (let it = 0; it <= maxIterations; it++) {
    evaluate_rows(nodes, links, slots, handled, invDtSq, rows, drives.length);
    evaluate_drive_rows(nodes, drives, rows);
    fit_rows(state);
    const { system, active, goal, lo, hi, stall } = state;
    let m = 0;
    let held = 0;
    for (let r = 0; r < rows.count; r++) {
      // Movable decides the row's place in the structure, moving whether it can act now: a gradient can vanish for an instant.
      let movable = false;
      let moving = false;
      for (let j = 0; j < rows.width[r]; j++) {
        const at = r * MAX_WIDTH + j;
        if (w[rows.vars[at]] === 0) continue;
        movable = true;
        if (rows.grads[at] !== 0) moving = true;
      }
      system[r] = movable ? m++ : -1;
      goal[r] = -residual_of(state, r);
      stall[r] = 0;
      const link = rows.link[r];
      let idle = false;
      lo[r] = -Infinity;
      hi[r] = Infinity;
      if (link < 0) {
        const d = drives[-1 - link];
        idle = saturated(d);
        stall[r] = d.lock ? 1 : 0;
        if (d.bound === 0 || (d.lock && idle)) lo[r] = hi[r] = 0;
        else {
          lo[r] = -d.bound - d.lambda;
          hi[r] = d.bound - d.lambda;
        }
      } else if (rows.unilateral[r]) {
        const slot = rows.slot[r];
        idle = lambda[slot] === 0 && rows.value[r] >= 0;
        lo[r] = -lambda[slot];
      }
      if (!moving) lo[r] = hi[r] = 0;
      active[r] = moving && !idle ? 1 : 0;
      held += active[r];
    }
    worst = worst_residual(state);
    if (worst < tolerance || it === maxIterations || held === 0) break;

    solve_bounded(state, structure_for(rows, w, system, m), m, true, tolerance);

    // λ += Δλ, x += W·Jᵀ·Δλ.
    const { dl, step } = state;
    for (let r = 0; r < rows.count; r++) {
      const link = rows.link[r];
      if (link < 0) {
        const d = drives[-1 - link];
        d.lambda = Math.max(-d.bound, Math.min(d.bound, d.lambda + dl[r]));
        if (stall[r] === 2) d.bound = Math.abs(d.lambda);
      } else if (dl[r] === 0) continue;
      else if (rows.unilateral[r]) lambda[rows.slot[r]] = Math.max(0, lambda[rows.slot[r]] + dl[r]);
      else lambda[rows.slot[r]] += dl[r];
    }
    const twoCount = 2 * nodes.count;
    for (let v = 0; v < step.length; v++) {
      if (step[v] === 0) continue;
      if (v < twoCount) {
        if ((v & 1) === 0) nodes.x[v >> 1] += step[v];
        else nodes.y[v >> 1] += step[v];
      } else nodes.angle[v - twoCount] += step[v];
    }
    state.iterations++;
  }
  return worst;
}

/**
 * `J·W·Jᵀ` of the rows the solve holds, factorised in `s`, with each row's `α̃` on the diagonal when `compliant`; a row it does not hold is an identity row.
 */
function assemble(state: DirectState, s: Structure, compliant: boolean): void {
  const { rows, w, system, active } = state;
  const values = s.values;
  values.fill(0);
  const grads = rows.grads;
  for (let p = 0; p < s.pairA.length; p++) {
    const a = s.pairA[p];
    const b = s.pairB[p];
    if (active[(a / MAX_WIDTH) | 0] && active[(b / MAX_WIDTH) | 0]) values[s.pairAt[p]] += grads[a] * w[s.pairVar[p]] * grads[b];
  }
  let largest = 0;
  for (let r = 0; r < rows.count; r++) {
    const i = system[r];
    if (i < 0) continue;
    if (!active[r]) {
      values[s.diagonal[i]] = 1;
      continue;
    }
    if (compliant) values[s.diagonal[i]] += rows.alphaTilde[r];
    if (values[s.diagonal[i]] > largest) largest = values[s.diagonal[i]];
  }
  factorise(s.analysis, values, largest * PIVOT_FLOOR + Number.MIN_VALUE);
}

/** Row `r`'s rate, `∇C·v`, for the velocities `vx`, `vy` of the nodes and `va` of the angles. */
function rate_of(rows: Rows, r: number, twoCount: number, vx: ArrayLike<number>, vy: ArrayLike<number>, va: ArrayLike<number>): number {
  let rate = 0;
  for (let j = 0; j < rows.width[r]; j++) {
    const at = r * MAX_WIDTH + j;
    const v = rows.vars[at];
    const speed = v < twoCount ? ((v & 1) === 0 ? vx[v >> 1] : vy[v >> 1]) : va[v - twoCount];
    rate += rows.grads[at] * speed;
  }
  return rate;
}

/**
 * Bounce what just struck something: a contact or an end stop that pushed, arrived moving into it, leaves at `restitution` times that speed.
 * Through the whole mechanism, not the two points that touch: a bounded solve at the velocity level, with the rows as the last iteration left them, where the struck rows aim at their rebound and every other row keeps its own rate.
 * A motor takes no part, its bounded torque giving no impulse over so short a time, and a contact or a stop only pushes.
 * What is attached to a struck point then bounces with it, in the share its mass takes.
 *
 * `beforeX/Y/A` hold the velocities the substep started from; `nodes.vx`, `vy` and `vAngle` those it read back, bounced in place; `dt` is the substep's length.
 * Returns the kinetic energy (J) the impacts took, `½·(1 − e²)·m·u²` each as for a pair of points, `u` the approach speed and `m` the mass the whole mechanism opposes to it; none when `bounce_share` cuts the bounce back.
 */
export function direct_bounce(
  state: DirectState,
  nodes: SolveNodes,
  beforeX: Float64Array,
  beforeY: Float64Array,
  beforeA: Float64Array,
  restitution: number,
  dt: number,
): number {
  const { rows, lambda, w, system, active } = state;
  if (restitution <= 0 || rows.count === 0 || dt <= 0) return 0;
  fit_rows(state);
  const twoCount = 2 * nodes.count;
  let m = 0;
  for (let r = 0; r < rows.count; r++) if (system[r] >= m) m = system[r] + 1;
  if (m === 0) return 0;
  const { goal, lo, hi, stall, dl, step } = state;
  const before = (r: number) => rate_of(rows, r, twoCount, beforeX, beforeY, beforeA);
  const after = (r: number) => rate_of(rows, r, twoCount, nodes.vx, nodes.vy, nodes.vAngle);

  // Each impact: its row, the approach speed and the change of speed aimed at.
  const impacts: { r: number; closing: number; change: number }[] = [];
  let fastest = 0;
  for (let r = 0; r < rows.count; r++) {
    goal[r] = 0;
    stall[r] = 0;
    lo[r] = -Infinity;
    hi[r] = Infinity;
    if (!active[r] || rows.link[r] < 0) {
      lo[r] = hi[r] = 0;
      continue;
    }
    if (!rows.unilateral[r]) continue;
    lo[r] = 0;
    if (rows.inelastic[r] || lambda[rows.slot[r]] <= 0) continue;
    const closing = -before(r);
    if (closing <= 0) continue;
    goal[r] = restitution * closing - after(r);
    impacts.push({ r, closing, change: goal[r] });
    fastest = Math.max(fastest, closing);
  }
  if (impacts.length === 0) return 0;

  // Rigid: an impact is over before a compliance could give.
  solve_bounded(state, structure_for(rows, w, system, m), m, false, BOUNCE_SLACK * fastest);

  // The impulse each impact took for the change it asked, which is the mass it met.
  let lost = 0;
  for (const { r, closing, change } of impacts) {
    if (change === 0 || !active[r]) continue;
    const mass = Math.abs(dl[r] / change);
    lost += 0.5 * (1 - restitution * restitution) * mass * closing * closing;
  }

  const share = bounce_share(state, nodes, dt);
  // Cut back, the bounce leaves the mechanism the energy it had before its impacts: they took none.
  if (share < 1) lost = 0;
  for (let v = 0; v < step.length; v++) {
    const change = step[v] * share;
    if (change === 0) continue;
    if (v >= twoCount) nodes.vAngle[v - twoCount] += change;
    else if ((v & 1) === 0) nodes.vx[v >> 1] += change;
    else nodes.vy[v >> 1] += change;
  }
  return lost;
}

/**
 * How far past the energy before its impacts a bounce may go before `bounce_share` cuts it back.
 * That energy is an estimate, off by what the forces did over the substep: a sound bounce of the walker passes it by up to 5 %, a leak by several times the whole.
 */
const BOUNCE_MARGIN = 0.25;

/** A row at a bound in a bounce is held again once its gap passes this fraction of the fastest approach. */
const BOUNCE_SLACK = 1e-6;

/**
 * The share of the bounce in `state.step` that leaves the mechanism no more kinetic energy than it had just before its impacts.
 * No impact with `e ≤ 1` adds energy, whichever rows take part, so a bounce that would is cut back to where it does not: a safety net under the bounded solve, not a model of anything.
 * Just before the impacts is read as the velocities read back without the substep's pushes from the contacts and stops, `W·Jᵀ·λ / dt`, or the velocities read back if they hold more.
 */
function bounce_share(state: DirectState, nodes: SolveNodes, dt: number): number {
  const { rows, lambda, w, step } = state;
  const twoCount = 2 * nodes.count;
  const speed = (v: number): number =>
    v >= twoCount ? nodes.vAngle[v - twoCount] : (v & 1) === 0 ? nodes.vx[v >> 1] : nodes.vy[v >> 1];
  const pushed = new Float64Array(w.length);
  for (let r = 0; r < rows.count; r++) {
    if (!rows.unilateral[r] || rows.link[r] < 0) continue;
    const l = lambda[rows.slot[r]];
    if (l <= 0) continue;
    for (let j = 0; j < rows.width[r]; j++) {
      const v = rows.vars[r * MAX_WIDTH + j];
      pushed[v] += (w[v] * rows.grads[r * MAX_WIDTH + j] * l) / dt;
    }
  }
  let read = 0;
  let prior = 0;
  let linear = 0;
  let quadratic = 0;
  for (let v = 0; v < w.length; v++) {
    if (w[v] === 0) continue;
    const u = speed(v);
    const p = u - pushed[v];
    read += (0.5 * u * u) / w[v];
    prior += (0.5 * p * p) / w[v];
    linear += (u * step[v]) / w[v];
    quadratic += (0.5 * step[v] * step[v]) / w[v];
  }
  const cap = Math.max(read, prior);
  const full = read + linear + quadratic;
  if (full <= cap * (1 + BOUNCE_MARGIN) || quadratic === 0) return 1;
  // The root of `read + s·linear + s²·quadratic = cap`, which lies in [0, 1) since `read ≤ cap < full`.
  return Math.min(1, Math.max(0, (-linear + Math.sqrt(linear * linear + 4 * quadratic * (cap - read))) / (2 * quadratic)));
}

/**
 * Each handled link's worst residual at the current nodes, in metres, into `out` — what `PBD_solve` reports in its diagnostics.
 * Reads the rows as `direct_iterate` last left them.
 */
export function link_residuals(state: DirectState, out: number[]): void {
  const { rows } = state;
  for (let r = 0; r < rows.count; r++) {
    const k = rows.link[r];
    if (k < 0) continue;
    const residual = violation(state, r) * rows.scale[r];
    if (residual > out[k]) out[k] = residual;
  }
}

/**
 * Add each handled link's share of the solve's displacement, `W·∇C·λ`, to its reaction accumulator — slot for slot, the displacement `PBD_solve` would have summed over its sweeps.
 * Uses the rows' gradients as last evaluated, at the converged nodes.
 */
export function accumulate_reactions(
  state: DirectState,
  nodes: SolveNodes,
  slots: LinkSlots[],
  accumulator: (link: number) => { dx: Float64Array; dy: Float64Array; dAngle: Float64Array },
): void {
  const { rows, lambda, w } = state;
  const twoCount = 2 * nodes.count;
  for (let r = 0; r < rows.count; r++) {
    const k = rows.link[r];
    if (k < 0) continue;
    const s = slots[k];
    const l = lambda[rows.slot[r]];
    if (l === 0) continue;
    const acc = accumulator(k);
    for (let j = 0; j < rows.width[r]; j++) {
      const at = r * MAX_WIDTH + j;
      const v = rows.vars[at];
      const shift = w[v] * rows.grads[at] * l;
      if (shift === 0) continue;
      if (v < twoCount) {
        const node = v >> 1;
        const slot = s.pos.indexOf(node);
        if (slot < 0) continue;
        if ((v & 1) === 0) acc.dx[slot] += shift;
        else acc.dy[slot] += shift;
      } else {
        const slot = s.ang.indexOf(v - twoCount);
        if (slot >= 0) acc.dAngle[slot] += shift;
      }
    }
  }
}
