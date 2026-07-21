import { describe, expect, it } from "vitest";
import { Point2 } from "../../types/point2";
import type {
  GearElement,
  ID,
  MechanicalElement,
  PivotElement,
} from "../../types/element";
import type { CanvasState } from "../../types/canvas-state";
import { clamp_to_bounds } from "./hover-bounds";

const P = (x: number, y: number) => new Point2(x, y);
const AXLE = "ax" as ID;
const GEAR = "g" as ID;

const MECH: MechanicalElement[] = [
  {
    type: "pivot",
    id: AXLE,
    probes: [],
    overlays: {},
    position: P(0, 0),
    isGrounded: false,
    rotatingEdgesIDs: [],
    fixedGearsIDs: [GEAR],
    motor: undefined,
  } as PivotElement,
  {
    type: "gear",
    id: GEAR,
    probes: [],
    overlays: {},
    position: P(0, 0),
    angle: 0,
    radius: 40,
    parentAxleID: AXLE,
    fixedNodesBodyIDs: [],
    meshedGearsIDs: [],
    attachedBeltID: undefined,
  } as GearElement,
];

const placing = (
  startHover: Extract<CanvasState, { type: "PlacingBeltEnd" }>["startHover"],
  attachedGearsIDs: { id: ID; direction: boolean }[] = [],
): CanvasState => ({ type: "PlacingBeltEnd", startHover, attachedGearsIDs });

const ON_RIM = P(0, -40);

describe("clamp_to_bounds — extrémité de courroie hors de sa poulie", () => {
  // The gear the gesture started on joins `attachedGearsIDs` only at
  // finalisation, so the bound has to read it from `startHover`.
  it("repousse le bout hors de la poulie de départ, avant tout routage", () => {
    const state = placing({
      type: "GearTooth",
      id: GEAR,
      position: ON_RIM,
      deleting: false,
    });
    const bounded = clamp_to_bounds(P(10, 0), state, MECH);
    expect(bounded.length()).toBeCloseTo(40);
    expect(bounded.angle()).toBeCloseTo(0);
  });

  it("laisse passer un bout déjà hors de la poulie", () => {
    const state = placing({
      type: "GearTooth",
      id: GEAR,
      position: ON_RIM,
      deleting: false,
    });
    expect(clamp_to_bounds(P(200, 0), state, MECH)).toEqual(P(200, 0));
  });

  // No pulley at all: the belt is a plain span and answers to the minimum edge
  // length instead.
  it("garde la longueur minimale quand le départ n'est pas sur une poulie", () => {
    const state = placing({ type: "Void", position: P(0, 0) });
    expect(clamp_to_bounds(P(1, 0), state, MECH).length()).toBeGreaterThan(1);
  });

  it("prend la dernière poulie routée plutôt que celle du départ", () => {
    const state = placing(
      { type: "GearTooth", id: GEAR, position: ON_RIM, deleting: false },
      [{ id: GEAR, direction: false }],
    );
    expect(clamp_to_bounds(P(10, 0), state, MECH).length()).toBeCloseTo(40);
  });
});
