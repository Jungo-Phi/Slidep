import { describe, expect, it } from "vitest";
import { draw_damper } from "./drawing-functions";
import { Point2 } from "../../../types/point2";
import type { ScreenPoint } from "../../../types";
import { DIM } from "../../../constants/rendering-specs";

/**
 * The damper is read off the canvas calls rather than from a private helper: the defect this guards against lives in the drawing, not in the arithmetic.
 *
 * `draw_damper` strokes the rod from `TAC` to the piston, and strokes the cylinder as the first rectangle of the three, in a frame it has translated and rotated onto the damper.
 * Placing the damper horizontally at the origin makes that frame the identity, so both are read straight off the calls.
 */
function damper_parts(
  length: number,
  restLength?: number,
): { piston: number; mouth: number; closed: number } {
  const rects: { x: number; width: number }[] = [];
  let previousWasRodStart = false;
  let piston = NaN;
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
    rect(x: number, _y: number, width: number) {
      rects.push({ x, width });
    },
    moveTo(x: number, y: number) {
      // The rod is the only stroke starting exactly on the end of the start stub.
      previousWasRodStart = x === DIM.TAC && y === 0;
    },
    lineTo(x: number) {
      if (previousWasRodStart && Number.isNaN(piston)) piston = x;
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
  const cylinder = rects[0];
  return { piston, mouth: cylinder.x, closed: cylinder.x + cylinder.width };
}

describe("le piston de l'amortisseur", () => {
  const REST = 400;

  it("ne bouge pas quand la simulation démarre", () => {
    // Entering simulation freezes restLength at the current world length, so the first simulated frame is drawn at rest — the very state edition shows.
    const edition = damper_parts(REST);
    const firstSimulatedFrame = damper_parts(REST, REST);
    expect(firstSimulatedFrame.piston).toBeCloseTo(edition.piston, 9);
    expect(firstSimulatedFrame.mouth).toBeCloseTo(edition.mouth, 9);
  });

  it("garde sa distance au nœud de départ tant qu'il lui reste de la course", () => {
    // The rod is rigid: an elongation is taken by the portion left in the open, not by the rod growing.
    const stretched = damper_parts(REST * 1.05, REST);
    const compressed = damper_parts(REST * 0.95, REST);
    for (const state of [stretched, compressed]) {
      // Clear of both ends, so the clamp the next test exercises is not what is being read here.
      expect(state.piston).toBeGreaterThan(state.mouth);
      expect(state.piston).toBeLessThan(state.closed);
      expect(state.piston).toBeCloseTo(damper_parts(REST, REST).piston, 9);
    }
  });

  it("recule vers l'entrée du cylindre quand l'amortisseur s'étire", () => {
    const travelled = (length: number) => {
      const { piston, mouth } = damper_parts(length, REST);
      return piston - mouth;
    };
    expect(travelled(REST * 1.05)).toBeLessThan(travelled(REST));
    expect(travelled(REST * 0.95)).toBeGreaterThan(travelled(REST));
  });

  it("reste dans le cylindre, et le cylindre entre les nœuds", () => {
    // Way past the stroke on either side, where the drawing has to give up on something.
    for (const length of [REST * 5, REST / 5, 2 * DIM.TAC]) {
      const { piston, mouth, closed } = damper_parts(length, REST);
      expect(piston).toBeGreaterThanOrEqual(mouth);
      expect(piston).toBeLessThanOrEqual(closed);
      expect(mouth).toBeGreaterThanOrEqual(DIM.TAC);
      expect(closed).toBeCloseTo(length - DIM.TAC, 9);
    }
  });
});
