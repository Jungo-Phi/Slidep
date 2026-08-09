/**
 * Makes every reference of a mechanism resolve, so the strict getters are safe.
 *
 * Runs on the way in — never on the way out. A mechanism that turns incoherent
 * while the app holds it is a bug the guards must surface, not something to
 * launder on save.
 *
 * Scope is deliberately narrow: references that point at nothing or at the
 * wrong kind of element, and coordinates that are not finite numbers. Those are
 * what make a getter throw or a drawing call crash. Non-reciprocal connections,
 * duplicate IDs and domain contradictions are left to the validator, because
 * repairing them means guessing which side told the truth.
 */

import { ID, MechanicalElement, UnionElement } from "../types/element";
import { AnyRefSpec, element_ref_fields } from "../types/element-refs";
import { Mechanism, ViewportState } from "../types/mechanism";
import { Point2 } from "../types/point2";
import { legible_id, shown_element_name } from "./string-math";

export type RepairCode =
  /** A dead ID was dropped from a list. */
  | "REFERENCE_DROPPED"
  /** A reference field was cleared, or fell back to its neutral value. */
  | "REFERENCE_CLEARED"
  /** An element was removed: a reference it cannot do without was dead. */
  | "ELEMENT_REMOVED"
  /** A point whose coordinates were not finite went back to the origin. */
  | "POINT_RESET"
  /** The pan or the scale was unusable, so the framing went back to default. */
  | "VIEWPORT_RESET";

export interface Repair {
  code: RepairCode;
  message: string;
  /** Absent when the repair is about the document rather than one of its elements. */
  elementID?: ID;
  relatedID?: ID;
}

/**
 * Guards the fixed-point loop. Each round removes at least one element, so the
 * element count already bounds it; this only keeps a logic error from spinning.
 */
const MAX_ROUNDS = 100;

/**
 * The mechanism with every dangling and wrongly-typed reference removed, and
 * the list of what that cost. A healthy mechanism comes back as the very same
 * object, so callers can memoize on identity.
 *
 * `history` and `future` are dropped as soon as anything is repaired: undo
 * entries carry whole elements, and replaying one would put back what was just
 * taken out.
 */
