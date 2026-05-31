import { Link, Nodes, Point2 } from "../../types";
import {
  applyAngleConstraint,
  applyAtSegmentRatioConstraint,
  applyDistanceConstraint,
  applyDistanceToLineConstraint,
  applyEqualLengthConstraint,
  applyGearMeshingConstraint,
  applyGearRatioConstraint,
  applyHandleGrabConstraint,
  applyHorizontalConstraint,
  applyKeepOrientationConstraint,
  applyNormalConstraint,
  applyOnSegmentConstraint,
  applyParallelConstraint,
  applyVerticalConstraint,
} from "./constraint-functions";

/*
 * PBD (Position Based Dynamics) kinematic solver
 */
export function PBD_kinematic_solver(
  positions: Map<string, Point2>,
  radii: Map<string, number>,
  posMasses: Map<string, number>,
  radMasses: Map<string, number>,
  links: Link[],
  nbIterations: number = 100,
  epsilon: number = 0.000_001,
): Nodes {
  // stop grab after `nbGrabIterations` to not stretch the mechanism
  const nbGrabIterations = 10;
  const grabStiffness = 0.5;
  const maxGrabAmplitude = 10;

  let maxError: number = 0;
  for (let i = 0; i < nbIterations; i++) {
    maxError = 0;

    links.forEach((link) => {
      switch (link.type) {
        case "Distance":
          maxError = Math.max(
            maxError,
            applyDistanceConstraint(
              positions,
              posMasses,
              link.key1,
              link.key2,
              link.distance,
            ),
          );
          break;
        case "DistanceToLine":
          maxError = Math.max(
            maxError,
            applyDistanceToLineConstraint(
              positions,
              posMasses,
              link.key1,
              link.key2,
              link.key3,
              link.distance,
            ),
          );
          break;
        case "OnSegment":
          maxError = Math.max(
            maxError,
            applyOnSegmentConstraint(
              positions,
              posMasses,
              link.key1,
              link.key2,
              link.key3,
            ),
          );
          break;
        case "AtSegmentRatio":
          maxError = Math.max(
            maxError,
            applyAtSegmentRatioConstraint(
              positions,
              posMasses,
              link.key1,
              link.key2,
              link.key3,
              link.t,
            ),
          );
          break;
        case "KeepOrientation":
          maxError = Math.max(
            maxError,
            applyKeepOrientationConstraint(
              positions,
              posMasses,
              link.key1,
              link.key2,
              link.direction,
            ),
          );
          break;
        case "Angle":
          maxError = Math.max(
            maxError,
            applyAngleConstraint(
              positions,
              posMasses,
              link.key1,
              link.key2,
              link.key3,
              link.key4,
              link.angle,
            ),
          );
          break;
        case "Radius":
          const stiffness = 1.0;
          const radius = radii.get(link.key1)!;
          const wRadius = radMasses.get(link.key1)!;
          const error = radius - link.radius;
          radii.set(link.key1, radius - error * wRadius * stiffness);
          maxError = Math.max(maxError, error);
          break;
        case "Horizontal":
          maxError = Math.max(
            maxError,
            applyHorizontalConstraint(
              positions,
              posMasses,
              link.key1,
              link.key2,
            ),
          );
          break;
        case "Vertical":
          maxError = Math.max(
            maxError,
            applyVerticalConstraint(positions, posMasses, link.key1, link.key2),
          );
          break;
        case "Normal":
          maxError = Math.max(
            maxError,
            applyNormalConstraint(
              positions,
              posMasses,
              link.key1,
              link.key2,
              link.key3,
              link.key4,
            ),
          );
          break;
        case "Parallel":
          maxError = Math.max(
            maxError,
            applyParallelConstraint(
              positions,
              posMasses,
              link.key1,
              link.key2,
              link.key3,
              link.key4,
            ),
          );
          break;
        case "EqualLength":
          maxError = Math.max(
            maxError,
            applyEqualLengthConstraint(
              positions,
              posMasses,
              link.key1,
              link.key2,
              link.key3,
              link.key4,
            ),
          );
          break;
        case "GearMeshing":
          maxError = Math.max(
            maxError,
            applyGearMeshingConstraint(
              positions,
              posMasses,
              radii,
              radMasses,
              link.key1,
              link.key2,
            ),
          );
          break;
        case "GearRatio":
          maxError = Math.max(
            maxError,
            applyGearRatioConstraint(
              radii,
              radMasses,
              link.key1,
              link.key2,
              link.ratio,
            ),
          );
          break;
        case "HandleGrab":
          if (i > nbGrabIterations) break;
          maxError = Math.max(
            maxError,
            applyHandleGrabConstraint(
              positions,
              radii,
              link.grabbedKey,
              link.value,
              grabStiffness,
              maxGrabAmplitude,
            ),
          );
          break;
      }
    });

    if (maxError < epsilon) {
      console.log("nbIterations : ", i);
      break;
    }
  }
  return { positions, radii, posMasses, radMasses };
}
