/**
 * Turning solver state back into a mechanism a canvas can draw.
 *
 * Shared by the animations the analysis panel plays — swinging along a motion mode, and
 * straining against a falsified constraint. Neither writes to the mechanism it was handed:
 * a pose is a drawing, and letting go of an animation must leave the design as it was.
 */

import { Mechanism, Point2 } from "../../types";
import { AnalysisModel } from "./analysis-model";
import { SolveNodes, solveNodesFromMaps } from "./nodes";

/**
 * Positions and angles of the ORIGINAL keys.
 *
 * Coincidence fusion holds several original keys in one node, and elements are named by the
 * original ones — a beam knows `id:start`, not the fused node it ended up sharing.
 */
export type Pose = {
  positions: Map<string, Point2>;
  angles: Map<string, number>;
};

/** Solver state at the model's resting configuration, ready to be moved and re-solved. */
export function rest_nodes(model: AnalysisModel): SolveNodes {
  return solveNodesFromMaps(
    model.nodes.positions,
    model.nodes.posMasses,
    model.nodes.angles,
    new Map(),
    new Map(),
  );
}

/** Read a pose out of solver state. Fused nodes answer for each original key they hold. */
export function pose_of(nodes: SolveNodes): Pose {
  const positions = new Map<string, Point2>();
  for (const [fused, slot] of nodes.index)
    for (const part of fused.split(","))
      positions.set(part, new Point2(nodes.x[slot], nodes.y[slot]));
  const angles = new Map<string, number>();
  for (const [key, slot] of nodes.angleIndex) angles.set(key, nodes.angle[slot]);
  return { positions, angles };
}

/** Rebuild a mechanism at `pose`, leaving everything the pose says nothing about untouched. */
export function mechanism_at(mechanism: Mechanism, pose: Pose): Mechanism {
  return {
    ...mechanism,
    mechanicalElements: mechanism.mechanicalElements.map((el) => {
      if ("position" in el) {
        const position = pose.positions.get(el.id);
        const angle = el.type === "gear" ? pose.angles.get(el.id) : undefined;
        if (!position && angle === undefined) return el;
        return {
          ...el,
          ...(position ? { position } : {}),
          ...(angle !== undefined ? { angle } : {}),
        };
      }
      const positionStart = pose.positions.get(`${el.id}:start`);
      const positionEnd = pose.positions.get(`${el.id}:end`);
      if (!positionStart && !positionEnd) return el;
      // A belt's wraps are a RECORDED quantity — how far it had turned onto each pulley at
      // the instant the snapshot was taken. This pose is one we made up, so they no longer
      // describe it: carried through, they hold every arc at the angle it had while the
      // pulleys move and turn underneath. Dropped, the drawing solves the belt against the
      // geometry it is given, which is what edition does. Which pulleys the belt has come
      // off is a topology and stays: the swing does not put a belt back on.
      const unwrapped = el.type === "belt" ? { gearWraps: undefined } : {};
      // A spring or damper draws a fixed number of coils at its natural length and stretches
      // between them. Freezing that length on the animated copy keeps the coils from being
      // recounted every frame, exactly as the simulation does.
      const restLength =
        el.type === "spring" || el.type === "damper"
          ? el.positionStart.distance_to(el.positionEnd)
          : undefined;
      return {
        ...el,
        ...(positionStart ? { positionStart } : {}),
        ...(positionEnd ? { positionEnd } : {}),
        ...(restLength !== undefined ? { restLength } : {}),
        ...unwrapped,
      };
    }),
  };
}
