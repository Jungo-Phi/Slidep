import { describe, expect, it } from "vitest";
import { apply_actions } from "./apply-actions";
import { delete_element } from "./connect-actions";
import { validate_mechanism } from "../../utils/validate-mechanism";
import { edge_terminal_pair } from "../../utils/edge-rules";
import { Point2 } from "../../types/point2";
import { DEFAULT_METADATA, Mechanism } from "../../types/mechanism";
import type { Action } from "../../types";
import type {
  BeamElement,
  ConstraintElement,
  DamperElement,
  EdgeElement,
  ID,
  LoadElement,
  MechanicalElement,
  PivotElement,
  SliderElement,
  SpringElement,
} from "../../types/element";

/**
 * Two edges holding the same two nodes collapse into one — a spring and a damper
 * apart. These run through `apply_actions`, the only entry point that owes the
 * invariant, so they cover the correction pass and not just its parts.
 */

let nextID = 0;
const id = (): ID =>
  `00000000-0000-0000-0000-${String(++nextID).padStart(12, "0")}` as ID;

const A = id();
const B = id();
const C = id();
const BAR = id();
const OTHER = id();
const SLIDER_ON_BAR = id();
const SLIDER_ON_OTHER = id();

const pivot = (pid: ID, x: number, edges: ID[] = []): PivotElement => ({
  type: "pivot",
  id: pid,
  probes: [],
  overlays: {},
  position: new Point2(x, 0),
  isGrounded: false,
  rotatingEdgesIDs: edges,
  fixedGearsIDs: [],
});

const slider = (sid: ID, beamID: ID): SliderElement => ({
  type: "slider",
  id: sid,
  probes: [],
  overlays: {},
  position: new Point2(50, 0),
  isGrounded: false,
  parentBeamID: beamID,
  fixedEdgesIDs: [],
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
  positionStart: new Point2(0, 0),
  positionEnd: new Point2(100, 0),
  fixedNodeStartID: start,
  fixedNodeEndID: end,
  fixedNodesBodyIDs: body,
});

const spring = (
  sid: ID,
  start: ID | undefined,
  end: ID | undefined,
): SpringElement => ({
  type: "spring",
  id: sid,
  probes: [],
  overlays: {},
  positionStart: new Point2(0, 0),
  positionEnd: new Point2(100, 0),
  fixedNodeStartID: start,
  fixedNodeEndID: end,
  stiffness: 10,
});

const damper = (did: ID, start: ID, end: ID): DamperElement => ({
  type: "damper",
  id: did,
  probes: [],
  overlays: {},
  positionStart: new Point2(0, 0),
  positionEnd: new Point2(100, 0),
  fixedNodeStartID: start,
  fixedNodeEndID: end,
  damping: 5,
});

function mechanism(
  mechanicalElements: MechanicalElement[],
  constraintElements: ConstraintElement[] = [],
  loads: LoadElement[] = [],
): Mechanism {
  return {
    metadata: DEFAULT_METADATA,
    viewport: { scale: 1, pan: new Point2(0, 0) },
    mechanicalElements,
    constraintElements,
    loads,
    history: [],
    future: [],
  };
}

/** The actions a tool emits after drawing `edge` between two existing nodes. */
function draw(edge: EdgeElement): Action[] {
  return [
    { type: "CreateElement", element: edge },
    {
      type: "ConnectsRotatingEdges",
      disconnect: false,
      elementID: edge.fixedNodeStartID!,
      connectID: edge.id,
      index: 0,
    },
    {
      type: "ConnectsRotatingEdges",
      disconnect: false,
      elementID: edge.fixedNodeEndID!,
      connectID: edge.id,
      index: 0,
    },
  ];
}

const find = (m: Mechanism, elementID: ID) =>
  m.mechanicalElements.find((el) => el.id === elementID);

/**
 * Applies a bundle, refusing an invalid seed first: `issues_introduced` forgives
 * whatever was already broken, so a faulty fixture would silently excuse the
 * very defect these tests look for.
 */
function apply(before: Mechanism, actions: Action[]): Mechanism {
  expect(validate_mechanism(before)).toBeNull();
  return apply_actions(before, actions, "Connects");
}

