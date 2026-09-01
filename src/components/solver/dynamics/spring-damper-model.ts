import { Mechanism, Point2 } from "../../../types";
import { ZERO } from "../../../types/point2";

/**
 * A `spring`/`damper` element resolved to solver keys, with the physical constant it needs —
 * `stiffness`/`damping` are already N/m / N·s/m (see `physics-specs.ts`), unlike the
 * relaxation factor `parsing.ts` derives from a spring's stiffness for the quasi-static
 * kinematic sweep.
 *
 * Dynamic mode drops the `Spring` LINK entirely (see `step_dynamic_simulation`) and computes
 * this instead: a real `F = -k·(L − L₀)` has no meaning as a position constraint the way the
 * kinematic hack borrows one, and a damper — velocity-dependent — never had a kinematic
 * counterpart to begin with (`parsing.ts` adds no link for it at all).
 */
export type CompiledSpringDamper =
  | { kind: "spring"; startKey: string; endKey: string; restLength: number; stiffness: number }
  | { kind: "damper"; startKey: string; endKey: string; damping: number };

export function compile_springs_dampers(
  mechanism: Mechanism,
  keyMap: Map<string, string>,
): CompiledSpringDamper[] {
  const resolve = (key: string) => keyMap.get(key) ?? key;
  const compiled: CompiledSpringDamper[] = [];
  for (const element of mechanism.mechanicalElements) {
    if (element.type === "spring") {
      compiled.push({
        kind: "spring",
        startKey: resolve(`${element.id}:start`),
        endKey: resolve(`${element.id}:end`),
        restLength:
          element.restLength ?? element.positionStart.distance_to(element.positionEnd),
        stiffness: element.stiffness,
      });
    } else if (element.type === "damper") {
      compiled.push({
        kind: "damper",
        startKey: resolve(`${element.id}:start`),
        endKey: resolve(`${element.id}:end`),
        damping: element.damping,
      });
    }
  }
  return compiled;
}

/**
 * The axial force each spring/damper exerts this frame, from live positions (and, for a
 * damper, live pre-predict velocities) — called every frame, same reason as
 * `resolve_load_forces`: the two endpoints keep moving.
 *
 * Both are purely axial: a spring only ever pulls/pushes along its own current length, and
 * the damper modelled here is the matching dashpot — it resists the endpoints' closing or
 * opening speed, not their sideways motion (real dashpots do not resist that either; a
 * mechanism's own constraints are what keep a spring/damper's ends from drifting sideways
 * in the first place).
 */
export function resolve_spring_damper_forces(
  compiled: CompiledSpringDamper[],
  positions: Map<string, Point2>,
  velocities: Map<string, Point2>,
): Map<string, Point2> {
  const forces = new Map<string, Point2>();
  const add_to = (key: string, v: Point2) => {
    const prev = forces.get(key);
    forces.set(key, prev ? prev.add(v) : v);
  };

  for (const sd of compiled) {
    const start = positions.get(sd.startKey);
    const end = positions.get(sd.endKey);
    if (!start || !end) continue;
    const delta = end.sub(start);
    const length = delta.length();
    if (length < 1e-9) continue;
    const axis = delta.mul(1 / length); // unit vector, start → end

    // Negative when the spring must pull the ends together (stretched) or the damper must
    // resist them separating — in both cases along `-axis`, i.e. toward `start`.
    const magnitude =
      sd.kind === "spring"
        ? -sd.stiffness * (length - sd.restLength)
        : -sd.damping * (velocities.get(sd.endKey) ?? ZERO)
            .sub(velocities.get(sd.startKey) ?? ZERO)
            .dot(axis);

    const onEnd = axis.mul(magnitude);
    add_to(sd.endKey, onEnd);
    add_to(sd.startKey, onEnd.mul(-1));
  }

  return forces;
}
