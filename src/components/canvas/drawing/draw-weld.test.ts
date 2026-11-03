import { describe, expect, it, vi } from "vitest";
import { Point2 } from "../../../types/point2";
import type { ID, MechanicalElement } from "../../../types/element";

vi.mock("./drawing-functions", async (original) => ({
  ...(await original<typeof import("./drawing-functions")>()),
  draw_spring: vi.fn(),
}));

const { draw_spring } = await import("./drawing-functions");
const { draw_mechanism } = await import("./draw-mechanism");

/** A context that accepts every call and reads back neutral values: only what reaches the mocked primitives is under test. */
const null_context = (): CanvasRenderingContext2D => {
  const values: Record<string, unknown> = {};
  return new Proxy(values, {
    get(target, key: string) {
      if (key in target) return target[key];
      if (key === "measureText") return () => ({ width: 0 });
      if (key === "createLinearGradient") return () => ({ addColorStop() {} });
      if (key === "getTransform") return () => ({});
      return () => {};
    },
    set(target, key: string, value) {
      target[key] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
};

const P = (x: number, y: number) => new Point2(x, y);
const id = (s: string) => s as ID;

describe("drawing a weld", () => {
  it("still draws a spring welded to a bar, leaving its welded stub to the weld", () => {
    const elements: MechanicalElement[] = [
      {
        type: "beam",
        id: id("b"),
        probes: [],
        overlays: {},
        positionStart: P(0, 0),
        positionEnd: P(100, 0),
        fixedNodeStartID: undefined,
        fixedNodeEndID: id("j"),
        fixedNodesBodyIDs: [],
        materialID: id("m"),
        profileID: id("p"),
      },
      {
        type: "spring",
        id: id("s"),
        probes: [],
        overlays: {},
        positionStart: P(100, 0),
        positionEnd: P(100, 100),
        fixedNodeStartID: id("j"),
        fixedNodeEndID: undefined,
        stiffness: 1,
      },
      {
        type: "join",
        id: id("j"),
        probes: [],
        overlays: {},
        position: P(100, 0),
        isGrounded: false,
        fixedEdgesIDs: [id("b"), id("s")],
      },
    ];
    draw_mechanism(null_context(), {
      viewport: { scale: 1, pan: P(0, 0) as never },
      hoveredPart: { type: "Void", position: P(-999, -999) } as never,
      state: { type: "Selecting" } as never,
      mechanicalElements: elements,
      coilPitch: undefined,
      constraintElements: [],
    });
    expect(draw_spring).toHaveBeenCalledTimes(1);
    expect(vi.mocked(draw_spring).mock.calls[0][6]).toEqual({
      start: true,
      end: false,
    });
  });
});
