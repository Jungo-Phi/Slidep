import {
  Action,
  ConstraintElement,
  MechanicalElement,
  GearElement,
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
  | { type: "GearRatio"; ddl: 1; key1: string; key2: string; ratio: number }
  | { type: "HandleGrab"; ddl: 1; grabbedKey: string; value: Point2 | number };

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
        key1: `${element.startNodeID}:pos`,
        key2: `${element.endNodeID}:pos`,
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
        key1: `${element.startNodeID}:pos`,
        key2: `${element.endNodeID}:pos`,
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
        key2: `${element.endGearID}:pos`,
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

function link_to_str(link: Link): string {
  switch (link.type) {
    case "Coincidence":
      return `coincidence(${link.key1} = ${link.key2})`;
    case "Distance":
      return `distance(${link.key1} — ${link.key2} = ${link.distance})`;
    case "DistanceToLine":
      return `distanceToLine(${link.key3} to ${link.key1}—${link.key2} = ${link.distance})`;
    case "OnSegment":
      return `onSegment(${link.key3} on ${link.key1}—${link.key2})`;
    case "AtSegmentRatio":
      return `atSegmentRatio(${link.key3} at t=${link.t.toFixed(2)} on ${link.key1}—${link.key2})`;
    case "KeepOrientation":
      return `keepOrientation(${link.key1}—${link.key2} dir=(${link.direction.x.toFixed(1)},${link.direction.y.toFixed(1)}))`;
    case "Angle":
      return `angle(${link.key1}—${link.key2} to ${link.key3}—${link.key4} = ${((link.angle * 180) / Math.PI).toFixed(1)}°)`;
    case "Radius":
      return `radius(${link.key1} = ${link.radius})`;
    case "Horizontal":
      return `horizontal(${link.key1}—${link.key2})`;
    case "Vertical":
      return `vertical(${link.key1}—${link.key2})`;
    case "Normal":
      return `normal(${link.key1}—${link.key2} ⊥ ${link.key3}—${link.key4})`;
    case "Parallel":
      return `parallel(${link.key1}—${link.key2} ∥ ${link.key3}—${link.key4})`;
    case "EqualLength":
      return `equalLength(${link.key1}—${link.key2} = ${link.key3}—${link.key4})`;
    case "GearMeshing":
      return `gearMeshing(${link.key1} ⚙ ${link.key2})`;
    case "GearRatio":
      return `gearRatio(${link.key1} / ${link.key2} = ${link.ratio})`;
    case "HandleGrab":
      const val =
        typeof link.value === "number"
          ? link.value.toFixed(1)
          : `(${link.value.x.toFixed(1)}, ${link.value.y.toFixed(1)})`;
      return `handleGrab(${link.grabbedKey} → ${val})`;
  }
}

function link_to_str_min(link: Link): string {
  switch (link.type) {
    case "Coincidence":
      return `coincidence`;
    case "Distance":
      return `Dist(${link.distance})`;
    case "DistanceToLine":
      return `DistToLine(${link.distance})`;
    case "OnSegment":
      return `onSegment`;
    case "AtSegmentRatio":
      return `atSegmentRatio(t=${link.t.toFixed(2)})`;
    case "KeepOrientation":
      return `keepOrientation(dir=(${link.direction.x.toFixed(1)},${link.direction.y.toFixed(1)}))`;
    case "Angle":
      return `Angle(${((link.angle * 180) / Math.PI).toFixed(1)}°)`;
    case "Radius":
      return `Radius(${link.radius})`;
    case "Horizontal":
      return `Horizontal`;
    case "Vertical":
      return `Vertical`;
    case "Normal":
      return `Normal`;
    case "Parallel":
      return `Parallel`;
    case "EqualLength":
      return `Equal()`;
    case "GearMeshing":
      return `GearMeshing`;
    case "GearRatio":
      return `GearRatio(${link.ratio})`;
    case "HandleGrab":
      return `Grab`;
  }
}

function keys_of(link: Link): string[] {
  switch (link.type) {
    case "Radius":
      return [link.key1];
    case "Coincidence":
    case "Distance":
    case "Horizontal":
    case "Vertical":
    case "GearMeshing":
    case "GearRatio":
      return [link.key1, link.key2];
    case "DistanceToLine":
    case "OnSegment":
    case "AtSegmentRatio":
      return [link.key1, link.key2, link.key3];
    case "Angle":
    case "Normal":
    case "Parallel":
    case "EqualLength":
      return [link.key1, link.key2, link.key3, link.key4];
    case "KeepOrientation":
      return [link.key1, link.key2];
    case "HandleGrab":
      return [link.grabbedKey];
  }
}

function sort_links(links: Link[], posMasses: Map<string, number>): Link[] {
  // 1. Construire l'index clé → liens qui la touchent
  const key_to_links = new Map<string, number[]>();
  links.forEach((link, i) => {
    keys_of(link).forEach((k) => {
      if (!key_to_links.has(k)) key_to_links.set(k, []);
      key_to_links.get(k)!.push(i);
    });
  });

  // 2. BFS : priorité aux liens touchant une clé ancrée (masse = 0)
  const visited = new Array(links.length).fill(false);
  const result: Link[] = [];
  const queue: number[] = [];

  // Amorcer avec les HandleGrab en dernier, ancres en premier
  const grab_indices: number[] = [];
  links.forEach((link, i) => {
    if (link.type === "HandleGrab") {
      grab_indices.push(i);
      visited[i] = true;
    }
  });

  // Seed unique : le premier lien touchant une clé de masse 0
  const first_anchored = links.findIndex(
    (link, i) =>
      !visited[i] && keys_of(link).some((k) => posMasses.get(k) === 0),
  );
  if (first_anchored !== -1) {
    queue.push(first_anchored);
    visited[first_anchored] = true;
  }
  // Si rien d'ancré, partir du premier lien non-visité
  if (queue.length === 0 && links.length > 0) {
    queue.push(0);
    visited[0] = true;
  }

  while (
    queue.length > 0 ||
    result.length + grab_indices.length < links.length
  ) {
    if (queue.length === 0) {
      // Composante isolée : trouver le prochain lien non-visité
      const next = links.findIndex((_, i) => !visited[i]);
      if (next === -1) break;
      queue.push(next);
      visited[next] = true;
    }
    const idx = queue.shift()!;
    result.push(links[idx]);
    // Voisins : tous les liens partageant une clé
    keys_of(links[idx]).forEach((k) => {
      key_to_links.get(k)?.forEach((j) => {
        if (!visited[j]) {
          visited[j] = true;
          queue.push(j);
        }
      });
    });
  }

  return [...result, ...grab_indices.map((i) => links[i])];
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
          positions.set(`grab_bridge`, triggerAction.newPosition);
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
      radMasses.set(grabConnectionID, 1);
    } else {
      posMasses.set(grabConnectionID, 1);
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
      positions.set(k_new, positions.get(k1)!.lerp(positions.get(k2)!, 0.5));
      positions.delete(k1);
      positions.delete(k2);
      posMasses.set(k_new, Math.min(posMasses.get(k1)!, posMasses.get(k2)!));
      posMasses.delete(k1);
      posMasses.delete(k2);
    }
  });
  links = links.filter((link) => link.type !== "Coincidence");

  // Maintien de la position (ratio) sur un beam, à moins de grab le node lui-meme OU que le node soit ancré
  links.forEach((link, index) => {
    if (
      link.type === "OnSegment" &&
      link.key3 !== grabConnectionID &&
      posMasses.get(link.key3)!
    ) {
      const start = positions.get(link.key1)!;
      const end = positions.get(link.key2)!;
      const pos = positions.get(link.key3)!;
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

  // start with last link, which is HandleGrab if there is one
  // let startLinkIndex: number = links.length - 1;

  // Ordonner la liste
  links = sort_links(links, posMasses);

  // console.log("pos : ", [...positions.keys()]);
  //console.log("links : ", links.map((link) => link_to_str_min(link)));
  ddl = get_degrees_of_liberty(positions, radii, posMasses, links);
  console.log("DDL : ", ddl);

  // 3. PBD (Position Based Dynamics)
  const nbIterations = 150; // High iterations to ensure rigidity
  const epsilon = 0.000_001; // Very tight tolerance (why not 0.1 ?)

  const nbGrabIterations = 10; // stop grab after `nbGrabIterations` to not stretch the mechanism
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

/** Approche une position ou un rayon vers targetValue.
 * La valeur de 'stiffness' doit être en dessous de 1 pour une attraction moins forte que les autres contraintes. */
function applyHandleGrabConstraint(
  positions: Map<string, Point2>,
  radii: Map<string, number>,
  key: string,
  targetValue: Point2 | number,
  stiffness: number = 0.5,
  maxAmplitude: number = 10,
): number {
  if (typeof targetValue === "number") {
    // Radius
    const r = radii.get(key);
    if (!r) return 0;
    const delta = targetValue - r;
    let target = delta * stiffness;
    if (target > maxAmplitude) target = maxAmplitude;
    if (target < -maxAmplitude) target = -maxAmplitude;
    radii.set(key, r + target);
    return Math.abs(delta);
  } else {
    // Position
    const p = positions.get(key);
    if (!p) return 0;
    const delta = targetValue.sub(p);
    let target = delta.mul(stiffness);
    if (target.length() > maxAmplitude)
      target = delta.scale_to_length(maxAmplitude);
    positions.set(key, p.add(target));
    return delta.length();
  }
}

/** Contraint la distance entre deux points à valoir targetDist.
 * L'erreur (écart à la distance cible) est corrigée le long de l'axe p1→p2 :
 * chaque point est déplacé proportionnellement à sa masse (w/totalW) et à stiffness. */
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
    return targetDist;
  }
  const error = delta.length() - targetDist;
  const diff = error / delta.length();

  positions.set(key1, p1.add(delta.mul(diff * (w1 / totalW) * stiffness)));
  positions.set(key2, p2.sub(delta.mul(diff * (w2 / totalW) * stiffness)));
  return Math.abs(error);
}

/** Contraint la distance perpendiculaire entre un point (keyNode) et une droite
 * définie par (keyStart, keyEnd). Chaque point est déplacé proportionnellement
 * à sa masse pour réduire l'erreur. */
function applyDistanceToLineConstraint(
  positions: Map<string, Point2>,
  posMasses: Map<string, number>,
  keyStart: string,
  keyEnd: string,
  keyNode: string,
  targetDist: number,
  stiffness: number = 1.0,
): number {
  const pNode = positions.get(keyNode);
  const start = positions.get(keyStart);
  const end = positions.get(keyEnd);
  const wNode = posMasses.get(keyNode) ?? 1;
  const wStart = posMasses.get(keyStart) ?? 1;
  const wEnd = posMasses.get(keyEnd) ?? 1;
  if (!pNode || !start || !end) return 0;

  // Vecteur perpendiculaire normalisé de la droite, pointant vers le nœud
  const proj = pNode.project_on_line(start, end);
  const vec = pNode.sub(proj); // vecteur perp du pied de perp vers le nœud
  const len = vec.length();

  let perpDir: Point2;
  if (len === 0) {
    // Nœud sur la ligne : on choisit une direction perpendiculaire arbitraire
    perpDir = end.sub(start).perp().normalize();
  } else {
    perpDir = vec.mul(1 / len);
  }

  const currentDist = len;
  const error = currentDist - targetDist; // signé : positif = trop loin

  // On pondère : wNode bouge le nœud, (wStart+wEnd)/2 bouge la ligne.
  const wLine = (wStart + wEnd) / 2;
  const totalW = wNode + wLine;
  if (totalW === 0) return 0;

  // Déplacement du nœud : le ramène vers la ligne de "error * wNode/totalW"
  const nodeCorrection = perpDir.mul(-error * (wNode / totalW) * stiffness);
  if (wNode !== 0) positions.set(keyNode, pNode.add(nodeCorrection));

  // Déplacement des extrémités : la ligne s'éloigne du nœud de "error * wLine/totalW"
  const lineCorrection = perpDir.mul(error * (wLine / totalW) * stiffness);
  if (wStart !== 0) positions.set(keyStart, start.add(lineCorrection));
  if (wEnd !== 0) positions.set(keyEnd, end.add(lineCorrection));

  return Math.abs(error);
}

const EDGE_END_MARGIN = 15;

/** Contraint un point (keyNode) à rester sur le segment (keyStart, keyEnd).
 * Le paramètre t est recalculé à chaque itération (projection libre sur le segment),
 * avec une marge pour éviter les extrémités. Chaque point est déplacé selon sa masse. */
function applyOnSegmentConstraint(
  positions: Map<string, Point2>,
  posMasses: Map<string, number>,
  keyStart: string,
  keyEnd: string,
  keyNode: string,
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

  const edgeLength = start.distance_to(end);
  const t = Math.max(
    EDGE_END_MARGIN / edgeLength,
    Math.min(
      pNode.parameter_on_segment(start, end),
      1 - EDGE_END_MARGIN / edgeLength,
    ),
  );
  const delta = pNode.sub(start.lerp(end, t));
  const error = delta.length();

  positions.set(keyNode, pNode.sub(delta.mul((wNode / totalW) * stiffness)));
  positions.set(keyStart, start.add(delta.mul((wStart / totalW) * stiffness)));
  positions.set(keyEnd, end.add(delta.mul((wEnd / totalW) * stiffness)));
  return error;
}

/** Contraint un point (keyNode) à se trouver exactement au ratio t fixe sur le
 * segment (keyStart, keyEnd), i.e. à la position lerp(start, end, t).
 * Contrairement à OnSegment, t est constant (ratio mémorisé au moment du grab).
 * Chaque point est déplacé selon sa masse. */
function applyAtSegmentRatioConstraint(
  positions: Map<string, Point2>,
  posMasses: Map<string, number>,
  keyStart: string,
  keyEnd: string,
  keyNode: string,
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

/** Contraint le segment (keyStart, keyEnd) à rester parallèle à une direction fixe.
 * Chaque extrémité est projetée sur la droite passant par le milieu du segment
 * avec cette direction, en proportion de sa masse. */
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

  if (wStart !== 0)
    positions.set(
      keyStart,
      start.lerp(projStart, (wStart / totalW) * stiffness),
    );
  if (wEnd !== 0)
    positions.set(keyEnd, end.lerp(projEnd, (wEnd / totalW) * stiffness));
  return error;
}

/** Contraint les deux points à avoir la même coordonnée Y (alignement horizontal).
 * Le Y cible est la moyenne pondérée des Y des deux points selon leurs masses. */
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

  const error = start.y - end.y;

  if (wStart !== 0)
    positions.set(
      keyStart,
      new Point2(start.x, start.y - error * (wStart / totalW) * stiffness),
    );
  if (wEnd !== 0) {
    positions.set(
      keyEnd,
      new Point2(end.x, end.y + error * (wEnd / totalW) * stiffness),
    );
  }
  return Math.abs(error);
}

