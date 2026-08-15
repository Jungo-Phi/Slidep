import { DOWN } from "../types";

export const GRAVITY = DOWN.mul(9.81); // m/s^2

export const DEFAULT = {
  LINEAR_MASS: 1, // kg/m
  SURFACE_MASS: 1, // kg/m^2
  MOTOR_SPEED: 10, // tr/min
  MASS: 1, // kg
  STIFFNESS: 100, // N/m
  DAMPING: 0.5, // N·s/m
  SLIDING_FRICTION: 0.01,
  ROTATIONAL_FRICTION: 0.001,
} as const;