describe("superposition — deux edges sur les mêmes nœuds", () => {
  it("fusionne une barre sur une barre en gardant les nœuds de corps des deux", () => {
    // Two bars that already exist, each carrying a slider. Dragging the end of
    // one onto the other's superposes them — the case a fresh stroke never
    // reaches, since a new bar carries nothing yet.
    const before = mechanism([
      pivot(A, 0, [BAR, OTHER]),
      pivot(B, 100, [BAR]),
      pivot(C, 200, [OTHER]),
      beam(BAR, A, B, [SLIDER_ON_BAR]),
      beam(OTHER, A, C, [SLIDER_ON_OTHER]),
      slider(SLIDER_ON_BAR, BAR),
      slider(SLIDER_ON_OTHER, OTHER),
    ]);
    const after = apply(before, [
      {
        type: "ConnectsRotatingEdges",
        disconnect: true,
        elementID: C,
        connectID: OTHER,
        index: 0,
      },
      {
        type: "ConnectsFixedNodeEnd",
        disconnect: false,
        elementID: OTHER,
        connectID: B,
      },
      {
        type: "ConnectsRotatingEdges",
        disconnect: false,
        elementID: B,
        connectID: OTHER,
        index: 0,
      },
    ]);

    expect(find(after, OTHER)).toBeUndefined();
    const survivor = find(after, BAR) as BeamElement;
    expect(survivor.fixedNodesBodyIDs).toEqual(
      expect.arrayContaining([SLIDER_ON_BAR, SLIDER_ON_OTHER]),
    );
    expect((find(after, SLIDER_ON_OTHER) as SliderElement).parentBeamID).toBe(
      BAR,
    );
    expect(validate_mechanism(after)).toBeNull();
  });

  it("laisse le ressort reprendre la barre et orpheliner ses sliders", () => {
    const before = mechanism([
      pivot(A, 0, [BAR]),
      pivot(B, 100, [BAR]),
      beam(BAR, A, B, [SLIDER_ON_BAR]),
      slider(SLIDER_ON_BAR, BAR),
    ]);
    const after = apply(before, draw(spring(OTHER, A, B)));

    expect(find(after, BAR)).toBeUndefined();
    expect(find(after, OTHER)?.type).toBe("spring");
    // A spring carries nothing along its body: the slider stays, released.
    const released = find(after, SLIDER_ON_BAR) as SliderElement;
    expect(released).toBeDefined();
    expect(released.parentBeamID).toBeUndefined();
    expect(validate_mechanism(after)).toBeNull();
  });

  it("garde un ressort et un amortisseur en parallèle", () => {
    const before = mechanism([
      pivot(A, 0, [BAR]),
      pivot(B, 100, [BAR]),
      spring(BAR, A, B),
    ]);
    const after = apply(before, draw(damper(OTHER, A, B)));

    expect(find(after, BAR)?.type).toBe("spring");
    expect(find(after, OTHER)?.type).toBe("damper");
    expect(validate_mechanism(after)).toBeNull();
  });

  it("garde l'ancien quand deux edges de même type se superposent", () => {
    const before = mechanism([
      pivot(A, 0, [BAR]),
      pivot(B, 100, [BAR]),
      spring(BAR, A, B),
    ]);
    const after = apply(before, draw(spring(OTHER, A, B)));

    expect(find(after, BAR)).toBeDefined();
    expect(find(after, OTHER)).toBeUndefined();
  });

  it("ne touche pas deux edges qui ne partagent qu'un nœud", () => {
    const before = mechanism([
      pivot(A, 0, [BAR]),
      pivot(B, 100, [BAR]),
      pivot(C, 200),
      beam(BAR, A, B),
    ]);
    const after = apply(before, draw(beam(OTHER, B, C)));

    expect(find(after, BAR)).toBeDefined();
    expect(find(after, OTHER)).toBeDefined();
  });

  it("ignore une courroie : ses poulies la définissent, pas ses bouts", () => {
    const belt: EdgeElement = {
      type: "belt",
      id: OTHER,
      probes: [],
      overlays: {},
      positionStart: new Point2(0, 0),
      positionEnd: new Point2(100, 0),
      fixedNodeStartID: A,
      fixedNodeEndID: B,
      attachedGearsIDs: [],
      closed: false,
    };
    expect(edge_terminal_pair(belt)).toBeUndefined();
  });
});

