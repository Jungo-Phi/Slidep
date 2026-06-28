import {
  AppMode,
  BeamElement,
  CanvasState,
  ConstraintElement,
  HoveredPart,
  ID,
  MechanicalElement,
  NodeElement,
  PropertiesPanelTab,
  UnionElement,
} from "../../types";
import { get_mechanical_element_from_id } from "../mechanism/connect-actions";

/** All constraint element types (dimensions + geometric badges). */
const CONSTRAINT_TYPES = new Set<ConstraintElement["type"]>([
  "dimension-edge",
  "dimension-node-to-node",
  "dimension-edge-to-node",
  "dimension-angle",
  "dimension-radius",
  "horizontal-align-edge",
  "horizontal-align-nodes",
  "vertical-align-edge",
  "vertical-align-nodes",
  "normal",
  "parallel",
  "equal",
  "gear-ratio",
]);

export function is_constraint_type(type: UnionElement["type"]): boolean {
  return (CONSTRAINT_TYPES as Set<string>).has(type);
}

export function node_on_beam_body(
  node: NodeElement,
  mechanicalElements: MechanicalElement[],
): BeamElement | undefined {
  switch (node.type) {
    case "pivot":
      for (const edgeID of node.rotatingEdgesIDs) {
        const beam = get_mechanical_element_from_id(edgeID, mechanicalElements);
        if (beam.type === "beam" && beam.fixedNodesBodyIDs.includes(node.id))
          return beam;
      }
      break;
    case "slider":
    case "slidep":
      if (node.parentBeamID) {
        const beam = get_mechanical_element_from_id(
          node.parentBeamID,
          mechanicalElements,
        );
        if (beam.type === "beam" && beam.fixedNodesBodyIDs.includes(node.id))
          return beam;
      }
      break;
    case "join":
    case "mass":
      for (const edgeID of node.fixedEdgesIDs) {
        const beam = get_mechanical_element_from_id(edgeID, mechanicalElements);
        if (beam.type === "beam" && beam.fixedNodesBodyIDs.includes(node.id))
          return beam;
      }
      break;
  }
  return undefined;
}

export function element_to_hovered_part(
  element: MechanicalElement | ConstraintElement,
  deleting: boolean = false,
): HoveredPart {
  switch (element.type) {
    case "pivot":
    case "slider":
    case "slidep":
    case "join":
    case "mass":
      return {
        type: "Node",
        position: element.position,
        id: element.id,
        deleting,
        beamBodyHover: true,
      };
    case "gear":
      return {
        type: "GearTooth",
        position: element.position,
        id: element.id,
        deleting,
      };
    case "beam":
    case "spring":
    case "damper":
    case "belt":
      return {
        type: "Edge",
        position: element.positionStart.lerp(element.positionEnd, 0.5),
        id: element.id,
        deleting,
        part: "body",
      };
    case "dimension-edge":
    case "dimension-node-to-node":
    case "dimension-edge-to-node":
    case "dimension-angle":
    case "dimension-radius":
    case "horizontal-align-edge":
    case "horizontal-align-nodes":
    case "vertical-align-edge":
    case "vertical-align-nodes":
    case "normal":
    case "parallel":
    case "equal":
    case "gear-ratio":
      return {
        type: "Constraint",
        position: element.position,
        id: element.id,
        deleting,
      };
  }
}

export function connected_constraints(
  elementID: ID,
  constraints: ConstraintElement[],
): ID[] {
  const connectedConstraintsIDs: ID[] = [];
  constraints.forEach((constraint) => {
    switch (constraint.type) {
      case "dimension-edge":
      case "horizontal-align-edge":
      case "vertical-align-edge":
        if (constraint.edgeID === elementID)
          connectedConstraintsIDs.push(constraint.id);
        break;
      case "dimension-node-to-node":
      case "horizontal-align-nodes":
      case "vertical-align-nodes":
        if (
          constraint.startNodeID === elementID ||
          constraint.endNodeID === elementID
        )
          connectedConstraintsIDs.push(constraint.id);
        break;
      case "dimension-edge-to-node":
        if (constraint.nodeID === elementID || constraint.edgeID === elementID)
          connectedConstraintsIDs.push(constraint.id);
        break;
      case "dimension-angle":
      case "normal":
      case "parallel":
      case "equal":
        if (
          constraint.startEdgeID === elementID ||
          constraint.endEdgeID === elementID
        )
          connectedConstraintsIDs.push(constraint.id);
        break;
      case "dimension-radius":
        if (constraint.gearID === elementID)
          connectedConstraintsIDs.push(constraint.id);
        break;
      case "gear-ratio":
        if (
          constraint.startGearID === elementID ||
          constraint.endGearID === elementID
        )
          connectedConstraintsIDs.push(constraint.id);
        break;
    }
  });
  return connectedConstraintsIDs;
}

/**
 * Computes which constraints should be visible and at which opacity (0–1) given
 * the current context. A constraint absent from the returned map is hidden
 * (neither drawn nor hit-testable). Rules :
 * - Onglet "constraints" : toutes les contraintes, opaques (prioritaire sur le mode).
 * - Sinon en simulation : aucune contrainte.
 * - Sinon (édition, autre onglet) : dimensions toujours opaques ; badges
 *   géométriques uniquement pour les contraintes révélées au survol
 *   (`revealedOpacities`, avec leur opacité de fondu).
 * La contrainte en cours de sélection / déplacement / édition reste opaque.
 */
export function compute_visible_constraints(
  constraints: ConstraintElement[],
  appMode: AppMode,
  activeTab: PropertiesPanelTab,
  revealedOpacities: Map<ID, number>,
  canvasState: CanvasState,
): Map<ID, number> {
  const visible = new Map<ID, number>();

  if (activeTab === "constraints") {
    for (const c of constraints) visible.set(c.id, 1);
    return visible;
  }

  if (appMode !== "edition") return visible;

  for (const c of constraints)
    if (c.type.startsWith("dimension-")) visible.set(c.id, 1);

  // Badges révélés au survol : conserve la plus forte opacité (ne baisse jamais
  // une dimension déjà à 1).
  for (const [id, opacity] of revealedOpacities)
    visible.set(id, Math.max(visible.get(id) ?? 0, opacity));

  if (
    canvasState.type === "SelectedElement" ||
    canvasState.type === "MovingConstraint" ||
    canvasState.type === "EditingConstraint"
  )
    visible.set(canvasState.elementID, 1);

  return visible;
}
