import { DOWN } from "../types";

export const GRAVITY = DOWN.mul(9.81); // m/s^2

export const DEFAULT = {
  LINEAR_MASS: 1, // kg/m
  SURFACE_MASS: 10, // kg/m^2 (a 1.27 mm thick steel disk)
  MOTOR_SPEED: (10 * 2 * Math.PI) / 60, // rad/s (10 tr/min)
  MOTOR_TORQUE: 1, // N·m
  MASS: 1, // kg
  STIFFNESS: 100, // N/m
  DAMPING: 0.5, // kg/s (= N·s/m)
  SLIDING_FRICTION: 0.1, // N·s/m (viscous, same quantity as DAMPING)
  /**
   * N·m·s/rad, viscous.
   *
   * No single value suits every joint: the inertia this competes against spans three decades, from a 40 mm gear (~4e-5 kg·m²) to a 0.5 m beam swinging about its end (~4e-2 kg·m²).
   * Here the beam's speed decays over ~40 s while the gear is held within ~40 ms, so a gear train wants it turned down.
   */
  ROTATIONAL_FRICTION: 0.001,
  /** Collision restitution: 0 = fully inelastic (the pre-bounce default — a collision just
   * stops what it blocks), 1 = elastic (bounces back at the same speed it arrived). */
  RESTITUTION: 0.9,
} as const;

/**
 * Below this fraction of a reference scale, a value reads as negligible — hidden on a canvas overlay, flattened on a probe/cohesion chart (see `negligibility-pool.ts`'s `is_negligible`, and `own_floors` for the chart case).
 * The reference scale differs by caller: a `NegligibilityPool` field's own running max for `is_negligible`, the mechanism's own bounding-box diagonal for `own_floors`.
 * One ratio shared by every quantity kind (force, moment, length, angle, linear/angular velocity) and every caller: a product decision, not derived from anything else, so it lives here rather than being tuned per call site.
 */
export const NEGLIGIBLE_RATIO = 0.001;

/**
 * The fallback floor for a mechanism with no measurable size at all — `boundsDiagonal` exactly 0, from an empty mechanism or one collapsed to a single point (see `pool_floors` and `own_floors` in `negligibility-pool.ts`).
 * Any actual size, however small, is used as its own scale instead: `NEGLIGIBLE_RATIO` still has something real to filter noise against.
 * `MIN_ANGLE_POOL`/`MIN_TIME_POOL` need no such fallback — angle and time floors are always their own flat constants, never derived from the mechanism's size.
 */
export const MIN_LENGTH_POOL = 0.01; // m
export const MIN_ANGLE_POOL = 0.01; // rad
export const MIN_TIME_POOL = 1; // s
