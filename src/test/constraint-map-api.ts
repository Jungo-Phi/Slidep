import { Link, Point2 } from "../types";
import * as C from "../components/solver/constraint-functions";
import { LinkSlots, resolve_slots } from "../components/solver/link-slots";
import {
  ABSENT,
  SolveNodes,
  solveNodesFromMaps,
  writePositionsBack,
  writeScalarsBack,
} from "../components/solver/nodes";

/**
 * Map-shaped façade over the indexed constraint API, for the constraint tests and the
 * measurement benches: they build small `Map` fixtures by hand and assert on them, which
 * reads far better than slot arithmetic. Production calls the indexed functions directly.
 *
 * Each wrapper keeps the signature the constraint had before the index port, marshals
 * into node storage, applies, and writes the results back into the caller's maps.
 */

const EMPTY_MAP = () => new Map<string, number>();

interface Session {
  nodes: SolveNodes;
  P: (k?: string) => number;
  A: (k?: string) => number;
  R: (k?: string) => number;
  flush: () => void;
}

function open(
  positions: Map<string, Point2>,
  posMasses: Map<string, number> = EMPTY_MAP(),
  angles: Map<string, number> = EMPTY_MAP(),
  radii: Map<string, number> = EMPTY_MAP(),
  radMasses: Map<string, number> = EMPTY_MAP(),
): Session {
  const nodes = solveNodesFromMaps(positions, posMasses, angles, radii, radMasses);
  return {
    nodes,
    P: (k) => (k === undefined ? ABSENT : (nodes.index.get(k) ?? ABSENT)),
    A: (k) => (k === undefined ? ABSENT : (nodes.angleIndex.get(k) ?? ABSENT)),
    R: (k) => (k === undefined ? ABSENT : (nodes.radIndex.get(k) ?? ABSENT)),
    flush: () => {
      writePositionsBack(nodes, positions);
      writeScalarsBack(nodes.angleIndex, nodes.angle, angles);
      writeScalarsBack(nodes.radIndex, nodes.radius, radii);
    },
  };
}

const run = (s: Session, err: number): number => {
  s.flush();
  return err;
};

const slots = (pos: number[], ang: number[] = [], rad: number[] = []): LinkSlots => ({
  pos: Int32Array.from(pos),
  ang: Int32Array.from(ang),
  rad: Int32Array.from(rad),
});

// ── Positions only ───────────────────────────────────────────────────────────

export function applyDistanceConstraint(
  positions: Map<string, Point2>,
  posMasses: Map<string, number>,
  key1: string,
  key2: string,
  targetDist: number,
  stiffness = 1.0,
  preferredAxis?: Point2,
): number {
  const s = open(positions, posMasses);
  return run(
    s,
    C.applyDistanceConstraint(
      s.nodes,
      s.P(key1),
      s.P(key2),
      targetDist,
      stiffness,
      preferredAxis,
    ),
  );
}

export function applyDistanceToLineConstraint(
  positions: Map<string, Point2>,
  posMasses: Map<string, number>,
  keyStart: string,
  keyEnd: string,
  keyNode: string,
  targetDist: number,
  stiffness = 1.0,
): number {
  const s = open(positions, posMasses);
  return run(
    s,
    C.applyDistanceToLineConstraint(
      s.nodes,
      s.P(keyStart),
      s.P(keyEnd),
      s.P(keyNode),
      targetDist,
      stiffness,
    ),
  );
}

export function applySlideOnSegmentConstraint(
  positions: Map<string, Point2>,
  posMasses: Map<string, number>,
  keyStart: string,
  keyEnd: string,
  keyNode: string,
  stiffness = 1.0,
): number {
  const s = open(positions, posMasses);
  return run(
    s,
    C.applySlideOnSegmentConstraint(
      s.nodes,
      s.P(keyStart),
      s.P(keyEnd),
      s.P(keyNode),
      stiffness,
    ),
  );
}

