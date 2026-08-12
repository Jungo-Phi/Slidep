import { describe, expect, it } from "vitest";
import decon from "../../../test-mechanisms/Déconnexion courroie.slidep?raw";
import { KinematicSnapshot } from "../../types/runtime-state";
import { load_mechanism } from "../../utils/load-mechanism";
import {
  RECORD_DT,
  compile_simulation_model,
  step_simulation,
} from "./kinematic-simulation";
import { belt_events } from "./belt-events";
import { snapshot_belt_detached } from "./snapshot";

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

describe("belt_events", () => {
  it("un enregistrement sans changement de contact ne dit rien", () => {
    expect(belt_events(record(40))).toEqual([]);
  }, 30_000);

  it("nomme la poulie quittée et l'instant exact", () => {
    const snapshots = record(400);
    const events = belt_events(snapshots);
    expect(events.length).toBeGreaterThan(0);

    // Chaque événement tombe sur la première frame qui porte le changement, et pas
    // une frame plus tard : c'est ce qui autorise à poser une marque à cet instant.
    for (const event of events) {
      const at = snapshots.findIndex((s) => s.t === event.t);
      expect(at).toBeGreaterThan(0);
      const now = new Set(snapshot_belt_detached(snapshots[at], event.belt) ?? []);
      const before = new Set(
        snapshot_belt_detached(snapshots[at - 1], event.belt) ?? [],
      );
      expect(now.has(event.gearIndex)).toBe(event.kind === "detach");
      expect(before.has(event.gearIndex)).toBe(event.kind === "reattach");
    }
  }, 30_000);

  it("les instants sont croissants", () => {
    const times = belt_events(record(400)).map((e) => e.t);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  }, 30_000);

  it("allonger l'enregistrement n'efface ni ne déplace ce qui précède", () => {
    // La timeline pose ses marques au fil de l'enregistrement : une marque qui
    // sauterait ou disparaîtrait à la frame suivante se lirait comme un défaut.
    const snapshots = record(400);
    const early = belt_events(snapshots.slice(0, 200));
    expect(belt_events(snapshots).slice(0, early.length)).toEqual(early);
  }, 30_000);

  it("l'état de départ n'est pas un événement", () => {
    // Un enregistrement repris sur une pose où la courroie a déjà lâché commence
    // avec des poulies détachées, sans que rien ne vienne de se produire.
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
