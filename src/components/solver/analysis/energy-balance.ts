import { DynamicSnapshot } from "../../../types/runtime-state";
import { extends_recording } from "../recording/recording-growth";

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
  /** J — work the cursor's grab has given since the start of the recording (signed): what pulling a part by hand puts in, or takes back when it holds one. */
  grabWork: number[];
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
  grabWork: [],
  damperWork: [],
  frictionWork: [],
  impactWork: [],
};

/** Where a balance stands after its last frame: what the next frame needs to carry on from it. */
interface EnergyCarry {
  motorJ: number;
  loadJ: number;
  grabJ: number;
  damperJ: number;
  frictionJ: number;
  impactJ: number;
  prevT: number | undefined;
  prev: { motor: number; load: number; damper: number; friction: number } | undefined;
  /** `potential`'s raw value at the first frame carrying an energy sample — the offset subtracted from every frame so it reads 0 there. */
  epOrigin: number | undefined;
}

/**
 * A balance together with what it takes to extend it — see {@link extend_energy_balance}.
 * Its arrays grow in place when it is extended: hold on to the series of the latest run only.
 */
export interface EnergyBalanceRun {
  series: EnergyBalanceSeries;
  /** The recording it read, and how many of its frames. */
  source: DynamicSnapshot[];
  count: number;
  carry: EnergyCarry;
}

export function compute_energy_balance(
  snapshots: DynamicSnapshot[],
): EnergyBalanceSeries {
  return extend_energy_balance(snapshots, null).series;
}

/**
 * The balance of `snapshots`, reading only the frames `previous` has not seen when `snapshots` is the same recording grown since.
 * A recording truncated or replaced since (a rewind, a new run) is read again from its start.
 * What the panel calls at every mirror tick: a whole recording costs a pass over every frame, the new frames alone a few.
 */
export function extend_energy_balance(
  snapshots: DynamicSnapshot[],
  previous: EnergyBalanceRun | null,
): EnergyBalanceRun {
  const continues =
    previous !== null &&
    extends_recording(snapshots, previous.source, previous.count);
  if (continues && snapshots.length === previous.count)
    return { ...previous, source: snapshots };

  const series: EnergyBalanceSeries = continues
    ? previous.series
    : {
        t: [],
        kinetic: [],
        potential: [],
        mechanical: [],
        motorWork: [],
        loadWork: [],
        grabWork: [],
        damperWork: [],
        frictionWork: [],
        impactWork: [],
      };
  const carry: EnergyCarry = continues
    ? { ...previous.carry }
    : {
        motorJ: 0,
        loadJ: 0,
        grabJ: 0,
        damperJ: 0,
        frictionJ: 0,
        impactJ: 0,
        prevT: undefined,
        prev: undefined,
        epOrigin: undefined,
      };

  for (let i = continues ? previous.count : 0; i < snapshots.length; i++) {
    const snap = snapshots[i];
    if (!snap.energy) continue;
    const {
      kinetic: ec,
      potentialGravity,
      potentialSpring,
      damperPower,
      frictionPower,
      loadPower,
      grabWork,
      impactLoss,
    } = snap.energy;
    const epRaw = potentialGravity + potentialSpring;
    carry.epOrigin ??= epRaw;
    const ep = epRaw - carry.epOrigin;

    const motorWatts = (snap.motor ?? []).reduce((sum, m) => sum + m.watts, 0);
    const power = {
      motor: motorWatts,
      load: loadPower,
      damper: damperPower,
      friction: frictionPower,
    };
    if (carry.prevT !== undefined && carry.prev !== undefined) {
      const dt = snap.t - carry.prevT;
      carry.motorJ += ((power.motor + carry.prev.motor) / 2) * dt;
      carry.loadJ += ((power.load + carry.prev.load) / 2) * dt;
      carry.damperJ += ((power.damper + carry.prev.damper) / 2) * dt;
      carry.frictionJ += ((power.friction + carry.prev.friction) / 2) * dt;
      // Already an energy per frame, so summed as is rather than integrated; the first frame's is dropped like the powers' first interval.
      carry.grabJ += grabWork;
      carry.impactJ += impactLoss;
    }
    carry.prevT = snap.t;
    carry.prev = power;

    series.t.push(snap.t);
    series.kinetic.push(ec);
    series.potential.push(ep);
    series.mechanical.push(ec + ep);
    series.motorWork.push(carry.motorJ);
    series.loadWork.push(carry.loadJ);
    series.grabWork.push(carry.grabJ);
    series.damperWork.push(carry.damperJ);
    series.frictionWork.push(carry.frictionJ);
    series.impactWork.push(carry.impactJ);
  }

  return {
    // A new object around the same arrays, so a consumer comparing series by identity sees the change.
    series: { ...series },
    source: snapshots,
    count: snapshots.length,
    carry,
  };
}
