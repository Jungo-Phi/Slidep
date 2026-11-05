import { Link, Point2 } from "../../../types";
import { Analysis, analyse, factorise, solve } from "../direct/sparse-ldl";
import {
  BeltVia,
  belt_pieces,
  belt_shared_scratch,
  belt_solve_arc,
  belt_solve_pairs,
  nearest_point_on_piece,
} from "../../../utils/belt-path";
import { unwrapArrival } from "../experimental/belt-noslip-q";
import { MIN_SOLVED_RADIUS } from "../nodes";

/**
 * The edition solve, as a CAD sketcher does it: the configuration closest to where the sketch stands that satisfies every hard constraint.
 *
 * "Closest" is a weighted distance — each free position and radius weighs its own displacement (its inertia), and the preferences below add terms of their own.
 * Hard constraints are the links; `MinDistance` is the one inequality among them, and every free radius is held above `radiusFloor`, or above the radius it starts with when that is smaller.
 */
export type Preference =
  /**
   * Pulls `key` to `value`.
   * `exact` holds it there as a hard constraint whenever the sketch allows it, and falls back to `weight` when it does not.
   */
  | { type: "Target"; key: string; value: Point2; weight: number; exact?: boolean }
  /** Keeps `key` at `offset` from `origin`: the inertia of a point measured in its parent's frame. */
  | { type: "Follow"; key: string; origin: string; offset: Point2; weight: number }
  /** Keeps `key3` at the ratio `t` along the segment (`key1`, `key2`): the inertia of a node riding a beam. */
  | { type: "SegmentRatio"; key1: string; key2: string; key3: string; t: number; weight: number }
  /** Keeps the segment (`key1`, `key2`) parallel to `direction`. */
  | { type: "Orientation"; key1: string; key2: string; direction: Point2; weight: number }
  /** Keeps the segment (`key1`, `key2`) at `length`. */
  | { type: "Length"; key1: string; key2: string; length: number; weight: number };

export interface EditionProblem {
  /** Every position, keyed as the links and preferences read them; each key starts where its inertia pulls it back to. */
  positions: Map<string, Point2>;
  radii: Map<string, number>;
  /** Positions and radii the solve may not move. */
  fixedPositions: Set<string>;
  fixedRadii: Set<string>;
  /**
   * Fixed positions and radii the gesture has just set — a typed value — rather than ones left where they were.
   * A constraint reading one is the solve's business even when nothing it reads may move: a value imposed there may well have broken it.
   */
  imposedPositions?: Set<string>;
  imposedRadii?: Set<string>;
  /** Weight of each free position's displacement; a key absent here weighs `defaultInertia`. */
  inertia: Map<string, number>;
  defaultInertia: number;
  /** Weight of each free radius's change; a radius absent from `radiusInertiaOf` weighs `radiusInertia`. */
  radiusInertia: number;
  radiusInertiaOf?: Map<string, number>;
  links: Link[];
  preferences: Preference[];
  radiusFloor: number;
  maxIterations: number;
}

export interface EditionSolution {
  positions: Map<string, Point2>;
  radii: Map<string, number>;
  /**
   * Worst hard-constraint residual left, in the units of each constraint (metres for most, radians for angles).
   * Only the constraints the solve could act on or the gesture imposed a value on count: one between parts left where they were is no business of this solve.
   */
  violation: number;
  /** Whether `violation` is within tolerance. */
  satisfied: boolean;
  /** How far the exact targets were left from their values, 0 when there are none. */
  gap: number;
}

/** Added to every unknown's inertia so that a degree of freedom nothing else weighs still has a definite answer: staying put. */
const REGULARISATION = 1e-9;
/** Regularises the constraint block of the KKT system, so that redundant constraints share their load instead of making it singular. */
const CONSTRAINT_REGULARISATION = 1e-12;
const PIVOT_FLOOR = 1e-15;
/** Fractions of the sketch's extent. */
const STEP_TOLERANCE = 1e-9;
const STILL_TOLERANCE = 1e-12;
const FD_STEP = 1e-7;
const MAX_STEP = 0.5;
/** The smallest fraction of a step the line search tries before taking it anyway. */
const MIN_STEP_SCALE = 1 / 64;
/** The most unknowns a row may read for its second derivatives to be worth evaluating by differences. */
const CURVATURE_WIDTH = 8;
/** Fraction of the sketch's extent above which a solve holding its grab exactly is taken as one that cannot. */
const FEASIBILITY_TOLERANCE = 1e-7;
/** Fraction of the sketch's extent within which a soft grab is taken as one that can be held exactly. */
const REACH_TOLERANCE = 1e-3;
/** A violation still above `STALL_RATIO` of what it was `STALL_WINDOW` iterations ago is taken as one that will not go away. */
const STALL_WINDOW = 3;
const STALL_RATIO = 0.9;
const INITIAL_AUGMENT = 1;
const MAX_AUGMENT = 1e3;
/** The finite-difference step of second derivatives, as a fraction of the extent: wider than the first derivatives', whose step would drown them in round-off. */
const FD_CURVATURE_STEP = 1e-4;

type RowKind = "eq" | "ineq" | "soft";

