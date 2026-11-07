import { describe, expect, it } from "vitest";
import { Point2 } from "../../../types";
import type { DynamicSnapshot } from "../../../types/runtime-state";
import { load_mechanism } from "../../../utils/load-mechanism";
import { RECORD_DT, compile_simulation_model, step_dynamic_simulation } from "../dynamics/simulation-engine";
import { Recorder } from "../recording/recorder";
import { compute_energy_balance } from "../analysis/energy-balance";

/**
 * A motor mounted on a frame that is itself free only ever turns the mechanism's parts against one another: with nothing grounded, no gravity and no floor, the mechanism's angular momentum stays where it started.
 *
 * `Walking jansen` is the case: its frame is a T welded at its middle, the motor's anchor arm the T's short leg, 7.8 cm long and ending on a node of about a gram, and its 10 N·m motor saturates as it starts the legs from rest.
 * Its impulse, applied alone, would throw that light tip off the frame, and pulling it back would spin the whole walker up by the motor's own torque.
 */
const files = import.meta.glob("../../../../test-mechanisms/Walking jansen.slidep", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;
const json = Object.values(files)[0];

describe("moteur sur un bâti libre", () => {
  it("ne fait pas tourner le mécanisme d'un bloc quand il sature", () => {
    const raw = JSON.parse(json);
    raw.simulation.floor.enabled = false;
    const { mechanism } = load_mechanism(raw);
    const model = compile_simulation_model(mechanism, true, true);

    const invMass = new Map<string, number>(model.dynamicMasses.posMasses);
    model.fill.keys.forEach((key, i) => invMass.set(model.fill.firstParts[i], model.dynamicMasses.posMasses.get(key)!));
    /** About the origin, kg·m²/s, over every mass the solve moves. */
    const momentum = (s: DynamicSnapshot) => {
      let L = 0;
      s.layout.keys.forEach((key, k) => {
        const w = invMass.get(key);
        if (!w || !Number.isFinite(w)) return;
        L += (s.positions[2 * k] * s.velocities[2 * k + 1] - s.positions[2 * k + 1] * s.velocities[2 * k]) / w;
      });
      s.layout.angleKeys.forEach((key, j) => {
        const w = model.dynamicMasses.angleMasses.get(key);
        if (w && Number.isFinite(w)) L += s.angleVelocities[j] / w;
      });
      return L;
    };

    let snapshot: DynamicSnapshot | null = null;
    let largest = 0;
    for (let i = 0; i < 60; i++) {
      snapshot = step_dynamic_simulation(model, i * RECORD_DT, snapshot, RECORD_DT, new Point2(0, 0), undefined, undefined, true, false, false);
      largest = Math.max(largest, Math.abs(momentum(snapshot)));
    }
    // A leak shows as the motor's torque turning the whole walker, some 10 kg·m²/s every second; a solve that keeps the momentum stays within a few thousandths.
    expect(largest).toBeLessThan(0.02);
    // Its commanded speed, clockwise on screen.
    expect(snapshot!.motor![0].speed).toBeCloseTo(-2.618, 2);
  });
});

/**
 * The same walker on a frictional floor never gains more mechanical energy than its motor gives it.
 * Two runs, each nudged onto a step that is hard on the solve: the motor saturating while a foot slides and lets go, and a foot striking the floor while the motor runs below its limit.
 * The walk is chaotic: a change anywhere in the solver moves these steps elsewhere, and a run that misses its step has to be nudged again, as `restitution` and the motor's speed are here.
 */
describe("marcheur sur un sol frottant", () => {
  const run = (nudge: number, seconds: number) => {
    const { mechanism } = load_mechanism(JSON.parse(json));
    mechanism.simulation = { ...mechanism.simulation, restitution: 0.8 + nudge * 1e-3, contactFriction: { static: 0.9, dynamic: 0.8 }, floor: { ...mechanism.simulation.floor, enabled: true } };
    for (const e of mechanism.mechanicalElements) if (e.type === "pivot" && e.motor) e.motor = { ...e.motor, torque: 10, speed: 2.617993877991494 * (1 + nudge * 1e-4) };
    // Through the recorder, as the app runs it: it carries the contacts of the instants it drops into the next warm start.
    const recorder = new Recorder();
    recorder.load("dynamic", mechanism, null);
    recorder.setGravity(9.81);
    recorder.setFloor(true);
    const snapshots: DynamicSnapshot[] = [];
    for (let reached = -1; reached < seconds - 1e-9; ) {
      const step = recorder.advance(seconds, Infinity);
      snapshots.push(...(step.snapshots as DynamicSnapshot[]));
      reached = step.reached;
    }
    const balance = compute_energy_balance(snapshots);
    let worstGain = 0;
    balance.t.forEach((_, i) => {
      worstGain = Math.max(worstGain, balance.mechanical[i] - balance.motorWork[i]);
    });
    return worstGain;
  };

  // A leak shows as tens of joules within a tenth of a second; what the solve's own drift leaves stays within a few hundredths.
  it("quand le moteur sature pendant qu'un pied glisse", () => {
    expect(run(38, 1.6)).toBeLessThan(1);
  }, 30000);

  it("quand un pied frappe le sol, le moteur sous sa limite", () => {
    expect(run(130, 4.45)).toBeLessThan(1);
  }, 30000);
});
