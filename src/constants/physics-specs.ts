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
  SLIDING_FRICTION: 0.01,
  ROTATIONAL_FRICTION: 0.001,
  /** Collision restitution: 0 = fully inelastic (the pre-bounce default — a collision just
   *  stops what it blocks), 1 = elastic (bounces back at the same speed it arrived). */
  RESTITUTION: 0.9,
} as const;

/**
 * Below this fraction of a `NegligibilityPool` field's own running max, a value reads as
 * negligible — hidden on a canvas overlay, flattened on a probe/cohesion chart (see
 * `negligibility-pool.ts`'s `is_negligible`). One ratio shared by every quantity kind
 * (force, moment, length, angle, linear/angular velocity): a product decision, not derived
 * from anything else, so it lives here rather than being tuned per call site.
 */
export const NEGLIGIBLE_RATIO = 0.01;

/**
 * Absolute floors a `NegligibilityPool` field's running max is never allowed below, even
 * when nothing bigger was ever recorded — without this, a mechanism that only ever produces
 * noise of one kind (nothing larger of that kind anywhere in the recording) sets its own
 * pool scale from that noise, so `NEGLIGIBLE_RATIO` has nothing to filter it against (see
 * `negligibility-pool.ts`'s `extend_negligibility_pool`). Only `MIN_LENGTH`/`MIN_ANGLE`/
 * `MIN_TIME` are independent product decisions: force reuses `LOAD_SCALING.MIN_VALUE` (the
 * smallest force this app ever bothers drawing distinctly), and `force`/`moment`/velocities
 * derive from these plus the mechanism's own bounding-box diagonal wherever their physical
 * dimension allows it (a moment's lever arm, a velocity's own distance-over-time) — see
 * `pool_floors`.
 */
export const MIN_LENGTH_POOL = 0.01; // m
export const MIN_ANGLE_POOL = 0.01; // rad
export const MIN_TIME_POOL = 1; // s
