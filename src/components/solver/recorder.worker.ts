import { deserialize_mechanism } from "../../utils/serialization";
import { FRAME_BUDGET_MS } from "./kinematic-simulation";
import { Recorder } from "./recorder";
import {
  FromRecorder,
  ToRecorder,
  revive_grab,
  revive_snapshot,
} from "./recorder-protocol";

/**
 * The recording loop, off the UI thread.
 *
 * It does **not** answer one request per displayed frame: that would leave it idle between
 * frames and buy no throughput at all. It runs towards a target the main thread keeps
 * moving, in slices, and posts what it produced as it goes.
 *
 * A slice is bounded by the same budget the synchronous loop used — not to protect a
 * display it no longer blocks, but so that pending messages (a new target, a grab, an edit)
 * get a turn between two slices. A `setTimeout(0)` is what lets them through: the message
 * queue is only served between macrotasks.
 */

const recorder = new Recorder();
let targetTime = 0;
let speed = 1;
let running = false;
let scheduled = false;
let epoch = 0;

const post = (message: FromRecorder) => self.postMessage(message);

function slice(): void {
  scheduled = false;
  if (!running || !recorder.ready()) return;

  const frontier = recorder.frontier();
  if (frontier !== null && frontier >= targetTime) return; // caught up: sleep

  // One slice's worth of simulated time is what sizes the step — not the whole backlog,
  // which would ask a single step to swallow everything the recording has fallen behind.
  const simDt = (FRAME_BUDGET_MS / 1000) * speed;
  const { snapshots, stepDt, reached } = recorder.advance(targetTime, simDt);
  if (snapshots.length > 0)
    post({ type: "snapshots", snapshots, stepDt, reached, epoch });

  // Still behind → come back after the message queue has had its turn. Producing nothing
  // while behind means the model is not loaded or the step is degenerate; stopping then
  // avoids a spin.
  if (snapshots.length > 0 && reached < targetTime) schedule();
}

function schedule(): void {
  if (scheduled) return;
  scheduled = true;
  setTimeout(slice, 0);
}

self.onmessage = (event: MessageEvent<ToRecorder>) => {
  const message = event.data;
  switch (message.type) {
    case "load":
      epoch = message.epoch;
      recorder.load(
        deserialize_mechanism(message.mechanism),
        message.resumeFrom ? revive_snapshot(message.resumeFrom) : null,
      );
      // The target comes back to where the recording restarts. Keeping the previous one
      // would send the worker racing to re-record the whole of the last session in one
      // burst — which is exactly what leaving simulation and coming back looked like.
      targetTime = message.resumeFrom?.t ?? 0;
      running = true;
      schedule();
      break;
    case "grab":
      recorder.setGrab(message.grab ? revive_grab(message.grab) : null);
      break;
    case "target":
      targetTime = message.targetTime;
      speed = message.speed;
      // A target is also what resumes after a `stop`: pausing and playing again must not
      // need the model to be reloaded.
      running = true;
      schedule();
      break;
    case "stop":
      running = false;
      break;
  }
};
