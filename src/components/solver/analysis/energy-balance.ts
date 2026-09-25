import { DynamicSnapshot } from "../../../types/runtime-state";

/**
 * The curves the "Bilan énergétique" chart can show — see `AnalysisPanel.tsx`, toggled the same way a vector probe's x/y/norm are.
 * `kinetic` is the raw value `EnergySample` computed that frame — its zero is physical (no motion), so it's never shifted.
 * `potential`'s own zero is an arbitrary coordinate-origin artifact of wherever the mechanism sits in the drawing, not a physical one — shifted to read 0 at the recording's first frame instead of shown at that raw magnitude, because sharing a y-axis with the other curves (`ProbeChart`) meant that offset swamped everyone's real excursion.
 * `mechanical` inherits the same shift through `potential`.
 * The cumulative work curves (`motorWork` …) are running integrals rather than states, and start at 0 for the same reason: `potential`/`mechanical` share their anchor, so their slope reads against theirs.
 */
export interface EnergyBalanceSeries {
  t: number[];
  /** J — kinetic energy (translational + rotational), always ≥ 0. */
  kinetic: number[];
  /** J — potential energy (gravity + spring), shifted to read 0 at the recording's first frame — its absolute value has no physical meaning (see the interface doc above).
   * Trades off against `kinetic` in an unmotored, undamped mechanism (a pendulum, a bouncing mass) while their sum, `mechanical`, stays flat. */
  potential: number[];
  /** J — `kinetic + potential`, so it carries `potential`'s shift to 0 at the recording's first frame — the same anchor as the cumulative work curves, for a direct visual comparison. */
  mechanical: number[];
  /**
   * J — work the motors have given since the start of the recording (signed: a braking motor takes energy back), from `DynamicSnapshot.motor`'s power.
   * Trapezoidal rather than a running Euler sum because frames land at `RECORD_DT` apart, coarser than the solver's own substeps; the other cumulative curves are integrated the same way.
   */
  motorWork: number[];
  /** J — work the user loads have given since the start of the recording (signed). */
  loadWork: number[];
  /** J — what the dampers have dissipated so far, always ≥ 0 and growing. */
  damperWork: number[];
  /** J — what the frictional joints have dissipated so far, always ≥ 0 and growing. */
  frictionWork: number[];
  /** J — what collision and floor bounces have dissipated so far, always ≥ 0 and growing. */
  impactWork: number[];
}

/** Empty when nothing has been recorded, or nothing in it yet carries an `energy` sample —
 * the same "not yet analysable" meaning an empty result carries everywhere else in this panel, never a mechanism that has none of these quantities. */
export const EMPTY_ENERGY_BALANCE: EnergyBalanceSeries = {
  t: [],
  kinetic: [],
  potential: [],
  mechanical: [],
  motorWork: [],
  loadWork: [],
  damperWork: [],
  frictionWork: [],
  impactWork: [],
};

export function compute_energy_balance(
  snapshots: DynamicSnapshot[],
): EnergyBalanceSeries {
  const t: number[] = [];
  const kinetic: number[] = [];
  const potential: number[] = [];
  const mechanical: number[] = [];
  const motorWork: number[] = [];
  const loadWork: number[] = [];
  const damperWork: number[] = [];
  const frictionWork: number[] = [];
  const impactWork: number[] = [];

  let impactJ = 0;
  let motorJ = 0;
  let loadJ = 0;
  let damperJ = 0;
  let frictionJ = 0;
  let prevT: number | undefined;
  let prev: { motor: number; load: number; damper: number; friction: number } | undefined;
  /** `potential`'s raw value at the first frame carrying an energy sample — the offset subtracted from every frame so it reads 0 there. */
  let epOrigin: number | undefined;

  for (const snap of snapshots) {
    if (!snap.energy) continue;
    const {
      kinetic: ec,
      potentialGravity,
      potentialSpring,
      damperPower,
      frictionPower,
      loadPower,
      impactLoss,
    } = snap.energy;
    const epRaw = potentialGravity + potentialSpring;
    epOrigin ??= epRaw;
    const ep = epRaw - epOrigin;

    const motorWatts = (snap.motor ?? []).reduce((sum, m) => sum + m.watts, 0);
    const power = {
      motor: motorWatts,
      load: loadPower,
      damper: damperPower,
      friction: frictionPower,
    };
    if (prevT !== undefined && prev !== undefined) {
      const dt = snap.t - prevT;
      motorJ += ((power.motor + prev.motor) / 2) * dt;
      loadJ += ((power.load + prev.load) / 2) * dt;
      damperJ += ((power.damper + prev.damper) / 2) * dt;
      frictionJ += ((power.friction + prev.friction) / 2) * dt;
      // Already an energy per frame, so summed as is rather than integrated; the first frame's is dropped like the powers' first interval.
      impactJ += impactLoss;
    }
    prevT = snap.t;
    prev = power;

    t.push(snap.t);
    kinetic.push(ec);
    potential.push(ep);
    mechanical.push(ec + ep);
    motorWork.push(motorJ);
    loadWork.push(loadJ);
    damperWork.push(damperJ);
    frictionWork.push(frictionJ);
    impactWork.push(impactJ);
  }

  return {
    t,
    kinetic,
    potential,
    mechanical,
    motorWork,
    loadWork,
    damperWork,
    frictionWork,
    impactWork,
  };
}
