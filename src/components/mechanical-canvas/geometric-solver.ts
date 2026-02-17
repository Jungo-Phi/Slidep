import {
  Action,
  ConstraintElement,
  MechanicalElement,
  ID,
  GearElement,
  BeltElement,
} from "../../types";
import { Point2 } from "../../types/point2";

/**
 * Resolves geometric constraints for a given mechanism and a triggering action.
 */
export function resolveGeometricConstraints(
  mechanicalElements: MechanicalElement[],
  constraintElements: ConstraintElement[],
  triggerAction: Action,
): Action[] {
  // If the action is just moving a constraint label/icon, don't resolve
  if (triggerAction.type === "MoveConstraint") {
    return [triggerAction];
  }

  // 1. Initialize positions and parameters from current state
  const positions = new Map<string, Point2>(); // key: "elementID:part"
  const masses = new Map<string, number>(); // 0 = fixed, 1 = free
  const radii = new Map<ID, number>();
  const angles = new Map<ID, number>();

  mechanicalElements.forEach((el) => {
    if ("position" in el) {
      positions.set(`${el.id}:pos`, el.position);
      masses.set(`${el.id}:pos`, el.isGrounded ? 0 : 1);
      if ("radius" in el) radii.set(el.id, el.radius);
      if ("angle" in el) angles.set(el.id, el.angle);
    } else {
      positions.set(`${el.id}:start`, el.positionStart);
      positions.set(`${el.id}:end`, el.positionEnd);
      masses.set(`${el.id}:start`, 1);
      masses.set(`${el.id}:end`, 1);
    }
  });

  // 2. Apply the trigger action and set its target as an anchor (mass 0)
  switch (triggerAction.type) {
    case "MoveNode":
      positions.set(`${triggerAction.id}:pos`, triggerAction.newPosition);
      // The dragged point has a mass of 1.0, same as other free points.
      // It is NOT an anchor. It's just a point that starts at a new position.
      masses.set(`${triggerAction.id}:pos`, 1);
      break;
    case "MoveEdgeStart":
      positions.set(`${triggerAction.id}:start`, triggerAction.newPosition);
      masses.set(`${triggerAction.id}:start`, 1);
      break;
    case "MoveEdgeEnd":
      positions.set(`${triggerAction.id}:end`, triggerAction.newPosition);
      masses.set(`${triggerAction.id}:end`, 1);
      break;
    case "MoveEdgeBody":
      const edge = mechanicalElements.find((e) => e.id === triggerAction.id);
      if (edge && "positionStart" in edge) {
        const delta = triggerAction.newPosition.sub(triggerAction.oldPosition);
        positions.set(
          `${triggerAction.id}:start`,
          edge.positionStart.add(delta),
        );
        positions.set(`${triggerAction.id}:end`, edge.positionEnd.add(delta));
        masses.set(`${triggerAction.id}:start`, 1);
        masses.set(`${triggerAction.id}:end`, 1);
      }
      break;
    case "ChangeGearRadius":
      radii.set(triggerAction.id, triggerAction.newRadius);
      // For radius changes, we don't anchor the position, but we might want to
      // mark the gear as "high priority" in the solver if we had a more complex mass system.
      break;
    case "ChangeDimensionRadiusValue":
      radii.set(triggerAction.id, triggerAction.newValue);
      break;
    case "ChangeDimensionEdgeValue":
    case "ChangeDimensionNodeToNodeValue":
    case "ChangeDimensionEdgeToNodeValue":
    case "ChangeDimensionAngleValue":
      // These actions update the constraint value before resolution
      const constraint = constraintElements.find(
        (c) => c.id === triggerAction.id,
      );
      if (constraint && "value" in constraint) {
        (constraint as any).value = triggerAction.newValue;
      }
      break;
    case "CreateElement":
      // If we create a mechanical element, it's already in the list or will be applied.
      // If we create a constraint, we want the system to solve for it immediately.
      if (
        triggerAction.element.type === "dimension-edge" ||
        triggerAction.element.type === "dimension-node-to-node" ||
        triggerAction.element.type === "dimension-edge-to-node" ||
        triggerAction.element.type === "dimension-angle" ||
        triggerAction.element.type === "dimension-radius" ||
        triggerAction.element.type === "horizontal-align-edge" ||
        triggerAction.element.type === "horizontal-align-nodes" ||
        triggerAction.element.type === "vertical-align-edge" ||
        triggerAction.element.type === "vertical-align-nodes" ||
        triggerAction.element.type === "normal" ||
        triggerAction.element.type === "parallel" ||
        triggerAction.element.type === "equal" ||
        triggerAction.element.type === "gear-ratio"
      ) {
        // Add the new constraint to the list for the relaxation loop
        constraintElements = [...constraintElements, triggerAction.element];
      }
      break;
  }

  // 3. PBD Relaxation Loop
  const iterations = 150; // High iterations to ensure rigidity
  const epsilon = 0.000001; // Very tight tolerance
  let maxError = 0;

  // Store initial positions for clamping if needed
  //const initialPositions = new Map(positions);
  //const initialRadii = new Map(radii);

  for (let i = 0; i < iterations; i++) {
    maxError = 0;

    // A. Structural Constraints (Coincidence & Body) - High Stiffness
    // We run coincidence multiple times per iteration to ensure rigid connections
    for (let j = 0; j < 10; j++) {
      mechanicalElements.forEach((el) => {
        if ("positionStart" in el) {
          if (el.fixedNodeStartID !== undefined) {
            applyCoincidenceConstraint(
              positions,
              masses,
              `${el.id}:start`,
              `${el.fixedNodeStartID}:pos`,
              1.0,
            );
          }
          if (el.fixedNodeEndID !== undefined) {
            applyCoincidenceConstraint(
              positions,
              masses,
              `${el.id}:end`,
              `${el.fixedNodeEndID}:pos`,
              1.0,
            );
          }
        }
      });
    }

    mechanicalElements.forEach((el) => {
      if ("positionStart" in el) {
        if (el.type === "beam") {
          el.fixedNodesBodyIDs.forEach((nodeId) => {
            maxError = Math.max(
              maxError,
              applyBodyConstraint(
                positions,
                masses,
                `${nodeId}:pos`,
                `${el.id}:start`,
                `${el.id}:end`,
                1.0,
              ),
            );
          });
        }
      }
      if (el.type === "slider" || el.type === "slidep") {
        if (el.parentBeamID !== undefined) {
          maxError = Math.max(
            maxError,
            applyBodyConstraint(
              positions,
              masses,
              `${el.id}:pos`,
              `${el.parentBeamID}:start`,
              `${el.parentBeamID}:end`,
              1.0,
            ),
          );
        }
      }

      // Belt Tangency Constraint
      if (el.type === "belt" && el.tight && el.attachedGearsIDs.length >= 2) {
        applyBeltTangencyConstraint(
          positions,
          masses,
          el,
          mechanicalElements,
          radii,
        );
      }

      // Gear Meshing Constraint (Tangency)
      if (el.type === "gear" && el.meshedGearsIDs.length > 0) {
        el.meshedGearsIDs.forEach((meshedId) => {
          applyGearMeshingConstraint(positions, masses, radii, el.id, meshedId);
        });
      }
    });

    // B. Explicit Constraints - High Stiffness
    const constraintStiffness = 1.0; // Dimensions are now rigid
    constraintElements.forEach((c) => {
      switch (c.type) {
        case "dimension-edge":
          maxError = Math.max(
            maxError,
            applyDistanceConstraint(
              positions,
              masses,
              `${c.edgeID}:start`,
              `${c.edgeID}:end`,
              c.value,
              constraintStiffness,
            ),
          );
          break;
        case "dimension-node-to-node":
          maxError = Math.max(
            maxError,
            applyDistanceConstraint(
              positions,
              masses,
              `${c.startNodeID}:pos`,
              `${c.endNodeID}:pos`,
              c.value,
              constraintStiffness,
            ),
          );
          break;
        case "dimension-edge-to-node":
          maxError = Math.max(
            maxError,
            applyDistanceToLineConstraint(
              positions,
              masses,
              `${c.nodeID}:pos`,
              `${c.edgeID}:start`,
              `${c.edgeID}:end`,
              c.value,
              constraintStiffness,
            ),
          );
          break;
        case "dimension-angle":
          maxError = Math.max(
            maxError,
            applyAngleConstraint(
              positions,
              masses,
              `${c.startEdgeID}:start`,
              `${c.startEdgeID}:end`,
              `${c.endEdgeID}:start`,
              `${c.endEdgeID}:end`,
              c.value,
              constraintStiffness,
            ),
          );
          break;
        case "dimension-radius":
          radii.set(c.gearID, c.value);
          break;
        case "horizontal-align-nodes":
          applyAlignConstraint(
            positions,
            masses,
            `${c.startNodeID}:pos`,
            `${c.endNodeID}:pos`,
            "horizontal",
            constraintStiffness,
          );
          break;
        case "vertical-align-nodes":
          applyAlignConstraint(
            positions,
            masses,
            `${c.startNodeID}:pos`,
            `${c.endNodeID}:pos`,
            "vertical",
            constraintStiffness,
          );
          break;
        case "parallel":
          applyParallelConstraint(
            positions,
            masses,
            `${c.startEdgeID}:start`,
            `${c.startEdgeID}:end`,
            `${c.endEdgeID}:start`,
            `${c.endEdgeID}:end`,
            constraintStiffness,
          );
          break;
        case "normal":
          applyNormalConstraint(
            positions,
            masses,
            `${c.startEdgeID}:start`,
            `${c.startEdgeID}:end`,
            `${c.endEdgeID}:start`,
            `${c.endEdgeID}:end`,
            constraintStiffness,
          );
          break;
        case "horizontal-align-edge":
          applyAlignConstraint(
            positions,
            masses,
            `${c.edgeID}:start`,
            `${c.edgeID}:end`,
            "horizontal",
            constraintStiffness,
          );
          break;
        case "vertical-align-edge":
          applyAlignConstraint(
            positions,
            masses,
            `${c.edgeID}:start`,
            `${c.edgeID}:end`,
            "vertical",
            constraintStiffness,
          );
          break;
        case "equal":
          maxError = Math.max(
            maxError,
            applyEqualLengthConstraint(
              positions,
              masses,
              `${c.startEdgeID}:start`,
              `${c.startEdgeID}:end`,
              `${c.endEdgeID}:start`,
              `${c.endEdgeID}:end`,
              constraintStiffness,
            ),
          );
          break;
        case "gear-ratio":
          applyGearRatioConstraint(radii, c.startGearID, c.endGearID, c.value);
          break;
      }
    });

    // Final pass of coincidence to ensure rigid connections win over dimensions
    mechanicalElements.forEach((el) => {
      if ("positionStart" in el) {
        if (el.fixedNodeStartID !== undefined) {
          maxError = Math.max(
            maxError,
            applyCoincidenceConstraint(
              positions,
              masses,
              `${el.id}:start`,
              `${el.fixedNodeStartID}:pos`,
              1.0,
            ),
          );
        }
        if (el.fixedNodeEndID !== undefined) {
          maxError = Math.max(
            maxError,
            applyCoincidenceConstraint(
              positions,
              masses,
              `${el.id}:end`,
              `${el.fixedNodeEndID}:pos`,
              1.0,
            ),
          );
        }
      }
    });

    if (maxError < epsilon) break;
  }

  // 4. Post-Resolution Validation & Clamping
  // If the error is still too high, it means the system is over-constrained or the target is unreachable.
  // In this case, we want to "clamp" the result to the nearest valid state.
  if (maxError > 0.01) {
    // Strategy: If we were moving a point, and the system couldn't follow,
    // we update the trigger action to the solved position (the "limit" of the movement).
    if (
      triggerAction.type === "MoveNode" ||
      triggerAction.type === "MoveEdgeStart" ||
      triggerAction.type === "MoveEdgeEnd"
    ) {
      const key =
        triggerAction.type === "MoveNode"
          ? `${triggerAction.id}:pos`
          : triggerAction.type === "MoveEdgeStart"
            ? `${triggerAction.id}:start`
            : `${triggerAction.id}:end`;

      const solvedPos = positions.get(key)!;
      const targetPos = triggerAction.newPosition;

      // If the solved position is far from the target, it means the target was illegal.
      if (solvedPos.distance_to(targetPos) > 0.01) {
        (triggerAction as any).newPosition = solvedPos;
      }
    } else if (
      triggerAction.type === "ChangeGearRadius" ||
      triggerAction.type === "ChangeDimensionRadiusValue" ||
      triggerAction.type === "ChangeDimensionEdgeValue" ||
      triggerAction.type === "ChangeDimensionNodeToNodeValue" ||
      triggerAction.type === "ChangeDimensionEdgeToNodeValue" ||
      triggerAction.type === "ChangeDimensionAngleValue"
    ) {
      if (
        triggerAction.type === "ChangeGearRadius" ||
        triggerAction.type === "ChangeDimensionRadiusValue"
      ) {
        const solvedRadius = radii.get(triggerAction.id)!;
        const targetRadius =
          triggerAction.type === "ChangeGearRadius"
            ? triggerAction.newRadius
            : triggerAction.newValue;

        if (Math.abs(solvedRadius - targetRadius) > 0.1) {
          if (triggerAction.type === "ChangeGearRadius") {
            triggerAction.newRadius = solvedRadius;
          } else {
            triggerAction.newValue = solvedRadius;
          }
        }
      } else {
        // For other dimensions, we check if the constraint is satisfied
        const constraint = constraintElements.find(
          (c) => c.id === triggerAction.id,
        );
        if (constraint && "value" in constraint) {
          // If the system couldn't reach the target value, we should ideally
          // find the "closest valid value". Since PBD already relaxed the system
          // to a valid state, we can measure the actual distance/angle in the solved state.
          let actualValue = (constraint as any).value;

          if (constraint.type === "dimension-edge") {
            const p1 = positions.get(`${constraint.edgeID}:start`)!;
            const p2 = positions.get(`${constraint.edgeID}:end`)!;
            actualValue = p1.distance_to(p2);
          } else if (constraint.type === "dimension-node-to-node") {
            const p1 = positions.get(`${constraint.startNodeID}:pos`)!;
            const p2 = positions.get(`${constraint.endNodeID}:pos`)!;
            actualValue = p1.distance_to(p2);
          }
          // ... other types could be added here

          if (Math.abs(actualValue - triggerAction.newValue) > 0.1) {
            triggerAction.newValue = actualValue;
          }
        }
      }
    }
  }

  // 5. Generate resulting actions
  const resultActions: Action[] = [triggerAction];
  positions.forEach((newPos, key) => {
    const [idStr, part] = key.split(":");
    const id = parseInt(idStr);
    const el = mechanicalElements.find((e) => e.id === id);
    if (!el) return;

    const oldPos =
      part === "pos"
        ? (el as any).position
        : part === "start"
          ? (el as any).positionStart
          : (el as any).positionEnd;
    if (oldPos && oldPos.distance_to(newPos) > 0.001) {
      if (part === "pos") {
        resultActions.push({
          type: "MoveNode",
          id,
          newPosition: newPos,
          oldPosition: oldPos,
        });
      } else if (part === "start") {
        resultActions.push({
          type: "MoveEdgeStart",
          id,
          newPosition: newPos,
          oldPosition: oldPos,
        });
      } else if (part === "end") {
        resultActions.push({
          type: "MoveEdgeEnd",
          id,
          newPosition: newPos,
          oldPosition: oldPos,
        });
      }
    }
  });

  radii.forEach((newRadius, id) => {
    const el = mechanicalElements.find((e) => e.id === id) as GearElement;
    if (el && Math.abs(el.radius - newRadius) > 0.001) {
      resultActions.push({
        type: "ChangeGearRadius",
        id,
        newRadius,
        oldRadius: el.radius,
      });
    }
  });

  return resultActions;
}

