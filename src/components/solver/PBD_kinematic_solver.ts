import { Link, Point2 } from "../../types";
import { ConstraintResidual } from "../../types/runtime-state";
import {
  applyAngleConstraint,
  applyBeamFollowsAngleConstraint,
  applyBeltFollowsTangentConstraint,
  applyBeltJunctionConstraint,
  applyBeltLengthConstraint,
  applyBeltPhaseGearConstraint,
  applyBeltPinConstraint,
  applyCoaxialAngleConstraint,
  applyDistanceConstraint,
  applyDistanceToLineConstraint,
  applyEqualLengthConstraint,
  applyFixedOnSegmentConstraint,
  applyGearMeshAngleConstraint,
  applyGearMeshingConstraint,
  applyGearPerimeterPinConstraint,
  applyGearRatioConstraint,
  applyHandleGrabConstraint,
  applyHorizontalConstraint,
  applyKeepOrientationConstraint,
  applyMotorAngleConstraint,
  applyMotorBeamConstraint,
  applyNormalConstraint,
  applyParallelConstraint,
  applySlideOnSegmentConstraint,
  applyVerticalConstraint,
} from "./constraint-functions";

export type SolverMaps = {
  positions: Map<string, Point2>;
  posMasses: Map<string, number>;
  radii: Map<string, number>;
  radMasses: Map<string, number>;
  angles: Map<string, number>;
  /** Constraints left unsatisfied (only filled when collectDiagnostics is set). */
  unsatisfied?: ConstraintResidual[];
};

/** Above this residual (px for distances, rad for angles) a constraint is
 *  reported as unsatisfied. Heuristic: well above the convergence epsilon, but
 *  catches a genuinely violated (e.g. blocked) constraint. */
const DIAGNOSTIC_TOLERANCE = 1;

/*
 * PBD (Position Based Dynamics) solver shared by the geometric solver (edition)
 * and the kinematic simulation. Geometric links use positions/radii; simulation
 * links additionally use the angle maps.
 */
