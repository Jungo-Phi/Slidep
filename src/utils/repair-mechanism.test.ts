import { describe, expect, it } from "vitest";
import { repair_mechanism } from "./repair-mechanism";
import { validate_mechanism } from "./validate-mechanism";
import { DEFAULT_METADATA, Mechanism } from "../types/mechanism";
import { Point2 } from "../types/point2";
import {
  BeamElement,
  BeltElement,
  ConstraintElement,
  ForceElement,
  GearElement,
  ID,
  LoadElement,
  MechanicalElement,
  PivotElement,
} from "../types";

const id = (s: string) =>
  `00000000-0000-0000-0000-${s.padStart(12, "0")}` as ID;
const P = (x: number, y: number) => new Point2(x, y);

const PIVOT_ID = id("p1");
const BEAM_ID = id("b1");
const AXLE_ID = id("p2");
const GEAR_ID = id("g1");
const BELT_ID = id("t1");
const GHOST_ID = id("dead");

function mechanism(
  mechanicalElements: MechanicalElement[],
  constraintElements: ConstraintElement[] = [],
  loads: LoadElement[] = [],
): Mechanism {
  return {
    metadata: DEFAULT_METADATA,
    viewport: { zoom: 1, pan: P(0, 0) },
    mechanicalElements,
    constraintElements,
    loads,
    history: [[{ type: "SetShowOverlay", elementID: PIVOT_ID }]] as never,
    future: [],
  };
}

function pivot(over: Partial<PivotElement> = {}): PivotElement {
  return {
    type: "pivot",
    id: PIVOT_ID,
    probes: [],
    overlays: {},
    position: P(0, 0),
    isGrounded: false,
    rotatingEdgesIDs: [BEAM_ID],
    fixedGearsIDs: [],
    ...over,
  };
}

function beam(over: Partial<BeamElement> = {}): BeamElement {
  return {
    type: "beam",
    id: BEAM_ID,
    probes: [],
    overlays: {},
    positionStart: P(0, 0),
    positionEnd: P(10, 0),
    fixedNodeStartID: PIVOT_ID,
    fixedNodeEndID: undefined,
    fixedNodesBodyIDs: [],
    ...over,
  };
}

function gear(over: Partial<GearElement> = {}): GearElement {
  return {
    type: "gear",
    id: GEAR_ID,
    probes: [],
    overlays: {},
    position: P(0, 0),
    angle: 0,
    radius: 10,
    parentAxleID: AXLE_ID,
    fixedNodesBodyIDs: [],
    meshedGearsIDs: [],
    attachedBeltID: undefined,
    ...over,
  };
}

function belt(over: Partial<BeltElement> = {}): BeltElement {
  return {
    type: "belt",
    id: BELT_ID,
    probes: [],
    overlays: {},
    positionStart: P(0, 0),
    positionEnd: P(10, 0),
    fixedNodeStartID: undefined,
    fixedNodeEndID: undefined,
    attachedGearsIDs: [],
    closed: true,
    ...over,
  };
}

function force(over: Partial<ForceElement> = {}): ForceElement {
  return {
    type: "force",
    id: id("f1"),
    targetID: PIVOT_ID,
    vector: P(0, 1),
    frame: "world",
    ...over,
  };
}

