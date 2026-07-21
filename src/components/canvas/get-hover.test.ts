import { describe, expect, it } from "vitest";
import { get_hovered_part } from "./get-hover";
import { Point2 } from "../../types/point2";
import type { CanvasState } from "../../types/canvas-state";
import type { HoveredPart } from "../../types/hovered-part";
import {
  BeamElement,
  BeltElement,
  ConstraintElement,
  DimensionEdgeElement,
  ForceElement,
  GearElement,
  ID,
  JoinElement,
  LoadElement,
  MassElement,
  MechanicalElement,
  MomentElement,
  PivotElement,
  SpringElement,
} from "../../types";

/**
 * Characterisation of the hover: every canvas state probed against every target
 * family, at points chosen to land on each part.
 *
 * It exists to make `get-hover` refactorable. The snapshot is not a specification
 * — `doc/hover-matrix.md` is — but any line that moves without a matching change
 * in that document is a regression.
 */

const id = (s: string) => `00000000-0000-0000-0000-${s.padStart(12, "0")}` as ID;
const P = (x: number, y: number) => new Point2(x, y);

const AXLE = id("a1");
const GEAR = id("g1");
const JOIN = id("j1");
const BEAM = id("b1");
const SPRING = id("s1");
const MASS = id("m1");
const BELT_AXLE = id("a2");
const BELT_GEAR = id("g2");
const BELT = id("be1");
const PLAIN_BELT = id("be2");
const DIM = id("d1");
const FORCE = id("f1");
const MOMENT = id("mo1");

// An axle carrying a gear, so PlacingMomentStart can reach the gear through it.
const axle: PivotElement = {
  type: "pivot",
  id: AXLE,
  probes: [],
  overlays: {},
  position: P(0, 0),
  isGrounded: false,
  rotatingEdgesIDs: [],
  fixedGearsIDs: [GEAR],
};
const gear: GearElement = {
  type: "gear",
  id: GEAR,
  probes: [],
  overlays: {},
  position: P(0, 0),
  angle: 0,
  radius: 60,
  parentAxleID: AXLE,
  fixedNodesBodyIDs: [],
  meshedGearsIDs: [],
  attachedBeltID: undefined,
};
const join: JoinElement = {
  type: "join",
  id: JOIN,
  probes: [],
  overlays: {},
  position: P(200, 0),
  isGrounded: false,
  fixedEdgesIDs: [BEAM],
};
const beam: BeamElement = {
  type: "beam",
  id: BEAM,
  probes: [],
  overlays: {},
  positionStart: P(200, 0),
  positionEnd: P(400, 0),
  fixedNodeStartID: JOIN,
  fixedNodeEndID: undefined,
  fixedNodesBodyIDs: [],
};
const spring: SpringElement = {
  type: "spring",
  id: SPRING,
  probes: [],
  overlays: {},
  positionStart: P(200, 200),
  positionEnd: P(400, 200),
  fixedNodeStartID: undefined,
  fixedNodeEndID: undefined,
  stiffness: 1,
};
const mass: MassElement = {
  type: "mass",
  id: MASS,
  probes: [],
  overlays: {},
  position: P(600, 0),
  isGrounded: false,
  fixedEdgesIDs: [],
  mass: 1,
};
const beltAxle: PivotElement = {
  type: "pivot",
  id: BELT_AXLE,
  probes: [],
  overlays: {},
  position: P(300, -360),
  isGrounded: false,
  rotatingEdgesIDs: [],
  fixedGearsIDs: [BELT_GEAR],
};
const beltGear: GearElement = {
  type: "gear",
  id: BELT_GEAR,
  probes: [],
  overlays: {},
  position: P(300, -360),
  angle: 0,
  radius: 40,
  parentAxleID: BELT_AXLE,
  fixedNodesBodyIDs: [],
  meshedGearsIDs: [],
  attachedBeltID: BELT,
};
const belt: BeltElement = {
  type: "belt",
  id: BELT,
  probes: [],
  overlays: {},
  positionStart: P(0, -300),
  positionEnd: P(600, -300),
  fixedNodeStartID: undefined,
  fixedNodeEndID: undefined,
  attachedGearsIDs: [{ id: BELT_GEAR, direction: false }],
  closed: false,
};

