import { describe, expect, it } from "vitest";
import { Point2 } from "../../types/point2";
import type {
  BeamElement,
  GearElement,
  ID,
  MechanicalElement,
  PivotElement,
} from "../../types/element";
import type { CanvasState } from "../../types/canvas-state";
import type { ViewportState } from "../../types";
import { DIM } from "../../constants/rendering-specs";
import { clamp_to_bounds, out_of_sizing_reach } from "./hover-bounds";

const P = (x: number, y: number) => new Point2(x, y);
const AXLE = "ax" as ID;
const GEAR = "g" as ID;
const BEAM = "bm" as ID;
const VIEW: ViewportState = { scale: 1, pan: new Point2(0, 0) };

/** Zoomed out until any screen minimum is worth far more world than the fixtures measure. */
const FAR: ViewportState = { scale: 0.01, pan: new Point2(0, 0) };

const GEAR_RADIUS = 40;
const BEAM_LENGTH = 12;

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
    radius: GEAR_RADIUS,
    parentAxleID: AXLE,
    fixedNodesBodyIDs: [],
    meshedGearsIDs: [],
    attachedBeltID: undefined,
  } as GearElement,
  {
    type: "beam",
    id: BEAM,
    probes: [],
    overlays: {},
    positionStart: P(100, 0),
    positionEnd: P(100 + BEAM_LENGTH, 0),
    fixedNodeStartID: undefined,
    fixedNodeEndID: undefined,
    fixedNodesBodyIDs: [],
  } as BeamElement,
];

const placing = (
  startHover: Extract<CanvasState, { type: "PlacingBeltEnd" }>["startHover"],
  attachedGearsIDs: { id: ID; clockwise: boolean }[] = [],
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
    const bounded = clamp_to_bounds(P(10, 0), state, MECH, VIEW);
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
    expect(clamp_to_bounds(P(200, 0), state, MECH, VIEW)).toEqual(P(200, 0));
  });

  // No pulley at all: the belt is a plain span and answers to the minimum edge
  // length instead.
  it("garde la longueur minimale quand le départ n'est pas sur une poulie", () => {
    const state = placing({ type: "Void", position: P(0, 0) });
    expect(
      clamp_to_bounds(P(1, 0), state, MECH, VIEW).length(),
    ).toBeGreaterThan(1);
  });

  it("prend la dernière poulie routée plutôt que celle du départ", () => {
    const state = placing(
      { type: "GearTooth", id: GEAR, position: ON_RIM, deleting: false },
      [{ id: GEAR, clockwise: false }],
    );
    expect(clamp_to_bounds(P(10, 0), state, MECH, VIEW).length()).toBeCloseTo(
      40,
    );
  });
});

describe("clamp_to_bounds — les minima sont des distances écran", () => {
  const beam = (): CanvasState => ({
    type: "PlacingBeamEnd",
    startHover: { type: "Void", position: P(0, 0) },
  });

  it("garde la même longueur minimale à l'écran quel que soit le zoom", () => {
    for (const scale of [0.25, 1, 8]) {
      const view: ViewportState = { scale, pan: new Point2(0, 0) };
      const bounded = clamp_to_bounds(P(1, 0), beam(), MECH, view);
      expect(bounded.length() * scale).toBeCloseTo(DIM.MIN_EDGE_LENGTH);
    }
  });

  // Zoomed in, a beam far shorter than the old world constant becomes something
  // one can legitimately draw — and the bound must let it through.
  it("laisse passer une barre courte en unités monde, une fois zoomé", () => {
    const view: ViewportState = { scale: 8, pan: new Point2(0, 0) };
    expect(clamp_to_bounds(P(10, 0), beam(), MECH, view)).toEqual(P(10, 0));
  });
});

/**
 * Dézoomé au point que le minimum écran vaut bien plus que ce que mesurent les
 * fixtures, le seul plancher qui reste est leur propre taille.
 */
describe("clamp_to_bounds — un minimum ne fait jamais grandir", () => {
  const sizing: CanvasState = { type: "ChangingGearRadius", elementID: GEAR };
  const draggingEnd: CanvasState = {
    type: "MovingEdgeEndPoint",
    elementID: BEAM,
  };

  it("ne repousse pas la jante au-delà du rayon que l'engrenage a déjà", () => {
    expect(
      clamp_to_bounds(P(GEAR_RADIUS / 2, 0), sizing, MECH, FAR).length(),
    ).toBeCloseTo(GEAR_RADIUS);
  });

  it("ne rallonge pas une barre plus courte que le minimum", () => {
    const bounded = clamp_to_bounds(P(102, 0), draggingEnd, MECH, FAR);
    expect(bounded.distance_to(P(100, 0))).toBeCloseTo(BEAM_LENGTH);
  });

  // Le plancher redescend avec le zoom : c'est ainsi qu'on récupère les petites
  // tailles, au lieu de les interdire une fois pour toutes.
  it("laisse rétrécir l'engrenage une fois zoomé", () => {
    const view: ViewportState = { scale: 8, pan: new Point2(0, 0) };
    expect(clamp_to_bounds(P(10, 0), sizing, MECH, view)).toEqual(P(10, 0));
  });

  // Rien en main, rien à cliqueter : la pose répond au minimum écran entier, là
  // où le redimensionnement au même zoom se serait arrêté au rayon courant.
  it("pose un engrenage neuf sans rien à cliqueter", () => {
    const placingGear: CanvasState = {
      type: "PlacingGearRadius",
      startHover: { type: "Void", position: P(0, 0) },
    };
    expect(
      clamp_to_bounds(P(1, 0), placingGear, MECH, FAR).length(),
    ).toBeGreaterThan(GEAR_RADIUS);
  });
});

describe("out_of_sizing_reach", () => {
  const sizing: CanvasState = { type: "ChangingGearRadius", elementID: GEAR };
  const placingGear: CanvasState = {
    type: "PlacingGearRadius",
    startHover: { type: "Void", position: P(0, 0) },
  };
  const reach = (target: Point2, state: CanvasState, view = FAR) =>
    out_of_sizing_reach(target, state, MECH, view);

  it("refuse une cible plus proche que le rayon déjà atteint", () => {
    expect(reach(P(GEAR_RADIUS - 1, 0), sizing)).toBe(true);
    expect(reach(P(GEAR_RADIUS + 1, 0), sizing)).toBe(false);
  });

  it("refuse une cible posée sur le centre, quel que soit le zoom", () => {
    for (const scale of [0.25, 1, 8]) {
      const view: ViewportState = { scale, pan: new Point2(0, 0) };
      expect(reach(P(0, 0), sizing, view)).toBe(true);
      expect(reach(P(0, 0), placingGear, view)).toBe(true);
    }
  });

  it("ne concerne pas les gestes qui ne dimensionnent pas", () => {
    expect(reach(P(0, 0), { type: "MovingNode", elementID: GEAR })).toBe(false);
  });
});
