import type { Link } from "../../../types";
import type { SolveNodes } from "../nodes";
import type { LinkSlots } from "../kinematics/link-slots";
import { MAX_WIDTH, ROWS_PER_LINK, Rows, evaluate_drive_rows, evaluate_rows } from "./direct-rows";
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
   * By row, 1 for a row the solve holds: not a saturated motor, nor a contact clear or let go.
   * An idle row keeps its place in the system as an identity row, so a contact coming and going leaves the system's structure, and its analysis, as they were.
   */
  active: Uint8Array;
  /** By `Rows.slot`, 1 for a contact let go since the last full step, which stays out even if it is still violated; see `direct_iterate`. */
  released: Uint8Array;
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
    lambda: new Float64Array(links.length * ROWS_PER_LINK),
    w,
    released: new Uint8Array(links.length * ROWS_PER_LINK),
    system: new Int32Array(0),
    active: new Uint8Array(0),
    rhs: new Float64Array(0),
    iterations: 0,
  };
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

/**
 * Whether a motor's row stays out of the system: once at its torque limit, for the rest of the substep, and a motor with no torque at all from the start.
 * Releasing it within a substep would need the whole system's answer rather than the motor's own gap, and a substep is short enough for a motor that saturated in it to stay saturated to its end.
 */
function saturated(d: ResolvedDrive): boolean {
  return d.bound === 0 || Math.abs(d.lambda) >= d.bound;
}

/**
 * Newton iterations on the handled links until every row is within `tolerance` metres, or `maxIterations` have run.
 * Returns the worst residual left, in metres.
 *
 * The contacts are an active set: one joins the system once violated, and holds at `C = 0` while it pushes.
 * A contact the solve would make pull is let go, and stays out until the next full step has been taken, so that step is solved without it.
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
    if (state.system.length < rows.count) {
      state.system = new Int32Array(rows.count);
      state.active = new Uint8Array(rows.count);
    }
    const { system, active } = state;
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
      const link = rows.link[r];
      const slot = rows.slot[r];
      const idle =
        link < 0
          ? saturated(drives[-1 - link])
          : rows.unilateral[r] === 1 && lambda[slot] === 0 && (rows.value[r] >= 0 || state.released[slot] === 1);
      active[r] = moving && !idle ? 1 : 0;
      held += active[r];
    }
    worst = worst_residual(state);
    if (worst < tolerance || it === maxIterations || held === 0) break;

    const s = structure_for(rows, w, state.system, m);
    assemble(state, s, true);
    if (state.rhs.length < m) state.rhs = new Float64Array(m);
    const rhs = state.rhs;
    for (let r = 0; r < rows.count; r++) {
      const i = system[r];
      if (i >= 0) rhs[i] = active[r] ? -residual_of(state, r) : 0;
    }
    solve(s.analysis, rhs.length === m ? rhs : rhs.subarray(0, m));

    // A motor asked for more than its torque saturates, a contact asked to pull lets go, and this step is not taken: the others' share was solved for rows that give what they cannot, and taking it would carry the mechanism along as if they had.
    // Only the limited rows' impulse, cut at their limit, is applied; the next iteration solves the rest with them out of the system.
    let limited = false;
    for (let r = 0; r < rows.count; r++) {
      if (!active[r]) continue;
      const i = system[r];
      const link = rows.link[r];
      if (link < 0) {
        const d = drives[-1 - link];
        if (Math.abs(d.lambda + rhs[i]) > d.bound) limited = true;
      } else if (rows.unilateral[r] && lambda[rows.slot[r]] + rhs[i] < 0) limited = true;
    }

    // x += W·Jᵀ·Δλ, λ += Δλ.
    const twoCount = 2 * nodes.count;
    for (let r = 0; r < rows.count; r++) {
      if (!active[r]) continue;
      let dl = rhs[system[r]];
      const link = rows.link[r];
      if (link < 0) {
        const d = drives[-1 - link];
        const next = Math.max(-d.bound, Math.min(d.bound, d.lambda + dl));
        if (limited && next === d.lambda + dl) continue;
        dl = next - d.lambda;
        d.lambda = next;
      } else if (rows.unilateral[r]) {
        const slot = rows.slot[r];
        const next = Math.max(0, lambda[slot] + dl);
        if (limited && next === lambda[slot] + dl) continue;
        if (limited) state.released[slot] = 1;
        dl = next - lambda[slot];
        lambda[slot] = next;
      } else if (limited) continue;
      else lambda[rows.slot[r]] += dl;
      for (let j = 0; j < rows.width[r]; j++) {
        const at = r * MAX_WIDTH + j;
        const v = rows.vars[at];
        const step = w[v] * rows.grads[at] * dl;
        if (step === 0) continue;
        if (v < twoCount) {
          if ((v & 1) === 0) nodes.x[v >> 1] += step;
          else nodes.y[v >> 1] += step;
        } else nodes.angle[v - twoCount] += step;
      }
    }
    if (!limited) state.released.fill(0);
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
 * Bounce what just struck something: a contact that pushed, or a slider at an end stop, that arrived moving into it leaves at `restitution` times that speed.
 * Through the whole mechanism, not the two points that touch: one more solve at the velocity level, with the rows as the last iteration left them, where the struck rows aim at their rebound and every other row keeps its own rate.
 * What is attached to a struck point then bounces with it, in the share its mass takes.
 *
 * `beforeX/Y/A` hold the velocities the substep started from; `nodes.vx`, `vy` and `vAngle` those it read back, bounced in place.
 * Returns the kinetic energy (J) the impacts took, `½·(1 − e²)·m·u²` each as for a pair of points, `u` the approach speed and `m` the mass the whole mechanism opposes to it.
 */
