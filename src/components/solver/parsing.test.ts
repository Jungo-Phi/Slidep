import { describe, expect, it } from "vitest";
import type { ID, MechanicalElement } from "../../types/element";
import { Point2 } from "../../types/point2";
import { get_links_simulation, get_sim_nodes } from "./parsing";

const id = (n: number): ID =>
  `00000000-0000-0000-0000-${String(n).padStart(12, "0")}` as ID;

const SPRING = id(1);

function spring(
  overrides: Partial<Extract<MechanicalElement, { type: "spring" }>> = {},
): MechanicalElement {
  return {
    type: "spring",
    id: SPRING,
    probes: [],
    overlays: {},
    positionStart: new Point2(0, 0),
    positionEnd: new Point2(50, 0),
    fixedNodeStartID: undefined,
    fixedNodeEndID: undefined,
    stiffness: 1,
    ...overrides,
  };
}

describe("get_links_simulation — spring rest length", () => {
  it("defaults to the drawn distance when the user set none", () => {
    const elements = [spring()];
    const links = get_links_simulation(elements, get_sim_nodes(elements));
    expect(links).toContainEqual(
      expect.objectContaining({ type: "Spring", restLength: 50 }),
    );
  });

  it("uses the user's rest length once set, even though it differs from the drawn distance", () => {
    const elements = [spring({ restLength: 80 })];
    const links = get_links_simulation(elements, get_sim_nodes(elements));
    expect(links).toContainEqual(
      expect.objectContaining({ type: "Spring", restLength: 80 }),
    );
  });
});
