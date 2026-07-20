import { afterEach, describe, expect, it, vi } from "vitest";
import { assert_actions_preserve_validity } from "./assert-mechanism";
import { DEFAULT_METADATA, Mechanism } from "../types/mechanism";
import { Point2 } from "../types/point2";
import {
  Action,
  BeamElement,
  ID,
  MechanicalElement,
  PivotElement,
} from "../types";

const id = (s: string) =>
  `00000000-0000-0000-0000-${s.padStart(12, "0")}` as ID;
const P = (x: number, y: number) => new Point2(x, y);

const PIVOT_ID = id("p1");
const BEAM_ID = id("b1");

const PIVOT: PivotElement = {
  type: "pivot",
  id: PIVOT_ID,
  probes: [],
  overlays: {},
  position: P(0, 0),
  isGrounded: false,
  rotatingEdgesIDs: [BEAM_ID],
  fixedGearsIDs: [],
};

const BEAM: BeamElement = {
  type: "beam",
  id: BEAM_ID,
  probes: [],
  overlays: {},
  positionStart: P(0, 0),
  positionEnd: P(10, 0),
  fixedNodeStartID: PIVOT_ID,
  fixedNodeEndID: undefined,
  fixedNodesBodyIDs: [],
};

function mechanism(mechanicalElements: MechanicalElement[]): Mechanism {
  return {
    metadata: DEFAULT_METADATA,
    viewport: { zoom: 1, pan: P(0, 0) },
    mechanicalElements,
    constraintElements: [],
    loads: [],
    history: [],
    future: [],
  };
}

/** A gear whose axle does not exist. */
const ORPHAN_GEAR: MechanicalElement = {
  type: "gear",
  id: id("g1"),
  probes: [],
  overlays: {},
  position: P(0, 0),
  angle: 0,
  radius: 10,
  parentAxleID: id("absent"),
  fixedNodesBodyIDs: [],
  meshedGearsIDs: [],
  attachedBeltID: undefined,
};

const DELETE_PIVOT: Action[] = [{ type: "DeleteElement", element: PIVOT }];

function spy_console() {
  return {
    error: vi.spyOn(console, "error").mockImplementation(() => {}),
    group: vi.spyOn(console, "group").mockImplementation(() => {}),
    groupEnd: vi.spyOn(console, "groupEnd").mockImplementation(() => {}),
    log: vi.spyOn(console, "log").mockImplementation(() => {}),
  };
}

afterEach(() => vi.restoreAllMocks());

describe("assert_actions_preserve_validity", () => {
  it("signale une référence pendante introduite par le bundle", () => {
    const spies = spy_console();
    assert_actions_preserve_validity(
      mechanism([PIVOT, BEAM]),
      mechanism([BEAM]), // le pivot a disparu, le beam le référence encore
      DELETE_PIVOT,
      "Connects",
    );
    expect(spies.error).toHaveBeenCalled();
    const reported = spies.error.mock.calls.map((c) => String(c[0])).join("\n");
    expect(reported).toContain("MISSING_REFERENCE");
    expect(spies.group.mock.calls[0][0]).toContain("Connects");
    expect(spies.log).toHaveBeenCalledWith("Actions:", DELETE_PIVOT);
  });

  it("reste silencieux quand le mécanisme reste sain", () => {
    const spies = spy_console();
    assert_actions_preserve_validity(
      mechanism([PIVOT, BEAM]),
      mechanism([PIVOT, BEAM]),
      [],
      "MoveNode",
    );
    expect(spies.error).not.toHaveBeenCalled();
    expect(spies.group).not.toHaveBeenCalled();
  });

  it("ne répète pas un problème déjà présent avant le bundle", () => {
    const spies = spy_console();
    const broken = mechanism([BEAM]);
    assert_actions_preserve_validity(broken, broken, [], "MoveNode");
    expect(spies.error).not.toHaveBeenCalled();
  });

  it("signale le nouveau problème sans répéter celui qui préexistait", () => {
    const spies = spy_console();
    const alreadyBroken = mechanism([BEAM]); // fixedNodeStartID pendant
    const worse = mechanism([BEAM, ORPHAN_GEAR]); // parentAxleID pendant en plus
    assert_actions_preserve_validity(alreadyBroken, worse, [], "Connects");
    const reported = spies.error.mock.calls.map((c) => String(c[0])).join("\n");
    expect(reported).toContain("parentAxleID");
    expect(reported).not.toContain("fixedNodeStartID");
  });

  it("ne re-signale pas un problème dont l'élément a seulement été renommé", () => {
    const spies = spy_console();
    assert_actions_preserve_validity(
      mechanism([BEAM]),
      mechanism([{ ...BEAM, name: "Barre renommée" }]),
      [],
      "UpdateElementName",
    );
    expect(spies.error).not.toHaveBeenCalled();
  });
});
