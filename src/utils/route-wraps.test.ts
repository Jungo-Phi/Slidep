import { describe, expect, it } from "vitest";
import { Point2 } from "../types/point2";
import type { GearElement, ID } from "../types/element";
import { route_wraps } from "./belt-geom";

const P = (x: number, y: number) => new Point2(x, y);
const gear = (x: number): GearElement => ({
  type: "gear",
  id: `g${x}` as ID,
  probes: [],
  overlays: {},
  position: P(x, 0),
  angle: 0,
  radius: 40,
  parentAxleID: "ax" as ID,
  fixedNodesBodyIDs: [],
  meshedGearsIDs: [],
  attachedBeltID: undefined,
  surfaceMass: 1,
});
const START = P(-150, 100);
const END = P(450, 100);

describe("the wraps a route is drawn with in edition", () => {
  it("leaves the geometry alone when no pulley carries a turn", () => {
    expect(route_wraps(START, [{ gear: gear(0), clockwise: true }], END, false)).toBeUndefined();
  });

  it("keeps each pulley's own turns when a gesture slips another pulley into the route", () => {
    const wound = { gear: gear(0), clockwise: true, turns: 2 };
    const previewed = { gear: gear(300), clockwise: true };
    const [first, second] = route_wraps(START, [wound, previewed], END, false)!;
    expect(first).toBeGreaterThan(4 * Math.PI);
    expect(second).toBeLessThan(2 * Math.PI);
    const [alone] = route_wraps(START, [wound], END, false)!;
    expect(alone).toBeGreaterThan(4 * Math.PI);
  });

  it("holds a pulley a drag has just caught to the wrap traced there, not to a whole turn short of it", () => {
    const route = [{ gear: gear(0), clockwise: true }];
    const [geometry] = route_wraps(START, [{ ...route[0], turns: 1 }], END, false)!.map((w) => w - 2 * Math.PI);
    // Traced where it is drawn: left as the geometry shows it.
    expect(route_wraps(START, route, END, false, { index: 0, traced: geometry })![0]).toBeCloseTo(geometry, 12);
    // Traced more than a half-turn away: the drawing lags the trace across tangency, and shows no wrap.
    expect(route_wraps(START, route, END, false, { index: 0, traced: geometry - Math.PI - 0.1 })![0]).toBe(0);
  });
});
