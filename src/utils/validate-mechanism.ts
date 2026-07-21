import {
  BeamElement,
  GearElement,
  ID,
  MechanicalElement,
  UnionElement,
} from "../types/element";
import { element_ref_fields } from "../types/element-refs";
import { Point2 } from "../types/point2";
import { Mechanism } from "../types/mechanism";
import { legible_id, shown_element_name } from "./string-math";
import {
  belt_is_looped,
  belt_junction_id,
  belt_terminal_pulley_id,
  MIN_PULLEYS_TO_CLOSE,
} from "./belt-rules";

export type ValidationErrorCode =
  | "DUPLICATE_ID"
  | "DUPLICATE_IN_LIST"
  | "SELF_REFERENCE"
  | "MISSING_REFERENCE"
  | "WRONG_TYPE"
  | "MISSING_BIDIRECTIONAL"
  | "SAME_AXLE_MESH"
  | "CONTRADICTORY_MOTOR"
  | "GROUNDED_MASS"
  | "BELT_CLOSURE_MISMATCH"
  | "BELTS_JOINED";

export interface MechanismValidationError {
  code: ValidationErrorCode;
  /** States the defect only: the faulty element is `elementID`, named by the caller. */
  message: string;
  elementID?: ID;
  relatedID?: ID;
}

function has_body_ids(el: MechanicalElement): el is BeamElement {
  return "fixedNodesBodyIDs" in el;
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
    ("rotatingEdgesIDs" in node && node.rotatingEdgesIDs.includes(edgeID)) ||
    ("fixedEdgesIDs" in node && node.fixedEdgesIDs.includes(edgeID)) ||
    ("parentBeamID" in node && node.parentBeamID === edgeID)
  );
}

/**
 * Whether `target` points back at `source`, per reference field.
 *
 * A field absent from this map carries no reciprocity requirement — that is the
 * case for constraint and load references, which are one-way by nature.
 */
const BACK_REFERENCE: Record<
  string,
  (source: MechanicalElement, target: MechanicalElement) => boolean
> = {
  // A node's edge lists also hold gears pinned to its perimeter.
  fixedEdgesIDs: (node, target) =>
    target.type === "gear"
      ? target.fixedNodesBodyIDs.includes(node.id)
      : edge_refs_node(target, node.id),
  rotatingEdgesIDs: (node, target) =>
    target.type === "gear"
      ? target.fixedNodesBodyIDs.includes(node.id)
      : edge_refs_node(target, node.id),
  parentBeamID: (node, beam) =>
    has_body_ids(beam) && beam.fixedNodesBodyIDs.includes(node.id),
  parentAxleID: (gear, axle) =>
    "fixedGearsIDs" in axle && axle.fixedGearsIDs.includes(gear.id),
  fixedGearsIDs: (axle, gear) =>
    gear.type === "gear" && gear.parentAxleID === axle.id,
  meshedGearsIDs: (gear, other) =>
    other.type === "gear" && other.meshedGearsIDs.includes(gear.id),
  attachedBeltID: (gear, belt) =>
    belt.type === "belt" && belt.attachedGearsIDs.some((g) => g.id === gear.id),
  attachedGearsIDs: (belt, gear) =>
    gear.type === "gear" && gear.attachedBeltID === belt.id,
  fixedNodesBodyIDs: (edge, node) => node_refs_edge(node, edge.id),
  fixedNodeStartID: (edge, node) => node_refs_edge(node, edge.id),
  fixedNodeEndID: (edge, node) => node_refs_edge(node, edge.id),
};

/** Constraint fields that must not name the same element twice. */
const CONSTRAINT_ENDPOINT_PAIRS: [string, string][] = [
  ["startNodeID", "endNodeID"],
  ["startEdgeID", "endEdgeID"],
  ["startGearID", "endGearID"],
];

/**
 * Validates a mechanism's internal consistency.
 * Returns null if valid, or an array of errors otherwise.
 *
 * Reference checks — existence, target type, self-reference, duplicates — are
 * driven by `ELEMENT_REFS`, so they cover every element alike: mechanical,
 * constraint and load. The passes that follow encode the rules the table cannot
 * express: reciprocity, duplicate IDs, meshing and motor coherence.
 */