export function applyFixedOnSegmentConstraint(
  positions: Map<string, Point2>,
  posMasses: Map<string, number>,
  keyStart: string,
  keyEnd: string,
  keyNode: string,
  t: number,
  stiffness = 1.0,
): number {
  const s = open(positions, posMasses);
  return run(
    s,
    C.applyFixedOnSegmentConstraint(
      s.nodes,
      s.P(keyStart),
      s.P(keyEnd),
      s.P(keyNode),
      t,
      stiffness,
    ),
  );
}

export function applyEqualLengthConstraint(
  positions: Map<string, Point2>,
  posMasses: Map<string, number>,
  s1: string,
  e1: string,
  s2: string,
  e2: string,
  stiffness = 1.0,
): number {
  const s = open(positions, posMasses);
  return run(
    s,
    C.applyEqualLengthConstraint(
      s.nodes,
      s.P(s1),
      s.P(e1),
      s.P(s2),
      s.P(e2),
      stiffness,
    ),
  );
}

export function applyAngleConstraint(
  positions: Map<string, Point2>,
  posMasses: Map<string, number>,
  s1: string,
  e1: string,
  s2: string,
  e2: string,
  flipStart: boolean,
  flipEnd: boolean,
  couterClockwise: boolean,
  targetAngle: number,
  stiffness = 1.0,
): number {
  const s = open(positions, posMasses);
  return run(
    s,
    C.applyAngleConstraint(
      s.nodes,
      s.P(s1),
      s.P(e1),
      s.P(s2),
      s.P(e2),
      flipStart,
      flipEnd,
      couterClockwise,
      targetAngle,
      stiffness,
    ),
  );
}

export function applyParallelConstraint(
  positions: Map<string, Point2>,
  posMasses: Map<string, number>,
  s1: string,
  e1: string,
  s2: string,
  e2: string,
  stiffness = 1.0,
): number {
  const s = open(positions, posMasses);
  return run(
    s,
    C.applyParallelConstraint(
      s.nodes,
      s.P(s1),
      s.P(e1),
      s.P(s2),
      s.P(e2),
      stiffness,
    ),
  );
}

export function applyNormalConstraint(
  positions: Map<string, Point2>,
  posMasses: Map<string, number>,
  s1: string,
  e1: string,
  s2: string,
  e2: string,
  stiffness = 1.0,
): number {
  const s = open(positions, posMasses);
  return run(
    s,
    C.applyNormalConstraint(
      s.nodes,
      s.P(s1),
      s.P(e1),
      s.P(s2),
      s.P(e2),
      stiffness,
    ),
  );
}

export function applyKeepOrientationConstraint(
  positions: Map<string, Point2>,
  posMasses: Map<string, number>,
  keyStart: string,
  keyEnd: string,
  direction: Point2,
  stiffness = 1.0,
): number {
  const s = open(positions, posMasses);
  return run(
    s,
    C.applyKeepOrientationConstraint(
      s.nodes,
      s.P(keyStart),
      s.P(keyEnd),
      direction,
      stiffness,
    ),
  );
}

export function applyHorizontalConstraint(
  positions: Map<string, Point2>,
  posMasses: Map<string, number>,
  keyStart: string,
  keyEnd: string,
  stiffness = 1.0,
): number {
  const s = open(positions, posMasses);
  return run(
    s,
    C.applyHorizontalConstraint(s.nodes, s.P(keyStart), s.P(keyEnd), stiffness),
  );
}

export function applyVerticalConstraint(
  positions: Map<string, Point2>,
  posMasses: Map<string, number>,
  keyStart: string,
  keyEnd: string,
  stiffness = 1.0,
): number {
  const s = open(positions, posMasses);
  return run(
    s,
    C.applyVerticalConstraint(s.nodes, s.P(keyStart), s.P(keyEnd), stiffness),
  );
}

export function applyMotorBeamConstraint(
  positions: Map<string, Point2>,
  posMasses: Map<string, number>,
  pivotKey: string,
  drivenKey: string,
  targetAngle: number,
  stiffness = 1.0,
): number {
  const s = open(positions, posMasses);
  return run(
    s,
    C.applyMotorBeamConstraint(
      s.nodes,
      s.P(pivotKey),
      s.P(drivenKey),
      targetAngle,
      stiffness,
    ),
  );
}

