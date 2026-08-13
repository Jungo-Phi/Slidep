import {
  Action,
  EdgeElement,
  DEGENERATE_LENGTH,
  Link,
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
import { DIM } from "../../constants/rendering-specs";
import { screen2world_length } from "../../utils";

/**
 * Hard cap on the sweeps one edition solve may run. Not a convergence target — the solve
 * exits on constraint satisfaction — but the guard that keeps an unsatisfiable sketch,
 * which is a legitimate thing to be drawing, from running forever.
 */
const EDITION_SWEEPS = 300;

/**
 * Where a radius grab takes hold of the rim: on the bearing of the target it is pulled to, never on the cursor's.
 *
 * Exported so that asking what the grab was granted reads the very handle the solve moved. Rebuilt elsewhere, the two drift, and a hover then measures a bearing where the gesture only ever produced a radius.
 */
export function gear_grab_handle(
  center: Point2,
  radius: number,
  target: Point2,
): Point2 {
  const dir = target.sub(center);
  const unit = dir.length_squared() > 1e-9 ? dir.normalize() : new Point2(1, 0);
  return center.add(unit.mul(radius));
}

/** The two keys of a link, in an order that does not depend on which way it was written. */
const key_pair = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * The floor each straight edge answers to, one link per edge.
 *
 * Unlike a gear radius, a length is not a quantity the solver stores — it is the distance between two nodes, and there is no writer to clamp. The floor has to be a constraint like any other, and a one-sided one: a bar may be as long as it likes.
 *
 * Never longer than the edge already measures, for the reason the cursor bounds give: a resize answers to what one can see *or* to the size in hand, whichever is smaller, and never blows out a bar drawn short at high zoom.
 *
 * Belts are left out. Their two ends are meant to meet — that is the loop closing — and their length is the run around the pulleys, not the span between the terminals.
 */
function min_length_links(
  mechanicalElements: Mechanism["mechanicalElements"],
  floor: number,
): Link[] {
  const links: Link[] = [];
  for (const element of mechanicalElements) {
    if (!("positionStart" in element) || element.type === "belt") continue;
    const edge = element as EdgeElement;
    links.push({
      type: "MinDistance",
      ddl: 0,
      key1: `${edge.id}:start`,
      key2: `${edge.id}:end`,
      distance: Math.min(
        floor,
        edge.positionStart.distance_to(edge.positionEnd),
      ),
    });
  }
  return links;
}

/**
 * Resolves geometric constraints for a given mechanism and a triggering action.
 */
export function resolveGeometricConstraints(
  mechanism: Mechanism,
  /** The action the solve pulls against, absent when the bundle only reshapes the graph (connections, deletions). */
  trigger: Action | undefined,
  /** The whole bundle. Only the separation of what it disconnects reads it — every other rule answers to `trigger` alone. */
  bundleActions: Action[],
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
  // Pushed before the fusion below, so their keys are rewritten with everyone
  // else's; the ones a dimension already answers for are dropped after it, when
  // both are stated in the same keys.
  links.push(
    ...min_length_links(
      mechanism.mechanicalElements,
      screen2world_length(DIM.MIN_EDGE_LENGTH, mechanism.viewport),
    ),
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
  /** Key of a node whose value was typed: pinned rather than pulled, once fusion is done. */
  let pin: string | undefined = undefined;
  // MoveElements mute nodes.positions avant le solve : on garde les positions
  // d'origine pour que la mise à jour des contraintes voie un vrai "avant".
  let preMovePositions: Map<string, Point2> | undefined = undefined;
  if (trigger) {
    switch (trigger.type) {
      case "MoveNode":
        if (trigger.committed) pin = `${trigger.id}`;
        else grabConnectionID = `${trigger.id}`;
        grabPoint = trigger.newPosition;
        break;
      case "MoveEdgeStart":
        if (trigger.committed) pin = `${trigger.id}:start`;
        else grabConnectionID = `${trigger.id}:start`;
        grabPoint = trigger.newPosition;
        break;
      case "MoveEdgeEnd":
        if (trigger.committed) pin = `${trigger.id}:end`;
        else grabConnectionID = `${trigger.id}:end`;
        grabPoint = trigger.newPosition;
        break;
      case "MoveEdgeBody":
        links.push({
          type: "FixedOnSegment",
          ddl: 2,
          key1: `${trigger.id}:start`,
          key2: `${trigger.id}:end`,
          key3: `grab_bridge`,
          t: trigger.t,
        });
        nodes.positions.set(`grab_bridge`, trigger.newPosition);
        nodes.posMasses.set(`grab_bridge`, 1);
        grabPoint = trigger.newPosition;
        grabConnectionID = `grab_bridge`;
        // Beam sélectionné : si joint ancré connecté ALORS enlever l'ancrage.
        links.forEach((link) => {
          if (link.type === "Coincidence") {
            if (
              link.key1 === `${trigger.id}:start` ||
              link.key1 === `${trigger.id}:end`
            )
              nodes.posMasses.set(link.key2, 1); // TODO : AND "link.key2" should be a join
            if (
              link.key2 === `${trigger.id}:start` ||
              link.key2 === `${trigger.id}:end`
            )
              nodes.posMasses.set(link.key1, 1); // TODO : AND "link.key2" should be a join
          } else if (link.type === "FixedOnSegment") {
            if (
              link.key1 === `${trigger.id}:start` &&
              link.key2 === `${trigger.id}:end`
            ) {
              nodes.posMasses.set(link.key3, 1); // TODO : AND "link.key2" should be a join
            }
          }
        });
        break;
      case "MoveElements":
        preMovePositions = new Map(nodes.positions);
        // move and remove anchor from dragged elements
        trigger.elementIDs.forEach((elementID) => {
          const element = get_mechanical_element_from_id(
            elementID,
            mechanism.mechanicalElements,
          );
          if ("position" in element) {
            nodes.positions.set(
              `${element.id}`,
              nodes.positions.get(`${element.id}`)!.add(trigger.delta),
            );
            nodes.posMasses.set(`${element.id}`, 1);
          } else {
            nodes.positions.set(
              `${element.id}:start`,
              nodes.positions.get(`${element.id}:start`)!.add(trigger.delta),
            );
            nodes.positions.set(
              `${element.id}:end`,
              nodes.positions.get(`${element.id}:end`)!.add(trigger.delta),
            );
          }
        });
        break;
      case "ChangeGearRadius": {
        if (trigger.committed) {
          // Same as a dimensioned radius: anchored at its value, so meshing and pins
          // move the gear rather than the number the user just typed.
          nodes.radii.set(`${trigger.id}`, trigger.newRadius);
          nodes.radMasses.set(`${trigger.id}`, 0);
          break;
        }
        // Grab a point that slides on the gear perimeter and pull it toward
        // the mouse. A `GearMeshing` link against a zero-radius bridge keeps
        // |centre − bridge| = radius (radius stays a DOF), so the solver
        // shares the correction between the radius and the centre position.
        const center = nodes.positions.get(`${trigger.id}`);
        const radius = nodes.radii.get(`${trigger.id}`);
        if (center && radius !== undefined) {
          nodes.positions.set(
            "grab_perimeter",
            gear_grab_handle(center, radius, trigger.target),
          );
          nodes.posMasses.set("grab_perimeter", 1);
          nodes.radii.set("grab_perimeter", 0);
          nodes.radMasses.set("grab_perimeter", 0);
          links.push({
            type: "GearMeshing",
            ddl: 1,
            key1: `${trigger.id}`,
            key2: "grab_perimeter",
            radKey1: `${trigger.id}`,
            radKey2: "grab_perimeter",
          });
          grabPoint = trigger.target;
          grabConnectionID = "grab_perimeter";
        }
        break;
      }
      case "ChangeEdgeLength":
        links.push({
          type: "Distance",
          ddl: 1,
          key1: `${trigger.id}:start`,
          key2: `${trigger.id}:end`,
          distance: trigger.newLength,
        });
        break;
      case "ChangeEdgeAngle":
        links.push({
          type: "KeepOrientation",
          ddl: 1,
          key1: `${trigger.id}:start`,
          key2: `${trigger.id}:end`,
          direction: Point2.from_polar(1, trigger.newAngle),
        });
        break;
      case "ChangeBeltLength": {
        // Momentary inextensible-belt constraint: hold the whole loop at the
        // requested length while the gears relax to satisfy it.
        const belt = get_mechanical_element_from_id(
          trigger.id,
          mechanism.mechanicalElements,
        );
        if (belt && belt.type === "belt") {
          const link = belt_length_link(
            belt,
            elements_by_id(mechanism.mechanicalElements),
            mechanism.mechanicalElements,
            trigger.newLength,
          );
          if (link) links.push(link);
        }
        break;
      }
      // Every other trigger type solves against the mechanism the bundle has
      // already applied, so the value or connection it stated is already part
      // of the graph `get_links_geometric` read above — nothing more to add here.
    }
  }

  // Momentary: pushes apart what this bundle detached, then it is gone.
  // `separation_links` filters on each action's own `disconnect` flag, so
  // calling it unconditionally is safe even when the bundle detaches nothing.
  links.push(
    ...separation_links(bundleActions, mechanism, belt_terminal_axes(mechanism)),
  );

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
  if (trigger && trigger.type === "ChangeGearRadius") {
    // Keep the centre stable only when the radius is free to grow (no mesh and
    // no radius dimension). When meshed or radius-constrained, the centre must
    // stay free so the gear can move to keep tangency / honour the held radius.
    const gearEl = get_mechanical_element_from_id(
      trigger.id,
      mechanism.mechanicalElements,
    );
    const hasMesh =
      "meshedGearsIDs" in gearEl && gearEl.meshedGearsIDs.length > 0;
    const hasRadiusDim = mechanism.constraintElements.some(
      (c) => c.type === "dimension-radius" && c.gearID === trigger.id,
    );
    if (!hasMesh && !hasRadiusDim) {
      nodes.posMasses.set(`${trigger.id}`, 0);
    }
  }
  if (trigger && trigger.type === "MoveNode") {
    const movedEl = mechanism.mechanicalElements.find(
      (e) => e.id === trigger.id,
    );
    if (movedEl) {
      if ("radius" in movedEl) {
        nodes.radMasses.set(`${trigger.id}`, 0);
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

  // A length the user has stated wins over the floor, however short: the two would
  // otherwise pull the same pair of points opposite ways and settle in between,
  // leaving the dimension silently wrong. Matched on the fused keys, so a length
  // dimensioned edge-wise and one dimensioned between its two terminal nodes are
  // recognised as the same statement.
  const dimensioned = new Set(
    links
      .filter((link) => link.type === "Distance")
      .map((link) => key_pair(link.key1, link.key2)),
  );
  if (dimensioned.size > 0)
    links = links.filter(
      (link) =>
        link.type !== "MinDistance" ||
        !dimensioned.has(key_pair(link.key1, link.key2)),
    );

  // A typed value is imposed, not pulled: the node is anchored ON it and the rest of the
  // sketch is what yields — or what reports itself violated, which is the honest answer
  // when the value cannot be held. This has to come AFTER the fusion above, which deletes
  // the key it was asked about and replaces the pair by its midpoint.
  if (pin !== undefined && grabPoint instanceof Point2) {
    const key = nodes.positions.has(pin)
      ? pin
      : ([...nodes.positions.keys()].find((k) =>
          k.split(",").includes(pin),
        ) ?? pin);
    nodes.positions.set(key, grabPoint);
    nodes.posMasses.set(key, 0);
  }

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
  if (trigger && trigger.type === "MoveEdgeBody") {
    const movedEdge = mechanism.mechanicalElements.find(
      (e) => e.id === trigger.id,
    )! as EdgeElement;
    // Si il y a 3 ou plus degré de liberté ALORS contrainte de parallélisme.
    ddl = get_geom_degrees_of_freedom(nodes, links);
    if (ddl >= 3) {
      links.push({
        type: "KeepOrientation",
        ddl: 1,
        key1: `${trigger.id}:start`,
        key2: `${trigger.id}:end`,
        direction: movedEdge.positionEnd.sub(movedEdge.positionStart),
      });
    }
    // Si il y a 3 ou plus degré de liberté ALORS contrainte de longueur.
    ddl = get_geom_degrees_of_freedom(nodes, links);
    if (ddl >= 3) {
      links.push({
        type: "Distance",
        ddl: 1,
        key1: `${trigger.id}:start`,
        key2: `${trigger.id}:end`,
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
    EDITION_SWEEPS,
    undefined,
    undefined,
    false,
    "constraints",
    // The same bound the cursor answers to, handed to the constraints: a radius is
    // written by meshing, by a ratio and by a belt's length as much as by the grab, and
    // those know nothing of what one can see. In screen px through the viewport, so a
    // gear drawn small at high zoom stays a gear one may keep.
    screen2world_length(DIM.MIN_GEAR_RADIUS, mechanism.viewport),
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
      case "dimension-node-to-node":
        const isEdge = constraint.type === "dimension-edge";
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
        // The label rides the gap between edge and node. A node that sat on the
        // edge offers no gap to scale from, so the offset stays as the user left it.
        const oldGap = oldNode.distance2line(oldEdgeStart, oldEdgeEnd);
        if (oldGap > DEGENERATE_LENGTH)
          local.y *= newNode.distance2line(newEdgeStart, newEdgeEnd) / oldGap;
        solvedNodes.positions.set(
          `${constraint.id}`,
          local.from_segment_coordinates(newEdgeStart, newEdgeEnd),
        );
        break;
      case "dimension-angle":
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
