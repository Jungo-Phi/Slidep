/** One station of a beam's stress overlay: `offset` a fraction of the beam's length, `severity` what ranks two readings against each other, `color` what the lens paints for it. */
export interface StressReading {
  offset: number;
  severity: number;
  color: string;
}

/** Below this, two offsets are the same station. */
const SAME_STATION = 1e-9;

/**
 * The worst reading among those at the station nearest to `offset`.
 * A station where the field jumps holds two readings (just before, just after) and the worst wins, like everywhere else the overlay names a node.
 * Nearest rather than exact: a node the field has no station for still reads the closest one.
 */
export function reading_at(
  readings: StressReading[],
  offset: number,
): StressReading | undefined {
  let nearest = Infinity;
  for (const reading of readings)
    nearest = Math.min(nearest, Math.abs(reading.offset - offset));
  let worst: StressReading | undefined;
  for (const reading of readings) {
    if (Math.abs(reading.offset - offset) > nearest + SAME_STATION) continue;
    if (!worst || reading.severity > worst.severity) worst = reading;
  }
  return worst;
}

/** The worst of several readings, skipping the absent ones; `undefined` when none is left. */
export function worst_reading(
  readings: (StressReading | undefined)[],
): StressReading | undefined {
  let worst: StressReading | undefined;
  for (const reading of readings)
    if (reading && (!worst || reading.severity > worst.severity))
      worst = reading;
  return worst;
}

/** Where `point` sits along the beam from `start` to `end`, as a fraction of its length clamped to `[0, 1]`. */
export function beam_offset(
  start: { x: number; y: number },
  end: { x: number; y: number },
  point: { x: number; y: number },
): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return 0;
  const t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared;
  return Math.min(Math.max(t, 0), 1);
}