describe("repair_mechanism", () => {
  it("leaves a sound mechanism strictly untouched", () => {
    const sound = mechanism([pivot(), beam()]);
    const { mechanism: result, repairs } = repair_mechanism(sound);
    expect(repairs).toEqual([]);
    // Same object, so callers can memoize on identity.
    expect(result).toBe(sound);
  });

  it("drops a dead ID from a list", () => {
    const { mechanism: result, repairs } = repair_mechanism(
      mechanism([pivot({ rotatingEdgesIDs: [BEAM_ID, GHOST_ID] }), beam()]),
    );
    const repaired = result.mechanicalElements[0] as PivotElement;
    expect(repaired.rotatingEdgesIDs).toEqual([BEAM_ID]);
    expect(repairs.map((r) => r.code)).toEqual(["REFERENCE_DROPPED"]);
  });

  it("clears an optional single reference", () => {
    const { mechanism: result } = repair_mechanism(
      mechanism([pivot(), beam({ fixedNodeEndID: GHOST_ID })]),
    );
    expect((result.mechanicalElements[1] as BeamElement).fixedNodeEndID).toBe(
      undefined,
    );
  });

  it("removes an element whose required reference is dead", () => {
    const { mechanism: result, repairs } = repair_mechanism(
      mechanism([gear({ parentAxleID: GHOST_ID })]),
    );
    expect(result.mechanicalElements).toEqual([]);
    expect(repairs.map((r) => r.code)).toEqual(["ELEMENT_REMOVED"]);
  });

  it("removes an element whose required reference is absent altogether", () => {
    const { mechanism: result } = repair_mechanism(
      mechanism([gear({ parentAxleID: undefined as unknown as ID })]),
    );
    expect(result.mechanicalElements).toEqual([]);
  });

  it("treats a reference to the wrong kind of element as dead", () => {
    // A gear's axle must be a pivot or a slidep; here it names a beam.
    const { mechanism: result } = repair_mechanism(
      mechanism([beam(), gear({ parentAxleID: BEAM_ID })]),
    );
    expect(result.mechanicalElements.map((el) => el.type)).toEqual(["beam"]);
  });

  it("cascades until no reference is left dangling", () => {
    // The gear goes with its dead axle, and the belt that held it must follow.
    const orphan = gear({ parentAxleID: GHOST_ID, attachedBeltID: BELT_ID });
    const { mechanism: result } = repair_mechanism(
      mechanism([
        orphan,
        belt({ attachedGearsIDs: [{ id: GEAR_ID, direction: true }] }),
      ]),
    );
    const survivor = result.mechanicalElements[0] as BeltElement;
    expect(result.mechanicalElements).toHaveLength(1);
    expect(survivor.attachedGearsIDs).toEqual([]);
  });

  it("clears the simulation caches that index into a belt's gear list", () => {
    const { mechanism: result } = repair_mechanism(
      mechanism([
        belt({
          attachedGearsIDs: [{ id: GHOST_ID, direction: true }],
          disconnectedGearIndices: [0],
          gearWraps: [1.5],
        }),
      ]),
    );
    const repaired = result.mechanicalElements[0] as BeltElement;
    expect(repaired.attachedGearsIDs).toEqual([]);
    expect(repaired.disconnectedGearIndices).toBe(undefined);
    expect(repaired.gearWraps).toBe(undefined);
  });

  it("removes the whole motor rather than leaving it without a beam", () => {
    // A motor with neither ground nor beam is invalid in itself.
    const { mechanism: result } = repair_mechanism(
      mechanism([pivot({ motor: { parentBeamID: GHOST_ID, speed: 60 } })]),
    );
    expect((result.mechanicalElements[0] as PivotElement).motor).toBe(
      undefined,
    );
  });

  it("falls a load's frame back to world when its edge is gone", () => {
    const { mechanism: result } = repair_mechanism(
      mechanism(
        [pivot(), beam()],
        [],
        [force({ frame: { mode: "edge", edgeID: GHOST_ID } })],
      ),
    );
    expect((result.loads[0] as ForceElement).frame).toBe("world");
  });

  it("removes a load whose host is gone", () => {
    const { mechanism: result } = repair_mechanism(
      mechanism([beam()], [], [force({ targetID: GHOST_ID })]),
    );
    expect(result.loads).toEqual([]);
  });

  it("removes a constraint that names a missing element", () => {
    const dimension = {
      type: "dimension-edge",
      id: id("d1"),
      position: P(0, 0),
      edgeID: GHOST_ID,
      value: 10,
    } as ConstraintElement;
    const { mechanism: result } = repair_mechanism(
      mechanism([beam()], [dimension]),
    );
    expect(result.constraintElements).toEqual([]);
  });

  it("empties the history as soon as it repairs anything", () => {
    const { mechanism: result } = repair_mechanism(
      mechanism([pivot(), beam({ fixedNodeEndID: GHOST_ID })]),
    );
    expect(result.history).toEqual([]);
    expect(result.future).toEqual([]);
  });

  it("leaves no reference error behind, and is idempotent", () => {
    const damaged = mechanism(
      [
        pivot({ rotatingEdgesIDs: [BEAM_ID, GHOST_ID] }),
        beam({ fixedNodeEndID: GHOST_ID }),
        gear({ parentAxleID: GHOST_ID }),
        belt({ attachedGearsIDs: [{ id: GHOST_ID, direction: false }] }),
      ],
      [],
      [force({ frame: { mode: "edge", edgeID: GHOST_ID } })],
    );

    const { mechanism: once } = repair_mechanism(damaged);
    const { mechanism: twice, repairs: second } = repair_mechanism(once);
    expect(second).toEqual([]);
    expect(twice).toBe(once);

    // Reference errors are the ones repair promises to clear. Reciprocity and
    // domain rules are the validator's business, not its.
    const referenceCodes = ["MISSING_REFERENCE", "WRONG_TYPE"];
    const remaining = validate_mechanism(once) ?? [];
    expect(remaining.filter((e) => referenceCodes.includes(e.code))).toEqual(
      [],
    );
  });
});
