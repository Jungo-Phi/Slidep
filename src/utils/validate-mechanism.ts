import {
  BeamElement,
  BeltElement,
  GearElement,
  ID,
  MechanicalElement,
  NodeElement,
  PivotElement,
  UnionElement,
} from "../types/element";
import { Point2 } from "../types/point2";
import { Mechanism } from "../types/mechanism";
import { legible_id, shown_element_name } from "./string-math";

export type ValidationErrorCode =
  | "DUPLICATE_ID"
  | "DUPLICATE_IN_LIST"
  | "SELF_REFERENCE"
  | "MISSING_REFERENCE"
  | "WRONG_TYPE"
  | "MISSING_BIDIRECTIONAL"
  | "SAME_AXLE_MESH"
  | "CONTRADICTORY_MOTOR";

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
 * - Motors are grounded OR have a parentAxle
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
    if (!id) return "<ID manquant>";
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
    if (!refID) {
      errors.push({
        code: "MISSING_REFERENCE",
        message: `${name(sourceID)} (${field}): ID de référence absent.`,
        elementID: sourceID,
      });
      return undefined;
    }
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
    if (!refID) return;
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
        // A gear pinned to this node's perimeter is also stored here.
        if (edge.type === "gear") {
          if (!edge.fixedNodesBodyIDs.includes(el.id)) {
            missing_bidi(
              el.id,
              edgeID,
              `${name(el.id)} (fixedEdgesIDs → ${name(edgeID)}): l'engrenage ne référence pas ce nœud en retour (fixedNodesBodyIDs).`,
            );
          }
          continue;
        }
        if (!EDGE_TYPES.has(edge.type)) {
          wrong_type(
            el.id,
            edgeID,
            "fixedEdgesIDs",
            [...EDGE_TYPES, "gear"],
            edge.type,
          );
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

    // rotatingEdgesIDs (pivot, slidep)
    if ("rotatingEdgesIDs" in el) {
      const node = el as NodeElement & { rotatingEdgesIDs: ID[] };
      no_dupes(el.id, node.rotatingEdgesIDs, "rotatingEdgesIDs");
      for (const edgeID of node.rotatingEdgesIDs) {
        no_self(el.id, edgeID, "rotatingEdgesIDs");
        const edge = ref(el.id, edgeID, "rotatingEdgesIDs");
        if (!edge) continue;
        // A gear pinned to this node's perimeter is also stored here.
        if (edge.type === "gear") {
          if (!edge.fixedNodesBodyIDs.includes(el.id)) {
            missing_bidi(
              el.id,
              edgeID,
              `${name(el.id)} (rotatingEdgesIDs → ${name(edgeID)}): l'engrenage ne référence pas ce nœud en retour (fixedNodesBodyIDs).`,
            );
          }
          continue;
        }
        if (!EDGE_TYPES.has(edge.type)) {
          wrong_type(
            el.id,
            edgeID,
            "rotatingEdgesIDs",
            [...EDGE_TYPES, "gear"],
            edge.type,
          );
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

    // motor (pivot) → XOR : pivot groundé (sans parentBeamID) OU parentBeamID défini (sans isGrounded)
    if (el.type === "pivot") {
      const pivot = el as PivotElement;
      if (pivot.motor !== undefined) {
        const motor = pivot.motor;
        if (pivot.isGrounded && motor.parentBeamID !== undefined) {
          errors.push({
            code: "CONTRADICTORY_MOTOR",
            message: `${name(el.id)} (motor): le pivot est ancré au sol et a un parentBeamID — ces deux conditions sont mutuellement exclusives.`,
            elementID: el.id,
            relatedID: motor.parentBeamID,
          });
        } else if (!pivot.isGrounded && motor.parentBeamID === undefined) {
          errors.push({
            code: "MISSING_REFERENCE",
            message: `${name(el.id)} (motor.parentBeamID): le pivot n'est pas ancré au sol, donc le moteur doit avoir un parentBeamID.`,
            elementID: el.id,
          });
        } else if (motor.parentBeamID !== undefined) {
          no_self(el.id, motor.parentBeamID, "motor.parentBeamID");
          const beam = ref(el.id, motor.parentBeamID, "motor.parentBeamID");
          if (beam && beam.type !== "beam") {
            wrong_type(
              el.id,
              motor.parentBeamID,
              "motor.parentBeamID",
              ["beam"],
              beam.type,
            );
          }
        }
      }
    }

    // parentAxleID (gear) → doit pointer sur un pivot/slidep qui a ce gear dans fixedGearsIDs
    if (el.type === "gear") {
      const gear = el as GearElement;
      no_self(el.id, gear.parentAxleID, "parentAxleID");
      const parent = ref(el.id, gear.parentAxleID, "parentAxleID");
      if (parent) {
        if (parent.type !== "pivot" && parent.type !== "slidep") {
          wrong_type(
            el.id,
            gear.parentAxleID,
            "parentAxleID",
            ["pivot", "slidep"],
            parent.type,
          );
        } else if (
          !("fixedGearsIDs" in parent) ||
          !(parent as { fixedGearsIDs: ID[] }).fixedGearsIDs.includes(el.id)
        ) {
          missing_bidi(
            el.id,
            gear.parentAxleID,
            `${name(el.id)} (parentAxleID → ${name(gear.parentAxleID)}): le nœud parent ne contient pas cet engrenage dans fixedGearsIDs.`,
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
        const otherGear = other as GearElement;
        if (
          gear.parentAxleID &&
          otherGear.parentAxleID &&
          gear.parentAxleID === otherGear.parentAxleID &&
          el.id < gearID
        ) {
          errors.push({
            code: "SAME_AXLE_MESH",
            message: `${name(el.id)} et ${name(gearID)} partagent le même axle (${name(gear.parentAxleID)}) et ne peuvent pas être engrenés.`,
            elementID: el.id,
            relatedID: gearID,
          });
        }
        if (!otherGear.meshedGearsIDs.includes(el.id)) {
          missing_bidi(
            el.id,
            gearID,
            `${name(el.id)} (meshedGearsIDs → ${name(gearID)}): connexion non réciproque.`,
          );
        }
      }
    }

    // fixedGearsIDs (pivot, slidep) → chaque entrée doit être un gear dont parentAxleID pointe sur ce nœud
    if ("fixedGearsIDs" in el) {
      const node = el as { id: ID; fixedGearsIDs: ID[] };
      no_dupes(el.id, node.fixedGearsIDs, "fixedGearsIDs");
      for (const gearID of node.fixedGearsIDs) {
        no_self(el.id, gearID, "fixedGearsIDs");
        const gear = ref(el.id, gearID, "fixedGearsIDs");
        if (!gear) continue;
        if (gear.type !== "gear") {
          wrong_type(el.id, gearID, "fixedGearsIDs", ["gear"], gear.type);
          continue;
        }
        if ((gear as GearElement).parentAxleID !== el.id) {
          missing_bidi(
            el.id,
            gearID,
            `${name(el.id)} (fixedGearsIDs → ${name(gearID)}): l'engrenage ne référence pas ce nœud comme parentAxleID.`,
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

    // fixedNodesBodyIDs (beam/gear)
    if ("fixedNodesBodyIDs" in el) {
      no_dupes(el.id, el.fixedNodesBodyIDs, "fixedNodesBodyIDs");
      for (const nodeID of el.fixedNodesBodyIDs) {
        no_self(el.id, nodeID, "fixedNodesBodyIDs");
        const node = ref(el.id, nodeID, "fixedNodesBodyIDs");
        if (!node) continue;
        if (!is_node(node)) {
          wrong_type(
            el.id,
            nodeID,
            "fixedNodesBodyIDs",
            [...NODE_TYPES],
            node.type,
          );
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
          wrong_type(
            el.id,
            nodeID,
            "fixedNodeStartID",
            [...NODE_TYPES],
            node.type,
          );
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
          wrong_type(
            el.id,
            nodeID,
            "fixedNodeEndID",
            [...NODE_TYPES],
            node.type,
          );
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

// ─── Geometric constraint violations ─────────────────────────────────────────

export type ConstraintViolationCategory =
  | "dimension"
  | "alignment"
  | "geometric"
  | "liaison";

export interface ConstraintViolation {
  elementID: ID;
  category: ConstraintViolationCategory;
  message: string;
  error: number;
  unit: "px" | "°" | "ratio";
}

/**
 * Computes geometric errors for each constraint and mechanical liaison,
 * returning violations where error > threshold.
 *
 * Thresholds: thresholdPx for distances (px), thresholdDeg for angles (°),
 * thresholdRatio for gear-ratio (dimensionless).
 */
export function compute_constraint_violations(
  mechanism: Mechanism,
  thresholdPx = 0.5,
  thresholdDeg = 0.5,
  thresholdRatio = 0.01,
): ConstraintViolation[] | null {
  const { mechanicalElements: mels, constraintElements: cels } = mechanism;

  const mechByID = new Map<ID, MechanicalElement>(mels.map((e) => [e.id, e]));

  const nodePos = new Map<ID, Point2>();
  const edgePos = new Map<ID, { start: Point2; end: Point2 }>();
  const radii = new Map<ID, number>();

  for (const el of mels) {
    if ("position" in el) {
      nodePos.set(el.id, el.position);
      if (el.type === "gear") radii.set(el.id, el.radius);
    } else {
      edgePos.set(el.id, { start: el.positionStart, end: el.positionEnd });
    }
  }

  const violations: ConstraintViolation[] = [];

  function add(
    elementID: ID,
    category: ConstraintViolationCategory,
    message: string,
    error: number,
    unit: "px" | "°" | "ratio",
  ) {
    const thr =
      unit === "px"
        ? thresholdPx
        : unit === "°"
          ? thresholdDeg
          : thresholdRatio;
    if (error > thr)
      violations.push({ elementID, category, message, error, unit });
  }

  // ── Constraint elements ──────────────────────────────────────────────────────
  for (const cel of cels) {
    const n = shown_element_name(cel);
    switch (cel.type) {
      case "dimension-edge": {
        const e = edgePos.get(cel.edgeID);
        if (!e) break;
        const len = e.start.distance_to(e.end);
        const err = Math.abs(len - cel.value);
        add(
          cel.id,
          "dimension",
          `${n}: ${len.toFixed(1)} ≠ ${cel.value} px (Δ ${err.toFixed(2)} px)`,
          err,
          "px",
        );
        break;
      }
      case "dimension-node-to-node": {
        const p1 = nodePos.get(cel.startNodeID);
        const p2 = nodePos.get(cel.endNodeID);
        if (!p1 || !p2) break;
        const dist = p1.distance_to(p2);
        const err = Math.abs(dist - cel.value);
        add(
          cel.id,
          "dimension",
          `${n}: ${dist.toFixed(1)} ≠ ${cel.value} px (Δ ${err.toFixed(2)} px)`,
          err,
          "px",
        );
        break;
      }
      case "dimension-edge-to-node": {
        const e = edgePos.get(cel.edgeID);
        const p = nodePos.get(cel.nodeID);
        if (!e || !p) break;
        const dist = p.distance2line(e.start, e.end);
        const err = Math.abs(dist - cel.value);
        add(
          cel.id,
          "dimension",
          `${n}: ${dist.toFixed(1)} ≠ ${cel.value} px (Δ ${err.toFixed(2)} px)`,
          err,
          "px",
        );
        break;
      }
      case "dimension-angle": {
        const e1 = edgePos.get(cel.startEdgeID);
        const e2 = edgePos.get(cel.endEdgeID);
        if (!e1 || !e2) break;
        let v1 = e1.end.sub(e1.start);
        let v2 = e2.end.sub(e2.start);
        if (cel.flipStart) v1 = v1.mul(-1);
        if (cel.flipEnd) v2 = v2.mul(-1);
        const currentRad = v1.angle_to(v2);
        const targetRad =
          ((cel.value * Math.PI) / 180) * (cel.couterClockwise ? -1 : 1);
        let diff = currentRad - targetRad;
        if (diff > Math.PI) diff -= 2 * Math.PI;
        if (diff < -Math.PI) diff += 2 * Math.PI;
        const errDeg = (Math.abs(diff) * 180) / Math.PI;
        const currentDeg = (currentRad * 180) / Math.PI;
        add(
          cel.id,
          "dimension",
          `${n}: ${currentDeg.toFixed(1)}° ≠ ${cel.value}° (Δ ${errDeg.toFixed(2)}°)`,
          errDeg,
          "°",
        );
        break;
      }
      case "dimension-radius": {
        const r = radii.get(cel.gearID);
        if (r === undefined) break;
        const err = Math.abs(r - cel.value);
        add(
          cel.id,
          "dimension",
          `${n}: ${r.toFixed(1)} ≠ ${cel.value} px (Δ ${err.toFixed(2)} px)`,
          err,
          "px",
        );
        break;
      }
      case "horizontal-align-edge": {
        const e = edgePos.get(cel.edgeID);
        if (!e) break;
        const err = Math.abs(e.start.y - e.end.y);
        add(
          cel.id,
          "alignment",
          `${n}: non horizontal (Δy ${err.toFixed(2)} px)`,
          err,
          "px",
        );
        break;
      }
      case "horizontal-align-nodes": {
        const p1 = nodePos.get(cel.startNodeID);
        const p2 = nodePos.get(cel.endNodeID);
        if (!p1 || !p2) break;
        const err = Math.abs(p1.y - p2.y);
        add(
          cel.id,
          "alignment",
          `${n}: non horizontal (Δy ${err.toFixed(2)} px)`,
          err,
          "px",
        );
        break;
      }
      case "vertical-align-edge": {
        const e = edgePos.get(cel.edgeID);
        if (!e) break;
        const err = Math.abs(e.start.x - e.end.x);
        add(
          cel.id,
          "alignment",
          `${n}: non vertical (Δx ${err.toFixed(2)} px)`,
          err,
          "px",
        );
        break;
      }
      case "vertical-align-nodes": {
        const p1 = nodePos.get(cel.startNodeID);
        const p2 = nodePos.get(cel.endNodeID);
        if (!p1 || !p2) break;
        const err = Math.abs(p1.x - p2.x);
        add(
          cel.id,
          "alignment",
          `${n}: non vertical (Δx ${err.toFixed(2)} px)`,
          err,
          "px",
        );
        break;
      }
      case "normal": {
        const e1 = edgePos.get(cel.startEdgeID);
        const e2 = edgePos.get(cel.endEdgeID);
        if (!e1 || !e2) break;
        const v1 = e1.end.sub(e1.start);
        const v2 = e2.end.sub(e2.start);
        let diff = v2.angle() - (v1.angle() + Math.PI / 2);
        while (diff > Math.PI / 2) diff -= Math.PI;
        while (diff < -Math.PI / 2) diff += Math.PI;
        const errDeg = (Math.abs(diff) * 180) / Math.PI;
        add(
          cel.id,
          "geometric",
          `${n}: non perpendiculaire (Δ ${errDeg.toFixed(2)}°)`,
          errDeg,
          "°",
        );
        break;
      }
      case "parallel": {
        const e1 = edgePos.get(cel.startEdgeID);
        const e2 = edgePos.get(cel.endEdgeID);
        if (!e1 || !e2) break;
        const v1 = e1.end.sub(e1.start);
        const v2 = e2.end.sub(e2.start);
        let diff = v2.angle() - v1.angle();
        while (diff > Math.PI / 2) diff -= Math.PI;
        while (diff < -Math.PI / 2) diff += Math.PI;
        const errDeg = (Math.abs(diff) * 180) / Math.PI;
        add(
          cel.id,
          "geometric",
          `${n}: non parallèle (Δ ${errDeg.toFixed(2)}°)`,
          errDeg,
          "°",
        );
        break;
      }
      case "equal": {
        const e1 = edgePos.get(cel.startEdgeID);
        const e2 = edgePos.get(cel.endEdgeID);
        if (!e1 || !e2) break;
        const len1 = e1.start.distance_to(e1.end);
        const len2 = e2.start.distance_to(e2.end);
        const err = Math.abs(len1 - len2);
        add(
          cel.id,
          "geometric",
          `${n}: longueurs inégales ${len1.toFixed(1)} vs ${len2.toFixed(1)} px (Δ ${err.toFixed(2)} px)`,
          err,
          "px",
        );
        break;
      }
      case "gear-ratio": {
        const r1 = radii.get(cel.startGearID);
        const r2 = radii.get(cel.endGearID);
        if (r1 === undefined || r2 === undefined || r2 === 0) break;
        const current = r1 / r2;
        const err = Math.abs(current - cel.value);
        add(
          cel.id,
          "geometric",
          `${n}: rapport ${current.toFixed(3)} ≠ ${cel.value} (Δ ${err.toFixed(4)})`,
          err,
          "ratio",
        );
        break;
      }
    }
  }

  // ── Liaisons: OnSegment — body nodes on beam ─────────────────────────────────
  for (const el of mels) {
    if (el.type !== "beam") continue;
    const e = edgePos.get(el.id);
    if (!e) continue;
    const beamName = shown_element_name(el);
    for (const nodeID of (el as BeamElement).fixedNodesBodyIDs) {
      const p = nodePos.get(nodeID);
      if (!p) continue;
      const err = p.distance2segment(e.start, e.end);
      const nodeName = shown_element_name(mechByID.get(nodeID));
      add(
        el.id,
        "liaison",
        `${nodeName} hors de ${beamName} (Δ ${err.toFixed(2)} px)`,
        err,
        "px",
      );
    }
  }

  // ── Liaisons: Coincidence — node at edge endpoint ────────────────────────────
  for (const el of mels) {
    if (!("positionStart" in el)) continue;
    const e = edgePos.get(el.id);
    if (!e) continue;
    const edgeName = shown_element_name(el);
    if (el.fixedNodeStartID) {
      const p = nodePos.get(el.fixedNodeStartID);
      if (p) {
        const err = p.distance_to(e.start);
        const nodeName = shown_element_name(mechByID.get(el.fixedNodeStartID));
        add(
          el.id,
          "liaison",
          `${nodeName} ↔ début de ${edgeName} (Δ ${err.toFixed(2)} px)`,
          err,
          "px",
        );
      }
    }
    if (el.fixedNodeEndID) {
      const p = nodePos.get(el.fixedNodeEndID);
      if (p) {
        const err = p.distance_to(e.end);
        const nodeName = shown_element_name(mechByID.get(el.fixedNodeEndID));
        add(
          el.id,
          "liaison",
          `${nodeName} ↔ fin de ${edgeName} (Δ ${err.toFixed(2)} px)`,
          err,
          "px",
        );
      }
    }
  }

  // ── Liaisons: GearMeshing — meshed gears must be tangent (dist = r1 + r2) ────
  const seenMeshPairs = new Set<string>();
  for (const el of mels) {
    if (el.type !== "gear") continue;
    const p1 = nodePos.get(el.id);
    const r1 = radii.get(el.id);
    if (!p1 || r1 === undefined) continue;
    const gear1Name = shown_element_name(el);
    for (const meshedID of (el as GearElement).meshedGearsIDs) {
      const pairKey = [el.id, meshedID].sort().join("|");
      if (seenMeshPairs.has(pairKey)) continue;
      seenMeshPairs.add(pairKey);
      const p2 = nodePos.get(meshedID);
      const r2 = radii.get(meshedID);
      if (!p2 || r2 === undefined) continue;
      const dist = p1.distance_to(p2);
      const target = r1 + r2;
      const err = Math.abs(dist - target);
      const gear2Name = shown_element_name(mechByID.get(meshedID));
      add(
        el.id,
        "liaison",
        `Tangence ${gear1Name}↔${gear2Name}: ${dist.toFixed(1)} ≠ ${target.toFixed(1)} px (Δ ${err.toFixed(2)} px)`,
        err,
        "px",
      );
    }
  }

  // ── Liaisons: Coincidence — gear position must equal its axle (pivot/slidep) ─
  for (const el of mels) {
    if (el.type !== "pivot" && el.type !== "slidep") continue;
    const axlePos = nodePos.get(el.id);
    if (!axlePos) continue;
    const axleName = shown_element_name(el);
    for (const gearID of (el as { fixedGearsIDs: ID[] }).fixedGearsIDs) {
      const gearPos = nodePos.get(gearID);
      if (!gearPos) continue;
      const err = axlePos.distance_to(gearPos);
      const gearName = shown_element_name(mechByID.get(gearID));
      add(
        el.id,
        "liaison",
        `${gearName} désaligné de son axe ${axleName} (Δ ${err.toFixed(2)} px)`,
        err,
        "px",
      );
    }
  }

  return violations.length > 0 ? violations : null;
}
