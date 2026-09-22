import { describe, expect, it } from "vitest";
import { Matrix, add_at, zeros } from "./matrix";
import { minimise_energy, solve_least_squares } from "./least-squares";

function matrix(rows: number[][]): Matrix {
  const m = zeros(rows.length, rows[0].length);
  rows.forEach((row, i) => row.forEach((value, j) => add_at(m, i, j, value)));
  return m;
}

const arr = (v: Float64Array) => [...v];

describe("rang", () => {
  it("compte une matrice déficiente", () => {
    // Third column is the sum of the first two: rank 2 out of 3.
    const solved = solve_least_squares(
      matrix([
        [1, 0, 1],
        [0, 1, 1],
        [2, 1, 3],
        [1, 1, 2],
      ]),
      Float64Array.from([1, 1, 1, 1]),
    );
    expect(solved.rank).toBe(2);
    expect(solved.nullSpace).toHaveLength(1);
  });

  it("tient sur une matrice mal conditionnée et redondante", () => {
    // Rows spanning nine orders of magnitude — newtons against newton-metres, exactly what an equilibrium assembly mixes — with three columns that are exact combinations of the others.
    // A decomposition that gives up early here reports a rank too HIGH, which reads as "isostatic" on a structure that is not: the one error a redundancy count must not make.
    const base = [
      [1e6, 3e5, -2e6, 7e5],
      [-4e5, 9e5, 1e6, -3e5],
      [2e-3, -5e-3, 8e-3, 1e-3],
      [7e-4, 2e-3, -1e-3, 4e-3],
      [5e2, -8e2, 3e2, 9e2],
      [-1e3, 4e2, 6e2, -2e2],
    ];
    const rows = base.map((row) => [
      ...row,
      row[0] + row[1],
      row[2] - 3 * row[3],
      2 * row[0] - row[2] + 0.5 * row[1],
    ]);
    const solved = solve_least_squares(matrix(rows), Float64Array.from(rows.map(() => 1)));
    expect(solved.rank).toBe(4);
    expect(solved.nullSpace).toHaveLength(3);
    // And they really are null directions, not just leftovers of the count.
    for (const n of solved.nullSpace)
      for (const row of rows)
        expect(Math.abs(row.reduce((s, v, j) => s + v * n[j], 0))).toBeLessThan(1e-6);
  });

  it("ne confond pas une direction faible avec une direction absente", () => {
    // Nine orders between the two, and both are real: calling the second absent would report a free mode a stiff mechanism does not have.
    // The cut sits at `max(m, n)·1e-11` of the leading entry — anything below that is dust on a matrix whose entries are lever arms in metres and unit coefficients, never a constraint.
    const solved = solve_least_squares(
      matrix([
        [1e6, 0],
        [0, 1e-3],
      ]),
      Float64Array.from([1, 1]),
    );
    expect(solved.rank).toBe(2);
    expect(solved.nullSpace).toHaveLength(0);
    expect(arr(solved.x)[1]).toBeCloseTo(1e3, 6);
  });
});

describe("moindres carrés", () => {
  it("résout un système carré inversible exactement", () => {
    const solved = solve_least_squares(
      matrix([
        [2, 1],
        [1, 3],
      ]),
      Float64Array.from([5, 10]),
    );
    expect(arr(solved.x)[0]).toBeCloseTo(1, 10);
    expect(arr(solved.x)[1]).toBeCloseTo(3, 10);
    expect(solved.residual).toBeLessThan(1e-10);
  });

  it("rend le résidu d'un système sur-déterminé incompatible", () => {
    // x = 0 and x = 2 at once: the least-squares answer is 1, and the residual says by how much the equations disagree rather than pretending they do not.
    const solved = solve_least_squares(matrix([[1], [1]]), Float64Array.from([0, 2]));
    expect(arr(solved.x)[0]).toBeCloseTo(1, 10);
    expect(solved.residual).toBeCloseTo(Math.SQRT2, 10);
  });

  it("rend la solution de norme minimale d'un système sous-déterminé", () => {
    // x + y = 4: a whole line of solutions, and the minimum-norm one is (2, 2).
    const solved = solve_least_squares(matrix([[1, 1]]), Float64Array.from([4]));
    expect(solved.rank).toBe(1);
    expect(solved.nullSpace).toHaveLength(1);
    expect(arr(solved.x)[0]).toBeCloseTo(2, 10);
    expect(arr(solved.x)[1]).toBeCloseTo(2, 10);
    const n = solved.nullSpace[0];
    expect(n[0] + n[1]).toBeCloseTo(0, 10);
  });

  it("résout aussi avec plus d'inconnues que d'équations", () => {
    // The hyperstatic shape: three unknowns, two equations, one direction left free.
    const solved = solve_least_squares(
      matrix([
        [1, 1, 0],
        [0, 1, 1],
      ]),
      Float64Array.from([2, 2]),
    );
    expect(solved.rank).toBe(2);
    expect(solved.nullSpace).toHaveLength(1);
    expect(solved.residual).toBeLessThan(1e-10);
  });
});

