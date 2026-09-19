import { describe, expect, it } from "vitest";
import { draw_spring } from "./drawing-functions";
import { spring_coil_pitch } from "./coil-pitch";
import { Point2 } from "../../../types/point2";
import type { ID, ScreenPoint, SpringElement, WorldPoint } from "../../../types";
import { DIM } from "../../../constants/rendering-specs";

const SPRING_ID = "00000000-0000-0000-0000-000000000001" as ID;

const spring = (restLength: number): SpringElement => ({
  type: "spring",
  id: SPRING_ID,
  probes: [],
  overlays: {},
  positionStart: new Point2(0, 0) as WorldPoint,
  positionEnd: new Point2(restLength, 0) as WorldPoint,
  stiffness: 100,
});

/**
 * Coils drawn for a spring `restLength` world units long, seen at `scale` px per world unit and drawn `stretch` times its rest length.
 *
 * The spring is the whole mechanism here, so the span the pitch is taken from is its own — enough to tell apart what does and does not move the count.
 * Front coils are the only strokes starting on the upper coil radius, so they are counted straight off the `moveTo` calls.
 */
function coil_count(restLength: number, scale = 1, stretch = 1): number {
  let coils = 0;
  const ctx = {
    lineWidth: 2,
    strokeStyle: "#000",
    fillStyle: "#fff",
    lineCap: "butt",
    globalAlpha: 1,
    save() {},
    restore() {},
    translate() {},
    rotate() {},
    beginPath() {},
    stroke() {},
    moveTo(_x: number, y: number) {
      if (y === -DIM.SPRING_COIL_RADIUS) coils++;
    },
    lineTo() {},
  } as unknown as CanvasRenderingContext2D;

  draw_spring(
    ctx,
    new Point2(0, 0) as ScreenPoint,
    new Point2(restLength * stretch * scale, 0) as ScreenPoint,
    spring_coil_pitch([spring(restLength)]),
    restLength,
    scale,
  );
  return coils;
}

describe("le nombre de spires d'un ressort", () => {
  const METRES = 0.4;

  it("ne dépend pas de l'unité dans laquelle le mécanisme est modélisé", () => {
    // The same spring modelled in metres and in millimetres, each seen at the zoom that draws it the same size.
    expect(coil_count(METRES * 1000, 1 / 1000)).toBe(coil_count(METRES, 1));
  });

  it("ne dépend pas du zoom", () => {
    expect(coil_count(METRES, 10)).toBe(coil_count(METRES, 1));
    expect(coil_count(METRES, 0.1)).toBe(coil_count(METRES, 1));
  });

  it("ne saute pas au clic qui pose le ressort", () => {
    const previewed = spring_coil_pitch(
      [],
      [new Point2(0, 0) as WorldPoint, new Point2(METRES, 0) as WorldPoint],
    );
    expect(previewed).toBe(spring_coil_pitch([spring(METRES)]));
  });

  it("ne change pas quand le ressort travaille", () => {
    // The accordion: a spring away from its rest length spreads or gathers the coils it has, it is not redrawn as another spring.
    expect(coil_count(METRES, 1, 2)).toBe(coil_count(METRES, 1));
    expect(coil_count(METRES, 1, 0.5)).toBe(coil_count(METRES, 1));
  });
});
