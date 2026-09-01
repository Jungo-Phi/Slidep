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
