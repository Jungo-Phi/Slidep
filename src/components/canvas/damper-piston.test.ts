import { describe, expect, it } from "vitest";
import { draw_damper } from "./drawing-functions";
import { Point2 } from "../../types/point2";
import type { ScreenPoint } from "../../types";

/**
 * The piston is read off the canvas calls rather than from a private helper: the
 * defect this guards against lives in the drawing, not in the arithmetic.
 *
 * `draw_damper` strokes the rod from `TAC` to `piston_x + TAC/2` in a frame it
 * has translated and rotated onto the damper. Placing the damper horizontally at
 * the origin makes that frame the identity, so the rod's far end is read
 * straight off the `lineTo` that follows the `moveTo(TAC, 0)`.
 */
function piston_reach(length: number, restLength?: number): number {
  const calls: { op: string; x: number; y: number }[] = [];
  let previousWasRodStart = false;
  let reach = NaN;
  const ctx = {
    lineWidth: 2,
    strokeStyle: "#000",
    fillStyle: "#fff",
    lineCap: "butt",
    save() {},
    restore() {},
    translate() {},
    rotate() {},
    beginPath() {},
    stroke() {},
    fill() {},
    rect() {},
    moveTo(x: number, y: number) {
      calls.push({ op: "moveTo", x, y });
      // The rod is the only stroke starting exactly on the cylinder's mouth.
      previousWasRodStart = x === 20 && y === 0;
    },
    lineTo(x: number, y: number) {
      calls.push({ op: "lineTo", x, y });
      if (previousWasRodStart && Number.isNaN(reach)) reach = x;
      previousWasRodStart = false;
    },
  } as unknown as CanvasRenderingContext2D;

  draw_damper(
    ctx,
    new Point2(0, 0) as ScreenPoint,
    new Point2(length, 0) as ScreenPoint,
    restLength,
    1,
  );
  return reach;
}

describe("le piston de l'amortisseur", () => {
  const LENGTH = 400;

  it("ne bouge pas quand la simulation démarre", () => {
    // Entering simulation freezes restLength at the current world length, so the
    // first simulated frame is drawn at stretch 1 — the very state edition shows.
    const edition = piston_reach(LENGTH);
    const firstSimulatedFrame = piston_reach(LENGTH, LENGTH);
    expect(firstSimulatedFrame).toBeCloseTo(edition, 9);
  });

  it("recule vers l'entrée du cylindre quand l'amortisseur s'étire", () => {
    expect(piston_reach(LENGTH, LENGTH / 2)).toBeLessThan(piston_reach(LENGTH));
  });

  it("avance quand il se comprime", () => {
    expect(piston_reach(LENGTH, LENGTH * 2)).toBeGreaterThan(
      piston_reach(LENGTH),
    );
  });
});
