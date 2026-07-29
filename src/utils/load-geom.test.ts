import { describe, it, expect } from "vitest";
import {
  distributed_display_gain,
  distributed_grab_length,
  distributed_grab_magnitude,
  distributed_tip_length,
  distributed_tip_magnitude,
  frame_from_snapped_direction,
  snap_direction,
  stored2world_load,
} from "./load-geom";
import { Point2 } from "../types/point2";
import type { BeamElement, EdgeElement, ID } from "../types";

/**
 * The display scale of a distributed load: compressed once as a whole on the
 * log ruler, then drawn linearly across the span. What these tests pin down is
 * that the drawing stays proportional to the values inside a load (the profile
 * an engineer reads off the crest line) while the drags still invert exactly.
 */

/** Drawn length of the profile at `t` along the span, as the canvas draws it:
 *  a linear interpolation of the two endpoint arrows. */
const drawn_at = (start: number, end: number, t: number) =>
  distributed_tip_length(start, end) * (1 - t) +
  distributed_tip_length(end, start) * t;

describe("distributed load display scale", () => {
  it("draws the profile proportionally to the values", () => {
    // The whole point: mid-span reads as the average of the two ends, which
    // pointwise log compression got wrong by ~17%.
    const gain = distributed_display_gain(100, 200);
    expect(drawn_at(100, 200, 0.5)).toBeCloseTo(gain * 150, 6);
    expect(drawn_at(100, 200, 0.25)).toBeCloseTo(gain * 125, 6);
  });

  it("draws a triangular load as a true triangle", () => {
    expect(distributed_tip_length(0, 100)).toBe(0);
    expect(drawn_at(0, 100, 0.5)).toBeCloseTo(
      distributed_tip_length(100, 0) / 2,
      6,
    );
  });

  it("gives the dominant arrow the length the log ruler gives it", () => {
    expect(distributed_tip_length(200, 50)).toBeCloseTo(
      stored2world_load(200),
      6,
    );
    expect(distributed_tip_length(-200, 50)).toBeCloseTo(
      -stored2world_load(200),
      6,
    );
  });

  it("keeps loads of very different magnitudes comparable", () => {
    // The log compression still applies between loads: 100x the value comes
    // out around 4x the drawing, which is what keeps both legible at once.
    const small = distributed_tip_length(100, 100);
    const large = distributed_tip_length(10000, 10000);
    expect(large).toBeGreaterThan(small);
    expect(large).toBeLessThan(small * 5);
  });
});

describe("distributed tip drag", () => {
  const cases: [number, number][] = [
    [300, 100], // dragged tip dominant
    [40, 100], // opposite end dominant (linear regime)
    [-150, 100], // across the beam
    [100, 0], // the other end sits at zero
    [0, 100], // dragged tip at zero
  ];

  it.each(cases)("inverts the drawn length for (%i, %i)", (magnitude, other) => {
    expect(
      distributed_tip_magnitude(
        distributed_tip_length(magnitude, other),
        other,
      ),
    ).toBeCloseTo(magnitude, 4);
  });

  it("joins its two regimes where they meet", () => {
    // At the crossover the dragged tip equals the other one, so the log-ruler
    // branch and the pinned-gain branch must agree.
    const other = 120;
    const atCrossover = distributed_tip_length(other, other);
    expect(distributed_tip_magnitude(atCrossover - 0.001, other)).toBeCloseTo(
      distributed_tip_magnitude(atCrossover + 0.001, other),
      2,
    );
  });

  it("reaches exactly zero, so a load can be made triangular", () => {
    expect(distributed_tip_magnitude(0, 100)).toBe(0);
  });
});

describe("distributed body drag", () => {
  // A body drag translates both ends, so the offsets from the grabbed point to
  // the two ends are constants; these cover a uniform load, a taper grabbed
  // off-centre, and a load whose profile crosses its beam.
  const cases: [number, number, number][] = [
    [150, 0, 0], // uniform
    [150, -50, 50], // grabbed mid-span of a taper
    [150, 0, 100], // grabbed at the start end
    [50, -150, 150], // profile crosses the beam
    [-200, -50, 50], // whole load on the other side
    [0.5, -100, 100], // grabbed almost exactly at the zero crossing
  ];

  it.each(cases)(
    "inverts the drawn length for (%i, %i, %i)",
    (magnitude, offsetStart, offsetEnd) => {
      expect(
        distributed_grab_magnitude(
          distributed_grab_length(magnitude, offsetStart, offsetEnd),
          offsetStart,
          offsetEnd,
        ),
      ).toBeCloseTo(magnitude, 3);
    },
  );

  it("moves the grabbed point monotonically, including across the beam", () => {
    // What makes the drag feel fluid: no reversal, no jump as the load passes
    // through its beam and its values go negative.
    let previous = -Infinity;
    for (let magnitude = -300; magnitude <= 300; magnitude += 5) {
      const length = distributed_grab_length(magnitude, -50, 50);
      expect(length).toBeGreaterThan(previous);
      previous = length;
    }
  });

  it("keeps the taper while the load is translated", () => {
    const magnitude = distributed_grab_magnitude(80, -50, 50);
    expect(magnitude + 50 - (magnitude - 50)).toBe(100);
  });
});