/** One scalar row: its value, and its gradient over the entries of `values` it reads. */
interface Row {
  kind: RowKind;
  value: number;
  entries: number[];
  grads: number[];
  weight: number;
  /** Index of the inequality it is, to track whether it stays active. */
  ineq: number;
  /** Rank among the rows built at one point, which is the same from one iteration to the next. */
  id: number;
  /**
   * Second derivatives of a hard row, passed to `add` entry pair by entry pair.
   * Weighted by the row's multiplier, they are the curvature the Newton step needs: without it, a constraint pulled hard against (an out-of-reach grab) makes the step overshoot along it.
   */
  curvature?: (add: (a: number, b: number, value: number) => void) => void;
}

export function solve_edition(
  problem: EditionProblem,
  /**
   * Only asks whether the grab can be held exactly: the soft solve, which only matters when it cannot, is skipped.
   * The answer is the solution itself when `satisfied` and its `gap` is nil.
   */
  probe = false,
): EditionSolution {
  if (probe && problem.preferences.some((p) => p.type === "Target" && p.exact)) return run(problem, true);
  // A grab is held exactly when the sketch can follow it, and as close as it can get otherwise.
  // The soft solve runs first: it is the answer when the grab is out of reach, and otherwise lands close enough that holding the grab exactly from there takes a step or two.
  const soft = run(problem, false);
  const extent = sketch_extent(problem.positions);
  let gap = -1;
  for (const pref of problem.preferences) {
    if (pref.type !== "Target" || !pref.exact) continue;
    const at = soft.positions.get(pref.key);
    if (at) gap = Math.max(gap, at.distance_to(pref.value));
  }
  if (gap < 0 || gap > REACH_TOLERANCE * extent) return soft;
  const exact = run(problem, true, soft);
  return exact.satisfied ? exact : soft;
}

/** How far the exact targets of `problem` are from their values in `positions`. */
function target_gap(problem: EditionProblem, positions: Map<string, Point2>): number {
  let gap = 0;
  for (const pref of problem.preferences) {
    if (pref.type !== "Target" || !pref.exact) continue;
    const at = positions.get(pref.key);
    if (at) gap = Math.max(gap, at.distance_to(pref.value));
  }
  return gap;
}

/** A solution, with the state a solve warm-started from it picks up: which inequalities hold, and what each hard row carries. */
interface RunResult extends EditionSolution {
  ineqActive: boolean[];
  multipliers: Map<number, number>;
}

