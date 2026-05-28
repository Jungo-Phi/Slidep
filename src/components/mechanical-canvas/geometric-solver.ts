import {
  Action,
  ConstraintElement,
  MechanicalElement,
  GearElement,
  BeltElement,
  EdgeElement,
  ActionBundleType,
} from "../../types";
import { Point2 } from "../../types/point2";
import { get_mechanical_element_from_id } from "./connect-actions";

/** Kinds of (non oriented) connections between points. */
export type Link =
  | { type: "Coincidence"; ddl: 2; key1: string; key2: string }
  | { type: "Distance"; ddl: 1; key1: string; key2: string; distance: number }
  | {
      type: "DistanceToLine";
      ddl: 1;
      key1: string;
      key2: string;
      key3: string;
      distance: number;
    }
  | { type: "OnSegment"; ddl: 1; key1: string; key2: string; key3: string }
  | {
      type: "AtSegmentRatio";
      ddl: 2;
      key1: string;
      key2: string;
      key3: string;
      t: number;
    }
  | {
      type: "KeepOrientation";
      ddl: 1;
      key1: string;
      key2: string;
      direction: Point2;
    }
  | {
      type: "Angle";
      ddl: 1;
      key1: string;
      key2: string;
      key3: string;
      key4: string;
      angle: number;
    }
  | { type: "Radius"; ddl: 1; key1: string; radius: number }
  | { type: "Horizontal"; ddl: 1; key1: string; key2: string }
  | { type: "Vertical"; ddl: 1; key1: string; key2: string }
  | {
      type: "Normal";
      ddl: 1;
      key1: string;
      key2: string;
      key3: string;
      key4: string;
    }
  | {
      type: "Parallel";
      ddl: 1;
      key1: string;
      key2: string;
      key3: string;
      key4: string;
    }
  | {
      type: "EqualLength";
      ddl: 1;
      key1: string;
      key2: string;
      key3: string;
      key4: string;
    }
  | { type: "GearMeshing"; ddl: 1; key1: string; key2: string }
  | { type: "GearRatio"; ddl: 1; key1: string; key2: string; ratio: number };

function constraint_to_link(element: ConstraintElement): Link {
  switch (element.type) {
    case "dimension-edge":
      return {
        type: "Distance",
        ddl: 1,
        key1: `${element.edgeID}:start`,
        key2: `${element.edgeID}:end`,
        distance: element.value,
      };
    case "dimension-node-to-node":
      return {
        type: "Distance",
        ddl: 1,
        key1: `${element.startNodeID}:start`,
        key2: `${element.endNodeID}:end`,
        distance: element.value,
      };
    case "dimension-edge-to-node":
      return {
        type: "DistanceToLine",
        ddl: 1,
        key1: `${element.edgeID}:start`,
        key2: `${element.edgeID}:end`,
        key3: `${element.nodeID}:pos`,
        distance: element.value,
      };
    case "dimension-angle":
      return {
        type: "Angle",
        ddl: 1,
        key1: `${element.startEdgeID}:start`,
        key2: `${element.startEdgeID}:end`,
        key3: `${element.endEdgeID}:start`,
        key4: `${element.endEdgeID}:end`,
        angle: element.value,
      };
    case "dimension-radius":
      return {
        type: "Radius",
        ddl: 1,
        key1: `${element.gearID}:pos`,
        radius: element.value,
      };
    case "horizontal-align-edge":
      return {
        type: "Horizontal",
        ddl: 1,
        key1: `${element.edgeID}:start`,
        key2: `${element.edgeID}:end`,
      };
    case "horizontal-align-nodes":
      return {
        type: "Horizontal",
        ddl: 1,
        key1: `${element.startNodeID}:start`,
        key2: `${element.endNodeID}:end`,
      };
    case "vertical-align-edge":
      return {
        type: "Vertical",
        ddl: 1,
        key1: `${element.edgeID}:start`,
        key2: `${element.edgeID}:end`,
      };
    case "vertical-align-nodes":
      return {
        type: "Vertical",
        ddl: 1,
        key1: `${element.startNodeID}:start`,
        key2: `${element.endNodeID}:end`,
      };
    case "normal":
      return {
        type: "Normal",
        ddl: 1,
        key1: `${element.startEdgeID}:start`,
        key2: `${element.startEdgeID}:end`,
        key3: `${element.endEdgeID}:start`,
        key4: `${element.endEdgeID}:end`,
      };
    case "parallel":
      return {
        type: "Parallel",
        ddl: 1,
        key1: `${element.startEdgeID}:start`,
        key2: `${element.startEdgeID}:end`,
        key3: `${element.endEdgeID}:start`,
        key4: `${element.endEdgeID}:end`,
      };
    case "equal":
      return {
        type: "EqualLength",
        ddl: 1,
        key1: `${element.startEdgeID}:start`,
        key2: `${element.startEdgeID}:end`,
        key3: `${element.endEdgeID}:start`,
        key4: `${element.endEdgeID}:end`,
      };
    case "gear-ratio":
      return {
        type: "GearRatio",
        ddl: 1,
        key1: `${element.startGearID}:pos`,
        key2: `${element.endGearID}:end`,
        ratio: element.value,
      };
  }
}

