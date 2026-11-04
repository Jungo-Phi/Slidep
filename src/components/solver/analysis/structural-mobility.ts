/**
 * The mobility of a chain as a property of its structure rather than of one pose.
 *
 * The probe measures the rank at the pose it is handed, and some poses are singular: members stretched flat between two held points, which is also how a belt grazes a pulley it is about to leave.
 * There the probe sees a motion too many, or misses one, though nothing about the mechanism has changed.
 * The structure only changes when its links do, so poses sharing those links share a mobility: the generic one, which a singular pose can only overstate.
 *
 * Poses of the same structure are measured alongside the one on screen, and each chain keeps the smallest mobility any of them shows, never below its Grubler count.
 * Its modes are still those of the pose on screen, which is what an animation swings.
 */

import { AnalysisChain, AnalysisModel } from "./analysis-model";
import { ChainMobility } from "./mobility-probe";

/** One pose, measured. */
export type PoseMeasurement = {
  model: AnalysisModel;
  mobilities: ChainMobility[];
};

/** One chain of the pose on screen, with its structural mobility. */
export type StructuralChain = {
  chain: AnalysisChain;
  /** Structural `m` and `h`, with modes spanning that many motions at the pose on screen. */
  mobility: ChainMobility;
  /** A pose where the chain shows its structural mobility, for whatever must solve around it — the redundancy audit. */
  regular: { model: AnalysisModel; chain: AnalysisChain; mobility: ChainMobility };
};

/** Below this share of itself a transported mode is taken to lie outside the space it is projected into. */
const OUTSIDE = 1e-3;

/**
 * Combine the pose on screen with poses of the same structure.
 *
 * `references` must share the structure of `current` — same links, belts on the same pulleys — and are matched to it chain by chain through the chain id.
 * With none, the pose on screen is its own answer, only held to its Grubler count.
 */
export function structural_mobility(
  current: PoseMeasurement,
  references: PoseMeasurement[],
): StructuralChain[] {
  return current.model.chains.map((chain, i) => {
    const own = current.mobilities[i];
    const poses = [{ model: current.model, chain, mobility: own }];
    for (const reference of references) {
      const k = reference.model.chains.findIndex((c) => c.id === chain.id);
      if (k < 0) continue;
      const other = reference.model.chains[k];
      if (!same_variables(other, chain)) continue;
      poses.push({ model: reference.model, chain: other, mobility: reference.mobilities[k] });
    }

    const lowest = Math.min(...poses.map((p) => p.mobility.mobility));
    const mobility = Math.max(chain.grublerCount, lowest);
    const regular = poses.find((p) => p.mobility.mobility === mobility) ?? poses[0];
    const modes = own.modes.length === mobility ? own.modes : transported(own.modes, regular.mobility.modes, mobility);
    return {
      chain,
      mobility: {
        ...own,
        mobility,
        hyperstaticity: mobility - chain.grublerCount,
        modes,
      },
      regular,
    };
  });
}

/** Two chains whose unknowns are the same, in the same order: a mode of one reads as a mode of the other. */
function same_variables(a: AnalysisChain, b: AnalysisChain): boolean {
  return (
    a.variables.length === b.variables.length &&
    a.variables.every((v, i) => v.key === b.variables[i].key && v.component === b.variables[i].component)
  );
}

/**
 * `count` orthonormal motions at the pose on screen, steered by those of a regular pose.
 *
 * Where the pose on screen shows too many, the regular modes projected into its space pick out the genuine ones and leave the spurious direction behind.
 * Where it shows too few, its own come first and the regular ones fill the gap: the motion space turns smoothly with the pose, so theirs are close to the missing ones.
 */
function transported(own: Float64Array[], regular: Float64Array[], count: number): Float64Array[] {
  const basis: Float64Array[] = [];
  const admit = (vector: Float64Array) => {
    if (basis.length >= count) return;
    const candidate = Float64Array.from(vector);
    for (const b of basis) {
      const d = dot(candidate, b);
      for (let i = 0; i < candidate.length; i++) candidate[i] -= d * b[i];
    }
    const norm = Math.sqrt(dot(candidate, candidate));
    if (norm <= OUTSIDE * Math.sqrt(dot(vector, vector))) return;
    for (let i = 0; i < candidate.length; i++) candidate[i] /= norm;
    basis.push(candidate);
  };

  if (own.length > count) for (const vector of regular) admit(project(vector, own));
  else for (const vector of own) admit(vector);
  for (const vector of regular) admit(vector);
  return basis;
}

/** `vector` projected onto the span of the orthonormal `space`. */
function project(vector: Float64Array, space: Float64Array[]): Float64Array {
  const out = new Float64Array(vector.length);
  for (const b of space) {
    const d = dot(vector, b);
    for (let i = 0; i < out.length; i++) out[i] += d * b[i];
  }
  return out;
}

function dot(a: Float64Array, b: Float64Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}
