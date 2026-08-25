import { Mechanism, Point2 } from "../../types";
import { as_edge } from "../../utils/load-frame";

/**
 * A `LoadElement` resolved to solver keys, split into what is fixed at compile time and what
 * has to be re-derived every frame.
 *
 * An edge-frame force follows the edge it is aimed along, so its world direction depends on
 * that edge's CURRENT orientation — unlike mass, this cannot be baked in once. What compiles
 * once is everything geometry-independent: which solver keys are involved, and (for a moment
 * on a gear or on a beam) the sign flip that turns the data model's "positive = clockwise"
 * into the solver's raw angle convention — the same flip `parsing.ts` applies to motor speed.
 */
export type CompiledLoad =
  | {
      kind: "force";
      key: string;
      /** As stored: already world coordinates, or local to `edge` and rotated into world
       *  space each frame. */
      vector: Point2;
      edge?: { startKey: string; endKey: string };
    }
  | {
      kind: "distributed-force";
      startKey: string;
      endKey: string;
      /** As stored — see `force`'s `vector`. */
      direction: Point2;
      edge?: { startKey: string; endKey: string };
      magnitudeStart: number;
      magnitudeEnd: number;
    }
  | { kind: "torque"; angleKey: string; torque: number }
  | { kind: "couple"; startKey: string; endKey: string; torque: number };

/**
 * Resolve every load's target (and, for an edge frame, its reference edge) to solver keys —
 * called once at compile time. A load edit already recompiles the whole model (see the
 * mechanism-edit effect in `use-simulation-playback.ts`), so there is nothing here that also
 * needs a lighter, non-recompiling update path.
 */
export function compile_loads(
  mechanism: Mechanism,
  keyMap: Map<string, string>,
): CompiledLoad[] {
  const resolve = (key: string) => keyMap.get(key) ?? key;
  const byID = new Map(mechanism.mechanicalElements.map((el) => [el.id, el]));
  const edgeKeys = (edgeID: string) => ({
    startKey: resolve(`${edgeID}:start`),
    endKey: resolve(`${edgeID}:end`),
  });

  const compiled: CompiledLoad[] = [];
  for (const load of mechanism.loads) {
    if (load.type === "force") {
      const key = resolve(
        load.anchor ? `${load.targetID}:${load.anchor}` : load.targetID,
      );
      const edge = load.frame !== "world" ? edgeKeys(load.frame.edgeID) : undefined;
      compiled.push({ kind: "force", key, vector: load.vector, edge });
    } else if (load.type === "distributed-force") {
      const { startKey, endKey } = edgeKeys(load.targetID);
      const edge = load.frame !== "world" ? edgeKeys(load.frame.edgeID) : undefined;
      compiled.push({
        kind: "distributed-force",
        startKey,
        endKey,
        direction: load.direction,
        edge,
        magnitudeStart: load.magnitudeStart,
        magnitudeEnd: load.magnitudeEnd,
      });
    } else {
      // MomentElement: "N·m, positive = clockwise" — the data model's convention, not the
      // solver's. `parsing.ts` negates the same way for a motor's commanded speed, since
      // increasing `nodes.angle` is a counter-clockwise turn in this world (Y up).
      const torque = -load.value;
      const target = byID.get(load.targetID);
      const edge = as_edge(target);
      if (edge) {
        const { startKey, endKey } = edgeKeys(load.targetID);
        compiled.push({ kind: "couple", startKey, endKey, torque });
      } else if (target) {
        // Unlike a position key, an angle key is never fused (see `compile_simulation_model`'s
        // coincidence pass, which only touches `nodes.positions`/`nodes.posMasses`) — so it stays
        // the element's own raw id, not `resolve(target.id)`.
        compiled.push({ kind: "torque", angleKey: target.id, torque });
      }
    }
  }
  return compiled;
}

