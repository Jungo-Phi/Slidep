import { DynamicSnapshot } from "../../../types/runtime-state";

/**
 * The curves the "Bilan énergétique" chart can show — see `AnalysisPanel.tsx`, toggled the same way a vector probe's x/y/norm are.
 * `kinetic` is the raw value `EnergySample` computed that frame — its zero is physical (no motion), so it's never shifted.
 * `potential`'s own zero is an arbitrary coordinate-origin artifact of wherever the mechanism sits in the drawing, not a physical one — shifted to read 0 at the recording's first frame instead of shown at that raw magnitude, because sharing a y-axis with the other curves (`ProbeChart`) meant that offset swamped everyone's real excursion.
 * `mechanical` inherits the same shift through `potential`.
 * `netWorkIn` is a genuinely different kind of quantity — a running integral of work, not a state — but already had its own natural zero at the start of the recording; giving `potential`/`mechanical` the same anchor is what makes comparing their slope to it legible.
 */
export interface EnergyBalanceSeries {
  t: number[];
  /** J — kinetic energy (translational + rotational), always ≥ 0. */
  kinetic: number[];
  /** J — potential energy (gravity + spring), shifted to read 0 at the recording's first frame — its absolute value has no physical meaning (see the interface doc above).
   * Trades off against `kinetic` in an unmotored, undamped mechanism (a pendulum, a bouncing mass) while their sum, `mechanical`, stays flat. */
  potential: number[];
  /** J — `kinetic + potential`, so it carries `potential`'s shift to 0 at the recording's
   * first frame — the same anchor as `netWorkIn`, for a direct visual comparison.
   * Flat for a mechanism the solver treats as exactly conservative; any real drift (see docs/plan-analyse-ddl.md's ~0.98 spectral radius) shows up as a slope with nothing on `netWorkIn`'s own change to match it. */
  mechanical: number[];
  /**
   * J — cumulative net work IN since the start of the recording: every motor's own power (`DynamicSnapshot.motor`, summed) minus what the dampers and the frictional joints bled off (`EnergySample.damperPower`/`frictionPower`), integrated trapezoidally over the recorded frames.
   * Trapezoidal rather than a running Euler sum because frames land at `RECORD_DT` apart, coarser than the solver's own substeps — a power curve that moves within a frame is still integrated at its two recorded ends.
   * Its own slope should match `mechanical`'s; comparing the two is the whole point of this chart.
   */
  netWorkIn: number[];
}

/** Empty when nothing has been recorded, or nothing in it yet carries an `energy` sample —
 * the same "not yet analysable" meaning an empty result carries everywhere else in this panel, never a mechanism that has none of these quantities. */
export const EMPTY_ENERGY_BALANCE: EnergyBalanceSeries = {
  t: [],
  kinetic: [],
  potential: [],
  mechanical: [],
  netWorkIn: [],
};

export function compute_energy_balance(
  snapshots: DynamicSnapshot[],
): EnergyBalanceSeries {
  const t: number[] = [];
  const kinetic: number[] = [];
  const potential: number[] = [];
  const mechanical: number[] = [];
  const netWorkIn: number[] = [];

  let work = 0;
  let prevT: number | undefined;
  let prevNetPower: number | undefined;
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
    } = snap.energy;
    const epRaw = potentialGravity + potentialSpring;
    epOrigin ??= epRaw;
    const ep = epRaw - epOrigin;

    const motorWatts = (snap.motor ?? []).reduce((sum, m) => sum + m.watts, 0);
    const netPower = motorWatts - damperPower - frictionPower;
    if (prevT !== undefined && prevNetPower !== undefined)
      work += ((netPower + prevNetPower) / 2) * (snap.t - prevT);
    prevT = snap.t;
    prevNetPower = netPower;

    t.push(snap.t);
    kinetic.push(ec);
    potential.push(ep);
    mechanical.push(ec + ep);
    netWorkIn.push(work);
  }

  return { t, kinetic, potential, mechanical, netWorkIn };
}
