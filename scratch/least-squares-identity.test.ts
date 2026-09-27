// Throwaway: the column-major QR must give bit-identical answers to the original.
import { describe, expect, it } from "vitest";
import { solve_least_squares as before } from "./least-squares.orig";
import { solve_least_squares as after } from "../src/components/solver/statics/least-squares";

let seed = 12345;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648) * 2 - 1;

function matrix(m: number, n: number, rank: number) {
  // A product of an m×rank and a rank×n factor, sparse like an assembly, so the rank is known.
  const u = Array.from({ length: m * rank }, () => (Math.random() < 0.3 ? rand() : 0));
  const v = Array.from({ length: rank * n }, () => (Math.random() < 0.3 ? rand() * 100 : 0));
  const data = new Float64Array(m * n);
  for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) { let s = 0; for (let k = 0; k < rank; k++) s += u[i * rank + k] * v[k * n + j]; data[i * n + j] = s; }
  return { rows: m, cols: n, data };
}

describe("least squares identity", () => {
  it("same bits", () => {
    let cases = 0;
    for (const [m, n] of [[5, 5], [30, 20], [20, 30], [120, 110], [200, 230], [60, 60]])
      for (const rank of [Math.min(m, n), Math.min(m, n) - 3, Math.floor(Math.min(m, n) / 2)])
        for (let rep = 0; rep < 3; rep++) {
          const a = matrix(m, n, Math.max(1, rank));
          const b = Float64Array.from({ length: m }, rand);
          const x = before(a, b), y = after(a, b);
          expect(y.rank).toBe(x.rank);
          expect(Array.from(y.x)).toEqual(Array.from(x.x));
          expect(y.nullSpace.map((v) => Array.from(v))).toEqual(x.nullSpace.map((v) => Array.from(v)));
          expect(y.residual).toBe(x.residual);
          cases++;
        }
    expect(cases).toBe(54);
    // Speed, alternating the two in one process.
    const a = matrix(220, 240, 200), b = Float64Array.from({ length: 220 }, rand);
    const tb: number[] = [], ta: number[] = [];
    for (let r = 0; r < 9; r++) {
      let t = performance.now(); for (let k = 0; k < 5; k++) before(a, b); tb.push(performance.now() - t);
      t = performance.now(); for (let k = 0; k < 5; k++) after(a, b); ta.push(performance.now() - t);
    }
    require("node:fs").writeFileSync("C:/Users/arnol/Documents/slidep/scratch/least-squares-speed.txt", `220x240: before min ${(Math.min(...tb) / 5).toFixed(2)} ms, after min ${(Math.min(...ta) / 5).toFixed(2)} ms`);
  }, 600_000);
});