function applyCoincidenceConstraint(
  positions: Map<string, Point2>,
  masses: Map<string, number>,
  key1: string,
  key2: string,
  stiffness: number = 1.0,
): number {
  const p1 = positions.get(key1);
  const p2 = positions.get(key2);
  const w1 = masses.get(key1) ?? 1;
  const w2 = masses.get(key2) ?? 1;
  if (!p1 || !p2) return 0;

  const totalW = w1 + w2;
  if (totalW === 0) return 0; // Both are absolute anchors (mass 0)

  const delta = p2.sub(p1);
  const error = delta.length();

  // Correction is proportional to inverse mass (w)
  // If w1 is 0 (anchor), it doesn't move. If w1 is 1 (free), it moves more.
  positions.set(key1, p1.add(delta.mul((w1 / totalW) * stiffness)));
  positions.set(key2, p2.sub(delta.mul((w2 / totalW) * stiffness)));
  return error;
}

function applyDistanceConstraint(
  positions: Map<string, Point2>,
  masses: Map<string, number>,
  key1: string,
  key2: string,
  targetDist: number,
  stiffness: number = 1.0,
): number {
  const p1 = positions.get(key1);
  const p2 = positions.get(key2);
  const w1 = masses.get(key1) ?? 1;
  const w2 = masses.get(key2) ?? 1;
  if (!p1 || !p2) return 0;

  const totalW = w1 + w2;
  if (totalW === 0) return 0;

  const delta = p2.sub(p1);
  const currentDist = delta.length();
  if (currentDist === 0) return targetDist;

  const error = Math.abs(currentDist - targetDist);
  const diff = (currentDist - targetDist) / currentDist;

  positions.set(key1, p1.add(delta.mul(diff * (w1 / totalW) * stiffness)));
  positions.set(key2, p2.sub(delta.mul(diff * (w2 / totalW) * stiffness)));
  return error;
}

