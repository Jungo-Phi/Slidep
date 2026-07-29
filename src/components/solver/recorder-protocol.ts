import { Point2 } from "../../types/point2";
import { KinematicSnapshot } from "../../types/runtime-state";
import { SerializedMechanism } from "../../types";
import { SimGrab } from "./kinematic-simulation";

/**
 * What crosses the worker boundary, and how it survives the crossing.
 *
 * `structuredClone` keeps `Map`s and plain objects but strips prototypes, so a `Point2`
 * arrives as a bare `{x, y}`. Rather than change the snapshot format — measured at 480
 * bytes at worst, 57 kB/s at 120 Hz, nowhere near a bottleneck — the few class instances
 * are rebuilt on arrival, in this one place.
 */

/** A snapshot as it arrives: same shape, `Point2` reduced to its fields. */
type WireSnapshot = Omit<KinematicSnapshot, "positions"> & {
  positions: Map<string, { x: number; y: number }>;
};

export function revive_snapshot(wire: WireSnapshot): KinematicSnapshot {
  const positions = new Map<string, Point2>();
  wire.positions.forEach((p, key) => positions.set(key, new Point2(p.x, p.y)));
  return { ...wire, positions };
}

/** The grab target is the only `Point2` going the other way. */
type WireGrab = Omit<SimGrab, "target"> & { target: { x: number; y: number } };

export function revive_grab(wire: WireGrab): SimGrab {
  return { ...wire, target: new Point2(wire.target.x, wire.target.y) } as SimGrab;
}

export type ToRecorder =
  | {
      type: "load";
      /** Serialised so the worker rebuilds real `Point2`s, via the save format. */
      mechanism: SerializedMechanism;
      resumeFrom: KinematicSnapshot | null;
      /**
       * Bumped on every load. Snapshots still in flight from the previous mechanism are
       * dropped on arrival — without it, an edit would append frames of the old model
       * after the truncation that was supposed to remove them.
       */
      epoch: number;
    }
  | { type: "grab"; grab: SimGrab | null }
  /**
   * Where the simulated clock should get to, and how fast it is being asked to move.
   * Sent every displayed frame and never awaited: the worker runs towards the target on
   * its own, so it is never idle waiting to be asked.
   */
  | { type: "target"; targetTime: number; speed: number }
  | { type: "stop" };

export type FromRecorder = {
  type: "snapshots";
  snapshots: KinematicSnapshot[];
  /** The step these were recorded at, for the fidelity readout. */
  stepDt: number;
  /** Where the recording now ends. */
  reached: number;
  /** The `load` these belong to; anything older is stale and dropped. */
  epoch: number;
};