/** Contraint les deux points à avoir la même coordonnée X (alignement vertical).
 * Le X cible est la moyenne pondérée des X des deux points selon leurs masses. */
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

  const error = start.x - end.x;

  if (wStart !== 0)
    positions.set(
      keyStart,
      new Point2(start.x - error * (wStart / totalW) * stiffness, start.y),
    );
  if (wEnd !== 0)
    positions.set(
      keyEnd,
      new Point2(end.x + error * (wEnd / totalW) * stiffness, end.y),
    );
  return Math.abs(error);
}

/** Contraint deux segments à être parallèles.
 * L'angle résiduel (diff) est distribué entre les deux segments au prorata
 * de leurs masses totales : le segment le plus léger tourne davantage.
 * Chaque segment pivote autour de son propre centre. */
function applyParallelConstraint(
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

  const v1 = pe1.sub(ps1);
  const v2 = pe2.sub(ps2);

  // Différence d'angle à corriger (modulo π car les segments ne sont pas orientés)
  let diff = v2.angle() - v1.angle();
  // Ramener diff dans [-π/2, π/2] pour choisir la correction la plus courte
  while (diff > Math.PI / 2) diff -= Math.PI;
  while (diff < -Math.PI / 2) diff += Math.PI;

  const error = Math.abs(diff);

  // Masses totales de chaque segment
  const w1 = (posMasses.get(s1) ?? 1) + (posMasses.get(e1) ?? 1);
  const w2 = (posMasses.get(s2) ?? 1) + (posMasses.get(e2) ?? 1);
  const totalW = w1 + w2;
  if (totalW === 0) return 0;

  // Segment 1 : tourne de +diff * (w1/totalW) * stiffness
  const rot1 = diff * (w1 / totalW) * stiffness;
  const center1 = ps1.lerp(pe1, 0.5);
  const half1 = v1.mul(0.5).rotate(rot1);
  if (posMasses.get(s1) !== 0) positions.set(s1, center1.sub(half1));
  if (posMasses.get(e1) !== 0) positions.set(e1, center1.add(half1));

  // Segment 2 : tourne de -diff * (w2/totalW) * stiffness
  const rot2 = -diff * (w2 / totalW) * stiffness;
  const center2 = ps2.lerp(pe2, 0.5);
  const half2 = v2.mul(0.5).rotate(rot2);
  if (posMasses.get(s2) !== 0) positions.set(s2, center2.sub(half2));
  if (posMasses.get(e2) !== 0) positions.set(e2, center2.add(half2));

  return error;
}

