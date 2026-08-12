import { Mechanism } from "../../types";
import { KinematicSnapshot, SnapshotLayout } from "../../types/runtime-state";
import { serialize_mechanism } from "../../utils/serialization";
import {
  MAX_RECORDING_TIME,
  SimGrab,
  max_recording_time,
} from "./kinematic-simulation";
import { FromRecorder, ToRecorder } from "./recorder-protocol";
import { snapshot_layout } from "./snapshot";

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
  /** Where the recording ends, or `null` while nothing has come back yet. */
  private reached: number | null = null;
  /**
   * The slots the epoch's snapshots are written in, from the `layout` message the worker
   * posts on every load. Put back on each arriving snapshot, which is what gives all the
   * snapshots of one recording the single shared layout `snapshot_at` compares by identity.
   */
  private layout: SnapshotLayout | null = null;
  /** How long the loaded mechanism records, from the worker that sized it. */
  private limit = MAX_RECORDING_TIME;

  constructor() {
    this.worker = new Worker(
      new URL("./recorder.worker.ts", import.meta.url),
      { type: "module" },
    );
    this.worker.onmessage = (event: MessageEvent<FromRecorder>) => {
      const message = event.data;
      // Anything from before the last `load` describes a mechanism that no longer exists.
      if (message.epoch !== this.epoch) return;
      if (message.type === "layout") {
        this.layout = snapshot_layout(
          message.keys,
          message.angleKeys,
          message.belts,
        );
        this.limit = max_recording_time(this.layout);
        return;
      }
      // Messages are delivered in order and the layout is posted on load, so it is here
      // before any snapshot of its epoch. Reading them without it would silently place
      // every key at the wrong slot, so they are dropped rather than guessed at.
      if (!this.layout) {
        console.error("[recorder worker] snapshots avant leur disposition");
        return;
      }
      for (const wire of message.snapshots)
        this.queued.push({ ...wire, layout: this.layout });
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
    this.layout = null;
    this.reached = resumeFrom?.t ?? null;
    // Without its undo history: the worker only ever simulates, and that array is the
    // bulk of a long editing session — re-serialised on every edit made while running.
    this.post({
      type: "load",
      mechanism: { ...serialize_mechanism(mechanism), history: [] },
      resumeFrom,
      epoch: this.epoch,
    });
  }

  /**
   * Go back to an instant already recorded, keeping the loaded mechanism.
   *
   * Same epoch bump as a `load` — the instants past the target are still in flight and must
   * not be appended after it — but the layout is kept: the model has not changed, so the
   * snapshots that follow are written in the same slots.
   */
  rewind(resumeFrom: KinematicSnapshot): void {
    this.epoch++;
    this.queued = [];
    this.reached = resumeFrom.t;
    this.post({ type: "rewind", resumeFrom, epoch: this.epoch });
  }

  /** The longest the loaded mechanism records, in simulated seconds. */
  maxTime(): number {
    return this.limit;
  }

  setGrab(grab: SimGrab | null): void {
    this.post({ type: "grab", grab });
  }

  /** Where the simulated clock is being asked to get to. */
  target(targetTime: number): void {
    this.post({ type: "target", targetTime });
  }

  stop(): void {
    this.post({ type: "stop" });
  }

  /** Snapshots recorded since the last call, and where the recording now ends. */
  drain(): { snapshots: KinematicSnapshot[]; reached: number | null } {
    const snapshots = this.queued;
    this.queued = [];
    return { snapshots, reached: this.reached };
  }

  dispose(): void {
    this.worker.terminate();
  }
}
