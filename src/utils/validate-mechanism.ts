import {
  BeamElement,
  BeltElement,
  GearElement,
  ID,
  MechanicalElement,
  NodeElement,
  UnionElement,
} from "../types/element";
import { Mechanism } from "../types/mechanism";
import { legible_id, shown_element_name } from "./string-math";

export type ValidationErrorCode =
  | "DUPLICATE_ID"
  | "DUPLICATE_IN_LIST"
  | "SELF_REFERENCE"
  | "MISSING_REFERENCE"
  | "WRONG_TYPE"
  | "MISSING_BIDIRECTIONAL";

export interface MechanismValidationError {
  code: ValidationErrorCode;
  message: string;
  elementID?: ID;
  relatedID?: ID;
}

const NODE_TYPES = new Set([
  "pivot",
  "slider",
  "slidep",
  "join",
  "mass",
  "gear",
]);
const EDGE_TYPES = new Set(["beam", "spring", "damper", "belt"]);

function is_node(el: MechanicalElement): el is NodeElement {
  return NODE_TYPES.has(el.type);
}

function has_body_ids(el: MechanicalElement): el is BeamElement {
  return "fixedNodesBodyIDs" in el;
}

/**
 * Validates a mechanism's internal consistency.
 * Returns null if valid, or an array of errors otherwise.
 *
 * Checks:
 * - No duplicate IDs (across all elements)
 * - No duplicates within connection lists
 * - No self-references
 * - All referenced IDs exist and are of the correct element type
 * - All connections are bidirectional
 * - All constraint references point to existing elements of the right type
 */