/** Contraint deux segments à être perpendiculaires (angle = π/2 entre eux).
 * Identique à applyParallelConstraint mais la cible est un angle de 90°.
 * La correction angulaire est distribuée entre les deux segments selon leurs masses. */
function applyNormalConstraint(
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

  const v1 = pe1.sub(ps1);
  const v2 = pe2.sub(ps2);

  // Différence par rapport à la cible de 90° (π/2)
  let diff = v2.angle() - (v1.angle() + Math.PI / 2);
  // Ramener diff dans [-π/2, π/2]
  while (diff > Math.PI / 2) diff -= Math.PI;
  while (diff < -Math.PI / 2) diff += Math.PI;

  const error = Math.abs(diff);

  const w1 = (posMasses.get(s1) ?? 1) + (posMasses.get(e1) ?? 1);
  const w2 = (posMasses.get(s2) ?? 1) + (posMasses.get(e2) ?? 1);
  const totalW = w1 + w2;
  if (totalW === 0) return 0;

  // Segment 1 : tourne dans le sens positif
  const rot1 = diff * (w1 / totalW) * stiffness;
  const center1 = ps1.lerp(pe1, 0.5);
  const half1 = v1.mul(0.5).rotate(rot1);
  if (posMasses.get(s1) !== 0) positions.set(s1, center1.sub(half1));
  if (posMasses.get(e1) !== 0) positions.set(e1, center1.add(half1));

  // Segment 2 : tourne dans le sens négatif
  const rot2 = -diff * (w2 / totalW) * stiffness;
  const center2 = ps2.lerp(pe2, 0.5);
  const half2 = v2.mul(0.5).rotate(rot2);
  if (posMasses.get(s2) !== 0) positions.set(s2, center2.sub(half2));
  if (posMasses.get(e2) !== 0) positions.set(e2, center2.add(half2));

  return error;
}

