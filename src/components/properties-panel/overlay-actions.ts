import { Action, MechanicalElement, OverlayKind } from "../../types";
import { available_overlays, overlay_shown } from "../../utils/element-queries";
import { PluralKey } from "../../i18n";

/** Human label of each overlay layer, singular or plural depending on how many
 * elements it's said of — see `tn` (the "Afficher" menu says it of several elements at once, a single element's own panel switch says it of just itself). */
export const OVERLAY_LABEL_KEYS: Record<OverlayKind, PluralKey> = {
  trajectory: "overlay_trajectory",
  force: "overlay_force",
  velocity: "velocity",
  weight: "overlay_weight",
  inertia: "overlay_inertia",
};

/** The elements `kind` can be drawn on — the denominator of the n/total counter. */
export function overlay_targets(
  elements: MechanicalElement[],
  kind: OverlayKind,
): MechanicalElement[] {
  return elements.filter((el) => available_overlays(el).includes(kind));
}

/**
 * How many distinct `kind` quantities ONE element of that kind carries — the number `tn` needs to pick singular or plural for `OVERLAY_LABEL_KEYS[kind]`.
 * One for every kind: each is a single field read off one beam (or node), even "stress", which folds N and Mf into one utilization ratio rather than showing them separately.
 */
function overlay_label_weight(kind: OverlayKind): number {
  switch (kind) {
    case "trajectory":
    case "velocity":
    case "force":
    case "weight":
    case "inertia":
      return 1;
  }
}

/** Summed `overlay_label_weight` across `elements` — pass straight to `tn`. */
export function overlay_label_count(
  elements: MechanicalElement[],
  kind: OverlayKind,
): number {
  return elements.length * overlay_label_weight(kind);
}

/** How many of the applicable elements currently show `kind`, out of how many. */
export function overlay_count(
  elements: MechanicalElement[],
  kind: OverlayKind,
): { shown: number; total: number } {
  const targets = overlay_targets(elements, kind);
  return {
    shown: targets.filter((el) => overlay_shown(el, kind)).length,
    total: targets.length,
  };
}

/** True as soon as one layer shows at least one element — the single bit that
 * lights up the "Afficher" button ("something is drawn over my canvas"). */
export function any_overlay_shown(elements: MechanicalElement[]): boolean {
  return elements.some((el) =>
    available_overlays(el).some((kind) => overlay_shown(el, kind)),
  );
}

/**
 * Bulk command: show/hide `kind` on every element it applies to.
 * Emits one action per element whose state actually differs (a command, not a toggle).
 * Observation-only: the recorded snapshots are preserved.
 */
export function set_all_overlays(
  elements: MechanicalElement[],
  kind: OverlayKind,
  show: boolean,
): Action[] {
  return overlay_targets(elements, kind)
    .filter((el) => overlay_shown(el, kind) !== show)
    .map((el) => ({
      type: "SetShowOverlay" as const,
      elementID: el.id,
      kind,
      newValue: show,
      oldValue: overlay_shown(el, kind),
    }));
}

/** Toggle one overlay on one element (the switch in the element's panel). */
export function set_overlay(
  element: MechanicalElement,
  kind: OverlayKind,
  show: boolean,
): Action[] {
  return [
    {
      type: "SetShowOverlay",
      elementID: element.id,
      kind,
      newValue: show,
      oldValue: overlay_shown(element, kind),
    },
  ];
}
