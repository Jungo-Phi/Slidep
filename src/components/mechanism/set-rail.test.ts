import { describe, expect, it } from "vitest";
import { can_be_rail, set_rail } from "./connect-actions";
import { apply_actions } from "./apply-actions";
import { actionReducer } from "./action-reducer";
import { validate_mechanism } from "../../utils/validate-mechanism";
import { Point2, ZERO } from "../../types/point2";
import {
  DEFAULT_METADATA,
  DEFAULT_SIMULATION,
  Mechanism,
} from "../../types/mechanism";
import type {
  BeamElement,
  ID,
  MechanicalElement,
  SlidepElement,
  SliderElement,
  SpringElement,
} from "../../types/element";
import type { MaterialDef, ProfileDef } from "../../types/material";

/**
 * The rail role travels between the bars a slider already holds: it never
 * changes what is connected to what, only which of those bars guides the slide.
 */

const id = (n: number): ID =>
  `00000000-0000-0000-0000-${String(n).padStart(12, "0")}` as ID;

const P = (x: number, y: number) => new Point2(x, y);

const MATERIAL_ID = id(90);
const PROFILE_ID = id(91);
const MATERIALS: MaterialDef[] = [
  { id: MATERIAL_ID, name: "test", E: 1, Re: 1, rho: 1 },
];
const PROFILES: ProfileDef[] = [
  { id: PROFILE_ID, name: "test", shape: { kind: "rect", b: 1, h: 1 } },
];

const SLIDER = id(1);
const RAIL = id(2);
const CROSSING = id(3);
const HANGING = id(4);
const SPRING = id(5);

/** A bar the slider rides across the middle of. */
const body_beam = (bid: ID, angle: number): BeamElement => ({
  type: "beam",
  id: bid,
  probes: [],
  overlays: {},
  positionStart: P(-100 * Math.cos(angle), -100 * Math.sin(angle)),
  positionEnd: P(100 * Math.cos(angle), 100 * Math.sin(angle)),
  fixedNodeStartID: undefined,
  fixedNodeEndID: undefined,
  fixedNodesBodyIDs: [SLIDER],
  materialID: MATERIAL_ID,
  profileID: PROFILE_ID,
});

/** A bar merely pinned to the slider by one end. */
const hanging_beam = (): BeamElement => ({
  ...body_beam(HANGING, 0),
  positionStart: ZERO,
  positionEnd: P(0, 150),
  fixedNodeStartID: SLIDER,
  fixedNodesBodyIDs: [],
});

const spring = (): SpringElement => ({
  type: "spring",
  id: SPRING,
  probes: [],
  overlays: {},
  positionStart: ZERO,
  positionEnd: P(0, -150),
  fixedNodeStartID: SLIDER,
  fixedNodeEndID: undefined,
  stiffness: 1,
});

const slider = (
  parentBeamID: ID | undefined,
  fixedEdgesIDs: ID[],
): SliderElement => ({
  type: "slider",
  id: SLIDER,
  probes: [],
  overlays: {},
  position: ZERO,
  isGrounded: false,
  parentBeamID,
  fixedEdgesIDs,
  slidingFriction: 0,
});

const slidep = (
  parentBeamID: ID | undefined,
  rotatingEdgesIDs: ID[],
): SlidepElement => ({
  type: "slidep",
  id: SLIDER,
  probes: [],
  overlays: {},
  position: ZERO,
  isGrounded: false,
  parentBeamID,
  rotatingEdgesIDs,
  fixedGearsIDs: [],
  slidingFriction: 0,
  rotationalFriction: 0,
});

const mechanism = (mechanicalElements: MechanicalElement[]): Mechanism => ({
  metadata: DEFAULT_METADATA,
  viewport: { scale: 1, pan: ZERO },
  simulation: DEFAULT_SIMULATION,
  mechanicalElements,
  constraintElements: [],
  loads: [],
  materials: MATERIALS,
  profiles: PROFILES,
  history: [],
  future: [],
});

const sliderOf = (m: Mechanism): SliderElement =>
  m.mechanicalElements.find((el) => el.id === SLIDER) as SliderElement;

