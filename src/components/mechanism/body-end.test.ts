import { describe, expect, it } from "vitest";
import { connect_elements, fuse_nodes } from "./connect-actions";
import { apply_actions } from "./apply-actions";
import { legality_for_state } from "./connection-rules";
import { validate_mechanism } from "../../utils/validate-mechanism";
import { repair_mechanism } from "../../utils/repair-mechanism";
import { resolveGeometricConstraints } from "../solver/kinematics/geometric-solver";
import { Point2, ZERO } from "../../types/point2";
import { DEFAULT_METADATA, DEFAULT_SIMULATION, Mechanism } from "../../types/mechanism";
import type { HoveredPart } from "../../types/hovered-part";
import type { CanvasState } from "../../types/canvas-state";
import type { Action } from "../../types/actions";
import type {
  BeamElement,
  ID,
  MechanicalElement,
  NodeElement,
  PivotElement,
  SliderElement,
  SlidepElement,
} from "../../types/element";
import type { MaterialDef, ProfileDef } from "../../types/material";

/**
 * A beam holds a node by one of its ends or by its body, never both — and a node riding a body stays between its ends.
 */

const id = (n: number): ID => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}` as ID;
const P = (x: number, y: number) => new Point2(x, y);

const MATERIAL_ID = id(90);
const PROFILE_ID = id(91);
const MATERIALS: MaterialDef[] = [{ id: MATERIAL_ID, name: "test", E: 1, Re: 1, rho: 1 }];
const PROFILES: ProfileDef[] = [{ id: PROFILE_ID, name: "test", shape: { kind: "rect", b: 1, h: 1 } }];

const BAR = id(1);
const RIDER = id(2);
const END = id(3);

const pivot = (nid: ID, x: number, rotating: ID[], isGrounded = false): PivotElement => ({
  type: "pivot",
  id: nid,
  probes: [],
  overlays: {},
  position: P(x, 0),
  isGrounded,
  rotatingEdgesIDs: rotating,
  fixedGearsIDs: [],
  rotationalFriction: 0,
});

const slider = (x: number): SliderElement => ({
  type: "slider",
  id: RIDER,
  probes: [],
  overlays: {},
  position: P(x, 0),
  isGrounded: false,
  parentBeamID: BAR,
  fixedEdgesIDs: [],
  slidingFriction: 0,
});

const bar = (start: ID | undefined, end: ID | undefined, body: ID[]): BeamElement => ({
  type: "beam",
  id: BAR,
  probes: [],
  overlays: {},
  positionStart: P(0, 0),
  positionEnd: P(200, 0),
  fixedNodeStartID: start,
  fixedNodeEndID: end,
  fixedNodesBodyIDs: body,
  materialID: MATERIAL_ID,
  profileID: PROFILE_ID,
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

const find = <T extends MechanicalElement>(m: Mechanism, eid: ID) =>
  m.mechanicalElements.find((el) => el.id === eid) as T;

describe("un nœud de corps ne quitte pas sa poutre", () => {
  // The bar's far end is grounded, so the bar cannot follow: the node stops where the bar does.
  it("s'arrête à l'extrémité quand on le tire au-delà", () => {
    const m = mechanism([
      pivot(END, 200, [BAR], true),
      pivot(RIDER, 100, [BAR]),
      { ...bar(id(9), END, [RIDER]) },
      pivot(id(9), 0, [BAR], true),
    ]);
    const move = {
      type: "MoveNode",
      id: RIDER,
      newPosition: P(260, 0),
      oldPosition: P(100, 0),
    } as unknown as Action;
    const solved = resolveGeometricConstraints(m, [move], [move]).positions.get(RIDER)!;
    expect(solved.x).toBeLessThanOrEqual(200 + 1e-6);
    expect(solved.x).toBeGreaterThan(199.9);
    expect(Math.abs(solved.y)).toBeLessThan(1e-6);
  });

  it("ne passe pas non plus avant le début", () => {
    const m = mechanism([
      pivot(id(9), 0, [BAR], true),
      pivot(END, 200, [BAR], true),
      pivot(RIDER, 100, [BAR]),
      bar(id(9), END, [RIDER]),
    ]);
    const move = {
      type: "MoveNode",
      id: RIDER,
      newPosition: P(-50, 0),
      oldPosition: P(100, 0),
    } as unknown as Action;
    const solved = resolveGeometricConstraints(m, [move], [move]).positions.get(RIDER)!;
    expect(solved.x).toBeGreaterThanOrEqual(-1e-6);
  });
});

describe("un nœud amené à l'extrémité de sa poutre", () => {
  it("fusionné sur le nœud d'extrémité, quitte le corps", () => {
    const elements: MechanicalElement[] = [
      pivot(RIDER, 200, [BAR]),
      pivot(END, 200, [BAR]),
      bar(undefined, END, [RIDER]),
    ];
    const after = apply_actions(
      mechanism(elements),
      fuse_nodes(elements[0] as NodeElement, elements[1] as NodeElement, elements, []),
    );
    const beam = find<BeamElement>(after, BAR);
    expect(beam.fixedNodeEndID).toBe(RIDER);
    expect(beam.fixedNodesBodyIDs).toEqual([]);
    expect(validate_mechanism(after)).toBeNull();
  });

  it("vaut dans l'autre sens de fusion", () => {
    const elements: MechanicalElement[] = [
      pivot(RIDER, 200, [BAR]),
      pivot(END, 200, [BAR]),
      bar(undefined, END, [RIDER]),
    ];
    const after = apply_actions(
      mechanism(elements),
      fuse_nodes(elements[1] as NodeElement, elements[0] as NodeElement, elements, []),
    );
    const beam = find<BeamElement>(after, BAR);
    expect(beam.fixedNodeEndID).toBe(END);
    expect(beam.fixedNodesBodyIDs).toEqual([]);
    expect(validate_mechanism(after)).toBeNull();
  });

  it("un slider fusionné sur l'extrémité de son rail perd le rail mais garde la poutre", () => {
    const elements: MechanicalElement[] = [
      slider(200),
      pivot(END, 200, [BAR]),
      bar(undefined, END, [RIDER]),
    ];
    const after = apply_actions(
      mechanism(elements),
      fuse_nodes(elements[0] as NodeElement, elements[1] as NodeElement, elements, []),
    );
    const beam = find<BeamElement>(after, BAR);
    expect(beam.fixedNodesBodyIDs).toEqual([]);
    const node = after.mechanicalElements.find(
      (el) => el.id === beam.fixedNodeEndID,
    ) as SliderElement | SlidepElement;
    expect(node.parentBeamID).toBeUndefined();
    expect("fixedEdgesIDs" in node ? node.fixedEdgesIDs : node.rotatingEdgesIDs).toContain(BAR);
    expect(validate_mechanism(after)).toBeNull();
  });

  it("posé sur une extrémité libre, en devient l'extrémité", () => {
    const elements: MechanicalElement[] = [pivot(RIDER, 200, [BAR]), bar(undefined, undefined, [RIDER])];
    const state = { type: "MovingNode", elementID: RIDER } as CanvasState;
    const target: HoveredPart = { type: "Edge", position: P(200, 0), id: BAR, deleting: false, part: "end" };
    expect(legality_for_state(state, elements)(elements[1], target).allowed).toBe(true);

    const after = apply_actions(
      mechanism(elements),
      connect_elements(
        target,
        elements[0],
        { type: "Node", position: P(200, 0), id: RIDER, deleting: false, beamBodyHover: false },
        elements,
        [],
      ),
    );
    const beam = find<BeamElement>(after, BAR);
    expect(beam.fixedNodeEndID).toBe(RIDER);
    expect(beam.fixedNodesBodyIDs).toEqual([]);
    expect(find<PivotElement>(after, RIDER).rotatingEdgesIDs).toEqual([BAR]);
    expect(validate_mechanism(after)).toBeNull();
  });

  it("le corps de sa propre poutre reste refusé", () => {
    const elements: MechanicalElement[] = [pivot(RIDER, 100, [BAR]), bar(undefined, undefined, [RIDER])];
    const state = { type: "MovingNode", elementID: RIDER } as CanvasState;
    const body: HoveredPart = { type: "Edge", position: P(150, 0), id: BAR, deleting: false, part: "body" };
    expect(legality_for_state(state, elements)(elements[1], body).allowed).toBe(false);
  });
});

describe("corps et extrémité à la fois", () => {
  const conflicted = (): MechanicalElement[] => [slider(200), bar(undefined, RIDER, [RIDER])];

  it("est signalé par la validation", () => {
    const codes = (validate_mechanism(mechanism(conflicted())) ?? []).map((e) => e.code);
    expect(codes).toContain("BODY_AND_END");
  });

  it("est réparé au chargement, l'extrémité l'emportant", () => {
    const { mechanism: repaired, repairs } = repair_mechanism(mechanism(conflicted()));
    expect(repairs.map((r) => r.code)).toContain("BODY_END_DUPLICATE");
    expect(find<BeamElement>(repaired, BAR).fixedNodesBodyIDs).toEqual([]);
    const node = find<SliderElement>(repaired, RIDER);
    expect(node.parentBeamID).toBeUndefined();
    expect(node.fixedEdgesIDs).toEqual([BAR]);
    expect(validate_mechanism(repaired)).toBeNull();
  });
});
