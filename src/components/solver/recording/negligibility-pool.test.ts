import { describe, it, expect } from "vitest";
import { MechanicalElement, ConstraintElement } from "../../../types/element";
import { Point2 } from "../../../types/point2";
import { DynamicSnapshot, LinkReaction, SnapshotLayout } from "../../../types/runtime-state";
import { EMPTY_NEGLIGIBILITY_POOL } from "../../../types";
import { make_snapshot_layout } from "../snapshot";
import { LOAD_SCALING } from "../../../constants/physics-display-specs";
import { MIN_ANGLE_POOL, MIN_LENGTH_POOL, MIN_TIME_POOL, NEGLIGIBLE_RATIO } from "../../../constants/physics-specs";
import {
  ANGLE,
  ANGULAR_VELOCITY,
  FORCE,
  LENGTH,
  LINEAR_VELOCITY,
  MOMENT,
} from "../../../utils/quantity-format";
import {
  extend_negligibility_pool,
  is_negligible,
  metric_shows_zero,
  own_floors,
  pool_floors,
  pool_key_for_metric,
  quantity_kind_for_metric,
} from "./negligibility-pool";

const node = (id: string, x: number, y: number) =>
  ({ id, type: "node", position: new Point2(x, y) }) as unknown as MechanicalElement;

/** A dynamic snapshot on `layout`. Keys/angle keys left unnamed keep NaN — no value there. */
function snap(
  layout: SnapshotLayout,
  t: number,
  positions: Record<string, [number, number]> = {},
  velocities: Record<string, [number, number]> = {},
  angles: Record<string, number> = {},
  angleVelocities: Record<string, number> = {},
  reactions: LinkReaction[] = [],
): DynamicSnapshot {
  const pos = new Float64Array(layout.keys.length * 2).fill(NaN);
  for (const [key, [x, y]] of Object.entries(positions)) {
    const i = layout.index.get(key)!;
    pos[2 * i] = x;
    pos[2 * i + 1] = y;
  }
  const vel = new Float64Array(layout.keys.length * 2).fill(NaN);
  for (const [key, [x, y]] of Object.entries(velocities)) {
    const i = layout.index.get(key)!;
    vel[2 * i] = x;
    vel[2 * i + 1] = y;
  }
  const ang = new Float64Array(layout.angleKeys.length).fill(NaN);
  for (const [key, v] of Object.entries(angles)) ang[layout.angleIndex.get(key)!] = v;
  const angVel = new Float64Array(layout.angleKeys.length).fill(NaN);
  for (const [key, v] of Object.entries(angleVelocities))
    angVel[layout.angleIndex.get(key)!] = v;
  return {
    t,
    layout,
    positions: pos,
    angles: ang,
    velocities: vel,
    accelerations: new Float64Array(layout.keys.length * 2),
    angleVelocities: angVel,
    angleAccelerations: new Float64Array(layout.angleKeys.length),
    reactions,
  };
}

const force = (key: string, fx: number, fy: number): LinkReaction => ({
  type: "Distance",
  key,
  atAnchor: false,
  kind: "force",
  fx,
  fy,
});
const torque = (key: string, value: number): LinkReaction => ({
  type: "KeepOrientation",
  key,
  atAnchor: false,
  kind: "torque",
  torque: value,
});

describe("is_negligible", () => {
  it("compare à une fraction (NEGLIGIBLE_RATIO) de l'échelle du pool", () => {
    // What is tested is the comparison itself, not the ratio's value: derived from the real constant rather than copied, so tuning `NEGLIGIBLE_RATIO` breaks nothing.
    const threshold = NEGLIGIBLE_RATIO * 100;
    expect(is_negligible(threshold * 0.5, 100)).toBe(true);
    expect(is_negligible(threshold * 2, 100)).toBe(false);
  });

  it("rien n'est négligeable face à un pool vide (rien à comparer)", () => {
    expect(is_negligible(0.0001, 0)).toBe(false);
  });
});

