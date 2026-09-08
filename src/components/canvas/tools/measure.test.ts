import { describe, expect, it } from "vitest";
import { Point2 } from "../../../types/point2";
import type {
  BeamElement,
  HoveredPart,
  ID,
  MechanicalElement,
  GearElement,
  PivotElement,
} from "../../../types";
import {
  anchor_base,
  build_measure,
  measure_anchor,
  measure_readout,
  own_measure,
  ruler_step_back,
  shown_measure,
  whole_elements,
} from "./measure";

const P = (x: number, y: number) => new Point2(x, y);
const BEAM = "b" as ID;
const OTHER = "o" as ID;
const PIVOT = "p" as ID;
const GEAR = "g" as ID;
const GEAR2 = "g2" as ID;

const beam = (id: ID, start: Point2, end: Point2): BeamElement =>
  ({
    type: "beam",
    id,
    probes: [],
    overlays: {},
    positionStart: start,
    positionEnd: end,
  }) as unknown as BeamElement;

const pivot = (position: Point2): PivotElement =>
  ({
    type: "pivot",
    id: PIVOT,
    probes: [],
    overlays: {},
    position,
    isGrounded: false,
  }) as unknown as PivotElement;

const gear = (id: ID, position: Point2, radius: number): GearElement =>
  ({
    type: "gear",
    id,
    probes: [],
    overlays: {},
    position,
    angle: 0,
    radius,
    fixedNodesBodyIDs: [],
    meshedGearsIDs: [],
  }) as unknown as GearElement;

const onRim = (id: ID, p: Point2): HoveredPart => ({
  type: "GearTooth",
  position: p,
  id,
  deleting: false,
});

const onBody = (id: ID, p: Point2): HoveredPart => ({
  type: "Edge",
  position: p,
  id,
  deleting: false,
  part: "body",
});
const onEnd = (id: ID, p: Point2): HoveredPart => ({
  type: "Edge",
  position: p,
  id,
  deleting: false,
  part: "end",
});
const onNode = (p: Point2): HoveredPart => ({
  type: "Node",
  position: p,
  id: PIVOT,
  deleting: false,
  beamBodyHover: false,
});
const onVoid = (p: Point2): HoveredPart => ({ type: "Void", position: p });

/** Two bars meeting at the origin, opening 45° between the +x and the diagonal. */
const CORNER: MechanicalElement[] = [
  beam(BEAM, P(0, 0), P(100, 0)),
  beam(OTHER, P(0, 0), P(100, 100)),
];

describe("what an end holds on to", () => {
  it("reads back the point it was laid on", () => {
    const mech: MechanicalElement[] = [beam(BEAM, P(0, 0), P(100, 0))];
    const anchor = measure_anchor(onBody(BEAM, P(25, 0)), mech);
    expect(anchor_base(anchor, mech)).toEqual(P(25, 0));
  });

  it("follows the element it was laid on when that element moves", () => {
    const anchor = measure_anchor(onBody(BEAM, P(25, 0)), [
      beam(BEAM, P(0, 0), P(100, 0)),
    ]);
    // Same bar, turned a quarter turn about its start: a quarter along it is now up.
    expect(anchor_base(anchor, [beam(BEAM, P(0, 0), P(0, 100))])).toEqual(
      P(0, 25),
    );
  });

  it("keeps its own point when laid on empty space", () => {
    const anchor = measure_anchor(onVoid(P(7, 9)), []);
    expect(anchor_base(anchor, [])).toEqual(P(7, 9));
  });

  it("goes quiet when what it held is gone", () => {
    const anchor = measure_anchor(onNode(P(5, 5)), [pivot(P(5, 5))]);
    expect(anchor_base(anchor, [])).toBeUndefined();
  });
});

