import {
  BeamElement,
  HoveredPart,
  MechanicalElement,
  NodeElement,
  UnionElement,
} from "../../types";
import { get_mechanical_element_from_id } from "./connect-actions";

export function node_on_beam_body(
  node: NodeElement,
  mechanicalElements: MechanicalElement[],
): BeamElement | undefined {
  switch (node.type) {
    case "pivot":
    case "gear":
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
  element: UnionElement,
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
