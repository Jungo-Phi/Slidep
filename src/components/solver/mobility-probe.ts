/**
 * Mobility of a kinematic chain, measured with the solver rather than derived from a count.
 *
 * A PBD sweep is an alternating projection onto the constraint manifolds, so for a small
 * perturbation `δ` around a satisfied configuration
 *
 *     P(δ) = ( solve(x + ε·δ) − solve(x) ) / ε
 *
 * lands back on the manifold: it is the projection of `δ` onto the motions the constraints
 * allow. Probing with enough directions and orthogonalising what comes back spans that
 * space, and its dimension **is** the mobility `m`.
 *
 * Measured against `solve(x)` rather than `x`, so that a configuration the model does not
 * quite hold satisfied costs accuracy and never a phantom mode (see `rest`).
 *
 * Nothing here re-implements a constraint. The analysis therefore cannot disagree with the
 * simulation about what moves — which is the whole reason for measuring rather than
 * assembling a Jacobian.
 *
 * The hyperstaticity falls out by counting: `h = m − G`, `G` being the chain's Grübler
 * count. Since `rank ≤ Σddl`, `m ≥ G` always holds — a probe run that returns less has
 * missed a mode, and that impossibility is what the exhaustive fallback keys on.
 *
 * **Local.** Everything here describes the configuration it was called at. A mechanism at a
 * dead point has a different rank, and that is a property of the pose, not a defect.
 */

import { ID } from "../../types";
import {
  AnalysisChain,
  AnalysisModel,
  Variable,
  variable_keys_of,
} from "./analysis-model";
import { PBD_solve } from "./PBD_kinematic_solver";
import { angleSlotOf, slotOf, solveNodesFromMaps } from "./nodes";

/**
 * Perturbation size, as a fraction of the chain's own extent.
 *
 * A fraction and nothing else — no floor in millimetres. Any absolute floor eventually
 * exceeds the chain it probes, and a probe worth half the mechanism leaves the linear
 * regime the whole projection argument rests on: measured, a floor of 1 mm makes a chain
 * 2 mm across report a mode that does not exist, and a floor of 0.01 mm does the same at
 * 0.02 mm. Purely relative, the answer holds from a couple of microns to a couple of metres.
 */
const PROBE_AMPLITUDE_RATIO = 0.01;

/**
 * How much of a candidate direction must survive being projected a second time.
 *
 * `P` is a projection, so a genuine motion satisfies `P(P(δ)) = P(δ)` and comes back whole,
 * while anything the constraints merely resist weakly collapses. Comparing a candidate to
 * ITSELF this way is what makes the test scale-free: judging the first projection's norm
 * instead would compare against a random direction's overlap with the motion space, which
 * shrinks like `√(m/n)` and would therefore depend on how big the mechanism is.
 */
const REPROJECTION_TOLERANCE = 0.5;

/** Below this a candidate is numerical dust, not worth a confirming solve. */
const DUST = 1e-6;

/** Consecutive probes that add nothing before the space is called complete. */
const STALL_PROBES = 3;

/** Sweeps a probe's solve may take. It exits on the constraints long before this. */
const PROBE_SWEEPS = 3000;

/** Knobs the measurement bench varies; production always takes the defaults. */
export type ProbeTuning = {
  exitOn?: "motion" | "constraints";
  amplitudeRatio?: number;
  tolerance?: number;
  sweeps?: number;
};

export type ChainMobility = {
  chainId: string;
  /** `m` — the number of independent motions at this configuration. */
  mobility: number;
  /** `h = m − G` — redundant constraint rows. Never negative. */
  hyperstaticity: number;
  /** The chain's scalar unknowns, in the order the modes are written in. */
  variables: Variable[];
  /** Orthonormal basis of the motion space, each vector in `variables` order, scaled units. */
  modes: Float64Array[];
  /** Solves spent measuring. */
  solves: number;
  /** The `m ≥ G` guard fired and every canonical direction was swept. */
  exhaustive: boolean;
  /**
   * How far the configuration handed in sits off the constraints, in probe steps.
   *
   * `0` on a chain the model holds satisfied. Anything of order 1 or more means the modes
   * describe the nearby pose the solver settled on rather than the one on screen — the
   * measurement is still sound, the pose it answers for is not the one asked about.
   */
  restDrift: number;
};

/**
 * Deterministic probe directions.
 *
 * A fixed seed, never `Math.random`: the same mechanism must answer the same thing twice.
 * The draw only decides how the space is *discovered* — `m` is a dimension, and the modes
 * reported to the user are re-derived from the space itself.
 */