/**
 * Returns parsed positions and radii of mechanism / key: "elementID:part"
 */
export function getPositions(mechanicalElements: MechanicalElement[]): {
  positions: Map<string, Point2>;
  radii: Map<string, number>;
} {
  const positions = new Map<string, Point2>();
  const radii = new Map<string, number>();
  mechanicalElements.forEach((element) => {
    if ("position" in element) {
      positions.set(`${element.id}:pos`, element.position);
      if ("radius" in element) radii.set(`${element.id}:pos`, element.radius);
      // if ("angle" in element) angles.set(element.id, element.angle);
    } else {
      positions.set(`${element.id}:start`, element.positionStart);
      positions.set(`${element.id}:end`, element.positionEnd);
    }
  });
  return { positions, radii };
}

/**
 * get_degrees_of_liberty(positions, radii, links)
 */
function get_degrees_of_liberty(
  positions: Map<string, Point2>,
  radii: Map<string, number>,
  posMasses: Map<string, number>,
  links: Link[],
): number {
  return (
    positions.size * 2 +
    radii.size -
    links.map((link) => link.ddl).reduce((a, b) => a + b, 0) -
    [...posMasses.values()].filter((mass) => mass === 0).length * 2
  );
}

/**
 * Resolves geometric constraints for a given mechanism and a triggering action.
 */
