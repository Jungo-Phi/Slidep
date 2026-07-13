import {
  Action,
  MechanicalElement,
  OverlayKind,
  available_overlays,
  overlay_shown,
} from "../../types";

/** Human label of each overlay layer (full wording — the "Afficher" menu has
 *  the room an icon doesn't). */
export const OVERLAY_LABELS: Record<OverlayKind, string> = {
  trajectory: "Trajectoires",
  force: "Forces de réaction",
  velocity: "Vitesses",
  stress: "Contraintes (MPa)",
};

/** The elements `kind` can be drawn on — the denominator of the n/total counter. */
export function overlay_targets(
  elements: MechanicalElement[],
  kind: OverlayKind,
): MechanicalElement[] {
  return elements.filter((el) => available_overlays(el).includes(kind));
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
 *  lights up the "Afficher" button ("something is drawn over my canvas"). */
export function any_overlay_shown(elements: MechanicalElement[]): boolean {
  return elements.some((el) =>
    available_overlays(el).some((kind) => overlay_shown(el, kind)),
  );
}

/**
 * Bulk command: show/hide `kind` on every element it applies to. Emits one
 * action per element whose state actually differs (a command, not a toggle).
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
