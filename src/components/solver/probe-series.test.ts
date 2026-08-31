import { describe, it, expect } from "vitest";
import { MechanicalElement } from "../../types/element";
import { ZERO } from "../../types/point2";
import {
  DynamicSnapshot,
  KinematicSnapshot,
  LinkReaction,
  SnapshotLayout,
} from "../../types/runtime-state";
import { element_reactions, get_probe_series } from "./probe-series";
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
    expect(s.unit).toBe("m");
  });

  it("vitesse : différences centrées, bornes comprises", () => {
    const s = get_probe_series(node("n"), "velocity", moving);
    // A steady 1 m/s in x and 2 in y, the clamped ends included.
    expect(curve(s, "x")).toEqual([1, 1, 1]);
    expect(curve(s, "y")).toEqual([2, 2, 2]);
    expect(curve(s, "norm")).toEqual([Math.sqrt(5), Math.sqrt(5), Math.sqrt(5)]);
    expect(s.unit).toBe("m/s");
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

describe("réactions", () => {
  const emptyLayout = make_snapshot_layout([], []);
  const reaction = (key: string, fx: number, fy: number, atAnchor: boolean): LinkReaction => ({
    type: "Distance",
    key,
    atAnchor,
    kind: "force",
    fx,
    fy,
  });
  const moment = (key: string, torque: number, atAnchor: boolean): LinkReaction => ({
    type: "KeepOrientation",
    key,
    atAnchor,
    kind: "torque",
    torque,
  });
  const dynamicSnapshot = (reactions: LinkReaction[]): DynamicSnapshot => ({
    t: 0,
    layout: emptyLayout,
    positions: new Float64Array(0),
    angles: new Float64Array(0),
    velocities: new Float64Array(0),
    accelerations: new Float64Array(0),
    angleVelocities: new Float64Array(0),
    reactions,
  });

  it("un nœud ancré lit sa réaction NÉGATÉE (le support s'oppose à ce que le lien lui impose)", () => {
    const snap = dynamicSnapshot([reaction("n", 1, 2, true)]);
    const [r] = element_reactions(node("n"), snap);
    expect(r.vector).toEqual({ x: -1, y: -2 });
    expect(r.atAnchor).toBe(true);
  });

  it("un nœud interne (mobile) garde la force telle quelle — rien à opposer", () => {
    const snap = dynamicSnapshot([reaction("n", 1, 2, false)]);
    const [r] = element_reactions(node("n"), snap);
    expect(r.vector).toEqual({ x: 1, y: 2 });
    expect(r.atAnchor).toBe(false);
  });

  it("une clé fusionnée (jointure) reste trouvée par l'id d'origine de chaque élément", () => {
    // What `compile_simulation_model`'s coincidence fusion leaves behind: a beam welded to a
    // pivot shares one solver key, comma-joined — neither original id equals it outright.
    const snap = dynamicSnapshot([reaction("pivot,e:start", 3, -1, true)]);
    expect(element_reactions(node("pivot"), snap)[0].vector).toEqual({ x: -3, y: 1 });
    expect(element_reactions(beam("e"), snap)[0].vector).toEqual({ x: -3, y: 1 });
  });

  it("une poutre a deux réactions indépendantes, une par extrémité", () => {
    const snap = dynamicSnapshot([
      reaction("e:start", 5, 0, true),
      reaction("e:end", 0, -2, false),
    ]);
    const reactions = element_reactions(beam("e"), snap);
    expect(reactions).toHaveLength(2);
    const [start, end] = reactions;
    expect(start.at).toEqual(ZERO);
    expect(start.vector).toEqual({ x: -5, y: -0 });
    expect(start.atAnchor).toBe(true);
    expect(end.vector).toEqual({ x: 0, y: -2 });
    expect(end.atAnchor).toBe(false);
  });

  it("rien à lire, rien de renvoyé", () => {
    expect(element_reactions(node("n"), dynamicSnapshot([]))).toEqual([]);
  });

  it("un moment ne se négate jamais, appui ou non — contrairement à la force", () => {
    // Verified against a textbook cantilever: `PBD_kinematic_solver.ts`'s per-link moment is
    // already computed AT the anchor FROM the free end's own (already correctly-signed) force
    // — negating it again would flip it back to the load's own moment, not the support's.
    const atAnchor = dynamicSnapshot([moment("n", 100, true)]);
    expect(element_reactions(node("n"), atAnchor)[0].moment).toBe(100);
    const atInternal = dynamicSnapshot([moment("n", 100, false)]);
    expect(element_reactions(node("n"), atInternal)[0].moment).toBe(100);
  });

  it("un point avec seulement un moment (pas de force) renvoie quand même une réaction", () => {
    const snap = dynamicSnapshot([moment("n", 100, true)]);
    const [r] = element_reactions(node("n"), snap);
    expect(r.vector).toEqual({ x: 0, y: 0 });
    expect(r.moment).toBe(100);
    expect(r.atAnchor).toBe(true);
  });

  it("force et moment au même point se combinent dans une seule réaction", () => {
    const snap = dynamicSnapshot([reaction("n", 0, 100, true), moment("n", 100, true)]);
    const [r] = element_reactions(node("n"), snap);
    expect(r.vector).toEqual({ x: -0, y: -100 });
    expect(r.moment).toBe(100);
  });
});