export function validate_mechanism(
  mechanism: Mechanism,
): MechanismValidationError[] | null {
  const errors: MechanismValidationError[] = [];
  const { mechanicalElements: mels, constraintElements: cels } = mechanism;

  const mechByID = new Map<ID, MechanicalElement>(mels.map((e) => [e.id, e]));
  const allByID = new Map<ID, UnionElement>([
    ...mels.map((e): [ID, UnionElement] => [e.id, e]),
    ...cels.map((e): [ID, UnionElement] => [e.id, e]),
  ]);

  // Uses shown_element_name when the element exists, legible_id as fallback.
  function name(id: ID): string {
    const el = allByID.get(id);
    return el ? shown_element_name(el) : legible_id(id);
  }

  // ── 1. Duplicate IDs ─────────────────────────────────────────────────────────
  const seenIDs = new Set<ID>();
  for (const el of [...mels, ...cels]) {
    if (seenIDs.has(el.id)) {
      errors.push({
        code: "DUPLICATE_ID",
        message: `ID dupliqué sur "${shown_element_name(el)}" (type: ${el.type}).`,
        elementID: el.id,
      });
    }
    seenIDs.add(el.id);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function ref(
    sourceID: ID,
    refID: ID,
    field: string,
  ): MechanicalElement | undefined {
    const el = mechByID.get(refID);
    if (!el) {
      errors.push({
        code: "MISSING_REFERENCE",
        message: `${name(sourceID)} (${field}): référence "${legible_id(refID)}" qui n'existe pas.`,
        elementID: sourceID,
        relatedID: refID,
      });
    }
    return el;
  }

  function wrong_type(
    sourceID: ID,
    refID: ID,
    field: string,
    expected: string[],
    got: string,
  ) {
    errors.push({
      code: "WRONG_TYPE",
      message: `${name(sourceID)} (${field}): attendait [${expected.join(", ")}], "${name(refID)}" est de type "${got}".`,
      elementID: sourceID,
      relatedID: refID,
    });
  }

  function no_self(sourceID: ID, refID: ID, field: string) {
    if (refID === sourceID) {
      errors.push({
        code: "SELF_REFERENCE",
        message: `${name(sourceID)} (${field}): auto-référence.`,
        elementID: sourceID,
      });
    }
  }

  function no_dupes(sourceID: ID, list: ID[], field: string) {
    const counts = new Map<ID, number>();
    for (const id of list) counts.set(id, (counts.get(id) ?? 0) + 1);
    for (const [id, count] of counts) {
      if (count > 1) {
        errors.push({
          code: "DUPLICATE_IN_LIST",
          message: `${name(sourceID)} (${field}): "${name(id)}" apparaît ${count} fois.`,
          elementID: sourceID,
          relatedID: id,
        });
      }
    }
  }

  function missing_bidi(sourceID: ID, relatedID: ID, description: string) {
    errors.push({
      code: "MISSING_BIDIRECTIONAL",
      message: description,
      elementID: sourceID,
      relatedID: relatedID,
    });
  }

  // Edge back-references a node if the node appears at start, end, or body.
  function edge_refs_node(edge: MechanicalElement, nodeID: ID): boolean {
    return (
      ("fixedNodeStartID" in edge && edge.fixedNodeStartID === nodeID) ||
      ("fixedNodeEndID" in edge && edge.fixedNodeEndID === nodeID) ||
      (has_body_ids(edge) && edge.fixedNodesBodyIDs.includes(nodeID))
    );
  }

  // Node back-references an edge if the edge appears in any of its edge lists.
  function node_refs_edge(node: MechanicalElement, edgeID: ID): boolean {
    return (
      ("rotatingEdgesIDs" in node &&
        (
          node as NodeElement & { rotatingEdgesIDs: ID[] }
        ).rotatingEdgesIDs.includes(edgeID)) ||
      ("fixedEdgesIDs" in node &&
        (node as NodeElement & { fixedEdgesIDs: ID[] }).fixedEdgesIDs.includes(
          edgeID,
        )) ||
      ("parentBeamID" in node &&
        (node as { parentBeamID?: ID }).parentBeamID === edgeID)
    );
  }

  // ── 2. Mechanical element connections ────────────────────────────────────────
  for (const el of mels) {
    // fixedEdgesIDs (slider, join, mass, gear)
    if ("fixedEdgesIDs" in el) {
      const node = el as NodeElement & { fixedEdgesIDs: ID[] };
      no_dupes(el.id, node.fixedEdgesIDs, "fixedEdgesIDs");
      for (const edgeID of node.fixedEdgesIDs) {
        no_self(el.id, edgeID, "fixedEdgesIDs");
        const edge = ref(el.id, edgeID, "fixedEdgesIDs");
        if (!edge) continue;
        if (!EDGE_TYPES.has(edge.type)) {
          wrong_type(el.id, edgeID, "fixedEdgesIDs", [...EDGE_TYPES], edge.type);
          continue;
        }
        if (!edge_refs_node(edge, el.id)) {
          missing_bidi(
            el.id,
            edgeID,
            `${name(el.id)} (fixedEdgesIDs → ${name(edgeID)}): la liaison ne référence pas ce nœud en retour.`,
          );
        }
      }
    }

    // rotatingEdgesIDs (pivot, slidep, gear)
    if ("rotatingEdgesIDs" in el) {
      const node = el as NodeElement & { rotatingEdgesIDs: ID[] };
      no_dupes(el.id, node.rotatingEdgesIDs, "rotatingEdgesIDs");
      for (const edgeID of node.rotatingEdgesIDs) {
        no_self(el.id, edgeID, "rotatingEdgesIDs");
        const edge = ref(el.id, edgeID, "rotatingEdgesIDs");
        if (!edge) continue;
        if (!EDGE_TYPES.has(edge.type)) {
          wrong_type(el.id, edgeID, "rotatingEdgesIDs", [...EDGE_TYPES], edge.type);
          continue;
        }
        if (!edge_refs_node(edge, el.id)) {
          missing_bidi(
            el.id,
            edgeID,
            `${name(el.id)} (rotatingEdgesIDs → ${name(edgeID)}): la liaison ne référence pas ce nœud en retour.`,
          );
        }
      }
    }

    // parentBeamID (slider, slidep)
    if ("parentBeamID" in el && el.parentBeamID) {
      const beamID = el.parentBeamID;
      no_self(el.id, beamID, "parentBeamID");
      const beam = ref(el.id, beamID, "parentBeamID");
      if (beam) {
        if (beam.type !== "beam") {
          wrong_type(el.id, beamID, "parentBeamID", ["beam"], beam.type);
        } else if (!(beam as BeamElement).fixedNodesBodyIDs.includes(el.id)) {
          missing_bidi(
            el.id,
            beamID,
            `${name(el.id)} (parentBeamID → ${name(beamID)}): le beam ne contient pas ce nœud dans fixedNodesBodyIDs.`,
          );
        }
      }
    }

    // meshedGearsIDs (gear)
    if ("meshedGearsIDs" in el) {
      const gear = el as GearElement;
      no_dupes(el.id, gear.meshedGearsIDs, "meshedGearsIDs");
      for (const gearID of gear.meshedGearsIDs) {
        no_self(el.id, gearID, "meshedGearsIDs");
        const other = ref(el.id, gearID, "meshedGearsIDs");
        if (!other) continue;
        if (other.type !== "gear") {
          wrong_type(el.id, gearID, "meshedGearsIDs", ["gear"], other.type);
          continue;
        }
        if (!(other as GearElement).meshedGearsIDs.includes(el.id)) {
          missing_bidi(
            el.id,
            gearID,
            `${name(el.id)} (meshedGearsIDs → ${name(gearID)}): connexion non réciproque.`,
          );
        }
      }
    }

    // fixedGearsIDs (gear)
    if ("fixedGearsIDs" in el) {
      const gear = el as GearElement;
      no_dupes(el.id, gear.fixedGearsIDs, "fixedGearsIDs");
      for (const gearID of gear.fixedGearsIDs) {
        no_self(el.id, gearID, "fixedGearsIDs");
        const other = ref(el.id, gearID, "fixedGearsIDs");
        if (!other) continue;
        if (other.type !== "gear") {
          wrong_type(el.id, gearID, "fixedGearsIDs", ["gear"], other.type);
          continue;
        }
        if (!(other as GearElement).fixedGearsIDs.includes(el.id)) {
          missing_bidi(
            el.id,
            gearID,
            `${name(el.id)} (fixedGearsIDs → ${name(gearID)}): connexion non réciproque.`,
          );
        }
      }
    }

    // attachedBeltID (gear)
    if ("attachedBeltID" in el && el.attachedBeltID) {
      const beltID = el.attachedBeltID;
      no_self(el.id, beltID, "attachedBeltID");
      const belt = ref(el.id, beltID, "attachedBeltID");
      if (belt) {
        if (belt.type !== "belt") {
          wrong_type(el.id, beltID, "attachedBeltID", ["belt"], belt.type);
        } else if (
          !(belt as BeltElement).attachedGearsIDs.some((g) => g.id === el.id)
        ) {
          missing_bidi(
            el.id,
            beltID,
            `${name(el.id)} (attachedBeltID → ${name(beltID)}): la courroie ne référence pas cet engrenage dans attachedGearsIDs.`,
          );
        }
      }
    }

    // fixedNodesBodyIDs (beam)
    if ("fixedNodesBodyIDs" in el) {
      const beam = el as BeamElement;
      no_dupes(el.id, beam.fixedNodesBodyIDs, "fixedNodesBodyIDs");
      for (const nodeID of beam.fixedNodesBodyIDs) {
        no_self(el.id, nodeID, "fixedNodesBodyIDs");
        const node = ref(el.id, nodeID, "fixedNodesBodyIDs");
        if (!node) continue;
        if (!is_node(node)) {
          wrong_type(el.id, nodeID, "fixedNodesBodyIDs", [...NODE_TYPES], node.type);
          continue;
        }
        if (!node_refs_edge(node, el.id)) {
          missing_bidi(
            el.id,
            nodeID,
            `${name(el.id)} (fixedNodesBodyIDs → ${name(nodeID)}): le nœud ne référence pas ce beam (parentBeamID, fixedEdgesIDs ou rotatingEdgesIDs).`,
          );
        }
      }
    }

    // attachedGearsIDs (belt)
    if ("attachedGearsIDs" in el) {
      const belt = el as BeltElement;
      const gearIDs = belt.attachedGearsIDs.map((g) => g.id);
      no_dupes(el.id, gearIDs, "attachedGearsIDs");
      for (const { id: gearID } of belt.attachedGearsIDs) {
        no_self(el.id, gearID, "attachedGearsIDs");
        const gear = ref(el.id, gearID, "attachedGearsIDs");
        if (!gear) continue;
        if (gear.type !== "gear") {
          wrong_type(el.id, gearID, "attachedGearsIDs", ["gear"], gear.type);
          continue;
        }
        if ((gear as GearElement).attachedBeltID !== el.id) {
          missing_bidi(
            el.id,
            gearID,
            `${name(el.id)} (attachedGearsIDs → ${name(gearID)}): l'engrenage ne référence pas cette courroie (attachedBeltID).`,
          );
        }
      }
    }

    // fixedNodeStartID (all edges)
    if ("fixedNodeStartID" in el && el.fixedNodeStartID) {
      const nodeID = el.fixedNodeStartID;
      no_self(el.id, nodeID, "fixedNodeStartID");
      const node = ref(el.id, nodeID, "fixedNodeStartID");
      if (node) {
        if (!is_node(node)) {
          wrong_type(el.id, nodeID, "fixedNodeStartID", [...NODE_TYPES], node.type);
        } else if (!node_refs_edge(node, el.id)) {
          missing_bidi(
            el.id,
            nodeID,
            `${name(el.id)} (fixedNodeStartID → ${name(nodeID)}): le nœud ne référence pas cette liaison.`,
          );
        }
      }
    }

    // fixedNodeEndID (all edges)
    if ("fixedNodeEndID" in el && el.fixedNodeEndID) {
      const nodeID = el.fixedNodeEndID;
      no_self(el.id, nodeID, "fixedNodeEndID");
      const node = ref(el.id, nodeID, "fixedNodeEndID");
      if (node) {
        if (!is_node(node)) {
          wrong_type(el.id, nodeID, "fixedNodeEndID", [...NODE_TYPES], node.type);
        } else if (!node_refs_edge(node, el.id)) {
          missing_bidi(
            el.id,
            nodeID,
            `${name(el.id)} (fixedNodeEndID → ${name(nodeID)}): le nœud ne référence pas cette liaison.`,
          );
        }
      }
    }
  }

  // ── 3. Constraint element references ─────────────────────────────────────────
  function assert_ref(
    sourceID: ID,
    refID: ID,
    field: string,
    expectedTypes: string[],
  ) {
    const el = ref(sourceID, refID, field);
    if (el && !expectedTypes.includes(el.type)) {
      wrong_type(sourceID, refID, field, expectedTypes, el.type);
    }
  }

  const NODE_TYPE_LIST = [...NODE_TYPES];
  const EDGE_TYPE_LIST = [...EDGE_TYPES];

  for (const cel of cels) {
    switch (cel.type) {
      case "dimension-edge":
        assert_ref(cel.id, cel.edgeID, "edgeID", EDGE_TYPE_LIST);
        break;
      case "dimension-node-to-node":
        assert_ref(cel.id, cel.startNodeID, "startNodeID", NODE_TYPE_LIST);
        assert_ref(cel.id, cel.endNodeID, "endNodeID", NODE_TYPE_LIST);
        if (cel.startNodeID === cel.endNodeID)
          errors.push({
            code: "SELF_REFERENCE",
            message: `${name(cel.id)} (dimension-node-to-node): startNodeID et endNodeID identiques.`,
            elementID: cel.id,
          });
        break;
      case "dimension-edge-to-node":
        assert_ref(cel.id, cel.edgeID, "edgeID", EDGE_TYPE_LIST);
        assert_ref(cel.id, cel.nodeID, "nodeID", NODE_TYPE_LIST);
        break;
      case "dimension-angle":
        assert_ref(cel.id, cel.startEdgeID, "startEdgeID", EDGE_TYPE_LIST);
        assert_ref(cel.id, cel.endEdgeID, "endEdgeID", EDGE_TYPE_LIST);
        if (cel.startEdgeID === cel.endEdgeID)
          errors.push({
            code: "SELF_REFERENCE",
            message: `${name(cel.id)} (dimension-angle): startEdgeID et endEdgeID identiques.`,
            elementID: cel.id,
          });
        break;
      case "dimension-radius":
        assert_ref(cel.id, cel.gearID, "gearID", ["gear"]);
        break;
      case "horizontal-align-edge":
      case "vertical-align-edge":
        assert_ref(cel.id, cel.edgeID, "edgeID", EDGE_TYPE_LIST);
        break;
      case "horizontal-align-nodes":
      case "vertical-align-nodes":
        assert_ref(cel.id, cel.startNodeID, "startNodeID", NODE_TYPE_LIST);
        assert_ref(cel.id, cel.endNodeID, "endNodeID", NODE_TYPE_LIST);
        if (cel.startNodeID === cel.endNodeID)
          errors.push({
            code: "SELF_REFERENCE",
            message: `${name(cel.id)} (${cel.type}): startNodeID et endNodeID identiques.`,
            elementID: cel.id,
          });
        break;
      case "normal":
      case "parallel":
      case "equal":
        assert_ref(cel.id, cel.startEdgeID, "startEdgeID", EDGE_TYPE_LIST);
        assert_ref(cel.id, cel.endEdgeID, "endEdgeID", EDGE_TYPE_LIST);
        if (cel.startEdgeID === cel.endEdgeID)
          errors.push({
            code: "SELF_REFERENCE",
            message: `${name(cel.id)} (${cel.type}): startEdgeID et endEdgeID identiques.`,
            elementID: cel.id,
          });
        break;
      case "gear-ratio":
        assert_ref(cel.id, cel.startGearID, "startGearID", ["gear"]);
        assert_ref(cel.id, cel.endGearID, "endGearID", ["gear"]);
        if (cel.startGearID === cel.endGearID)
          errors.push({
            code: "SELF_REFERENCE",
            message: `${name(cel.id)} (gear-ratio): startGearID et endGearID identiques.`,
            elementID: cel.id,
          });
        break;
    }
  }

  return errors.length > 0 ? errors : null;
}
