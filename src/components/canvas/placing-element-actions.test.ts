import { describe, it, expect } from "vitest";
import { handle_placing_element } from "./placing-element-actions";
import { Point2 } from "../../types/point2";
import {
  BeamElement,
  DistributedForceElement,
  ForceElement,
  ID,
  MomentElement,
} from "../../types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const id = (s: string) =>
  `00000000-0000-0000-0000-${s.padStart(12, "0")}` as ID;
const P = (x: number, y: number) => new Point2(x, y);

const VOID = { type: "Void" as const, position: P(0, 0) };
const node = (nid: ID, pos = P(0, 0)) => ({
  type: "Node" as const,
  position: pos,
  id: nid,
  deleting: false,
  beamBodyHover: false,
});
const edge = (
  eid: ID,
  part: "start" | "end" | "body" = "body",
  pos = P(0, 0),
) => ({
  type: "Edge" as const,
  position: pos,
  id: eid,
  deleting: false,
  part,
});

// ─── PlacingBeamStart ─────────────────────────────────────────────────────────

describe("PlacingBeamStart", () => {
  it("retourne PlacingBeamEnd avec startHover = hoveredPart", () => {
    const hover = node(id("n1"));
    const r = handle_placing_element(
      { type: "PlacingBeamStart" },
      hover,
      [],
      [],
      [],
    );
    expect(r.actions).toHaveLength(0);
    expect(r.newCanvasState).toEqual({
      type: "PlacingBeamEnd",
      startHover: hover,
    });
  });
});

// ─── PlacingForceEnd — déduplication ─────────────────────────────────────────

describe("PlacingForceEnd", () => {
  const startHover = node(id("pivot1"), P(0, 0));
  const state = { type: "PlacingForceEnd" as const, startHover };
  const tipPos = { type: "Void" as const, position: P(0, -1) };

  it("startHover Void → aucune action, retour à PlacingForceStart", () => {
    const r = handle_placing_element(
      { type: "PlacingForceEnd" as const, startHover: VOID },
      tipPos,
      [],
      [],
      [],
    );
    expect(r.actions).toHaveLength(0);
    expect(r.newCanvasState).toEqual({ type: "PlacingForceStart" });
  });

  it("pas de force existante → un seul CreateElement", () => {
    const r = handle_placing_element(state, tipPos, [], [], []);
    expect(r.actions).toHaveLength(1);
    expect(r.actions[0].type).toBe("CreateElement");
    expect(r.newCanvasState).toEqual({ type: "PlacingForceStart" });
  });

  it("force existante même cible → DeleteElement + CreateElement", () => {
    const existing: ForceElement = {
      type: "force",
      id: id("force1"),
      targetID: id("pivot1"),
      anchor: undefined,
      vector: P(0, -5),
      frame: "world",
    };
    const r = handle_placing_element(state, tipPos, [], [], [existing]);
    expect(r.actions).toHaveLength(2);
    expect(r.actions[0]).toEqual({ type: "DeleteElement", element: existing });
    expect(r.actions[1].type).toBe("CreateElement");
  });

  it("force sur cible différente → pas de remplacement", () => {
    const other: ForceElement = {
      type: "force",
      id: id("force2"),
      targetID: id("other"),
      anchor: undefined,
      vector: P(0, -1),
      frame: "world",
    };
    const r = handle_placing_element(state, tipPos, [], [], [other]);
    expect(r.actions).toHaveLength(1);
    expect(r.actions[0].type).toBe("CreateElement");
  });

  it("ancres différentes → pas de remplacement", () => {
    const stateEdge = {
      type: "PlacingForceEnd" as const,
      startHover: edge(id("beam1"), "start"),
    };
    const existing: ForceElement = {
      type: "force",
      id: id("force1"),
      targetID: id("beam1"),
      anchor: "end",
      vector: P(0, -1),
      frame: "world",
    };
    const r = handle_placing_element(stateEdge, tipPos, [], [], [existing]);
    expect(r.actions).toHaveLength(1);
    expect(r.actions[0].type).toBe("CreateElement");
  });

  it("même ancre 'start' → remplacement", () => {
    const stateEdge = {
      type: "PlacingForceEnd" as const,
      startHover: edge(id("beam1"), "start"),
    };
    const existing: ForceElement = {
      type: "force",
      id: id("force1"),
      targetID: id("beam1"),
      anchor: "start",
      vector: P(0, -1),
      frame: "world",
    };
    const r = handle_placing_element(stateEdge, tipPos, [], [], [existing]);
    expect(r.actions).toHaveLength(2);
    expect(r.actions[0].type).toBe("DeleteElement");
  });
});

