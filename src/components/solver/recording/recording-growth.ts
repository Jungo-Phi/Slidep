/**
 * Whether `snapshots` is the recording `source` was, read up to `count` frames, and grown since.
 *
 * A recording only ever grows by appending, and keeps the very frame objects it already had: its first frame and the last one read are then still the same objects.
 * A rewind truncates it and a new run replaces it, and either breaks that identity, so a scan resumed on this answer never mixes two recordings.
 * An empty read has nothing to resume from.
 */
export function extends_recording<S>(
  snapshots: readonly S[],
  source: readonly S[],
  count: number,
): boolean {
  return (
    count > 0 &&
    snapshots.length >= count &&
    snapshots[0] === source[0] &&
    snapshots[count - 1] === source[count - 1]
  );
}
