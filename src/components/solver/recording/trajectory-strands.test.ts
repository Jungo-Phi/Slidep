import { describe, it, expect } from "vitest";
import { MechanicalElement } from "../../../types/element";
import { KinematicSnapshot, SnapshotLayout } from "../../../types/runtime-state";
import { make_snapshot_layout } from "../snapshot";
import {
  EMPTY_TRAJECTORY_CACHE,
  extend_probe_trajectories,
  trajectories_at,
} from "./probe-series";

/**
 * Which curves the trajectory overlay draws, off snapshots built by hand so the expected points can be stated rather than recorded.
 * What is worth stating here is which strands survive and where they sit, never the thresholds `TRAJECTORY_SAMPLING` holds: every mechanism below either stands perfectly still or travels metres at a time.
 */

const shown = { trajectory: true };
const ZERO2 = { x: 0, y: 0 };

const pivot =(id: string, overlays: object = shown) =>
  ({ id, type: "pivot", position: ZERO2, isGrounded: false, overlays }) as unknown as MechanicalElement;
const beam = (id: string, ends: { start?: string; end?: string } = {}) =>
  ({
    id,
    type: "beam",
    positionStart: ZERO2,
    positionEnd: ZERO2,
    fixedNodeStartID: ends.start,
    fixedNodeEndID: ends.end,
    overlays: shown,
  }) as unknown as MechanicalElement;
const gear = (id: string, radius: number, axle: string) =>
  ({ id, type: "gear", position: ZERO2, radius, parentAxleID: axle, overlays: shown }) as unknown as MechanicalElement;
const axle = (id: string, gears: string[]) =>
  ({ id, type: "pivot", position: ZERO2, isGrounded: true, fixedGearsIDs: gears, overlays: {} }) as unknown as MechanicalElement;

/** A snapshot on `layout`. Keys left unnamed keep the NaN of a slot with no value. */
function snapshot(
  layout: SnapshotLayout,
  t: number,
  at: Record<string, [number, number]>,
): KinematicSnapshot {
  const positions = new Float64Array(layout.keys.length * 2).fill(NaN);
  for (const [key, [x, y]] of Object.entries(at)) {
    const i = layout.index.get(key)!;
    positions[2 * i] = x;
    positions[2 * i + 1] = y;
  }
  return { t, layout, positions, angles: new Float64Array(layout.angleKeys.length) };
}

/** Every strand drawn for `elements` over `snapshots`, read past the end of the recording so each one is whole. */
function strands(elements: MechanicalElement[], snapshots: KinematicSnapshot[]) {
  const cache = extend_probe_trajectories(
    EMPTY_TRAJECTORY_CACHE,
    elements,
    snapshots,
  );
  return trajectories_at(cache, Infinity).map((traj) => ({
    elementID: traj.elementID,
    colorIndex: traj.colorIndex,
    points: traj.points.map((p) => [p.x, p.y]),
  }));
}

describe("brins de trajectoire", () => {
  it("une extrémité soudée à un nœud suivi n'est pas retracée", () => {
    const layout = make_snapshot_layout(["P", "B:start", "B:end"], []);
    const snaps = [0, 1, 2].map((t) =>
      snapshot(layout, t, { P: [t, 0], "B:start": [t, 0], "B:end": [t, 1] }),
    );
    const drawn = strands([pivot("P"), beam("B", { start: "P" })], snaps);
    expect(drawn.map((s) => s.elementID)).toEqual(["P", "B"]);
    expect(drawn[0].points).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
    ]);
    // The beam keeps its free end alone, and its own hue: the shared point is the node's to draw.
    expect(drawn[1].points).toEqual([
      [0, 1],
      [1, 1],
      [2, 1],
    ]);
    expect(drawn[0].colorIndex).not.toBe(drawn[1].colorIndex);
  });

  it("deux segments qui se rejoignent ne tracent le point commun qu'une fois", () => {
    const layout = make_snapshot_layout(
      ["P", "B1:start", "B1:end", "B2:start", "B2:end"],
      [],
    );
    const snaps = [0, 1].map((t) =>
      snapshot(layout, t, {
        P: [t, 0],
        "B1:start": [t, 0],
        "B1:end": [t, 1],
        "B2:start": [t, 0],
        "B2:end": [t, 2],
      }),
    );
    // The node they meet on draws nothing of its own, so the first segment to claim the point keeps it.
    const drawn = strands(
      [
        pivot("P", {}),
        beam("B1", { start: "P" }),
        beam("B2", { start: "P" }),
      ],
      snaps,
    );
    expect(drawn.map((s) => s.points[0])).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
    ]);
  });

  it("un point immobile ne trace rien", () => {
    const layout = make_snapshot_layout(["P"], []);
    const snaps = [0, 1, 2].map((t) => snapshot(layout, t, { P: [3, 4] }));
    expect(strands([pivot("P")], snaps)[0].points).toEqual([]);
  });

  it("une courroie ne trace pas de trajectoire, son drapeau fût-il levé", () => {
    const layout = make_snapshot_layout(["C:start", "C:end"], []);
    const snaps = [snapshot(layout, 0, { "C:start": [0, 0], "C:end": [1, 0] })];
    const belt = {
      id: "C",
      type: "belt",
      positionStart: ZERO2,
      positionEnd: ZERO2,
      overlays: shown,
    } as unknown as MechanicalElement;
    expect(strands([belt], snaps)).toEqual([]);
  });

  it("un engrenage trace les deux bords tangents à son mouvement", () => {
    const layout = make_snapshot_layout(["A", "G"], ["G"]);
    const snaps = [0, 1, 2].map((t) =>
      snapshot(layout, t, { A: [t, 0], G: [t, 0] }),
    );
    const drawn = strands([axle("A", ["G"]), gear("G", 0.1, "A")], snaps);
    expect(drawn).toHaveLength(2);
    // Travelling along +x, the disc stays tangent to the two lines a radius above and below it.
    expect(drawn[0].points).toEqual([
      [0, 0.1],
      [1, 0.1],
      [2, 0.1],
    ]);
    expect(drawn[1].points).toEqual([
      [0, -0.1],
      [1, -0.1],
      [2, -0.1],
    ]);
    // One trace, whichever side of it is drawn.
    expect(drawn[0].colorIndex).toBe(drawn[1].colorIndex);
  });

  it("un engrenage qui revient sur ses pas ne croise pas ses deux bords", () => {
    const layout = make_snapshot_layout(["A", "G"], ["G"]);
    const path = [0, 1, 2, 1, 0];
    const snaps = path.map((x, t) => snapshot(layout, t, { A: [x, 0], G: [x, 0] }));
    const drawn = strands([axle("A", ["G"]), gear("G", 0.1, "A")], snaps);
    expect(drawn[0].points.map(([, y]) => y)).toEqual(Array(5).fill(0.1));
    expect(drawn[1].points.map(([, y]) => y)).toEqual(Array(5).fill(-0.1));
  });

  it("un engrenage dont l'axe est fixe ne trace rien", () => {
    const layout = make_snapshot_layout(["A", "G"], ["G"]);
    const snaps = [0, 1, 2].map((t) => snapshot(layout, t, { A: [0, 0], G: [0, 0] }));
    const drawn = strands([axle("A", ["G"]), gear("G", 0.1, "A")], snaps);
    expect(drawn.every((s) => s.points.length === 0)).toBe(true);
  });
});
