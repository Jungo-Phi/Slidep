import { Matrix, add_at, zeros } from "./matrix";

/**
 * Least squares with a rank, a null space and a residual, by complete orthogonal decomposition — see docs/plan-efforts-interieurs.md phase 10.
 *
 * The statics pass needs the RANK and the NULL SPACE as much as the solution: the first is the isostatic/hyperstatic distinction, the second is the family a hyperstatic structure has to choose within.
 * That rules out a plain normal-equation solve — `AᵀA` squares an already poor condition number (an assembly mixes newtons with newton-metres) and cannot tell a rank-deficient system from a well-conditioned one at all.
 *
 * `A·Π = Q·[T 0; 0 0]·Zᵀ` with `T` upper triangular and non-singular, `r × r`.
 * Two stages: a Householder QR with column pivoting, which reveals the rank, then reflections from the RIGHT that push the remaining `R12` block into `T` — LAPACK's `xTZRZF`.
 * Everything the statics pass needs falls out of it:
 *
 * - **rank** from the diagonal of `T`;
 * - **minimum-norm least squares** by one triangular back-substitution;
 * - **the null space**, as the last `n − r` columns of `Π·Z`.
 *
 * Column pivoting is what makes the rank meaningful and not just an artefact of the column order: each step takes the column with the largest remaining norm, so the diagonal of `R` decays and the break in it is where the rank sits.
 */

export interface LeastSquares {
  /** The minimum-norm least-squares solution. Unique when `nullSpace` is empty; otherwise ONE
   * member of the family, and an arbitrary one — a starting point for `minimise_energy`, never an answer on its own. */
  x: Float64Array;
  /** Basis of `ker(A)`: `x + Σ zᵢ·nullSpace[i]` solves the system just as well. Its length is
   * the degree of static indeterminacy. */
  nullSpace: Float64Array[];
  rank: number;
  /** `‖A·x − b‖`. Non-zero means the equations themselves do not agree — on an equilibrium
   * assembly, that the frame handed in is not in equilibrium, not that the solve failed. */
  residual: number;
}

/** A Householder reflection `I − τ·w·wᵀ` with `w = (1, v)`, stored by its tail alone. */
interface Reflector {
  v: Float64Array;
  tau: number;
}

/**
 * The reflection sending `u` to `(β, 0, …, 0)`, `u` given as its head and as a tail of `len` entries read from `data` at `start`, `stride` apart.
 *
 * `β = −sign(head)·‖u‖` and never `+`: the other root makes `head − β` cancel when `head` is already nearly aligned, which is the common case here since pivoting puts the largest entry first every time.
 */
function reflector(
  head: number,
  data: Float64Array,
  start: number,
  stride: number,
  len: number,
): { r: Reflector; beta: number } {
  let tailNorm = 0;
  for (let i = 0; i < len; i++) {
    const value = data[start + i * stride];
    tailNorm += value * value;
  }
  if (tailNorm === 0) return { r: { v: new Float64Array(len), tau: 0 }, beta: head };

  const beta = -Math.sign(head || 1) * Math.sqrt(head * head + tailNorm);
  const v = new Float64Array(len);
  for (let i = 0; i < len; i++) v[i] = data[start + i * stride] / (head - beta);
  return { r: { v, tau: (beta - head) / beta }, beta };
}

/** Apply `I − τ·w·wᵀ` in place to the vector whose head is `data[head]` and whose tail starts at `data[start]`, `stride` apart. */
function reflect(
  r: Reflector,
  data: Float64Array,
  head: number,
  start: number,
  stride: number,
): void {
  if (r.tau === 0) return;
  const v = r.v;
  let s = data[head];
  for (let i = 0; i < v.length; i++) s += v[i] * data[start + i * stride];
  const scaled = r.tau * s;
  data[head] -= scaled;
  for (let i = 0; i < v.length; i++) data[start + i * stride] -= scaled * v[i];
}

/**
 * {@link reflect} down a column (stride 1), reading and writing only the rows where `v` is non-zero, listed in `nz`.
 * The rows it skips would each add or subtract an exact zero, so the result is the same to the bit; an equilibrium matrix has a handful of entries per column, and this is what keeps its QR from costing a dense one.
 */
function reflect_sparse(
  r: Reflector,
  nz: Int32Array,
  count: number,
  data: Float64Array,
  head: number,
  start: number,
): void {
  if (r.tau === 0) return;
  const v = r.v;
  let s = data[head];
  for (let q = 0; q < count; q++) s += v[nz[q]] * data[start + nz[q]];
  if (s === 0) return;
  const scaled = r.tau * s;
  data[head] -= scaled;
  for (let q = 0; q < count; q++) data[start + nz[q]] -= scaled * v[nz[q]];
}

/** Below this fraction of the leading diagonal entry, a pivot is numerical dust — the same
 * `max(m, n) · eps` shape `dense.ts` uses on singular values, so the two agree on where the rank breaks. */
