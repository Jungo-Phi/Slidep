import { describe, it, expect } from "vitest";
import { ID } from "../../../types/element";
import { DynamicSnapshot, EnergySample, MotorSample } from "../../../types/runtime-state";
import { make_snapshot_layout } from "../snapshot";
import { compute_energy_balance } from "./energy-balance";

const layout = make_snapshot_layout([], []);
/** A stable, valid-shaped `ID` for a made-up pivot, same convention as this folder's other
 * fixtures (see e.g. `analysis-model.test.ts`) — the type is a UUID template literal. */
const pivot = (s: string): ID => `00000000-0000-0000-0000-${s.padStart(12, "0")}` as ID;

/** A frame carrying only what `compute_energy_balance` reads — no real solver state. */
function frame(
  t: number,
  energy: EnergySample,
  motor: MotorSample[] = [],
): DynamicSnapshot {
  return {
    t,
    layout,
    positions: new Float64Array(0),
    angles: new Float64Array(0),
    velocities: new Float64Array(0),
    accelerations: new Float64Array(0),
    angleVelocities: new Float64Array(0),
    angleAccelerations: new Float64Array(0),
    energy,
    motor,
  };
}

/** A motor delivering `watts`. The balance only ever sums the power, so the other fields are here to satisfy the type, not to describe a real τ·ω pair. */
const motor = (id: string, watts: number): MotorSample => ({
  pivotID: pivot(id),
  watts,
  nm: 0,
  speed: 0,
  saturated: false,
});

const zeroEnergy = (kinetic: number): EnergySample => ({
  kinetic,
  potentialGravity: 0,
  potentialSpring: 0,
  damperPower: 0,
  frictionPower: 0,
  loadPower: 0,
  impactLoss: 0,
});

describe("bilan énergétique", () => {
  it("est vide sans snapshot", () => {
    expect(compute_energy_balance([])).toEqual({
      t: [],
      kinetic: [],
      potential: [],
      mechanical: [],
      motorWork: [],
      loadWork: [],
      damperWork: [],
      frictionWork: [],
      impactWork: [],
    });
  });

  it("ignore les frames sans échantillon d'énergie", () => {
    const s = compute_energy_balance([
      { t: 0, layout, positions: new Float64Array(0), angles: new Float64Array(0) } as DynamicSnapshot,
      frame(1, zeroEnergy(5)),
    ]);
    expect(s.t).toEqual([1]);
    expect(s.kinetic).toEqual([5]);
  });

  it("cinétique est lue telle quelle, mécanique la suit quand le potentiel est nul", () => {
    const s = compute_energy_balance([frame(0, zeroEnergy(10)), frame(1, zeroEnergy(14))]);
    expect(s.kinetic).toEqual([10, 14]);
    expect(s.mechanical).toEqual([10, 14]);
  });

  it("potentielle est décalée pour lire 0 à la première frame enregistrée", () => {
    // A pendulum-like trade-off: the raw potentialGravity carries an arbitrary coordinate-origin offset (here 10 J at t=0), so shifting it to 0 is what makes mechanical read flat at 0 instead of at whatever the drawing's origin happened to add.
    const s = compute_energy_balance([
      frame(0, { ...zeroEnergy(0), potentialGravity: 10 }),
      frame(1, { ...zeroEnergy(6), potentialGravity: 4 }),
    ]);
    expect(s.kinetic).toEqual([0, 6]);
    expect(s.potential).toEqual([0, -6]);
    expect(s.mechanical).toEqual([0, 0]);
  });

  it("un moteur à puissance constante intègre un travail linéaire dans le temps", () => {
    // 2 W steady from t=0 to t=3: work should read 0, 2, 4, 6 — the trapezoid of a flat curve is exact regardless of how coarsely it's sampled.
    const s = compute_energy_balance(
      [0, 1, 2, 3].map((t) => frame(t, zeroEnergy(0), [motor("m", 2)])),
    );
    expect(s.motorWork).toEqual([0, 2, 4, 6]);
  });

  it("plusieurs moteurs se somment avant intégration", () => {
    const s = compute_energy_balance(
      [0, 1].map((t) =>
        frame(t, zeroEnergy(0), [motor("a", 2), motor("b", 3)]),
      ),
    );
    expect(s.motorWork).toEqual([0, 5]);
  });

  it("chaque source a son propre cumul", () => {
    const s = compute_energy_balance(
      [0, 1].map((t) =>
        frame(
          t,
          { ...zeroEnergy(0), loadPower: -4, damperPower: 2, frictionPower: 3 },
          [motor("m", 10)],
        ),
      ),
    );
    expect(s.motorWork).toEqual([0, 10]);
    expect(s.loadWork).toEqual([0, -4]);
    expect(s.damperWork).toEqual([0, 2]);
    expect(s.frictionWork).toEqual([0, 3]);
  });

  it("les pertes de choc s'accumulent telles quelles", () => {
    const s = compute_energy_balance([
      frame(0, zeroEnergy(0)),
      frame(1, { ...zeroEnergy(0), impactLoss: 3 }),
      frame(2, { ...zeroEnergy(0), impactLoss: 2 }),
    ]);
    expect(s.impactWork).toEqual([0, 3, 5]);
  });
});
