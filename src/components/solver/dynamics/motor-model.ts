import { ID, Link, MechanicalElement, Point2 } from "../../../types";
import { ZERO } from "../../../types/point2";

/**
 * A `MotorBeam`/`MotorAngle` LINK, plus the torque limit its owning pivot's `MotorConfig`
 * carries — the one thing the link itself does not, since `parsing.ts` builds it for the
 * quasi-static kinematic sweep, which has no notion of torque at all.
 *
 * Built from the already-compiled links rather than re-deriving which beams/gears a motor
 * drives from the raw mechanism: `parsing.ts`'s arm/anchor resolution (grounded vs mounted on
 * another beam, `motor_arm`) is exactly reused this way, keys already fused.
 */
export type CompiledMotor =
  | {
      kind: "beam";
      pivotKey: string;
      drivenKey: string;
      /** The beam this one turns relative to, when not grounded — same pivot. */
      anchorKey?: string;
      omega: number;
      torqueLimit: number;
      /** The driven beam's own analytic moment of inertia about `pivotKey` — see
       *  `MotorBeam.armInertia`. */
      armInertia: number;
      /** This beam's own share of `drivenKey`'s fused mass — see `MotorBeam.armEndMass`. */
      armEndMass: number;
    }
  | {
      kind: "angle";
      angleKey: string;
      /** The anchor arm's own pivot/end, when this gear turns relative to a beam rather than
       *  the ground — a gear has no angle DOF of its own to read the anchor's rotation off. */
      anchorPivotKey?: string;
      anchorKey?: string;
      omega: number;
      torqueLimit: number;
    };

export function compile_motors(
  links: Link[],
  mechanicalElements: MechanicalElement[],
): CompiledMotor[] {
  const byID = new Map<ID, MechanicalElement>(
    mechanicalElements.map((el) => [el.id, el]),
  );
  const torqueLimitOf = (owner: ID | undefined): number | undefined => {
    const pivot = owner !== undefined ? byID.get(owner) : undefined;
    return pivot && "motor" in pivot ? pivot.motor?.torque : undefined;
  };

  const motors: CompiledMotor[] = [];
  for (const link of links) {
    if (link.type === "MotorBeam") {
      const torqueLimit = torqueLimitOf(link.owner);
      if (torqueLimit === undefined) continue;
      motors.push({
        kind: "beam",
        pivotKey: link.pivotKey,
        drivenKey: link.drivenKey,
        anchorKey: link.anchorKey,
        omega: link.omega,
        torqueLimit,
        armInertia: link.armInertia,
        armEndMass: link.armEndMass,
      });
    } else if (link.type === "MotorAngle") {
      const torqueLimit = torqueLimitOf(link.owner);
      if (torqueLimit === undefined) continue;
      motors.push({
        kind: "angle",
        angleKey: link.angleKey,
        anchorPivotKey: link.anchorPivotKey,
        anchorKey: link.anchorKey,
        omega: link.omega,
        torqueLimit,
      });
    }
  }
  return motors;
}

/** Angular velocity of the arm `pivotKey → armKey` about `pivotKey`, positive
 *  counter-clockwise — `undefined` where either end is missing or the arm has collapsed. */
function arm_angular_velocity(
  pivotKey: string,
  armKey: string,
  positions: Map<string, Point2>,
  velocities: Map<string, Point2>,
): number | undefined {
  const pivot = positions.get(pivotKey);
  const arm = positions.get(armKey);
  if (!pivot || !arm) return undefined;
  const rVec = arm.sub(pivot);
  const r = rVec.length();
  if (r < 1e-6) return undefined;
  const tHat = rVec.perp().mul(1 / r);
  const relV = (velocities.get(armKey) ?? ZERO).sub(velocities.get(pivotKey) ?? ZERO);
  return relV.dot(tHat) / r;
}

const clamp = (v: number, limit: number): number =>
  Math.max(-limit, Math.min(limit, v));

