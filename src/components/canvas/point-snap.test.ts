import { describe, expect, it } from "vitest";
import { Point2 } from "../../types/point2";
import type { BeamElement, ID, MechanicalElement } from "../../types/element";
import type { CanvasState } from "../../types/canvas-state";
import type { HoveredPart, ViewportState } from "../../types";
import { grid_snap_step } from "../../utils";
import { DEFAULT_SNAP_SETTINGS } from "./snap-corridor";
import { snap_hover } from "./point-snap";
import type { HoveredPart as Hovered } from "../../types";

/**
 * The angle step the cases below are written against. Pinned rather than read
 * from the defaults: what they check is the snapping, not which step ships.
 */
const SETTINGS = { ...DEFAULT_SNAP_SETTINGS, angleStep: 15 };

const snap = (
  hovered: Hovered,
  state: CanvasState,
  mech: MechanicalElement[],
  view: ViewportState,
) => snap_hover(hovered, state, mech, view, SETTINGS);

/** Its position alone, for the cases that say nothing about the feedback. */
const snapped_at = (...args: Parameters<typeof snap>) => snap(...args).position;

const P = (x: number, y: number) => new Point2(x, y);
const BEAM = "b" as ID;
const VIEW: ViewportState = { scale: 1, pan: P(0, 0).as_space<"screen">() };
/** At scale 1 the snapped lines fall every 100 world units. */
const STEP = grid_snap_step(1);

const beam = (start: Point2, end: Point2): BeamElement =>
  ({
    type: "beam",
    id: BEAM,
    probes: [],
    overlays: {},
    positionStart: start,
    positionEnd: end,
    fixedNodeStartID: undefined,
    fixedNodeEndID: undefined,
    fixedNodesBodyIDs: [],
  }) as unknown as BeamElement;

const MECH: MechanicalElement[] = [beam(P(0, 0), P(1000, 0))];

const voidAt = (p: Point2): HoveredPart => ({ type: "Void", position: p });
const onBody = (p: Point2): HoveredPart => ({
  type: "Edge",
  position: p,
  id: BEAM,
  deleting: false,
  part: "body",
});

describe("grid_snap_step", () => {
  it("garde les lignes visées entre 50 et 125 px à tout zoom", () => {
    for (let e = -3; e <= 3; e += 0.05) {
      const scale = 10 ** e;
      const spacing = grid_snap_step(scale) * scale;
      expect(spacing).toBeGreaterThan(49);
      expect(spacing).toBeLessThan(127);
    }
  });
});

describe("snap_hover /point libre", () => {
  const state: CanvasState = { type: "PlacingPivot" };

  it("aimante chaque axe séparément", () => {
    const snapped = snapped_at(voidAt(P(97, 212)), state, MECH, VIEW);
    expect(snapped.x).toBeCloseTo(STEP);
    expect(snapped.y).toBeCloseTo(212);
  });

  it("ne touche pas à un état qui vise un élément", () => {
    const aiming: CanvasState = { type: "PlacingProbe" };
    expect(snapped_at(voidAt(P(97, 97)), aiming, MECH, VIEW)).toEqual(
      P(97, 97),
    );
  });
});

describe("snap_hover /rayon", () => {
  const state: CanvasState = {
    type: "PlacingGearRadius",
    startHover: voidAt(P(0, 0)),
  };

  // Rounding x and y apart would round everything except the radius, which is
  // the only quantity the gesture produces.
  it("aimante la distance au centre, pas les coordonnées", () => {
    const snapped = snapped_at(voidAt(P(0, -104)), state, MECH, VIEW);
    expect(snapped.length()).toBeCloseTo(STEP);
    expect(snapped.angle()).toBeCloseTo(P(0, -1).angle());
  });

  it("laisse la direction oblique intacte", () => {
    const raw = P(3, 4).mul(104 / 5);
    const snapped = snapped_at(voidAt(raw), state, MECH, VIEW);
    expect(snapped.length()).toBeCloseTo(STEP);
    expect(snapped.angle()).toBeCloseTo(raw.angle());
  });
});

