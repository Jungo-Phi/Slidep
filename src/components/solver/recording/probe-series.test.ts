import { describe, it, expect } from "vitest";
import { MechanicalElement } from "../../../types/element";
import { ZERO } from "../../../types/point2";
import {
  BeltStrand,
  DynamicSnapshot,
  KinematicSnapshot,
  LinkReaction,
  SnapshotLayout,
} from "../../../types/runtime-state";
import {
  element_angular_acceleration,
  element_reactions,
  get_dynamic_probe_series,
  get_probe_series,
} from "./probe-series";
import { make_snapshot_layout } from "../snapshot";

/**
 * What a probe plots, read off snapshots built by hand so the expected numbers can be stated rather than recorded.
 * The series walks the whole recording on every render, so it resolves each element to a slot once per layout — the case that matters is therefore a recording spanning two of them, which is what an edit mid-session produces.
 */

const node = (id: string) =>
  ({ id, type: "node", position: ZERO }) as unknown as MechanicalElement;
const gear = (id: string) =>
  ({ id, type: "gear", position: ZERO, radius: 10 }) as unknown as MechanicalElement;
const beam = (id: string) =>
  ({ id, type: "beam", positionStart: ZERO, positionEnd: ZERO }) as unknown as MechanicalElement;

/** Degrees are what an angle is easiest to state a case in; the series answers in radians. */
const rad = (deg: number) => (deg * Math.PI) / 180;

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

  it("angle : celui de l'engrenage, en radians", () => {
    const turning = [0, 1].map((t) =>
      snapshot(layout, t, { n: [0, 0] }, { g: t * Math.PI }),
    );
    expect(curve(get_probe_series(gear("g"), "angle", turning), "value")).toEqual([
      0, Math.PI,
    ]);
  });

  it("angle : la direction d'une arête, déroulée à la couture ±π", () => {
    // The beam sweeps past +180°: raw atan2 would jump to −179°, the curve must go to +181°.
    const swinging = [179, 181, 183].map((deg, i) => {
      const a = rad(deg);
      return snapshot(layout, i, {
        "e:start": [0, 0],
        "e:end": [Math.cos(a), Math.sin(a)],
      });
    });
    const values = curve(get_probe_series(beam("e"), "angle", swinging), "value");
    expect(values[0]).toBeCloseTo(rad(179), 9);
    expect(values[1]).toBeCloseTo(rad(181), 9);
    expect(values[2]).toBeCloseTo(rad(183), 9);
  });

  it("vitesse angulaire : en radians par seconde", () => {
    // A quarter turn per second.
    // Not a faster one: the unwrapping reads half a turn per sample or more as a step backwards, which is aliasing, not a defect.
    const spinning = [0, 1, 2].map((t) =>
      snapshot(layout, t, { n: [0, 0] }, { g: (t * Math.PI) / 2 }),
    );
    const values = curve(
      get_probe_series(gear("g"), "angular-velocity", spinning),
      "value",
    );
    for (const v of values) expect(v).toBeCloseTo(Math.PI / 2, 12);
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

describe("accélération angulaire", () => {
  const layout = make_snapshot_layout(["e:start", "e:end", "n"], ["g"]);
  const dynamic = (
    positions: number[],
    accelerations: number[],
    angleAccelerations: number[],
  ): DynamicSnapshot => ({
    t: 0,
    layout,
    positions: Float64Array.from(positions),
    angles: new Float64Array(1),
    velocities: new Float64Array(6),
    accelerations: Float64Array.from(accelerations),
    angleVelocities: new Float64Array(1),
    angleAccelerations: Float64Array.from(angleAccelerations),
  });

  it("une arête la lit sur ses deux bouts, sans que la part centripète s'en mêle", () => {
    // A rod of length 2 turning about its start at ω = 4, α = 3: its end accelerates by α·ẑ×r − ω²·r.
    const alpha = 3;
    const omega = 4;
    const snap = dynamic(
      [0, 0, 2, 0, 0, 0],
      [0, 0, -omega * omega * 2, alpha * 2, 0, 0],
      [0],
    );
    expect(element_angular_acceleration(beam("e"), snap)).toBeCloseTo(alpha, 12);
  });

  it("un engrenage lit son propre slot, un point n'en a aucune", () => {
    const snap = dynamic([0, 0, 2, 0, 0, 0], new Array(6).fill(0), [7]);
    expect(element_angular_acceleration(gear("g"), snap)).toBe(7);
    expect(element_angular_acceleration(node("n"), snap)).toBeUndefined();
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
    angleAccelerations: new Float64Array(0),
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
    // What `compile_simulation_model`'s coincidence fusion leaves behind: a beam welded to a pivot shares one solver key, comma-joined — neither original id equals it outright.
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
    // Verified against a textbook cantilever: `PBD_kinematic_solver.ts`'s per-link moment is already computed AT the anchor FROM the free end's own (already correctly-signed) force — negating it again would flip it back to the load's own moment, not the support's.
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


describe("ce qu'un membre et une glissière mesurent d'eux-mêmes", () => {
  const spring = (id: string, stiffness: number, restLength?: number) =>
    ({
      id,
      type: "spring",
      positionStart: ZERO,
      positionEnd: ZERO,
      stiffness,
      restLength,
    }) as unknown as MechanicalElement;
  const damper = (id: string, damping: number) =>
    ({
      id,
      type: "damper",
      positionStart: ZERO,
      positionEnd: ZERO,
      damping,
    }) as unknown as MechanicalElement;
  const belt = (id: string) =>
    ({
      id,
      type: "belt",
      positionStart: ZERO,
      positionEnd: ZERO,
    }) as unknown as MechanicalElement;
  const slider = (id: string, parentBeamID?: string) =>
    ({ id, type: "slider", position: ZERO, parentBeamID }) as unknown as MechanicalElement;

  const layout = make_snapshot_layout(["e:start", "e:end", "s", "r:start", "r:end"], []);

  /** A dynamic instant on `layout`: same positions as `snapshot`, plus the velocities the solver carries. */
  function moving_snapshot(
    t: number,
    at: Record<string, [number, number]>,
    velocities: Record<string, [number, number]> = {},
  ): DynamicSnapshot {
    const still = snapshot(layout, t, at);
    const v = new Float64Array(layout.keys.length * 2).fill(NaN);
    for (const [key, [vx, vy]] of Object.entries(velocities)) {
      const i = layout.index.get(key)!;
      v[2 * i] = vx;
      v[2 * i + 1] = vy;
    }
    return {
      ...still,
      velocities: v,
      accelerations: new Float64Array(layout.keys.length * 2),
      angleVelocities: new Float64Array(0),
      angleAccelerations: new Float64Array(0),
    };
  }

  /** A member stretching from 2 m to 4 m, one metre per second. */
  const stretching = [0, 1, 2].map((t) =>
    snapshot(layout, t, { "e:start": [0, 0], "e:end": [2 + t, 0] }),
  );

  it("longueur : la distance entre les deux bouts", () => {
    const s = get_probe_series(spring("e", 10), "length", stretching);
    expect(s.t).toEqual([0, 1, 2]);
    expect(curve(s, "value")).toEqual([2, 3, 4]);
    expect(s.unit).toBe("m");
  });

  it("longueur : une courroie n'en lit aucune, ses bouts ne disent pas son trajet", () => {
    expect(get_probe_series(belt("e"), "length", stretching).t).toEqual([]);
  });

  it("allongement : compté depuis la longueur au repos, négatif en compression", () => {
    const s = get_probe_series(spring("e", 10, 3), "elongation", stretching);
    expect(curve(s, "value")).toEqual([-1, 0, 1]);
  });

  it("allongement : sans longueur au repos à mesurer, rien à lire", () => {
    // A beam is never at rest at a length of its own, and a damper's own `restLength` only serves its drawing.
    expect(get_probe_series(beam("e"), "elongation", stretching).t).toEqual([]);
    expect(get_probe_series(damper("e", 4), "elongation", stretching).t).toEqual([]);
  });

  it("vitesse d'allongement : en cinématique, la longueur dérivée", () => {
    const s = get_probe_series(damper("e", 4), "elongation-velocity", stretching);
    expect(curve(s, "value")).toEqual([1, 1, 1]);
    expect(s.unit).toBe("m/s");
  });

  it("vitesse d'allongement : en dynamique, la part axiale du mouvement relatif", () => {
    // The end runs at (2, 5) along an axis pointing in x: only the 2 lengthens the member.
    const snaps = [
      moving_snapshot(
        0,
        { "e:start": [0, 0], "e:end": [3, 0] },
        { "e:start": [0, 0], "e:end": [2, 5] },
      ),
    ];
    const s = get_dynamic_probe_series(damper("e", 4), "elongation-velocity", snaps);
    expect(curve(s, "value")).toEqual([2]);
  });

  it("effort axial : la loi du ressort, positif en traction", () => {
    const snaps = [
      moving_snapshot(0, { "e:start": [0, 0], "e:end": [3, 0] }, {}),
      moving_snapshot(1, { "e:start": [0, 0], "e:end": [1, 0] }, {}),
    ];
    const s = get_dynamic_probe_series(spring("e", 10, 2), "axial-force", snaps);
    // Stretched by one metre, then compressed by one.
    expect(curve(s, "value")).toEqual([10, -10]);
    expect(s.unit).toBe("N");
  });

  it("effort axial : celle de l'amortisseur, positif quand il s'allonge", () => {
    const snaps = [
      moving_snapshot(
        0,
        { "e:start": [0, 0], "e:end": [3, 0] },
        { "e:start": [0, 0], "e:end": [2, 0] },
      ),
    ];
    const s = get_dynamic_probe_series(damper("e", 4), "axial-force", snaps);
    expect(curve(s, "value")).toEqual([8]);
  });

  it("effort axial : le solveur cinématique n'en calcule aucun", () => {
    expect(get_probe_series(spring("e", 10, 2), "axial-force", stretching).t).toEqual([]);
  });

  /** A dynamic instant carrying reactions the element's own keys are caught up in. */
  const with_reactions = (
    snap: DynamicSnapshot,
    reactions: LinkReaction[],
  ): DynamicSnapshot => ({ ...snap, reactions });

  it("réactions d'un ressort : sa propre loi aux deux bouts, pas ce qui traîne sur la clé fusionnée", () => {
    // Stretched 2 m past its rest length at 10 N/m: 20 N, whatever the node its start is welded into carries besides.
    const snap = with_reactions(
      moving_snapshot(0, { "e:start": [0, 0], "e:end": [5, 0] }),
      [
        {
          type: "Distance",
          key: "n,e:start",
          atAnchor: true,
          kind: "force",
          fx: 900,
          fy: 900,
        },
      ],
    );
    const [start, end] = element_reactions(spring("e", 10, 3), snap);
    // Each end pulled toward the other, and no couple: the member is massless and its law purely axial.
    expect(start.vector.x).toBeCloseTo(20, 12);
    expect(start.vector.y).toBeCloseTo(0, 12);
    expect(end.vector.x).toBeCloseTo(-20, 12);
    expect(end.vector.y).toBeCloseTo(0, 12);
    expect(start.moment).toBeUndefined();
    expect(end.moment).toBeUndefined();
    // Still read off the raw reactions: where the end sat in the solve is the one thing the law cannot say.
    expect(start.atAnchor).toBe(true);
    expect(end.atAnchor).toBe(false);
  });

  it("réactions d'un amortisseur : sa loi aussi, opposée d'un bout à l'autre", () => {
    // Ends separating at 2 m/s along the axis, at 4 N·s/m: 8 N.
    const snap = moving_snapshot(
      0,
      { "e:start": [0, 0], "e:end": [3, 0] },
      { "e:start": [0, 0], "e:end": [2, 5] },
    );
    const [start, end] = element_reactions(damper("e", 4), snap);
    expect(start.vector.x).toBeCloseTo(8, 12);
    expect(end.vector.x).toBeCloseTo(-8, 12);
  });

  it("position sur le rail : la fraction parcourue, quoi que le rail lui-même fasse", () => {
    const snaps = [
      // A vertical rail, then the same rail turned a quarter and moved: the slider has not budged along it.
      snapshot(layout, 0, { s: [1, 3], "r:start": [1, 1], "r:end": [1, 5] }),
      snapshot(layout, 1, { s: [2, 0], "r:start": [0, 0], "r:end": [4, 0] }),
    ];
    const s = get_probe_series(slider("s", "r"), "slide-abscissa", snaps);
    // 2 m along a 4 m rail, both times.
    expect(curve(s, "value")).toEqual([0.5, 0.5]);
  });

  it("position sur le rail : rien à lire pour une glissière sans rail", () => {
    const snaps = [snapshot(layout, 0, { s: [1, 3] })];
    expect(get_probe_series(slider("s"), "slide-abscissa", snaps).t).toEqual([]);
  });

  // A speed in m/s, though the position it derives is a fraction of the rail — the two read the abscissa in different units on purpose.
  it("vitesse de glissement : l'abscisse dérivée, dans les deux modes", () => {
    const sliding = [0, 1, 2].map((t) =>
      snapshot(layout, t, { s: [t, 0], "r:start": [0, 0], "r:end": [9, 0] }),
    );
    const s = get_probe_series(slider("s", "r"), "slide-velocity", sliding);
    expect(curve(s, "value")).toEqual([1, 1, 1]);
    expect(s.unit).toBe("m/s");
  });
});

describe("tension de courroie", () => {
  const belt = { id: "b", type: "belt" } as unknown as MechanicalElement;
  const emptyLayout = make_snapshot_layout([], []);
  const strand = (
    beltID: string,
    from: [number, number],
    to: [number, number],
    tension: number,
    determined = true,
  ): BeltStrand =>
    ({
      beltID,
      fromX: from[0],
      fromY: from[1],
      toX: to[0],
      toY: to[1],
      tension,
      determined,
    }) as BeltStrand;
  const at = (t: number, beltStrands: BeltStrand[]): DynamicSnapshot => ({
    t,
    layout: emptyLayout,
    positions: new Float64Array(0),
    angles: new Float64Array(0),
    velocities: new Float64Array(0),
    accelerations: new Float64Array(0),
    angleVelocities: new Float64Array(0),
    angleAccelerations: new Float64Array(0),
    beltStrands,
  });

  it("lit le brin le plus tendu de sa propre courroie, et d'aucune autre", () => {
    const snaps = [
      at(0, [strand("b", [0, 1], [10, 1], 40), strand("b", [10, -1], [0, -1], 5), strand("other", [0, 0], [1, 0], 900)]),
      at(1, [strand("b", [0, 1], [10, 1], 3), strand("b", [10, -1], [0, -1], 12)]),
    ];
    const series = get_dynamic_probe_series(belt, "belt-tension", snaps);
    expect(series.t).toEqual([0, 1]);
    expect(curve(series, "value")).toEqual([40, 12]);
  });

  it("saute un instant dont un brin reste indéterminé, plutôt que d'en donner un maximum faux", () => {
    const snaps = [
      at(0, [strand("b", [0, 1], [10, 1], 40), strand("b", [10, -1], [0, -1], 5, false)]),
      at(1, [strand("b", [0, 1], [10, 1], 7)]),
    ];
    expect(get_dynamic_probe_series(belt, "belt-tension", snaps).t).toEqual([1]);
  });

  it("tire chaque bout d'un brin vers l'autre, et ne montre rien d'un brin indéterminé", () => {
    const snap = at(0, [strand("b", [0, 0], [4, 0], 10), strand("b", [4, 0], [4, 3], 99, false)]);
    const reactions = element_reactions(belt, snap);
    expect(reactions).toHaveLength(2);
    const [leaving, landing] = reactions;
    expect(leaving.at).toEqual({ x: 0, y: 0 });
    expect(leaving.vector).toEqual({ x: 10, y: 0 });
    expect(landing.at).toEqual({ x: 4, y: 0 });
    expect(landing.vector.x).toBe(-10);
    expect(landing.vector.y).toBeCloseTo(0);
  });
});
