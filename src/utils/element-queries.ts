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
import { element_carries_mass } from "./element-mass";

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
 * Whether the point an element is sampled at (`probe_slots`) is a point OF that element — what a position or a velocity read there is allowed to claim.
 * An edge is sampled mid-span, which only a rigid member owns: a belt runs around its pulleys, so the mid-point between its two ends sits nowhere on it, and a spring or a damper has no body between its ends at all, only the average of two points each belonging to something else.
 */
export function samples_own_point(element: MechanicalElement): boolean {
  return (
    element.type !== "belt" &&
    element.type !== "spring" &&
    element.type !== "damper"
  );
}

/**
 * Whether `kind` makes sense on this element — the honest denominator of the `n/total` counters in the "Afficher" menu, and the guard that keeps a stored flag from drawing an overlay the element's own panel does not offer (`overlay_shown`).
 * - trajectory: the path a point of the element sweeps → anything but a belt, whose two ends are one and the same junction.
 * A segment traces its two ends, which are real points whatever sits between them, so a spring and a damper keep theirs.
 * - velocity: wherever the sampled point is the element's own (`samples_own_point`).
 * - force: an element's own end torsors → edges (two ends) and gears (one).
 * A node's force reading is the support reaction, which is a property of the problem rather than of the node (docs/plan-efforts-interieurs.md phase 8) and lives in its own mechanism-wide overlay instead.
 * - weight / inertia: a body's own `m·g` / `m·a`, at its centre of mass → whatever carries a mass (`element_carries_mass`), same set the force balance's own weight/inertia rows draw from.
 *
 * A beam's stress colouring (normal/bending/utilization) is not here — it's not a per-element flag, see `BeamStressLens` (docs/plan-efforts-interieurs.md phase 9).
 */
export function overlay_applies(
  element: MechanicalElement,
  kind: OverlayKind,
): boolean {
  switch (kind) {
    case "trajectory":
      return element.type !== "belt";
    case "velocity":
      return samples_own_point(element);
    case "force":
      return !is_node_element(element);
    case "weight":
    case "inertia":
      return element_carries_mass(element);
  }
}

/** Every overlay `element` can show, in the canonical order.
 * Allocates a list, so a caller asking about one single kind — a draw loop in particular — takes `overlay_applies` instead. */
export function available_overlays(element: MechanicalElement): OverlayKind[] {
  return OVERLAY_KIND_ORDER.filter((kind) => overlay_applies(element, kind));
}

/** Is `kind` currently shown on `element`? False for an overlay this element does not carry, whatever its stored flag says. */
export function overlay_shown(
  element: MechanicalElement,
  kind: OverlayKind,
): boolean {
  return !!element.overlays?.[kind] && overlay_applies(element, kind);
}
