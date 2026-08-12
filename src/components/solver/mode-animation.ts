/**
 * Showing a degree of freedom by moving the mechanism along it.
 *
 * A mode is a direction in the space of unknowns; read as a list of numbers it says nothing.
 * Swung back and forth, it is immediately legible — "this is what that freedom does". This
 * module turns one mode into a sequence of poses a canvas can draw.
 *
 * Each pose is **solved**, not merely displaced. A mode is a tangent direction, so following
 * it in a straight line stretches the very bars it is meant to leave rigid; re-projecting on
 * the constraints after each step keeps the drawing a mechanism rather than a rubber sketch,
 * and lets the swing be wide enough to read. It costs one solve per frame, warm-started from
 * the pose already on screen, which is a fraction of the measurement's own budget.
 *
 * Nothing here writes to the mechanism it was given: a pose is a drawing, and letting go of
 * the animation must leave the design exactly as it was.
 */

import { MODE_ANIMATION } from "../../constants/rendering-specs";
import { Mechanism } from "../../types";
import { AnalysisChain, AnalysisModel } from "./analysis-model";
import { PBD_solve } from "./PBD_kinematic_solver";
import { angleSlotOf, slotOf } from "./nodes";
import { angle_levers, chain_extent, model_extent } from "./mobility-probe";
import { MotionMode } from "./motion-modes";
import { mechanism_at, pose_of, rest_nodes } from "./animation-pose";

/** Sweeps one animated pose may take. Warm-started, it exits on the constraints well before. */
const ANIMATION_SWEEPS = 200;

export type ModeAnimation = {
  /** Advance by `dt` seconds and return the pose to draw. */
  advance(dt: number): Mechanism;
};

/**
 * Swing `mechanism` along `mode`, one pose per call.
 *
 * The swing starts and ends at the rest pose, so letting go of it never leaves the drawing
 * somewhere unexpected — `sin` is zero at zero.
 */
/** Overrides for callers with a different purpose than the analysis panel's precise
 *  reading — a gallery thumbnail, say — that may want a wider, quicker swing. */
export type ModeAnimationTuning = {
  amplitudeRatio?: number;
  periodS?: number;
};

export function animate_mode(
  mechanism: Mechanism,
  model: AnalysisModel,
  chain: AnalysisChain,
  mode: MotionMode,
  tuning: ModeAnimationTuning = {},
): ModeAnimation {
  const {
    amplitudeRatio = MODE_ANIMATION.AMPLITUDE_RATIO,
    periodS = MODE_ANIMATION.PERIOD_S,
  } = tuning;

  const variables = chain.variables;
  const nodes = rest_nodes(model);
  // The lever keeps the chain's own scale: it converts this chain's angles to millimetres,
  // which has nothing to do with how far the drawing should swing.
  const levers = angle_levers(model, variables, chain_extent(model, chain) || 1);
  const extent = model_extent(model);
  const slots = variables.map((v) =>
    v.component === "angle" ? angleSlotOf(nodes, v.key) : slotOf(nodes, v.key),
  );

  // Scaled so the widest-moving unknown covers `AMPLITUDE_RATIO` of the chain, whatever the
  // mode's shape. A mode with no motion at all would divide by zero; it cannot occur (modes
  // are unit vectors) but the guard costs nothing.
  let widest = 0;
  for (const value of mode.vector) widest = Math.max(widest, Math.abs(value));
  const swing =
    (Math.max(amplitudeRatio * extent, 1) / (widest || 1)) as number;

  let phase = 0;
  let offset = 0;

  return {
    advance(dt: number): Mechanism {
      phase += (dt * 2 * Math.PI) / periodS;
      const target = swing * Math.sin(phase);
      const step = target - offset;
      offset = target;

      for (let i = 0; i < variables.length; i++) {
        const slot = slots[i];
        if (slot < 0) continue;
        const move = step * mode.vector[i];
        const { component, key } = variables[i];
        if (component === "x") nodes.x[slot] += move;
        else if (component === "y") nodes.y[slot] += move;
        else nodes.angle[slot] += move / levers.get(key)!;
      }
      PBD_solve(
        nodes,
        chain.links,
        ANIMATION_SWEEPS,
        1e-9,
        false,
        "constraints",
      );

      return mechanism_at(mechanism, pose_of(nodes));
    },
  };
}
