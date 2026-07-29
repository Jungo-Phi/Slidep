import { Link } from "../../types";
import { ABSENT, EditNodes, Nodes, SimNodes } from "./nodes";

/**
 * A link's keys resolved to node slots, in a layout fixed per link type (see the switch
 * below). Recomputed at the start of every solve rather than cached on the link:
 * `rebake_belt_pin_refs` rewrites belt reference keys mid-simulation, and the cost is
 * O(links) against 300 sweeps.
 */
export interface LinkSlots {
  pos: Int32Array;
  ang: Int32Array;
  rad: Int32Array;
}

const EMPTY = new Int32Array(0);

/** Resolves every link's keys against `nodes`. Unknown keys become `ABSENT`. */
export function resolve_slots(links: Link[], nodes: Nodes): LinkSlots[] {
  const posIndex = nodes.index;
  const angIndex = (nodes as SimNodes).angleIndex as Map<string, number> | undefined;
  const radIndex = (nodes as EditNodes).radIndex as Map<string, number> | undefined;

  const P = (k: string | undefined) =>
    k === undefined ? ABSENT : (posIndex.get(k) ?? ABSENT);
  const A = (k: string | undefined) =>
    k === undefined || angIndex === undefined ? ABSENT : (angIndex.get(k) ?? ABSENT);
  const R = (k: string | undefined) =>
    k === undefined || radIndex === undefined ? ABSENT : (radIndex.get(k) ?? ABSENT);

  const many = (keys: string[] | undefined, resolve: (k: string) => number) =>
    keys === undefined ? EMPTY : Int32Array.from(keys, resolve);

  return links.map((link): LinkSlots => {
    switch (link.type) {
      case "Coincidence":
      case "Distance":
      case "Spring":
      case "Horizontal":
      case "Vertical":
      case "KeepOrientation":
        return { pos: Int32Array.of(P(link.key1), P(link.key2)), ang: EMPTY, rad: EMPTY };

      case "DistanceToLine":
      case "SlideOnSegment":
      case "FixedOnSegment":
        return {
          pos: Int32Array.of(P(link.key1), P(link.key2), P(link.key3)),
          ang: EMPTY,
          rad: EMPTY,
        };

      case "Angle":
      case "Normal":
      case "Parallel":
      case "EqualLength":
        return {
          pos: Int32Array.of(P(link.key1), P(link.key2), P(link.key3), P(link.key4)),
          ang: EMPTY,
          rad: EMPTY,
        };

      case "Radius":
        return { pos: EMPTY, ang: EMPTY, rad: Int32Array.of(R(link.key1)) };

      case "GearMeshing":
      case "GearRatio":
        return {
          pos: Int32Array.of(P(link.key1), P(link.key2)),
          ang: EMPTY,
          rad: Int32Array.of(R(link.radKey1), R(link.radKey2)),
        };

      case "MotorBeam":
        return {
          pos: Int32Array.of(P(link.pivotKey), P(link.drivenKey)),
          ang: EMPTY,
          rad: EMPTY,
        };

      case "MotorAngle":
        return { pos: EMPTY, ang: Int32Array.of(A(link.angleKey)), rad: EMPTY };

      case "CoaxialAngle":
        return {
          pos: EMPTY,
          ang: Int32Array.of(A(link.angleKey1), A(link.angleKey2)),
          rad: EMPTY,
        };


      case "GearMeshAngle":
        return {
          pos: Int32Array.of(P(link.posKey1), P(link.posKey2)),
          ang: Int32Array.of(A(link.angleKey1), A(link.angleKey2)),
          rad: EMPTY,
        };

      case "GearPerimeterPin":
        return {
          pos: Int32Array.of(P(link.nodeKey), P(link.centerKey)),
          ang: Int32Array.of(A(link.angleKey)),
          rad: EMPTY,
        };

      case "BeamFollowsAngle":
        return {
          pos: Int32Array.of(P(link.pivotKey), P(link.drivenKey)),
          ang: Int32Array.of(A(link.angleKey)),
          rad: EMPTY,
        };

      // pos: start, end, then one per pulley. ang: the belt travel φ (simulation only).
      // rad: one per pulley (edition only, when a length dimension resizes them).
      case "BeltLength":
        return {
          pos: Int32Array.of(P(link.startKey), P(link.endKey), ...link.gearPosKeys.map(P)),
          ang: EMPTY,
          rad: many(link.radKeys, R),
        };

      // pos: the junction node, then one per pulley.
      case "BeltJunction":
        return {
          pos: Int32Array.of(P(link.nodeKey), ...link.gearPosKeys.map(P)),
          ang: EMPTY,
          rad: many(link.radKeys, R),
        };

      // pos: node, start, end, then one per pulley. ang: the reference pulley's angle.
      case "BeltPin":
        return {
          pos: Int32Array.of(
            P(link.nodeKey),
            P(link.startKey),
            P(link.endKey),
            ...link.gearPosKeys.map(P),
          ),
          ang: Int32Array.of(A(link.refAngleKey)),
          rad: EMPTY,
        };

      // pos: pivot, driven, then one per pulley. ang: the reference pulley's angle.
      case "BeltFollowsTangent":
        return {
          pos: Int32Array.of(
            P(link.pivotKey),
            P(link.drivenKey),
            ...link.gearPosKeys.map(P),
          ),
          ang: Int32Array.of(A(link.refAngleKey)),
          rad: EMPTY,
        };

      // pos: strand ends a and b, start, end, then one per pulley. ang: θ_a, θ_b.
      case "BeltSegmentNoSlip":
        return {
          pos: Int32Array.of(
            P(link.posKeyA),
            P(link.posKeyB),
            P(link.startKey),
            P(link.endKey),
            ...link.gearPosKeys.map(P),
          ),
          ang: Int32Array.of(A(link.angleKeyA), A(link.angleKeyB)),
          rad: EMPTY,
        };

      // pos: start, end, then one per pulley. ang: the two bound angles.
      case "BeltSubChainAggregate":
        return {
          pos: Int32Array.of(
            P(link.startKey),
            P(link.endKey),
            ...link.gearPosKeys.map(P),
          ),
          ang: Int32Array.of(A(link.angleKeyStart), A(link.angleKeyEnd)),
          rad: EMPTY,
        };

      // A grab targets either a position or a radius (edition), so the key is looked up
      // in both spaces; only one of them resolves.
      case "HandleGrab":
        return {
          pos: Int32Array.of(P(link.grabbedKey)),
          ang: EMPTY,
          rad: Int32Array.of(R(link.grabbedKey)),
        };
    }
  });
}