export function repair_mechanism(mechanism: Mechanism): {
  mechanism: Mechanism;
  repairs: Repair[];
} {
  const repairs: Repair[] = [];
  let current = mechanism;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const byID = new Map<ID, MechanicalElement>(
      current.mechanicalElements.map((el) => [el.id, el]),
    );

    // A reference is dead when nothing answers to it, or when what answers is
    // not a kind this field accepts. Only mechanical elements are ever targets.
    const is_dead = (spec: AnyRefSpec) => (id: ID) => {
      const target = byID.get(id);
      return !target || !spec.target.includes(target.type);
    };

    const name = (id: ID) => {
      const el = byID.get(id);
      return el ? shown_element_name(el) : legible_id(id);
    };

    /**
     * The element with every non-finite point sent back to the origin.
     *
     * Only the element's own top-level fields are looked at, which is the same
     * reach `revive_points` has when it rebuilds them on load.
     */
    const repair_points = <T extends UnionElement>(element: T): T => {
      let repaired = element;

      for (const [field, value] of Object.entries(element)) {
        if (!(value instanceof Point2)) continue;
        if (Number.isFinite(value.x) && Number.isFinite(value.y)) continue;

        repairs.push({
          code: "POINT_RESET",
          message: `${shown_element_name(element)} (${field}) : coordonnées invalides, ramenées à l'origine.`,
          elementID: element.id,
        });
        repaired = { ...repaired, [field]: new Point2(0, 0) };
      }

      return repaired;
    };

    /** The repaired element, or null when it cannot survive its dead reference. */
    const repair_element = <T extends UnionElement>(element: T): T | null => {
      let repaired = repair_points(element);

      for (const { field, ids, spec } of element_ref_fields(element)) {
        // An absent mandatory reference is as fatal to a getter as a dead one.
        if (spec.required && ids.length === 0) {
          repairs.push({
            code: "ELEMENT_REMOVED",
            message: `${shown_element_name(element)} supprimé : son ${field} est absent.`,
            elementID: element.id,
          });
          return null;
        }

        const dead = is_dead(spec);
        const deadIDs = ids.filter(dead);
        if (deadIDs.length === 0) continue;

        if (deadIDs.length === ids.length && spec.required) {
          repairs.push({
            code: "ELEMENT_REMOVED",
            message: `${shown_element_name(element)} supprimé : son ${field} désigne "${legible_id(deadIDs[0])}", qui n'existe pas.`,
            elementID: element.id,
            relatedID: deadIDs[0],
          });
          return null;
        }

        const isList = Array.isArray(
          (repaired as unknown as Record<string, unknown>)[field],
        );
        for (const deadID of deadIDs) {
          repairs.push({
            code: isList ? "REFERENCE_DROPPED" : "REFERENCE_CLEARED",
            message: `${shown_element_name(element)} (${field}) : référence "${name(deadID)}" retirée.`,
            elementID: element.id,
            relatedID: deadID,
          });
        }

        repaired = prune_field(repaired, field, spec, dead);
      }

      return repaired;
    };

    let changed = false;
    let removedMechanical = 0;

    const repair_all = <T extends UnionElement>(
      list: T[],
      onRemoved?: () => void,
    ): T[] => {
      const kept: T[] = [];
      for (const element of list) {
        const repaired = repair_element(element);
        if (repaired === null) {
          changed = true;
          onRemoved?.();
          continue;
        }
        if (repaired !== element) changed = true;
        kept.push(repaired);
      }
      return kept;
    };

    const mechanicalElements = repair_all(
      current.mechanicalElements,
      () => removedMechanical++,
    );
    const constraintElements = repair_all(current.constraintElements);
    const loads = repair_all(current.loads);

    if (!changed) break;
    current = { ...current, mechanicalElements, constraintElements, loads };

    // Only removing an element can strand the references that named it; pruning
    // a field cannot. Constraints and loads are named by nobody.
    if (removedMechanical === 0) break;

    if (round === MAX_ROUNDS - 1)
      console.error("repair_mechanism : nettoyage non convergent.", repairs);
  }

  const viewport = repair_viewport(current.viewport, repairs);
  if (repairs.length === 0) return { mechanism, repairs };

  // The history is worth keeping when only the framing was wrong: undo entries
  // carry elements, and none of them can put back a broken viewport.
  const framingOnly = repairs.every((r) => r.code === "VIEWPORT_RESET");
  return {
    mechanism: framingOnly
      ? { ...current, viewport }
      : { ...current, viewport, history: [], future: [] },
    repairs,
  };
}

/** The viewport, back to its default framing when either half of it is unusable. */
function repair_viewport(
  viewport: ViewportState,
  repairs: Repair[],
): ViewportState {
  const usable =
    Number.isFinite(viewport.pan.x) &&
    Number.isFinite(viewport.pan.y) &&
    Number.isFinite(viewport.scale) &&
    viewport.scale > 0;
  if (usable) return viewport;

  repairs.push({
    code: "VIEWPORT_RESET",
    message: "Cadrage invalide, revenu à la vue par défaut.",
  });
  return { scale: 1, pan: new Point2<"screen">(0, 0) };
}

/** Applies the field's own repair when it declares one, else drops the dead IDs generically. */
function prune_field<T extends UnionElement>(
  element: T,
  field: string,
  spec: AnyRefSpec,
  dead: (id: ID) => boolean,
): T {
  if (spec.prune)
    return (spec.prune as (el: T, dead: (id: ID) => boolean) => T)(
      element,
      dead,
    );

  const value = (element as unknown as Record<string, unknown>)[field];
  const pruned = Array.isArray(value)
    ? (value as ID[]).filter((id) => !dead(id))
    : undefined;
  return { ...element, [field]: pruned };
}