describe("extend_negligibility_pool", () => {
  const layout = make_snapshot_layout(["n"], ["g"]);
  const elements = [node("n", 0, 0)];
  const constraints: ConstraintElement[] = [];

  it("initialise la longueur depuis la boîte englobante du mécanisme", () => {
    const far = [node("n", 0, 0), node("far", 30, 40)]; // diagonale = 50
    const pool = extend_negligibility_pool(EMPTY_NEGLIGIBILITY_POOL, far, constraints, []);
    expect(pool.length).toBe(50);
  });

  it("accumule le max de chaque nature sur les snapshots fournis", () => {
    const snaps = [
      snap(layout, 0, { n: [0, 0] }, { n: [1, 0] }, { g: 0 }, { g: 0 }, [
        force("n", 3, 4),
      ]),
      snap(layout, 1, { n: [0, 6] }, { n: [0, 2] }, { g: 0.1 }, { g: 5 }, [
        torque("n", 7),
      ]),
    ];
    const pool = extend_negligibility_pool(EMPTY_NEGLIGIBILITY_POOL, elements, constraints, snaps);
    expect(pool.linearVelocity).toBe(2); // max(‖(1,0)‖, ‖(0,2)‖)
    expect(pool.angularVelocity).toBe(5);
    expect(pool.force).toBe(5); // ‖(3,4)‖
    expect(pool.moment).toBe(7);
    expect(pool.length).toBe(6); // displacement (0,6) from rest at (0,0)
    expect(pool.angle).toBeCloseTo(0.1, 12);
  });

  it("un slot NaN (nœud non porté par cette disposition) ne pollue aucun max", () => {
    const wide = make_snapshot_layout(["n", "autre"], []);
    const snaps = [snap(wide, 0, { n: [0, 0] }, { n: [1, 1] })];
    const pool = extend_negligibility_pool(
      EMPTY_NEGLIGIBILITY_POOL,
      elements,
      constraints,
      snaps,
    );
    expect(pool.linearVelocity).toBeCloseTo(Math.SQRT2, 12);
  });

  it("un appel qui ajoute des snapshots à un cache déjà construit ne perd pas le max précédent", () => {
    const first = [snap(layout, 0, { n: [0, 0] }, { n: [9, 0] })];
    const afterFirst = extend_negligibility_pool(
      EMPTY_NEGLIGIBILITY_POOL,
      elements,
      constraints,
      first,
    );
    const extended = [...first, snap(layout, 1, { n: [0, 0] }, { n: [1, 0] })];
    const afterSecond = extend_negligibility_pool(
      afterFirst,
      elements,
      constraints,
      extended,
    );
    expect(afterSecond.linearVelocity).toBe(9); // the new value (1) is smaller, so the max stays
    expect(afterSecond.consumed).toBe(2);
  });

  it("un changement d'éléments reconstruit le pool à partir de son plancher (nouvelle géométrie)", () => {
    const first = [snap(layout, 0, { n: [0, 0] }, { n: [9, 0] })];
    const afterFirst = extend_negligibility_pool(
      EMPTY_NEGLIGIBILITY_POOL,
      elements,
      constraints,
      first,
    );
    const otherElements = [node("n", 0, 0), node("m", 3, 4)]; // diagonal = 5
    const rebuilt = extend_negligibility_pool(afterFirst, otherElements, constraints, []);
    // Starts again from the new geometry's floor, not from the earlier 9, and not from zero either: see "un plancher absolu..." below.
    expect(rebuilt.linearVelocity).toBe(pool_floors(5).linearVelocity);
    expect(rebuilt.length).toBe(5);
    expect(rebuilt.ownFloors.length).toBe(own_floors(5).length);
  });

  it("un historique tronqué (rewind) reconstruit plutôt que de garder un max périmé", () => {
    const long = [
      snap(layout, 0, { n: [0, 0] }, { n: [9, 0] }),
      snap(layout, 1, { n: [0, 0] }, { n: [1, 0] }),
    ];
    const afterLong = extend_negligibility_pool(
      EMPTY_NEGLIGIBILITY_POOL,
      elements,
      constraints,
      long,
    );
    expect(afterLong.linearVelocity).toBe(9);
    const truncated = [snap(layout, 0, { n: [0, 0] }, { n: [2, 0] })];
    const rebuilt = extend_negligibility_pool(afterLong, elements, constraints, truncated);
    expect(rebuilt.linearVelocity).toBe(2); // not 9: that frame is gone
  });

  it("un plancher absolu tient même si rien de plus grand n'a jamais été enregistré", () => {
    // A mechanism that only ever produces residual noise (here below the velocity floor) keeps the floor as its scale: scaled on that noise, the noise could never be negligible next to itself.
    const floor = pool_floors(0).linearVelocity; // zero diagonal: the mechanism is just "n"
    const noisy = [
      snap(layout, 0, { n: [0, 0] }, { n: [floor * 0.3, 0] }),
      snap(layout, 1, { n: [0, 0] }, { n: [floor * 0.1, 0] }),
    ];
    const pool = extend_negligibility_pool(EMPTY_NEGLIGIBILITY_POOL, elements, constraints, noisy);
    expect(pool.linearVelocity).toBe(floor);
  });
});