// ─── PlacingMoment — déduplication ───────────────────────────────────────────

describe("PlacingMoment", () => {
  const state = { type: "PlacingMoment" as const };

  it("hover Void → aucune action", () => {
    const r = handle_placing_element(state, VOID, [], [], []);
    expect(r.actions).toHaveLength(0);
  });

  it("hover Edge, pas de moment existant → un seul CreateElement", () => {
    const r = handle_placing_element(state, edge(id("beam1")), [], [], []);
    expect(r.actions).toHaveLength(1);
    expect(r.actions[0].type).toBe("CreateElement");
  });

  it("moment existant sur la même cible → DeleteElement + CreateElement", () => {
    const existing: MomentElement = {
      type: "moment",
      id: id("moment1"),
      beamID: id("beam1"),
      value: 5,
      clockwise: true,
    };
    const r = handle_placing_element(
      state,
      edge(id("beam1")),
      [],
      [],
      [existing],
    );
    expect(r.actions).toHaveLength(2);
    expect(r.actions[0]).toEqual({ type: "DeleteElement", element: existing });
    expect(r.actions[1].type).toBe("CreateElement");
  });

  it("moment sur cible différente → pas de remplacement", () => {
    const other: MomentElement = {
      type: "moment",
      id: id("moment2"),
      beamID: id("other"),
      value: 3,
      clockwise: false,
    };
    const r = handle_placing_element(state, edge(id("beam1")), [], [], [other]);
    expect(r.actions).toHaveLength(1);
    expect(r.actions[0].type).toBe("CreateElement");
  });
});

// ─── PlacingDistributedForceEnd — déduplication ──────────────────────────────

describe("PlacingDistributedForceEnd", () => {
  const beam: BeamElement = {
    type: "beam",
    id: id("beam1"),
    probes: [],
    positionStart: P(0, 0),
    positionEnd: P(4, 0),
    fixedNodeStartID: undefined,
    fixedNodeEndID: undefined,
    fixedNodesBodyIDs: [],
  };
  const state = {
    type: "PlacingDistributedForceEnd" as const,
    startHover: edge(id("beam1")),
  };

  it("pas de force répartie existante → un seul CreateElement", () => {
    const r = handle_placing_element(
      state,
      { type: "Void" as const, position: P(2, -1) },
      [beam],
      [],
      [],
    );
    expect(r.actions).toHaveLength(1);
    expect(r.actions[0].type).toBe("CreateElement");
    expect(r.newCanvasState).toEqual({ type: "PlacingDistributedForceStart" });
  });

  it("force répartie existante sur la même poutre → DeleteElement + CreateElement", () => {
    const existing: DistributedForceElement = {
      type: "distributed-force",
      id: id("df1"),
      beamID: id("beam1"),
      direction: P(0, -1),
      magnitudeStart: 1,
      magnitudeEnd: 1,
      frame: "world",
    };
    const r = handle_placing_element(
      state,
      { type: "Void" as const, position: P(2, -1) },
      [beam],
      [],
      [existing],
    );
    expect(r.actions).toHaveLength(2);
    expect(r.actions[0]).toEqual({ type: "DeleteElement", element: existing });
    expect(r.actions[1].type).toBe("CreateElement");
  });

  it("force répartie sur une autre poutre → pas de remplacement", () => {
    const other: DistributedForceElement = {
      type: "distributed-force",
      id: id("df2"),
      beamID: id("beam2"),
      direction: P(0, -1),
      magnitudeStart: 1,
      magnitudeEnd: 1,
      frame: "world",
    };
    const r = handle_placing_element(
      state,
      { type: "Void" as const, position: P(2, -1) },
      [beam],
      [],
      [other],
    );
    expect(r.actions).toHaveLength(1);
    expect(r.actions[0].type).toBe("CreateElement");
  });
});

// ─── PlacingProbe ─────────────────────────────────────────────────────────────

describe("PlacingProbe", () => {
  const state = { type: "PlacingProbe" as const };

  it("hover Void → aucune action", () => {
    const r = handle_placing_element(state, VOID, [], [], []);
    expect(r.actions).toHaveLength(0);
  });

  it("hover Node → ouvre le sélecteur de métriques (PlacingProbeMetrics)", () => {
    const hover = node(id("n1"), P(3, 4));
    const r = handle_placing_element(state, hover, [], [], []);
    expect(r.actions).toHaveLength(0);
    expect(r.newCanvasState).toEqual({
      type: "PlacingProbeMetrics",
      elementID: id("n1"),
      position: P(3, 4),
    });
  });
});