/** Contraint l'angle orienté entre deux segments à valoir targetAngle.
 * La correction angulaire est distribuée entre les deux segments au prorata
 * de leurs masses totales respectives. */
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

  // Différence à corriger, ramenée dans [-π, π]
  let diff = currentAngle - targetAngle;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;

  const error = Math.abs(diff);

  const w1 = (posMasses.get(s1) ?? 1) + (posMasses.get(e1) ?? 1);
  const w2 = (posMasses.get(s2) ?? 1) + (posMasses.get(e2) ?? 1);
  const totalW = w1 + w2;
  if (totalW === 0) return 0;

  // Segment 1 : tourne dans le sens positif pour réduire diff
  const rot1 = diff * (w1 / totalW) * stiffness;
  const center1 = ps1.lerp(pe1, 0.5);
  const half1 = v1.mul(0.5).rotate(rot1);
  if (posMasses.get(s1) !== 0) positions.set(s1, center1.sub(half1));
  if (posMasses.get(e1) !== 0) positions.set(e1, center1.add(half1));

  // Segment 2 : tourne dans le sens négatif pour réduire diff
  const rot2 = -diff * (w2 / totalW) * stiffness;
  const center2 = ps2.lerp(pe2, 0.5);
  const half2 = v2.mul(0.5).rotate(rot2);
  if (posMasses.get(s2) !== 0) positions.set(s2, center2.sub(half2));
  if (posMasses.get(e2) !== 0) positions.set(e2, center2.add(half2));

  return error;
}