describe("what the second click builds", () => {
  it("spans two points, reporting the span, its components and its direction", () => {
    const mech: MechanicalElement[] = [pivot(P(0, 0))];
    const measure = build_measure(
      measure_anchor(onNode(P(0, 0)), mech),
      onVoid(P(30, 40)),
      mech,
    );
    const readout = measure_readout(measure, mech);
    expect(readout).toEqual({
      kind: "distance",
      distance: 50,
      dx: 30,
      dy: 40,
      angle: Math.atan2(40, 30),
    });
  });

  it("reads the angle between two bars aimed at by their bodies", () => {
    const measure = build_measure(
      measure_anchor(onBody(BEAM, P(60, 0)), CORNER),
      onBody(OTHER, P(60, 60)),
      CORNER,
    );
    expect(measure.kind).toBe("angle");
    const readout = measure_readout(measure, CORNER);
    expect(readout).toMatchObject({ kind: "angle" });
    expect(readout).toMatchObject({ angle: expect.closeTo(Math.PI / 4) });
  });

  it("opens its arc out to the point aimed at, not halfway to it", () => {
    // Both bars run from the origin, so the vertex is there and the second click is 60√2 out.
    const measure = build_measure(
      measure_anchor(onBody(BEAM, P(20, 0)), CORNER),
      onBody(OTHER, P(60, 60)),
      CORNER,
    );
    expect(measure).toMatchObject({
      kind: "angle",
      radius: expect.closeTo(Math.hypot(60, 60)),
    });
  });

  it("holds the angle open on its own side as the bars swing", () => {
    const measure = build_measure(
      measure_anchor(onBody(BEAM, P(60, 0)), CORNER),
      onBody(OTHER, P(60, 60)),
      CORNER,
    );
    // The second bar swung up to the vertical: the same corner now opens 90°, not 270°.
    const swung: MechanicalElement[] = [
      beam(BEAM, P(0, 0), P(100, 0)),
      beam(OTHER, P(0, 0), P(0, 100)),
    ];
    expect(measure_readout(measure, swung)).toMatchObject({
      angle: expect.closeTo(Math.PI / 2),
    });
  });

  it("measures a bar end to end when the same bar is clicked twice", () => {
    const measure = build_measure(
      measure_anchor(onBody(BEAM, P(25, 0)), CORNER),
      onBody(BEAM, P(75, 0)),
      CORNER,
    );
    const readout = measure_readout(measure, CORNER);
    expect(readout?.kind).toBe("distance");
    expect(readout).toMatchObject({ distance: 100 });
  });

  it("spans two points rather than an angle when an end of a bar is aimed at", () => {
    const measure = build_measure(
      measure_anchor(onBody(BEAM, P(60, 0)), CORNER),
      onEnd(OTHER, P(100, 100)),
      CORNER,
    );
    expect(measure.kind).toBe("distance");
  });

  it("falls back to a span between two parallel bars, which meet nowhere", () => {
    const parallel: MechanicalElement[] = [
      beam(BEAM, P(0, 0), P(100, 0)),
      beam(OTHER, P(0, 50), P(100, 50)),
    ];
    const measure = build_measure(
      measure_anchor(onBody(BEAM, P(40, 0)), parallel),
      onBody(OTHER, P(40, 50)),
      parallel,
    );
    expect(measure.kind).toBe("distance");
    expect(measure_readout(measure, parallel)).toMatchObject({ distance: 50 });
  });
});

describe("what the ruler shows", () => {
  it("previews exactly the reading the next click would seal", () => {
    const start = measure_anchor(onBody(BEAM, P(60, 0)), CORNER);
    const hover = onBody(OTHER, P(60, 60));
    expect(shown_measure({ type: "MeasuringFrom", start }, hover, CORNER)).toEqual(
      build_measure(start, hover, CORNER),
    );
  });

  it("shows nothing while the ruler is only out", () => {
    expect(
      shown_measure({ type: "Measuring" }, onVoid(P(0, 0)), CORNER),
    ).toBeUndefined();
  });
});

describe("climbing back out of the ruler", () => {
  it("drops the reading before the instrument", () => {
    const start = measure_anchor(onBody(BEAM, P(60, 0)), CORNER);
    expect(ruler_step_back({ type: "MeasuringFrom", start })).toEqual({
      type: "Measuring",
    });
    expect(
      ruler_step_back({
        type: "Measured",
        measure: build_measure(start, onVoid(P(0, 60)), CORNER),
      }),
    ).toEqual({ type: "Measuring" });
    expect(ruler_step_back({ type: "Measuring" })).toEqual({
      type: "Selecting",
    });
  });

  it("answers nothing where the ruler is not out", () => {
    expect(ruler_step_back({ type: "Selecting" })).toBeUndefined();
  });
});