function applyDistanceToLineConstraint(
  positions: Map<string, Point2>,
  masses: Map<string, number>,
  keyNode: string,
  keyStart: string,
  keyEnd: string,
  targetDist: number,
  stiffness: number = 1.0,
): number {
  const pNode = positions.get(keyNode);
  const pStart = positions.get(keyStart);
  const pEnd = positions.get(keyEnd);
  if (!pNode || !pStart || !pEnd) return 0;

  const currentDist = pNode.distance_to_line(pStart, pEnd);
  const error = Math.abs(currentDist - targetDist);

  // Simple projection to satisfy distance
  const proj = pNode.project_on_line(pStart, pEnd);
  const vec = pNode.sub(proj);
  const len = vec.length();
  if (len === 0) {
    // If node is on line, move it in perpendicular direction
    const perp = pEnd.sub(pStart).perp().normalize().mul(targetDist);
    if (masses.get(keyNode) !== 0)
      positions.set(keyNode, pNode.lerp(proj.add(perp), stiffness));
  } else {
    const corrected = proj.add(vec.mul(targetDist / len));
    if (masses.get(keyNode) !== 0)
      positions.set(keyNode, pNode.lerp(corrected, stiffness));
  }
  return error;
}

function applyBodyConstraint(
  positions: Map<string, Point2>,
  masses: Map<string, number>,
  keyNode: string,
  keyStart: string,
  keyEnd: string,
  stiffness: number = 1.0,
): number {
  const pNode = positions.get(keyNode);
  const pStart = positions.get(keyStart);
  const pEnd = positions.get(keyEnd);
  const wNode = masses.get(keyNode) ?? 1;
  if (!pNode || !pStart || !pEnd || wNode === 0) return 0;

  const ab = pEnd.sub(pStart);
  const lenSq = ab.length_squared();
  if (lenSq === 0) return pNode.distance_to(pStart);

  let t = pNode.sub(pStart).dot(ab) / lenSq;
  const margin = 0.05;
  t = Math.max(margin, Math.min(1 - margin, t));

  const projected = pStart.add(ab.mul(t));
  const error = pNode.distance_to(projected);
  positions.set(keyNode, pNode.lerp(projected, stiffness));
  return error;
}