describe("frame implied by a snapped direction", () => {
  const beam = (id: string, end: Point2): BeamElement => ({
    type: "beam",
    id: id as ID,
    positionStart: new Point2(0, 0),
    positionEnd: end,
    fixedNodesBodyIDs: [],
    probes: [],
    overlays: {},
  });

  const frame_of = (direction: Point2, edges: EdgeElement[]) =>
    frame_from_snapped_direction(direction, edges);

  const oblique = beam("oblique", new Point2(100, 100));
  const vertical = beam("vertical", new Point2(0, 100));

  it("references the edge a direction is aligned with", () => {
    expect(frame_of(new Point2(50, 50), [oblique])).toEqual({
      mode: "edge",
      edgeID: "oblique",
    });
  });

  it("references the edge along its normal too", () => {
    expect(frame_of(new Point2(-50, 50), [oblique])).toEqual({
      mode: "edge",
      edgeID: "oblique",
    });
  });

  it("falls back to world when no edge matches", () => {
    expect(frame_of(new Point2(0, 100), [oblique])).toBe("world");
  });

  // The priority that decides whether a load follows its beam: an edge wins
  // even when the direction is world-aligned as well, so a force pulled down a
  // vertical beam is captured as a follower load rather than staying vertical.
  it("gives the edge priority over the world axes", () => {
    expect(frame_of(new Point2(0, 100), [vertical])).toEqual({
      mode: "edge",
      edgeID: "vertical",
    });
  });

  it("stays world-framed when there is no edge at all", () => {
    expect(frame_of(new Point2(0, 100), [])).toBe("world");
  });

  // A beam a fraction of a degree off vertical collapses onto the world axis as
  // a snap target, and the edge still claims the direction — priority applies
  // there as everywhere, so a near-aligned beam behaves like an aligned one.
  it("references a near-aligned edge just like an aligned one", () => {
    const nearVertical = beam("near-vertical", new Point2(0.5, 100));
    expect(frame_of(new Point2(0, 100), [nearVertical])).toEqual({
      mode: "edge",
      edgeID: "near-vertical",
    });
  });

  it("leaves the world frame reachable once the edge is a target of its own", () => {
    // 5° off vertical: far enough to keep its own candidate, so aiming at the
    // world axis is a distinct gesture and stays world-framed.
    const tilted = beam("tilted", Point2.from_polar(100, (95 * Math.PI) / 180));
    expect(frame_of(new Point2(0, 100), [tilted])).toBe("world");
  });
});

describe("snap candidates", () => {
  const beam = (id: string, end: Point2): BeamElement => ({
    type: "beam",
    id: id as ID,
    positionStart: new Point2(0, 0),
    positionEnd: end,
    fixedNodesBodyIDs: [],
    probes: [],
    overlays: {},
  });

  // The direction must not flicker between two targets a fraction of a degree
  // apart as the cursor moves by one pixel.
  it("snaps a near-vertical beam's neighbourhood to a single direction", () => {
    const nearVertical = beam("near-vertical", new Point2(0.5, 100));
    const angles = new Set<number>();
    for (let deg = -3; deg <= 3; deg += 0.25) {
      const rad = (90 + deg) * (Math.PI / 180);
      angles.add(
        Number(
          snap_direction(Point2.from_polar(100, rad), [nearVertical])
            .angle()
            .toFixed(6),
        ),
      );
    }
    expect(angles.size).toBe(1);
  });

  it("keeps an oblique beam as a target of its own", () => {
    const oblique = beam("oblique", new Point2(100, 100));
    const snapped = snap_direction(
      Point2.from_polar(100, (46 * Math.PI) / 180),
      [oblique],
    );
    expect(snapped.angle()).toBeCloseTo(Math.PI / 4, 6);
  });
});
