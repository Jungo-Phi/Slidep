import { set_sim_clock, sim_clock } from "../dynamics/sim-clock";
import { at_recording_end, snapshot_index_at } from "../dynamics/simulation-engine";

/** How long a jump through the recording takes on screen at most, in ms — the same swing as the way back to rest. */
export const SEEK_MS = 250;

/** The jump, in simulated seconds, from which a sweep takes the whole {@link SEEK_MS}: a shorter one is swept proportionally faster, so it never plays slower than real time. */
const SEEK_FULL_S = 1;

/** How far Shift+arrow moves through the recording, in simulated seconds. */
const SEEK_STEP_S = 1;

/** The frame request of the jump under way, if any. */
let seekFrame: number | null = null;

/** Stops the jump under way where it stands: whoever takes the cursor over from there decides where it goes. */
export function cancel_seek(): void {
  if (seekFrame !== null) cancelAnimationFrame(seekFrame);
  seekFrame = null;
}

/** Whether the run is being held on, Space down: a replay then runs on past the end of the recording instead of stopping there. */
let playThrough = false;

export function set_play_through(on: boolean): void {
  playThrough = on;
}

export function play_through(): boolean {
  return playThrough;
}

/** The end of the recording, 0 before anything is recorded. */
export function recording_end(): number {
  const snaps = sim_clock().simulationSnapshots;
  return snaps.length > 0 ? snaps[snaps.length - 1].t : 0;
}

/**
 * Pauses and moves the cursor to `to`.
 * Landing on the end of the recording is not scrubbing: playing from there records on.
 *
 * `animate` sweeps the mechanism there in up to {@link SEEK_MS}, so a jump reads as motion through the recording rather than as a cut.
 * It is meant for a jump, not for a drag, which follows the pointer already.
 * The sweep is a replay: playing during it walks on to the end of the recording, it does not record from the middle of it.
 */
export function seek_to(to: number, animate = false): void {
  cancel_seek();
  const from = sim_clock().time;
  const scrubbed = !at_recording_end(sim_clock().simulationSnapshots, to);
  if (!animate || from === to) {
    set_sim_clock((prev) => ({ ...prev, time: to, isPlaying: false, scrubbed }));
    return;
  }
  // An edit truncates the recording, or a mode change replaces it: either ends the sweep where it stands.
  const recording = sim_clock().simulationSnapshots;
  set_sim_clock((prev) => ({ ...prev, isPlaying: false, scrubbed: true }));
  const duration = SEEK_MS * Math.min(1, Math.abs(to - from) / SEEK_FULL_S);
  let start: number | null = null;
  const frame = (now: number) => {
    const clock = sim_clock();
    if (clock.isPlaying || clock.simulationSnapshots !== recording) {
      seekFrame = null;
      return;
    }
    start ??= now;
    const progress = Math.min(1, (now - start) / duration);
    const done = progress >= 1;
    // Ease-out: off at once, settling onto the instant asked for.
    const time = done ? to : to + (from - to) * (1 - progress) ** 3;
    set_sim_clock((prev) => ({ ...prev, time, ...(done ? { scrubbed } : {}) }));
    seekFrame = done ? null : requestAnimationFrame(frame);
  };
  seekFrame = requestAnimationFrame(frame);
}

/**
 * Moves the cursor one step through the recording, back for `direction` -1: to the neighbouring recorded instant, or by {@link SEEK_STEP_S} with `big`.
 * Does nothing before anything is recorded.
 */
export function step_through_recording(direction: 1 | -1, big: boolean): void {
  const snaps = sim_clock().simulationSnapshots;
  if (snaps.length === 0) return;
  const end = recording_end();
  const time = sim_clock().time;
  let to: number;
  if (big) to = time + direction * SEEK_STEP_S;
  else {
    const i = snapshot_index_at(snaps, time);
    // Between two instants, a step back lands on the one just behind.
    const behind = snaps[i].t < time && direction < 0;
    to = snaps[Math.max(0, Math.min(snaps.length - 1, behind ? i : i + direction))].t;
  }
  seek_to(Math.max(0, Math.min(end, to)), big);
}
