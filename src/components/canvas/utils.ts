import {
  AppMode,
  BeamElement,
  CanvasState,
  ConstraintElement,
  EdgeElement,
  HoveredPart,
  ID,
  LoadElement,
  MechanicalElement,
  NodeElement,
  Point2,
  PropertiesPanelTab,
  ScreenPoint,
  UnionElement,
  UP,
  ViewportState,
  ZERO,
} from "../../types";
import { get_mechanical_element_from_id } from "../mechanism/connect-actions";
import { DIM } from "../../constants/rendering-specs";
import { world2screen } from "../../utils/viewport";

/**
 * Screen position of an element's probe badge: above its centre, or above the
 * middle of an edge. Drawing and hit-testing both read it here, so the badge is
 * picked exactly where it is drawn.
 *
 * The offset is a screen distance, so the badge keeps its gap to the element at
 * any zoom.
 */
export function probe_badge_position(
  element: MechanicalElement,
  viewport: ViewportState,
): ScreenPoint {
  const anchor =
    "position" in element
      ? element.type === "gear"
        ? element.position.add(UP.mul(element.radius))
        : (element as NodeElement).position
      : (element as EdgeElement).positionStart.lerp(
          (element as EdgeElement).positionEnd,
          0.5,
        );
  const screen = world2screen(anchor, viewport);
  return new Point2(screen.x, screen.y - DIM.PROBE_OFFSET);
}

/** All constraint element types (dimensions + geometric badges). */
const CONSTRAINT_TYPES = new Set<ConstraintElement["type"]>([
  "dimension-edge",
  "dimension-node-to-node",
  "dimension-edge-to-node",
  "dimension-angle",
  "dimension-radius",
  "dimension-belt",
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
  element: MechanicalElement | ConstraintElement | LoadElement,
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
    case "dimension-belt":
    case "gear-ratio":
      return {
        type: "Constraint",
        position: element.position,
        id: element.id,
        deleting,
      };
    // Attached badges have no position of their own — anchored to their host(s)
    // instead (see geometric_badge_positions). Nothing here reads it back.
    case "horizontal-align-edge":
    case "horizontal-align-nodes":
    case "vertical-align-edge":
    case "vertical-align-nodes":
    case "normal":
    case "parallel":
    case "equal":
      return {
        type: "Constraint",
        position: ZERO,
        id: element.id,
        deleting,
      };
    case "force":
      return {
        type: "Force",
        position: ZERO,
        id: element.id,
        part: "body",
        deleting,
      };
    case "moment":
      return {
        type: "DistributedForce",
        position: ZERO,
        id: element.id,
        part: "body",
        deleting,
      };
    case "distributed-force":
      return {
        type: "Moment",
        position: ZERO,
        id: element.id,
        part: "body",
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
      case "dimension-belt":
        if (constraint.beltID === elementID)
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

/** The 7 constraint types with no position of their own — anchored to their host(s). */
const GEOMETRIC_CONSTRAINT_TYPES = new Set<ConstraintElement["type"]>([
  "horizontal-align-edge",
  "horizontal-align-nodes",
  "vertical-align-edge",
  "vertical-align-nodes",
  "normal",
  "parallel",
  "equal",
]);

export function is_geometric_constraint_type(
  type: ConstraintElement["type"],
): boolean {
  return GEOMETRIC_CONSTRAINT_TYPES.has(type);
}

/**
 * Screen positions of the geometric-constraint badges (align/normal/parallel/
 * equal) attached to one host element, one entry per constraint, stacked in a
 * row below it. Drawing and hit-testing both read it here, so a badge is
 * picked exactly where it is drawn.
 *
 * A constraint with two hosts (e.g. `parallel` between two edges) is returned
 * here once per host it is asked about — it is drawn next to each, so hovering
 * either edge reveals it, and there is nothing to place that could collide
 * with an unrelated badge the way a single free-floating position could.
 */
export function geometric_badge_positions(
  hostID: ID,
  mechanicalElements: MechanicalElement[],
  constraintElements: ConstraintElement[],
  viewport: ViewportState,
): { constraintId: ID; position: ScreenPoint }[] {
  const geometricIDs = connected_constraints(hostID, constraintElements).filter(
    (constraintId) => {
      const constraint = constraintElements.find((c) => c.id === constraintId);
      return !!constraint && GEOMETRIC_CONSTRAINT_TYPES.has(constraint.type);
    },
  );
  if (geometricIDs.length === 0) return [];

  const host = get_mechanical_element_from_id(hostID, mechanicalElements);
  const anchor =
    "position" in host
      ? (host as NodeElement).position
      : (host as EdgeElement).positionStart.lerp(
          (host as EdgeElement).positionEnd,
          0.5,
        );
  const screen = world2screen(anchor, viewport);
  const step = DIM.ICON_SIZE + DIM.GEOMETRIC_BADGE_GAP;
  const rowWidth = (geometricIDs.length - 1) * step;
  const rowStart = screen.x - rowWidth / 2;
  const y = screen.y + DIM.GEOMETRIC_BADGE_OFFSET;

  return geometricIDs.map((constraintId, i) => ({
    constraintId,
    position: new Point2(rowStart + i * step, y),
  }));
}

export function linked_constraint(
  element: MechanicalElement,
  constraints: ConstraintElement[],
): ConstraintElement | undefined {
  switch (element.type) {
    case "beam":
    case "spring":
    case "damper":
      return constraints.find(
        (c) => c.type === "dimension-edge" && c.edgeID === element.id,
      );
    case "gear":
      return constraints.find(
        (c) => c.type === "dimension-radius" && c.gearID === element.id,
      );
    case "belt":
      return constraints.find(
        (c) => c.type === "dimension-belt" && c.beltID === element.id,
      );
  }
  return undefined;
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
    if (c.type.startsWith("dimension-") || c.type === "gear-ratio")
      visible.set(c.id, 1);

  // Badges révélés au survol : conserve la plus forte opacité (ne baisse jamais
  // une dimension déjà à 1).
  for (const [id, opacity] of revealedOpacities)
    visible.set(id, Math.max(visible.get(id) ?? 0, opacity));

  if (
    canvasState.type === "SelectedElement" ||
    canvasState.type === "MovingConstraint" ||
    canvasState.type === "EditingValue" ||
    canvasState.type === "PlacingValue"
  )
    visible.set(canvasState.elementID, 1);

  return visible;
}