function make_rng(seed = 0x9e3779b9): () => number {
  let state = seed >>> 0;
  return () => {
    // xorshift32
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x1_0000_0000;
  };
}

/**
 * What one radian of an angle unknown is worth in millimetres.
 *
 * Positions are millimetres and angles radians; without a lever the two cannot share a
 * norm, a tolerance, or a notion of orthogonality, and the same mechanism drawn ten times
 * larger would answer differently. A gear's own radius is that lever — the rim is where its
 * rotation is felt.
 */
export function angle_levers(
  model: AnalysisModel,
  variables: Variable[],
  fallback: number,
): Map<string, number> {
  const levers = new Map<string, number>();
  for (const variable of variables) {
    if (variable.component !== "angle") continue;
    const radius = model.gearRadii.get(variable.key as ID);
    levers.set(
      variable.key,
      radius !== undefined && radius > 0 ? radius : fallback,
    );
  }
  return levers;
}

/**
 * Extent of the whole mechanism: the scale a reader judges any motion against.
 *
 * Distinct from a chain's own extent, which is the right scale for *measuring* one chain but
 * the wrong one for *showing* it — two chains of different sizes would then swing by
 * different amounts, and a lone node, having no extent of its own, would barely stir.
 */
export function model_extent(model: AnalysisModel): number {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of model.nodes.positions.values()) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  if (!Number.isFinite(minX)) return 0;
  return Math.hypot(maxX - minX, maxY - minY);
}

/** Extent of everything the chain's links touch, anchors included: the scale its numbers live at. */
export function chain_extent(model: AnalysisModel, chain: AnalysisChain): number {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const see = (key: string) => {
    const p = model.nodes.positions.get(key);
    if (!p) return;
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  };
  for (const key of chain.variableKeys) see(key);
  for (const link of chain.links)
    for (const key of variable_keys_of(link)) see(key);
  if (!Number.isFinite(minX)) return 0;
  return Math.hypot(maxX - minX, maxY - minY);
}

/** Modified Gram-Schmidt, run twice: one pass loses orthogonality when the new vector is nearly dependent. */
function orthogonalise(vector: Float64Array, basis: Float64Array[]): number {
  for (let pass = 0; pass < 2; pass++)
    for (const b of basis) {
      let dot = 0;
      for (let i = 0; i < vector.length; i++) dot += vector[i] * b[i];
      for (let i = 0; i < vector.length; i++) vector[i] -= dot * b[i];
    }
  let norm = 0;
  for (let i = 0; i < vector.length; i++) norm += vector[i] * vector[i];
  return Math.sqrt(norm);
}