function applyAlignConstraint(
  positions: Map<string, Point2>,
  masses: Map<string, number>,
  key1: string,
  key2: string,
  type: "horizontal" | "vertical",
  stiffness: number = 1.0,
) {
  const p1 = positions.get(key1);
  const p2 = positions.get(key2);
  const w1 = masses.get(key1) ?? 1;
  const w2 = masses.get(key2) ?? 1;
  if (!p1 || !p2 || (w1 === 0 && w2 === 0)) return;

  const totalW = w1 + w2;
  if (type === "horizontal") {
    const avgY = (p1.y * w2 + p2.y * w1) / totalW;
    positions.set(key1, p1.lerp(new Point2(p1.x, avgY), stiffness));
    positions.set(key2, p2.lerp(new Point2(p2.x, avgY), stiffness));
  } else {
    const avgX = (p1.x * w2 + p2.x * w1) / totalW;
    positions.set(key1, p1.lerp(new Point2(avgX, p1.y), stiffness));
    positions.set(key2, p2.lerp(new Point2(avgX, p2.y), stiffness));
  }
}

function applyParallelConstraint(
  positions: Map<string, Point2>,
  masses: Map<string, number>,
  s1: string,
  e1: string,
  s2: string,
  e2: string,
  stiffness: number = 1.0,
) {
  const ps1 = positions.get(s1);
  const pe1 = positions.get(e1);
  const ps2 = positions.get(s2);
  const pe2 = positions.get(e2);
  if (!ps1 || !pe1 || !ps2 || !pe2) return;

  const v1 = pe1.sub(ps1);
  const v2 = pe2.sub(ps2);
  const angle1 = v1.angle();
  const angle2 = v2.angle();
  const diff = angle2 - angle1;

  const rotatedV2 = v2.rotate(-diff * stiffness);
  const center2 = ps2.lerp(pe2, 0.5);
  const halfV2 = rotatedV2.mul(0.5);

  if (masses.get(s2) !== 0) positions.set(s2, center2.sub(halfV2));
  if (masses.get(e2) !== 0) positions.set(e2, center2.add(halfV2));
}