function run(
  problem: EditionProblem,
  exactTargets: boolean,
  /** Where the iterations start from; the inertia still pulls back to `problem`'s own values. */
  start?: RunResult,
): RunResult {
  // Every position takes two entries, every radius one; `unknown` maps an entry to its unknown, -1 when fixed.
  const values: number[] = [];
  const unknown: number[] = [];
  const posEntry = new Map<string, number>();
  const radEntry = new Map<string, number>();
  let unknownCount = 0;
  const reference: number[] = [];
  const inertia: number[] = [];

  for (const [key, p] of problem.positions) {
    posEntry.set(key, values.length);
    const fixed = problem.fixedPositions.has(key);
    const w = (problem.inertia.get(key) ?? problem.defaultInertia) + REGULARISATION;
    for (const v of [p.x, p.y]) {
      unknown.push(fixed ? -1 : unknownCount++);
      values.push(v);
      if (!fixed) {
        reference.push(v);
        inertia.push(w);
      }
    }
  }
  for (const [key, r] of problem.radii) {
    radEntry.set(key, values.length);
    const fixed = problem.fixedRadii.has(key);
    unknown.push(fixed ? -1 : unknownCount++);
    values.push(r);
    if (!fixed) {
      reference.push(r);
      inertia.push((problem.radiusInertiaOf?.get(key) ?? problem.radiusInertia) + REGULARISATION);
    }
  }
  const x = Float64Array.from(values);
  if (start) {
    for (const [key, e] of posEntry) {
      const p = start.positions.get(key);
      if (p && unknown[e] >= 0) {
        x[e] = p.x;
        x[e + 1] = p.y;
      }
    }
    for (const [key, e] of radEntry) {
      const r = start.radii.get(key);
      if (r !== undefined && unknown[e] >= 0) x[e] = r;
    }
  }

  const extent = sketch_extent(problem.positions);
  const fdStep = FD_STEP * extent;

    // Never above the radius a gear already has: a gear drawn small at high zoom is kept, not blown up to the floor.
  const radiusFloors = new Map<number, number>();
  for (const [, e] of radEntry)
    if (unknown[e] >= 0)
      radiusFloors.set(e, Math.max(MIN_SOLVED_RADIUS, Math.min(problem.radiusFloor, values[e])));

  const read = new RowReader(
    x,
    unknown,
    posEntry,
    radEntry,
    fdStep,
    FD_CURVATURE_STEP * extent,
    exactTargets,
    radiusFloors,
  );

  // Inequalities stay active from one iteration to the next until their multiplier says they pull.
  const ineqActive: boolean[] = start ? [...start.ineqActive] : [];
  /** Each hard row's multiplier at the last step, by row id: what its curvature is weighted by at the next. */
  const multipliers = new Map<number, number>(start?.multipliers);

  let analysis: Analysis | null = null;
  let lastPattern: { colStart: Int32Array; rowIndex: Int32Array } | null = null;
  let violation = 0;
  const history: number[] = [];
  // The augmentation a step needed is a good guess for the next, which saves climbing back to it one factorisation at a time.
  let augment = 0;

  /** The step last taken, kept until the next point has been judged against the one it left. */
  let pending: { from: Float64Array; step: Float64Array; scale: number; merit: number; weight: number } | null = null;
  const merit_at = (rows: Row[], weight: number) =>
    merit(rows, weight, x, unknown, reference, inertia);

  for (let iteration = 0; iteration < problem.maxIterations; iteration++) {
    const rows = read.rows(problem);
    while (ineqActive.length < read.ineqCount) ineqActive.push(false);

    // A step that leaves the sketch worse off than it found it went too far along a direction that was only right to first order: it is halved, not taken.
    if (pending) {
      const worse = merit_at(rows, pending.weight) > pending.merit * (1 + 1e-12) + 1e-30;
      if (worse && pending.scale > MIN_STEP_SCALE) {
        pending.scale /= 2;
        for (let e = 0; e < x.length; e++) {
          const u = unknown[e];
          if (u >= 0) x[e] = pending.from[e] + pending.step[u] * pending.scale;
        }
        continue;
      }
      pending = null;
    }

    violation = 0;
    for (const row of rows) {
      violation = Math.max(violation, row_violation(row, unknown));
      if (row.kind === "ineq" && row.value < 0) ineqActive[row.ineq] = true;
    }

    // Holding a grab exactly is only a first attempt: once the violation stops shrinking, the grab is out of reach and the soft solve takes over.
    // The soft solve itself is left to run, since a violation may rise for a while as the sketch swings toward its answer.
    history.push(violation);
    const before = history[history.length - 1 - STALL_WINDOW];
    if (
      exactTargets &&
      before !== undefined &&
      violation > FEASIBILITY_TOLERANCE * extent &&
      violation > STALL_RATIO * before
    )
      break;

    let step: Float64Array | null = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      const hard = rows.filter(
        (row) => row.kind === "eq" || (row.kind === "ineq" && ineqActive[row.ineq]),
      );
      const soft = rows.filter((row) => row.kind === "soft");
      // With the curvature in, the Hessian may be indefinite in directions only the constraints hold — a node with no inertia of its own — which shows as a pivot of the wrong sign.
      // Augmenting it with `ρ·JᵀJ` makes it definite without changing the step; only when that fails is the curvature dropped.
      let curved = multipliers.size > 0;
      augment = augment > INITIAL_AUGMENT ? augment / 10 : 0;
      let system: ReturnType<typeof assemble>;
      for (let tries = 0; ; tries++) {
        system = assemble(unknownCount, x, unknown, reference, inertia, hard, soft, multipliers, curved, curved ? augment : 0);
        if (
          !analysis ||
          !lastPattern ||
          !same(lastPattern.colStart, system.pattern.colStart) ||
          !same(lastPattern.rowIndex, system.pattern.rowIndex)
        ) {
          analysis = analyse(system.pattern);
          lastPattern = system.pattern;
        }
        const raised = factorise(analysis, system.values, PIVOT_FLOOR, system.signs);
        if (raised === 0 || !curved) break;
        if (augment >= MAX_AUGMENT) {
          // Indefinite even on what the constraints leave free: the curvature is no help to this step.
          curved = false;
          augment = 0;
          continue;
        }
        augment = augment === 0 ? INITIAL_AUGMENT : augment * 10;
      }
      solve(analysis!, system.rhs);
      step = system.rhs;
      multipliers.clear();
      hard.forEach((row, r) => multipliers.set(row.id, system.rhs[unknownCount + r]));
      // A multiplier of the wrong sign means the bound pulls rather than pushes: the inequality lets go.
      let released = false;
      hard.forEach((row, r) => {
        if (row.kind === "ineq" && system.rhs[unknownCount + r] > 0) {
          ineqActive[row.ineq] = false;
          released = true;
        }
      });
      if (!released) break;
    }
    if (!step) break;

    let largest = 0;
    for (let i = 0; i < unknownCount; i++) largest = Math.max(largest, Math.abs(step[i]));
    const scale = largest > MAX_STEP * extent ? (MAX_STEP * extent) / largest : 1;
    // The violation is priced above anything a multiplier says it is worth, so that no step trades it for a smaller distance.
    let strongest = 0;
    for (const lambda of multipliers.values()) strongest = Math.max(strongest, Math.abs(lambda));
    const weight = 2 * strongest + 1;
    pending = { from: x.slice(), step: step.slice(0, unknownCount), scale, merit: merit_at(rows, weight), weight };
    for (let e = 0; e < x.length; e++) {
      const u = unknown[e];
      if (u >= 0) x[e] += step[u] * scale;
    }
    // A step that moves nothing is a stationary point: converged, or as close as an unsatisfiable sketch gets, which `violation` then tells apart.
    if (largest * scale < STEP_TOLERANCE * extent) break;
  }

  // Judged once the solve is over, the constraints a typed value reads count too, movable or not.
  // Not during the iterations: a row nothing may move is a constant there, which would only blind the line search and the stall test.
  const imposed: boolean[] = new Array(values.length).fill(false);
  for (const key of problem.imposedPositions ?? []) {
    const e = posEntry.get(key);
    if (e !== undefined) imposed[e] = imposed[e + 1] = true;
  }
  for (const key of problem.imposedRadii ?? []) {
    const e = radEntry.get(key);
    if (e !== undefined) imposed[e] = true;
  }
  violation = 0;
  for (const row of read.rows(problem))
    violation = Math.max(violation, row_violation(row, unknown, imposed));

  // What moved by less than round-off did not move: a sketch that needed nothing is handed back bit for bit, and noise does not build up from one frame to the next.
  for (let e = 0; e < x.length; e++)
    if (Math.abs(x[e] - values[e]) < STILL_TOLERANCE * extent) x[e] = values[e];

  const positions = new Map<string, Point2>();
  for (const [key, e] of posEntry) positions.set(key, new Point2(x[e], x[e + 1]));
  const radii = new Map<string, number>();
  for (const [key, e] of radEntry) radii.set(key, x[e]);
  return {
    positions,
    radii,
    violation,
    satisfied: violation <= FEASIBILITY_TOLERANCE * extent,
    gap: target_gap(problem, positions),
    ineqActive,
    multipliers,
  };
}

