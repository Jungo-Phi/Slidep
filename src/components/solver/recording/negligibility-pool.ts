import {
  ConstraintElement,
  DynamicSnapshot,
  MechanicalElement,
  NegligibilityFloors,
  NegligibilityPool,
  ProbeMetric,
} from "../../../types";
import { LOAD_SCALING } from "../../../constants/physics-display-specs";
import { MIN_ANGLE_POOL, MIN_LENGTH_POOL, MIN_TIME_POOL, NEGLIGIBLE_RATIO } from "../../../constants/physics-specs";
import { mechanism_bounds } from "../../../utils/mechanism-bounds";
import {
  ANGLE,
  ANGULAR_VELOCITY,
  FORCE,
  LENGTH,
  LINEAR_VELOCITY,
  MOMENT,
  POWER,
  QuantityKind,
} from "../../../utils/quantity-format";

export { NEGLIGIBLE_RATIO };

/**
 * Whether `value` is small enough, next to `poolMax` (its own kind's running max), to read
 * as noise rather than a real reading. `poolMax` of 0 means nothing of this kind has ever
 * been seen — nothing is negligible against an empty pool.
 */
export function is_negligible(value: number, poolMax: number): boolean {
  return poolMax > 0 && Math.abs(value) < NEGLIGIBLE_RATIO * poolMax;
}

/**
 * The absolute, geometry-independent-where-it-must-be-so floor each pool field is seeded
 * from (see `extend_negligibility_pool`) — never derived from anything ever recorded, so a
 * mechanism that only ever produces noise of one kind still has a real scale to be judged
 * negligible against. `boundsDiagonal` is the mechanism's own bounding-box diagonal (0 for a
 * degenerate/empty one): `length` is the only field the mechanism's size enters directly,
 * so it seeds `moment` (force × lever arm) and the velocities (distance / `MIN_TIME_POOL`)
 * in turn; `angle` and `force` have no such lever, so each is its own flat constant.
 */
export function pool_floors(boundsDiagonal: number): NegligibilityFloors {
  const length = Math.max(boundsDiagonal, MIN_LENGTH_POOL);
  const force = LOAD_SCALING.MIN_VALUE;
  const linearVelocity = length / MIN_TIME_POOL;
  return {
    length,
    angle: MIN_ANGLE_POOL,
    force,
    moment: force * length,
    linearVelocity,
    angularVelocity: MIN_ANGLE_POOL / MIN_TIME_POOL,
    power: force * linearVelocity,
  };
}

/**
 * Extends `cache` with whatever snapshots were recorded since the last call — an append,
 * never a rescan, same reasoning as `StressScaleCache`/`extend_stress_scale`
 * (`cohesion-field.ts`): redoing the whole history every frame would cost the square of the
 * recording's length. An edit (different `elements`/`constraints`) or a rewound/truncated
 * history (fewer snapshots than already consumed) rebuilds from scratch instead — the
 * running maxima cannot just keep whatever a now-discarded future once recorded.
 */
