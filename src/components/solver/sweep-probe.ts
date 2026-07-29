/**
 * TEMPORARY — dimensioning for chantier 2 (early exit on displacement). Reports, per
 * Gauss-Seidel sweep, how far the mechanism actually moved, next to the residual criterion
 * in force today. Off by default; enabling it snapshots the node arrays once per sweep.
 * Delete once the early-exit threshold is chosen.
 */

export interface SweepSample {
  /** Sweep index, from 0. */
  sweep: number;
  /** Largest node displacement over this sweep, in px. */
  moved: number;
  /** Largest angle change over this sweep, in rad. */
  turned: number;
  /** Worst residual at the end of this sweep — what `maxError < epsilon` reads. */
  maxError: number;
  /**
   * State at the start of this sweep, alongside the live node arrays: their difference is
   * the sweep's displacement vector, whose SHAPE tells a slow global mode (a steady
   * direction, spread out) from two constraints duelling (alternating sign, concentrated).
   *
   * Live references, valid only for the duration of the callback — the solver keeps
   * writing into them. Copy what you keep.
   */
  shape: {
    x: Float64Array;
    y: Float64Array;
    angle: Float64Array;
    prevX: Float64Array;
    prevY: Float64Array;
    prevA: Float64Array;
    count: number;
    /** Slot → key, so the busiest DOF of a slow mode can be named. */
    keys: string[];
  };
}

export type SweepProbe = (sample: SweepSample) => void;

/** A sample without its live arrays — what `collect_sweeps` can safely retain. */
export type SweepScalars = Omit<SweepSample, "shape">;

let activeProbe: SweepProbe | null = null;

/** The installed probe, read once per solve — never per sweep. */
export function sweep_probe(): SweepProbe | null {
  return activeProbe;
}

/**
 * Runs `body` with the probe on, returning every sweep it saw — scalars only. `shape`
 * holds live arrays that keep changing after the callback returns, so it is dropped here
 * rather than retained stale; read it from your own probe if you want it.
 */
export function collect_sweeps(
  body: () => void,
): SweepScalars[] {
  const samples: SweepScalars[] = [];
  const previous = activeProbe;
  activeProbe = ({ sweep, moved, turned, maxError }) =>
    samples.push({ sweep, moved, turned, maxError });
  try {
    body();
  } finally {
    activeProbe = previous;
  }
  return samples;
}

/** Installs `probe` for the duration of `body`. For consumers that need `shape`. */
export function with_sweep_probe(probe: SweepProbe, body: () => void): void {
  const previous = activeProbe;
  activeProbe = probe;
  try {
    body();
  } finally {
    activeProbe = previous;
  }
}