describe("choix du rail d'un slider", () => {
  // Two bars cross the slider's body and one hangs from it: the crossing one is
  // promoted, the rail it replaces lands back where it came from.
  const crossed = (): MechanicalElement[] => [
    slider(RAIL, [CROSSING, HANGING]),
    body_beam(RAIL, 0),
    body_beam(CROSSING, Math.PI / 3),
    hanging_beam(),
  ];

  it("échange les rôles sans toucher aux connexions", () => {
    const elements = crossed();
    const after = apply_actions(
      mechanism(elements),
      set_rail(elements[0] as SliderElement, CROSSING),
    );

    expect(sliderOf(after).parentBeamID).toBe(CROSSING);
    expect(sliderOf(after).fixedEdgesIDs).toEqual([RAIL, HANGING]);
    for (const beamID of [RAIL, CROSSING]) {
      const beam = after.mechanicalElements.find(
        (el) => el.id === beamID,
      ) as BeamElement;
      expect(beam.fixedNodesBodyIDs).toEqual([SLIDER]);
    }
    expect(validate_mechanism(after)).toBeNull();
  });

  it("laisse la géométrie en place", () => {
    const elements = crossed();
    const after = apply_actions(
      mechanism(elements),
      set_rail(elements[0] as SliderElement, CROSSING),
    );

    expect(sliderOf(after).position.equals(ZERO)).toBe(true);
  });

  it("revient à l'état d'avant en annulant", () => {
    const elements = crossed();
    const forward = apply_actions(
      mechanism(elements),
      set_rail(elements[0] as SliderElement, CROSSING),
    );
    const bundle = forward.history[forward.history.length - 1];
    const undone = actionReducer(forward, [...bundle].reverse(), true);

    expect(sliderOf(undone).parentBeamID).toBe(RAIL);
    expect(sliderOf(undone).fixedEdgesIDs).toEqual([CROSSING, HANGING]);
    expect(validate_mechanism(undone)).toBeNull();
  });

  it("libère le rail sans détacher la barre", () => {
    const elements = crossed();
    const after = apply_actions(
      mechanism(elements),
      set_rail(elements[0] as SliderElement, undefined),
    );

    expect(sliderOf(after).parentBeamID).toBeUndefined();
    expect(sliderOf(after).fixedEdgesIDs).toEqual([RAIL, CROSSING, HANGING]);
    expect(validate_mechanism(after)).toBeNull();
  });

  it("promeut une barre alors que le slider n'a pas de rail", () => {
    const elements: MechanicalElement[] = [
      slider(undefined, [CROSSING]),
      body_beam(CROSSING, 0),
    ];
    const after = apply_actions(
      mechanism(elements),
      set_rail(elements[0] as SliderElement, CROSSING),
    );

    expect(sliderOf(after).parentBeamID).toBe(CROSSING);
    expect(sliderOf(after).fixedEdgesIDs).toEqual([]);
    expect(validate_mechanism(after)).toBeNull();
  });

  it("ne fait rien quand la barre est déjà le rail", () => {
    expect(set_rail(slider(RAIL, [CROSSING]), RAIL)).toEqual([]);
  });

  it("ne fait rien quand le slider ne tient pas la barre", () => {
    expect(set_rail(slider(RAIL, []), CROSSING)).toEqual([]);
  });
});

describe("choix du rail d'un slidep", () => {
  it("puise dans les barres tournantes", () => {
    const elements: MechanicalElement[] = [
      slidep(RAIL, [CROSSING]),
      body_beam(RAIL, 0),
      body_beam(CROSSING, Math.PI / 3),
    ];
    const after = apply_actions(
      mechanism(elements),
      set_rail(elements[0] as SlidepElement, CROSSING),
    );
    const node = after.mechanicalElements.find(
      (el) => el.id === SLIDER,
    ) as SlidepElement;

    expect(node.parentBeamID).toBe(CROSSING);
    expect(node.rotatingEdgesIDs).toEqual([RAIL]);
    expect(validate_mechanism(after)).toBeNull();
  });
});

describe("barres éligibles au rôle de rail", () => {
  const node = slider(RAIL, [CROSSING, HANGING, SPRING]);

  it("accepte une barre qui traverse le corps du nœud", () => {
    expect(can_be_rail(node, body_beam(CROSSING, Math.PI / 3))).toBe(true);
  });

  it("refuse une barre accrochée par une extrémité", () => {
    expect(can_be_rail(node, hanging_beam())).toBe(false);
  });

  it("refuse un ressort", () => {
    expect(can_be_rail(node, spring())).toBe(false);
  });

  it("refuse un nœud qui ne glisse pas", () => {
    const join: MechanicalElement = {
      type: "join",
      id: id(9),
      probes: [],
      overlays: {},
      position: ZERO,
      isGrounded: false,
      fixedEdgesIDs: [],
    };
    expect(can_be_rail(join, body_beam(CROSSING, 0))).toBe(false);
  });
});