describe("énergie complémentaire minimale", () => {
  it("ne touche pas à la solution quand il n'y a rien à choisir", () => {
    const solved = solve_least_squares(
      matrix([
        [2, 1],
        [1, 3],
      ]),
      Float64Array.from([5, 10]),
    );
    const chosen = minimise_energy(solved.x, solved.nullSpace, () => {
      throw new Error("F ne doit jamais être consultée sur un système déterminé");
    });
    expect(arr(chosen.x)).toEqual(arr(solved.x));
  });

  it("répartit selon les souplesses, pas selon la norme", () => {
    // Two members sharing one load: `x₀ + x₁ = 4`.
    // Minimum norm splits it 2/2 whatever the members are made of; minimum energy splits it in inverse proportion to flexibility — the stiff member takes the larger share, which is the physics the norm cannot know.
    const solved = solve_least_squares(matrix([[1, 1]]), Float64Array.from([4]));
    expect(arr(solved.x)[0]).toBeCloseTo(2, 10);

    const flexibility = [1, 3]; // second member three times more flexible
    const chosen = minimise_energy(solved.x, solved.nullSpace, (x: Float64Array) =>
      Float64Array.from(x, (value: number, i: number) => flexibility[i] * value),
    );
    // ½(f₀x₀² + f₁x₁²) under x₀ + x₁ = 4 is least at x₀/x₁ = f₁/f₀ = 3.
    expect(arr(chosen.x)[0]).toBeCloseTo(3, 10);
    expect(arr(chosen.x)[1]).toBeCloseTo(1, 10);
    expect(arr(chosen.x)[0] + arr(chosen.x)[1]).toBeCloseTo(4, 10);
  });

  it("porte le terme linéaire, que le poids propre rend non nul", () => {
    // `½f·x² + g·x` over the same line: the optimum moves to where the gradient vanishes, and ignoring `g` would answer as though every member were unloaded.
    const solved = solve_least_squares(matrix([[1, 1]]), Float64Array.from([0]));
    const chosen = minimise_energy(
      solved.x,
      solved.nullSpace,
      (x: Float64Array) => Float64Array.from(x),
      Float64Array.from([2, 0]),
    );
    // ½(x₀² + x₁²) + 2x₀ under x₀ + x₁ = 0 is least at x₀ = −1, x₁ = +1.
    expect(arr(chosen.x)[0]).toBeCloseTo(-1, 10);
    expect(arr(chosen.x)[1]).toBeCloseTo(1, 10);
  });

  it("laisse ouverte une redondance qu'aucune souplesse n'atteint, même bruitée", () => {
    // `x₂` is free and no member feels it — a belt's pretension between rigid supports — but rounding leaves it a trace of energy.
    // Stepping by rounding over rounding would throw it millions of newtons away; it must stay where equilibrium left it, and be reported open.
    const solved = solve_least_squares(
      matrix([
        [1, 1, 0],
        [1, -1, 0],
      ]),
      Float64Array.from([4, 0]),
    );
    const flexibility = [1, 1, 1e-25];
    const chosen = minimise_energy(
      solved.x,
      solved.nullSpace,
      (x: Float64Array) => Float64Array.from(x, (value: number, i: number) => flexibility[i] * value),
      Float64Array.from([0, 0, 1e-18]),
      1,
    );
    expect(arr(chosen.x)[2]).toBeCloseTo(0, 10);
    expect(chosen.residualNull).toHaveLength(1);
  });
});
