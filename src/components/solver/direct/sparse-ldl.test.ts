import { describe, expect, it } from "vitest";
import { SymmetricPattern, analyse, factorise, solve } from "./sparse-ldl";

/** A random sparse symmetric positive-definite matrix, as `B·Bᵀ + shift` with `B` sparse. */
function random_spd(n: number, seed: number, rankDeficit = 0) {
  let s = seed;
  const rand = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648) * 2 - 1;
  const cols = n - rankDeficit;
  const b: number[][] = Array.from({ length: n }, () => Array(cols).fill(0));
  for (let i = 0; i < n; i++) for (let k = 0; k < cols; k++) if (i === k || Math.abs(rand()) < 0.08) b[i][k] = rand();
  const a: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => b[i].reduce((sum, v, k) => sum + v * b[j][k], 0)),
  );
  return a;
}

function pattern_of(a: number[][]): { pattern: SymmetricPattern; values: Float64Array } {
  const n = a.length;
  const colStart = new Int32Array(n + 1);
  const rows: number[] = [];
  const values: number[] = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++)
      if (a[i][j] !== 0) {
        rows.push(i);
        values.push(a[i][j]);
      }
    colStart[j + 1] = rows.length;
  }
  return { pattern: { n, colStart, rowIndex: Int32Array.from(rows) }, values: Float64Array.from(values) };
}

describe("sparse LDLᵀ", () => {
  it("solves a sparse positive-definite system", () => {
    for (const n of [1, 5, 40, 120]) {
      const a = random_spd(n, 7 + n);
      const { pattern, values } = pattern_of(a);
      const analysis = analyse(pattern);
      expect(factorise(analysis, values, 1e-14)).toBe(0);
      const x = Float64Array.from({ length: n }, (_, i) => Math.sin(i + 1));
      const b = Float64Array.from({ length: n }, (_, i) => a[i].reduce((sum, v, j) => sum + v * x[j], 0));
      solve(analysis, b);
      for (let i = 0; i < n; i++) expect(b[i]).toBeCloseTo(x[i], 8);
    }
  });

  it("refactorises new values on the same pattern", () => {
    const a = random_spd(30, 3);
    const { pattern, values } = pattern_of(a);
    const analysis = analyse(pattern);
    factorise(analysis, values, 1e-14);
    const doubled = values.map((v) => 2 * v);
    factorise(analysis, doubled, 1e-14);
    const b = Float64Array.from({ length: 30 }, (_, i) => a[i].reduce((sum, v) => sum + 2 * v, 0));
    solve(analysis, b);
    for (let i = 0; i < 30; i++) expect(b[i]).toBeCloseTo(1, 8);
  });

  it("raises the pivots of a singular matrix instead of dividing by nothing", () => {
    const a = random_spd(20, 11, 3);
    const { pattern, values } = pattern_of(a);
    const analysis = analyse(pattern);
    expect(factorise(analysis, values, 1e-9)).toBeGreaterThan(0);
    const b = Float64Array.from({ length: 20 }, (_, i) => a[i][0]);
    solve(analysis, b);
    for (const v of b) expect(Number.isFinite(v)).toBe(true);
  });
});
