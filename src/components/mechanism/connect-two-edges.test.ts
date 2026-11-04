import { describe, expect, it } from "vitest";
import { Point2 } from "../../types/point2";
import type {
  BeamElement,
  BeltElement,
  GearElement,
  ID,
  MechanicalElement,
} from "../../types/element";
import type { HoveredPart } from "../../types/hovered-part";
import { connect_elements } from "./connect-actions";

const P = (x: number, y: number) => new Point2(x, y);

const beam: BeamElement = {
  type: "beam",
  id: "beam" as ID,
  probes: [],
  overlays: {},
  positionStart: P(0, 0),
  positionEnd: P(100, 0),
  fixedNodeStartID: undefined,
  fixedNodeEndID: undefined,
  fixedNodesBodyIDs: [],
  materialID: "m" as ID,
  profileID: "p" as ID,
};
const gear: GearElement = {
  type: "gear",
  id: "gear" as ID,
  probes: [],
  overlays: {},
  position: P(140, 0),
  angle: 0,
  radius: 40,
  parentAxleID: "axle" as ID,
  fixedNodesBodyIDs: [],
  meshedGearsIDs: [],
  attachedBeltID: undefined,
  surfaceMass: 1,
};
const belt: BeltElement = {
  type: "belt",
  id: "belt" as ID,
  probes: [],
  overlays: {},
  positionStart: P(100, 0),
  positionEnd: P(100, 200),
  fixedNodeStartID: undefined,
  fixedNodeEndID: undefined,
  attachedGearsIDs: [],
  closed: false,
};
const MECH: MechanicalElement[] = [beam, gear, belt];

const beamEnd: HoveredPart = {
  type: "Edge",
  id: beam.id,
  position: beam.positionEnd,
  deleting: false,
  part: "end",
};
const created = (actions: ReturnType<typeof connect_elements>) =>
  actions.flatMap((a) => (a.type === "CreateElement" ? [a.element.type] : []));

describe("the node two elements are connected by", () => {
  it("is a pivot for a beam hooked onto a gear's rim: a crank pin", () => {
    const actions = connect_elements(
      { type: "GearTooth", id: gear.id, position: P(100, 0), deleting: false },
      beam,
      beamEnd,
      MECH,
      [],
    );
    expect(created(actions)).toEqual(["pivot"]);
  });

  it("is a join when asked to weld", () => {
    const other: BeamElement = { ...beam, id: "other" as ID, positionStart: P(100, 0), positionEnd: P(100, 100) };
    const actions = connect_elements(
      beamEnd,
      other,
      { ...beamEnd, id: other.id, position: other.positionStart, part: "start" },
      [...MECH, other],
      [],
      [],
      { weld: true },
    );
    expect(created(actions)).toEqual(["join"]);
  });

  it("stays a join for a belt terminal, the only node a belt end is held by", () => {
    const actions = connect_elements(
      beamEnd,
      belt,
      { ...beamEnd, id: belt.id, position: belt.positionStart, part: "start" },
      MECH,
      [],
    );
    expect(created(actions)).toEqual(["join"]);
  });
});
