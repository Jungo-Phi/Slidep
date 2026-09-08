import {
  EqualEdges,
  HorizontalAlignEdge,
  HorizontalAlignNodes,
  MassElement,
  MechanicalElement,
  NodeElement,
  NormalEdges,
  OVERLAY_KIND_ORDER,
  OverlayKind,
  ParallelEdges,
  UnionElement,
  VerticalAlignEdge,
  VerticalAlignNodes,
} from "../types/element";

/** Type guard: node elements — the only ones whose trajectory can be shown. */
export function is_node_element(el: MechanicalElement): el is NodeElement {
  return (
    el.type === "pivot" ||
    el.type === "slider" ||
    el.type === "slidep" ||
    el.type === "join" ||
    el.type === "mass"
  );
}

/**
 * Type guard: elements that can be anchored to the ground — every node but a mass (free by definition) and a motorised pivot, whose anchoring is decided by its motor's mount instead.
 */
export function is_groundable(
  el: MechanicalElement,
): el is Exclude<NodeElement, MassElement> {
  return (
    is_node_element(el) &&
    el.type !== "mass" &&
    !(el.type === "pivot" && el.motor !== undefined)
  );
}

/**
 * Type guard: elements that carry a `name` — everything except the geometric constraints.
 * Checked on `element.type`, not on whether the property happens to be set: a freshly created, never-renamed element has no `name` key at runtime either, `name` being optional, so `"name" in element` cannot tell the two apart.
 */
export function is_nameable(
  element: UnionElement,
): element is Exclude<
  UnionElement,
  | HorizontalAlignEdge
  | HorizontalAlignNodes
  | VerticalAlignEdge
  | VerticalAlignNodes
  | NormalEdges
  | ParallelEdges
  | EqualEdges
> {
  return !new Set([
    "horizontal-align-edge",
    "horizontal-align-nodes",
    "vertical-align-edge",
    "vertical-align-nodes",
    "normal",
    "parallel",
    "equal",
  ]).has(element.type);
}

/**
 * Which overlays make sense on this element — the honest denominator of the `n/total` counters in the "Afficher" menu.
 * - trajectory: a single moving point → nodes only
 * - velocity: anything whose position is sampled (nodes, gears, edge midpoint)
 * - force: a reaction is a point object → nodes only
 *
 * A beam's stress colouring (normal/bending/utilization) is not here — it's not a per-element flag, see `BeamStressLens` (docs/plan-efforts-interieurs.md phase 9).
 */
export function available_overlays(element: MechanicalElement): OverlayKind[] {
  const isNode = is_node_element(element);
  return OVERLAY_KIND_ORDER.filter((kind) => {
    switch (kind) {
      case "trajectory":
        return isNode;
      case "velocity":
        return true;
      case "force":
        return isNode;
    }
  });
}

/** Is `kind` currently shown on `element`? */
export function overlay_shown(
  element: MechanicalElement,
  kind: OverlayKind,
): boolean {
  return !!element.overlays?.[kind];
}
