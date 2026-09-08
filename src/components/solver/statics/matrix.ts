/** Row-major dense matrix, sized for what an equilibrium assembly produces — a few dozen to a
 * few hundred rows either way. */
export interface Matrix {
  rows: number;
  cols: number;
  /** `rows × cols`, row-major: entry `(i, j)` is at `i * cols + j`. */
  data: Float64Array;
}

export function zeros(rows: number, cols: number): Matrix {
  return { rows, cols, data: new Float64Array(rows * cols) };
}

export function at(m: Matrix, i: number, j: number): number {
  return m.data[i * m.cols + j];
}

export function add_at(m: Matrix, i: number, j: number, value: number): void {
  m.data[i * m.cols + j] += value;
}
