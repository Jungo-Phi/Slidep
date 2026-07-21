import { describe, it, expect } from "vitest";
import { Point2 } from "../types/point2";
import {
  belt_pieces,
  belt_section_gear_index,
  belt_section_insertion_index,
  belt_section_is_run,
  BeltVia,
} from "./belt-path";

const P = (x: number, y: number) => new Point2(x, y);

const pulley = (x: number, y: number, radius = 40): BeltVia => ({
  pos: P(x, y),
  radius,
  direction: false,
});
const terminal = (x: number, y: number): BeltVia => ({
  pos: P(x, y),
  radius: 0,
  direction: false,
});

/** Three pulleys in a triangle, as a closed loop or between two terminals. */
const GEARS = [pulley(-100, 0), pulley(100, 0), pulley(0, 150)];
const OPEN: BeltVia[] = [terminal(-300, -200), ...GEARS, terminal(300, -200)];

describe("belt section convention", () => {
  // The helpers exist so no caller re-derives the parity by hand; this is what
  // ties them to the traversal they describe.
  it.each([
    ["open", OPEN, false],
    ["closed", GEARS, true],
  ])("names every piece of a %s path", (_label, vias, closed) => {
    const pieces = belt_pieces(vias, closed);
    expect(pieces.length).toBeGreaterThan(0);
    for (let section = 0; section < pieces.length; section++)
      expect(belt_section_is_run(section, closed)).toBe(
        pieces[section].kind === "segment",
      );
  });

  // The grab that pulls a pulley off the belt reads this; deriving it by hand is
  // what made a closed belt disconnect a gear when the user grabbed a straight run.
  it.each([
    ["open", OPEN, false],
    ["closed", GEARS, true],
  ])("names the pulley each arc of a %s path wraps", (_label, vias, closed) => {
    const pieces = belt_pieces(vias, closed);
    // On an open path via v is pulley v−1; on a closed one they coincide.
    const offset = closed ? 0 : 1;
    for (let section = 0; section < pieces.length; section++) {
      const piece = pieces[section];
      const index = belt_section_gear_index(section, closed);
      if (piece.kind !== "arc") {
        expect(index).toBeUndefined();
        continue;
      }
      expect(index).toBe(piece.gearIndex - offset);
    }
  });

  it("refuses an insertion index for an arc, which carries no pulley", () => {
    const pieces = belt_pieces(GEARS, true);
    for (let section = 0; section < pieces.length; section++)
      expect(belt_section_insertion_index(section, true) === undefined).toBe(
        pieces[section].kind === "arc",
      );
  });

  // The two parities differ, and so do the indices: a closed path has no start
  // terminal to offset the pulleys by one.
  it("inserts a pulley between the two the run joins", () => {
    const runs = (vias: BeltVia[], closed: boolean) =>
      belt_pieces(vias, closed).flatMap((piece, section) =>
        piece.kind === "segment" ? [{ section, piece }] : [],
      );

    for (const [vias, closed, gears] of [
      [OPEN, false, GEARS],
      [GEARS, true, GEARS],
    ] as const) {
      for (const { section, piece } of runs(vias, closed)) {
        const index = belt_section_insertion_index(section, closed)!;
        expect(index).not.toBeUndefined();
        // `gearIndexA/B` are via indices; on an open path via v is pulley v−1.
        const offset = closed ? 0 : 1;
        const before = piece.gearIndexA - offset;
        const after = piece.gearIndexB - offset;
        // The newcomer lands right after the pulley the run leaves — wrapping
        // to the end of the list for the run that closes a loop.
        expect(index).toBe(before + 1);
        if (after >= 0 && after < gears.length && after !== 0)
          expect(index).toBeLessThanOrEqual(after);
      }
    }
  });
});
