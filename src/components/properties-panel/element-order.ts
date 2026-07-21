import {
  ConstraintElement,
  ConstraintElementType,
  ID,
  MechanicalElement,
  MechanicalElementType,
} from "../../types/element";

/** A motored pivot reads as its own kind in the palette, so the lists give it its own group too. */
type DisplayType = MechanicalElementType | "motor";

/** Display order of the panel lists: mirrors the palette's grouping so a list and the palette read the same way. */
const TYPE_ORDER: DisplayType[] = [
  "damper",
  "spring",
  "mass",
  "motor",
  "slider",
  "slidep",
  "pivot",
  "belt",
  "gear",
  "join",
  "beam",
];

const CONSTRAINT_TYPE_ORDER: ConstraintElementType[] = [
  "dimension-edge",
  "dimension-belt",
  "dimension-radius",
  "dimension-node-to-node",
  "dimension-edge-to-node",
  "dimension-angle",
  "gear-ratio",
  "equal",
  "horizontal-align-edge",
  "horizontal-align-nodes",
  "vertical-align-edge",
  "vertical-align-nodes",
  "normal",
  "parallel",
];

function display_type(element: MechanicalElement): DisplayType {
  return element.type === "pivot" && element.motor ? "motor" : element.type;
}

/** Groups elements by type, keeping creation order inside a group so a list never reshuffles under the reader. */
export function sorted_for_display<T extends MechanicalElement>(
  elements: T[],
): T[] {
  return [...elements].sort(
    (a, b) =>
      TYPE_ORDER.indexOf(display_type(a)) - TYPE_ORDER.indexOf(display_type(b)),
  );
}

/** Same grouping for the constraints tab: dimensions first, then the geometric constraints. */
export function sorted_constraints_for_display<T extends ConstraintElement>(
  constraints: T[],
): T[] {
  return [...constraints].sort(
    (a, b) =>
      CONSTRAINT_TYPE_ORDER.indexOf(a.type) -
      CONSTRAINT_TYPE_ORDER.indexOf(b.type),
  );
}

/** Orders an edge's body nodes start → end, so the list reads along the edge. Non-edge hosts (a gear's fixed nodes) keep their stored order. */
export function ordered_body_nodes(
  host: MechanicalElement,
  nodeIDs: ID[],
  elements: MechanicalElement[],
): ID[] {
  if (!("positionStart" in host)) return nodeIDs;
  const abscissa = (id: ID) => {
    const node = elements.find((el) => el.id === id);
    // A node that cannot be placed sinks to the end rather than poisoning the comparator.
    return node && "position" in node
      ? node.position.parameter_on_segment(host.positionStart, host.positionEnd)
      : Number.MAX_VALUE;
  };
  return [...nodeIDs].sort((a, b) => abscissa(a) - abscissa(b));
}