function applyNormalConstraint(
  positions: Map<string, Point2>,
  masses: Map<string, number>,
  s1: string,
  e1: string,
  s2: string,
  e2: string,
  stiffness: number = 1.0,
) {
  const ps1 = positions.get(s1);
  const pe1 = positions.get(e1);
  const ps2 = positions.get(s2);
  const pe2 = positions.get(e2);
  if (!ps1 || !pe1 || !ps2 || !pe2) return;

  const v1 = pe1.sub(ps1);
  const v2 = pe2.sub(ps2);
  const angle1 = v1.angle();
  const angle2 = v2.angle();
  const diff = angle2 - (angle1 + Math.PI / 2);

  const rotatedV2 = v2.rotate(-diff * stiffness);
  const center2 = ps2.lerp(pe2, 0.5);
  const halfV2 = rotatedV2.mul(0.5);

  if (masses.get(s2) !== 0) positions.set(s2, center2.sub(halfV2));
  if (masses.get(e2) !== 0) positions.set(e2, center2.add(halfV2));
}

function applyAngleConstraint(
  positions: Map<string, Point2>,
  masses: Map<string, number>,
  s1: string,
  e1: string,
  s2: string,
  e2: string,
  targetAngle: number,
  stiffness: number = 1.0,
): number {
  const ps1 = positions.get(s1);
  const pe1 = positions.get(e1);
  const ps2 = positions.get(s2);
  const pe2 = positions.get(e2);
  if (!ps1 || !pe1 || !ps2 || !pe2) return 0;

  const v1 = pe1.sub(ps1);
  const v2 = pe2.sub(ps2);
  const currentAngle = v2.angle() - v1.angle();
  const error = Math.abs(currentAngle - targetAngle);
  const diff = currentAngle - targetAngle;

  const rotatedV2 = v2.rotate(-diff * stiffness);
  const center2 = ps2.lerp(pe2, 0.5);
  const halfV2 = rotatedV2.mul(0.5);

  if (masses.get(s2) !== 0) positions.set(s2, center2.sub(halfV2));
  if (masses.get(e2) !== 0) positions.set(e2, center2.add(halfV2));
  return error;
}

