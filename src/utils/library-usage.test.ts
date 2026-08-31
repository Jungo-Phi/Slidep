import { describe, expect, it } from "vitest";
import { material_usage_count, profile_usage_count } from "./library-usage";
import type { BeamElement, ID, MechanicalElement, PivotElement } from "../types/element";
import { Point2 } from "../types/point2";

const id = (s: string) => `00000000-0000-0000-0000-${s.padStart(12, "0")}` as ID;

const MATERIAL_A = id("ma");
const MATERIAL_B = id("mb");
const PROFILE_A = id("pa");
const PROFILE_B = id("pb");

const beam = (bid: string, materialID: ID, profileID: ID): BeamElement => ({
  type: "beam",
  id: id(bid),
  probes: [],
  overlays: {},
  positionStart: new Point2(0, 0),
  positionEnd: new Point2(1, 0),
  fixedNodeStartID: undefined,
  fixedNodeEndID: undefined,
  fixedNodesBodyIDs: [],
  materialID,
  profileID,
});

const pivot: PivotElement = {
  type: "pivot",
  id: id("p1"),
  probes: [],
  overlays: {},
  position: new Point2(0, 0),
  isGrounded: false,
  rotatingEdgesIDs: [],
  fixedGearsIDs: [],
  rotationalFriction: 0,
};

describe("material_usage_count / profile_usage_count", () => {
  it("counts only the beams referencing the given id", () => {
    const elements: MechanicalElement[] = [
      beam("b1", MATERIAL_A, PROFILE_A),
      beam("b2", MATERIAL_A, PROFILE_B),
      beam("b3", MATERIAL_B, PROFILE_A),
      pivot,
    ];
    expect(material_usage_count(elements, MATERIAL_A)).toBe(2);
    expect(material_usage_count(elements, MATERIAL_B)).toBe(1);
    expect(profile_usage_count(elements, PROFILE_A)).toBe(2);
    expect(profile_usage_count(elements, PROFILE_B)).toBe(1);
  });

  it("is zero for an id nothing references", () => {
    const elements: MechanicalElement[] = [beam("b1", MATERIAL_A, PROFILE_A), pivot];
    expect(material_usage_count(elements, MATERIAL_B)).toBe(0);
    expect(profile_usage_count(elements, PROFILE_B)).toBe(0);
  });

  it("ignores non-beam elements entirely", () => {
    expect(material_usage_count([pivot], MATERIAL_A)).toBe(0);
  });
});