const RANK_EPSILON = 1e-11;

/** Recompute a downdated column norm once it has lost this much of its original size. The
 * cheap downdate loses all its digits when a column nearly collapses, and pivoting on a wrong norm is what makes a rank-revealing QR stop revealing the rank. */
const DOWNDATE_GUARD = 1e-8;

/**
 * Works on a column-major copy of `a`: every reflection of the QR stage runs down a column, which then reads contiguous memory.
 * The statics run this at every recorded instant of a simulation, where the matrix has a few hundred rows.
 */
export function solve_least_squares(a: Matrix, b: Float64Array): LeastSquares {
  const m = a.rows;
  const n = a.cols;
  // Column-major `m × n`: entry `(i, j)` at `j * m + i`, overwritten in place.
  const c = new Float64Array(m * n);
  for (let i = 0; i < m; i++)
    for (let j = 0; j < n; j++) c[j * m + i] = a.data[i * n + j];

  const perm = new Int32Array(n);
  for (let j = 0; j < n; j++) perm[j] = j;
  const qb = Float64Array.from(b);

  const norms = new Float64Array(n);
  const original = new Float64Array(n);
  for (let j = 0; j < n; j++) {
    let s = 0;
    for (let i = 0; i < m; i++) s += c[j * m + i] * c[j * m + i];
    norms[j] = Math.sqrt(s);
    original[j] = norms[j];
  }

  const steps = Math.min(m, n);
  const nz = new Int32Array(m);
  for (let k = 0; k < steps; k++) {
    let best = k;
    for (let j = k + 1; j < n; j++) if (norms[j] > norms[best]) best = j;
    if (best !== k) {
      for (let i = 0; i < m; i++) {
        const swap = c[k * m + i];
        c[k * m + i] = c[best * m + i];
        c[best * m + i] = swap;
      }
      [perm[k], perm[best]] = [perm[best], perm[k]];
      [norms[k], norms[best]] = [norms[best], norms[k]];
      [original[k], original[best]] = [original[best], original[k]];
    }

    const { r: reflection, beta } = reflector(c[k * m + k], c, k * m + k + 1, 1, m - k - 1);

    c[k * m + k] = beta;
    for (let i = k + 1; i < m; i++) c[k * m + i] = 0;
    let count = 0;
    for (let i = 0; i < reflection.v.length; i++) if (reflection.v[i] !== 0) nz[count++] = i;
    for (let j = k + 1; j < n; j++) reflect_sparse(reflection, nz, count, c, j * m + k, j * m + k + 1);
    reflect_sparse(reflection, nz, count, qb, k, k + 1);

    for (let j = k + 1; j < n; j++) {
      if (norms[j] === 0) continue;
      const ratio = Math.abs(c[j * m + k]) / norms[j];
      const downdated = 1 - ratio * ratio;
      norms[j] = downdated > 0 ? norms[j] * Math.sqrt(downdated) : 0;
      if (norms[j] < DOWNDATE_GUARD * original[j]) {
        let s = 0;
        for (let i = k + 1; i < m; i++) s += c[j * m + i] * c[j * m + i];
        norms[j] = Math.sqrt(s);
        original[j] = norms[j];
      }
    }
  }

  const leading = Math.abs(c[0]);
  const tolerance = leading * Math.max(m, n) * RANK_EPSILON;
  let rank = 0;
  while (rank < steps && Math.abs(c[rank * m + rank]) > tolerance) rank++;

  // ── Push `R12` into `T`, one right reflection per row, bottom up ──
  const rights: { row: number; reflection: Reflector }[] = [];
  for (let k = rank - 1; k >= 0; k--) {
    const { r: reflection, beta } = reflector(c[k * m + k], c, rank * m + k, m, n - rank);
    rights.push({ row: k, reflection });
    c[k * m + k] = beta;
    for (let j = rank; j < n; j++) c[j * m + k] = 0;
    // The rows above share those columns and have to follow.
    for (let i = 0; i < k; i++) reflect(reflection, c, k * m + i, rank * m + i, m);
  }

  /** `Π·Z·y`, the map from the decomposition's own coordinates back to the unknowns. */
  const to_unknowns = (y: Float64Array): Float64Array => {
    const z = Float64Array.from(y);
    // Reflections applied in reverse of how they were built.
    for (let i = rights.length - 1; i >= 0; i--) {
      const { row, reflection } = rights[i];
      reflect(reflection, z, row, rank, 1);
    }
    const x = new Float64Array(n);
    for (let j = 0; j < n; j++) x[perm[j]] = z[j];
    return x;
  };

  // `T·y = (Qᵀb)_{1..r}`, back substitution on the triangle the reduction left behind.
  const y = new Float64Array(n);
  for (let i = rank - 1; i >= 0; i--) {
    let s = qb[i];
    for (let j = i + 1; j < rank; j++) s -= c[j * m + i] * y[j];
    y[i] = s / c[i * m + i];
  }
  const x = to_unknowns(y);

  const nullSpace: Float64Array[] = [];
  for (let k = rank; k < n; k++) {
    const e = new Float64Array(n);
    e[k] = 1;
    nullSpace.push(to_unknowns(e));
  }

  let residual = 0;
  for (let i = 0; i < m; i++) {
    let row = 0;
    for (let j = 0; j < n; j++) row += a.data[i * n + j] * x[j];
    residual += (row - b[i]) * (row - b[i]);
  }
  return { x, nullSpace, rank, residual: Math.sqrt(residual) };
}

