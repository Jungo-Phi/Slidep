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
      if ("isGrounded" in element) {
        posMasses.set(`${element.id}:pos`, element.isGrounded ? 0 : 1);
      } else {
        posMasses.set(`${element.id}:pos`, 1);
      }
      if ("radius" in element) {
        radii.set(`${element.id}:rad`, element.radius);
        radMasses.set(`${element.id}:rad`, 1);
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
        key1: `${element.startNodeID}:pos`,
        key2: `${element.endNodeID}:pos`,
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
        flipStart: element.flipStart,
        flipEnd: element.flipEnd,
        couterClockwise: element.couterClockwise,
        angle_rad: (element.value * Math.PI) / 180,
      };
    case "dimension-radius":
      return {
        type: "Radius",
        ddl: 1,
        key1: `${element.gearID}:rad`,
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
        key1: `${element.startGearID}:rad`,
        key2: `${element.endGearID}:rad`,
        ratio: element.value,
      };
  }
}

/*
 * Parse a Elements to Links for solvers to use
 */
export function get_links(
  mechanicalElements: MechanicalElement[],
  constraintElements: ConstraintElement[],
): Link[] {
  const links: Link[] = [];
  constraintElements.forEach((constraint) => {
    links.push(constraint_to_link(constraint));
  });

  mechanicalElements.forEach((element) => {
    if ("positionStart" in element) {
      if (element.fixedNodeStartID) {
        links.push({
          type: "Coincidence",
          ddl: 2,
          key1: `${element.fixedNodeStartID}:pos`,
          key2: `${element.id}:start`,
        });
      }
      if (element.fixedNodeEndID) {
        links.push({
          type: "Coincidence",
          ddl: 2,
          key1: `${element.fixedNodeEndID}:pos`,
          key2: `${element.id}:end`,
        });
      }
      if (element.type === "beam") {
        element.fixedNodesBodyIDs.forEach((nodeId) => {
          links.push({
            type: "OnSegment",
            ddl: 1,
            key1: `${element.id}:start`,
            key2: `${element.id}:end`,
            key3: `${nodeId}:pos`,
          });
        });
      }
    }
    if (element.type === "gear") {
      element.meshedGearsIDs.forEach((meshedId) => {
        if (
          links.filter(
            (link) =>
              link.type === "GearMeshing" &&
              link.key2 === `${element.id}:pos` &&
              link.key1 === `${meshedId}:pos`,
          ).length === 0
        ) {
          links.push({
            type: "GearMeshing",
            ddl: 1,
            key1: `${element.id}:pos`,
            key2: `${meshedId}:pos`,
            radKey1: `${element.id}:rad`,
            radKey2: `${meshedId}:rad`,
          });
        }
      });
    }
    if (element.type === "pivot" || element.type === "slidep") {
      element.fixedGearsIDs.forEach((gearId) => {
        links.push({
          type: "Coincidence",
          ddl: 2,
          key1: `${element.id}:pos`,
          key2: `${gearId}:pos`,
        });
      });
    }
  });
  return links;
}