export function resolveGeometricConstraints(
  mechanicalElements: MechanicalElement[],
  constraintElements: ConstraintElement[],
  actionBundleType: ActionBundleType,
  triggerAction: Action,
): {
  positions: Map<string, Point2>;
  radii: Map<string, number>;
} {
  //console.log("<resolveGeometricConstraints : " + actionBundleType + " : " + triggerAction.type + " !>");

  // *
  // Phase A : Création du graphe de dépendances
  // *

  // 1. Initialize nodes (positions) of the dependency graph
  const positions = new Map<string, Point2>(); // key: "elementID:part"
  const radii = new Map<string, number>();
  const posMasses = new Map<string, number>(); // 0 = fixed, 1 = free
  const radMasses = new Map<string, number>(); // 0 = fixed, 1 = free
  let links: Link[] = [];

  mechanicalElements.forEach((element) => {
    if ("position" in element) {
      positions.set(`${element.id}:pos`, element.position);
      posMasses.set(`${element.id}:pos`, element.isGrounded ? 0 : 1);
      if ("radius" in element) {
        radii.set(`${element.id}:pos`, element.radius);
        radMasses.set(`${element.id}:pos`, 1);
      }
      // if ("angle" in element) angles.set(element.id, element.angle);
    } else {
      positions.set(`${element.id}:start`, element.positionStart);
      positions.set(`${element.id}:end`, element.positionEnd);
      posMasses.set(`${element.id}:start`, 1);
      posMasses.set(`${element.id}:end`, 1);
    }
  });

  // 2. Initialize edges (links) of the dependency graph
  constraintElements.forEach((constraint_element) => {
    links.push(constraint_to_link(constraint_element));
  });
  // Connections (looking from edges to avoid duplicates)
  mechanicalElements.forEach((element) => {
    if ("positionStart" in element) {
      if (element.fixedNodeStartID !== undefined) {
        links.push({
          type: "Coincidence",
          ddl: 2,
          key1: `${element.fixedNodeStartID}:pos`,
          key2: `${element.id}:start`,
        });
      }
      if (element.fixedNodeEndID !== undefined) {
        links.push({
          type: "Coincidence",
          ddl: 2,
          key1: `${element.fixedNodeEndID}:pos`,
          key2: `${element.id}:end`,
        });
      }
      if (element.type === "beam") {
        element.fixedNodesBodyIDs.forEach((nodeId) => {
          links.push({
            type: "OnSegment",
            ddl: 1,
            key1: `${element.id}:start`,
            key2: `${element.id}:end`,
            key3: `${nodeId}:pos`,
          });
        });
      }
    }
    if (element.type === "gear" && element.meshedGearsIDs.length > 0) {
      element.meshedGearsIDs.forEach((meshedId) => {
        links.push({
          type: "GearMeshing",
          ddl: 1,
          key1: `${element.id}:pos`,
          key2: `${meshedId}:pos`,
        });
      });
      element.fixedGearsIDs.forEach((fixedId) => {
        links.push({
          type: "Coincidence",
          ddl: 2,
          key1: `${element.id}:pos`,
          key2: `${fixedId}:pos`,
        });
      });
    }
  });

  // Point de départ et point de saisie
  let grabID: string = "grab";
  switch (actionBundleType) {
    case "MoveElement":
      if (
        triggerAction.type !== "MoveNode" &&
        triggerAction.type !== "MoveEdgeStart" &&
        triggerAction.type !== "MoveEdgeEnd" &&
        triggerAction.type !== "MoveEdgeBody" &&
        triggerAction.type !== "MoveElements" &&
        triggerAction.type !== "ChangeGearRadius" &&
        triggerAction.type !== "ChangeGearAngle" &&
        triggerAction.type !== "ChangeEdgeLength"
      )
        throw console.error("impossible");

      // Resolve with GRAB
      let grabPoint: Point2 | undefined = undefined;
      let grabConnectionID: string | undefined = undefined;

      switch (triggerAction.type) {
        case "MoveNode":
          grabPoint = triggerAction.newPosition;
          grabConnectionID = `${triggerAction.id}:pos`;
          break;
        case "MoveEdgeStart":
          grabPoint = triggerAction.newPosition;
          grabConnectionID = `${triggerAction.id}:start`;
          break;
        case "MoveEdgeEnd":
          grabPoint = triggerAction.newPosition;
          grabConnectionID = `${triggerAction.id}:end`;
          break;
        case "MoveEdgeBody":
          const movedEdge = mechanicalElements.find(
            (e) => e.id === triggerAction.id,
          )! as EdgeElement;
          links.push({
            type: "AtSegmentRatio",
            ddl: 2,
            key1: `${triggerAction.id}:start`,
            key2: `${triggerAction.id}:end`,
            key3: `grab_bridge`,
            t: movedEdge.positionStart
              .add(triggerAction.deltaStart)
              .parameter_on_segment(
                movedEdge.positionStart,
                movedEdge.positionEnd,
              ),
          });
          positions.set(`grab_bridge`, triggerAction.newPosition); // TODO : vérifier
          posMasses.set(`grab_bridge`, 1);
          grabPoint = triggerAction.newPosition;
          grabConnectionID = `grab_bridge`;
          // Beam sélectionné : si joint ancré connecté ALORS enlever l'ancrage.
          links.forEach((link) => {
            if (link.type === "Coincidence") {
              if (
                link.key1 === `${triggerAction.id}:start` ||
                link.key1 === `${triggerAction.id}:end`
              )
                posMasses.set(link.key2, 1); // TODO : AND "link.key2" should be a join
              if (
                link.key2 === `${triggerAction.id}:start` ||
                link.key2 === `${triggerAction.id}:end`
              )
                posMasses.set(link.key1, 1); // TODO : AND "link.key2" should be a join
            } else if (link.type === "AtSegmentRatio") {
              if (
                link.key1 === `${triggerAction.id}:start` &&
                link.key2 === `${triggerAction.id}:end`
              ) {
                posMasses.set(link.key3, 1); // TODO : AND "link.key2" should be a join
              }
            }
          });
          break;
        case "MoveElements":
          // move and remove anchor from dragged elements
          triggerAction.elementIDs.forEach((elementID) => {
            const element = get_mechanical_element_from_id(
              elementID,
              mechanicalElements,
            );
            if ("position" in element) {
              positions.set(
                `${element.id}:pos`,
                positions.get(`${element.id}:pos`)!.add(triggerAction.delta),
              );
              posMasses.set(`${element.id}:pos`, 1);
            } else {
              positions.set(
                `${element.id}:start`,
                positions.get(`${element.id}:start`)!.add(triggerAction.delta),
              );
              positions.set(
                `${element.id}:end`,
                positions.get(`${element.id}:end`)!.add(triggerAction.delta),
              );
            }
          });
          break;
        case "ChangeGearRadius":
        case "ChangeGearAngle":
          // Grab gear when changing it's radius/angle
          const gear = mechanicalElements.find(
            (e) => e.id === triggerAction.id,
          )! as GearElement;
          grabPoint = gear.position; // TODO : grabRadius ?
          grabConnectionID = `${triggerAction.id}:pos`;
          switch (triggerAction.type) {
            case "ChangeGearRadius":
              links.push({
                type: "Radius",
                ddl: 1,
                key1: grabConnectionID,
                radius: triggerAction.newRadius,
              });
              break;
            case "ChangeGearAngle":
              // TODO : ignore gear angles for now
              break;
          }
          break;
        case "ChangeEdgeLength":
          links.push({
            type: "Distance",
            ddl: 1,
            key1: `${triggerAction.id}:start`,
            key2: `${triggerAction.id}:end`,
            distance: triggerAction.newLength,
          });
          break;
      }
      if (grabPoint !== undefined && grabConnectionID !== undefined) {
        positions.set(grabID, grabPoint);
        posMasses.set(grabID, 0.5); // Mass of grab is not 1 so it's less rigid    TODO : limit grab amplitude
        links.push({
          type: "Coincidence",
          ddl: 2,
          key1: grabID,
          key2: grabConnectionID,
        });
        posMasses.set(grabConnectionID, 1); // Node sélectionné : enlever l'ancrage.
      }
      break;
  }

  // *
  // Phase B : Adaptation du graphe de dépendances
  // *

  // Fuse coincidence links
  links.forEach((lc) => {
    if (lc.type === "Coincidence") {
      const k1 = lc.key1;
      const k2 = lc.key2;
      const k_new = [k1, k2].join(",");
      links.forEach((link) => {
        if ("key1" in link && (link.key1 === k1 || link.key1 === k2))
          link.key1 = k_new;
        if ("key2" in link && (link.key2 === k1 || link.key2 === k2))
          link.key2 = k_new;
        if ("key3" in link && (link.key3 === k1 || link.key3 === k2))
          link.key3 = k_new;
        if ("key4" in link && (link.key4 === k1 || link.key4 === k2))
          link.key4 = k_new;
      });
      positions.set(k_new, positions.get(k1)!.lerp(positions.get(k2)!, 0.5));
      positions.delete(k1);
      positions.delete(k2);
      posMasses.set(k_new, Math.min(posMasses.get(k1)!, posMasses.get(k2)!));
      posMasses.delete(k1);
      posMasses.delete(k2);
    }
  });
  links = links.filter((link) => link.type !== "Coincidence");

  //links = links.filter((link) => link.type !== "Coincidence");

  // Maintien de la position (ratio) sur un beam : A moins de grab le node lui-meme
  links.forEach((link, index) => {
    if (link.type === "OnSegment" && link.key3 !== grabID) {
      const pos = positions.get(link.key3)!;
      const start = positions.get(link.key1)!;
      const end = positions.get(link.key2)!;
      links[index] = {
        type: "AtSegmentRatio",
        ddl: 2,
        key1: link.key1,
        key2: link.key2,
        key3: link.key3,
        t: pos.parameter_on_segment(start, end),
      };
    }
  });

  let ddl: number;

  // Beam sélectionné
  if (triggerAction.type === "MoveEdgeBody") {
    const movedEdge = mechanicalElements.find(
      (e) => e.id === triggerAction.id,
    )! as EdgeElement;
    // Si il y a 3 ou plus degré de liberté ALORS contrainte de parallélisme.
    ddl = get_degrees_of_liberty(positions, radii, posMasses, links);
    if (ddl >= 3) {
      links.push({
        type: "KeepOrientation",
        ddl: 1,
        key1: `${triggerAction.id}:start`,
        key2: `${triggerAction.id}:end`,
        direction: movedEdge.positionEnd.sub(movedEdge.positionStart),
      });
    }
    // Si il y a 3 ou plus degré de liberté ALORS contrainte de longueur.
    ddl = get_degrees_of_liberty(positions, radii, posMasses, links);
    if (ddl >= 3) {
      links.push({
        type: "Distance",
        ddl: 1,
        key1: `${triggerAction.id}:start`,
        key2: `${triggerAction.id}:end`,
        distance: movedEdge.positionEnd.distance_to(movedEdge.positionStart),
      });
    }
  }

  // ChangingGearRadius sélectionné
  if (triggerAction.type === "ChangeGearRadius") {
    ddl = get_degrees_of_liberty(positions, radii, posMasses, links);
    // Si il y a 3 ou plus degré de liberté ALORS contrainte de position de l'engrenage.
    if (ddl >= 3) {
      posMasses.set(`${triggerAction.id}:pos`, 0);
    }
  }
  // MovingGear sélectionné
  if (triggerAction.type === "MoveNode") {
    ddl = get_degrees_of_liberty(positions, radii, posMasses, links);
    // Si il y a 2 ou plus degré de liberté ALORS contrainte de rayon de l'engrenage.
    if (ddl >= 2) {
      radMasses.set(`${triggerAction.id}:pos`, 0);
    }
  }

  // TODO : Autres beams (dans l'ORDRE) : si il y a 3 ou plus degré de liberté ALORS contrainte de parallélisme.
  // TODO : Autres beams (dans l'ORDRE) : si il y a 3 ou plus degré de liberté ALORS contrainte de longueur.

  // start with last link, which is Grab Coincidence if there is one
  let startLinkIndex: number = links.length - 1;

  // TODO : Ordonner la liste
  /*
  console.log("links : ");
  links.forEach((link) => {
    console.log(link);
  });
  ddl = get_degrees_of_liberty(positions, radii, posMasses, links);
  console.log("DDL : ", ddl);
  */

  // 3. PBD (Position Based Dynamics)
  const iterations = 20; // High iterations to ensure rigidity 150 ???
  const epsilon = 0.000_001; // Very tight tolerance, why not 0.1 ?
  let maxError: number = 0;

  const constraintStiffness = 0.8;

  for (let i = 0; i < iterations; i++) {
    maxError = 0;

    links.forEach((link) => {
      switch (link.type) {
        case "Coincidence":
          maxError += applyCoincidenceConstraint(
            positions,
            posMasses,
            link.key1,
            link.key2,
            constraintStiffness,
          );
          break;
        case "Distance":
          maxError += applyDistanceConstraint(
            positions,
            posMasses,
            link.key1,
            link.key2,
            link.distance,
            constraintStiffness,
          );
          break;
        case "DistanceToLine":
          maxError += applyDistanceToLineConstraint(
            positions,
            posMasses,
            link.key1,
            link.key2,
            link.key3,
            link.distance,
            constraintStiffness,
          );
          break;
        case "OnSegment":
          maxError += applyOnSegmentConstraint(
            positions,
            posMasses,
            link.key1,
            link.key2,
            link.key3,
            constraintStiffness,
          );
          break;
        case "AtSegmentRatio":
          maxError += applyAtSegmentRatioConstraint(
            positions,
            posMasses,
            link.key1,
            link.key2,
            link.key3,
            link.t,
            constraintStiffness,
          );
          break;
        case "KeepOrientation":
          maxError += applyKeepOrientationConstraint(
            positions,
            posMasses,
            link.key1,
            link.key2,
            link.direction,
            constraintStiffness,
          );
          break;
        case "Angle":
        case "Radius":
          break;
        case "Horizontal":
          maxError += applyHorizontalConstraint(
            positions,
            posMasses,
            link.key1,
            link.key2,
            constraintStiffness,
          );
          break;
        case "Vertical":
          maxError += applyVerticalConstraint(
            positions,
            posMasses,
            link.key1,
            link.key2,
            constraintStiffness,
          );
          break;
        case "Normal":
        case "Parallel":
          break;
        case "EqualLength":
          maxError += applyEqualLengthConstraint(
            positions,
            posMasses,
            link.key1,
            link.key2,
            link.key3,
            link.key4,
            constraintStiffness,
          );
          break;
        case "GearMeshing":
        case "GearRatio":
      }
    });

    if (maxError < epsilon) {
      //console.log("iterations : ", i);
      break;
    }
  }

  //console.log("Error : ", maxError);

  // Decouple coincidence links
  [...positions.keys()].forEach((combined_keys) => {
    const keys = combined_keys.split(",");
    if (keys.length > 1) {
      keys.forEach((key) => {
        positions.set(key, positions.get(combined_keys)!);
      });
      positions.delete(combined_keys);
    }
  });

  return {
    positions: positions,
    radii: radii,
  };
}