/** Contraint deux segments à avoir la même longueur.
 * La longueur cible est la moyenne pondérée des deux longueurs selon les masses
 * totales de chaque segment : le segment le plus léger s'adapte davantage.
 * Délègue ensuite à applyDistanceConstraint pour chaque segment. */
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

  const w1 = (posMasses.get(s1) ?? 1) + (posMasses.get(e1) ?? 1);
  const w2 = (posMasses.get(s2) ?? 1) + (posMasses.get(e2) ?? 1);
  const totalW = w1 + w2;
  const targetLen =
    totalW > 0 ? (len1 * w1 + len2 * w2) / totalW : (len1 + len2) / 2;

  const error = Math.abs(len1 - len2);

  applyDistanceConstraint(positions, posMasses, s1, e1, targetLen, stiffness);
  applyDistanceConstraint(positions, posMasses, s2, e2, targetLen, stiffness);
  return error;
}

const MIN_GEAR_RADIUS = 20;

/** Contraint la distance entre deux centres d'engrenages à être exactement r1+r2
 * (condition d'engrènement). La correction est distribuée entre les positions et
 * les rayons selon leurs masses : si les centres sont bloqués, ce sont les rayons
 * qui s'adaptent, et inversement. */
function applyGearMeshingConstraint(
  positions: Map<string, Point2>,
  posMasses: Map<string, number>,
  radii: Map<string, number>,
  radMasses: Map<string, number>,
  g1: string,
  g2: string,
  stiffness: number = 1.0,
): number {
  const p1 = positions.get(g1);
  const p2 = positions.get(g2);
  const r1 = radii.get(g1);
  const r2 = radii.get(g2);
  const wPos1 = posMasses.get(g1) ?? 1;
  const wPos2 = posMasses.get(g2) ?? 1;
  const wRad1 = radMasses.get(g1) ?? 1;
  const wRad2 = radMasses.get(g2) ?? 1;
  if (!p1 || !p2 || r1 === undefined || r2 === undefined) return 0;

  const dist = p1.distance_to(p2);
  const targetDist = r1 + r2;
  const error = dist - targetDist; // signé : positif = trop éloignés

  // Poids total : positions (comptent pour 1 chacune) + rayons (comptent pour 1 chacun)
  // Un rayon corrige l'erreur de distance de 1 pour 1, comme un point.
  const totalW = wPos1 + wPos2 + wRad1 + wRad2;
  if (totalW === 0) return 0;

  // Correction des positions : rapproche/éloigne les centres le long de leur axe
  if (wPos1 !== 0 || wPos2 !== 0) {
    const posW = wPos1 + wPos2;
    applyDistanceConstraint(
      positions,
      posMasses,
      g1,
      g2,
      targetDist,
      (posW / totalW) * stiffness,
    );
  }

  // Correction des rayons : augmente/diminue r1 et r2 pour résorber le reste de l'erreur.
  // Les deux rayons bougent dans le même sens (tous deux grandissent si dist > r1+r2).
  const radCorrection = error * stiffness;
  if (wRad1 !== 0)
    radii.set(
      g1,
      Math.max(MIN_GEAR_RADIUS, r1 + radCorrection * (wRad1 / totalW)),
    );
  if (wRad2 !== 0)
    radii.set(
      g2,
      Math.max(MIN_GEAR_RADIUS, r2 + radCorrection * (wRad2 / totalW)),
    );
  return Math.abs(error);
}

