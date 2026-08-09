import { describe, expect, it } from "vitest";
import { handle_placing_constraint } from "./placing-constraint-actions";
import { Point2 } from "../../types/point2";
import type {
  BeamElement,
  ConstraintElement,
  ID,
  MechanicalElement,
} from "../../types/element";
import type { HoveredPart } from "../../types/hovered-part";

/**
 * A relation is imposed once. Placing a constraint over one that already says
 * the same thing replaces it rather than stacking a second on top.
 */

const EDGE = "00000000-0000-0000-0000-000000000001" as ID;
const EXISTING = "00000000-0000-0000-0000-000000000002" as ID;

const beam: BeamElement = {
  type: "beam",
  id: EDGE,
  probes: [],
  overlays: {},
  // Flatter than it is tall, so the alignment tool builds a horizontal one.
  positionStart: new Point2(0, 0),
  positionEnd: new Point2(100, 2),
  fixedNodeStartID: undefined,
  fixedNodeEndID: undefined,
  fixedNodesBodyIDs: [],
};

const mechanical: MechanicalElement[] = [beam];

const hovered: HoveredPart = {
  type: "Edge",
  position: new Point2(50, 1),
  id: EDGE,
  deleting: false,
  part: "body",
};

const align = (): ConstraintElement => ({
  type: "horizontal-align-edge",
  id: EXISTING,
  position: new Point2(50, 1),
  edgeID: EDGE,
});

describe("handle_placing_constraint", () => {
  it("évince la contrainte que la nouvelle répète", () => {
    const result = handle_placing_constraint(
      { type: "HorizontalVerticalConstraintStart" },
      hovered,
      mechanical,
      [align()],
    );

    const created = result.actions.filter((a) => a.type === "CreateElement");
    const deleted = result.actions.filter((a) => a.type === "DeleteElement");
    expect(created).toHaveLength(1);
    expect(deleted.map((a) => a.element.id)).toEqual([EXISTING]);
    // `apply_actions` routes the bundle on its first action.
    expect(result.actions[0].type).toBe("CreateElement");
  });

  it("n'évince rien quand la contrainte porte sur autre chose", () => {
    const other = { ...align(), edgeID: "00000000-0000-0000-0000-000000000003" as ID };
    const result = handle_placing_constraint(
      { type: "HorizontalVerticalConstraintStart" },
      hovered,
      mechanical,
      [other],
    );

    expect(result.actions.some((a) => a.type === "DeleteElement")).toBe(false);
  });
});
