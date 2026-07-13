import type { CanvasState } from "../../types/canvas-state";
import type { HoveredPart } from "../../types/hovered-part";
import {
  BeltElement,
  EdgeElement,
  GearElement,
  MechanicalElement,
  NodeElement,
} from "../../types";
import { get_mechanical_element_from_id } from "../mechanism/connect-actions";
import {
  measure_belt_length,
  resolve_angle_constraint_quadrant,
} from "../../utils";
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

export function handle_placing_constraint(
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
          actionBundleType: "CreateConstraint",
          newCanvasState: {
            type: "EditingConstraint",
            elementID,
            value,
            isPlacing: true,
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
        actionBundleType: "CreateConstraint",
        newCanvasState: {
          type: "EditingConstraint",
          elementID,
          value,
          isPlacing: true,
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
      const value = node.position.distance_to_line(
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
        actionBundleType: "CreateConstraint",
        newCanvasState: {
          type: "EditingConstraint",
          elementID,
          value,
          isPlacing: true,
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
        actionBundleType: "CreateConstraint",
        newCanvasState: {
          type: "EditingConstraint",
          elementID,
          value: angle,
          isPlacing: true,
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
        actionBundleType: "CreateConstraint",
        newCanvasState: {
          type: "EditingConstraint",
          elementID,
          value,
          isPlacing: true,
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
        actionBundleType: "CreateConstraint",
        newCanvasState: {
          type: "EditingConstraint",
          elementID,
          value,
          isPlacing: true,
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
                position: edge.positionStart.lerp(edge.positionEnd, 0.5),
                id: crypto.randomUUID(),
                edgeID: edge.id,
              },
            },
          ],
          actionBundleType: "CreateConstraint",
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
              position: startNode.position.lerp(hoveredPart.position, 0.5),
              id: crypto.randomUUID(),
              startNodeID: state.startNodeID,
              endNodeID: hoveredPart.id,
            },
          },
        ],
        actionBundleType: "CreateConstraint",
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
      const position = startEdge.positionStart
        .lerp(startEdge.positionEnd, 0.5)
        .lerp(endEdge.positionStart.lerp(endEdge.positionEnd, 0.5), 0.5);
      return {
        actions: [
          {
            type: "CreateElement",
            element: {
              type: "normal",
              position,
              id: crypto.randomUUID(),
              startEdgeID: startEdge.id,
              endEdgeID: endEdge.id,
            },
          },
        ],
        actionBundleType: "CreateConstraint",
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
      const position = startEdge.positionStart
        .lerp(startEdge.positionEnd, 0.5)
        .lerp(endEdge.positionStart.lerp(endEdge.positionEnd, 0.5), 0.5);
      return {
        actions: [
          {
            type: "CreateElement",
            element: {
              type: "parallel",
              position,
              id: crypto.randomUUID(),
              startEdgeID: startEdge.id,
              endEdgeID: endEdge.id,
            },
          },
        ],
        actionBundleType: "CreateConstraint",
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
      const position = startEdge.positionStart
        .lerp(startEdge.positionEnd, 0.5)
        .lerp(endEdge.positionStart.lerp(endEdge.positionEnd, 0.5), 0.5);
      return {
        actions: [
          {
            type: "CreateElement",
            element: {
              type: "equal",
              position,
              id: crypto.randomUUID(),
              startEdgeID: startEdge.id,
              endEdgeID: endEdge.id,
            },
          },
        ],
        actionBundleType: "CreateConstraint",
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
      const position = startGear.position.lerp(endGear.position, 0.5);
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
        actionBundleType: "CreateConstraint",
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
      const position = startGear.position.lerp(endGear.position, 0.5);
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
        actionBundleType: "CreateConstraint",
        newCanvasState: {
          type: "EditingConstraint",
          elementID,
          value,
          isPlacing: true,
        },
      };
    }
  }
}
