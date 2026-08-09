import { describe, expect, it } from "vitest";
import { Point2 } from "../../types/point2";
import type {
  BeamElement,
  ConstraintElement,
  GearElement,
  ID,
  MechanicalElement,
} from "../../types";
import type { CanvasState } from "../../types/canvas-state";
import type { ViewportState } from "../../types";
import { grid_snap_step } from "../../utils";
import { DEFAULT_SNAP_SETTINGS } from "./snap-corridor";
import { snap_dimension_position as snap_dim } from "./dimension-snap";

/**
 * The angle step the cases below are written against. Pinned rather than read
 * from the defaults: what they check is the snapping, not which step ships.
 */
const SETTINGS = { ...DEFAULT_SNAP_SETTINGS, angleStep: 15 };

/** The snapped position; no case below reads the feedback. */
const snap_dimension_position = (
  position: Point2,
  state: CanvasState,
  mech: MechanicalElement[],
  constraints: ConstraintElement[],
  view: ViewportState,
) => snap_dim(position, state, mech, constraints, view, SETTINGS).position;

const P = (x: number, y: number) => new Point2(x, y);
const VIEW: ViewportState = {
  scale: 1,
  pan: new Point2(0, 0).as_space<"screen">(),
};
const STEP = grid_snap_step(1);
const BEAM = "b" as ID;
const OTHER = "o" as ID;
const GEAR = "g" as ID;

const beam = (id: ID, start: Point2, end: Point2): BeamElement =>
  ({
    type: "beam",
    id,
    probes: [],
    overlays: {},
    positionStart: start,
    positionEnd: end,
    fixedNodesBodyIDs: [],
  }) as unknown as BeamElement;

const MECH: MechanicalElement[] = [
  beam(BEAM, P(0, 0), P(1000, 0)),
  beam(OTHER, P(0, 0), P(0, 1000)),
  {
    type: "gear",
    id: GEAR,
    probes: [],
    overlays: {},
    position: P(0, 0),
    angle: 0,
    radius: 200,
    parentAxleID: "ax" as ID,
    fixedNodesBodyIDs: [],
    meshedGearsIDs: [],
  } as unknown as GearElement,
];

const NONE: ConstraintElement[] = [];

describe("snap_dimension_position — cote linéaire", () => {
  const state: CanvasState = { type: "DimensionEdge", edgeID: BEAM };

  it("centre l'étiquette sur le milieu de ce qu'elle mesure", () => {
    const snapped = snap_dimension_position(
      P(504, 137),
      state,
      MECH,
      NONE,
      VIEW,
    );
    expect(snapped.x).toBeCloseTo(500);
  });

  // Half a grid step: a dimension line is annotation, not mechanism, and wants to
  // sit closer than a whole square while still lining up with its neighbours.
  it("aimante le déport sur des demi-pas de grille", () => {
    const snapped = snap_dimension_position(
      P(300, 146),
      state,
      MECH,
      NONE,
      VIEW,
    );
    expect(snapped.y).toBeCloseTo(1.5 * STEP);
    // Nothing near the middle, so the label keeps where it was along the bar.
    expect(snapped.x).toBeCloseTo(300);
  });

  it("laisse tout en place quand rien n'est à portée", () => {
    // A quarter of a step from either rung, and nowhere near mid-span.
    const raw = P(300, 175);
    expect(snap_dimension_position(raw, state, MECH, NONE, VIEW)).toEqual(raw);
  });
});

describe("snap_dimension_position — cote angulaire", () => {
  const state: CanvasState = {
    type: "DimensionAngle",
    startEdgeID: BEAM,
    endEdgeID: OTHER,
  };

  // Two bars at a right angle: the label belongs on the bisector, at 45°.
  it("pose l'étiquette sur la bissectrice", () => {
    const raw = Point2.from_polar(300, (44 * Math.PI) / 180);
    const snapped = snap_dimension_position(raw, state, MECH, NONE, VIEW);
    expect((snapped.angle() * 180) / Math.PI).toBeCloseTo(45, 6);
  });
});

describe("snap_dimension_position — cote de rayon", () => {
  const state: CanvasState = { type: "DimensionRadius", gearID: GEAR };

  // A radius has no middle; what reads as deliberate is the direction it points.
  it("aimante la direction sur un multiple de 15°", () => {
    const raw = Point2.from_polar(300, (29 * Math.PI) / 180);
    const snapped = snap_dimension_position(raw, state, MECH, NONE, VIEW);
    expect((snapped.angle() * 180) / Math.PI).toBeCloseTo(30, 6);
  });

  it("aimante la distance au centre sur la grille", () => {
    const raw = Point2.from_polar(297, 0);
    const snapped = snap_dimension_position(raw, state, MECH, NONE, VIEW);
    expect(snapped.length()).toBeCloseTo(3 * STEP);
  });
});

describe("snap_dimension_position — hors sujet", () => {
  it("ne touche à rien sous un autre geste", () => {
    const raw = P(504, 137);
    const other: CanvasState = { type: "PlacingPivot" };
    expect(snap_dimension_position(raw, other, MECH, NONE, VIEW)).toEqual(raw);
  });
});