describe("a gear, which is held by its rim", () => {
  const MESHED: MechanicalElement[] = [
    gear(GEAR, P(0, 0), 40),
    gear(GEAR2, P(100, 0), 30),
  ];

  it("measures the gap between two rims, not between two centres", () => {
    const measure = build_measure(
      measure_anchor(onRim(GEAR, P(40, 0)), MESHED),
      onRim(GEAR2, P(70, 0)),
      MESHED,
    );
    // 100 between the centres, less the two radii.
    expect(measure_readout(measure, MESHED)).toMatchObject({ distance: 30 });
  });

  it("reports rims that have sunk into each other as a negative gap", () => {
    const overlapping: MechanicalElement[] = [
      gear(GEAR, P(0, 0), 40),
      gear(GEAR2, P(60, 0), 30),
    ];
    const measure = build_measure(
      measure_anchor(onRim(GEAR, P(40, 0)), overlapping),
      onRim(GEAR2, P(30, 0)),
      overlapping,
    );
    // 60 between the centres against 70 of radii: they interfere by 10, which must not read like a gap of 10.
    expect(measure_readout(measure, overlapping)).toMatchObject({
      kind: "distance",
      distance: -10,
    });
  });

  it("keeps a plain span positive however its two ends are ordered", () => {
    const mech: MechanicalElement[] = [pivot(P(0, 0))];
    const measure = build_measure(
      measure_anchor(onNode(P(0, 0)), mech),
      onVoid(P(-30, -40)),
      mech,
    );
    expect(measure_readout(measure, mech)).toMatchObject({ distance: 50 });
  });

  it("measures from the rim point facing the other end, wherever the rim was clicked", () => {
    const mech: MechanicalElement[] = [gear(GEAR, P(0, 0), 40), pivot(P(0, 100))];
    // Aimed at the bottom of the rim, but read from the top: the pivot is up there.
    const measure = build_measure(
      measure_anchor(onRim(GEAR, P(0, -40)), mech),
      onNode(P(0, 100)),
      mech,
    );
    expect(measure_readout(measure, mech)).toMatchObject({ distance: 60 });
  });

  it("gives its radius when the same gear is clicked twice", () => {
    const measure = build_measure(
      measure_anchor(onRim(GEAR, P(40, 0)), MESHED),
      onRim(GEAR, P(-40, 0)),
      MESHED,
    );
    expect(measure_readout(measure, MESHED)).toEqual({
      kind: "radius",
      radius: 40,
    });
  });
});

describe("what an element reads of itself", () => {
  const mech: MechanicalElement[] = [
    beam(BEAM, P(0, 0), P(100, 0)),
    gear(GEAR, P(0, 0), 40),
    pivot(P(5, 5)),
  ];

  it("gives a bar its length and a gear its radius", () => {
    expect(measure_readout(own_measure(onBody(BEAM, P(25, 0)), mech)!, mech)).toMatchObject({
      distance: 100,
    });
    expect(measure_readout(own_measure(onRim(GEAR, P(40, 0)), mech)!, mech)).toEqual({
      kind: "radius",
      radius: 40,
    });
  });

  it("is what clicking that element twice would seal", () => {
    const twice = build_measure(
      measure_anchor(onBody(BEAM, P(25, 0)), mech),
      onBody(BEAM, P(75, 0)),
      mech,
    );
    expect(own_measure(onBody(BEAM, P(25, 0)), mech)).toEqual(twice);
  });

  it("says nothing of a node, which has no size of its own", () => {
    expect(own_measure(onNode(P(5, 5)), mech)).toBeUndefined();
  });
});

describe("what a reading takes whole", () => {
  const MESHED: MechanicalElement[] = [
    gear(GEAR, P(0, 0), 40),
    gear(GEAR2, P(100, 0), 30),
    ...CORNER,
    pivot(P(5, 5)),
  ];
  const between = (from: HoveredPart, to: HoveredPart, mech = MESHED) =>
    whole_elements(build_measure(measure_anchor(from, mech), to, mech));

  it("takes a gear whole, whatever it is measured against", () => {
    expect(between(onRim(GEAR, P(40, 0)), onRim(GEAR2, P(70, 0)))).toEqual([
      GEAR,
      GEAR2,
    ]);
    expect(between(onRim(GEAR, P(40, 0)), onNode(P(5, 5)))).toEqual([
      GEAR,
      PIVOT,
    ]);
    expect(between(onRim(GEAR, P(40, 0)), onRim(GEAR, P(-40, 0)))).toEqual([
      GEAR,
    ]);
  });

  it("takes both bars whole for an angle", () => {
    expect(between(onBody(BEAM, P(60, 0)), onBody(OTHER, P(60, 60)))).toEqual([
      BEAM,
      OTHER,
    ]);
  });

  it("takes a bar whole only for its own length", () => {
    expect(between(onBody(BEAM, P(25, 0)), onBody(BEAM, P(75, 0)))).toEqual([
      BEAM,
    ]);
    // A point of that same bar is a point, not the bar — the node at the other end is a point in itself, so it is taken whole.
    expect(between(onBody(BEAM, P(25, 0)), onNode(P(5, 5)))).toEqual([PIVOT]);
  });
});
