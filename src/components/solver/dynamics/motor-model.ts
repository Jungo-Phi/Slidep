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

/** What a motor can deliver at its commanded speed, W: its torque limit times that speed, zero for a motor that holds still. */
export function motor_available_power(motor: { torque: number; speed: number }): number {
  return motor.torque * Math.abs(motor.speed);
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
          saturated: false,
        }
      : {
          kind: "angle",
          angleKey: motor.angleKey,
          anchorPivotKey: motor.anchorPivotKey,
          anchorKey: motor.anchorKey,
          omega: motor.omega,
          torqueLimit: motor.torqueLimit,
          torque: 0,
          saturated: false,
        },
  );
}

/** The joint's speed relative to what the motor turns against, rad/s counter-clockwise, or `undefined` where it cannot be read. */
function relative_speed(
  motor: CompiledMotor,
  positions: Map<string, Point2>,
  velocities: Map<string, Point2>,
  angleVelocities: Map<string, number>,
): number | undefined {
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
  return own === undefined ? undefined : own - against;
}

/**
 * What each motor did over the substep just solved: the torque its drive settled on, the speed the joint actually reached, and the power the one carries at the other.
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
    const { torque: nm, saturated } = drives[i];
    const speed = relative_speed(motor, positions, velocities, angleVelocities) ?? 0;
    return { pivotID: motor.pivotID, nm, watts: nm * speed, speed, saturated };
  });
}

/**
 * Below this fraction of its commanded speed, in the commanded sense, a motor that is not gaining speed is stalled: standing still, crawling, or turned backwards by its load.
 * Near zero rather than the kinematic mode's half: a motor at its torque limit against a steady load can settle well below its command and still be driving it.
 */
const STALL_SPEED_FRACTION = 0.05;

/**
 * Above this acceleration, as a share of the commanded speed per second, a slow motor is still starting rather than stalled: 0.1 % would take it some 17 minutes to reach its command.
 *
 * Scaled to the command rather than absolute because the noise it must clear is not the solver's alone.
 * A joint held still by tight contacts at the torque limit jitters by some 1e-7 rad/s from one frame to the next, which reads as ±1.5e-5 rad/s²: well under this threshold on `Pince` (4e-4 there), where a floor at the solver's own noise would read every other frame as a restart.
 * Low enough still for a heavy load to be starting: a 1 N·m motor spinning up 10 kg·m² towards 10 rad/s gains 0.1 rad/s², ten times this.
 */
const GAIN_RATE = 1e-3;

/**
 * Above this speed, rad/s, a motor commanded to stand still is slipping — about a turn in an hour and three quarters.
 * Absolute because a zero command has no speed of its own to scale against.
 */
const HOLD_SPEED_FLOOR = 1e-3;

/**
 * How long, s, a stalled motor must run again without a break before it reads as running.
 * A stall only ever starts at once; this is its release.
 * Jaws closing on a part bounce on it, and the motor behind them alternates between being thrown back and catching up with its command — up to its full speed for 50 to 75 ms at a time on `Pince` — a release on every catch-up would flicker the stall a dozen times in under a second.
 */
const STALL_RELEASE_TIME = 0.10;

export type StallTuning = {
  stallSpeedFraction?: number;
  gainRate?: number;
  holdSpeedFloor?: number;
  releaseTime?: number;
};

/**
 * The motors the mechanism is not following at the end of a frame, by pivot ID.
 * A turning motor stalls when its joint is near standstill or turning backwards and not gaining speed the commanded way, whatever holds it there; one commanded to stand still stalls when its load makes it slip past its torque limit.
 * Overspeed is not a stall: a load driving the joint faster than commanded still turns it the commanded way.
 * A stall holds until the motor has run again for `STALL_RELEASE_TIME` without a break; the time it has run so far is written into its sample's `freeFor`.
 * `samples` must be `motor_samples(motors, …)`'s output, in the same order; `previous` and `previousStalled` are the last frame's, absent at a standing start.
 */
export function stalled_motors(
  motors: CompiledMotor[],
  samples: MotorSample[],
  previous: MotorSample[] | undefined,
  previousStalled: ID[] | undefined,
  dt: number,
  tuning: StallTuning = {},
): ID[] {
  const {
    stallSpeedFraction = STALL_SPEED_FRACTION,
    gainRate = GAIN_RATE,
    holdSpeedFloor = HOLD_SPEED_FLOOR,
    releaseTime = STALL_RELEASE_TIME,
  } = tuning;
  /** What this frame alone says, before the hysteresis. */
  const stalledNow = (motor: CompiledMotor, sample: MotorSample, before: MotorSample | undefined) => {
    const { speed, saturated } = sample;
    if (motor.omega === 0) return saturated && Math.abs(speed) > holdSpeedFloor;
    const sense = Math.sign(motor.omega);
    const along = speed * sense;
    if (along >= stallSpeedFraction * Math.abs(motor.omega)) return false;
    const gaining =
      along > 0 && (along - (before?.speed ?? 0) * sense) / dt > gainRate * Math.abs(motor.omega);
    return !gaining;
  };

  const stalled: ID[] = [];
  motors.forEach((motor, i) => {
    const sample = samples[i];
    const before = previous?.find((p) => p.pivotID === motor.pivotID);
    if (stalledNow(motor, sample, before)) {
      stalled.push(motor.pivotID);
      return;
    }
    if (!previousStalled?.includes(motor.pivotID)) return;
    const freeFor = (before?.freeFor ?? 0) + dt;
    // A sum of steps lands a hair short of the time it adds up to.
    if (freeFor >= releaseTime - 1e-9) return;
    sample.freeFor = freeFor;
    stalled.push(motor.pivotID);
  });
  return stalled;
}