export function validate_mechanism(
  mechanism: Mechanism,
): MechanismValidationError[] | null {
  const errors: MechanismValidationError[] = [];
  const {
    mechanicalElements: mels,
    constraintElements: cels,
    loads,
  } = mechanism;

  const mechByID = new Map<ID, MechanicalElement>(mels.map((e) => [e.id, e]));
  const isMechanical = new Set<UnionElement>(mels);
  const allElements: UnionElement[] = [...mels, ...cels, ...loads];
  const allByID = new Map<ID, UnionElement>(
    allElements.map((e): [ID, UnionElement] => [e.id, e]),
  );

  // Uses shown_element_name when the element exists, legible_id as fallback.
  function name(id: ID): string {
    if (!id) return "<ID manquant>";
    const el = allByID.get(id);
    return el ? shown_element_name(el) : legible_id(id);
  }

  // ── Duplicate IDs ────────────────────────────────────────────────────────────
  const seenIDs = new Set<ID>();
  for (const el of allElements) {
    if (seenIDs.has(el.id)) {
      errors.push({
        code: "DUPLICATE_ID",
        message: `ID dupliqué (type: ${el.type}).`,
        elementID: el.id,
      });
    }
    seenIDs.add(el.id);
  }

  // ── References ───────────────────────────────────────────────────────────────
  for (const el of allElements) {
    for (const { field, ids, spec } of element_ref_fields(el)) {
      if (spec.required && ids.length === 0) {
        errors.push({
          code: "MISSING_REFERENCE",
          message: `(${field}) : référence absente.`,
          elementID: el.id,
        });
        continue;
      }

      const counts = new Map<ID, number>();
      for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
      for (const [id, count] of counts) {
        if (count > 1) {
          errors.push({
            code: "DUPLICATE_IN_LIST",
            message: `(${field}) : "${name(id)}" apparaît ${count} fois.`,
            elementID: el.id,
            relatedID: id,
          });
        }
      }

      for (const refID of ids) {
        if (refID === el.id) {
          errors.push({
            code: "SELF_REFERENCE",
            message: `(${field}) : auto-référence.`,
            elementID: el.id,
          });
          continue;
        }
        const target = mechByID.get(refID);
        if (!target) {
          errors.push({
            code: "MISSING_REFERENCE",
            message: `(${field}) : référence "${legible_id(refID)}" qui n'existe pas.`,
            elementID: el.id,
            relatedID: refID,
          });
          continue;
        }
        if (!spec.target.includes(target.type)) {
          errors.push({
            code: "WRONG_TYPE",
            message: `(${field}) : attendait [${spec.target.join(", ")}], "${name(refID)}" est de type "${target.type}".`,
            elementID: el.id,
            relatedID: refID,
          });
          continue;
        }
        const back_reference = BACK_REFERENCE[field];
        if (
          back_reference &&
          isMechanical.has(el) &&
          !back_reference(el as MechanicalElement, target)
        ) {
          errors.push({
            code: "MISSING_BIDIRECTIONAL",
            message: `(${field} → ${name(refID)}) : connexion non réciproque.`,
            elementID: el.id,
            relatedID: refID,
          });
        }
      }
    }
  }

  // ── Constraint endpoints must name two different elements ────────────────────
  for (const cel of cels) {
    const fields = cel as unknown as Record<string, ID | undefined>;
    for (const [startField, endField] of CONSTRAINT_ENDPOINT_PAIRS) {
      const start = fields[startField];
      const end = fields[endField];
      if (start && end && start === end) {
        errors.push({
          code: "SELF_REFERENCE",
          message: `(${cel.type}) : ${startField} et ${endField} identiques.`,
          elementID: cel.id,
        });
      }
    }
  }

  // ── Meshed gears must not share an axle ──────────────────────────────────────
  for (const el of mels) {
    if (el.type !== "gear") continue;
    for (const otherID of el.meshedGearsIDs) {
      const other = mechByID.get(otherID);
      if (!other || other.type !== "gear") continue;
      // Reported once per pair.
      if (
        el.parentAxleID &&
        el.parentAxleID === other.parentAxleID &&
        el.id < otherID
      ) {
        errors.push({
          code: "SAME_AXLE_MESH",
          message: `partage l'axle ${name(el.parentAxleID)} avec ${name(otherID)} : engrènement impossible.`,
          elementID: el.id,
          relatedID: otherID,
        });
      }
    }
  }

  // ── A mass is never anchored ─────────────────────────────────────────────────
  for (const el of mels) {
    if (el.type === "mass" && el.isGrounded) {
      errors.push({
        code: "GROUNDED_MASS",
        message: `une masse ne peut pas être ancrée au sol.`,
        elementID: el.id,
      });
    }
  }

  // ── A belt is closed exactly when its loop exists ────────────────────────────
  for (const el of mels) {
    if (el.type !== "belt" || el.closed === belt_is_looped(el)) continue;
    const junctionID = belt_junction_id(el);
    errors.push({
      code: "BELT_CLOSURE_MISMATCH",
      message: el.closed
        ? `courroie fermée sans boucle — il faut ${MIN_PULLEYS_TO_CLOSE} poulies et les deux extrémités sur une même jonction.`
        : `courroie ouverte dont les deux extrémités tiennent à ${name(junctionID!)} — elle doit être fermée.`,
      elementID: el.id,
      relatedID: junctionID,
    });
  }

  // ── Two belts never meet ─────────────────────────────────────────────────────
  const beltsByNode = new Map<ID, ID[]>();
  for (const el of mels) {
    if (el.type !== "belt") continue;
    for (const nodeID of [el.fixedNodeStartID, el.fixedNodeEndID]) {
      if (!nodeID) continue;
      const held = beltsByNode.get(nodeID) ?? [];
      // A closed belt holds its junction by both ends: one belt, not two.
      if (!held.includes(el.id)) held.push(el.id);
      beltsByNode.set(nodeID, held);
    }
  }
  for (const [nodeID, beltIDs] of beltsByNode) {
    if (beltIDs.length < 2) continue;
    errors.push({
      code: "BELTS_JOINED",
      message: `tient les extrémités de ${beltIDs.length} courroies différentes (${beltIDs.map(name).join(", ")}) — deux courroies ne se rejoignent jamais.`,
      elementID: nodeID,
      relatedID: beltIDs[0],
    });
  }

  // ── A motor drives from the ground or from a beam, never both ────────────────
  for (const el of mels) {
    if (el.type !== "pivot" || !el.motor) continue;
    const { parentBeamID } = el.motor;
    if (el.isGrounded && parentBeamID !== undefined) {
      errors.push({
        code: "CONTRADICTORY_MOTOR",
        message: `(motor) : le pivot est ancré au sol et a un parentBeamID — ces deux conditions sont mutuellement exclusives.`,
        elementID: el.id,
        relatedID: parentBeamID,
      });
    } else if (!el.isGrounded && parentBeamID === undefined) {
      errors.push({
        code: "MISSING_REFERENCE",
        message: `(motor.parentBeamID) : le pivot n'est pas ancré au sol, donc le moteur doit avoir un parentBeamID.`,
        elementID: el.id,
      });
    }
  }

  return errors.length > 0 ? errors : null;
}

// ─── Geometric constraint violations ─────────────────────────────────────────

export type ConstraintViolationCategory =
  "dimension" | "alignment" | "geometric" | "liaison";

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

  // ── Liaisons: a belt terminal rests ON its pulley's rim, never inside ────────
  // A closed belt has no free terminal: its junction rides the loop, which runs
  // outside every pulley by construction.
  for (const el of mels) {
    if (el.type !== "belt" || el.closed) continue;
    const e = edgePos.get(el.id);
    if (!e) continue;
    const beltName = shown_element_name(el);
    for (const which of ["start", "end"] as const) {
      const gearID = belt_terminal_pulley_id(el, which);
      if (!gearID) continue;
      const center = nodePos.get(gearID);
      const radius = radii.get(gearID);
      if (!center || radius === undefined) continue;
      const err =
        radius - center.distance_to(which === "start" ? e.start : e.end);
      add(
        el.id,
        "liaison",
        `${which === "start" ? "Début" : "Fin"} de ${beltName} dans ${shown_element_name(mechByID.get(gearID))} (Δ ${err.toFixed(2)} px)`,
        err,
        "px",
      );
    }
  }

  return violations.length > 0 ? violations : null;
}