describe("snap_hover /survol glissant", () => {
  const state: CanvasState = { type: "PlacingPivot" };

  it("aimante le point sur le croisement de la barre et de la grille", () => {
    const snapped = snapped_at(onBody(P(295, 0)), state, MECH, VIEW);
    expect(snapped.x).toBeCloseTo(3 * STEP);
    expect(snapped.y).toBeCloseTo(0);
  });

  it("laisse le point où il est quand aucun croisement n'est proche", () => {
    expect(snapped_at(onBody(P(247, 0)), state, MECH, VIEW).x).toBe(247);
  });

  // The family the bar runs parallel to is met at infinity; the tolerance has to
  // turn it away on its own, without a division blowing up first.
  it("ne se laisse pas emporter par la famille de lignes parallèle", () => {
    const vertical = [beam(P(0, 0), P(0, 1010))];
    const snapped = snapped_at(onBody(P(0, 247)), state, vertical, VIEW);
    expect(snapped).toEqual(P(0, 247));
  });

  it("préfère le milieu de la barre au croisement voisin", () => {
    const vertical = [beam(P(0, 0), P(0, 1010))];
    const snapped = snapped_at(onBody(P(0, 503)), state, vertical, VIEW);
    expect(snapped.y).toBeCloseTo(505);
  });
});

describe("snap_hover / angle", () => {
  /** A beam being drawn from the origin. */
  const placing: CanvasState = {
    type: "PlacingBeamEnd",
    startHover: voidAt(P(0, 0)),
  };
  const deg = (d: number) => (d * Math.PI) / 180;

  it("aimante la direction sur un multiple de 15°", () => {
    // 1,5° off 30°, i.e. 5 px across the ray at that distance — inside the lane.
    const raw = Point2.from_polar(200, deg(31.5));
    const snapped = snapped_at(voidAt(raw), placing, MECH, VIEW);
    expect(snapped.angle()).toBeCloseTo(deg(30), 9);
  });

  it("laisse la direction libre quand elle n'est proche d'aucun multiple", () => {
    const raw = Point2.from_polar(400, deg(37));
    const snapped = snapped_at(voidAt(raw), placing, MECH, VIEW);
    expect(snapped.angle()).toBeCloseTo(deg(37));
  });

  // Landing on a round angle AND a round place at once is the point of combining
  // the two: the ray is chosen first, then the point slides along it.
  it("glisse le long du rayon retenu jusqu'au croisement de la grille", () => {
    const raw = Point2.from_polar(197, 0);
    const snapped = snapped_at(voidAt(raw), placing, MECH, VIEW);
    expect(snapped.x).toBeCloseTo(2 * STEP);
    expect(snapped.y).toBeCloseTo(0);
  });

  it("n'aimante aucune direction sous le rayon mort", () => {
    const raw = Point2.from_polar(9, deg(33));
    expect(snap(voidAt(raw), placing, MECH, VIEW).guides).toEqual([]);
  });

  it("rend le rayon retenu pour la ligne guide", () => {
    const raw = Point2.from_polar(200, deg(31.5));
    const { guides } = snap(voidAt(raw), placing, MECH, VIEW);
    expect(guides).toHaveLength(1);
    expect(guides[0].anchor).toEqual(P(0, 0));
    expect(guides[0].direction.angle()).toBeCloseTo(deg(30), 9);
  });

  // The guide claims to be holding the point. Read back from the snapped
  // position it would often be a lie: the grid is made of round directions, so
  // a point pulled onto it by the grid alone lands on one by coincidence.
  it("ne montre aucun guide quand c'est la grille seule qui a tenu le point", () => {
    // 37° off every multiple of 15 at that distance, and a hair from (300, 200).
    const raw = P(297, 202);
    const { position, guides } = snap(voidAt(raw), placing, MECH, VIEW);
    expect(position.x).toBeCloseTo(3 * STEP);
    expect(position.y).toBeCloseTo(2 * STEP);
    expect(guides).toEqual([]);
  });

  it("annonce la ligne de grille sur laquelle il a posé le point", () => {
    const { gridX, gridY } = snap(voidAt(P(97, 212)), { type: "PlacingPivot" }, MECH, VIEW);
    expect(gridX).toBeCloseTo(STEP);
    expect(gridY).toBeUndefined();
  });
});