function applyCoincidenceConstraint(
  positions: Map<string, Point2>,
  posMasses: Map<string, number>,
  key1: string,
  key2: string,
  stiffness: number = 1.0,
): number {
  const p1 = positions.get(key1);
  const p2 = positions.get(key2);
  const w1 = posMasses.get(key1) ?? 1;
  const w2 = posMasses.get(key2) ?? 1;
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
  posMasses: Map<string, number>,
  key1: string,
  key2: string,
  targetDist: number,
  stiffness: number = 1.0,
): number {
  const p1 = positions.get(key1);
  const p2 = positions.get(key2);
  const w1 = posMasses.get(key1) ?? 1;
  const w2 = posMasses.get(key2) ?? 1;
  if (!p1 || !p2) return 0;

  const totalW = w1 + w2;
  if (totalW === 0) return 0;

  const delta = p2.sub(p1);
  if (delta.length_squared() === 0) {
    // TODO move apart "repelDistance"
    return targetDist;
  }
  const error = delta.length() - targetDist;
  const diff = error / delta.length();

  positions.set(key1, p1.add(delta.mul(diff * (w1 / totalW) * stiffness)));
  positions.set(key2, p2.sub(delta.mul(diff * (w2 / totalW) * stiffness)));
  return Math.abs(error);
}

