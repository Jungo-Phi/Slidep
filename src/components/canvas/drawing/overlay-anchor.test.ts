import { describe, expect, it } from "vitest";
import { BeltElement, ID, MechanicalElement, Point2, WorldPoint } from "../../../types";
import { anchored_arrows } from "./overlay-anchor";
import type { OverlayArrow } from "./drawing-functions";
import { belt_strand_on_pose } from "../../../utils/belt-geom";

/**
 * A reading recorded on one pose, drawn on another: what a mode swing does to every overlay.
 * A belt strand's arrows have no point of the element to ride on, so they are carried by the pulleys the strand runs between.
 */
describe("une flèche de brin en basculement", () => {
  const A = "a" as ID;
  const B = "b" as ID;
  const BELT = "belt" as ID;
  const belt = (bAt: Point2) =>
    [
      {
        type: "belt",
        id: BELT,
        closed: true,
        positionStart: new Point2(0, 0),
        positionEnd: new Point2(0, 0),
        attachedGearsIDs: [
          { id: A, clockwise: true },
          { id: B, clockwise: true },
        ],
      },
      { type: "gear", id: A, position: new Point2(0, 0), radius: 1 },
      { type: "gear", id: B, position: bAt, radius: 1 },
    ] as unknown as MechanicalElement[];

  // Read where the strand from B lands on A, B then 10 m away along x.
  const onRecording = belt_strand_on_pose(
    belt(new Point2(10, 0))[0] as BeltElement,
    belt(new Point2(10, 0)),
    B,
    A,
  )!;
  const recorded: OverlayArrow = {
    at: onRecording.to as WorldPoint,
    vector: onRecording.from.sub(onRecording.to).normalize().mul(8) as WorldPoint,
    kind: "reaction-internal",
    elementID: BELT,
    which: "end",
    strand: { fromGear: B, toGear: A, tension: 8 },
  };

  it("suit les poulies, garde sa tension, et tourne avec le brin", () => {
    // B swung round to straight above A: the strand now runs vertically.
    const [moved] = anchored_arrows([recorded], belt(new Point2(0, 10)));
    expect(moved.vector.length()).toBeCloseTo(8, 9);
    expect(Math.abs(moved.vector.x)).toBeLessThan(1e-9);
    // Its landing end sits on A's rim, pulled away from A towards B.
    expect(moved.at.distance_to(new Point2(0, 0))).toBeCloseTo(1, 9);
    expect(moved.vector.y).toBeGreaterThan(0);
  });

  it("ne bouge pas quand le dessin est celui de l'enregistrement", () => {
    const readings = [recorded];
    const onPose = anchored_arrows(readings, belt(new Point2(10, 0)));
    expect(onPose[0].at.distance_to(recorded.at)).toBeLessThan(1e-9);
    expect(onPose[0].vector.distance_to(recorded.vector)).toBeLessThan(1e-9);
  });
});