export function applyHandleGrabConstraint(
  positions: Map<string, Point2>,
  radii: Map<string, number>,
  posMasses: Map<string, number>,
  key: string,
  targetValue: Point2 | number,
  stiffness = 0.5,
  maxAmplitude = 10,
): number {
  const s = open(positions, posMasses, EMPTY_MAP(), radii);
  return run(
    s,
    C.applyHandleGrabConstraint(
      s.nodes,
      s.nodes.radius,
      s.P(key),
      s.R(key),
      targetValue,
      stiffness,
      maxAmplitude,
    ),
  );
}

// ── Radii (edition) ──────────────────────────────────────────────────────────

export function applyGearMeshingConstraint(
  positions: Map<string, Point2>,
  posMasses: Map<string, number>,
  radii: Map<string, number>,
  radMasses: Map<string, number>,
  g1: string,
  g2: string,
  rg1: string,
  rg2: string,
  stiffness = 1.0,
): number {
  const s = open(positions, posMasses, EMPTY_MAP(), radii, radMasses);
  return run(
    s,
    C.applyGearMeshingConstraint(
      s.nodes,
      s.P(g1),
      s.P(g2),
      s.R(rg1),
      s.R(rg2),
      stiffness,
    ),
  );
}

export function applyGearRatioConstraint(
  radii: Map<string, number>,
  radMasses: Map<string, number>,
  g1: string,
  g2: string,
  ratio: number,
  stiffness = 1.0,
): number {
  const s = open(new Map(), EMPTY_MAP(), EMPTY_MAP(), radii, radMasses);
  return run(
    s,
    C.applyGearRatioConstraint(s.nodes, s.R(g1), s.R(g2), ratio, stiffness),
  );
}

// ── Angles (simulation) ──────────────────────────────────────────────────────

export function applyMotorAngleConstraint(
  angles: Map<string, number>,
  angleKey: string,
  targetAngle: number,
  stiffness = 1.0,
): number {
  const s = open(new Map(), EMPTY_MAP(), angles);
  return run(
    s,
    C.applyMotorAngleConstraint(s.nodes, s.A(angleKey), targetAngle, stiffness),
  );
}

export function applyCoaxialAngleConstraint(
  angles: Map<string, number>,
  angleKey1: string,
  angleKey2: string,
  offset: number,
  stiffness = 1.0,
): number {
  const s = open(new Map(), EMPTY_MAP(), angles);
  return run(
    s,
    C.applyCoaxialAngleConstraint(
      s.nodes,
      s.A(angleKey1),
      s.A(angleKey2),
      offset,
      stiffness,
    ),
  );
}

export function applyGearMeshAngleConstraint(
  angles: Map<string, number>,
  angleKey1: string,
  angleKey2: string,
  r1: number,
  r2: number,
  theta1_0: number,
  theta2_0: number,
  alpha0: number,
  alpha: number,
  stiffness = 1.0,
): number {
  const s = open(new Map(), EMPTY_MAP(), angles);
  return run(
    s,
    C.applyGearMeshAngleConstraint(
      s.nodes,
      s.A(angleKey1),
      s.A(angleKey2),
      r1,
      r2,
      theta1_0,
      theta2_0,
      alpha0,
      alpha,
      stiffness,
    ),
  );
}


export function applyGearPerimeterPinConstraint(
  positions: Map<string, Point2>,
  posMasses: Map<string, number>,
  angles: Map<string, number>,
  nodeKey: string,
  centerKey: string,
  angleKey: string,
  radius: number,
  offset: number,
  stiffness = 1.0,
): number {
  const s = open(positions, posMasses, angles);
  return run(
    s,
    C.applyGearPerimeterPinConstraint(
      s.nodes,
      s.P(nodeKey),
      s.P(centerKey),
      s.A(angleKey),
      radius,
      offset,
      stiffness,
    ),
  );
}