describe("snap_hover / deux rayons à la fois", () => {
  const NODE = "n" as ID;
  /** A node held by two bars, one reaching left, one reaching down. */
  const held = (): MechanicalElement[] => [
    {
      type: "pivot",
      id: NODE,
      probes: [],
      overlays: {},
      position: P(600, 600),
      isGrounded: false,
      rotatingEdgesIDs: [],
      fixedGearsIDs: [],
    } as unknown as MechanicalElement,
    {
      ...beam(P(0, 600), P(600, 600)),
      id: "e1" as ID,
      fixedNodeEndID: NODE,
    } as unknown as MechanicalElement,
    {
      ...beam(P(600, 0), P(600, 600)),
      id: "e2" as ID,
      fixedNodeEndID: NODE,
    } as unknown as MechanicalElement,
  ];
  const moving: CanvasState = { type: "MovingNode", elementID: NODE };

  // The two bars each offer a direction, and honouring both at once is what puts
  // the node exactly where the two lines meet — the way the grid's two axes are
  // honoured together rather than one winning.
  it("pose le nœud au croisement des deux directions", () => {
    // Within the corridor of the horizontal from (0,600) and of the vertical
    // from (600,0), but on neither exactly.
    const snapped = snap(voidAt(P(604, 596)), moving, held(), VIEW);
    expect(snapped.position.x).toBeCloseTo(600);
    expect(snapped.position.y).toBeCloseTo(600);
  });

  // Both bars run from a point already on the grid, so each of their rays IS a
  // grid line: saying "0°" and "90°" would name the same two lines twice, and
  // less well.
  it("annonce les deux lignes de grille plutôt que deux angles", () => {
    const snapped = snap(voidAt(P(604, 596)), moving, held(), VIEW);
    expect(snapped.guides).toEqual([]);
    expect(snapped.gridX).toBeCloseTo(600);
    expect(snapped.gridY).toBeCloseTo(600);
  });

  it("retombe sur un seul rayon quand l'autre est hors couloir", () => {
    const snapped = snap(voidAt(P(700, 596)), moving, held(), VIEW);
    expect(snapped.position.y).toBeCloseTo(600);
    expect(snapped.gridY).toBeCloseTo(600);
  });

  // Off the grid, the direction has nothing else to say it: the guide comes back.
  it("garde le guide quand l'ancre n'est pas sur la grille", () => {
    const askew: CanvasState = {
      type: "PlacingBeamEnd",
      startHover: voidAt(P(0, 37)),
    };
    const snapped = snap(voidAt(P(400, 41)), askew, MECH, VIEW);
    expect(snapped.position.y).toBeCloseTo(37);
    expect(snapped.guides).toHaveLength(1);
  });
});

describe("snap_hover / jante d'engrenage", () => {
  const GEAR = "g" as ID;
  const gear = (position: Point2, radius: number): MechanicalElement =>
    ({
      type: "gear",
      id: GEAR,
      probes: [],
      overlays: {},
      position,
      angle: 0,
      radius,
      parentAxleID: "ax" as ID,
      fixedNodesBodyIDs: [],
      meshedGearsIDs: [],
    }) as unknown as MechanicalElement;

  const MECH_GEAR = [gear(P(0, 0), 200)];
  const onRim = (p: Point2): HoveredPart => ({
    type: "GearTooth",
    position: p,
    id: GEAR,
    deleting: false,
  });
  const deg = (d: number) => (d * Math.PI) / 180;

  // A point on a rim is characterised by its bearing, not by its x and y.
  it("aimante le relèvement sur un multiple de 15°", () => {
    const raw = Point2.from_polar(200, deg(31.5));
    const snapped = snap(onRim(raw), { type: "PlacingPivot" }, MECH_GEAR, VIEW);
    expect(snapped.position.angle()).toBeCloseTo(deg(30), 9);
    expect(snapped.position.length()).toBeCloseTo(200);
    expect(snapped.guides).toHaveLength(1);
  });

  it("laisse le point en place quand aucun rayon n'est à portée", () => {
    const raw = Point2.from_polar(200, deg(37));
    const snapped = snap(onRim(raw), { type: "PlacingPivot" }, MECH_GEAR, VIEW);
    expect(snapped.position.angle()).toBeCloseTo(deg(37));
  });

  // Sizing a gear against another puts the rim point on the line of the two
  // centres: it is not aimed, so it must not be snapped.
  it("ne touche pas au point de tangence d'un engrenage qu'on dimensionne", () => {
    const raw = Point2.from_polar(200, deg(31.5));
    const sizing: CanvasState = { type: "ChangingGearRadius", elementID: GEAR };
    expect(snap(onRim(raw), sizing, MECH_GEAR, VIEW).position).toEqual(raw);
  });
});
