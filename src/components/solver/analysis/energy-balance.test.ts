import { describe, it, expect } from "vitest";
import { ID } from "../../../types/element";
import { DynamicSnapshot, EnergySample, MotorPowerSample } from "../../../types/runtime-state";
import { make_snapshot_layout } from "../snapshot";
import { compute_energy_balance } from "./energy-balance";

const layout = make_snapshot_layout([], []);
/** A stable, valid-shaped `ID` for a made-up pivot, same convention as this folder's other
 *  fixtures (see e.g. `analysis-model.test.ts`) — the type is a UUID template literal. */
const pivot = (s: string): ID => `00000000-0000-0000-0000-${s.padStart(12, "0")}` as ID;

/** A frame carrying only what `compute_energy_balance` reads — no real solver state. */
function frame(
  t: number,
  energy: EnergySample,
  motorPower: MotorPowerSample[] = [],
): DynamicSnapshot {
  return {
    t,
    layout,
    positions: new Float64Array(0),
    angles: new Float64Array(0),
    velocities: new Float64Array(0),
    accelerations: new Float64Array(0),
    angleVelocities: new Float64Array(0),
    energy,
    motorPower,
  };
}

const zeroEnergy = (kinetic: number): EnergySample => ({
  kinetic,
  potentialGravity: 0,
  potentialSpring: 0,
  damperPower: 0,
});

describe("bilan énergétique", () => {
  it("est vide sans snapshot", () => {
    expect(compute_energy_balance([])).toEqual({
      t: [],
      kinetic: [],
      potential: [],
      mechanical: [],
      netWorkIn: [],
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

  it("cinétique, potentielle et mécanique sont les valeurs absolues de la frame, sans décalage", () => {
    const s = compute_energy_balance([frame(0, zeroEnergy(10)), frame(1, zeroEnergy(14))]);
    expect(s.kinetic).toEqual([10, 14]);
    expect(s.mechanical).toEqual([10, 14]);
  });

  it("mécanique est la somme de cinétique et potentielle, chacune en valeur absolue", () => {
    // A pendulum-like trade-off: total stays at 10 J both frames, but it moves from
    // potential (at rest, top) to kinetic (moving, bottom) — neither is shifted to read 0
    // at the start, unlike a relative-to-start display would.
    const s = compute_energy_balance([
      frame(0, { kinetic: 0, potentialGravity: 10, potentialSpring: 0, damperPower: 0 }),
      frame(1, { kinetic: 6, potentialGravity: 4, potentialSpring: 0, damperPower: 0 }),
    ]);
    expect(s.kinetic).toEqual([0, 6]);
    expect(s.potential).toEqual([10, 4]);
    expect(s.mechanical).toEqual([10, 10]);
  });

  it("un moteur à puissance constante intègre un travail linéaire dans le temps", () => {
    // 2 W steady from t=0 to t=3: work should read 0, 2, 4, 6 — the trapezoid of a flat curve
    // is exact regardless of how coarsely it's sampled.
    const s = compute_energy_balance(
      [0, 1, 2, 3].map((t) => frame(t, zeroEnergy(0), [{ pivotID: pivot("m"), watts: 2 }])),
    );
    expect(s.netWorkIn).toEqual([0, 2, 4, 6]);
  });

  it("un amortisseur retranche sa puissance dissipée du travail net", () => {
    const s = compute_energy_balance(
      [0, 1].map((t) =>
        frame(t, { ...zeroEnergy(0), damperPower: 3 }, [{ pivotID: pivot("m"), watts: 5 }]),
      ),
    );
    // Net power is 5 - 3 = 2 W, held constant: work over 1 s is exactly 2 J.
    expect(s.netWorkIn).toEqual([0, 2]);
  });

  it("plusieurs moteurs se somment avant intégration", () => {
    const s = compute_energy_balance(
      [0, 1].map((t) =>
        frame(t, zeroEnergy(0), [
          { pivotID: pivot("a"), watts: 2 },
          { pivotID: pivot("b"), watts: 3 },
        ]),
      ),
    );
    expect(s.netWorkIn).toEqual([0, 5]);
  });
});