/** The complementary energy `½·xᵀ·F·x + gᵀ·x` of a set of unknowns, as the caller's own
 * quadratic form.
 * `linear` is not decoration: a member carrying its own weight has internal forces that do not vanish with `x`, so `g` is non-zero on essentially every real beam. */
export interface Flexibility {
  applyF: (x: Float64Array) => Float64Array;
  linear: Float64Array;
  /** `F`'s largest diagonal entry: what an energy along a redundancy is compared against to tell a real one from rounding. */
  scale: number;
}

/** What minimising the complementary energy settles, and what it leaves open. */
export interface EnergyMinimum {
  /** The member of the family that stores the least energy. */
  x: Float64Array;
  /**
   * The directions the energy does not choose between either, in the unknowns' own coordinates and orthonormal like `LeastSquares.nullSpace`.
   *
   * Empty whenever `F` is positive-definite over `ker(A)`, which a redundancy between beams always is — moving one changes some member's `N` or `Mf`, hence its energy.
   * What survives here is what no member's flexibility reaches: two supports at one node trading a reaction the structure never feels, or a redundancy carried by a beam with no usable section.
   * A caller reporting which quantities its answer actually pins should read THIS and not `ker(A)`, which only says what equilibrium alone pins.
   */
  residualNull: Float64Array[];
}

/**
 * Pick the member of the solution family that stores the least elastic energy — Menabrea's theorem, and the whole reason the hyperstatic case has an answer at all.
 *
 * Supplied as a form to apply rather than a matrix, so this stays free of any beam model.
 * Minimising `½xᵀFx + gᵀx` over `x₀ + N·z` gives `(NᵀFN)·z = −Nᵀ(F·x₀ + g)`, an `h × h` symmetric system with `h` the degree of indeterminacy — small, since `h` is a handful even on a heavily redundant structure.
 *
 * Returns `x₀` unchanged when there is nothing to choose (`h = 0`): the isostatic answer does not depend on `F`, and must not.
 */
export function minimise_energy(
  base: Float64Array,
  nullSpace: Float64Array[],
  applyF: (x: Float64Array) => Float64Array,
  linear?: Float64Array,
  /** See `Flexibility.scale`. */
  scale?: number,
): EnergyMinimum {
  const h = nullSpace.length;
  if (h === 0) return { x: base, residualNull: [] };

  const fn = nullSpace.map(applyF);
  const m = zeros(h, h);
  const rhs = new Float64Array(h);
  const fBase = applyF(base);
  for (let i = 0; i < h; i++) {
    for (let j = 0; j < h; j++) {
      let s = 0;
      for (let k = 0; k < base.length; k++) s += nullSpace[i][k] * fn[j][k];
      add_at(m, i, j, s);
    }
    let r = 0;
    for (let k = 0; k < base.length; k++)
      r += nullSpace[i][k] * (fBase[k] + (linear ? linear[k] : 0));
    rhs[i] = -r;
  }

  // When no redundancy reaches any member, `NᵀFN` is rounding alone — and the rank test, being relative to its own leading entry, would take that for a real stiffness and step by rounding over rounding.
  // Measured against `F` itself, it is recognised for what it is and every direction stays open.
  let leading = 0;
  for (let i = 0; i < h; i++) leading = Math.max(leading, Math.abs(m.data[i * h + i]));
  if (scale !== undefined && leading <= scale * base.length * RANK_EPSILON)
    return { x: base, residualNull: nullSpace };

  // `NᵀFN` is symmetric positive semi-definite; least squares covers the semi-definite case (a redundancy no member's flexibility reaches) without a special path.
  const energy = solve_least_squares(m, rhs);
  const combine = (weights: Float64Array): Float64Array => {
    const out = new Float64Array(base.length);
    for (let i = 0; i < h; i++)
      for (let k = 0; k < out.length; k++) out[k] += weights[i] * nullSpace[i][k];
    return out;
  };

  const x = Float64Array.from(base);
  const step = combine(energy.x);
  for (let k = 0; k < x.length; k++) x[k] += step[k];
  return { x, residualNull: energy.nullSpace.map(combine) };
}