function applyDistanceToLineConstraint(
  positions: Map<string, Point2>,
  posMasses: Map<string, number>,
  keyNode: string,
  keyStart: string,
  keyEnd: string,
  targetDist: number,
  stiffness: number = 1.0,
): number {
  const pNode = positions.get(keyNode);
  const start = positions.get(keyStart);
  const end = positions.get(keyEnd);
  if (!pNode || !start || !end) return 0;

  const currentDist = pNode.distance_to_line(start, end);
  const error = Math.abs(currentDist - targetDist);

  // Simple projection to satisfy distance
  const proj = pNode.project_on_line(start, end);
  const vec = pNode.sub(proj);
  const len = vec.length();
  if (len === 0) {
    // If node is on line, move it in perpendicular direction
    const perp = end.sub(start).perp().normalize().mul(targetDist);
    if (posMasses.get(keyNode) !== 0)
      positions.set(keyNode, pNode.lerp(proj.add(perp), stiffness));
  } else {
    const corrected = proj.add(vec.mul(targetDist / len));
    if (posMasses.get(keyNode) !== 0)
      positions.set(keyNode, pNode.lerp(corrected, stiffness));
  }
  return error;
}

function applyOnSegmentConstraint(
  positions: Map<string, Point2>,
  posMasses: Map<string, number>,
  keyNode: string,
  keyStart: string,
  keyEnd: string,
  stiffness: number = 1.0,
): number {
  const pNode = positions.get(keyNode);
  const start = positions.get(keyStart);
  const end = positions.get(keyEnd);
  const wNode = posMasses.get(keyNode) ?? 1;
  const wStart = posMasses.get(keyStart) ?? 1;
  const wEnd = posMasses.get(keyEnd) ?? 1;
  if (!pNode || !start || !end) return 0;

  const totalW = (2 * wNode + wStart + wEnd) / 2; // TODO : vérifier risque d'oscillation avec "wEnd" bloqué
  if (totalW === 0) return 0;

  const margin = 0.05;
  const t = Math.max(
    margin,
    Math.min(1 - margin, pNode.parameter_on_segment(start, end)),
  );
  const delta = pNode.sub(start.lerp(end, t));
  const error = delta.length();

  positions.set(keyNode, pNode.sub(delta.mul((wNode / totalW) * stiffness)));
  positions.set(keyStart, start.add(delta.mul((wStart / totalW) * stiffness)));
  positions.set(keyEnd, end.add(delta.mul((wEnd / totalW) * stiffness)));
  return error;
}

