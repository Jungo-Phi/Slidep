import { describe, expect, it } from "vitest";
import { resolveGeometricConstraints } from "./geometric-solver";
import { DEFAULT_METADATA, Mechanism } from "../../types/mechanism";
import { Point2 } from "../../types/point2";
import {
  BeamElement,
  ConstraintElement,
  ID,
  PivotElement,
} from "../../types/element";

const BEAM = "00000000-0000-0000-0000-0000000000b1" as ID;
const NODE = "00000000-0000-0000-0000-0000000000p1" as ID;
const DIM = "00000000-0000-0000-0000-0000000000d1" as ID;

const beam: BeamElement = {
  type: "beam",
  id: BEAM,
  probes: [],
  overlays: {},
  positionStart: new Point2(0, 0),
  positionEnd: new Point2(100, 0),
  fixedNodeStartID: undefined,
  fixedNodeEndID: undefined,
  fixedNodesBodyIDs: [],
};

/** On the beam's own line, so the gap the label rides is zero. */
const node: PivotElement = {
  type: "pivot",
  id: NODE,
  probes: [],
  overlays: {},
  position: new Point2(50, 0),
  isGrounded: false,
  rotatingEdgesIDs: [],
  fixedGearsIDs: [],
};

const dimension = {
  type: "dimension-edge-to-node",
  id: DIM,
  position: new Point2(50, 20),
  edgeID: BEAM,
  nodeID: NODE,
  value: 0,
} as ConstraintElement;

const mechanism: Mechanism = {
  metadata: DEFAULT_METADATA,
  viewport: { scale: 1, pan: new Point2(0, 0) },
  mechanicalElements: [beam, node],
  constraintElements: [dimension],
  loads: [],
  history: [],
  future: [],
};

describe("constraint labels after a solve", () => {
  // The label's offset is rescaled by how the edge-to-node gap grew. A node
  // sitting on the edge gives a zero gap, and the ratio used to be 0/0.
  it("keeps a finite position when the dimensioned gap is zero", () => {
    const move = {
      type: "MoveNode",
      id: NODE,
      newPosition: new Point2(70, 0),
      oldPosition: new Point2(50, 0),
    } as never;

    const solved = resolveGeometricConstraints(
      mechanism,
      "MoveElement",
      move,
    ).positions.get(DIM);

    expect(solved).toBeDefined();
    expect(Number.isFinite(solved!.x)).toBe(true);
    expect(Number.isFinite(solved!.y)).toBe(true);
  });
});
