/**
 * Rotating and scaling a selection about a point.
 *
 * Like the mirror, the selection always gets there: what ties it to the rest yields, by moving if it can and by being cut if it cannot.
 * A load does not take part: a world-frame force belongs to the world, and an edge-frame one is stated relative to its edge.
 */

import {
  Action,
  ConstraintElement,
  ID,
  MechanicalElement,
  Mechanism,
  ViewportState,
  WorldPoint,
} from "../../types";
import { element_refs } from "../../types/element-refs";
import { DIM } from "../../constants/rendering-specs";
import { screen2world_length } from "../../utils";
import {
  carried_with,
  cut_from_rest,
  holds_in_place,
} from "./mirror-actions";
import { transformed_point } from "./mirror-geometry";

/**
 * The smallest scale `selectedIDs` can take: under it, an edge or a gear would fall below the size the canvas keeps every one of them at, and the solver would push back.
 * Never above 1, since what is already smaller may stay as it is.
 */
export function min_transform_scale(
  selectedIDs: ID[],
  elements: MechanicalElement[],
  viewport: ViewportState,
): number {
  const carried = carried_with(selectedIDs, elements);
  const minEdge = screen2world_length(DIM.MIN_EDGE_LENGTH, viewport);
  const minRadius = screen2world_length(DIM.MIN_GEAR_RADIUS, viewport);
  let scale = 0;
  for (const element of elements) {
    if (!carried.has(element.id)) continue;
    if (element.type === "gear")
      scale = Math.max(scale, minRadius / element.radius);
    else if ("positionStart" in element && element.type !== "belt") {
      const length = element.positionStart.distance_to(element.positionEnd);
      if (length > 0) scale = Math.max(scale, minEdge / length);
    }
  }
  return Math.min(1, scale);
}

/** The lengths stored by value on what is carried, each with the value `scale` gives it. */
function scaled_values(
  mechanism: Mechanism,
  carried: Set<ID>,
  scale: number,
): { id: ID; oldValue: number; newValue: number }[] {
  if (scale === 1) return [];
  const entry = (id: ID, oldValue: number) => ({
    id,
    oldValue,
    newValue: oldValue * scale,
  });
  return [
    ...mechanism.constraintElements.flatMap((c) =>
      (c.type === "dimension-edge" ||
        c.type === "dimension-node-to-node" ||
        c.type === "dimension-edge-to-node" ||
        c.type === "dimension-radius" ||
        c.type === "dimension-belt") &&
      element_refs(c).every(({ id }) => carried.has(id))
        ? [entry(c.id, c.value)]
        : [],
    ),
    ...mechanism.mechanicalElements.flatMap((el) =>
      (el.type === "spring" || el.type === "damper") &&
      carried.has(el.id) &&
      el.restLength !== undefined
        ? [entry(el.id, el.restLength)]
        : [],
    ),
  ];
}

/** `constraint`, which is horizontal or vertical, turned by a quarter: the same relation on the other axis, under an ID of its own. */
function other_axis(constraint: ConstraintElement): ConstraintElement | null {
  const id = crypto.randomUUID() as ID;
  switch (constraint.type) {
    case "horizontal-align-edge":
      return { ...constraint, id, type: "vertical-align-edge" };
    case "vertical-align-edge":
      return { ...constraint, id, type: "horizontal-align-edge" };
    case "horizontal-align-nodes":
      return { ...constraint, id, type: "vertical-align-nodes" };
    case "vertical-align-nodes":
      return { ...constraint, id, type: "horizontal-align-nodes" };
    default:
      return null;
  }
}

/**
 * What a rotation by `angle` makes of the horizontal and vertical constraints wholly on what is carried.
 * Half a turn leaves them true, a quarter swaps their axis, and any other angle makes them false, so they go.
 */
function realigned(mechanism: Mechanism, carried: Set<ID>, angle: number): Action[] {
  const quarters = angle / (Math.PI / 2);
  const whole = Math.abs(quarters - Math.round(quarters)) < 1e-6;
  if (whole && Math.round(quarters) % 2 === 0) return [];
  return mechanism.constraintElements.flatMap((constraint): Action[] => {
    if (!element_refs(constraint).every(({ id }) => carried.has(id))) return [];
    const swapped = other_axis(constraint);
    if (!swapped) return [];
    const removed: Action = { type: "DeleteElement", element: constraint };
    return whole
      ? [removed, { type: "CreateElement", element: swapped }]
      : [removed];
  });
}

/**
 * The bundle that turns `selectedIDs` by `angle` and scales them by `scale` about `center`, or nothing if that changes nothing.
 * The scale is held to `min_transform_scale`.
 */
export function transform_actions(
  selectedIDs: ID[],
  center: WorldPoint,
  angle: number,
  requestedScale: number,
  mechanism: Mechanism,
): Action[] {
  const elements = mechanism.mechanicalElements;
  const scale = Math.max(
    requestedScale,
    min_transform_scale(selectedIDs, elements, mechanism.viewport),
  );
  if (angle === 0 && scale === 1) return [];
  const carried = carried_with(selectedIDs, elements);
  const bundle: Action[] = [
    {
      type: "TransformElements",
      elementIDs: [...carried],
      constraintIDs: mechanism.constraintElements
        .filter((c) => element_refs(c).every(({ id }) => carried.has(id)))
        .map((c) => c.id),
      center,
      angle,
      scale,
      scaledValues: scaled_values(mechanism, carried, scale),
    },
    ...realigned(mechanism, carried, angle),
  ];
  return holds_in_place(mechanism, bundle, carried, (point) =>
    transformed_point(point, center, angle, scale),
  )
    ? bundle
    : [...bundle, ...cut_from_rest_after(mechanism, carried, bundle)];
}

/** `cut_from_rest`, leaving out the constraints `bundle` already takes away. */
function cut_from_rest_after(
  mechanism: Mechanism,
  carried: Set<ID>,
  bundle: Action[],
): Action[] {
  const gone = new Set(
    bundle.flatMap((action) =>
      action.type === "DeleteElement" ? [action.element.id] : [],
    ),
  );
  return cut_from_rest(mechanism, carried).filter(
    (action) => action.type !== "DeleteElement" || !gone.has(action.element.id),
  );
}
