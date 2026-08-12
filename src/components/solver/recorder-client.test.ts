import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import vilbrequin from "../../../test-mechanisms/Vilbrequin.slidep?raw";
import { load_mechanism } from "../../utils/load-mechanism";
import { FromRecorder, ToRecorder, WireSnapshot } from "./recorder-protocol";
import { RecorderClient } from "./recorder-client";
import { MAX_RECORDING_TIME } from "./kinematic-simulation";
import {
  snapshot_belt_arrivals,
  snapshot_belt_detached,
  snapshot_belt_wraps,
} from "./snapshot";

/**
 * The client's half of the worker protocol: the layout crosses once per load and is put
 * back on the snapshots that follow, so a recording's snapshots end up sharing one layout
 * object — the identity everything downstream compares by.
 */

class FakeWorker {
  static last: FakeWorker | null = null;
  onmessage: ((event: { data: FromRecorder }) => void) | null = null;
  onerror: unknown = null;
  onmessageerror: unknown = null;
  posted: ToRecorder[] = [];

  constructor() {
    FakeWorker.last = this;
  }
  postMessage(message: ToRecorder) {
    this.posted.push(message);
  }
  terminate() {}
  /** Play a message back to the client, as the real worker would. */
  deliver(data: FromRecorder) {
    this.onmessage?.({ data });
  }
}

const BELT = "00000000-0000-0000-0000-00000000beef" as const;

const wire = (t: number): WireSnapshot => ({
  t,
  positions: Float64Array.of(t, 0),
  angles: Float64Array.of(t),
});

const layoutMessage = (
  epoch: number,
  keys: string[] = ["n"],
): FromRecorder => ({
  type: "layout",
  keys,
  angleKeys: ["g"],
  belts: [],
  epoch,
});

describe("protocole du client d'enregistrement", () => {
  let client: RecorderClient;
  let worker: FakeWorker;

  beforeEach(() => {
    vi.stubGlobal("Worker", FakeWorker);
    client = new RecorderClient();
    worker = FakeWorker.last!;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("rend à tous les snapshots d'une époque la même disposition", () => {
    worker.deliver(layoutMessage(0));
    worker.deliver({ type: "snapshots", snapshots: [wire(0), wire(1)], reached: 1, epoch: 0 });
    worker.deliver({ type: "snapshots", snapshots: [wire(2)], reached: 2, epoch: 0 });

    const { snapshots, reached } = client.drain();
    expect(snapshots).toHaveLength(3);
    expect(reached).toBe(2);
    // One object, across batches: that is what lets `snapshot_at` interpolate.
    for (const s of snapshots) expect(s.layout).toBe(snapshots[0].layout);
    expect(snapshots[0].layout.index.get("n")).toBe(0);
    expect(snapshots[0].layout.angleIndex.get("g")).toBe(0);
  });

  it("mesure la durée d'enregistrement sur la disposition reçue", () => {
    // Before a load, the ceiling: nothing is recorded yet, so nothing can be cut short.
    expect(client.maxTime()).toBe(MAX_RECORDING_TIME);
    worker.deliver(layoutMessage(0));
    const light = client.maxTime();
    expect(light).toBeLessThanOrEqual(MAX_RECORDING_TIME);
    // A mechanism whose instants cost more records for less long.
    worker.deliver(
      layoutMessage(
        0,
        Array.from({ length: 20000 }, (_, i) => `n${i}`),
      ),
    );
    expect(client.maxTime()).toBeLessThan(light);
  });

  it("replace les poulies d'une courroie dans la disposition", () => {
    // Without the belt section, every belt slot loses its owner on this side: the contact
    // flags read back as "nothing detached" and the belt is drawn wrapped around a pulley
    // it left. One gear angle, then three wraps, three flags, three arrival angles.
    worker.deliver({
      type: "layout",
      keys: ["n"],
      angleKeys: ["g"],
      belts: [{ id: BELT, pulleys: 3 }],
      epoch: 0,
    });
    worker.deliver({
      type: "snapshots",
      snapshots: [
        {
          t: 0,
          positions: Float64Array.of(0, 0),
          angles: Float64Array.of(0.5, 1, 2, 3, 0, 1, 0, 4, 5, 6),
        },
      ],
      reached: 0,
      epoch: 0,
    });

    const snapshot = client.drain().snapshots[0];
    expect(snapshot_belt_detached(snapshot, BELT)).toEqual([1]);
    expect(snapshot_belt_wraps(snapshot, BELT)).toEqual([1, 2, 3]);
    expect(snapshot_belt_arrivals(snapshot, BELT)).toEqual([4, 5, 6]);
  });

  it("écarte ce qui vient d'une époque révolue", () => {
    worker.deliver(layoutMessage(0));
    worker.deliver({ type: "snapshots", snapshots: [wire(9)], reached: 9, epoch: 7 });
    expect(client.drain().snapshots).toHaveLength(0);
  });

  it("refuse des snapshots dont la disposition n'est pas arrivée", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    worker.deliver({ type: "snapshots", snapshots: [wire(0)], reached: 0, epoch: 0 });
    expect(client.drain().snapshots).toHaveLength(0);
    expect(logged).toHaveBeenCalled();
  });

  it("oublie la disposition de l'époque précédente au chargement suivant", () => {
    worker.deliver(layoutMessage(0));
    worker.deliver({ type: "snapshots", snapshots: [wire(0)], reached: 0, epoch: 0 });
    const before = client.drain().snapshots[0].layout;

    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    client.load(load_mechanism(JSON.parse(vilbrequin)).mechanism, null);
    const loaded = worker.posted[worker.posted.length - 1] as Extract<
      ToRecorder,
      { type: "load" }
    >;
    expect(loaded.type).toBe("load");

    // The new epoch's snapshots wait for their own layout rather than inherit the old one.
    worker.deliver({
      type: "snapshots",
      snapshots: [wire(0)],
      reached: 0,
      epoch: loaded.epoch,
    });
    expect(client.drain().snapshots).toHaveLength(0);
    expect(logged).toHaveBeenCalled();

    worker.deliver(layoutMessage(loaded.epoch));
    worker.deliver({
      type: "snapshots",
      snapshots: [wire(1)],
      reached: 1,
      epoch: loaded.epoch,
    });
    expect(client.drain().snapshots[0].layout).not.toBe(before);
  });
});
