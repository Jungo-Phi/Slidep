import { describe, expect, it } from "vitest";
import { Point2 } from "../../types/point2";
import type { BeamElement, ID } from "../../types/element";
import type { ScreenPoint, ViewportState } from "../../types";
import { world2frame_transform } from "../../utils/load-frame";
import { world2screen_vec, screen2world_vec } from "../../utils";
import { snap_direction } from "./load-snap";

const BEAM = "b" as ID;
const VIEW: ViewportState = {
  scale: 1,
  pan: new Point2(0, 0).as_space<"screen">(),
};

/** A beam of length 400 at `degrees` from the world horizontal, from the origin. */
const beam = (degrees: number): BeamElement =>
  ({
    type: "beam",
    id: BEAM,
    probes: [],
    overlays: {},
    positionStart: new Point2(0, 0),
    positionEnd: Point2.from_polar(400, (degrees * Math.PI) / 180),
  }) as unknown as BeamElement;

const screen = (x: number, y: number) =>
  new Point2(x, y).as_space<"screen">() as ScreenPoint;

describe("snap_direction", () => {
  // The defect this replaced: a beam a hair off vertical was absorbed by the
  // world's own vertical, and the frame was then read BACK from the angle that
  // produced — so the load ended up stored at 89.5° from its beam, following it
  // askew for ever, with nothing on screen to say so.
  it("rend un quart de tour exact sur une barre presque verticale", () => {
    const bar = beam(89.5);
    // Aimed roughly along the beam's normal, a couple of degrees off.
    const drag = screen(120, 8);
    const { vector, frame } = snap_direction(drag, [bar], VIEW);

    expect(frame).toEqual({ mode: "edge", edgeID: BEAM });
    const stored = world2frame_transform(
      screen2world_vec(vector, VIEW),
      frame,
      [bar],
    );
    expect(stored.x).toBeCloseTo(0, 10);
    expect(Math.abs(stored.y)).toBeCloseTo(vector.length(), 10);
  });

  it("suit la barre plutôt que l'axe du monde, et garde la longueur", () => {
    const bar = beam(89.5);
    const drag = world2screen_vec(
      Point2.from_polar(150, (89.5 * Math.PI) / 180),
      VIEW,
    );
    const { vector, frame } = snap_direction(drag, [bar], VIEW);

    expect(frame).toEqual({ mode: "edge", edgeID: BEAM });
    expect(vector.length()).toBeCloseTo(150);
    const stored = world2frame_transform(
      screen2world_vec(vector, VIEW),
      frame,
      [bar],
    );
    expect(stored.y).toBeCloseTo(0, 10);
  });

  it("retombe sur le monde quand rien n'est visé", () => {
    const bar = beam(0);
    // 30° off every candidate the bar and the world offer.
    const { vector, frame } = snap_direction(screen(100, 58), [bar], VIEW);
    expect(frame).toBe("world");
    expect(vector).toEqual(screen(100, 58));
  });

  it("n'aimante rien sous le rayon mort", () => {
    const bar = beam(0);
    const drag = screen(6, 1);
    expect(snap_direction(drag, [bar], VIEW)).toEqual({
      vector: drag,
      frame: "world",
    });
  });

  // The corridor is a width in px, not an angle: the same angular error is
  // caught on a short arrow and not on a long one. An angular tolerance would
  // do the opposite, its catch widening with every pixel pulled.
  it("resserre l'angle admis à mesure que la flèche s'allonge", () => {
    const off = (length: number) =>
      snap_direction(
        Point2.from_polar(length, (10 * Math.PI) / 180).as_space<"screen">(),
        [],
        VIEW,
      );
    // 40 px at 10° passes 7 px from the horizontal, 400 px passes 69 from it.
    expect(off(40).vector.y).toBeCloseTo(0);
    expect(off(400).vector.y).toBeCloseTo(400 * Math.sin((10 * Math.PI) / 180));
  });
});