/**
 * What a point costs: the weighted distance the solve minimises, plus every hard violation priced at `weight`.
 * Judging steps by it is what keeps a step from overshooting into a worse place.
 */
function merit(
  rows: Row[],
  weight: number,
  x: Float64Array,
  unknown: number[],
  reference: number[],
  inertia: number[],
): number {
  let total = 0;
  for (let e = 0; e < x.length; e++) {
    const u = unknown[e];
    if (u >= 0) total += 0.5 * inertia[u] * (x[e] - reference[u]) ** 2;
  }
  for (const row of rows)
    total += row.kind === "soft" ? 0.5 * row.weight * row.value ** 2 : weight * row_violation(row, unknown);
  return total;
}

/** How far a hard row is from holding, 0 for a soft row and for one that reads nothing the solve may move — nor, given `imposed`, any entry it flags. */
function row_violation(row: Row, unknown: number[], imposed?: boolean[]): number {
  if (row.kind === "soft") return 0;
  if (!row.entries.some((e) => unknown[e] >= 0 || imposed?.[e])) return 0;
  return row.kind === "eq" ? Math.abs(row.value) : Math.max(0, -row.value);
}

export function sketch_extent(positions: Map<string, Point2>): number {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of positions.values()) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const extent = Math.max(maxX - minX, maxY - minY);
  return Number.isFinite(extent) && extent > 1e-9 ? extent : 1;
}

