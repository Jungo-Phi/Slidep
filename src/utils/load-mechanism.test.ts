import { describe, expect, it } from "vitest";
import { load_mechanism } from "./load-mechanism";
import { serialize_mechanism } from "./serialization";
import { DEFAULT_METADATA, Mechanism } from "../types/mechanism";
import { Point2 } from "../types/point2";
import { BeamElement, ConstraintElement, ID } from "../types";

const BEAM_ID = "00000000-0000-0000-0000-00000000b001" as ID;
const DIM_ID = "00000000-0000-0000-0000-00000000d001" as ID;

const beam: BeamElement = {
  type: "beam",
  id: BEAM_ID,
  probes: [],
  overlays: {},
  positionStart: new Point2(0, 0),
  positionEnd: new Point2(10, 0),
  fixedNodeStartID: undefined,
  fixedNodeEndID: undefined,
  fixedNodesBodyIDs: [],
};

/** A cote whose label the solver has driven to `NaN`, as a degenerate frame does. */
const brokenDimension = {
  type: "dimension-angle",
  id: DIM_ID,
  position: new Point2(NaN, NaN),
  startEdgeID: BEAM_ID,
  endEdgeID: BEAM_ID,
  flipStart: false,
  flipEnd: false,
  couterClockwise: true,
  value: 135,
} as ConstraintElement;

const mechanism: Mechanism = {
  metadata: DEFAULT_METADATA,
  viewport: { scale: 1, pan: new Point2(0, 0) },
  mechanicalElements: [beam],
  constraintElements: [brokenDimension],
  loads: [],
  history: [],
  future: [],
};

describe("load_mechanism", () => {
  // `JSON.stringify` writes NaN as `null`, and a `{x: null, y: null}` left as a
  // plain object throws on the first `Point2` method the canvas calls.
  it("brings a point back as a Point2 even when the file stored it as null", () => {
    const stored = JSON.parse(JSON.stringify(serialize_mechanism(mechanism)));
    expect(stored.constraintElements[0].position).toEqual({
      x: null,
      y: null,
    });

    const { mechanism: loaded, repairs } = load_mechanism(stored);
    const position = (loaded.constraintElements[0] as { position: Point2 })
      .position;
    expect(position).toBeInstanceOf(Point2);
    expect(position).toEqual(new Point2(0, 0));
    expect(repairs.map((r) => r.code)).toEqual(["POINT_RESET"]);
  });
});