export function direct_bounce(
  state: DirectState,
  nodes: SolveNodes,
  beforeX: Float64Array,
  beforeY: Float64Array,
  beforeA: Float64Array,
  restitution: number,
): number {
  const { rows, lambda, w, system, active } = state;
  if (restitution <= 0 || rows.count === 0) return 0;
  const twoCount = 2 * nodes.count;
  let m = 0;
  for (let r = 0; r < rows.count; r++) if (system[r] >= m) m = system[r] + 1;
  if (m === 0) return 0;
  if (state.rhs.length < m) state.rhs = new Float64Array(m);
  const rhs = state.rhs;
  rhs.fill(0, 0, m);
  const before = (r: number) => rate_of(rows, r, twoCount, beforeX, beforeY, beforeA);
  const after = (r: number) => rate_of(rows, r, twoCount, nodes.vx, nodes.vy, nodes.vAngle);

  // Each impact: its row or rows, the unit direction across them, the approach speed and the change of speed aimed at.
  const impacts: { rx: number; ry: number; ax: number; ay: number; closing: number; change: number }[] = [];
  for (let r = 0; r < rows.count; r++) {
    if (!active[r] || !rows.unilateral[r] || lambda[rows.slot[r]] <= 0) continue;
    const closing = -before(r);
    if (closing <= 0) continue;
    const change = restitution * closing - after(r);
    rhs[system[r]] = change;
    impacts.push({ rx: r, ry: -1, ax: 1, ay: 0, closing, change });
  }
  for (let i = 0; i < rows.stops; i++) {
    const rx = rows.stopRow[i];
    const ry = rx + 1;
    if (!active[rx] || !active[ry]) continue;
    const ax = rows.stopX[i];
    const ay = rows.stopY[i];
    const closing = ax * before(rx) + ay * before(ry);
    if (closing <= 0) continue;
    const change = -restitution * closing - (ax * after(rx) + ay * after(ry));
    rhs[system[rx]] = ax * change;
    rhs[system[ry]] = ay * change;
    impacts.push({ rx, ry, ax, ay, closing, change });
  }
  if (impacts.length === 0) return 0;

  // Rigid: an impact is over before a compliance could give.
  const s = structure_for(rows, w, system, m);
  assemble(state, s, false);
  solve(s.analysis, rhs.length === m ? rhs : rhs.subarray(0, m));

  // The impulse each impact took for the change it asked, which is the mass it met.
  let lost = 0;
  for (const { rx, ry, ax, ay, closing, change } of impacts) {
    if (change === 0) continue;
    const impulse = ax * rhs[system[rx]] + (ry >= 0 ? ay * rhs[system[ry]] : 0);
    const mass = Math.abs(impulse / change);
    lost += 0.5 * (1 - restitution * restitution) * mass * closing * closing;
  }

  for (let r = 0; r < rows.count; r++) {
    if (!active[r]) continue;
    const dl = rhs[system[r]];
    if (dl === 0) continue;
    for (let j = 0; j < rows.width[r]; j++) {
      const at = r * MAX_WIDTH + j;
      const v = rows.vars[at];
      const step = w[v] * rows.grads[at] * dl;
      if (step === 0) continue;
      if (v >= twoCount) nodes.vAngle[v - twoCount] += step;
      else if ((v & 1) === 0) nodes.vx[v >> 1] += step;
      else nodes.vy[v >> 1] += step;
    }
  }
  return lost;
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