function applyEqualLengthConstraint(
  positions: Map<string, Point2>,
  masses: Map<string, number>,
  s1: string,
  e1: string,
  s2: string,
  e2: string,
  stiffness: number = 1.0,
): number {
  const ps1 = positions.get(s1);
  const pe1 = positions.get(e1);
  const ps2 = positions.get(s2);
  const pe2 = positions.get(e2);
  if (!ps1 || !pe1 || !ps2 || !pe2) return 0;

  const len1 = pe1.sub(ps1).length();
  const len2 = pe2.sub(ps2).length();
  const avgLen = (len1 + len2) / 2;
  const error = Math.abs(len1 - len2);

  applyDistanceConstraint(positions, masses, s1, e1, avgLen, stiffness);
  applyDistanceConstraint(positions, masses, s2, e2, avgLen, stiffness);
  return error;
}

function applyGearRatioConstraint(
  radii: Map<ID, number>,
  id1: ID,
  id2: ID,
  ratio: number,
) {
  const r1 = radii.get(id1);
  const r2 = radii.get(id2);
  if (r1 === undefined || r2 === undefined) return;

  // R1 / R2 = ratio => R2 = R1 / ratio
  radii.set(id2, r1 / ratio);
}

function applyGearMeshingConstraint(
  positions: Map<string, Point2>,
  masses: Map<string, number>,
  radii: Map<ID, number>,
  id1: ID,
  id2: ID,
) {
  const p1 = positions.get(`${id1}:pos`);
  const p2 = positions.get(`${id2}:pos`);
  const r1 = radii.get(id1);
  const r2 = radii.get(id2);
  if (!p1 || !p2 || r1 === undefined || r2 === undefined) return;

  const targetDist = r1 + r2;
  applyDistanceConstraint(
    positions,
    masses,
    `${id1}:pos`,
    `${id2}:pos`,
    targetDist,
  );
}

