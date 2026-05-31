import {
  Action,
  EdgeElement,
  ActionBundleType,
  Link,
  Point2,
  Nodes,
  Mechanism,
} from "../../types";
import { get_mechanical_element_from_id } from "../mechanical-canvas/connect-actions";
import { get_degrees_of_freedom, sort_links } from "./utils";
import { constraint_to_link, get_nodes } from "./parsing";
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
  const nodes = get_nodes(mechanism.mechanicalElements);
  let links: Link[] = [];

  // 2. Initialize edges (links) of the dependency graph
  mechanism.constraintElements.forEach((constraint_element) => {
    links.push(constraint_to_link(constraint_element));
  });
  // Connections (looking from edges to avoid duplicates)
  mechanism.mechanicalElements.forEach((element) => {
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
    if (element.type === "gear") {
      element.meshedGearsIDs.forEach((meshedId) => {
        if (
          links.filter(
            (link) =>
              link.type === "GearMeshing" &&
              link.key2 === `${element.id}:pos` &&
              link.key1 === `${meshedId}:pos`,
          ).length === 0
        ) {
          links.push({
            type: "GearMeshing",
            ddl: 1,
            key1: `${element.id}:pos`,
            key2: `${meshedId}:pos`,
          });
        }
      });
      element.fixedGearsIDs.forEach((fixedId) => {
        if (
          links.filter(
            (link) =>
              link.type === "Coincidence" &&
              link.key2 === `${element.id}:pos` &&
              link.key1 === `${fixedId}:pos`,
          ).length === 0
        ) {
          links.push({
            type: "Coincidence",
            ddl: 2,
            key1: `${element.id}:pos`,
            key2: `${fixedId}:pos`,
          });
        }
      });
    }
  });

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
          const movedEdge = mechanism.mechanicalElements.find(
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
          // TODO : Anchor gear when changing it's radius Mais seulement si DDL ok
          // const gear = mechanicalElements.find((e) => e.id === triggerAction.id)! as GearElement;
          grabPoint = triggerAction.newRadius;
          grabConnectionID = `${triggerAction.id}:pos`;
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

  if (grabPoint !== undefined && grabConnectionID !== undefined) {
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
    ddl = get_degrees_of_freedom(
      nodes.positions,
      nodes.radii,
      nodes.posMasses,
      links,
    );
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
    ddl = get_degrees_of_freedom(
      nodes.positions,
      nodes.radii,
      nodes.posMasses,
      links,
    );
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
    ddl = get_degrees_of_freedom(
      nodes.positions,
      nodes.radii,
      nodes.posMasses,
      links,
    );
    // Si il y a 3 ou plus degré de liberté ALORS contrainte de position de l'engrenage.
    if (ddl >= 3) {
      nodes.posMasses.set(`${triggerAction.id}:pos`, 0);
    }
  }
  // MovingGear sélectionné
  if (triggerAction.type === "MoveNode") {
    ddl = get_degrees_of_freedom(
      nodes.positions,
      nodes.radii,
      nodes.posMasses,
      links,
    );
    // Si il y a 2 ou plus degré de liberté ALORS contrainte de rayon de l'engrenage.
    if (ddl >= 2) {
      nodes.radMasses.set(`${triggerAction.id}:pos`, 0);
    }
  }

  // TODO : Autres beams (dans l'ORDRE) : si il y a 3 ou plus degré de liberté ALORS contrainte de parallélisme.
  // TODO : Autres beams (dans l'ORDRE) : si il y a 3 ou plus degré de liberté ALORS contrainte de longueur.

  // start with last link, which is HandleGrab if there is one
  // let startLinkIndex: number = links.length - 1;

  // Ordonner la liste
  links = sort_links(links, nodes.posMasses);

  // console.log("pos : ", [...nodes.positions.keys()]);
  //console.log("links : ", links);
  ddl = get_degrees_of_freedom(
    nodes.positions,
    nodes.radii,
    nodes.posMasses,
    links,
  );
  console.log("DDL : ", ddl);

  // 3. PBD (Position Based Dynamics)
  const solvedNodes = PBD_kinematic_solver(
    nodes.positions,
    nodes.radii,
    nodes.posMasses,
    nodes.radMasses,
    links,
    150,
  );

  // Decouple fused elements
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

  return solvedNodes;
}