function applyAtSegmentRatioConstraint(
  positions: Map<string, Point2>,
  posMasses: Map<string, number>,
  keyNode: string,
  keyStart: string,
  keyEnd: string,
  t: number,
  stiffness: number = 1.0,
): number {
  const pNode = positions.get(keyNode);
  const start = positions.get(keyStart);
  const end = positions.get(keyEnd);
  const wNode = posMasses.get(keyNode) ?? 1;
  const wStart = posMasses.get(keyStart) ?? 1;
  const wEnd = posMasses.get(keyEnd) ?? 1;
  if (!pNode || !start || !end) return 0;

  const totalW = (2 * wNode + wStart + wEnd) / 2; // TODO : vérifier risque d'oscillation avec "wEnd" bloqué
  if (totalW === 0) return 0;

  const delta = pNode.sub(start.lerp(end, t));
  const error = delta.length();

  positions.set(keyNode, pNode.sub(delta.mul((wNode / totalW) * stiffness)));
  positions.set(keyStart, start.add(delta.mul((wStart / totalW) * stiffness)));
  positions.set(keyEnd, end.add(delta.mul((wEnd / totalW) * stiffness)));
  return error;
}

function applyKeepOrientationConstraint(
  positions: Map<string, Point2>,
  posMasses: Map<string, number>,
  keyStart: string,
  keyEnd: string,
  direction: Point2,
  stiffness: number = 1.0,
): number {
  const start = positions.get(keyStart);
  const end = positions.get(keyEnd);
  const wStart = posMasses.get(keyStart) ?? 1;
  const wEnd = posMasses.get(keyEnd) ?? 1;
  if (!start || !end) return 0;

  const totalW = wStart + wEnd;
  if (totalW === 0) return 0;

  const midPoint = start.lerp(end, 0.5);
  const projStart = start.project_on_line(midPoint, midPoint.add(direction));
  const projEnd = end.project_on_line(midPoint, midPoint.add(direction));
  const error = start.distance_to(projStart);

  positions.set(keyStart, start.lerp(projStart, (wStart / totalW) * stiffness));
  positions.set(keyEnd, end.lerp(projEnd, (wEnd / totalW) * stiffness));
  return error;
}