describe("pool_floors", () => {
  it("dérive de la géométrie ce qui a une dimension de longueur, d'une constante sinon", () => {
    const floors = pool_floors(5); // the mechanism's diagonal
    expect(floors.length).toBe(5);
    // With no length dimension to use: fixed constants, independent of the geometry.
    expect(floors.angle).toBe(MIN_ANGLE_POOL);
    expect(floors.force).toBe(LOAD_SCALING.MIN_VALUE);
    // A moment is a force times a lever arm, here the mechanism's own.
    expect(floors.moment).toBe(LOAD_SCALING.MIN_VALUE * 5);
    // A velocity is a distance over a time.
    expect(floors.linearVelocity).toBe(5 / MIN_TIME_POOL);
    expect(floors.angularVelocity).toBe(MIN_ANGLE_POOL / MIN_TIME_POOL);
  });

  it("une géométrie dégénérée (diagonale nulle) retombe sur le plancher de longueur", () => {
    expect(pool_floors(0).length).toBe(MIN_LENGTH_POOL);
  });

  it("une diagonale mesurable, même sous le plancher, n'est pas remontée dessus", () => {
    // A small mechanism (here 1 mm) must stay measurable for `poolMax`: the floor only stands in for no geometry at all, it never raises a small one.
    expect(pool_floors(0.001).length).toBe(0.001);
  });
});

describe("own_floors", () => {
  it("dérive de la géométrie, ratio'ée par NEGLIGIBLE_RATIO, ce qui a une dimension de longueur", () => {
    const floors = own_floors(5); // the mechanism's diagonal
    expect(floors.length).toBe(NEGLIGIBLE_RATIO * 5);
    expect(floors.moment).toBe(LOAD_SCALING.MIN_VALUE * (NEGLIGIBLE_RATIO * 5));
    expect(floors.linearVelocity).toBe((NEGLIGIBLE_RATIO * 5) / MIN_TIME_POOL);
    // With no length dimension to use: the same fixed constants as `pool_floors`.
    expect(floors.angle).toBe(MIN_ANGLE_POOL);
    expect(floors.force).toBe(LOAD_SCALING.MIN_VALUE);
    expect(floors.angularVelocity).toBe(MIN_ANGLE_POOL / MIN_TIME_POOL);
  });

  it("une géométrie dégénérée (diagonale nulle) retombe sur le plancher de longueur, pas sur un ratio de zéro", () => {
    expect(own_floors(0).length).toBe(MIN_LENGTH_POOL);
  });
});

describe("pool_key_for_metric", () => {
  it("associe chaque métrique de sonde à la borne du pool de même nature", () => {
    expect(pool_key_for_metric("position")).toBe("length");
    expect(pool_key_for_metric("velocity")).toBe("linearVelocity");
    expect(pool_key_for_metric("angle")).toBe("angle");
    expect(pool_key_for_metric("angular-velocity")).toBe("angularVelocity");
    expect(pool_key_for_metric("force")).toBe("force");
    expect(pool_key_for_metric("force-start")).toBe("force");
    expect(pool_key_for_metric("force-end")).toBe("force");
    expect(pool_key_for_metric("moment")).toBe("moment");
    expect(pool_key_for_metric("moment-start")).toBe("moment");
    expect(pool_key_for_metric("moment-end")).toBe("moment");
  });
});

describe("metric_shows_zero", () => {
  it("position et angle sont l'exception : leur zéro est un repère arbitraire", () => {
    expect(metric_shows_zero("position")).toBe(false);
    expect(metric_shows_zero("angle")).toBe(false);
  });

  it("tout le reste montre zéro par défaut — un vrai repos physique", () => {
    expect(metric_shows_zero("velocity")).toBe(true);
    expect(metric_shows_zero("angular-velocity")).toBe(true);
    expect(metric_shows_zero("force")).toBe(true);
    expect(metric_shows_zero("force-start")).toBe(true);
    expect(metric_shows_zero("force-end")).toBe(true);
    expect(metric_shows_zero("moment")).toBe(true);
    expect(metric_shows_zero("moment-start")).toBe(true);
    expect(metric_shows_zero("moment-end")).toBe(true);
  });
});

describe("quantity_kind_for_metric", () => {
  it("associe chaque métrique de sonde à son unité adaptative propre", () => {
    expect(quantity_kind_for_metric("position")).toBe(LENGTH);
    expect(quantity_kind_for_metric("velocity")).toBe(LINEAR_VELOCITY);
    expect(quantity_kind_for_metric("angle")).toBe(ANGLE);
    // `ANGULAR_VELOCITY` is a function that rereads its symbol on every call, so each call gives a new instance: compared by structure, not by reference.
    expect(quantity_kind_for_metric("angular-velocity")).toEqual(ANGULAR_VELOCITY());
    expect(quantity_kind_for_metric("force")).toBe(FORCE);
    expect(quantity_kind_for_metric("force-start")).toBe(FORCE);
    expect(quantity_kind_for_metric("force-end")).toBe(FORCE);
    expect(quantity_kind_for_metric("moment")).toBe(MOMENT);
    expect(quantity_kind_for_metric("moment-start")).toBe(MOMENT);
    expect(quantity_kind_for_metric("moment-end")).toBe(MOMENT);
  });
});