/** World-frame axes of the edge spanning `startKey`→`endKey` at its CURRENT position: `xhat`
 *  along the edge, `yhat` its +90° (counter-clockwise) normal. Degenerate (zero-length, or a
 *  missing endpoint) falls back to the identity frame rather than propagating a NaN. */
function live_edge_axes(
  startKey: string,
  endKey: string,
  positions: Map<string, Point2>,
): { xhat: Point2; yhat: Point2 } {
  const start = positions.get(startKey);
  const end = positions.get(endKey);
  const delta = start && end ? end.sub(start) : undefined;
  const xhat = delta && delta.length() > 1e-9 ? delta.normalize() : new Point2(1, 0);
  return { xhat, yhat: xhat.perp() };
}

/** A vector stored in `edge`'s local frame (x = along, y = normal), rotated to world space by
 *  that edge's current orientation — the live equivalent of `load-frame.ts`'s
 *  `frame2world_transform`, reading solver positions instead of edit-time `MechanicalElement`s. */
function to_world(
  vector: Point2,
  edge: { startKey: string; endKey: string } | undefined,
  positions: Map<string, Point2>,
): Point2 {
  if (!edge) return vector;
  const { xhat, yhat } = live_edge_axes(edge.startKey, edge.endKey, positions);
  return xhat.mul(vector.x).add(yhat.mul(vector.y));
}

const add_to = (map: Map<string, Point2>, key: string, v: Point2): void => {
  const prev = map.get(key);
  map.set(key, prev ? prev.add(v) : v);
};

/**
 * Turns compiled loads into the per-node force/torque a dynamics step folds into its predict
 * acceleration — called every frame, since an edge-frame load's world direction follows that
 * edge's current orientation.
 *
 * A distributed load lumps 50/50 onto the beam's two ends, same simplification `mass-model.ts`
 * makes for a beam's own mass: exact for a uniform load (`magnitudeStart === magnitudeEnd`,
 * the common case), an approximation for a tapered one — the alternative (splitting by the
 * trapezoid's actual centroid) buys static consistency this quasi-static XPBD step does not
 * otherwise have anyway.
 */
export function resolve_load_forces(
  loads: CompiledLoad[],
  positions: Map<string, Point2>,
): { forces: Map<string, Point2>; torques: Map<string, number> } {
  const forces = new Map<string, Point2>();
  const torques = new Map<string, number>();

  for (const load of loads) {
    switch (load.kind) {
      case "force":
        add_to(forces, load.key, to_world(load.vector, load.edge, positions));
        break;
      case "distributed-force": {
        const start = positions.get(load.startKey);
        const end = positions.get(load.endKey);
        if (!start || !end) break;
        const length = start.distance_to(end);
        const total = ((load.magnitudeStart + load.magnitudeEnd) / 2) * length;
        const direction = to_world(load.direction, load.edge, positions);
        const half = direction.mul(total / 2);
        add_to(forces, load.startKey, half);
        add_to(forces, load.endKey, half);
        break;
      }
      case "torque":
        torques.set(load.angleKey, (torques.get(load.angleKey) ?? 0) + load.torque);
        break;
      case "couple": {
        const start = positions.get(load.startKey);
        const end = positions.get(load.endKey);
        if (!start || !end) break;
        const { yhat } = live_edge_axes(load.startKey, load.endKey, positions);
        const length = end.sub(start).length();
        if (length < 1e-9) break;
        // τ = (end − start) × F, and (end − start) = length·xhat with F = k·yhat gives
        // τ = length·k·(xhat × yhat) = length·k, since xhat/yhat are an orthonormal pair —
        // so a couple of ±k·yhat at the two ends produces exactly `torque`, whatever the
        // beam's current orientation.
        const k = load.torque / length;
        add_to(forces, load.endKey, yhat.mul(k));
        add_to(forces, load.startKey, yhat.mul(-k));
        break;
      }
    }
  }

  return { forces, torques };
}