function applyBeltTangencyConstraint(
  positions: Map<string, Point2>,
  masses: Map<string, number>,
  belt: BeltElement,
  mechanicalElements: MechanicalElement[],
  radii: Map<ID, number>,
) {
  const firstGear = mechanicalElements.find(
    (e) => e.id === belt.attachedGearsIDs[0].id,
  ) as GearElement;
  const lastGear = mechanicalElements.find(
    (e) => e.id === belt.attachedGearsIDs[belt.attachedGearsIDs.length - 1].id,
  ) as GearElement;
  if (!firstGear || !lastGear) return;

  const p1 = positions.get(`${firstGear.id}:pos`) || firstGear.position;
  const p2 = positions.get(`${lastGear.id}:pos`) || lastGear.position;
  const r1 = radii.get(firstGear.id) ?? firstGear.radius;
  const r2 = radii.get(lastGear.id) ?? lastGear.radius;

  const link = Point2.circles_link(
    p1,
    r1,
    belt.attachedGearsIDs[0].direction,
    p2,
    r2,
    belt.attachedGearsIDs[belt.attachedGearsIDs.length - 1].direction,
  );

  if (masses.get(`${belt.id}:start`) !== 0)
    positions.set(`${belt.id}:start`, p1.add(link.start));
  if (masses.get(`${belt.id}:end`) !== 0)
    positions.set(`${belt.id}:end`, p2.add(link.end));
}