function applyHorizontalConstraint(
  positions: Map<string, Point2>,
  posMasses: Map<string, number>,
  keyStart: string,
  keyEnd: string,
  stiffness: number = 1.0,
): number {
  const start = positions.get(keyStart);
  const end = positions.get(keyEnd);
  const wStart = posMasses.get(keyStart) ?? 1;
  const wEnd = posMasses.get(keyEnd) ?? 1;
  if (!start || !end) return 0;

  const totalW = wStart + wEnd;
  if (totalW === 0) return 0;

  const midPointY = (start.y + end.y) / 2;
  const projStart = new Point2(start.x, midPointY);
  const projEnd = new Point2(end.x, midPointY);
  const error = Math.abs(midPointY - start.y);

  positions.set(keyStart, start.lerp(projStart, (wStart / totalW) * stiffness));
  positions.set(keyEnd, end.lerp(projEnd, (wEnd / totalW) * stiffness));
  return error;
}

function applyVerticalConstraint(
  positions: Map<string, Point2>,
  posMasses: Map<string, number>,
  keyStart: string,
  keyEnd: string,
  stiffness: number = 1.0,
): number {
  const start = positions.get(keyStart);
  const end = positions.get(keyEnd);
  const wStart = posMasses.get(keyStart) ?? 1;
  const wEnd = posMasses.get(keyEnd) ?? 1;
  if (!start || !end) return 0;

  const totalW = wStart + wEnd;
  if (totalW === 0) return 0;

  const midPointX = (start.x + end.x) / 2;
  const projStart = new Point2(midPointX, start.y);
  const projEnd = new Point2(midPointX, end.y);
  const error = Math.abs(midPointX - start.x);

  positions.set(keyStart, start.lerp(projStart, (wStart / totalW) * stiffness));
  positions.set(keyEnd, end.lerp(projEnd, (wEnd / totalW) * stiffness));
  return error;
}

