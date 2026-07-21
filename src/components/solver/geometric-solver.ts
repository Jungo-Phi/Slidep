import {
  Action,
  EdgeElement,
  ActionBundleType,
  Point2,
  GeomNodes,
  Mechanism,
} from "../../types";
import { get_mechanical_element_from_id } from "../mechanism/connect-actions";
import { get_geom_degrees_of_freedom, sort_links } from "./utils";
import {
  belt_length_link,
  elements_by_id,
  get_links_geometric,
  get_geom_nodes,
} from "./parsing";
import { PBD_kinematic_solver } from "./PBD_kinematic_solver";
import { belt_terminal_axes, separation_links } from "./disconnect-separation";

/**
 * Resolves geometric constraints for a given mechanism and a triggering action.
 */
export function resolveGeometricConstraints(
  mechanism: Mechanism,
  actionBundleType: ActionBundleType,
  triggerAction: Action,
  /** The whole bundle. Only the separation of what it disconnects reads it —
   *  every other rule answers to `triggerAction` alone. */
  bundleActions: Action[] = [triggerAction],
): GeomNodes {
  // *
  // Phase A : Création du graphe de dépendances
  // *

  // 1. Initialize nodes (positions and radii) of the dependency graph
  // 2. Initialize edges (links) of the dependency graph
  const nodes = get_geom_nodes(mechanism.mechanicalElements);
  let links = get_links_geometric(
    mechanism.mechanicalElements,
    mechanism.constraintElements,
  );

  // Un rayon dimensionné est fixe : on l'ancre (radMass 0) à sa valeur cible.
  // Aucune contrainte (engrènement, pin de périmètre, grab…) ne peut alors le
  // modifier — le nœud épinglé suit le rayon au lieu de le changer. Sans
  // dimension, radMass reste 1 : le rayon est un DDL libre, redimensionnable.
  mechanism.constraintElements.forEach((c) => {
    if (c.type === "dimension-radius" && nodes.radii.has(c.gearID)) {
      nodes.radii.set(c.gearID, c.value);
      nodes.radMasses.set(c.gearID, 0);
    }
  });

  let grabPoint: Point2 | number | undefined = undefined;
  let grabConnectionID: string | undefined = undefined;
  // MoveElements mute nodes.positions avant le solve : on garde les positions
  // d'origine pour que la mise à jour des contraintes voie un vrai "avant".
  let preMovePositions: Map<string, Point2> | undefined = undefined;
  switch (actionBundleType) {
    case "MoveElement":
      if (
        triggerAction.type !== "MoveNode" &&
        triggerAction.type !== "MoveEdgeStart" &&
        triggerAction.type !== "MoveEdgeEnd" &&
        triggerAction.type !== "MoveEdgeBody" &&
        triggerAction.type !== "MoveElements" &&
        triggerAction.type !== "ChangeGearRadius" &&
        triggerAction.type !== "ChangeEdgeLength" &&
        triggerAction.type !== "ChangeBeltLength"
      )
        throw console.error("impossible");

      switch (triggerAction.type) {
        case "MoveNode":
          grabPoint = triggerAction.newPosition;
          grabConnectionID = `${triggerAction.id}`;
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
            type: "FixedOnSegment",
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
            } else if (link.type === "FixedOnSegment") {
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
          preMovePositions = new Map(nodes.positions);
          // move and remove anchor from dragged elements
          triggerAction.elementIDs.forEach((elementID) => {
            const element = get_mechanical_element_from_id(
              elementID,
              mechanism.mechanicalElements,
            );
            if ("position" in element) {
              nodes.positions.set(
                `${element.id}`,
                nodes.positions.get(`${element.id}`)!.add(triggerAction.delta),
              );
              nodes.posMasses.set(`${element.id}`, 1);
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
        case "ChangeGearRadius": {
          // Grab a point that slides on the gear perimeter and pull it toward
          // the mouse. A `GearMeshing` link against a zero-radius bridge keeps
          // |centre − bridge| = radius (radius stays a DOF), so the solver
          // shares the correction between the radius and the centre position.
          const center = nodes.positions.get(`${triggerAction.id}`);
          const radius = nodes.radii.get(`${triggerAction.id}`);
          if (center && radius !== undefined) {
            const dir = triggerAction.target.sub(center);
            const u =
              dir.length_squared() > 1e-9 ? dir.normalize() : new Point2(1, 0);
            nodes.positions.set("grab_perimeter", center.add(u.mul(radius)));
            nodes.posMasses.set("grab_perimeter", 1);
            nodes.radii.set("grab_perimeter", 0);
            nodes.radMasses.set("grab_perimeter", 0);
            links.push({
              type: "GearMeshing",
              ddl: 1,
              key1: `${triggerAction.id}`,
              key2: "grab_perimeter",
              radKey1: `${triggerAction.id}`,
              radKey2: "grab_perimeter",
            });
            grabPoint = triggerAction.target;
            grabConnectionID = "grab_perimeter";
          }
          break;
        }
        case "ChangeEdgeLength":
          links.push({
            type: "Distance",
            ddl: 1,
            key1: `${triggerAction.id}:start`,
            key2: `${triggerAction.id}:end`,
            distance: triggerAction.newLength,
          });
          break;
        case "ChangeBeltLength": {
          // Momentary inextensible-belt constraint: hold the whole loop at the
          // requested length while the gears relax to satisfy it.
          const belt = get_mechanical_element_from_id(
            triggerAction.id,
            mechanism.mechanicalElements,
          );
          if (belt && belt.type === "belt") {
            const link = belt_length_link(
              belt,
              elements_by_id(mechanism.mechanicalElements),
              mechanism.mechanicalElements,
              triggerAction.newLength,
            );
            if (link) links.push(link);
          }
          break;
        }
      }
      break;
    case "Connects":
      // Momentary: pushes apart what this bundle detached, then it is gone.
      links.push(
        ...separation_links(
          bundleActions,
          mechanism,
          belt_terminal_axes(mechanism),
        ),
      );
      break;
    case "ChangeDimension":
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
    // Keep the centre stable only when the radius is free to grow (no mesh and
    // no radius dimension). When meshed or radius-constrained, the centre must
    // stay free so the gear can move to keep tangency / honour the held radius.
    const gearEl = get_mechanical_element_from_id(
      triggerAction.id,
      mechanism.mechanicalElements,
    );
    const hasMesh =
      "meshedGearsIDs" in gearEl && gearEl.meshedGearsIDs.length > 0;
    const hasRadiusDim = mechanism.constraintElements.some(
      (c) => c.type === "dimension-radius" && c.gearID === triggerAction.id,
    );
    if (!hasMesh && !hasRadiusDim) {
      nodes.posMasses.set(`${triggerAction.id}`, 0);
    }
  }
  if (triggerAction.type === "MoveNode") {
    const movedEl = mechanism.mechanicalElements.find(
      (e) => e.id === triggerAction.id,
    );
    if (movedEl) {
      if ("radius" in movedEl) {
        nodes.radMasses.set(`${triggerAction.id}`, 0);
      }
      if ("fixedGearsIDs" in movedEl) {
        (movedEl as { fixedGearsIDs: string[] }).fixedGearsIDs.forEach(
          (gearId) => {
            nodes.radMasses.set(`${gearId}`, 0);
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
        // Belt links hold their keys in dedicated fields / an array.
        if (link.type === "BeltLength") {
          if (link.startKey === k1 || link.startKey === k2)
            link.startKey = k_new;
          if (link.endKey === k1 || link.endKey === k2) link.endKey = k_new;
          link.gearPosKeys = link.gearPosKeys.map((k) =>
            k === k1 || k === k2 ? k_new : k,
          );
        }
        if (link.type === "BeltJunction") {
          if (link.nodeKey === k1 || link.nodeKey === k2) link.nodeKey = k_new;
          link.gearPosKeys = link.gearPosKeys.map((k) =>
            k === k1 || k === k2 ? k_new : k,
          );
        }
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
      link.type === "SlideOnSegment" &&
      link.key3 !== grabConnectionID &&
      nodes.posMasses.get(link.key3)!
    ) {
      const start = nodes.positions.get(link.key1)!;
      const end = nodes.positions.get(link.key2)!;
      const pos = nodes.positions.get(link.key3)!;
      links[index] = {
        type: "FixedOnSegment",
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
    ddl = get_geom_degrees_of_freedom(nodes, links);
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
    ddl = get_geom_degrees_of_freedom(nodes, links);
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
  console.log("DDL : ", get_geom_degrees_of_freedom(nodes, links));
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
  if (preMovePositions) {
    preMovePositions.forEach((pos, key) => nodes.positions.set(key, pos));
  }
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
          isEdge ? `${constraint.edgeID}:start` : `${constraint.startNodeID}`,
        );
        const oldEnd = nodes.positions.get(
          isEdge ? `${constraint.edgeID}:end` : `${constraint.endNodeID}`,
        );
        const newStart = solvedNodes.positions.get(
          isEdge ? `${constraint.edgeID}:start` : `${constraint.startNodeID}`,
        );
        const newEnd = solvedNodes.positions.get(
          isEdge ? `${constraint.edgeID}:end` : `${constraint.endNodeID}`,
        );
        if (!oldStart || !oldEnd || !newStart || !newEnd) break;
        solvedNodes.positions.set(
          `${constraint.id}`,
          constraint.position
            .to_segment_coordinates(oldStart, oldEnd)
            .from_segment_coordinates(newStart, newEnd),
        );
        break;
      case "dimension-edge-to-node":
        const oldEdgeStart = nodes.positions.get(`${constraint.edgeID}:start`);
        const oldEdgeEnd = nodes.positions.get(`${constraint.edgeID}:end`);
        const oldNode = nodes.positions.get(`${constraint.nodeID}`);
        const newEdgeStart = solvedNodes.positions.get(
          `${constraint.edgeID}:start`,
        );
        const newEdgeEnd = solvedNodes.positions.get(
          `${constraint.edgeID}:end`,
        );
        const newNode = solvedNodes.positions.get(`${constraint.nodeID}`);
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
          newNode.distance2line(newEdgeStart, newEdgeEnd) /
          oldNode.distance2line(oldEdgeStart, oldEdgeEnd);
        solvedNodes.positions.set(
          `${constraint.id}`,
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
        solvedNodes.positions.set(`${constraint.id}`, globalD);
        break;
      case "dimension-radius":
        const oldPos = nodes.positions.get(`${constraint.gearID}`);
        const oldRadius = nodes.radii.get(`${constraint.gearID}`);
        const newPos = solvedNodes.positions.get(`${constraint.gearID}`);
        const newRadius = solvedNodes.radii.get(`${constraint.gearID}`);
        if (!oldPos || !oldRadius || !newPos || !newRadius) break;
        solvedNodes.positions.set(
          `${constraint.id}`,
          newPos.add(
            constraint.position.sub(oldPos).mul(newRadius / oldRadius),
          ),
        );
        break;
      case "gear-ratio":
        const oldGearStartPos = nodes.positions.get(
          `${constraint.startGearID}`,
        );
        const oldGearEndPos = nodes.positions.get(`${constraint.endGearID}`);
        const newGearStartPos = solvedNodes.positions.get(
          `${constraint.startGearID}`,
        );
        const newGearEndPos = solvedNodes.positions.get(
          `${constraint.endGearID}`,
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
          `${constraint.id}`,
          localG.from_segment_coordinates(newGearStartPos, newGearEndPos),
        );
    }
  });

  return solvedNodes;
}