export function PBD_kinematic_solver(
  positions: Map<string, Point2>,
  radii: Map<string, number>,
  posMasses: Map<string, number>,
  radMasses: Map<string, number>,
  links: Link[],
  nbIterations: number = 200,
  epsilon: number = 0.000_001,
  angles: Map<string, number> = new Map(),
  collectDiagnostics: boolean = false,
): SolverMaps {
  // stop grab after `nbGrabIterations` to not stretch the mechanism
  const nbGrabIterations = 20;
  const grabStiffness = 0.5;
  const maxGrabAmplitude = 10;

  // Motors are soft drivers: they must yield to hard geometric constraints
  // (grounding, FixedOnSegment, Distance…) rather than fight them at equal
  // strength. With stiffness < 1 a free motor still converges fully to its
  // target over the iterations, but an over-constrained one (e.g. a grounded
  // body node pinning the driven beam) loses the tug-of-war and is reported
  // blocked instead of tearing the node off the beam.
  const motorStiffness = 0.5;

  // Per-link residual of the last executed iteration (for diagnostics). Springs
  // (soft by design) and grabs (transient) are never recorded here.
  const residuals = collectDiagnostics
    ? new Array<number>(links.length).fill(0)
    : null;

  let maxError: number = 0;
  for (let i = 0; i < nbIterations; i++) {
    maxError = 0;

    links.forEach((link, idx) => {
      let err = 0;
      let report = true; // surface in diagnostics
      switch (link.type) {
        case "Distance":
          err = applyDistanceConstraint(
            positions,
            posMasses,
            link.key1,
            link.key2,
            link.distance,
            1.0,
            link.preferredAxis,
          );
          break;
        case "DistanceToLine":
          err = applyDistanceToLineConstraint(
            positions,
            posMasses,
            link.key1,
            link.key2,
            link.key3,
            link.distance,
          );
          break;
        case "SlideOnSegment":
          err = applySlideOnSegmentConstraint(
            positions,
            posMasses,
            link.key1,
            link.key2,
            link.key3,
          );
          break;
        case "FixedOnSegment":
          err = applyFixedOnSegmentConstraint(
            positions,
            posMasses,
            link.key1,
            link.key2,
            link.key3,
            link.t,
          );
          break;
        case "KeepOrientation":
          err = applyKeepOrientationConstraint(
            positions,
            posMasses,
            link.key1,
            link.key2,
            link.direction,
          );
          break;
        case "Angle":
          err = applyAngleConstraint(
            positions,
            posMasses,
            link.key1,
            link.key2,
            link.key3,
            link.key4,
            link.flipStart,
            link.flipEnd,
            link.couterClockwise,
            link.angle_rad,
          );
          break;
        case "Radius":
          const stiffness = 1.0;
          const radius = radii.get(link.key1)!;
          const wRadius = radMasses.get(link.key1)!;
          const error = radius - link.radius;
          radii.set(link.key1, radius - error * wRadius * stiffness);
          err = Math.abs(error);
          break;
        case "Horizontal":
          err = applyHorizontalConstraint(
            positions,
            posMasses,
            link.key1,
            link.key2,
          );
          break;
        case "Vertical":
          err = applyVerticalConstraint(
            positions,
            posMasses,
            link.key1,
            link.key2,
          );
          break;
        case "Normal":
          err = applyNormalConstraint(
            positions,
            posMasses,
            link.key1,
            link.key2,
            link.key3,
            link.key4,
          );
          break;
        case "Parallel":
          err = applyParallelConstraint(
            positions,
            posMasses,
            link.key1,
            link.key2,
            link.key3,
            link.key4,
          );
          break;
        case "EqualLength":
          err = applyEqualLengthConstraint(
            positions,
            posMasses,
            link.key1,
            link.key2,
            link.key3,
            link.key4,
          );
          break;
        case "GearMeshing":
          err = applyGearMeshingConstraint(
            positions,
            posMasses,
            radii,
            radMasses,
            link.key1,
            link.key2,
            link.radKey1,
            link.radKey2,
          );
          break;
        case "GearRatio":
          err = applyGearRatioConstraint(
            radii,
            radMasses,
            link.radKey1,
            link.radKey2,
            link.ratio,
          );
          break;
        case "BeltLength":
          err = applyBeltLengthConstraint(
            positions,
            posMasses,
            angles,
            link,
            1.0,
            radii,
            radMasses,
          );
          break;
        case "BeltJunction":
          err = applyBeltJunctionConstraint(
            positions,
            posMasses,
            link.nodeKey,
            link.gearPosKeys,
            link.radii,
            link.directions,
            1.0,
            radii,
            link.radKeys,
          );
          break;
        case "BeltPin":
          err = applyBeltPinConstraint(
            positions,
            posMasses,
            angles,
            link.nodeKey,
            link.gearPosKeys,
            link.radii,
            link.directions,
            link.refIndex,
            link.refAngleKey,
            link.s0,
            link.thetaRef0,
            link.wraps,
            link.disconnected,
            link.closed ?? true,
            link.startKey,
            link.endKey,
          );
          break;
        case "BeltFollowsTangent":
          err = applyBeltFollowsTangentConstraint(
            positions,
            posMasses,
            angles,
            link.pivotKey,
            link.drivenKey,
            link.gearPosKeys,
            link.radii,
            link.directions,
            link.refIndex,
            link.refAngleKey,
            link.s0,
            link.thetaRef0,
            link.offset,
            link.disconnected,
          );
          break;
        case "BeltPhaseGear":
          err = applyBeltPhaseGearConstraint(
            angles,
            link.angleKey,
            link.phaseKey,
            link.r,
            link.eps,
            link.theta0,
          );
          break;
        case "MotorBeam":
          err = applyMotorBeamConstraint(
            positions,
            posMasses,
            link.pivotKey,
            link.drivenKey,
            link.targetAngle,
            motorStiffness,
          );
          break;
        case "MotorAngle":
          err = applyMotorAngleConstraint(
            angles,
            link.angleKey,
            link.targetAngle,
            motorStiffness,
          );
          break;
        case "GearMeshAngle":
          err = applyGearMeshAngleConstraint(
            angles,
            link.angleKey1,
            link.angleKey2,
            link.r1,
            link.r2,
            link.theta1_0,
            link.theta2_0,
            link.alpha0,
            link.alpha,
          );
          break;
        case "CoaxialAngle":
          err = applyCoaxialAngleConstraint(
            angles,
            link.angleKey1,
            link.angleKey2,
            link.offset,
          );
          break;
        case "GearPerimeterPin":
          err = applyGearPerimeterPinConstraint(
            positions,
            posMasses,
            angles,
            link.nodeKey,
            link.centerKey,
            link.angleKey,
            link.radius,
            link.offset,
          );
          break;
        case "BeamFollowsAngle":
          err = applyBeamFollowsAngleConstraint(
            positions,
            posMasses,
            angles,
            link.pivotKey,
            link.drivenKey,
            link.angleKey,
            link.offset,
          );
          break;
        case "Spring":
          // Soft pull toward restLength. Deliberately NOT folded into maxError:
          // a compliant spring fighting a rigid constraint never reaches zero
          // residual, which would defeat the `maxError < epsilon` early-out.
          // Rigid constraints alone define convergence; the spring just biases
          // any remaining free DOF toward its rest length. Never reported.
          applyDistanceConstraint(
            positions,
            posMasses,
            link.key1,
            link.key2,
            link.restLength,
            link.stiffness,
          );
          report = false;
          break;
        case "HandleGrab":
          // Transient interaction, not a constraint to report.
          report = false;
          if (i > nbGrabIterations) break;
          err = applyHandleGrabConstraint(
            positions,
            radii,
            posMasses,
            link.grabbedKey,
            link.value,
            grabStiffness,
            maxGrabAmplitude,
          );
          break;
      }

      // Spring is soft by design → excluded from convergence; everything else
      // (incl. the grab while active) drives maxError.
      if (link.type !== "Spring") maxError = Math.max(maxError, err);
      if (residuals && report) residuals[idx] = err;
    });

    if (maxError < epsilon) break;
  }

  // Build the unsatisfied-constraint list from the last iteration's residuals.
  // Converged links sit below DIAGNOSTIC_TOLERANCE and are dropped; a blocked
  // mechanism leaves the violated links above it.
  let unsatisfied: ConstraintResidual[] | undefined;
  if (residuals) {
    unsatisfied = [];
    links.forEach((link, idx) => {
      const residual = residuals[idx];
      if (residual > DIAGNOSTIC_TOLERANCE && link.owner !== undefined)
        unsatisfied!.push({ owner: link.owner, type: link.type, residual });
    });
  }

  return { positions, radii, posMasses, radMasses, angles, unsatisfied };
}