describe("superposition — le ressort posé sur une barre à bout libre", () => {
  const JOIN = id();
  const SPRING = id();

  /** Beam A—(free end). The spring is drawn from A to that free end, which mints
   *  a join to marry the two — and superposes them. */
  const before = () =>
    mechanism([pivot(A, 0, [BAR]), beam(BAR, A, undefined)]);

  const gesture: Action[] = [
    { type: "CreateElement", element: spring(SPRING, A, undefined) },
    {
      type: "ConnectsRotatingEdges",
      disconnect: false,
      elementID: A,
      connectID: SPRING,
      index: 0,
    },
    {
      type: "CreateElement",
      element: {
        type: "join",
        id: JOIN,
        probes: [],
        overlays: {},
        position: new Point2(100, 0),
        isGrounded: false,
        fixedEdgesIDs: [],
      },
    },
    {
      type: "ConnectsFixedEdges",
      disconnect: false,
      elementID: JOIN,
      connectID: BAR,
      index: 0,
    },
    {
      type: "ConnectsFixedNodeEnd",
      disconnect: false,
      elementID: BAR,
      connectID: JOIN,
    },
    {
      type: "ConnectsFixedEdges",
      disconnect: false,
      elementID: JOIN,
      connectID: SPRING,
      index: 0,
    },
    {
      type: "ConnectsFixedNodeEnd",
      disconnect: false,
      elementID: SPRING,
      connectID: JOIN,
    },
  ];

  it("garde le ressort dessiné, pas la barre que le join vient de reterminer", () => {
    // The join re-terminates the beam too, so re-termination alone would let the
    // beam pass for the newcomer and swallow the spring.
    const after = apply(before(), gesture);

    expect(find(after, SPRING)?.type).toBe("spring");
    expect(find(after, BAR)).toBeUndefined();
  });

  it("reprend le join que la fusion laisse sans rien à joindre", () => {
    const after = apply(before(), gesture);

    expect(find(after, JOIN)).toBeUndefined();
    expect(validate_mechanism(after)).toBeNull();
  });
});

describe("suppression d'une poutre portant un moteur", () => {
  it("ancre le moteur au sol plutôt que de le laisser sans appui", () => {
    const MOTOR = id();
    const before = mechanism([
      {
        ...pivot(MOTOR, 0),
        motor: { parentBeamID: BAR, speed: 60 },
      },
      beam(BAR, undefined, undefined),
    ]);
    const after = apply(
      before,
      delete_element(
        BAR,
        before.mechanicalElements,
        before.constraintElements,
        before.loads,
      ),
    );

    const driven = find(after, MOTOR) as PivotElement;
    expect(driven.isGrounded).toBe(true);
    expect(driven.motor?.parentBeamID).toBeUndefined();
    expect(driven.motor?.speed).toBe(60);
    expect(validate_mechanism(after)).toBeNull();
  });
});

describe("superposition — ce que la fusion emporte", () => {
  it("échange les extrémités d'une charge quand la survivante va dans l'autre sens", () => {
    const FORCE = id();
    const before = mechanism([
      pivot(A, 0, [BAR]),
      pivot(B, 100, [BAR]),
      beam(BAR, A, B),
    ]);
    // The newcomer runs B→A and carries a force at its start, which sits on B.
    // Absorbed into a survivor running A→B, that start becomes the end.
    const after = apply(before, [
      ...draw(beam(OTHER, B, A)),
      {
        type: "CreateElement",
        element: {
          type: "force",
          id: FORCE,
          targetID: OTHER,
          anchor: "start",
          vector: new Point2(0, 100),
          frame: "world",
        },
      },
    ]);

    const moved = after.loads.find((l) => l.id === FORCE);
    expect(moved?.targetID).toBe(BAR);
    expect(moved && "anchor" in moved && moved.anchor).toBe("end");
    expect(validate_mechanism(after)).toBeNull();
  });

  it("recentre une contrainte, et jette celle qui ferait doublon", () => {
    const KEPT = id();
    const DOUBLE = id();
    const before = mechanism([
      pivot(A, 0, [BAR]),
      pivot(B, 100, [BAR]),
      beam(BAR, A, B),
    ]);
    // Both dimensions measure the same bar once the newcomer is absorbed: only
    // one may survive.
    const after = apply(before, [
      ...draw(beam(OTHER, A, B)),
      {
        type: "CreateElement",
        element: {
          type: "dimension-edge",
          id: KEPT,
          position: new Point2(0, 40),
          edgeID: BAR,
          value: 100,
        },
      },
      {
        type: "CreateElement",
        element: {
          type: "dimension-edge",
          id: DOUBLE,
          position: new Point2(0, 60),
          edgeID: OTHER,
          value: 100,
        },
      },
    ]);

    expect(after.constraintElements.map((c) => c.id)).toEqual([KEPT]);
    expect(validate_mechanism(after)).toBeNull();
  });
});
