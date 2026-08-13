import type { Action } from "../../types/actions";
import type { CanvasState } from "../../types/canvas-state";
import type { HoveredPart } from "../../types/hovered-part";
import {
  BeltElement,
  ConstraintElement,
  EdgeElement,
  GearElement,
  ID,
  MechanicalElement,
  NodeElement,
  UnionElement,
} from "../../types";
import { get_mechanical_element_from_id } from "../mechanism/connect-actions";
import {
  measure_belt_length,
  resolve_angle_constraint_quadrant,
} from "../../utils";
import { constraint_key } from "../../utils/validate-mechanism";
import type { MouseDownResult } from "./placing-element-actions";

type ConstraintCanvasState = Extract<
  CanvasState,
  {
    type:
      | "DimensionStart"
      | "DimensionNode"
      | "DimensionEdge"
      | "DimensionNodeToNode"
      | "DimensionEdgeToNode"
      | "DimensionAngle"
      | "DimensionRadius"
      | "DimensionBelt"
      | "HorizontalVerticalConstraintStart"
      | "HorizontalVerticalConstraintNode"
      | "NormalConstraintStart"
      | "NormalConstraintEdge"
      | "ParallelConstraintStart"
      | "ParallelConstraintEdge"
      | "EqualConstraintStart"
      | "EqualConstraintEdge"
      | "EqualConstraintGear"
      | "GearRatioConstraintStart"
      | "GearRatioConstraintGear";
  }
>;

/** Mechanical elements carry probes; loads name a host; constraints neither. */
function is_constraint(element: UnionElement): element is ConstraintElement {
  return !("probes" in element) && !("targetID" in element);
}

/**
 * The constraints `result` would repeat, and so takes the place of.
 *
 * The verdict is read off the built constraint rather than the gesture, because
 * the type only settles at construction: an alignment turns horizontal or
 * vertical on the edge's own slope, and two gears made equal become a ratio.
 */
function repeated_constraints(
  result: MouseDownResult,
  constraintElements: ConstraintElement[],
): ConstraintElement[] {
  const created = result.actions.find(
    (action) => action.type === "CreateElement",
  );
  if (created?.type !== "CreateElement" || !is_constraint(created.element))
    return [];
  const key = constraint_key(created.element);
  return constraintElements.filter(
    (constraint) => constraint_key(constraint) === key,
  );
}

/**
 * A relation is imposed once: a constraint repeating one the mechanism already
 * carries takes its place instead of stacking on it — re-dimensioning an edge
 * moves its dimension and re-measures it.
 *
 * The eviction goes last so the bundle still opens on the creation, which is
 * what `apply_actions` reads to route it.
 */
function evict_repeated_constraint(
  result: MouseDownResult,
  constraintElements: ConstraintElement[],
): MouseDownResult {
  const repeated = repeated_constraints(result, constraintElements);
  if (repeated.length === 0) return result;
  return {
    ...result,
    actions: [
      ...result.actions,
      ...repeated.map(
        (element): Action => ({ type: "DeleteElement", element }),
      ),
    ],
  };
}

/** The dimensioning steps whose next click builds the dimension and opens its value editor. */
const DIMENSION_PLACEMENTS = [
  "DimensionEdge",
  "DimensionNodeToNode",
  "DimensionEdgeToNode",
  "DimensionAngle",
  "DimensionRadius",
  "DimensionBelt",
] as const;

type DimensionPlacementState = Extract<
  ConstraintCanvasState,
  { type: (typeof DIMENSION_PLACEMENTS)[number] }
>;

function is_dimension_placement(
  state: CanvasState,
): state is DimensionPlacementState {
  return (DIMENSION_PLACEMENTS as readonly string[]).includes(state.type);
}

const NOTHING_REPLACED: ReadonlySet<ID> = new Set();

/**
 * The dimensions the aimed placement would take the place of, to hide them while
 * it is aimed — the preview already draws their replacement under the cursor.
 * Only the dimensioning steps answer: the other constraints have no preview, so
 * hiding what they replace would make a badge vanish with nothing to show for it.
 *
 * A step like `DimensionEdge` hovering an `Edge` does not build yet: it only
 * advances to `DimensionAngle`, still aimed at the same hover. The preview drawn
 * for that frame is the angle's, so the search follows the same chain of
 * no-op transitions — same hover each time, since the click hasn't moved.
 */
export function replaced_constraint_ids(
  state: CanvasState,
  hoveredPart: HoveredPart,
  mechanicalElements: MechanicalElement[],
  constraintElements: ConstraintElement[],
): ReadonlySet<ID> {
  let current = state;
  while (is_dimension_placement(current)) {
    const result = build_constraint(current, hoveredPart, mechanicalElements);
    const repeated = repeated_constraints(result, constraintElements);
    if (repeated.length > 0)
      return new Set(repeated.map((constraint) => constraint.id));
    if (
      result.actions.length === 0 &&
      result.newCanvasState &&
      result.newCanvasState.type !== current.type
    ) {
      current = result.newCanvasState;
      continue;
    }
    break;
  }
  return NOTHING_REPLACED;
}

