import { describe, expect, it } from "vitest";
import { Point2 } from "../../../types/point2";
import type {
  BeltElement,
  GearElement,
  ID,
  MechanicalElement,
  PivotElement,
} from "../../../types/element";
import type { HoveredPart } from "../../../types/hovered-part";
import { DEFAULT_FLOOR, ZERO, type ViewportState } from "../../../types";
import { INTERACTION_SPECS } from "../../../constants/interaction-specs";
import { get_belt_path } from "../../../utils/belt-geom";
import { belt_pieces } from "../../../utils/belt-path";
import { get_hovered_part } from "../picking/get-hover";
import { gear_on_run } from "./gear-on-run";
import { handle_placing_element } from "./placing-element-actions";

const P = (x: number, y: number) => new Point2(x, y);
const VIEWPORT: ViewportState = { scale: 1, pan: ZERO };

const axle = (id: string, x: number, gearID: string): PivotElement => ({
  type: "pivot",
  id: id as ID,
  probes: [],
  overlays: {},
  position: P(x, 0),
  isGrounded: true,
  rotatingEdgesIDs: [],
  fixedGearsIDs: [gearID as ID],
  motor: undefined,
  rotationalFriction: 0,
});
const gear = (id: string, x: number, axleID: string): GearElement => ({
  type: "gear",
  id: id as ID,
  probes: [],
  overlays: {},
  position: P(x, 0),
  angle: 0,
  radius: 40,
  parentAxleID: axleID as ID,
  fixedNodesBodyIDs: [],
  meshedGearsIDs: [],
  attachedBeltID: "belt" as ID,
  surfaceMass: 1,
});
const belt: BeltElement = {
  type: "belt",
  id: "belt" as ID,
  probes: [],
  overlays: {},
  positionStart: P(-100, 200),
  positionEnd: P(400, 200),
  fixedNodeStartID: undefined,
  fixedNodeEndID: undefined,
  attachedGearsIDs: [
    { id: "a" as ID, clockwise: false },
    { id: "b" as ID, clockwise: false },
  ],
  closed: false,
};
const MECH: MechanicalElement[] = [
  axle("ax-a", 0, "a"),
  gear("a", 0, "ax-a"),
  axle("ax-b", 300, "b"),
  gear("b", 300, "ax-b"),
  belt,
];

/** The run between the two pulleys, and its middle. */
const { vias, closed } = get_belt_path(belt, MECH);
const pieces = belt_pieces(vias, closed);
const section = pieces.findIndex(
  (piece, i) => piece.kind === "segment" && i > 0 && i < pieces.length - 1,
);
const run = pieces[section] as Extract<(typeof pieces)[number], { kind: "segment" }>;
const middle = run.from.lerp(run.to, 0.5);
const normal = run.to.sub(run.from).normalize().perp();
const contact: Extract<HoveredPart, { type: "BeltBody" }> = {
  type: "BeltBody",
  id: belt.id,
  position: middle,
  deleting: false,
  section,
};

describe("a gear laid against a belt run", () => {
  it("is offered the run under the cursor as its first step", () => {
    const hovered = get_hovered_part(
      MECH,
      [],
      [],
      new Map(),
      middle.add(normal.mul(3)),
      { type: "PlacingGearStart" },
      VIEWPORT,
      DEFAULT_FLOOR,
    );
    expect(hovered).toMatchObject({ type: "BeltBody", id: belt.id, section });
  });

  it("grows on the side of the run the cursor is on, its rim under the cursor", () => {
    const along = run.to.sub(run.from).normalize();
    for (const side of [1, -1])
      for (const slant of [0, 30]) {
        const rim = middle.add(normal.mul(side * 80)).add(along.mul(slant));
        const laid = gear_on_run(contact, rim, MECH, VIEWPORT)!;
        expect(laid.center.distance_to(rim)).toBeCloseTo(laid.radius);
        // Pressed into the run by the same overlap a gear sized onto a run gets.
        expect(laid.center.sub(middle).dot(normal)).toBeCloseTo(
          side * (laid.radius - INTERACTION_SPECS.GEAR_ON_BELT_GROW),
        );
      }
  });

  it("is put down on an axle of its own, inserted into the run", () => {
    const { actions, newCanvasState } = handle_placing_element(
      { type: "PlacingGearRadius", startHover: contact },
      { type: "Void", position: middle.add(normal.mul(80)) },
      MECH,
      [],
      [],
      [],
      [],
      VIEWPORT,
    );
    const created = actions.flatMap((a) => (a.type === "CreateElement" ? [a.element] : []));
    expect(created.map((e) => e.type).sort()).toEqual(["gear", "pivot"]);
    const newGear = created.find((e) => e.type === "gear")!;
    expect(actions).toContainEqual(
      expect.objectContaining({
        type: "ConnectsAttachedGears",
        elementID: belt.id,
        connectID: newGear.id,
      }),
    );
    expect(newCanvasState).toEqual({ type: "PlacingGearStart" });
  });
});
