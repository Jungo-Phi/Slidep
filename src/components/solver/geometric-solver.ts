import {
  Action,
  EdgeElement,
  ActionBundleType,
  Point2,
  Nodes,
  Mechanism,
} from "../../types";
import { get_mechanical_element_from_id } from "../mechanical-canvas/connect-actions";
import { get_degrees_of_freedom, sort_links } from "./utils";
import { get_links, get_nodes } from "./parsing";
import { PBD_kinematic_solver } from "./PBD_kinematic_solver";

/**
 * Resolves geometric constraints for a given mechanism and a triggering action.
 */
export function resolveGeometricConstraints(
  mechanism: Mechanism,
  actionBundleType: ActionBundleType,
  triggerAction: Action,
): Nodes {
  // *
  // Phase A : Création du graphe de dépendances
  // *

  // 1. Initialize nodes (positions and radii) of the dependency graph
  // 2. Initialize edges (links) of the dependency graph
  const nodes = get_nodes(mechanism.mechanicalElements);
  let links = get_links(
    mechanism.mechanicalElements,
    mechanism.constraintElements,
  );

  let grabPoint: Point2 | number | undefined = undefined;
  let grabConnectionID: string | undefined = undefined;
  switch (actionBundleType) {
    case "MoveElement":
      if (
        triggerAction.type !== "MoveNode" &&
        triggerAction.type !== "MoveEdgeStart" &&
        triggerAction.type !== "MoveEdgeEnd" &&
        triggerAction.type !== "MoveEdgeBody" &&
        triggerAction.type !== "MoveElements" &&
        triggerAction.type !== "ChangeGearRadius" &&
        triggerAction.type !== "ChangeEdgeLength"
      )
        throw console.error("impossible");

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
          links.push({
            type: "AtSegmentRatio",
            ddl: 2,
            key1: `${triggerAction.id}:start`,
            key2: `${triggerAction.id}:end`,
            key3: `grab_bridge`,
            t: triggerAction.t,
          });
          nodes.positions.set(`grab_bridge`, triggerAction.newPosition);
          nodes.posMasses.set(`grab_bridge`, 1);
          grabPoint = triggerAction.newPosition;
          grabConnectionID = `grab_bridge`;
          // Beam sélectionné : si joint ancré connecté ALORS enlever l'ancrage.
          links.forEach((link) => {
            if (link.type === "Coincidence") {
              if (
                link.key1 === `${triggerAction.id}:start` ||
                link.key1 === `${triggerAction.id}:end`
              )
                nodes.posMasses.set(link.key2, 1); // TODO : AND "link.key2" should be a join
              if (
                link.key2 === `${triggerAction.id}:start` ||
                link.key2 === `${triggerAction.id}:end`
              )
                nodes.posMasses.set(link.key1, 1); // TODO : AND "link.key2" should be a join
            } else if (link.type === "AtSegmentRatio") {
              if (
                link.key1 === `${triggerAction.id}:start` &&
                link.key2 === `${triggerAction.id}:end`
              ) {
                nodes.posMasses.set(link.key3, 1); // TODO : AND "link.key2" should be a join
              }
            }
          });
          break;
        case "MoveElements":
          // move and remove anchor from dragged elements
          triggerAction.elementIDs.forEach((elementID) => {
            const element = get_mechanical_element_from_id(
              elementID,
              mechanism.mechanicalElements,
            );
            if ("position" in element) {
              nodes.positions.set(
                `${element.id}:pos`,
                nodes.positions
                  .get(`${element.id}:pos`)!
                  .add(triggerAction.delta),
              );
              nodes.posMasses.set(`${element.id}:pos`, 1);
            } else {
              nodes.positions.set(
                `${element.id}:start`,
                nodes.positions
                  .get(`${element.id}:start`)!
                  .add(triggerAction.delta),
              );
              nodes.positions.set(
                `${element.id}:end`,
                nodes.positions
                  .get(`${element.id}:end`)!
                  .add(triggerAction.delta),
              );
            }
          });
          break;
        case "ChangeGearRadius":
          grabPoint = triggerAction.newRadius;
          grabConnectionID = `${triggerAction.id}:rad`;
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
      break;
    case "ChangeDimension":
    case "Connects":
    case "CreateConstraint":
  }

  if (grabPoint && grabConnectionID) {
    // Enlever l'ancrage du node sélectionné
    if (typeof grabPoint === "number") {
      nodes.radMasses.set(grabConnectionID, 1);
    } else {
      nodes.posMasses.set(grabConnectionID, 1);
    }
    links.push({
      type: "HandleGrab",
      ddl: 1,
      grabbedKey: grabConnectionID,
      value: grabPoint,
    });
  }

  // Ancrages pré-fusion : les clés individuelles disparaissent après la fusion Coincidence ;
  // Math.min() propagera ensuite ces valeurs à la clé fusionnée.
  if (triggerAction.type === "ChangeGearRadius") {
    const preFuseDdl = get_degrees_of_freedom(nodes, links);
    if (preFuseDdl >= 3) {
      nodes.posMasses.set(`${triggerAction.id}:pos`, 0);
    }
  }
  if (triggerAction.type === "MoveNode") {
    const movedEl = mechanism.mechanicalElements.find(
      (e) => e.id === triggerAction.id,
    );
    if (movedEl) {
      if ("radius" in movedEl) {
        nodes.radMasses.set(`${triggerAction.id}:rad`, 0);
      }
      if ("fixedGearsIDs" in movedEl) {
        (movedEl as { fixedGearsIDs: string[] }).fixedGearsIDs.forEach(
          (gearId) => {
            nodes.radMasses.set(`${gearId}:rad`, 0);
          },
        );
      }
    }
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
        if (
          "grabbedKey" in link &&
          (link.grabbedKey === k1 || link.grabbedKey === k2)
        )
          link.grabbedKey = k_new;
      });
      nodes.positions.set(
        k_new,
        nodes.positions.get(k1)!.lerp(nodes.positions.get(k2)!, 0.5),
      );
      nodes.positions.delete(k1);
      nodes.positions.delete(k2);
      nodes.posMasses.set(
        k_new,
        Math.min(nodes.posMasses.get(k1)!, nodes.posMasses.get(k2)!),
      );
      nodes.posMasses.delete(k1);
      nodes.posMasses.delete(k2);
    }
  });
  links = links.filter((link) => link.type !== "Coincidence");

  // Maintien de la position (ratio) sur un beam, à moins de grab le node lui-meme OU que le node soit ancré
  links.forEach((link, index) => {
    if (
      link.type === "OnSegment" &&
      link.key3 !== grabConnectionID &&
      nodes.posMasses.get(link.key3)!
    ) {
      const start = nodes.positions.get(link.key1)!;
      const end = nodes.positions.get(link.key2)!;
      const pos = nodes.positions.get(link.key3)!;
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
    const movedEdge = mechanism.mechanicalElements.find(
      (e) => e.id === triggerAction.id,
    )! as EdgeElement;
    // Si il y a 3 ou plus degré de liberté ALORS contrainte de parallélisme.
    ddl = get_degrees_of_freedom(nodes, links);
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
    ddl = get_degrees_of_freedom(nodes, links);
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

  // TODO : Autres beams (dans l'ORDRE) : si il y a 3 ou plus degré de liberté ALORS contrainte de parallélisme.
  // TODO : Autres beams (dans l'ORDRE) : si il y a 3 ou plus degré de liberté ALORS contrainte de longueur.

  // start with last link, which is HandleGrab if there is one
  // let startLinkIndex: number = links.length - 1;

  // Ordonner la liste
  links = sort_links(links, nodes.posMasses);

  // console.log("pos : ", [...nodes.positions.keys()]);
  // console.log("links : ", links);
  /*
  console.log("DDL : ", get_degrees_of_freedom(nodes, links));
  */

  // 3. PBD (Position Based Dynamics)
  const solvedNodes = PBD_kinematic_solver(
    new Map(nodes.positions),
    new Map(nodes.radii),
    nodes.posMasses,
    nodes.radMasses,
    links,
    300,
  );

  // Decouple fused elements
  [...nodes.positions.keys()].forEach((combined_keys) => {
    const keys = combined_keys.split(",");
    if (keys.length > 1) {
      keys.forEach((key) => {
        nodes.positions.set(key, nodes.positions.get(combined_keys)!);
      });
      nodes.positions.delete(combined_keys);
    }
  });
  [...solvedNodes.positions.keys()].forEach((combined_keys) => {
    const keys = combined_keys.split(",");
    if (keys.length > 1) {
      keys.forEach((key) => {
        solvedNodes.positions.set(
          key,
          solvedNodes.positions.get(combined_keys)!,
        );
      });
      solvedNodes.positions.delete(combined_keys);
    }
  });
  // Update constraint positions
  mechanism.constraintElements.forEach((constraint) => {
    switch (constraint.type) {
      case "dimension-edge":
      case "horizontal-align-edge":
      case "vertical-align-edge":
      case "dimension-node-to-node":
      case "horizontal-align-nodes":
      case "vertical-align-nodes":
        const isEdge =
          constraint.type === "dimension-edge" ||
          constraint.type === "horizontal-align-edge" ||
          constraint.type === "vertical-align-edge";
        const oldStart = nodes.positions.get(
          isEdge
            ? `${constraint.edgeID}:start`
            : `${constraint.startNodeID}:pos`,
        );
        const oldEnd = nodes.positions.get(
          isEdge ? `${constraint.edgeID}:end` : `${constraint.endNodeID}:pos`,
        );
        const newStart = solvedNodes.positions.get(
          isEdge
            ? `${constraint.edgeID}:start`
            : `${constraint.startNodeID}:pos`,
        );
        const newEnd = solvedNodes.positions.get(
          isEdge ? `${constraint.edgeID}:end` : `${constraint.endNodeID}:pos`,
        );
        if (!oldStart || !oldEnd || !newStart || !newEnd) break;
        solvedNodes.positions.set(
          `${constraint.id}:pos`,
          constraint.position
            .to_segment_coordinates(oldStart, oldEnd)
            .from_segment_coordinates(newStart, newEnd),
        );
        break;
      case "dimension-edge-to-node":
        const oldEdgeStart = nodes.positions.get(`${constraint.edgeID}:start`);
        const oldEdgeEnd = nodes.positions.get(`${constraint.edgeID}:end`);
        const oldNode = nodes.positions.get(`${constraint.nodeID}:pos`);
        const newEdgeStart = solvedNodes.positions.get(
          `${constraint.edgeID}:start`,
        );
        const newEdgeEnd = solvedNodes.positions.get(
          `${constraint.edgeID}:end`,
        );
        const newNode = solvedNodes.positions.get(`${constraint.nodeID}:pos`);
        if (
          !oldEdgeStart ||
          !oldEdgeEnd ||
          !oldNode ||
          !newEdgeStart ||
          !newEdgeEnd ||
          !newNode
        )
          break;
        const local = constraint.position.to_segment_coordinates(
          oldEdgeStart,
          oldEdgeEnd,
        );
        local.y *=
          newNode.distance_to_line(newEdgeStart, newEdgeEnd) /
          oldNode.distance_to_line(oldEdgeStart, oldEdgeEnd);
        solvedNodes.positions.set(
          `${constraint.id}:pos`,
          local.from_segment_coordinates(newEdgeStart, newEdgeEnd),
        );
        break;
      case "dimension-angle":
      case "normal":
      case "parallel":
      case "equal":
        const oldStartEdgeStart = nodes.positions.get(
          `${constraint.startEdgeID}:start`,
        );
        const oldStartEdgeEnd = nodes.positions.get(
          `${constraint.startEdgeID}:end`,
        );
        const oldEndEdgeStart = nodes.positions.get(
          `${constraint.endEdgeID}:start`,
        );
        const oldEndEdgeEnd = nodes.positions.get(
          `${constraint.endEdgeID}:end`,
        );
        const newStartEdgeStart = solvedNodes.positions.get(
          `${constraint.startEdgeID}:start`,
        );
        const newStartEdgeEnd = solvedNodes.positions.get(
          `${constraint.startEdgeID}:end`,
        );
        const newEndEdgeStart = solvedNodes.positions.get(
          `${constraint.endEdgeID}:start`,
        );
        const newEndEdgeEnd = solvedNodes.positions.get(
          `${constraint.endEdgeID}:end`,
        );
        if (
          !oldStartEdgeStart ||
          !oldStartEdgeEnd ||
          !oldEndEdgeStart ||
          !oldEndEdgeEnd ||
          !newStartEdgeStart ||
          !newStartEdgeEnd ||
          !newEndEdgeStart ||
          !newEndEdgeEnd
        )
          break;
        const localD = constraint.position.to_segment_coordinates(
          oldStartEdgeStart.lerp(oldStartEdgeEnd, 0.5),
          oldEndEdgeStart.lerp(oldEndEdgeEnd, 0.5),
        );
        if (!localD) break;
        const globalD = localD.from_segment_coordinates(
          newStartEdgeStart.lerp(newStartEdgeEnd, 0.5),
          newEndEdgeStart.lerp(newEndEdgeEnd, 0.5),
        );
        if (!globalD) break;
        solvedNodes.positions.set(`${constraint.id}:pos`, globalD);
        break;
      case "dimension-radius":
        const oldPos = nodes.positions.get(`${constraint.gearID}:pos`);
        const oldRadius = nodes.radii.get(`${constraint.gearID}:pos`);
        const newPos = solvedNodes.positions.get(`${constraint.gearID}:pos`);
        const newRadius = solvedNodes.radii.get(`${constraint.gearID}:pos`);
        if (!oldPos || !oldRadius || !newPos || !newRadius) break;
        solvedNodes.positions.set(
          `${constraint.id}:pos`,
          newPos.add(
            constraint.position.sub(oldPos).mul(newRadius / oldRadius),
          ),
        );
        break;
      case "gear-ratio":
        const oldGearStartPos = nodes.positions.get(
          `${constraint.startGearID}:pos`,
        );
        const oldGearEndPos = nodes.positions.get(
          `${constraint.endGearID}:pos`,
        );
        const newGearStartPos = solvedNodes.positions.get(
          `${constraint.startGearID}:pos`,
        );
        const newGearEndPos = solvedNodes.positions.get(
          `${constraint.endGearID}:pos`,
        );
        if (
          !oldGearStartPos ||
          !oldGearEndPos ||
          !newGearStartPos ||
          !newGearEndPos
        )
          break;
        const localG = constraint.position.to_segment_coordinates(
          oldGearStartPos,
          oldGearEndPos,
        );
        localG.y *=
          newGearStartPos.distance_to(newGearEndPos) /
          oldGearStartPos.distance_to(oldGearEndPos);
        solvedNodes.positions.set(
          `${constraint.id}:pos`,
          localG.from_segment_coordinates(newGearStartPos, newGearEndPos),
        );
    }
  });

  return solvedNodes;
}
