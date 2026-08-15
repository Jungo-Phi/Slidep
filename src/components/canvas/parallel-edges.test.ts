import { describe, expect, it } from "vitest";
import { offset_ends, parallel_edge_offsets } from "./parallel-edges";
import { get_hovered_part } from "./get-hover";
import { DIM } from "../../constants/rendering-specs";
import { screen2world, world2screen } from "../../utils";
import { Point2, ZERO } from "../../types/point2";
import type { CanvasState } from "../../types/canvas-state";
import type {
  DamperElement,
  ID,
  MechanicalElement,
  PivotElement,
  SpringElement,
  ViewportState,
} from "../../types";

const id = (s: string) =>
  `00000000-0000-0000-0000-${s.padStart(12, "0")}` as ID;
const P = (x: number, y: number) => new Point2(x, y);

const LEFT = id("n1");
const RIGHT = id("n2");
const SPRING = id("s1");
const DAMPER = id("d1");
const BEAM = id("b1");

const anchor = (nid: ID, x: number, edges: ID[]): PivotElement => ({
  type: "pivot",
  id: nid,
  probes: [],
  overlays: {},
  position: P(x, 0),
  isGrounded: false,
  rotatingEdgesIDs: edges,
  fixedGearsIDs: [],
  rotationalFriction: 0,
});

const spring: SpringElement = {
  type: "spring",
  id: SPRING,
  probes: [],
  overlays: {},
  positionStart: P(0, 0),
  positionEnd: P(300, 0),
  fixedNodeStartID: LEFT,
  fixedNodeEndID: RIGHT,
  stiffness: 1,
};

const damper: DamperElement = {
  type: "damper",
  id: DAMPER,
  probes: [],
  overlays: {},
  positionStart: P(0, 0),
  positionEnd: P(300, 0),
  fixedNodeStartID: LEFT,
  fixedNodeEndID: RIGHT,
  damping: 1,
};

/** The one pair allowed to share two nodes, plus a beam that shares nothing. */
const PARALLEL: MechanicalElement[] = [
  anchor(LEFT, 0, [SPRING, DAMPER]),
  anchor(RIGHT, 300, [SPRING, DAMPER]),
  spring,
  damper,
];

const VIEWPORT: ViewportState = { scale: 1, pan: ZERO };

describe("parallel_edge_offsets", () => {
  it("écarte le ressort et l'amortisseur de part et d'autre de l'axe", () => {
    const offsets = parallel_edge_offsets(PARALLEL);
    expect(offsets.get(SPRING)).toBe(DIM.PARALLEL_EDGE_OFFSET);
    expect(offsets.get(DAMPER)).toBe(-DIM.PARALLEL_EDGE_OFFSET);
  });

  it("laisse une edge seule sur son axe", () => {
    const alone: MechanicalElement[] = [
      anchor(LEFT, 0, [SPRING]),
      anchor(RIGHT, 300, [SPRING]),
      spring,
    ];
    expect(parallel_edge_offsets(alone).size).toBe(0);
  });

  // Two beams never coexist — the fusion collapses them — so the offset must not
  // be handed out on a pair that is not the allowed one.
  it("n'écarte rien quand la paire n'est pas ressort + amortisseur", () => {
    const twoBeams: MechanicalElement[] = [
      anchor(LEFT, 0, [SPRING, BEAM]),
      anchor(RIGHT, 300, [SPRING, BEAM]),
      spring,
      {
        type: "beam",
        id: BEAM,
        probes: [],
        overlays: {},
        positionStart: P(0, 0),
        positionEnd: P(300, 0),
        fixedNodeStartID: LEFT,
        fixedNodeEndID: RIGHT,
        fixedNodesBodyIDs: [],
        linearMass: 1,
      },
    ];
    expect(parallel_edge_offsets(twoBeams).size).toBe(0);
  });

  it("garde le côté d'une edge quelle que soit son orientation", () => {
    const reversed = parallel_edge_offsets([
      ...PARALLEL.slice(0, 2),
      { ...spring, fixedNodeStartID: RIGHT, fixedNodeEndID: LEFT },
      damper,
    ]);
    expect(reversed.get(SPRING)).toBe(DIM.PARALLEL_EDGE_OFFSET);
  });
});

/**
 * The whole point of sharing one offset between the stroke and the cursor: what
 * the eye sees on one side must be what the cursor picks there.
 */
describe("le curseur répond là où le trait est dessiné", () => {
  const at = (cursor: Point2) =>
    get_hovered_part(
      PARALLEL,
      [],
      [],
      new Map(),
      cursor,
      { type: "Selecting" } as CanvasState,
      VIEWPORT,
    );

  /** The middle of where an edge carrying `offset` is drawn, back in world. */
  const drawn_middle = (offset: number) => {
    const { start, end } = offset_ends(
      world2screen(spring.positionStart, VIEWPORT),
      world2screen(spring.positionEnd, VIEWPORT),
      offset,
    );
    return screen2world(start.lerp(end, 0.5), VIEWPORT);
  };

  it("désigne le ressort du côté où il est tracé", () => {
    const hovered = at(drawn_middle(DIM.PARALLEL_EDGE_OFFSET));
    expect(hovered.type === "Edge" && hovered.id).toBe(SPRING);
  });

  it("désigne l'amortisseur de l'autre côté", () => {
    const hovered = at(drawn_middle(-DIM.PARALLEL_EDGE_OFFSET));
    expect(hovered.type === "Edge" && hovered.id).toBe(DAMPER);
  });

  it("répond sur l'axe, pas sur le trait décalé", () => {
    // The offset shows two elements at once; it is not a second place for one
    // to be, so a gesture reading the hover gets a point on the real edge.
    const hovered = at(drawn_middle(DIM.PARALLEL_EDGE_OFFSET));
    expect(hovered.position.y).toBeCloseTo(0, 6);
  });
});
