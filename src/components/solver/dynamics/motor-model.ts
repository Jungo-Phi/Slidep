import { ID, Link, MechanicalElement, Point2 } from "../../../types";
import { ZERO } from "../../../types/point2";
import { MotorSample } from "../../../types/runtime-state";
import { Drive } from "./drive-constraint";

/**
 * A `MotorBeam`/`MotorAngle` LINK, plus the torque limit its owning pivot's `MotorConfig` carries — the one thing the link itself does not, since `parsing.ts` builds it for the quasi-static kinematic sweep, which has no notion of torque at all.
 *
 * Built from the already-compiled links rather than re-deriving which beams/gears a motor drives from the raw mechanism: `parsing.ts`'s arm/anchor resolution (grounded vs mounted on another beam, `motor_arm`) is exactly reused this way, keys already fused.
 */
export type CompiledMotor =
  | {
      kind: "beam";
      /** The pivot ELEMENT this motor is configured on — distinct from `pivotKey`, its
       * solver key: this is what a probe or the properties panel names the reading after. */
      pivotID: ID;
      pivotKey: string;
      drivenKey: string;
      /** The beam this one turns relative to, when not grounded — same pivot. */
      anchorKey?: string;
      omega: number;
      torqueLimit: number;
    }
  | {
      kind: "angle";
      /** See the `beam` variant's own field. */
      pivotID: ID;
      angleKey: string;
      /** The anchor arm's own pivot/end, when this gear turns relative to a beam rather than
       * the ground — a gear has no angle DOF of its own to read the anchor's rotation off. */
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
        pivotID: link.owner!,
        pivotKey: link.pivotKey,
        drivenKey: link.drivenKey,
        anchorKey: link.anchorKey,
        omega: link.omega,
        torqueLimit,
      });
    } else if (link.type === "MotorAngle") {
      const torqueLimit = torqueLimitOf(link.owner);
      if (torqueLimit === undefined) continue;
      motors.push({
        kind: "angle",
        pivotID: link.owner!,
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
 * counter-clockwise — `undefined` where either end is missing or the arm has collapsed. */
export function arm_angular_velocity(
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

/** One `Drive` per motor, fresh for a substep's solve to write its torque into. */
export function drives_of(motors: CompiledMotor[]): Drive[] {
  return motors.map((motor) =>
    motor.kind === "beam"
      ? {
          kind: "beam",
          pivotKey: motor.pivotKey,
          drivenKey: motor.drivenKey,
          anchorKey: motor.anchorKey,
          omega: motor.omega,
          torqueLimit: motor.torqueLimit,
          torque: 0,
        }
      : {
          kind: "angle",
          angleKey: motor.angleKey,
          anchorPivotKey: motor.anchorPivotKey,
          anchorKey: motor.anchorKey,
          omega: motor.omega,
          torqueLimit: motor.torqueLimit,
          torque: 0,
        },
  );
}

/**
 * What each motor did over the substep just solved: the torque its drive settled on, and the power that torque delivers at the speed the joint actually reached.
 * `drives` must be `drives_of(motors)`'s output, in the same order.
 */
export function motor_samples(
  motors: CompiledMotor[],
  drives: Drive[],
  positions: Map<string, Point2>,
  velocities: Map<string, Point2>,
  angleVelocities: Map<string, number>,
): MotorSample[] {
  return motors.map((motor, i) => {
    const nm = drives[i].torque;
    let own: number | undefined;
    let against = 0;
    if (motor.kind === "beam") {
      own = arm_angular_velocity(motor.pivotKey, motor.drivenKey, positions, velocities);
      if (motor.anchorKey)
        against = arm_angular_velocity(motor.pivotKey, motor.anchorKey, positions, velocities) ?? 0;
    } else {
      own = angleVelocities.get(motor.angleKey);
      if (motor.anchorPivotKey && motor.anchorKey)
        against =
          arm_angular_velocity(motor.anchorPivotKey, motor.anchorKey, positions, velocities) ?? 0;
    }
    return { pivotID: motor.pivotID, nm, watts: own === undefined ? 0 : nm * (own - against) };
  });
}