function same(a: Int32Array, b: Int32Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * The KKT system of one Newton step, `[H Jᵀ; J −εI]·[Δ; λ] = [−g; −c]`.
 * `H` is the inertia plus every soft row's `w·∇r∇rᵀ`, plus each hard row's curvature weighted by its last multiplier when `curved`, plus `augment·JᵀJ`; `g` is the gradient of the weighted distance at the current point; `J`, `c` are the hard rows.
 */
function assemble(
  n: number,
  x: Float64Array,
  unknown: number[],
  reference: number[],
  inertia: number[],
  hard: Row[],
  soft: Row[],
  multipliers: Map<number, number>,
  curved: boolean,
  augment: number,
) {
  const size = n + hard.length;
  // Triplets, summed once sorted: far cheaper than a map updated entry by entry.
  const at: number[] = [];
  const val: number[] = [];
  const add = (i: number, j: number, v: number) => {
    at.push(j * size + i);
    val.push(v);
  };
  const rhs = new Float64Array(size);
  const signs = new Int8Array(size).fill(1);

  for (let e = 0; e < x.length; e++) {
    const u = unknown[e];
    if (u < 0) continue;
    add(u, u, inertia[u]);
    rhs[u] = -inertia[u] * (x[e] - reference[u]);
  }
  if (curved)
    for (const row of hard) {
      const lambda = multipliers.get(row.id);
      if (!lambda || !row.curvature) continue;
      row.curvature((a, b, value) => {
        const ua = unknown[a];
        const ub = unknown[b];
        if (ua >= 0 && ub >= 0) add(ua, ub, lambda * value);
      });
    }
  for (const row of soft) {
    const us = row.entries.map((e) => unknown[e]);
    for (let a = 0; a < us.length; a++) {
      if (us[a] < 0) continue;
      rhs[us[a]] -= row.weight * row.value * row.grads[a];
      for (let b = 0; b < us.length; b++)
        if (us[b] >= 0) add(us[a], us[b], row.weight * row.grads[a] * row.grads[b]);
    }
  }
  hard.forEach((row, r) => {
    const i = n + r;
    signs[i] = -1;
    add(i, i, -CONSTRAINT_REGULARISATION);
    // Regularised about the last multiplier rather than about zero, so that the regularisation fades as the multipliers settle and leaves no residual behind.
    rhs[i] = -row.value - CONSTRAINT_REGULARISATION * (multipliers.get(row.id) ?? 0);
    row.entries.forEach((e, a) => {
      const u = unknown[e];
      if (u < 0) return;
      add(i, u, row.grads[a]);
      add(u, i, row.grads[a]);
      if (augment === 0) return;
      rhs[u] -= augment * row.grads[a] * row.value;
      row.entries.forEach((f, b) => {
        if (unknown[f] >= 0) add(u, unknown[f], augment * row.grads[a] * row.grads[b]);
      });
    });
  });

  const order = new Int32Array(at.length);
  for (let k = 0; k < order.length; k++) order[k] = k;
  order.sort((a, b) => at[a] - at[b]);
  const keys: number[] = [];
  const sums: number[] = [];
  for (const k of order) {
    if (keys.length > 0 && keys[keys.length - 1] === at[k]) sums[sums.length - 1] += val[k];
    else {
      keys.push(at[k]);
      sums.push(val[k]);
    }
  }
  const colStart = new Int32Array(size + 1);
  const rowIndex = new Int32Array(keys.length);
  const values = Float64Array.from(sums);
  keys.forEach((key, p) => {
    const j = Math.floor(key / size);
    colStart[j + 1]++;
    rowIndex[p] = key - j * size;
  });
  for (let j = 0; j < size; j++) colStart[j + 1] += colStart[j];
  return { pattern: { n: size, colStart, rowIndex }, values, rhs, signs };
}

/** Builds every row at the current point, reading entries through the keys the links name. */
class RowReader {
  ineqCount = 0;
  private out: Row[] = [];
  private ineq = 0;

  constructor(
    private x: Float64Array,
    private unknown: number[],
    private posEntry: Map<string, number>,
    private radEntry: Map<string, number>,
    private h: number,
    private hCurvature: number,
    private exactTargets: boolean,
    /** The floor of each free radius, by entry. */
    private radiusFloors: Map<number, number>,
  ) {}

  rows(problem: EditionProblem): Row[] {
    this.out = [];
    this.ineq = 0;
    for (const link of problem.links) this.link(link);
    for (const pref of problem.preferences) this.preference(pref);
    for (const [e, floor] of this.radiusFloors) this.emit("ineq", [e], this.x[e] - floor, [1]);
    this.ineqCount = this.ineq;
    return this.out;
  }

  private emit(
    kind: RowKind,
    entries: number[],
    value: number,
    grads: number[],
    weight = 1,
    curvature?: Row["curvature"],
  ) {
    this.out.push({
      kind,
      value,
      entries,
      grads,
      weight,
      ineq: kind === "ineq" ? this.ineq++ : -1,
      id: this.out.length,
      curvature,
    });
  }

  /** Accounts for a row that could not be built at this point, so that every inequality keeps its index from one iteration to the next. */
  private skip(kind: RowKind): void {
    if (kind === "ineq") this.ineq++;
  }

  /** A row whose derivatives are read by central differences on every entry it touches that may move. */
  private numeric(kind: RowKind, all: number[], f: () => number, weight = 1) {
    // Coincident keys share entries: each is perturbed once, its difference already being the whole derivative.
    const entries = [...new Set(all)];
    const value = f();
    if (!Number.isFinite(value)) return this.skip(kind);
    const x = this.x;
    const free = entries.filter((e) => this.unknown[e] >= 0);
    const grads = entries.map((e) => {
      if (this.unknown[e] < 0) return 0;
      const saved = x[e];
      x[e] = saved + this.h;
      const plus = f();
      x[e] = saved - this.h;
      const minus = f();
      x[e] = saved;
      return (plus - minus) / (2 * this.h);
    });
    if (!grads.every(Number.isFinite)) return this.skip(kind);
    const h = this.hCurvature;
    const at = (a: number, sa: number, b: number, sb: number) => {
      const xa = x[a];
      x[a] += sa * h;
      const xb = x[b];
      x[b] += sb * h;
      const v = f();
      x[b] = xb;
      x[a] = xa;
      return v;
    };
    // Evaluated once at this point, however many times the step is assembled again.
    let second: number[] | null = null;
    const curvature: Row["curvature"] = (add) => {
      if (!second) {
        second = [];
        for (let i = 0; i < free.length; i++)
          for (let j = i; j < free.length; j++) {
            const a = free[i];
            const b = free[j];
            const d = (at(a, 1, b, 1) - at(a, 1, b, -1) - at(a, -1, b, 1) + at(a, -1, b, -1)) / (4 * h * h);
            if (Number.isFinite(d) && d !== 0) second.push(a, b, d);
          }
      }
      for (let k = 0; k < second.length; k += 3) {
        add(second[k], second[k + 1], second[k + 2]);
        if (second[k] !== second[k + 1]) add(second[k + 1], second[k], second[k + 2]);
      }
    };
    // Wide rows — a belt reads every pulley — would cost their width squared in evaluations of a long path: they are left to first order.
    this.emit(kind, entries, value, grads, weight, free.length <= CURVATURE_WIDTH ? curvature : undefined);
  }

  private pos(key: string): number | undefined {
    return this.posEntry.get(key);
  }

  private px(e: number) {
    return this.x[e];
  }

  private py(e: number) {
    return this.x[e + 1];
  }

  /** `|b − a| − target` with its exact gradient; coincident points part along `axis`. */
  private distance(kind: RowKind, a: number, b: number, target: number, axis?: Point2, weight = 1, radii: number[] = []) {
    let dx = this.px(b) - this.px(a);
    let dy = this.py(b) - this.py(a);
    let d = Math.hypot(dx, dy);
    let value = d;
    const coincident = d < 1e-12;
    if (coincident) {
      const ax = axis ?? new Point2(1, 0);
      const len = Math.hypot(ax.x, ax.y) || 1;
      dx = ax.x / len;
      dy = ax.y / len;
      d = 1;
      value = 0;
    }
    const ux = dx / d;
    const uy = dy / d;
    let radiusSum = 0;
    for (const e of radii) radiusSum += this.x[e];
    // The Hessian of a length is the projection across its direction, over the length: (I − uuᵀ)/d on each end, negated between them.
    const curvature: Row["curvature"] = coincident
      ? undefined
      : (add) => {
          const m = [(1 - ux * ux) / d, (-ux * uy) / d, (-ux * uy) / d, (1 - uy * uy) / d];
          for (const [p, q, sign] of [
            [a, a, 1],
            [b, b, 1],
            [a, b, -1],
            [b, a, -1],
          ])
            for (let i = 0; i < 2; i++)
              for (let j = 0; j < 2; j++) add(p + i, q + j, sign * m[2 * i + j]);
        };
    this.emit(
      kind,
      [a, a + 1, b, b + 1, ...radii],
      value - target - radiusSum,
      [-ux, -uy, ux, uy, ...radii.map(() => -1)],
      weight,
      curvature,
    );
  }

  private link(link: Link) {
    switch (link.type) {
      case "Distance":
      case "MinDistance": {
        const a = this.pos(link.key1);
        const b = this.pos(link.key2);
        if (a === undefined || b === undefined) return;
        this.distance(
          link.type === "Distance" ? "eq" : "ineq",
          a,
          b,
          link.distance,
          link.type === "Distance" ? link.preferredAxis : undefined,
        );
        return;
      }
      case "GearMeshing": {
        const a = this.pos(link.key1);
        const b = this.pos(link.key2);
        const r1 = this.radEntry.get(link.radKey1);
        const r2 = this.radEntry.get(link.radKey2);
        if (a === undefined || b === undefined || r1 === undefined || r2 === undefined) return;
        this.distance("eq", a, b, 0, undefined, 1, [r1, r2]);
        return;
      }
      case "GearRatio": {
        const r1 = this.radEntry.get(link.radKey1);
        const r2 = this.radEntry.get(link.radKey2);
        if (r1 === undefined || r2 === undefined) return;
        this.emit("eq", [r1, r2], this.x[r1] - link.ratio * this.x[r2], [1, -link.ratio]);
        return;
      }
      case "Radius": {
        const r = this.radEntry.get(link.key1);
        if (r === undefined) return;
        this.emit("eq", [r], this.x[r] - link.radius, [1]);
        return;
      }
      case "Horizontal":
      case "Vertical": {
        const a = this.pos(link.key1);
        const b = this.pos(link.key2);
        if (a === undefined || b === undefined) return;
        const o = link.type === "Horizontal" ? 1 : 0;
        this.emit("eq", [a + o, b + o], this.x[a + o] - this.x[b + o], [1, -1]);
        return;
      }
      case "FixedOnSegment": {
        const s = this.pos(link.key1);
        const e = this.pos(link.key2);
        const p = this.pos(link.key3);
        if (s === undefined || e === undefined || p === undefined) return;
        const t = link.t;
        for (const o of [0, 1])
          this.emit(
            "eq",
            [p + o, s + o, e + o],
            this.x[p + o] - ((1 - t) * this.x[s + o] + t * this.x[e + o]),
            [1, -(1 - t), -t],
          );
        return;
      }
      case "SlideOnSegment": {
        const s = this.pos(link.key1);
        const e = this.pos(link.key2);
        const p = this.pos(link.key3);
        if (s === undefined || e === undefined || p === undefined) return;
        const entries = [s, s + 1, e, e + 1, p, p + 1];
        this.numeric("eq", entries, () => this.signed_offset(s, e, p));
        // A node rides its beam between its two ends, never past them.
        this.numeric("ineq", entries, () => this.along(s, e, p));
        this.numeric("ineq", entries, () => this.vector(s, e).length() - this.along(s, e, p));
        return;
      }
      case "DistanceToLine": {
        const s = this.pos(link.key1);
        const e = this.pos(link.key2);
        const p = this.pos(link.key3);
        if (s === undefined || e === undefined || p === undefined) return;
        const side = Math.sign(this.signed_offset(s, e, p)) || 1;
        this.numeric(
          "eq",
          [s, s + 1, e, e + 1, p, p + 1],
          () => side * this.signed_offset(s, e, p) - link.distance,
        );
        return;
      }
      case "KeepOrientation": {
        const s = this.pos(link.key1);
        const e = this.pos(link.key2);
        if (s === undefined || e === undefined) return;
        this.numeric("eq", [s, s + 1, e, e + 1], () =>
          wrap_half_turn(link.direction.angle_to(this.vector(s, e))),
        );
        return;
      }
      case "Angle":
      case "Parallel":
      case "Normal":
      case "EqualLength": {
        const k = [link.key1, link.key2, link.key3, link.key4].map((key) => this.pos(key));
        if (k.some((e) => e === undefined)) return;
        const [s1, e1, s2, e2] = k as number[];
        const v1 = this.vector(s1, e1);
        const v2 = this.vector(s2, e2);
        let value: number;
        switch (link.type) {
          case "EqualLength":
            value = v1.length() - v2.length();
            break;
          case "Parallel":
            value = wrap_half_turn(v1.angle_to(v2));
            break;
          case "Normal":
            value = wrap_half_turn(v1.angle_to(v2) - Math.PI / 2);
            break;
          case "Angle": {
            const a = link.flipStart ? v1.mul(-1) : v1;
            const b = link.flipEnd ? v2.mul(-1) : v2;
            value = wrap_turn(a.angle_to(b) - link.angle_rad * (link.couterClockwise ? -1 : 1));
          }
        }
        this.two_segments("eq", [s1, e1, s2, e2], value, link.type === "EqualLength" ? "length" : "angle");
        return;
      }
      case "BeltLength":
        this.belt_length(link);
        return;
      case "BeltJunction":
        this.belt_junction(link);
        return;
      default:
        // Every other type belongs to the simulation and never reaches an edition solve.
        return;
    }
  }

  /**
   * A row that is a measure of the second segment minus the same measure of the first, with its exact first and second derivatives.
   * `"angle"` measures the direction, a constant offset aside (a flip, a target), `"length"` the length — differentiated as such, though `EqualLength` reads the first minus the second, which only flips the sign below.
   */
  private two_segments(kind: RowKind, ends: number[], value: number, measure: "angle" | "length") {
    const [s1, e1, s2, e2] = ends;
    const entries: number[] = [];
    const grads: number[] = [];
    const blocks: { s: number; e: number; sign: number; h: number[] }[] = [];
    for (const [s, e, side] of [
      [s1, e1, -1],
      [s2, e2, 1],
    ]) {
      const vx = this.px(e) - this.px(s);
      const vy = this.py(e) - this.py(s);
      const l2 = vx * vx + vy * vy;
      if (l2 < 1e-24) return this.skip(kind);
      const sign = measure === "length" ? -side : side;
      let gx: number;
      let gy: number;
      let h: number[];
      if (measure === "angle") {
        gx = -vy / l2;
        gy = vx / l2;
        const l4 = l2 * l2;
        h = [(2 * vx * vy) / l4, (vy * vy - vx * vx) / l4, (vy * vy - vx * vx) / l4, (-2 * vx * vy) / l4];
      } else {
        const l = Math.sqrt(l2);
        gx = vx / l;
        gy = vy / l;
        h = [(1 - gx * gx) / l, (-gx * gy) / l, (-gx * gy) / l, (1 - gy * gy) / l];
      }
      entries.push(s, s + 1, e, e + 1);
      grads.push(-sign * gx, -sign * gy, sign * gx, sign * gy);
      blocks.push({ s, e, sign, h });
    }
    const curvature: Row["curvature"] = (add) => {
      for (const { s, e, sign, h } of blocks)
        for (const [p, q, side] of [
          [s, s, 1],
          [e, e, 1],
          [s, e, -1],
          [e, s, -1],
        ])
          for (let i = 0; i < 2; i++)
            for (let j = 0; j < 2; j++) add(p + i, q + j, sign * side * h[2 * i + j]);
    };
    this.emit(kind, entries, value, grads, 1, curvature);
  }

  private vector(s: number, e: number): Point2 {
    return new Point2(this.px(e) - this.px(s), this.py(e) - this.py(s));
  }

  /** How far along the segment (`s`, `e`) the projection of `p` lies, from `s`. */
  private along(s: number, e: number, p: number): number {
    const dx = this.px(e) - this.px(s);
    const dy = this.py(e) - this.py(s);
    const len = Math.hypot(dx, dy);
    if (len < 1e-12) return NaN;
    return (dx * (this.px(p) - this.px(s)) + dy * (this.py(p) - this.py(s))) / len;
  }

  /** Signed distance from `p` to the line (`s`, `e`), positive on its left. */
  private signed_offset(s: number, e: number, p: number): number {
    const dx = this.px(e) - this.px(s);
    const dy = this.py(e) - this.py(s);
    const len = Math.hypot(dx, dy);
    if (len < 1e-12) return NaN;
    return (dx * (this.py(p) - this.py(s)) - dy * (this.px(p) - this.px(s))) / len;
  }

  /** The vias of a belt at the current point, and the entries they read. */
  private belt_vias(
    gearPosKeys: string[],
    radKeys: string[] | undefined,
    radii: number[],
    directions: boolean[],
    terminals?: [string, string],
  ): { entries: number[]; vias: () => BeltVia[] } | null {
    const centres = gearPosKeys.map((key) => this.pos(key));
    if (centres.some((e) => e === undefined)) return null;
    const rads = gearPosKeys.map((_, i) => (radKeys ? this.radEntry.get(radKeys[i]) : undefined));
    const ends = terminals?.map((key) => this.pos(key));
    if (ends && ends.some((e) => e === undefined)) return null;
    const entries: number[] = [];
    for (const c of centres) entries.push(c!, c! + 1);
    for (const r of rads) if (r !== undefined) entries.push(r);
    if (ends) for (const t of ends) entries.push(t!, t! + 1);
    const vias = (): BeltVia[] => {
      const gears = centres.map((c, i) => ({
        pos: new Point2(this.px(c!), this.py(c!)),
        radius: rads[i] !== undefined ? this.x[rads[i]!] : radii[i],
        clockwise: directions[i],
      }));
      if (!ends) return gears;
      const terminal = (e: number) => ({ pos: new Point2(this.px(e), this.py(e)), radius: 0, clockwise: false });
      return [terminal(ends[0]!), ...gears, terminal(ends[1]!)];
    };
    return { entries, vias };
  }

  private belt_length(link: Extract<Link, { type: "BeltLength" }>) {
    const path = this.belt_vias(
      link.gearPosKeys,
      link.radKeys,
      link.radii,
      link.directions,
      link.closed ? undefined : [link.startKey, link.endKey],
    );
    if (!path) return;
    const closed = link.closed;
    const first = closed ? 0 : 1;
    this.numeric("eq", path.entries, () => {
      const vias = path.vias();
      const n = vias.length;
      if (n < 2) return 0;
      const sc = belt_shared_scratch(n);
      for (let v = 0; v < n; v++) {
        sc.cx[v] = vias[v].pos.x;
        sc.cy[v] = vias[v].pos.y;
        sc.r[v] = vias[v].radius;
        sc.ccw[v] = vias[v].clockwise ? 1 : 0;
      }
      belt_solve_pairs(sc, n, closed);
      const arc = (v: number) => {
        if (!belt_solve_arc(sc, v, n, closed)) return 0;
        const gear = v - first;
        const wrap =
          link.wraps && gear >= 0 && gear < link.gearPosKeys.length
            ? Math.abs(unwrapArrival(sc.arcWrap[v], link.wraps[gear]))
            : sc.arcWrap[v];
        return sc.r[v] * wrap;
      };
      let total = 0;
      if (closed) for (let v = 0; v < n; v++) total += arc(v) + sc.ell[v];
      else for (let p = 0; p < n - 1; p++) total += sc.ell[p] + arc(p + 1);
      return total - link.length;
    });
  }

  private belt_junction(link: Extract<Link, { type: "BeltJunction" }>) {
    const node = this.pos(link.nodeKey);
    const path = this.belt_vias(link.gearPosKeys, link.radKeys, link.radii, link.directions);
    if (node === undefined || !path) return;
    const here = () => new Point2(this.px(node), this.py(node));
    // The piece the junction rests on is chosen once, so that the differences all measure the same piece.
    const pieces = belt_pieces(path.vias(), true);
    if (pieces.length === 0) return;
    let best = 0;
    let bestDist = Infinity;
    pieces.forEach((piece, i) => {
      const d = here().distance_to(nearest_point_on_piece(here(), piece));
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    this.numeric("eq", [node, node + 1, ...path.entries], () => {
      const all = belt_pieces(path.vias(), true);
      const piece = all[best] ?? all[0];
      if (!piece) return 0;
      const j = here();
      if (piece.kind === "arc") return j.distance_to(piece.center) - piece.radius;
      const d = piece.to.sub(piece.from);
      const len = d.length();
      if (len < 1e-12) return j.distance_to(piece.from);
      return (d.x * (j.y - piece.from.y) - d.y * (j.x - piece.from.x)) / len;
    });
  }

  private preference(pref: Preference) {
    switch (pref.type) {
      case "Target": {
        const p = this.pos(pref.key);
        if (p === undefined) return;
        const kind = pref.exact && this.exactTargets ? "eq" : "soft";
        this.emit(kind, [p], this.px(p) - pref.value.x, [1], pref.weight);
        this.emit(kind, [p + 1], this.py(p) - pref.value.y, [1], pref.weight);
        return;
      }
      case "Follow": {
        const p = this.pos(pref.key);
        const o = this.pos(pref.origin);
        if (p === undefined || o === undefined) return;
        this.emit("soft", [p, o], this.px(p) - this.px(o) - pref.offset.x, [1, -1], pref.weight);
        this.emit("soft", [p + 1, o + 1], this.py(p) - this.py(o) - pref.offset.y, [1, -1], pref.weight);
        return;
      }
      case "SegmentRatio": {
        const s = this.pos(pref.key1);
        const e = this.pos(pref.key2);
        const p = this.pos(pref.key3);
        if (s === undefined || e === undefined || p === undefined) return;
        this.numeric(
          "soft",
          [s, s + 1, e, e + 1, p, p + 1],
          () => {
            const v = this.vector(s, e);
            const len = v.length();
            if (len < 1e-12) return 0;
            const along = (v.x * (this.px(p) - this.px(s)) + v.y * (this.py(p) - this.py(s))) / len;
            return along - pref.t * len;
          },
          pref.weight,
        );
        return;
      }
      case "Orientation": {
        const s = this.pos(pref.key1);
        const e = this.pos(pref.key2);
        if (s === undefined || e === undefined) return;
        const len = Math.hypot(pref.direction.x, pref.direction.y);
        if (len < 1e-12) return;
        const dx = pref.direction.x / len;
        const dy = pref.direction.y / len;
        // The lateral drift of one end relative to the other: the rotation, measured as the length it sweeps.
        const v = this.vector(s, e);
        this.emit("soft", [s, s + 1, e, e + 1], dx * v.y - dy * v.x, [dy, -dx, -dy, dx], pref.weight);
        return;
      }
      case "Length": {
        const s = this.pos(pref.key1);
        const e = this.pos(pref.key2);
        if (s === undefined || e === undefined) return;
        this.distance("soft", s, e, pref.length, undefined, pref.weight);
        return;
      }
    }
  }
}

/** Wraps to (−π, π]. */
function wrap_turn(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a <= -Math.PI) a += 2 * Math.PI;
  return a;
}

/** Wraps to (−π/2, π/2]: segments are not oriented. */
function wrap_half_turn(a: number): number {
  while (a > Math.PI / 2) a -= Math.PI;
  while (a <= -Math.PI / 2) a += Math.PI;
  return a;
}
