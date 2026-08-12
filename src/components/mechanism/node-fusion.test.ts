import { describe, expect, it } from "vitest";
import { connect_elements, connect_node_and_edge, fuse_nodes } from "./connect-actions";
import { apply_actions } from "./apply-actions";
import { validate_mechanism } from "../../utils/validate-mechanism";
import { Point2, ZERO } from "../../types/point2";
import { DEFAULT_METADATA, Mechanism } from "../../types/mechanism";
import type { HoveredPart } from "../../types/hovered-part";
import type {
  BeamElement,
  ID,
  MechanicalElement,
  NodeElement,
  PivotElement,
  SliderElement,
  SlidepElement,
} from "../../types/element";

/**
 * A node names an edge once, however many ways that edge rests on it. Fusing two
 * nodes is where those ways pile up — the two ends of one bar landing together,
 * a node sitting on the body of the bar it also terminates — and each defect
 * here was a list left saying it twice, or once too few.
 */

const id = (n: number): ID =>
  `00000000-0000-0000-0000-${String(n).padStart(12, "0")}` as ID;

const P = (x: number, y: number) => new Point2(x, y);

const pivot = (nid: ID, x: number, rotating: ID[] = []): PivotElement => ({
  type: "pivot",
  id: nid,
  probes: [],
  overlays: {},
  position: P(x, 0),
  isGrounded: false,
  rotatingEdgesIDs: rotating,
  fixedGearsIDs: [],
});

const beam = (
  bid: ID,
  start: ID | undefined,
  end: ID | undefined,
  body: ID[] = [],
): BeamElement => ({
  type: "beam",
  id: bid,
  probes: [],
  overlays: {},
  positionStart: P(0, 0),
  positionEnd: P(200, 0),
  fixedNodeStartID: start,
  fixedNodeEndID: end,
  fixedNodesBodyIDs: body,
});

const mechanism = (mechanicalElements: MechanicalElement[]): Mechanism => ({
  metadata: DEFAULT_METADATA,
  viewport: { scale: 1, pan: ZERO },
  mechanicalElements,
  constraintElements: [],
  loads: [],
  history: [],
  future: [],
});

const PIVOT = id(1);
const SLIDER = id(2);
const BAR = id(3);
const FRESH = id(4);

describe("fusion d'un pivot et d'un slider que la même barre relie", () => {
  // The bar runs from the pivot to the slider, so each of them names it. The
  // slidep that replaces the pair must still name it once.
  const spanned = (): MechanicalElement[] => [
    pivot(PIVOT, 0, [BAR]),
    {
      type: "slider",
      id: SLIDER,
      probes: [],
      overlays: {},
      position: P(200, 0),
      isGrounded: false,
      parentBeamID: undefined,
      fixedEdgesIDs: [BAR],
    } as SliderElement,
    beam(BAR, PIVOT, SLIDER),
  ];

  it("ne nomme pas la barre deux fois", () => {
    const elements = spanned();
    const after = apply_actions(
      mechanism(elements),
      fuse_nodes(
        elements[1] as NodeElement,
        elements[0] as NodeElement,
        elements,
        [],
      ),
    );

    const slidep = after.mechanicalElements.find(
      (el) => el.type === "slidep",
    ) as SlidepElement;
    expect(slidep.rotatingEdgesIDs).toEqual([BAR]);
    expect(validate_mechanism(after)).toBeNull();
  });

  it("vaut dans l'autre sens de fusion", () => {
    const elements = spanned();
    const after = apply_actions(
      mechanism(elements),
      fuse_nodes(
        elements[0] as NodeElement,
        elements[1] as NodeElement,
        elements,
        [],
      ),
    );

    const slidep = after.mechanicalElements.find(
      (el) => el.type === "slidep",
    ) as SlidepElement;
    expect(slidep.rotatingEdgesIDs).toEqual([BAR]);
    expect(validate_mechanism(after)).toBeNull();
  });
});

describe("un slider dont la barre est déjà le parentBeamID", () => {
  // A beamBodyHover catch during placement, and the body-crossing sweep that
  // follows it in the same gesture, can both name the same node for the same
  // edge. The second call must be a true no-op — not a fixedEdgesIDs entry
  // alongside the parentBeamID that already says the same thing.
  it("un second appel en body ne duplique pas la barre dans fixedEdgesIDs", () => {
    const slider: SliderElement = {
      type: "slider",
      id: SLIDER,
      probes: [],
      overlays: {},
      position: P(100, 0),
      isGrounded: false,
      parentBeamID: BAR,
      fixedEdgesIDs: [],
    };
    const bar = beam(BAR, undefined, undefined, [SLIDER]);

    const actions = connect_node_and_edge(slider, bar, "body", [slider, bar], []);

    expect(actions).toEqual([]);
  });
});

describe("une extrémité quittant un nœud qui tient la barre autrement", () => {
  // A fusion can leave a node both terminating a bar and sitting on its body.
  // The node lists that bar once for the two, so moving the end away must leave
  // the entry — the body pin still needs it.
  it("garde l'entrée quand le nœud reste sur le corps", () => {
    const elements: MechanicalElement[] = [
      pivot(PIVOT, 0, [BAR]),
      pivot(FRESH, 40),
      beam(BAR, PIVOT, undefined, [PIVOT]),
    ];

    const after = apply_actions(
      mechanism(elements),
      connect_elements(
        {
          type: "Edge",
          position: P(0, 0),
          id: BAR,
          deleting: false,
          part: "start",
        } as HoveredPart,
        elements[1],
        {
          type: "Node",
          position: P(40, 0),
          id: FRESH,
          deleting: false,
          beamBodyHover: false,
        } as HoveredPart,
        elements,
        [],
        [],
      ),
    );

    const held = after.mechanicalElements.find(
      (el) => el.id === PIVOT,
    ) as PivotElement;
    expect(held.rotatingEdgesIDs).toContain(BAR);
    expect(validate_mechanism(after)).toBeNull();
  });
});