export function extend_negligibility_pool(
  cache: NegligibilityPool,
  elements: MechanicalElement[],
  constraints: ConstraintElement[],
  snapshots: DynamicSnapshot[],
): NegligibilityPool {
  const appendable =
    cache.elements === elements &&
    cache.constraints === constraints &&
    snapshots.length >= cache.consumed &&
    (cache.consumed === 0 || snapshots[cache.consumed - 1] === cache.boundary);

  let { length, angle, force, moment, linearVelocity, angularVelocity, power, floors } =
    cache;
  if (!appendable) {
    const bounds = mechanism_bounds(elements, constraints);
    floors = pool_floors(bounds ? bounds.min.distance_to(bounds.max) : 0);
    ({ length, angle, force, moment, linearVelocity, angularVelocity, power } = floors);
  }

  // The reference instant displacement/angle are measured against — always the
  // recording's very first snapshot, "at rest", so the pool reflects how far anything has
  // ever strayed rather than a moving target.
  const ref = snapshots.length > 0 ? snapshots[0] : null;
  for (let i = appendable ? cache.consumed : 0; i < snapshots.length; i++) {
    const snap = snapshots[i];
    for (let k = 0; k < snap.layout.keys.length; k++) {
      const vx = snap.velocities[2 * k];
      if (!Number.isNaN(vx)) {
        const vy = snap.velocities[2 * k + 1];
        linearVelocity = Math.max(linearVelocity, Math.hypot(vx, vy));
      }
      if (ref) {
        const px = snap.positions[2 * k];
        const rx = ref.positions[2 * k];
        if (!Number.isNaN(px) && !Number.isNaN(rx)) {
          const py = snap.positions[2 * k + 1];
          const ry = ref.positions[2 * k + 1];
          length = Math.max(length, Math.hypot(px - rx, py - ry));
        }
      }
    }
    for (let k = 0; k < snap.layout.angleKeys.length; k++) {
      const av = snap.angleVelocities[k];
      if (!Number.isNaN(av)) angularVelocity = Math.max(angularVelocity, Math.abs(av));
      if (ref) {
        const a = snap.angles[k];
        const ra = ref.angles[k];
        if (!Number.isNaN(a) && !Number.isNaN(ra))
          angle = Math.max(angle, Math.abs(a - ra));
      }
    }
    if (snap.reactions) {
      for (const r of snap.reactions) {
        if (r.kind === "force") {
          if (!Number.isNaN(r.fx) && !Number.isNaN(r.fy))
            force = Math.max(force, Math.hypot(r.fx, r.fy));
        } else if (!Number.isNaN(r.torque)) {
          moment = Math.max(moment, Math.abs(r.torque));
        }
      }
    }
    if (snap.motorPower) {
      for (const p of snap.motorPower)
        if (!Number.isNaN(p.watts)) power = Math.max(power, Math.abs(p.watts));
    }
  }

  return {
    elements,
    constraints,
    consumed: snapshots.length,
    boundary: snapshots.length > 0 ? snapshots[snapshots.length - 1] : null,
    length,
    angle,
    force,
    moment,
    linearVelocity,
    angularVelocity,
    power,
    floors,
  };
}

/** Which `NegligibilityPool` field bounds a given probe metric's own kind — the one lookup
 *  a new metric needs to join the negligibility rule, no new threshold to invent. */
export function pool_key_for_metric(
  metric: ProbeMetric,
): keyof Pick<
  NegligibilityPool,
  | "length"
  | "angle"
  | "force"
  | "moment"
  | "linearVelocity"
  | "angularVelocity"
  | "power"
> {
  switch (metric) {
    case "position":
      return "length";
    case "velocity":
      return "linearVelocity";
    case "angle":
      return "angle";
    case "angular-velocity":
      return "angularVelocity";
    case "motor-power":
      return "power";
    case "force":
    case "force-start":
    case "force-end":
      return "force";
    case "moment":
    case "moment-start":
    case "moment-end":
      return "moment";
  }
}

/**
 * Which `QuantityKind` a probe metric's value formats as — `format_quantity`'s own adaptive
 * SI prefix (mN, µN, kN…) is what actually solves "how to show a small value" rather than a
 * fixed-decimals formatter rounding it away to "0.00": a real reading stays legible however
 * small it is next to the mechanism, and a genuinely zero one is caught on its own numeric
 * merit instead (see `ProbeChart`'s absolute-epsilon check), not because formatting hid it.
 */
export function quantity_kind_for_metric(metric: ProbeMetric): QuantityKind {
  switch (metric) {
    case "position":
      return LENGTH;
    case "velocity":
      return LINEAR_VELOCITY;
    case "angle":
      return ANGLE;
    case "angular-velocity":
      return ANGULAR_VELOCITY();
    case "motor-power":
      return POWER;
    case "force":
    case "force-start":
    case "force-end":
      return FORCE;
    case "moment":
    case "moment-start":
    case "moment-end":
      return MOMENT;
  }
}

/** Metrics whose zero is an arbitrary reference (the canvas origin, an orientation
 *  convention) rather than a real physical state — forcing it into a chart's axis would
 *  squash a real reading that happens to sit far from it. An exception list, not an
 *  inclusion list: everything else defaults to showing zero, since for a force, a
 *  velocity, a moment, an angular velocity, zero IS a meaningful state ("at rest", "no
 *  load") — a new metric should get that for free rather than needing to ask for it. */
const METRICS_WITH_ARBITRARY_ZERO: ReadonlySet<ProbeMetric> = new Set([
  "position",
  "angle",
]);

/** Whether a chart of this metric should force `0` into its visible y-range. */
export function metric_shows_zero(metric: ProbeMetric): boolean {
  return !METRICS_WITH_ARBITRARY_ZERO.has(metric);
}
