import { Mechanism } from "../../types";
import { KinematicSnapshot } from "../../types/runtime-state";
import { serialize_mechanism } from "../../utils/serialization";
import { RECORD_DT, SimGrab } from "./kinematic-simulation";
import { FromRecorder, ToRecorder, revive_snapshot } from "./recorder-protocol";

/**
 * The main thread's handle on the recording worker.
 *
 * Nothing here waits: `target` is fire-and-forget, and `drain` hands over whatever has
 * arrived since the last call. The display therefore never blocks on the solver — which is
 * the whole point of the chantier — at the price of the cursor trailing the worker by up to
 * a message, which is a fraction of a frame.
 */
export class RecorderClient {
  private worker: Worker;
  private epoch = 0;
  private queued: KinematicSnapshot[] = [];
  private stepDt = RECORD_DT;
  /** Where the recording ends, or `null` while nothing has come back yet. */
  private reached: number | null = null;

  constructor() {
    this.worker = new Worker(
      new URL("./recorder.worker.ts", import.meta.url),
      { type: "module" },
    );
    this.worker.onmessage = (event: MessageEvent<FromRecorder>) => {
      const message = event.data;
      // Anything from before the last `load` describes a mechanism that no longer exists.
      if (message.epoch !== this.epoch) return;
      for (const snapshot of message.snapshots)
        this.queued.push(revive_snapshot(snapshot));
      this.stepDt = message.stepDt;
      this.reached = message.reached;
    };
    // Without these a worker that throws — or a message that fails to clone — simply goes
    // quiet, and the only symptom is a simulated clock that never advances.
    this.worker.onerror = (event) =>
      console.error("[recorder worker]", event.message, event);
    this.worker.onmessageerror = (event) =>
      console.error("[recorder worker] message non clonable", event);
  }

  private post(message: ToRecorder): void {
    this.worker.postMessage(message);
  }

  /**
   * Adopt a mechanism, dropping everything the previous one still had in flight.
   * `resumeFrom` carries the simulated state, so an edit does not reset motor angles.
   */
  load(mechanism: Mechanism, resumeFrom: KinematicSnapshot | null): void {
    this.epoch++;
    this.queued = [];
    this.reached = resumeFrom?.t ?? null;
    this.stepDt = RECORD_DT;
    // Without its undo history: the worker only ever simulates, and that array is the
    // bulk of a long editing session — re-serialised on every edit made while running.
    this.post({
      type: "load",
      mechanism: { ...serialize_mechanism(mechanism), history: [] },
      resumeFrom,
      epoch: this.epoch,
    });
  }

  setGrab(grab: SimGrab | null): void {
    this.post({ type: "grab", grab });
  }

  /** Where the simulated clock is being asked to get to, and how fast. */
  target(targetTime: number, speed: number): void {
    this.post({ type: "target", targetTime, speed });
  }

  stop(): void {
    this.post({ type: "stop" });
  }

  /** Snapshots recorded since the last call, and where the recording now ends. */
  drain(): {
    snapshots: KinematicSnapshot[];
    stepDt: number;
    reached: number | null;
  } {
    const snapshots = this.queued;
    this.queued = [];
    return { snapshots, stepDt: this.stepDt, reached: this.reached };
  }

  dispose(): void {
    this.worker.terminate();
  }
}