// A belt with no pulley, so its single straight run lies on a known line — the
// runs of the wrapped belt above are tangents, and land nowhere obvious.
const plainBelt: BeltElement = {
  type: "belt",
  id: PLAIN_BELT,
  probes: [],
  overlays: {},
  positionStart: P(0, -500),
  positionEnd: P(600, -500),
  fixedNodeStartID: undefined,
  fixedNodeEndID: undefined,
  attachedGearsIDs: [],
  closed: false,
};

const MECHANICAL: MechanicalElement[] = [
  axle,
  gear,
  join,
  beam,
  spring,
  mass,
  beltAxle,
  beltGear,
  belt,
  plainBelt,
];

const dimension: DimensionEdgeElement = {
  type: "dimension-edge",
  id: DIM,
  position: P(300, 80),
  edgeID: BEAM,
  value: 200,
};
const CONSTRAINTS: ConstraintElement[] = [dimension];

const force: ForceElement = {
  type: "force",
  id: FORCE,
  targetID: MASS,
  vector: P(0, 40),
  frame: "world",
};
const moment: MomentElement = {
  type: "moment",
  id: MOMENT,
  targetID: SPRING,
  value: 30,
};
const LOADS: LoadElement[] = [force, moment];

const VISIBLE_CONSTRAINTS = new Map<ID, number>([[DIM, 1]]);

/** Where the cursor is put, one per part the hover can resolve. */
const PROBES: [string, Point2][] = [
  ["axle centre", P(0, 0)],
  ["gear rim", P(60, 0)],
  ["gear inside", P(30, 0)],
  ["join centre", P(200, 0)],
  ["beam body", P(300, 0)],
  ["beam end", P(400, 0)],
  ["beam body past join", P(150, 0)],
  ["spring body", P(300, 200)],
  ["spring start", P(200, 200)],
  ["mass centre", P(600, 0)],
  ["belt start", P(0, -300)],
  ["belt arc", P(300, -320)],
  ["plain belt run", P(300, -500)],
  ["plain belt end", P(600, -500)],
  ["dimension", P(300, 80)],
  ["force arrow", P(600, 20)],
  ["empty space", P(900, 900)],
];

const nodeHover = (id: ID, at: Point2): HoveredPart => ({
  type: "Node",
  position: at,
  id,
  deleting: false,
  beamBodyHover: false,
});
const edgeHover = (id: ID, at: Point2): HoveredPart => ({
  type: "Edge",
  position: at,
  id,
  deleting: false,
  part: "start",
});
/** One representative payload per canvas state. */
const STATES: CanvasState[] = [
  { type: "Selecting" },
  { type: "SelectingMultiple", startPos: P(0, 0), elementIDs: [], hoveredElementIDs: [] },
  { type: "SelectedMultiple", elementIDs: [BEAM] },
  { type: "SelectedElement", elementID: BEAM },
  { type: "MovingNode", elementID: JOIN },
  { type: "MovingEdgeStartPoint", elementID: BEAM },
  { type: "MovingEdgeEndPoint", elementID: BEAM },
  { type: "MovingEdgeBody", elementID: BEAM, t: 0.5 },
  { type: "MovingBeltBody", elementID: BELT, section: 0 },
  { type: "ChangingGearRadius", elementID: GEAR },
  { type: "MovingForce", elementID: FORCE },
  { type: "MovingDistributedForce", elementID: FORCE, part: "start" },
  { type: "MovingMoment", elementID: MOMENT },
  { type: "MovingSelectionMultiple", elementIDs: [BEAM], grabbedID: BEAM, hasMoved: false },
  { type: "Erasing" },
  { type: "ErasingMultiple", startPos: P(0, 0), hoveredElementIDs: [] },
  { type: "PlacingBeamStart" },
  { type: "PlacingBeamEnd", startHover: nodeHover(AXLE, P(0, 0)) },
  { type: "PlacingSpringStart" },
  { type: "PlacingSpringEnd", startHover: nodeHover(AXLE, P(0, 0)) },
  { type: "PlacingDamperStart" },
  { type: "PlacingDamperEnd", startHover: nodeHover(AXLE, P(0, 0)) },
  { type: "PlacingBeltStart" },
  { type: "PlacingBeltEnd", startHover: nodeHover(AXLE, P(0, 0)), attachedGearsIDs: [] },
  { type: "PlacingMotor" },
  { type: "PlacingPivot" },
  { type: "PlacingSlider" },
  { type: "PlacingJoin" },
  { type: "PlacingMass" },
  { type: "PlacingGearStart" },
  { type: "PlacingGearRadius", startHover: nodeHover(JOIN, P(200, 0)) },
  { type: "PlacingGround" },
  { type: "PlacingForceStart" },
  { type: "PlacingForceEnd", startHover: nodeHover(MASS, P(600, 0)) },
  { type: "PlacingDistributedForce", startHover: edgeHover(BEAM, P(300, 0)) },
  { type: "PlacingMomentStart" },
  { type: "PlacingMomentEnd", startHover: edgeHover(BEAM, P(300, 0)) },
  { type: "PlacingProbe" },
  { type: "PlacingProbeMetrics", elementID: BEAM, position: P(300, 0) },
  { type: "DimensionStart" },
  { type: "DimensionNode", nodeID: JOIN },
  { type: "DimensionEdge", edgeID: BEAM },
  { type: "DimensionNodeToNode", startNodeID: JOIN, endNodeID: MASS },
  { type: "DimensionEdgeToNode", edgeID: BEAM, nodeID: MASS },
  { type: "DimensionAngle", startEdgeID: BEAM, endEdgeID: SPRING },
  { type: "DimensionRadius", gearID: GEAR },
  { type: "DimensionBelt", beltID: BELT },
  { type: "HorizontalVerticalConstraintStart" },
  { type: "HorizontalVerticalConstraintNode", startNodeID: JOIN },
  { type: "NormalConstraintStart" },
  { type: "NormalConstraintEdge", startEdgeID: BEAM },
  { type: "ParallelConstraintStart" },
  { type: "ParallelConstraintEdge", startEdgeID: BEAM },
  { type: "EqualConstraintStart" },
  { type: "EqualConstraintEdge", startEdgeID: BEAM },
  { type: "EqualConstraintGear", startGearID: GEAR },
  { type: "GearRatioConstraintStart" },
  { type: "GearRatioConstraintGear", startGearID: GEAR },
  { type: "MovingConstraint", elementID: DIM },
  { type: "PlacingValue", elementID: DIM, value: 200 },
  { type: "EditingValue", elementID: DIM, value: 200 },
  { type: "SimulationDragging", grabbedKey: BEAM, elementID: BEAM },
];