function applyAlignConstraint(
  positions: Map<string, Point2>,
  posMasses: Map<string, number>,
  key1: string,
  key2: string,
  type: "horizontal" | "vertical",
  stiffness: number = 1.0,
) {
  const p1 = positions.get(key1);
  const p2 = positions.get(key2);
  const w1 = posMasses.get(key1) ?? 1;
  const w2 = posMasses.get(key2) ?? 1;
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
  posMasses: Map<string, number>,
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

  if (posMasses.get(s2) !== 0) positions.set(s2, center2.sub(halfV2));
  if (posMasses.get(e2) !== 0) positions.set(e2, center2.add(halfV2));
}

function applyNormalConstraint(
  positions: Map<string, Point2>,
  posMasses: Map<string, number>,
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

  if (posMasses.get(s2) !== 0) positions.set(s2, center2.sub(halfV2));
  if (posMasses.get(e2) !== 0) positions.set(e2, center2.add(halfV2));
}

function applyAngleConstraint(
  positions: Map<string, Point2>,
  posMasses: Map<string, number>,
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

  if (posMasses.get(s2) !== 0) positions.set(s2, center2.sub(halfV2));
  if (posMasses.get(e2) !== 0) positions.set(e2, center2.add(halfV2));
  return error;
}

function applyEqualLengthConstraint(
  positions: Map<string, Point2>,
  posMasses: Map<string, number>,
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

  applyDistanceConstraint(positions, posMasses, s1, e1, avgLen, stiffness);
  applyDistanceConstraint(positions, posMasses, s2, e2, avgLen, stiffness);
  return error;
}

function applyGearRatioConstraint(
  radii: Map<string, number>,
  id1: string,
  id2: string,
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
  posMasses: Map<string, number>,
  radii: Map<string, number>,
  id1: string,
  id2: string,
) {
  const p1 = positions.get(`${id1}:pos`);
  const p2 = positions.get(`${id2}:pos`);
  const r1 = radii.get(id1);
  const r2 = radii.get(id2);
  if (!p1 || !p2 || r1 === undefined || r2 === undefined) return;

  const targetDist = r1 + r2;
  applyDistanceConstraint(
    positions,
    posMasses,
    `${id1}:pos`,
    `${id2}:pos`,
    targetDist,
  );
}

function applyBeltTangencyConstraint(
  positions: Map<string, Point2>,
  posMasses: Map<string, number>,
  belt: BeltElement,
  mechanicalElements: MechanicalElement[],
  radii: Map<string, number>,
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

  if (posMasses.get(`${belt.id}:start`) !== 0)
    positions.set(`${belt.id}:start`, p1.add(link.start));
  if (posMasses.get(`${belt.id}:end`) !== 0)
    positions.set(`${belt.id}:end`, p2.add(link.end));
}
