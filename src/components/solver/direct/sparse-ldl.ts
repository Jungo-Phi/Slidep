/**
 * Sparse `LDLᵀ` of a symmetric positive (semi-)definite matrix, for the direct solve's `J·W·Jᵀ + α̃`.
 *
 * The work splits in two, as in Davis' LDL:
 * - `analyse` fixes everything that depends on the sparsity pattern alone: the elimination order, the elimination tree and where each non-zero of `L` goes.
 *   The pattern only changes with the set of active constraints, so this runs rarely.
 * - `factorise` and `solve` redo the arithmetic on new values, as often as the solve iterates.
 *
 * A matrix of constraints on a mechanism is mostly a chain with a few loops: eliminated in minimum-degree order, it fills in very little, which is what makes a direct solve cheaper than a dense one by an order of magnitude or more.
 */

/** The pattern of a symmetric `n × n` matrix: both halves, column by column. */
export interface SymmetricPattern {
  n: number;
  /** `colStart[j] … colStart[j + 1]` index the rows of column `j` in `rowIndex`. */
  colStart: Int32Array;
  rowIndex: Int32Array;
}

/** What `analyse` works out once per pattern, for `factorise` and `solve` to reuse. */
export interface Analysis {
  pattern: SymmetricPattern;
  /** Elimination order: `order[k]` is the original index eliminated `k`-th; `rank` is its inverse. */
  order: Int32Array;
  rank: Int32Array;
  parent: Int32Array;
  /** Column `k` of `L` (in elimination order) is `lRow/lValue[lStart[k] … lStart[k + 1]]`. */
  lStart: Int32Array;
  lRow: Int32Array;
  lValue: Float64Array;
  d: Float64Array;
  // Scratch, sized once.
  y: Float64Array;
  flag: Int32Array;
  stack: Int32Array;
  filled: Int32Array;
}

/**
 * Minimum-degree elimination order on the graph of the pattern; among equal degrees, the lowest index goes first.
 * Plain greedy, on a dense adjacency matrix: the matrices here have a few hundred rows, and the order is computed once per pattern.
 */
export function minimum_degree(pattern: SymmetricPattern): Int32Array {
  const { n, colStart, rowIndex } = pattern;
  const adjacent = new Uint8Array(n * n);
  const degree = new Int32Array(n);
  for (let j = 0; j < n; j++)
    for (let p = colStart[j]; p < colStart[j + 1]; p++) {
      const i = rowIndex[p];
      if (i === j || adjacent[j * n + i]) continue;
      adjacent[j * n + i] = 1;
      degree[j]++;
    }
  const done = new Uint8Array(n);
  const order = new Int32Array(n);
  const neighbours = new Int32Array(n);
  for (let k = 0; k < n; k++) {
    let best = -1;
    for (let j = 0; j < n; j++) if (!done[j] && (best < 0 || degree[j] < degree[best])) best = j;
    order[k] = best;
    done[best] = 1;
    let count = 0;
    for (let a = 0; a < n; a++) if (adjacent[best * n + a]) neighbours[count++] = a;
    // Eliminating a node joins all its neighbours into a clique: that is the fill-in.
    for (let x = 0; x < count; x++) {
      const a = neighbours[x];
      adjacent[a * n + best] = 0;
      degree[a]--;
      for (let y = 0; y < count; y++) {
        const b = neighbours[y];
        if (a === b || adjacent[a * n + b]) continue;
        adjacent[a * n + b] = 1;
        degree[a]++;
      }
    }
    adjacent.fill(0, best * n, best * n + n);
    degree[best] = 0;
  }
  return order;
}

export function analyse(pattern: SymmetricPattern): Analysis {
  const { n, colStart, rowIndex } = pattern;
  const order = minimum_degree(pattern);
  const rank = new Int32Array(n);
  for (let k = 0; k < n; k++) rank[order[k]] = k;

  // Elimination tree and column counts of `L`, walking up the tree from each entry above the diagonal.
  const parent = new Int32Array(n);
  const flag = new Int32Array(n);
  const counts = new Int32Array(n);
  for (let k = 0; k < n; k++) {
    parent[k] = -1;
    flag[k] = k;
    const column = order[k];
    for (let p = colStart[column]; p < colStart[column + 1]; p++) {
      for (let i = rank[rowIndex[p]]; i < k && flag[i] !== k; i = parent[i]) {
        if (parent[i] === -1) parent[i] = k;
        counts[i]++;
        flag[i] = k;
      }
    }
  }
  const lStart = new Int32Array(n + 1);
  for (let k = 0; k < n; k++) lStart[k + 1] = lStart[k] + counts[k];

  return {
    pattern,
    order,
    rank,
    parent,
    lStart,
    lRow: new Int32Array(lStart[n]),
    lValue: new Float64Array(lStart[n]),
    d: new Float64Array(n),
    y: new Float64Array(n),
    flag,
    stack: new Int32Array(n),
    filled: new Int32Array(n),
  };
}

/**
 * Factorise the matrix whose values, laid out as `pattern`, are in `values`.
 * A pivot that falls under `floor` is raised to it: a redundant constraint then takes (almost) no share instead of dividing by nothing.
 * Returns how many pivots had to be raised.
 */
export function factorise(analysis: Analysis, values: Float64Array, floor: number): number {
  const { pattern, order, rank, parent, lStart, lRow, lValue, d, y, flag, stack, filled } = analysis;
  const { n, colStart, rowIndex } = pattern;
  let raised = 0;
  for (let k = 0; k < n; k++) {
    // Row `k` of `L` by a sparse triangular solve, its pattern read off the elimination tree.
    y[k] = 0;
    let top = n;
    flag[k] = k;
    filled[k] = 0;
    const column = order[k];
    for (let p = colStart[column]; p < colStart[column + 1]; p++) {
      let i = rank[rowIndex[p]];
      if (i > k) continue;
      y[i] += values[p];
      let len = 0;
      for (; flag[i] !== k; i = parent[i]) {
        stack[len++] = i;
        flag[i] = k;
      }
      while (len > 0) stack[--top] = stack[--len];
    }
    d[k] = y[k];
    y[k] = 0;
    for (; top < n; top++) {
      const i = stack[top];
      const yi = y[i];
      y[i] = 0;
      const end = lStart[i] + filled[i];
      for (let p = lStart[i]; p < end; p++) y[lRow[p]] -= lValue[p] * yi;
      const l = yi / d[i];
      d[k] -= l * yi;
      lRow[end] = k;
      lValue[end] = l;
      filled[i]++;
    }
    if (!(d[k] > floor)) {
      d[k] = floor;
      raised++;
    }
  }
  return raised;
}

/** Solve `A·x = b` in place, `b` indexed like the original matrix. */
export function solve(analysis: Analysis, b: Float64Array): void {
  const { order, lStart, lRow, lValue, d, y } = analysis;
  const n = order.length;
  for (let k = 0; k < n; k++) y[k] = b[order[k]];
  for (let k = 0; k < n; k++) {
    const v = y[k];
    for (let p = lStart[k]; p < lStart[k + 1]; p++) y[lRow[p]] -= lValue[p] * v;
  }
  for (let k = 0; k < n; k++) y[k] /= d[k];
  for (let k = n - 1; k >= 0; k--) {
    let v = y[k];
    for (let p = lStart[k]; p < lStart[k + 1]; p++) v -= lValue[p] * y[lRow[p]];
    y[k] = v;
  }
  for (let k = 0; k < n; k++) b[order[k]] = y[k];
  y.fill(0);
}