export function applyBeamFollowsAngleConstraint(
  positions: Map<string, Point2>,
  posMasses: Map<string, number>,
  angles: Map<string, number>,
  pivotKey: string,
  drivenKey: string,
  angleKey: string,
  offset: number,
  stiffness = 1.0,
): number {
  const s = open(positions, posMasses, angles);
  return run(
    s,
    C.applyBeamFollowsAngleConstraint(
      s.nodes,
      s.P(pivotKey),
      s.P(drivenKey),
      s.A(angleKey),
      offset,
      stiffness,
    ),
  );
}

// ── Belts ────────────────────────────────────────────────────────────────────

export function applyBeltLengthConstraint(
  positions: Map<string, Point2>,
  posMasses: Map<string, number>,
  angles: Map<string, number>,
  link: Extract<Link, { type: "BeltLength" }>,
  stiffness = 1.0,
  radiiMap?: Map<string, number>,
  radMassesMap?: Map<string, number>,
): number {
  const s = open(
    positions,
    posMasses,
    angles,
    radiiMap ?? EMPTY_MAP(),
    radMassesMap ?? EMPTY_MAP(),
  );
  const linkSlots = resolve_slots([link], s.nodes)[0];
  return run(s, C.applyBeltLengthConstraint(s.nodes, linkSlots, link, stiffness));
}

export function applyBeltJunctionConstraint(
  positions: Map<string, Point2>,
  posMasses: Map<string, number>,
  nodeKey: string,
  gearPosKeys: string[],
  radii: number[],
  directions: boolean[],
  stiffness = 1.0,
  radiiMap?: Map<string, number>,
  radKeys?: string[],
): number {
  const s = open(
    positions,
    posMasses,
    EMPTY_MAP(),
    radiiMap ?? EMPTY_MAP(),
    EMPTY_MAP(),
  );
  return run(
    s,
    C.applyBeltJunctionConstraint(
      s.nodes,
      slots(
        [s.P(nodeKey), ...gearPosKeys.map((k) => s.P(k))],
        [],
        (radKeys ?? []).map((k) => s.R(k)),
      ),
      radii,
      directions,
      stiffness,
    ),
  );
}

export function applyBeltPinConstraint(
  positions: Map<string, Point2>,
  posMasses: Map<string, number>,
  angles: Map<string, number>,
  nodeKey: string,
  gearPosKeys: string[],
  radii: number[],
  directions: boolean[],
  refIndex: number,
  refAngleKey: string,
  s0: number,
  thetaRef0: number,
  wraps?: number[],
  disconnected?: boolean[],
  closed = true,
  startKey?: string,
  endKey?: string,
  stiffness = 1.0,
): number {
  const s = open(positions, posMasses, angles);
  return run(
    s,
    C.applyBeltPinConstraint(
      s.nodes,
      slots(
        [
          s.P(nodeKey),
          s.P(startKey),
          s.P(endKey),
          ...gearPosKeys.map((k) => s.P(k)),
        ],
        [s.A(refAngleKey)],
      ),
      radii,
      directions,
      refIndex,
      s0,
      thetaRef0,
      wraps,
      disconnected,
      closed,
      stiffness,
    ),
  );
}

export function applyBeltFollowsTangentConstraint(
  positions: Map<string, Point2>,
  posMasses: Map<string, number>,
  angles: Map<string, number>,
  pivotKey: string,
  drivenKey: string,
  gearPosKeys: string[],
  radii: number[],
  directions: boolean[],
  refIndex: number,
  refAngleKey: string,
  s0: number,
  thetaRef0: number,
  offset: number,
  disconnected?: boolean[],
  stiffness = 1.0,
): number {
  const s = open(positions, posMasses, angles);
  return run(
    s,
    C.applyBeltFollowsTangentConstraint(
      s.nodes,
      slots(
        [s.P(pivotKey), s.P(drivenKey), ...gearPosKeys.map((k) => s.P(k))],
        [s.A(refAngleKey)],
      ),
      radii,
      directions,
      refIndex,
      s0,
      thetaRef0,
      offset,
      disconnected,
      stiffness,
    ),
  );
}
