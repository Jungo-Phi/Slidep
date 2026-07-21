import { describe, expect, it } from "vitest";
import { separation_links } from "./disconnect-separation";
import { applyDistanceConstraint } from "./constraint-functions";
import { DIM } from "../../constants/rendering-specs";
import { Point2 } from "../../types/point2";
import { DEFAULT_METADATA, Mechanism } from "../../types/mechanism";
import type { Action, ID, MechanicalElement } from "../../types";

const P = (x: number, y: number) => new Point2(x, y);
const id = (s: string) => s as ID;

const JOIN = id("j1");
const BELT = id("blt");
const PIVOT = id("p1");
const BEAM = id("bm1");

function mechanism(mechanicalElements: MechanicalElement[]): Mechanism {
  return {
    metadata: DEFAULT_METADATA,
    viewport: { zoom: 1, pan: P(0, 0) },
    mechanicalElements,
    constraintElements: [],
    loads: [],
    history: [],
    future: [],
  };
}

const pivot = (elementID: ID, at = P(0, 0)): MechanicalElement => ({
  type: "pivot",
  id: elementID,
  probes: [],
  overlays: {},
  position: at,
  isGrounded: false,
  rotatingEdgesIDs: [],
  fixedGearsIDs: [],
  motor: undefined,
});

const gear = (
  elementID: ID,
  at: Point2,
  radius: number,
): MechanicalElement => ({
  type: "gear",
  id: elementID,
  probes: [],
  overlays: {},
  position: at,
  angle: 0,
  radius,
  parentAxleID: id("ax"),
  fixedNodesBodyIDs: [],
  meshedGearsIDs: [],
  attachedBeltID: undefined,
});

const detach = (
  type: "ConnectsFixedNodeStart" | "ConnectsFixedNodeEnd",
  elementID: ID,
  connectID: ID,
): Action => ({ type, disconnect: true, elementID, connectID });

describe("separation_links", () => {
  it("parts a freed edge end from the node it stays superposed with", () => {
    const links = separation_links(
      [detach("ConnectsFixedNodeStart", BEAM, PIVOT)],
      mechanism([pivot(PIVOT)]),
    );
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      type: "Distance",
      key1: `${BEAM}:start`,
      key2: `${PIVOT}`,
      distance: DIM.DISCONNECT_SEPARATION,
    });
  });

  // The junction removed from under a closed belt: it cannot be the reference it
  // no longer exists, so the two terminals must part from each other.
  it("parts the survivors pairwise when their partner is deleted", () => {
    const join = pivot(JOIN);
    const links = separation_links(
      [
        detach("ConnectsFixedNodeStart", BELT, JOIN),
        detach("ConnectsFixedNodeEnd", BELT, JOIN),
        { type: "DeleteElement", element: join },
      ],
      mechanism([join]),
    );
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      key1: `${BELT}:start`,
      key2: `${BELT}:end`,
    });
  });

  it("ignores a connection being made rather than broken", () => {
    const links = separation_links(
      [
        {
          type: "ConnectsFixedNodeStart",
          disconnect: false,
          elementID: BEAM,
          connectID: PIVOT,
        },
      ],
      mechanism([pivot(PIVOT)]),
    );
    expect(links).toHaveLength(0);
  });

  // Meshed rims meet at r1+r2; parting the centres past that gap lifts the rims
  // apart. Both gears carry the connection, so the reciprocal must not double it.
  it("parts meshed gear centres past their touching gap, once", () => {
    const g1 = id("g1");
    const g2 = id("g2");
    const links = separation_links(
      [
        {
          type: "ConnectsMeshedGears",
          disconnect: true,
          elementID: g1,
          connectID: g2,
          index: 0,
        },
        {
          type: "ConnectsMeshedGears",
          disconnect: true,
          elementID: g2,
          connectID: g1,
          index: 0,
        },
      ],
      mechanism([gear(g1, P(0, 0), 30), gear(g2, P(50, 0), 20)]),
    );
    expect(links).toHaveLength(1);
    const link = links[0];
    expect(link.type).toBe("Distance");
    if (link.type !== "Distance") throw new Error("unreachable");
    expect(link.distance).toBe(50 + DIM.DISCONNECT_SEPARATION);
    expect([link.key1, link.key2].sort()).toEqual([`${g1}`, `${g2}`]);
  });

  it("skips meshed separation when a gear is deleted", () => {
    const g1 = id("g1");
    const g2 = id("g2");
    const links = separation_links(
      [
        {
          type: "ConnectsMeshedGears",
          disconnect: true,
          elementID: g1,
          connectID: g2,
          index: 0,
        },
        { type: "DeleteElement", element: gear(g2, P(50, 0), 20) },
      ],
      mechanism([gear(g1, P(0, 0), 30)]),
    );
    expect(links).toHaveLength(0);
  });

  // A body node on a beam lifts off perpendicular; the beam normal is the
  // solver's own degenerate direction, so a DistanceToLine link is enough.
  it("lifts a body node off the beam along its normal", () => {
    const node = id("n1");
    const links = separation_links(
      [
        {
          type: "ConnectsFixedNodesBody",
          disconnect: true,
          elementID: BEAM,
          connectID: node,
          index: 0,
        },
      ],
      mechanism([pivot(node), pivot(BEAM)]),
    );
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      type: "DistanceToLine",
      key1: `${BEAM}:start`,
      key2: `${BEAM}:end`,
      key3: `${node}`,
      distance: DIM.DISCONNECT_SEPARATION,
    });
  });

  // The node-side reciprocal (the node's edge list) names no contact geometry,
  // so it must not add a second, spurious separation.
  it("ignores the node-side reciprocal of an edge disconnection", () => {
    const links = separation_links(
      [
        {
          type: "ConnectsRotatingEdges",
          disconnect: true,
          elementID: PIVOT,
          connectID: BEAM,
          index: 0,
        },
      ],
      mechanism([pivot(PIVOT)]),
    );
    expect(links).toHaveLength(0);
  });
});

describe("applyDistanceConstraint on coincident points", () => {
  const run = (preferredAxis?: Point2) => {
    const positions = new Map([
      ["a", P(100, 100)],
      ["b", P(100, 100)],
    ]);
    const masses = new Map([
      ["a", 1],
      ["b", 1],
    ]);
    applyDistanceConstraint(
      positions,
      masses,
      "a",
      "b",
      20,
      1.0,
      preferredAxis,
    );
    return positions;
  };

  it("parts them along the preferred axis, symmetrically", () => {
    const positions = run(P(1, 0));
    expect(positions.get("a")!.x).toBeCloseTo(90);
    expect(positions.get("b")!.x).toBeCloseTo(110);
    expect(positions.get("a")!.distance_to(positions.get("b")!)).toBeCloseTo(
      20,
    );
  });

  it("falls back to a fixed axis when none is preferred", () => {
    const positions = run();
    expect(positions.get("a")!.distance_to(positions.get("b")!)).toBeCloseTo(
      20,
    );
  });

  // Coincident *and* a zero target is already satisfied; the old early return
  // covered the division by zero that would otherwise poison both positions.
  it("leaves a satisfied zero-distance pair alone", () => {
    const positions = new Map([
      ["a", P(5, 5)],
      ["b", P(5, 5)],
    ]);
    const masses = new Map([
      ["a", 1],
      ["b", 1],
    ]);
    applyDistanceConstraint(positions, masses, "a", "b", 0);
    expect(positions.get("a")).toEqual(P(5, 5));
    expect(positions.get("b")).toEqual(P(5, 5));
  });
});
