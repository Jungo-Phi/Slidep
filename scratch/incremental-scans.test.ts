// Throwaway: the resumed scans must equal the full ones, chunk by chunk and across a truncation.
import { describe, expect, it } from "vitest";
import decon from "../test-mechanisms/Déconnexion courroie.slidep?raw";
import poulie from "../test-mechanisms/Poulie bloqueuse.slidep?raw";
import { Point2 } from "../src/types";
import { DynamicSnapshot, KinematicSnapshot, SimulationSnapshot } from "../src/types/runtime-state";
import { load_mechanism } from "../src/utils/load-mechanism";
import { RECORD_DT, compile_simulation_model, step_dynamic_simulation, step_simulation } from "../src/components/solver/dynamics/simulation-engine";
import { belt_events, extend_belt_events, BeltEventScan } from "../src/components/solver/recording/belt-events";
import { dead_points, extend_dead_points, DeadPointScan } from "../src/components/solver/kinematics/dead-points";
import { compute_energy_balance, extend_energy_balance, EnergyBalanceRun } from "../src/components/solver/analysis/energy-balance";

function kin(json: string, n: number) {
  const model = compile_simulation_model(load_mechanism(JSON.parse(json)).mechanism);
  const out: KinematicSnapshot[] = []; let s: KinematicSnapshot | null = null;
  for (let i = 0; i < n; i++) { s = step_simulation(model, i * RECORD_DT, s); out.push(s); }
  return out;
}
function dyn(json: string, n: number) {
  const model = compile_simulation_model(load_mechanism(JSON.parse(json)).mechanism);
  const out: DynamicSnapshot[] = []; let s: DynamicSnapshot | null = null;
  for (let i = 0; i < n; i++) { s = step_dynamic_simulation(model, i * RECORD_DT, s, RECORD_DT, new Point2(0, -9.81)); out.push(s); }
  return out;
}
/** Grows the recording by uneven chunks, each a fresh array over the same frames, as the clock does. */
function grown<S>(all: S[]): S[][] {
  const steps: S[][] = []; let k = 0, c = 1;
  while (k < all.length) { k = Math.min(all.length, k + c); c = (c % 7) + 1; steps.push(all.slice(0, k)); }
  return steps;
}

describe("resumed scans", () => {
  it("belt events", () => {
    for (const all of [kin(decon, 400) as SimulationSnapshot[], dyn(decon, 150) as SimulationSnapshot[]]) {
      let scan: BeltEventScan | null = null;
      for (const s of grown(all)) { scan = extend_belt_events(s, scan); expect(scan.events).toEqual(belt_events(s)); }
      const cut = all.slice(0, 40);
      expect(extend_belt_events(cut, scan).events).toEqual(belt_events(cut));
      expect(belt_events(all).length).toBeGreaterThan(0);
    }
  }, 120_000);
  it("dead points", () => {
    const all = kin(poulie, 300);
    let scan: DeadPointScan | null = null;
    for (const s of grown(all)) { scan = extend_dead_points(s, scan); expect(scan.points).toEqual(dead_points(s)); }
    expect(dead_points(all).length).toBeGreaterThan(0);
    const cut = all.slice(0, 100);
    expect(extend_dead_points(cut, scan).points).toEqual(dead_points(cut));
  }, 120_000);
  it("energy balance", () => {
    const all = dyn(decon, 150);
    let run: EnergyBalanceRun | null = null;
    for (const s of grown(all)) { run = extend_energy_balance(s, run); expect(run.series).toEqual(compute_energy_balance(s)); }
    const cut = all.slice(0, 60);
    expect(extend_energy_balance(cut, run).series).toEqual(compute_energy_balance(cut));
    expect(compute_energy_balance(all).t.length).toBeGreaterThan(0);
  }, 120_000);
});
