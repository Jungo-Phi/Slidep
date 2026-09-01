import { describe, expect, it } from "vitest";
import { Point2 } from "../../../types/point2";
import { CollisionCandidates } from "./collision-candidates";
import { apply_collision_restitution } from "./collision-restitution";
import { contact_eps } from "./collision-detection";

const P = (x: number, y: number) => new Point2(x, y);
// An arbitrary, fixed extent for every scenario below — none of them cares about scale, only
// about the resting margin `contact_eps` derives from it, so one shared value keeps the
// geometry (built around that margin) legible without tying these tests to `CONTACT_EPS_RATIO`.
const EXTENT = 1;
const EPS = contact_eps(EXTENT);

const EMPTY_CANDIDATES: CollisionCandidates = {
  pointSegment: [],
  pointCircle: [],
  circleSegment: [],
  circleCircle: [],
  pointFloor: [],
  circleFloor: [],
};
// Every test below exercises the ordinary (non-floor) families only.
const NO_FLOOR = P(0, 1);

describe("apply_collision_restitution", () => {
  it("bounces a point-circle contact back at `restitution` × the incoming speed", () => {
    const boundary = 10;
    const candidates: CollisionCandidates = {
      ...EMPTY_CANDIDATES,
      // The resting position sits `contact_eps(EXTENT)` past the raw radius — mirror it here.
      pointCircle: [{ pointKey: "ball", centerKey: "anchor", radius: boundary - EPS }],
    };
    // Resting exactly at the boundary (anchor at the origin, ball straight above), the plain
    // (inelastic) solve already stopped it — this is what "after" looks like BEFORE restitution.
    const positions = new Map([["ball", P(0, boundary)], ["anchor", P(0, 0)]]);
    const posMasses = new Map([["ball", 1], ["anchor", 0]]);
    const before = new Map([["ball", P(0, -10)], ["anchor", P(0, 0)]]);
    const after = new Map([["ball", P(0, 0)], ["anchor", P(0, 0)]]);

    apply_collision_restitution(candidates, positions, posMasses, before, after, 0.5, EXTENT, true, false, NO_FLOOR);

    expect(after.get("ball")!.y).toBeCloseTo(5, 5); // half the incoming 10, reflected
    expect(after.get("ball")!.x).toBeCloseTo(0, 5);
    expect(after.get("anchor")!.y).toBeCloseTo(0, 5); // anchored: untouched
  });

  it("ne fait rien avec restitution = 0 (le solve inélastique suffit déjà)", () => {
    const candidates: CollisionCandidates = {
      ...EMPTY_CANDIDATES,
      pointCircle: [{ pointKey: "ball", centerKey: "anchor", radius: 9.5 }],
    };
    const positions = new Map([["ball", P(0, 10)], ["anchor", P(0, 0)]]);
    const posMasses = new Map([["ball", 1], ["anchor", 0]]);
    const before = new Map([["ball", P(0, -10)], ["anchor", P(0, 0)]]);
    const after = new Map([["ball", P(0, 0)], ["anchor", P(0, 0)]]);

    apply_collision_restitution(candidates, positions, posMasses, before, after, 0, EXTENT, true, false, NO_FLOOR);

    expect(after.get("ball")).toEqual(P(0, 0));
  });

  it("ignore un contact qui n'a pas eu lieu cette frame (loin de la borne)", () => {
    const candidates: CollisionCandidates = {
      ...EMPTY_CANDIDATES,
      pointCircle: [{ pointKey: "ball", centerKey: "anchor", radius: 5 }],
    };
    const positions = new Map([["ball", P(0, 100)], ["anchor", P(0, 0)]]);
    const posMasses = new Map([["ball", 1], ["anchor", 0]]);
    const before = new Map([["ball", P(0, -10)], ["anchor", P(0, 0)]]);
    const after = new Map([["ball", P(0, -10)], ["anchor", P(0, 0)]]);

    apply_collision_restitution(candidates, positions, posMasses, before, after, 0.5, EXTENT, true, false, NO_FLOOR);

    expect(after.get("ball")).toEqual(P(0, -10)); // untouched: not in contact
  });

  it("ignore un contact déjà en train de se séparer", () => {
    const candidates: CollisionCandidates = {
      ...EMPTY_CANDIDATES,
      pointCircle: [{ pointKey: "ball", centerKey: "anchor", radius: 9.5 }],
    };
    const positions = new Map([["ball", P(0, 10)], ["anchor", P(0, 0)]]);
    const posMasses = new Map([["ball", 1], ["anchor", 0]]);
    // Already moving away (+y) before this frame — nothing to bounce.
    const before = new Map([["ball", P(0, 3)], ["anchor", P(0, 0)]]);
    const after = new Map([["ball", P(0, 3)], ["anchor", P(0, 0)]]);

    apply_collision_restitution(candidates, positions, posMasses, before, after, 0.5, EXTENT, true, false, NO_FLOOR);

    expect(after.get("ball")).toEqual(P(0, 3));
  });

  it("répartit l'impulsion sur les deux bouts d'un segment, pondérée par t et les masses", () => {
    const boundary = EPS; // the point-segment contact boundary at EXTENT
    const candidates: CollisionCandidates = {
      ...EMPTY_CANDIDATES,
      pointSegment: [{ pointKey: "ball", segKey1: "s1", segKey2: "s2" }],
    };
    // Segment from (0,0) to (100,0), ball resting at the boundary above its midpoint.
    const positions = new Map([
      ["ball", P(50, boundary)],
      ["s1", P(0, 0)],
      ["s2", P(100, 0)],
    ]);
    const posMasses = new Map([["ball", 1], ["s1", 0], ["s2", 0]]);
    const before = new Map([
      ["ball", P(0, -10)],
      ["s1", P(0, 0)],
      ["s2", P(0, 0)],
    ]);
    const after = new Map([
      ["ball", P(0, 0)],
      ["s1", P(0, 0)],
      ["s2", P(0, 0)],
    ]);

    apply_collision_restitution(candidates, positions, posMasses, before, after, 0.5, EXTENT, true, false, NO_FLOOR);

    expect(after.get("ball")!.y).toBeCloseTo(5, 5);
    // Both anchored ends: unaffected regardless of t.
    expect(after.get("s1")).toEqual(P(0, 0));
    expect(after.get("s2")).toEqual(P(0, 0));
  });
});
