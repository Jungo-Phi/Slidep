import { deserialize_mechanism } from "../../utils/serialization";
import { Recorder } from "./recorder";
import { FromRecorder, ToRecorder, revive_grab } from "./recorder-protocol";

/**
 * The recording loop, off the UI thread.
 *
 * It does **not** answer one request per displayed frame: that would leave it idle between
 * frames and buy no throughput at all. It runs towards a target the main thread keeps
 * moving, in slices, and posts what it produced as it goes.
 *
 * A slice is bounded by the same budget the synchronous loop used — not to protect a
 * display it no longer blocks, but so that pending messages (a new target, a grab, an edit)
 * get a turn between two slices. Yielding through a `MessageChannel` is what lets them
 * through: the message queue is only served between macrotasks, and unlike `setTimeout` a
 * port round-trip carries no minimum delay.
 */

const recorder = new Recorder();
let targetTime = 0;
let running = false;
let scheduled = false;
let epoch = 0;

const post = (message: FromRecorder) => self.postMessage(message);

const yielder = new MessageChannel();
// Setting `onmessage` implicitly starts the port; no `start()` needed.
yielder.port1.onmessage = () => slice();

function slice(): void {
  scheduled = false;
  if (!running || !recorder.ready()) return;

  const frontier = recorder.frontier();
  if (frontier !== null && frontier >= targetTime) return; // caught up: sleep
  if (recorder.full()) return; // recorded its full length: nothing more will come

  const { snapshots, reached, solved } = recorder.advance(targetTime);
  if (snapshots.length > 0)
    post({
      type: "snapshots",
      // Stripped of the layout the client already holds for this epoch.
      snapshots: snapshots.map(({ layout: _layout, ...wire }) => wire),
      reached,
      epoch,
    });

  // Still behind → come back after the message queue has had its turn. Solving nothing while
  // behind means the model is not loaded; stopping then avoids a spin. It is `solved` and
  // not the batch that says so: a slice can end on an instant that is not kept.
  if (solved > 0 && reached < targetTime) schedule();
}

function schedule(): void {
  if (scheduled) return;
  scheduled = true;
  yielder.port2.postMessage(null);
}

self.onmessage = (event: MessageEvent<ToRecorder>) => {
  const message = event.data;
  switch (message.type) {
    case "load":
      epoch = message.epoch;
      recorder.load(
        deserialize_mechanism(message.mechanism),
        message.resumeFrom,
      );
      {
        // Before any snapshot of this epoch, so the client can always place the slots.
        const layout = recorder.layout();
        if (layout)
          post({
            type: "layout",
            keys: layout.keys,
            angleKeys: layout.angleKeys,
            maxTime: recorder.maxTime(),
            epoch,
          });
      }
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