const NAMES = new Map<ID, string>([
  [AXLE, "axle"],
  [GEAR, "gear"],
  [JOIN, "join"],
  [BEAM, "beam"],
  [SPRING, "spring"],
  [MASS, "mass"],
  [BELT_AXLE, "belt-axle"],
  [BELT_GEAR, "belt-gear"],
  [BELT, "belt"],
  [PLAIN_BELT, "plain-belt"],
  [DIM, "dim"],
  [FORCE, "force"],
  [MOMENT, "moment"],
]);

const round = (n: number) => Math.round(n * 100) / 100;

/** A hover as one legible line: what was picked, where, and with which flags. */
function describe_hover(part: HoveredPart): string {
  const at = `(${round(part.position.x)}, ${round(part.position.y)})`;
  if (part.type === "Void")
    return part.rejected ? `Void ${at} rejected:${part.rejected}` : `Void ${at}`;
  if (part.type === "BeltClosure") return `BeltClosure ${at}`;
  const who = NAMES.get(part.id) ?? part.id;
  const flags: string[] = [];
  if (part.type === "Edge") flags.push(part.part);
  if (part.type === "BeltBody") flags.push(`section ${part.section}`);
  if (part.type === "Node" && part.beamBodyHover) flags.push("beamBodyHover");
  if (part.type !== "BeltBody" && part.deleting) flags.push("deleting");
  const suffix = flags.length ? ` [${flags.join(", ")}]` : "";
  return `${part.type} ${who} ${at}${suffix}`;
}

describe("get_hovered_part", () => {
  it("pique la même chose qu'avant sur toute la matrice état × cible", () => {
    const lines: string[] = [];
    for (const state of STATES) {
      lines.push(`── ${state.type}`);
      for (const [label, cursor] of PROBES) {
        const hovered = get_hovered_part(
          MECHANICAL,
          CONSTRAINTS,
          LOADS,
          VISIBLE_CONSTRAINTS,
          cursor,
          state,
        );
        lines.push(`   ${label.padEnd(22)} → ${describe_hover(hovered)}`);
      }
    }
    expect(lines.join("\n")).toMatchSnapshot();
  });
});