/** Measure one chain's mobility at the model's current configuration. */
export function probe_chain_mobility(
  model: AnalysisModel,
  chain: AnalysisChain,
  tuning: ProbeTuning = {},
): ChainMobility {
  const {
    amplitudeRatio = PROBE_AMPLITUDE_RATIO,
    tolerance = REPROJECTION_TOLERANCE,
    sweeps = PROBE_SWEEPS,
    exitOn = "constraints",
  } = tuning;
  const variables = chain.variables;
  const n = variables.length;
  let restDrift = 0;
  const result = (
    modes: Float64Array[],
    solves: number,
    exhaustive: boolean,
  ): ChainMobility => ({
    chainId: chain.id,
    mobility: modes.length,
    hyperstaticity: modes.length - chain.grublerCount,
    variables,
    modes,
    solves,
    exhaustive,
    restDrift,
  });

  // Nothing constrains the chain: every unknown is free, and no solve can say otherwise.
  if (chain.links.length === 0)
    return result(identity_basis(n), 0, false);

  const nodes = solveNodesFromMaps(
    model.nodes.positions,
    model.nodes.posMasses,
    model.nodes.angles,
    new Map(),
    new Map(),
  );
  const baseX = Float64Array.from(nodes.x);
  const baseY = Float64Array.from(nodes.y);
  const baseAngle = Float64Array.from(nodes.angle);

  // A chain whose nodes all sit on one point has no scale of its own; a millimetre stands in.
  const extent = chain_extent(model, chain) || 1;
  const amplitude = amplitudeRatio * extent;
  const levers = angle_levers(model, variables, extent);

  // Slot of each unknown, resolved once.
  const slots = variables.map((v) =>
    v.component === "angle"
      ? angleSlotOf(nodes, v.key)
      : slotOf(nodes, v.key),
  );

  let solves = 0;

  /** Where the solve takes a direction from the base configuration, in scaled units. */
  const settle = (direction: Float64Array): Float64Array => {
    nodes.x.set(baseX);
    nodes.y.set(baseY);
    nodes.angle.set(baseAngle);
    for (let i = 0; i < n; i++) {
      const slot = slots[i];
      if (slot < 0) continue;
      const step = amplitude * direction[i];
      const { component, key } = variables[i];
      if (component === "x") nodes.x[slot] += step;
      else if (component === "y") nodes.y[slot] += step;
      else nodes.angle[slot] += step / levers.get(key)!;
    }
    PBD_solve(nodes, chain.links, sweeps, 1e-9, false, exitOn);
    solves++;

    const moved = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const slot = slots[i];
      if (slot < 0) continue;
      const { component, key } = variables[i];
      moved[i] =
        component === "x"
          ? (nodes.x[slot] - baseX[slot]) / amplitude
          : component === "y"
            ? (nodes.y[slot] - baseY[slot]) / amplitude
            : ((nodes.angle[slot] - baseAngle[slot]) * levers.get(key)!) /
              amplitude;
    }
    return moved;
  };

  /**
   * What the solve does to the base configuration on its own, subtracted from every probe.
   *
   * A configuration the constraints already satisfy gives zero and nothing changes. One they
   * do not turns `settle` affine — `settle(δ) = Aδ + c`, with the same `c` whichever way the
   * chain is pushed — and that constant is a direction like any other to a routine looking
   * for a span: it survives re-projection, is admitted, and inflates `m` by one. Removing it
   * leaves `Aδ`, the honest projection about the pose the solver settles on.
   *
   * Measured on `Déconnexion courroie` while the belt has a pulley off: a junction 316 mm
   * from where its constraint wants it, and a chain of 2 DDL reported with 3 and one degree
   * of hyperstaticity.
   */
  const rest = settle(new Float64Array(n));
  for (const value of rest) restDrift += value * value;
  restDrift = Math.sqrt(restDrift);
  const project = (direction: Float64Array): Float64Array => {
    const moved = settle(direction);
    for (let i = 0; i < n; i++) moved[i] -= rest[i];
    return moved;
  };

  const basis: Float64Array[] = [];

  /**
   * Try one direction. What comes back is only admitted once a second projection
   * confirms the constraints leave it alone — see `REPROJECTION_TOLERANCE`.
   */
  const admit = (direction: Float64Array): boolean => {
    const candidate = project(direction);
    const norm = orthogonalise(candidate, basis);
    if (norm <= DUST) return false;
    for (let i = 0; i < n; i++) candidate[i] /= norm;

    const confirmed = project(candidate);
    const survived = orthogonalise(confirmed, basis);
    if (survived <= tolerance) return false;
    for (let i = 0; i < n; i++) confirmed[i] /= survived;
    basis.push(confirmed);
    return true;
  };

  // ── Random sweep: m is small, so a handful of directions finds it ────────
  const rng = make_rng();
  let stalled = 0;
  while (basis.length < n && stalled < STALL_PROBES) {
    if (admit(random_direction(rng, n))) stalled = 0;
    else stalled++;
  }

  // ── Guard: m < G is impossible, so a shortfall means a mode was missed ───
  if (basis.length >= chain.grublerCount)
    return result(basis, solves, false);

  basis.length = 0;
  for (let i = 0; i < n && basis.length < n; i++) {
    const direction = new Float64Array(n);
    direction[i] = 1;
    admit(direction);
  }
  return result(basis, solves, true);
}

/** Measure every chain of a model. */
export function probe_mobility(
  model: AnalysisModel,
  tuning: ProbeTuning = {},
): ChainMobility[] {
  return model.chains.map((chain) =>
    probe_chain_mobility(model, chain, tuning),
  );
}

function identity_basis(n: number): Float64Array[] {
  return Array.from({ length: n }, (_, i) => {
    const e = new Float64Array(n);
    e[i] = 1;
    return e;
  });
}

function random_direction(rng: () => number, n: number): Float64Array {
  const direction = new Float64Array(n);
  let norm = 0;
  for (let i = 0; i < n; i++) {
    direction[i] = rng() * 2 - 1;
    norm += direction[i] * direction[i];
  }
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < n; i++) direction[i] /= norm;
  return direction;
}
