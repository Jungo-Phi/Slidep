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
  /** `values[pairAt[p]] += grads[pairA[p]] · pairW[p] · grads[pairB[p]]`. */
  pairA: Int32Array;
  pairB: Int32Array;
  pairAt: Int32Array;
  pairW: Float64Array;
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
  rhs: Float64Array;
  iterations: number;
}

export function create_direct_state(nodes: SolveNodes, links: Link[], drives: ResolvedDrive[]): DirectState {
  const unknowns = 2 * nodes.count + nodes.angle.length;
  const w = new Float64Array(unknowns);
  for (let n = 0; n < nodes.count; n++) w[2 * n] = w[2 * n + 1] = nodes.w[n];
  for (let a = 0; a < nodes.angle.length; a++) w[2 * nodes.count + a] = nodes.wAngle[a];
  return {
    rows: new Rows(),
    drives,
    lambda: new Float64Array(links.length * ROWS_PER_LINK),
    w,
    system: new Int32Array(0),
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
  // Entries of every unknown, by the system rows they sit in.
  const byUnknown = new Map<number, number[]>();
  for (let r = 0; r < rows.count; r++) {
    if (system[r] < 0) continue;
    for (let j = 0; j < rows.width[r]; j++) {
      const at = r * MAX_WIDTH + j;
      const v = rows.vars[at];
      if (w[v] === 0) continue;
      let list = byUnknown.get(v);
      if (!list) byUnknown.set(v, (list = []));
      list.push(at);
    }
  }
  const rowOfEntry = (at: number) => system[Math.floor(at / MAX_WIDTH)];

  // Pattern: two system rows are coupled when they share a movable unknown.
  const neighbours: Set<number>[] = Array.from({ length: m }, (_, i) => new Set([i]));
  for (const list of byUnknown.values())
    for (const a of list) for (const b of list) neighbours[rowOfEntry(a)].add(rowOfEntry(b));
  const colStart = new Int32Array(m + 1);
  const sortedColumns = neighbours.map((set) => [...set].sort((p, q) => p - q));
  for (let j = 0; j < m; j++) colStart[j + 1] = colStart[j] + sortedColumns[j].length;
  const rowIndex = new Int32Array(colStart[m]);
  const position = new Map<number, number>();
  for (let j = 0; j < m; j++)
    sortedColumns[j].forEach((i, q) => {
      rowIndex[colStart[j] + q] = i;
      position.set(j * m + i, colStart[j] + q);
    });

  const pairA: number[] = [];
  const pairB: number[] = [];
  const pairAt: number[] = [];
  const pairW: number[] = [];
  for (const [v, list] of byUnknown)
    for (const a of list)
      for (const b of list) {
        pairA.push(a);
        pairB.push(b);
        pairAt.push(position.get(rowOfEntry(b) * m + rowOfEntry(a))!);
        pairW.push(w[v]);
      }
  const diagonal = new Int32Array(m);
  for (let i = 0; i < m; i++) diagonal[i] = position.get(i * m + i)!;

  return {
    signature,
    analysis: analyse({ n: m, colStart, rowIndex }),
    pairA: Int32Array.from(pairA),
    pairB: Int32Array.from(pairB),
    pairAt: Int32Array.from(pairAt),
    pairW: Float64Array.from(pairW),
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

/** The worst row residual, in metres, among the rows in the system; the rows are evaluated at the current nodes. */
function worst_residual(state: DirectState): number {
  const { rows, system } = state;
  let worst = 0;
  for (let r = 0; r < rows.count; r++) {
    if (system[r] < 0) continue;
    const residual = Math.abs(residual_of(state, r)) * rows.scale[r];
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
    if (state.system.length < rows.count) state.system = new Int32Array(rows.count);
    let m = 0;
    for (let r = 0; r < rows.count; r++) {
      const link = rows.link[r];
      if (link < 0 && saturated(drives[-1 - link])) {
        state.system[r] = -1;
        continue;
      }
      let movable = false;
      for (let j = 0; j < rows.width[r] && !movable; j++) {
        const at = r * MAX_WIDTH + j;
        movable = w[rows.vars[at]] !== 0 && rows.grads[at] !== 0;
      }
      state.system[r] = movable ? m++ : -1;
    }
    worst = worst_residual(state);
    if (worst < tolerance || it === maxIterations || m === 0) break;

    const s = structure_for(rows, w, state.system, m);
    const values = s.values;
    values.fill(0);
    const grads = rows.grads;
    for (let p = 0; p < s.pairA.length; p++) values[s.pairAt[p]] += grads[s.pairA[p]] * s.pairW[p] * grads[s.pairB[p]];
    let largest = 0;
    for (let r = 0; r < rows.count; r++) {
      const i = state.system[r];
      if (i < 0) continue;
      values[s.diagonal[i]] += rows.alphaTilde[r];
      if (values[s.diagonal[i]] > largest) largest = values[s.diagonal[i]];
    }
    if (state.rhs.length < m) state.rhs = new Float64Array(m);
    const rhs = state.rhs;
    for (let r = 0; r < rows.count; r++) {
      const i = state.system[r];
      if (i >= 0) rhs[i] = -residual_of(state, r);
    }
    factorise(s.analysis, values, largest * PIVOT_FLOOR + Number.MIN_VALUE);
    solve(s.analysis, rhs.length === m ? rhs : rhs.subarray(0, m));

    // A motor asked for more than its torque saturates, and this step is not taken: the others' share was solved for a motor that gives everything, and taking it would carry the mechanism along as if it had.
    // Only the saturating motors' impulse, cut at their limit, is applied; the next iteration solves the rest with them out of the system.
    let saturating = false;
    for (let r = 0; r < rows.count; r++) {
      const i = state.system[r];
      const link = rows.link[r];
      if (i < 0 || link >= 0) continue;
      const d = drives[-1 - link];
      if (Math.abs(d.lambda + rhs[i]) > d.bound) saturating = true;
    }

    // x += W·Jᵀ·Δλ, λ += Δλ.
    const twoCount = 2 * nodes.count;
    for (let r = 0; r < rows.count; r++) {
      const i = state.system[r];
      if (i < 0) continue;
      let dl = rhs[i];
      const link = rows.link[r];
      if (link < 0) {
        const d = drives[-1 - link];
        const next = Math.max(-d.bound, Math.min(d.bound, d.lambda + dl));
        if (saturating && next === d.lambda + dl) continue;
        dl = next - d.lambda;
        d.lambda = next;
      } else if (saturating) continue;
      else lambda[rows.slot[r]] += dl;
      for (let j = 0; j < rows.width[r]; j++) {
        const at = r * MAX_WIDTH + j;
        const v = rows.vars[at];
        const step = w[v] * grads[at] * dl;
        if (step === 0) continue;
        if (v < twoCount) {
          if ((v & 1) === 0) nodes.x[v >> 1] += step;
          else nodes.y[v >> 1] += step;
        } else nodes.angle[v - twoCount] += step;
      }
    }
    state.iterations++;
  }
  return worst;
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
    const residual = Math.abs(residual_of(state, r)) * rows.scale[r];
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
  accumulators: { dx: Float64Array; dy: Float64Array; dAngle: Float64Array }[],
): void {
  const { rows, lambda, w } = state;
  const twoCount = 2 * nodes.count;
  for (let r = 0; r < rows.count; r++) {
    const k = rows.link[r];
    if (k < 0) continue;
    const s = slots[k];
    const acc = accumulators[k];
    const l = lambda[rows.slot[r]];
    if (l === 0) continue;
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
