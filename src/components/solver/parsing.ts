import {
  ConstraintElement,
  Link,
  MechanicalElement,
  Nodes,
  Point2,
} from "../../types";

/**
 * Returns parsed positions and radii of mechanism / key: "elementID:part"
 */
export function get_nodes(mechanicalElements: MechanicalElement[]): Nodes {
  const positions = new Map<string, Point2>();
  const radii = new Map<string, number>();
  const posMasses = new Map<string, number>();
  const radMasses = new Map<string, number>();

  mechanicalElements.forEach((element) => {
    if ("position" in element) {
      positions.set(`${element.id}:pos`, element.position);
      posMasses.set(`${element.id}:pos`, element.isGrounded ? 0 : 1);
      if ("radius" in element) {
        radii.set(`${element.id}:pos`, element.radius);
        radMasses.set(`${element.id}:pos`, 1);
      }
    } else {
      positions.set(`${element.id}:start`, element.positionStart);
      positions.set(`${element.id}:end`, element.positionEnd);
      posMasses.set(`${element.id}:start`, 1);
      posMasses.set(`${element.id}:end`, 1);
    }
  });
  return { positions, radii, posMasses, radMasses };
}

/**
 * Returns parsed positions constraints / key: "constraintID:position"
 */
export function get_constraint_nodes(
  constraintElements: ConstraintElement[],
): Map<string, Point2> {
  const positions = new Map<string, Point2>();

  constraintElements.forEach((constraint) => {
    positions.set(`${constraint.id}:pos`, constraint.position);
  });
  return positions;
}

/*
 * Parse a `ConstraintElement` to `Link` for solvers to use
 */
export function constraint_to_link(element: ConstraintElement): Link {
  switch (element.type) {
    case "dimension-edge":
      return {
        type: "Distance",
        ddl: 1,
        key1: `${element.edgeID}:start`,
        key2: `${element.edgeID}:end`,
        distance: element.value,
      };
    case "dimension-node-to-node":
      return {
        type: "Distance",
        ddl: 1,
        key1: `${element.startNodeID}:start`,
        key2: `${element.endNodeID}:end`,
        distance: element.value,
      };
    case "dimension-edge-to-node":
      return {
        type: "DistanceToLine",
        ddl: 1,
        key1: `${element.edgeID}:start`,
        key2: `${element.edgeID}:end`,
        key3: `${element.nodeID}:pos`,
        distance: element.value,
      };
    case "dimension-angle":
      return {
        type: "Angle",
        ddl: 1,
        key1: `${element.startEdgeID}:start`,
        key2: `${element.startEdgeID}:end`,
        key3: `${element.endEdgeID}:start`,
        key4: `${element.endEdgeID}:end`,
        angle: element.value,
      };
    case "dimension-radius":
      return {
        type: "Radius",
        ddl: 1,
        key1: `${element.gearID}:pos`,
        radius: element.value,
      };
    case "horizontal-align-edge":
      return {
        type: "Horizontal",
        ddl: 1,
        key1: `${element.edgeID}:start`,
        key2: `${element.edgeID}:end`,
      };
    case "horizontal-align-nodes":
      return {
        type: "Horizontal",
        ddl: 1,
        key1: `${element.startNodeID}:pos`,
        key2: `${element.endNodeID}:pos`,
      };
    case "vertical-align-edge":
      return {
        type: "Vertical",
        ddl: 1,
        key1: `${element.edgeID}:start`,
        key2: `${element.edgeID}:end`,
      };
    case "vertical-align-nodes":
      return {
        type: "Vertical",
        ddl: 1,
        key1: `${element.startNodeID}:pos`,
        key2: `${element.endNodeID}:pos`,
      };
    case "normal":
      return {
        type: "Normal",
        ddl: 1,
        key1: `${element.startEdgeID}:start`,
        key2: `${element.startEdgeID}:end`,
        key3: `${element.endEdgeID}:start`,
        key4: `${element.endEdgeID}:end`,
      };
    case "parallel":
      return {
        type: "Parallel",
        ddl: 1,
        key1: `${element.startEdgeID}:start`,
        key2: `${element.startEdgeID}:end`,
        key3: `${element.endEdgeID}:start`,
        key4: `${element.endEdgeID}:end`,
      };
    case "equal":
      return {
        type: "EqualLength",
        ddl: 1,
        key1: `${element.startEdgeID}:start`,
        key2: `${element.startEdgeID}:end`,
        key3: `${element.endEdgeID}:start`,
        key4: `${element.endEdgeID}:end`,
      };
    case "gear-ratio":
      return {
        type: "GearRatio",
        ddl: 1,
        key1: `${element.startGearID}:pos`,
        key2: `${element.endGearID}:pos`,
        ratio: element.value,
      };
  }
}
