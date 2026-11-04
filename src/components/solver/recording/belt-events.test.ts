import { describe, expect, it } from "vitest";
import decon from "../../../../test-mechanisms/Déconnexion courroie.slidep?raw";
import { Point2 } from "../../../types";
import { DynamicSnapshot, KinematicSnapshot, SimulationSnapshot } from "../../../types/runtime-state";
import { load_mechanism } from "../../../utils/load-mechanism";
import {
  RECORD_DT,
  compile_simulation_model,
  step_dynamic_simulation,
  step_simulation,
} from "../dynamics/simulation-engine";
import { BeltEvent, belt_events } from "./belt-events";
import { snapshot_belt_detached } from "../snapshot";

/** `n` recorded frames of the belt-disconnection mechanism. */
function record(n: number): KinematicSnapshot[] {
  const { mechanism } = load_mechanism(JSON.parse(decon));
  const model = compile_simulation_model(mechanism);
  const snapshots: KinematicSnapshot[] = [];
  let snapshot: KinematicSnapshot | null = null;
  for (let i = 0; i < n; i++) {
    snapshot = step_simulation(model, i * RECORD_DT, snapshot);
    snapshots.push(snapshot);
  }
  return snapshots;
}

/**
 * `n` recorded DYNAMIC frames of the same mechanism, falling under gravity: its own weight is what pulls the middle pulley off the belt (measured: disconnects at frame 18, stays off), where the kinematic engine above is driven by its motor instead.
 * There is no dynamic-mode motor to spin it with here — a torque, unlike the kinematic position link, pins nothing, so gravity alone is both simpler and enough to exercise a real detach.
 */
const GRAVITY = new Point2(0, -9.81);
function recordDynamic(n: number): DynamicSnapshot[] {
  const { mechanism } = load_mechanism(JSON.parse(decon));
  const model = compile_simulation_model(mechanism);
  const snapshots: DynamicSnapshot[] = [];
  let snapshot: DynamicSnapshot | null = null;
  for (let i = 0; i < n; i++) {
    snapshot = step_dynamic_simulation(model, i * RECORD_DT, snapshot, RECORD_DT, GRAVITY);
    snapshots.push(snapshot);
  }
  return snapshots;
}

/** Each event sits within the interval the change happened in, ends included: between the last frame without it and the first frame carrying it. */
function expect_within_change(snapshots: SimulationSnapshot[], events: BeltEvent[]) {
  const off = (s: SimulationSnapshot, event: BeltEvent) =>
    (snapshot_belt_detached(s, event.belt) ?? []).includes(event.gearIndex);
  for (const event of events) {
    const at = snapshots.findIndex(
      (s, i) =>
        i > 0 &&
        off(s, event) === (event.kind === "detach") &&
        off(snapshots[i - 1], event) === (event.kind === "reattach") &&
        snapshots[i - 1].t <= event.t &&
        event.t <= s.t,
    );
    expect(at).toBeGreaterThan(0);
  }
}

describe("belt_events", () => {
  it("un enregistrement sans changement de contact ne dit rien", () => {
    expect(belt_events(record(40))).toEqual([]);
  }, 30_000);

  it("nomme la poulie quittée et l'instant exact", () => {
    const snapshots = record(400);
    const events = belt_events(snapshots);
    expect(events.length).toBeGreaterThan(0);

    expect_within_change(snapshots, events);
  }, 30_000);

  it("les instants sont croissants", () => {
    const times = belt_events(record(400)).map((e) => e.t);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  }, 30_000);

  it("allonger l'enregistrement n'efface ni ne déplace ce qui précède", () => {
    // The timeline places its marks as the recording goes: a mark that jumped or vanished on the next frame would read as a defect.
    const snapshots = record(400);
    const early = belt_events(snapshots.slice(0, 200));
    expect(belt_events(snapshots).slice(0, early.length)).toEqual(early);
  }, 30_000);

  it("l'état de départ n'est pas un événement", () => {
    // A recording resumed on a pose where the belt has already let go starts with detached pulleys, without anything having just happened.
    const snapshots = record(400);
    const detachedAt = snapshots.findIndex((s) =>
      s.layout.belts.some(
        (b) => (snapshot_belt_detached(s, b) ?? []).length > 0,
      ),
    );
    expect(detachedAt).toBeGreaterThan(0);
    expect(belt_events(snapshots.slice(detachedAt, detachedAt + 20))).toEqual(
      [],
    );
  }, 30_000);
});

/**
 * The same contract, of a DYNAMIC recording: `belt_events` reads `snapshot_belt_detached` off whatever layout it is handed, and a dynamic snapshot carries the same detach block as a kinematic one (see `SnapshotLayout`).
 */
describe("belt_events, en dynamique", () => {
  it("un enregistrement sans changement de contact ne dit rien", () => {
    // Well before the measured frame-18 disconnect.
    expect(belt_events(recordDynamic(12))).toEqual([]);
  }, 30_000);

  it("nomme la poulie quittée et l'instant exact", () => {
    const snapshots = recordDynamic(150);
    const events = belt_events(snapshots);
    expect(events.length).toBeGreaterThan(0);
    expect_within_change(snapshots, events);
  }, 30_000);

  it("les instants sont croissants", () => {
    const times = belt_events(recordDynamic(150)).map((e) => e.t);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  }, 30_000);

  it("allonger l'enregistrement n'efface ni ne déplace ce qui précède", () => {
    const snapshots = recordDynamic(150);
    const early = belt_events(snapshots.slice(0, 100));
    expect(belt_events(snapshots).slice(0, early.length)).toEqual(early);
  }, 30_000);

  it("l'état de départ n'est pas un événement", () => {
    const snapshots = recordDynamic(150);
    const detachedAt = snapshots.findIndex((s) =>
      s.layout.belts.some(
        (b) => (snapshot_belt_detached(s, b) ?? []).length > 0,
      ),
    );
    expect(detachedAt).toBeGreaterThan(0);
    expect(belt_events(snapshots.slice(detachedAt, detachedAt + 20))).toEqual(
      [],
    );
  }, 30_000);
});