/** Contraint le rapport des rayons de deux engrenages à valoir `ratio` (r1/r2 = ratio).
 * La correction est distribuée entre les deux rayons selon leurs masses :
 * le rayon libre bougera davantage que le rayon ancré. */
function applyGearRatioConstraint(
  radii: Map<string, number>,
  radMasses: Map<string, number>,
  g1: string,
  g2: string,
  ratio: number,
  stiffness: number = 1.0,
): number {
  const r1 = radii.get(g1);
  const r2 = radii.get(g2);
  const w1 = radMasses.get(g1) ?? 1;
  const w2 = radMasses.get(g2) ?? 1;
  if (r1 === undefined || r2 === undefined) return 0;

  const totalW = w1 + w2;
  if (totalW === 0) return 0;

  // Rayon cible pour chaque engrenage en supposant r1/r2 = ratio :
  // r1_target = sqrt(r1 * r2 * ratio), r2_target = r1_target / ratio
  // Approche simplifiée : on cherche le scale s tel que (r1*s) / (r2/s) = ratio
  // => s² = ratio * r2 / r1, s = sqrt(ratio * r2 / r1)
  // Mais on distribue juste la correction proportionnellement aux masses :
  const currentRatio = r1 / r2;
  const ratioError = currentRatio - ratio; // signé
  const error = Math.abs(ratioError);

  // Correction : on ajuste r1 à la baisse et r2 à la hausse (ou inversement)
  // de façon à réduire l'erreur de ratio, pondéré par les masses.
  // dr1 = -ratioError * r2 * (w1/totalW) * stiffness  (dérivée de r1/r2 par r1 = 1/r2)
  // dr2 = +ratioError * r1/r2² * r2 * (w2/totalW) * stiffness = ratioError * r1/r2 * ...
  // Simplifié : on tire les deux rayons vers la cible commune weighted-average.
  const targetR1 = ratio * r2; // r1 si r2 est fixe
  const targetR2 = r1 / ratio; // r2 si r1 est fixe
  if (w1 !== 0)
    radii.set(
      g1,
      Math.max(
        MIN_GEAR_RADIUS,
        r1 + (targetR1 - r1) * (w1 / totalW) * stiffness,
      ),
    );
  if (w2 !== 0)
    radii.set(
      g2,
      Math.max(
        MIN_GEAR_RADIUS,
        r2 + (targetR2 - r2) * (w2 / totalW) * stiffness,
      ),
    );

  return error;
}
