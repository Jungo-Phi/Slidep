import { describe, it, expect } from "vitest";
import { actionReducer } from "./action-reducer";
import { DEFAULT_METADATA, Mechanism } from "../../types/mechanism";
import { Point2 } from "../../types/point2";
import {
  BeamElement,
  ForceElement,
  ID,
  MomentElement,
  PivotElement,
} from "../../types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const id = (s: string) =>
  `00000000-0000-0000-0000-${s.padStart(12, "0")}` as ID;
const P = (x: number, y: number) => new Point2(x, y);

function emptyMechanism(): Mechanism {
  return {
    metadata: DEFAULT_METADATA,
    viewport: { zoom: 1, pan: P(0, 0) },
    mechanicalElements: [],
    constraintElements: [],
    loads: [],
    history: [],
    future: [],
  };
}

const BEAM: BeamElement = {
  type: "beam",
  id: id("beam1"),
  probes: [],
  positionStart: P(0, 0),
  positionEnd: P(1, 0),
  fixedNodeStartID: undefined,
  fixedNodeEndID: undefined,
  fixedNodesBodyIDs: [],
};

const PIVOT: PivotElement = {
  type: "pivot",
  id: id("pivot1"),
  probes: [],
  showTrajectory: false,
  position: P(0, 0),
  isGrounded: false,
  rotatingEdgesIDs: [],
  fixedGearsIDs: [],
};

const FORCE: ForceElement = {
  type: "force",
  id: id("force1"),
  targetID: id("pivot1"),
  anchor: undefined,
  vector: P(0, -1),
};

const MOMENT: MomentElement = {
  type: "moment",
  id: id("moment1"),
  beamID: id("beam1"),
  value: 5,
  clockwise: true,
};

// ─── CreateElement / DeleteElement — mechanical ───────────────────────────────

describe("actionReducer — CreateElement / DeleteElement (mécanique)", () => {
  it("CreateElement beam → ajouté à mechanicalElements", () => {
    const result = actionReducer(
      emptyMechanism(),
      [{ type: "CreateElement", element: BEAM }],
      false,
    );
    expect(result.mechanicalElements).toHaveLength(1);
    expect(result.mechanicalElements[0].id).toBe(id("beam1"));
  });

  it("DeleteElement beam → retiré de mechanicalElements", () => {
    const mech = { ...emptyMechanism(), mechanicalElements: [BEAM] };
    const result = actionReducer(
      mech,
      [{ type: "DeleteElement", element: BEAM }],
      false,
    );
    expect(result.mechanicalElements).toHaveLength(0);
  });

  it("CreateElement revert=true → supprime l'élément (undo)", () => {
    const mech = { ...emptyMechanism(), mechanicalElements: [BEAM] };
    const result = actionReducer(
      mech,
      [{ type: "CreateElement", element: BEAM }],
      true,
    );
    expect(result.mechanicalElements).toHaveLength(0);
  });

  it("DeleteElement revert=true → remet l'élément (undo d'une suppression)", () => {
    const result = actionReducer(
      emptyMechanism(),
      [{ type: "DeleteElement", element: BEAM }],
      true,
    );
    expect(result.mechanicalElements).toHaveLength(1);
    expect(result.mechanicalElements[0].id).toBe(id("beam1"));
  });
});

// ─── CreateElement / DeleteElement — loads ────────────────────────────────────

describe("actionReducer — CreateElement / DeleteElement (charges)", () => {
  it("CreateElement force → ajoutée à loads", () => {
    const result = actionReducer(
      emptyMechanism(),
      [{ type: "CreateElement", element: FORCE }],
      false,
    );
    expect(result.loads).toHaveLength(1);
    expect(result.loads[0].id).toBe(id("force1"));
  });

  it("CreateElement moment → ajouté à loads", () => {
    const result = actionReducer(
      emptyMechanism(),
      [{ type: "CreateElement", element: MOMENT }],
      false,
    );
    expect(result.loads).toHaveLength(1);
    expect(result.loads[0].id).toBe(id("moment1"));
  });

  it("DeleteElement force → retirée de loads", () => {
    const mech = { ...emptyMechanism(), loads: [FORCE] };
    const result = actionReducer(
      mech,
      [{ type: "DeleteElement", element: FORCE }],
      false,
    );
    expect(result.loads).toHaveLength(0);
  });

  it("CreateElement force revert=true → supprime la force (undo)", () => {
    const mech = { ...emptyMechanism(), loads: [FORCE] };
    const result = actionReducer(
      mech,
      [{ type: "CreateElement", element: FORCE }],
      true,
    );
    expect(result.loads).toHaveLength(0);
  });

  it("plusieurs forces différentes coexistent sans interférence", () => {
    const force2: ForceElement = {
      ...FORCE,
      id: id("force2"),
      targetID: id("beam1"),
    };
    const result = actionReducer(
      emptyMechanism(),
      [
        { type: "CreateElement", element: FORCE },
        { type: "CreateElement", element: force2 },
      ],
      false,
    );
    expect(result.loads).toHaveLength(2);
  });
});