export function handle_placing_constraint(
  state: ConstraintCanvasState,
  hoveredPart: HoveredPart,
  mechanicalElements: MechanicalElement[],
  constraintElements: ConstraintElement[],
): MouseDownResult {
  return evict_repeated_constraint(
    build_constraint(state, hoveredPart, mechanicalElements),
    constraintElements,
  );
}

function build_constraint(
  state: ConstraintCanvasState,
  hoveredPart: HoveredPart,
  mechanicalElements: MechanicalElement[],
): MouseDownResult {
  switch (state.type) {
    case "DimensionStart":
      if (hoveredPart.type === "Node")
        return {
          actions: [],
          newCanvasState: { type: "DimensionNode", nodeID: hoveredPart.id },
        };
      if (hoveredPart.type === "Edge")
        return {
          actions: [],
          newCanvasState: { type: "DimensionEdge", edgeID: hoveredPart.id },
        };
      if (hoveredPart.type === "GearTooth")
        return {
          actions: [],
          newCanvasState: {
            type: "DimensionRadius",
            gearID: hoveredPart.id,
          },
        };
      if (hoveredPart.type === "BeltBody")
        return {
          actions: [],
          newCanvasState: { type: "DimensionBelt", beltID: hoveredPart.id },
        };
      return { actions: [] };

    case "DimensionNode":
      if (hoveredPart.type === "Node")
        return {
          actions: [],
          newCanvasState: {
            type: "DimensionNodeToNode",
            startNodeID: state.nodeID,
            endNodeID: hoveredPart.id,
          },
        };
      if (hoveredPart.type === "Edge")
        return {
          actions: [],
          newCanvasState: {
            type: "DimensionEdgeToNode",
            edgeID: hoveredPart.id,
            nodeID: state.nodeID,
          },
        };
      return { actions: [] };

    case "DimensionEdge": {
      if (hoveredPart.type === "Node")
        return {
          actions: [],
          newCanvasState: {
            type: "DimensionEdgeToNode",
            edgeID: state.edgeID,
            nodeID: hoveredPart.id,
          },
        };
      if (hoveredPart.type === "Edge")
        return {
          actions: [],
          newCanvasState: {
            type: "DimensionAngle",
            startEdgeID: state.edgeID,
            endEdgeID: hoveredPart.id,
          },
        };
      if (hoveredPart.type === "Void") {
        const elementID = crypto.randomUUID();
        const edge = get_mechanical_element_from_id(
          state.edgeID,
          mechanicalElements,
        ) as EdgeElement;
        const value = edge.positionStart.distance_to(edge.positionEnd);
        return {
          actions: [
            {
              type: "CreateElement",
              element: {
                type: "dimension-edge",
                position: hoveredPart.position,
                id: elementID,
                edgeID: state.edgeID,
                value,
              },
            },
          ],
          newCanvasState: {
            type: "PlacingValue",
            elementID,
            value,
          },
        };
      }
      return { actions: [] };
    }

    case "DimensionNodeToNode": {
      const elementID = crypto.randomUUID();
      const startNode = get_mechanical_element_from_id(
        state.startNodeID,
        mechanicalElements,
      ) as NodeElement;
      const endNode = get_mechanical_element_from_id(
        state.endNodeID,
        mechanicalElements,
      ) as NodeElement;
      const value = startNode.position.distance_to(endNode.position);
      return {
        actions: [
          {
            type: "CreateElement",
            element: {
              type: "dimension-node-to-node",
              position: hoveredPart.position,
              id: elementID,
              startNodeID: state.startNodeID,
              endNodeID: state.endNodeID,
              value,
            },
          },
        ],
        newCanvasState: {
          type: "PlacingValue",
          elementID,
          value,
        },
      };
    }

    case "DimensionEdgeToNode": {
      const elementID = crypto.randomUUID();
      const node = get_mechanical_element_from_id(
        state.nodeID,
        mechanicalElements,
      ) as NodeElement;
      const edge = get_mechanical_element_from_id(
        state.edgeID,
        mechanicalElements,
      ) as EdgeElement;
      const value = node.position.distance2line(
        edge.positionStart,
        edge.positionEnd,
      );
      return {
        actions: [
          {
            type: "CreateElement",
            element: {
              type: "dimension-edge-to-node",
              position: hoveredPart.position,
              id: elementID,
              nodeID: state.nodeID,
              edgeID: state.edgeID,
              value,
            },
          },
        ],
        newCanvasState: {
          type: "PlacingValue",
          elementID,
          value,
        },
      };
    }

    case "DimensionAngle": {
      const elementID = crypto.randomUUID();
      const startEdge = get_mechanical_element_from_id(
        state.startEdgeID,
        mechanicalElements,
      ) as EdgeElement;
      const endEdge = get_mechanical_element_from_id(
        state.endEdgeID,
        mechanicalElements,
      ) as EdgeElement;
      const quadrant = resolve_angle_constraint_quadrant(
        startEdge.positionStart,
        startEdge.positionEnd,
        endEdge.positionStart,
        endEdge.positionEnd,
        hoveredPart.position,
      );
      if (!quadrant) return { actions: [] };
      const { flipStart, flipEnd, couterClockwise, angle } = quadrant;
      return {
        actions: [
          {
            type: "CreateElement",
            element: {
              type: "dimension-angle",
              position: hoveredPart.position,
              id: elementID,
              startEdgeID: state.startEdgeID,
              endEdgeID: state.endEdgeID,
              flipStart,
              flipEnd,
              couterClockwise,
              value: angle,
            },
          },
        ],
        newCanvasState: {
          type: "PlacingValue",
          elementID,
          value: angle,
        },
      };
    }

    case "DimensionRadius": {
      const elementID = crypto.randomUUID();
      const gear = get_mechanical_element_from_id(
        state.gearID,
        mechanicalElements,
      ) as GearElement;
      const value = gear.radius;
      return {
        actions: [
          {
            type: "CreateElement",
            element: {
              type: "dimension-radius",
              position: hoveredPart.position,
              id: elementID,
              gearID: state.gearID,
              value,
            },
          },
        ],
        newCanvasState: {
          type: "PlacingValue",
          elementID,
          value,
        },
      };
    }

    case "DimensionBelt": {
      const elementID = crypto.randomUUID();
      const belt = get_mechanical_element_from_id(
        state.beltID,
        mechanicalElements,
      ) as BeltElement;
      const value = measure_belt_length(belt, mechanicalElements);
      return {
        actions: [
          {
            type: "CreateElement",
            element: {
              type: "dimension-belt",
              position: hoveredPart.position,
              id: elementID,
              beltID: state.beltID,
              value,
            },
          },
        ],
        newCanvasState: {
          type: "PlacingValue",
          elementID,
          value,
        },
      };
    }

    case "HorizontalVerticalConstraintStart": {
      if (hoveredPart.type === "Node")
        return {
          actions: [],
          newCanvasState: {
            type: "HorizontalVerticalConstraintNode",
            startNodeID: hoveredPart.id,
          },
        };
      if (hoveredPart.type === "Edge") {
        const edge = get_mechanical_element_from_id(
          hoveredPart.id,
          mechanicalElements,
        ) as EdgeElement;
        const isHorizontal =
          Math.abs(edge.positionEnd.x - edge.positionStart.x) >
          Math.abs(edge.positionEnd.y - edge.positionStart.y);
        return {
          actions: [
            {
              type: "CreateElement",
              element: {
                type: isHorizontal
                  ? "horizontal-align-edge"
                  : "vertical-align-edge",
                id: crypto.randomUUID(),
                edgeID: edge.id,
              },
            },
          ],
        };
      }
      return { actions: [] };
    }

    case "HorizontalVerticalConstraintNode": {
      const newCanvasState: CanvasState = {
        type: "HorizontalVerticalConstraintStart",
      };
      if (hoveredPart.type !== "Node") return { actions: [], newCanvasState };
      const startNode = get_mechanical_element_from_id(
        state.startNodeID,
        mechanicalElements,
      ) as NodeElement;
      const isHorizontal =
        Math.abs(hoveredPart.position.x - startNode.position.x) >
        Math.abs(hoveredPart.position.y - startNode.position.y);
      return {
        actions: [
          {
            type: "CreateElement",
            element: {
              type: isHorizontal
                ? "horizontal-align-nodes"
                : "vertical-align-nodes",
              id: crypto.randomUUID(),
              startNodeID: state.startNodeID,
              endNodeID: hoveredPart.id,
            },
          },
        ],
        newCanvasState,
      };
    }

    case "NormalConstraintStart":
      if (hoveredPart.type !== "Edge") return { actions: [] };
      return {
        actions: [],
        newCanvasState: {
          type: "NormalConstraintEdge",
          startEdgeID: hoveredPart.id,
        },
      };

    case "NormalConstraintEdge": {
      const newCanvasState: CanvasState = { type: "NormalConstraintStart" };
      if (hoveredPart.type !== "Edge") return { actions: [], newCanvasState };
      const startEdge = get_mechanical_element_from_id(
        state.startEdgeID,
        mechanicalElements,
      ) as EdgeElement;
      const endEdge = get_mechanical_element_from_id(
        hoveredPart.id,
        mechanicalElements,
      ) as EdgeElement;
      return {
        actions: [
          {
            type: "CreateElement",
            element: {
              type: "normal",
              id: crypto.randomUUID(),
              startEdgeID: startEdge.id,
              endEdgeID: endEdge.id,
            },
          },
        ],
        newCanvasState,
      };
    }

    case "ParallelConstraintStart":
      if (hoveredPart.type !== "Edge") return { actions: [] };
      return {
        actions: [],
        newCanvasState: {
          type: "ParallelConstraintEdge",
          startEdgeID: hoveredPart.id,
        },
      };

    case "ParallelConstraintEdge": {
      const newCanvasState: CanvasState = { type: "ParallelConstraintStart" };
      if (hoveredPart.type !== "Edge") return { actions: [], newCanvasState };
      const startEdge = get_mechanical_element_from_id(
        state.startEdgeID,
        mechanicalElements,
      ) as EdgeElement;
      const endEdge = get_mechanical_element_from_id(
        hoveredPart.id,
        mechanicalElements,
      ) as EdgeElement;
      return {
        actions: [
          {
            type: "CreateElement",
            element: {
              type: "parallel",
              id: crypto.randomUUID(),
              startEdgeID: startEdge.id,
              endEdgeID: endEdge.id,
            },
          },
        ],
        newCanvasState,
      };
    }

    case "EqualConstraintStart":
      if (hoveredPart.type === "Edge")
        return {
          actions: [],
          newCanvasState: {
            type: "EqualConstraintEdge",
            startEdgeID: hoveredPart.id,
          },
        };
      if (hoveredPart.type === "GearTooth")
        return {
          actions: [],
          newCanvasState: {
            type: "EqualConstraintGear",
            startGearID: hoveredPart.id,
          },
        };
      return { actions: [] };

    case "EqualConstraintEdge": {
      const newCanvasState: CanvasState = { type: "EqualConstraintStart" };
      if (hoveredPart.type !== "Edge") return { actions: [], newCanvasState };
      const startEdge = get_mechanical_element_from_id(
        state.startEdgeID,
        mechanicalElements,
      ) as EdgeElement;
      const endEdge = get_mechanical_element_from_id(
        hoveredPart.id,
        mechanicalElements,
      ) as EdgeElement;
      return {
        actions: [
          {
            type: "CreateElement",
            element: {
              type: "equal",
              id: crypto.randomUUID(),
              startEdgeID: startEdge.id,
              endEdgeID: endEdge.id,
            },
          },
        ],
        newCanvasState,
      };
    }

    case "EqualConstraintGear": {
      const newCanvasState: CanvasState = { type: "EqualConstraintStart" };
      if (hoveredPart.type !== "GearTooth")
        return { actions: [], newCanvasState };
      const startGear = get_mechanical_element_from_id(
        state.startGearID,
        mechanicalElements,
      ) as GearElement;
      const endGear = get_mechanical_element_from_id(
        hoveredPart.id,
        mechanicalElements,
      ) as GearElement;
      const position = startGear.position.lerp(endGear.position, 0.25);
      return {
        actions: [
          {
            type: "CreateElement",
            element: {
              type: "gear-ratio",
              position,
              id: crypto.randomUUID(),
              startGearID: startGear.id,
              endGearID: endGear.id,
              value: 1,
            },
          },
        ],
        newCanvasState,
      };
    }

    case "GearRatioConstraintStart":
      if (hoveredPart.type !== "GearTooth") return { actions: [] };
      return {
        actions: [],
        newCanvasState: {
          type: "GearRatioConstraintGear",
          startGearID: hoveredPart.id,
        },
      };

    case "GearRatioConstraintGear": {
      if (hoveredPart.type !== "GearTooth")
        return {
          actions: [],
          newCanvasState: { type: "GearRatioConstraintStart" },
        };
      const elementID = crypto.randomUUID();
      const startGear = get_mechanical_element_from_id(
        state.startGearID,
        mechanicalElements,
      ) as GearElement;
      const endGear = get_mechanical_element_from_id(
        hoveredPart.id,
        mechanicalElements,
      ) as GearElement;
      const position = startGear.position.lerp(endGear.position, 0.25);
      const value = startGear.radius / endGear.radius;
      return {
        actions: [
          {
            type: "CreateElement",
            element: {
              type: "gear-ratio",
              position,
              id: elementID,
              startGearID: startGear.id,
              endGearID: endGear.id,
              value,
            },
          },
        ],
        newCanvasState: {
          type: "PlacingValue",
          elementID,
          value,
        },
      };
    }
  }
}
