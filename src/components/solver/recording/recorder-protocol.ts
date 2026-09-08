import { Point2 } from "../../../types/point2";
import {
  DynamicSnapshot,
  KinematicSnapshot,
  SimulationSnapshot,
} from "../../../types/runtime-state";
import { SerializedLoadElement, SerializedMechanism } from "../../../types";
import { SimGrab } from "../dynamics/simulation-engine";
import { BeltShape } from "../snapshot";

/**
 * What crosses the worker boundary, and how it survives the crossing.
 *
 * `structuredClone` keeps `Map`s, typed arrays and plain objects but strips prototypes, so a `Point2` arrives as a bare `{x, y}`.
 * Snapshots hold none — only numbers — so they cross as they are; the few class instances left are rebuilt on arrival, in this one place.
 *
 * The slot layout crosses once per `load`, in its own message, and the client puts it back on the snapshots that follow.
 * Sending it with each of them would clone it once per batch — identity is preserved WITHIN a message, not between two — for keys that cannot change until the next `load`.
 */

/**
 * Which pipeline a `load` runs: rigid-motion PBD, or XPBD with mass and gravity.
 * Fixed for the whole load — a recording is never a mix of the two.
 *
 * Deliberately its own type rather than `types/app-mode.ts`'s `SimulationMode` — that one also carries `"static"`, which has no recorder pipeline at all (its `ToggleButton` stays `disabled`), so a `RecorderMode` is never asked to mean something it cannot run.
 */
export type RecorderMode = "kinematic" | "dynamic";

/** A snapshot as it crosses: the layout it belongs to is named by the epoch, not carried.
 * Which of the two shapes it is follows from the load's `mode`. */
export type WireSnapshot =
  | Omit<KinematicSnapshot, "layout">
  | Omit<DynamicSnapshot, "layout">;

/** The grab target is the only `Point2` going the other way. */
type WireGrab = Omit<SimGrab, "target"> & { target: { x: number; y: number } };

export function revive_grab(wire: WireGrab): SimGrab {
  return { ...wire, target: new Point2(wire.target.x, wire.target.y) } as SimGrab;
}

export type ToRecorder =
  | {
      type: "load";
      mode: RecorderMode;
      /** Serialised so the worker rebuilds real `Point2`s, via the save format. */
      mechanism: SerializedMechanism;
      resumeFrom: SimulationSnapshot | null;
      /**
       * Bumped on every load.
       * Snapshots still in flight from the previous mechanism are dropped on arrival — without it, an edit would append frames of the old model after the truncation that was supposed to remove them.
       */
      epoch: number;
    }
  /**
   * Put the recording back on an instant it already produced, keeping the compiled model.
   *
   * What a pause needs: the worker deliberately records past the cursor, and those instants are dropped rather than shown.
   * Reloading to rewind would recompile a mechanism that has not changed, and lose everything the run had accumulated on it.
   */
  | { type: "rewind"; resumeFrom: SimulationSnapshot; epoch: number }
  | { type: "grab"; grab: SimGrab | null }
  /** A load's value(s) changed (magnitude, direction…) without touching topology: swaps the
   * compiled loads in place instead of the full `load` recompile — see `Recorder.setLoads`. */
  | { type: "loads"; loads: SerializedLoadElement[] }
  /**
   * Where the simulated clock should get to.
   * Sent every displayed frame and never awaited: the worker runs towards the target on its own, so it is never idle waiting to be asked.
   */
  | { type: "target"; targetTime: number }
  /** Dynamic mode only: whether the predict step integrates gravity. Rare — a Chip click,
   * not a per-frame value — so it is its own message rather than riding along `target`. */
  | { type: "gravity"; on: boolean }
  /** Both modes: whether the next steps detect and resist collisions. Same reasoning as
   * `gravity` — a toggle click, not a per-frame value, and no recompile needed either. */
  | { type: "collisions"; on: boolean }
  /** Both modes: whether the next steps detect and resist the floor. Gated independently
   * from `collisions` — same reasoning otherwise, no recompile needed either. */
  | { type: "floor"; on: boolean }
  | { type: "stop" };

export type FromRecorder =
  /**
   * The slots the epoch's snapshots are written in, posted as soon as the model is compiled — so before any of them.
   * It follows the same epoch rule as the snapshots themselves: read with the layout of another model, a snapshot is a different mechanism.
   */
  | {
      type: "layout";
      keys: string[];
      angleKeys: string[];
      /** Belts and their pulley counts: without them the belt slots have no owner on the
       * other side, and the contact flags cannot be read back at all. */
      belts: BeltShape[];
      epoch: number;
    }
  | {
      type: "snapshots";
      snapshots: WireSnapshot[];
      /** Where the recording now ends. */
      reached: number;
      /** The `load` these belong to; anything older is stale and dropped. */
      epoch: number;
    };