// ─── UpdateElementName ────────────────────────────────────────────────────────

describe("actionReducer — UpdateElementName", () => {
  it("met à jour le nom (forward)", () => {
    const mech = { ...emptyMechanism(), mechanicalElements: [BEAM] };
    const result = actionReducer(
      mech,
      [
        {
          type: "UpdateElementName",
          id: id("beam1"),
          oldName: undefined,
          newName: "Poutre A",
        },
      ],
      false,
    );
    expect(result.mechanicalElements[0].name).toBe("Poutre A");
  });

  it("restaure l'ancien nom (revert=true)", () => {
    const beam = { ...BEAM, name: "Poutre A" };
    const mech = { ...emptyMechanism(), mechanicalElements: [beam] };
    const result = actionReducer(
      mech,
      [
        {
          type: "UpdateElementName",
          id: id("beam1"),
          oldName: undefined,
          newName: "Poutre A",
        },
      ],
      true,
    );
    expect(result.mechanicalElements[0].name).toBeUndefined();
  });
});

// ─── GroundNode ───────────────────────────────────────────────────────────────

describe("actionReducer — GroundNode", () => {
  it("ancre un nœud (grounded: true)", () => {
    const mech = { ...emptyMechanism(), mechanicalElements: [PIVOT] };
    const result = actionReducer(
      mech,
      [{ type: "GroundNode", id: id("pivot1"), grounded: true }],
      false,
    );
    const pivot = result.mechanicalElements[0] as PivotElement;
    expect(pivot.isGrounded).toBe(true);
  });

  it("désancre un nœud (grounded: false)", () => {
    const pivot = { ...PIVOT, isGrounded: true };
    const mech = { ...emptyMechanism(), mechanicalElements: [pivot] };
    const result = actionReducer(
      mech,
      [{ type: "GroundNode", id: id("pivot1"), grounded: false }],
      false,
    );
    const p = result.mechanicalElements[0] as PivotElement;
    expect(p.isGrounded).toBe(false);
  });
});

// ─── MoveForceVector ──────────────────────────────────────────────────────────

describe("actionReducer — MoveForceVector", () => {
  it("met à jour le vecteur de la force (forward)", () => {
    const mech = { ...emptyMechanism(), loads: [FORCE] };
    const result = actionReducer(
      mech,
      [
        {
          type: "MoveForceVector",
          id: id("force1"),
          oldVector: FORCE.vector,
          newVector: P(1, -2),
        },
      ],
      false,
    );
    const force = result.loads[0] as ForceElement;
    expect(force.vector.x).toBe(1);
    expect(force.vector.y).toBe(-2);
  });

  it("restaure l'ancien vecteur (revert=true)", () => {
    const force = { ...FORCE, vector: P(1, -2) };
    const mech = { ...emptyMechanism(), loads: [force] };
    const result = actionReducer(
      mech,
      [
        {
          type: "MoveForceVector",
          id: id("force1"),
          oldVector: P(0, -1),
          newVector: P(1, -2),
        },
      ],
      true,
    );
    const f = result.loads[0] as ForceElement;
    expect(f.vector.x).toBe(0);
    expect(f.vector.y).toBe(-1);
  });
});

// ─── ChangeMomentValue / FlipMomentDirection ──────────────────────────────────

describe("actionReducer — moment", () => {
  it("ChangeMomentValue met à jour la valeur", () => {
    const mech = { ...emptyMechanism(), loads: [MOMENT] };
    const result = actionReducer(
      mech,
      [
        {
          type: "ChangeMomentValue",
          id: id("moment1"),
          oldValue: 5,
          newValue: 10,
        },
      ],
      false,
    );
    const m = result.loads[0] as MomentElement;
    expect(m.value).toBe(10);
  });

  it("FlipMomentDirection inverse le sens", () => {
    const mech = { ...emptyMechanism(), loads: [MOMENT] };
    const result = actionReducer(
      mech,
      [{ type: "FlipMomentDirection", id: id("moment1") }],
      false,
    );
    const m = result.loads[0] as MomentElement;
    expect(m.clockwise).toBe(false);
  });
});
