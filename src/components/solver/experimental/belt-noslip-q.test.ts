import { describe, expect, it } from "vitest";
import { Point2 } from "../../../types/point2";
import { beltSegmentDeltaH, buildBeltSegmentNoSlipLinks } from "./belt-noslip-q";

describe("loi de brin — enroulement continu", () => {
  it("h reste continu quand une poulie franchit un tour complet", () => {
    // Pulley b is wrapped the other way round from the other two, and moving c across it takes its wrap through a full turn: the raw wrap falls from just under 2π to just over 0 there.
    // Read raw, the strand leaving b would lose 2π·r of rim at that instant; unwrapped, it moves by what the geometry moves.
    const positions = new Map([
      ["b", new Point2(0, 0)],
      ["c", new Point2(-0.3, -0.12)],
      ["a", new Point2(0, -1)],
    ]);
    const angles = new Map([
      ["b", 0],
      ["c", 0],
      ["a", 0],
    ]);
    const strand = buildBeltSegmentNoSlipLinks(positions, angles, {
      gearPosKeys: ["b", "c", "a"],
      gearAngleKeys: ["b", "c", "a"],
      radii: [0.2, 0.1, 0.4],
      directions: [true, false, false],
      closed: true,
      writePositions: false,
    }).find((link) => link.viaA === 0)!;

    let previous = beltSegmentDeltaH(positions, strand)!;
    let worstStep = 0;
    for (let x = -0.29; x <= -0.2; x += 0.01) {
      positions.set("c", new Point2(x, -0.12));
      const dh = beltSegmentDeltaH(positions, strand)!;
      worstStep = Math.max(worstStep, Math.abs(dh - previous));
      previous = dh;
    }
    // A 1 cm step of c moves the strand by about as much; a full turn of b's rim is 2π·0.2 ≈ 1.26.
    expect(worstStep).toBeLessThan(0.05);
  });
});
