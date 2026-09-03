/**
 * The dynamic engine now tracks belt contact the same way the kinematic one does (see
 * `docs/courroie-dynamique.md`), but the DRAWING path lagged behind it:
 * `apply_dynamic_snapshot_to_mechanism` had no belt branch at all, so a disconnected pulley
 * kept drawing as if the belt still ran onto it. This is the mirror of what
 * `analysis-isolation.test.ts` checks for `apply_snapshot_to_mechanism` — here the question is
 * simply whether the belt fields make it onto the drawn mechanism at all.
 */

import { describe, expect, it } from "vitest";
import decon from "../../../../test-mechanisms/Déconnexion courroie.slidep?raw";
import { Point2 } from "../../../types";
import { DynamicSnapshot } from "../../../types/runtime-state";
import { load_mechanism } from "../../../utils/load-mechanism";
import {
  RECORD_DT,
  apply_dynamic_snapshot_to_mechanism,
  compile_simulation_model,
  step_dynamic_simulation,
} from "../dynamics/simulation-engine";
import { snapshot_belt_detached, snapshot_belt_wraps } from "../snapshot";

const GRAVITY = new Point2(0, -9.81);

function record(n: number): DynamicSnapshot {
  const { mechanism } = load_mechanism(JSON.parse(decon));
  const model = compile_simulation_model(mechanism);
  let snapshot: DynamicSnapshot | null = null;
  for (let i = 0; i < n; i++)
    snapshot = step_dynamic_simulation(model, i * RECORD_DT, snapshot, RECORD_DT, GRAVITY);
  return snapshot!;
}

describe("le dessin dynamique reflète le décrochage de courroie", () => {
  it("avant tout décrochage, la courroie se dessine pleinement engagée", () => {
    const { mechanism } = load_mechanism(JSON.parse(decon));
    const snapshot = record(10); // well before the measured frame-81 disconnect
    const shown = apply_dynamic_snapshot_to_mechanism(mechanism, snapshot);
    const belt = shown.mechanicalElements.find((e) => e.type === "belt");
    if (!belt || belt.type !== "belt") throw new Error("courroie introuvable");
    expect(belt.disconnectedGearIndices).toEqual([]);
    expect(belt.gearWraps).toHaveLength(belt.attachedGearsIDs.length);
  }, 30_000);

  it("une fois décrochée, la copie dessinée porte le même état que le snapshot", () => {
    const { mechanism } = load_mechanism(JSON.parse(decon));
    const snapshot = record(120); // past the measured frame-81 disconnect
    const shown = apply_dynamic_snapshot_to_mechanism(mechanism, snapshot);
    const belt = shown.mechanicalElements.find((e) => e.type === "belt");
    if (!belt || belt.type !== "belt") throw new Error("courroie introuvable");

    // Not a hardcoded pulley index (that would test a geometry accident, not the wiring):
    // whatever the snapshot itself says detached is what the drawn mechanism must carry.
    expect(belt.disconnectedGearIndices).toEqual(
      snapshot_belt_detached(snapshot, belt.id),
    );
    expect(belt.gearWraps).toEqual(snapshot_belt_wraps(snapshot, belt.id));
    expect(belt.disconnectedGearIndices!.length).toBeGreaterThan(0);
  }, 30_000);
});
