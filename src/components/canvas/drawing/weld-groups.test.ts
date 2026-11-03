import { describe, it, expect } from "vitest";
import { Point2 } from "../../../types/point2";
import type {
  BeamElement,
  ID,
  JoinElement,
  MechanicalElement,
  SpringElement,
} from "../../../types/element";
import { segments_distance, weld_groups } from "./weld-groups";

const P = (x: number, y: number) => new Point2(x, y);
const id = (s: string) => s as ID;

const beam = (
  name: string,
  start?: string,
  end?: string,
  body: string[] = [],
): BeamElement => ({
  type: "beam",
  id: id(name),
  probes: [],
  overlays: {},
  positionStart: P(0, 0),
  positionEnd: P(100, 0),
  fixedNodeStartID: start === undefined ? undefined : id(start),
  fixedNodeEndID: end === undefined ? undefined : id(end),
  fixedNodesBodyIDs: body.map(id),
  materialID: id("m"),
  profileID: id("p"),
});
const spring = (name: string, start?: string, end?: string): SpringElement => ({
  type: "spring",
  id: id(name),
  probes: [],
  overlays: {},
  positionStart: P(0, 0),
  positionEnd: P(100, 0),
  fixedNodeStartID: start === undefined ? undefined : id(start),
  fixedNodeEndID: end === undefined ? undefined : id(end),
  stiffness: 1,
});
const join = (name: string, edges: string[]): JoinElement => ({
  type: "join",
  id: id(name),
  probes: [],
  overlays: {},
  position: P(0, 0),
  isGrounded: false,
  fixedEdgesIDs: edges.map(id),
});

const NONE = new Map<ID, number>();
const nothing = (_: ID) => false;
const welds = (elements: MechanicalElement[], singledOut = nothing) =>
  weld_groups(elements, NONE, singledOut);

describe("weld groups", () => {
  it("welds two bars meeting at a join into one group", () => {
    const { seamless, groups } = welds([
      beam("a", undefined, "j"),
      beam("b", "j"),
      join("j", ["a", "b"]),
    ]);
    expect([...seamless]).toEqual(["j"]);
    expect(groups.get(id("a"))!.pieces.map((p) => p.id)).toEqual(["a", "b"]);
    expect(groups.get(id("b"))).toBe(groups.get(id("a")));
  });

  it("chains welds into one group, and leaves a bar that only crosses them alone", () => {
    const { groups } = welds([
      beam("a", undefined, "j1"),
      beam("b", "j1", "j2"),
      beam("c", "j2"),
      beam("crossing"),
      join("j1", ["a", "b"]),
      join("j2", ["b", "c"]),
    ]);
    expect(groups.get(id("c"))!.pieces.map((p) => p.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(groups.get(id("c"))!.joints.map((j) => j.join.id)).toEqual([
      "j1",
      "j2",
    ]);
    expect(groups.has(id("crossing"))).toBe(false);
  });

  it("welds a bar ending on another's body", () => {
    const { seamless } = welds([
      beam("body", undefined, undefined, ["j"]),
      beam("t", "j"),
      join("j", ["body", "t"]),
    ]);
    expect(seamless.has(id("j"))).toBe(true);
  });

  it("keeps the disc of a join holding a single bar", () => {
    const { seamless } = welds([beam("a", "j"), join("j", ["a"])]);
    expect(seamless.size).toBe(0);
  });

  it("keeps the disc of a join something points at", () => {
    const { seamless, groups } = welds(
      [beam("a", undefined, "j"), beam("b", "j"), join("j", ["a", "b"])],
      (target) => target === id("j"),
    );
    expect(seamless.size).toBe(0);
    expect(groups.size).toBe(0);
  });

  it("keeps the disc of a join that also holds something other than a bar", () => {
    const belt: MechanicalElement = {
      type: "belt",
      id: id("belt"),
      probes: [],
      overlays: {},
      positionStart: P(0, 0),
      positionEnd: P(100, 0),
      fixedNodeStartID: id("j"),
      fixedNodeEndID: undefined,
      attachedGearsIDs: [],
      closed: false,
    };
    const { seamless } = welds([
      beam("a", undefined, "j"),
      beam("b", "j"),
      belt,
      join("j", ["a", "b", "belt"]),
    ]);
    expect(seamless.size).toBe(0);
  });

  it("welds a spring to a bar, but not two springs alone", () => {
    expect(
      welds([beam("a", "j"), spring("s", "j"), join("j", ["a", "s"])]).seamless
        .size,
    ).toBe(1);
    expect(
      welds([spring("s1", "j"), spring("s2", "j"), join("j", ["s1", "s2"])])
        .seamless.size,
    ).toBe(0);
  });

  it("lists what each seamless join holds", () => {
    const { groups } = welds([
      beam("a", undefined, "j"),
      beam("b", "j"),
      join("j", ["a", "b"]),
    ]);
    const [joint] = groups.get(id("a"))!.joints;
    expect(joint.held.map((p) => p.id).sort()).toEqual(["a", "b"]);
  });

  it("keeps the disc where a spring is drawn off its axis", () => {
    const { seamless } = weld_groups(
      [beam("a", "j"), spring("s", "j"), join("j", ["a", "s"])],
      new Map([[id("s"), 12]]),
      nothing,
    );
    expect(seamless.size).toBe(0);
  });
});

describe("segments distance", () => {
  it("is zero where two segments cross", () => {
    expect(segments_distance(P(0, 0), P(10, 10), P(0, 10), P(10, 0))).toBe(0);
  });

  it("is the gap between segments that stay apart", () => {
    expect(segments_distance(P(0, 0), P(10, 0), P(5, 3), P(5, 8))).toBeCloseTo(
      3,
    );
  });
});