/**
 * Torque-limited speed control: each motor asks for whatever torque would close its own
 * velocity gap in exactly this frame — `(ω_commanded − ω_current)·J/dt`, an inertia
 * estimate) — capped at its `torqueLimit`. Under a light load that request sits under the
 * cap, so the motor reaches its commanded speed in one frame, same as the kinematic sweep's
 * position tracking always did. Under a heavy one it saturates: the motor supplies its
 * maximum torque and no more, and how fast it actually turns falls out of the constraint
 * sweep like any other force — a real motor slowing under load rather than always winning
 * the tug-of-war.
 *
 * `MotorBeam`'s `J` is the driven beam's own analytic inertia about the pivot
 * (`armInertia`, parallel-axis theorem — see `parsing.ts`'s `beam_pivot_inertia`) plus
 * whatever ELSE is fused onto the driven node (another beam, a gear, a mass element)
 * approximated as a point at the arm's current radius — `armEndMass` is subtracted back out
 * of that node's fused mass first, so the beam's own share is never counted twice. `MotorAngle`
 * drives a gear's real angle DOF, so its `J` is the real one (`mass-model.ts`'s `angleMasses`,
 * ½mr² for a solid disk), no such split needed.
 *
 * Reads velocities EXCLUSIVELY relative to each motor's own reference (the ground, or its
 * anchor arm) — computed fresh from live positions/velocities, so a moving anchor needs no
 * separate bookkeeping the way the kinematic sweep's per-frame `targetAngle` refresh does.
 */
export function resolve_motor_torques(
  motors: CompiledMotor[],
  dt: number,
  positions: Map<string, Point2>,
  velocities: Map<string, Point2>,
  angleVelocities: Map<string, number>,
  posMasses: Map<string, number>,
  angleMasses: Map<string, number>,
): { forces: Map<string, Point2>; torques: Map<string, number> } {
  const forces = new Map<string, Point2>();
  const torques = new Map<string, number>();
  const add_force = (key: string, v: Point2) => {
    const prev = forces.get(key);
    forces.set(key, prev ? prev.add(v) : v);
  };

  for (const motor of motors) {
    if (motor.kind === "angle") {
      const wAngle = angleMasses.get(motor.angleKey) ?? 1;
      if (wAngle <= 0) continue; // infinite inertia: nothing torque could turn
      const ownV = angleVelocities.get(motor.angleKey) ?? 0;
      const refV =
        motor.anchorPivotKey && motor.anchorKey
          ? (arm_angular_velocity(
              motor.anchorPivotKey,
              motor.anchorKey,
              positions,
              velocities,
            ) ?? 0)
          : 0;
      const needed = ((motor.omega - (ownV - refV)) / wAngle) / dt;
      const applied = clamp(needed, motor.torqueLimit);
      torques.set(motor.angleKey, (torques.get(motor.angleKey) ?? 0) + applied);
    } else {
      const w = posMasses.get(motor.drivenKey) ?? 1;
      if (w <= 0) continue; // driven end anchored: nothing to push
      const pivot = positions.get(motor.pivotKey);
      const driven = positions.get(motor.drivenKey);
      if (!pivot || !driven) continue;
      const rVec = driven.sub(pivot);
      const r = rVec.length();
      if (r < 1e-6) continue;
      const ownV = arm_angular_velocity(motor.pivotKey, motor.drivenKey, positions, velocities);
      if (ownV === undefined) continue;
      const refV = motor.anchorKey
        ? (arm_angular_velocity(motor.pivotKey, motor.anchorKey, positions, velocities) ?? 0)
        : 0;
      // This beam's own share of the driven node's fused mass is already counted, exactly,
      // in `armInertia` — only the REST of that mass (something else welded to the same
      // node) still needs the point-at-radius approximation.
      const otherMass = Math.max(0, 1 / w - motor.armEndMass);
      const J = motor.armInertia + otherMass * r * r;
      const needed = ((motor.omega - (ownV - refV)) * J) / dt;
      const applied = clamp(needed, motor.torqueLimit);
      const tHat = rVec.perp().mul(1 / r);
      const F = tHat.mul(applied / r);
      add_force(motor.drivenKey, F);
      add_force(motor.pivotKey, F.mul(-1)); // reaction; inert if the pivot is anchored
    }
  }

  return { forces, torques };
}
