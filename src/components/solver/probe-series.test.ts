import { describe, it, expect } from "vitest";
import { MechanicalElement } from "../../types/element";
import { ZERO } from "../../types/point2";
import { KinematicSnapshot, SnapshotLayout } from "../../types/runtime-state";
import { get_probe_series } from "./probe-series";
import { make_snapshot_layout } from "./snapshot";

/**
 * What a probe plots, read off snapshots built by hand so the expected numbers can be
 * stated rather than recorded. The series walks the whole recording on every render, so it
 * resolves each element to a slot once per layout — the case that matters is therefore a
 * recording spanning two of them, which is what an edit mid-session produces.
 */

const node = (id: string) =>
  ({ id, type: "node", position: ZERO }) as unknown as MechanicalElement;
const gear = (id: string) =>
  ({ id, type: "gear", position: ZERO, radius: 10 }) as unknown as MechanicalElement;
const beam = (id: string) =>
  ({ id, type: "beam", positionStart: ZERO, positionEnd: ZERO }) as unknown as MechanicalElement;

/** A snapshot on `layout`. Keys left unnamed keep the NaN of a slot with no value. */
function snapshot(
  layout: SnapshotLayout,
  t: number,
  at: Record<string, [number, number]>,
  angles: Record<string, number> = {},
): KinematicSnapshot {
  const positions = new Float64Array(layout.keys.length * 2).fill(NaN);
  for (const [key, [x, y]] of Object.entries(at)) {
    const i = layout.index.get(key)!;
    positions[2 * i] = x;
    positions[2 * i + 1] = y;
  }
  const rotations = new Float64Array(layout.angleKeys.length).fill(NaN);
  for (const [key, v] of Object.entries(angles))
    rotations[layout.angleIndex.get(key)!] = v;
  return { t, layout, positions, angles: rotations };
}

const curve = (series: { curves: { key: string; values: number[] }[] }, key: string) =>
  series.curves.find((c) => c.key === key)!.values;

describe("séries de sonde", () => {
  const layout = make_snapshot_layout(["n", "e:start", "e:end", "g"], ["g"]);
  /** A node at (t, 2t) over three seconds. */
  const moving = [0, 1, 2].map((t) =>
    snapshot(layout, t, { n: [t, 2 * t] }, { g: 0 }),
  );

  it("position : x, y, et la norme comme déplacement depuis le départ", () => {
    const s = get_probe_series(node("n"), "position", moving);
    expect(s.t).toEqual([0, 1, 2]);
    expect(curve(s, "x")).toEqual([0, 1, 2]);
    expect(curve(s, "y")).toEqual([0, 2, 4]);
    expect(curve(s, "norm")).toEqual([0, Math.sqrt(5), Math.sqrt(20)]);
    expect(s.unit).toBe("mm");
  });

  it("vitesse : différences centrées, bornes comprises", () => {
    const s = get_probe_series(node("n"), "velocity", moving);
    // A steady 1 px/s in x and 2 in y, the clamped ends included.
    expect(curve(s, "x")).toEqual([1, 1, 1]);
    expect(curve(s, "y")).toEqual([2, 2, 2]);
    expect(curve(s, "norm")).toEqual([Math.sqrt(5), Math.sqrt(5), Math.sqrt(5)]);
    expect(s.unit).toBe("mm/s");
  });

  it("un élément que l'enregistrement ne porte pas ne trace rien", () => {
    expect(get_probe_series(node("absent"), "position", moving).t).toEqual([]);
    // Present in the layout, but with no value at any instant.
    expect(get_probe_series(beam("e"), "position", moving).t).toEqual([]);
  });

  it("angle : celui de l'engrenage, en degrés", () => {
    const turning = [0, 1].map((t) =>
      snapshot(layout, t, { n: [0, 0] }, { g: t * Math.PI }),
    );
    expect(curve(get_probe_series(gear("g"), "angle", turning), "value")).toEqual([
      0, 180,
    ]);
  });

  it("angle : la direction d'une arête, déroulée à la couture ±180°", () => {
    // The beam sweeps past +180°: raw atan2 would jump to −179°, the curve must go to +181°.
    const swinging = [179, 181, 183].map((deg, i) => {
      const a = (deg * Math.PI) / 180;
      return snapshot(layout, i, {
        "e:start": [0, 0],
        "e:end": [Math.cos(a), Math.sin(a)],
      });
    });
    const values = curve(get_probe_series(beam("e"), "angle", swinging), "value");
    expect(values[0]).toBeCloseTo(179, 9);
    expect(values[1]).toBeCloseTo(181, 9);
    expect(values[2]).toBeCloseTo(183, 9);
  });

  it("vitesse angulaire : en tours par minute", () => {
    // A quarter turn per second is 15 tr/min. Not a faster one: the unwrapping reads half a
    // turn per sample or more as a step backwards, which is aliasing, not a defect.
    const spinning = [0, 1, 2].map((t) =>
      snapshot(layout, t, { n: [0, 0] }, { g: (t * Math.PI) / 2 }),
    );
    const values = curve(
      get_probe_series(gear("g"), "angular-velocity", spinning),
      "value",
    );
    for (const v of values) expect(v).toBeCloseTo(15, 12);
  });

  it("traverse un changement de disposition sans lire le mauvais slot", () => {
    // What an edit leaves behind: the same key, at another slot, in the same recording.
    const after = make_snapshot_layout(["leurre", "n"], []);
    expect(after.index.get("n")).not.toBe(layout.index.get("n"));
    const across = [
      ...moving,
      snapshot(after, 3, { n: [3, 6], leurre: [-99, -99] }),
      snapshot(after, 4, { n: [4, 8], leurre: [-99, -99] }),
    ];
    const s = get_probe_series(node("n"), "position", across);
    expect(s.t).toEqual([0, 1, 2, 3, 4]);
    expect(curve(s, "x")).toEqual([0, 1, 2, 3, 4]);
    expect(curve(s, "y")).toEqual([0, 2, 4, 6, 8]);
  });
});
