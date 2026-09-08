import { describe, it, expect } from "vitest";
import poulieJson from "../../../../test-mechanisms/Poulie bloqueuse.slidep?raw";
import huygensJson from "../../../../test-mechanisms/Huygen's chain drive.slidep?raw";
import { Mechanism, Point2 } from "../../../types";
import { DynamicSnapshot, KinematicSnapshot } from "../../../types/runtime-state";
import { load_mechanism } from "../../../utils/load-mechanism";
import {
  RECORD_DT,
  compile_simulation_model,
  step_dynamic_simulation,
  step_simulation,
} from "../dynamics/simulation-engine";
import { snapshot_angle } from "../snapshot";

/**
 * A closed belt's travel is a free mode — every pulley turning by as much leaves the geometry unchanged — so nothing outside the belt may excite it, or the answer becomes a function of the order the belt happens to be listed in.
 *
 * Asked of both engines, and they need different drives.
 * The kinematic block turns a pulley by hand and takes the motor out: there, a motor is a position constraint, so it pins the mode outright and would hide whatever else moves it.
 * Dynamic mode has gravity and real torque instead, and its motor pins nothing — which is why the same mechanism is asked twice below, once falling under its own weight and once driven.
 */

const deg = (r: number) => (r * 180) / Math.PI;

/** The same mechanism, its closed belts listed from pulley `by` onwards. */
function rotated(json: string, by: number): Mechanism {
  const mechanism = load_mechanism(JSON.parse(json)).mechanism;
  for (const el of mechanism.mechanicalElements) {
    if (el.type !== "belt" || !el.closed) continue;
    const n = el.attachedGearsIDs.length;
    const k = by % n;
    const rot = <T>(a: T[]) => [...a.slice(k), ...a.slice(0, k)];
    el.attachedGearsIDs = rot(el.attachedGearsIDs);
    if (el.gearWraps) el.gearWraps = rot(el.gearWraps);
    if (el.disconnectedGearIndices)
      el.disconnectedGearIndices = el.disconnectedGearIndices.map(
        (i) => (i - k + n) % n,
      );
  }
  return mechanism;
}

/** The same mechanism with no motor: nothing drives it any more. */
function unpowered(mechanism: Mechanism): Mechanism {
  for (const el of mechanism.mechanicalElements)
    if ("motor" in el) delete (el as { motor?: unknown }).motor;
  return mechanism;
}

/**
 * Final gear angles after `frames` frames, keyed by gear id — the one name no listing order can change.
 * `spin` names a pulley to turn by hand (a tooth grab following a circling cursor), the belt travel it produces being what must not depend on listing.
 */
function gearAngles(
  mechanism: Mechanism,
  frames: number,
  spin?: string,
): Map<string, number> {
  return spun(mechanism, frames, spin).angles;
}

/**
 * Final gear angles, and how far each gear actually travelled — the sum of its per-frame |Δθ|, not its net angle.
 *
 * The distinction is load-bearing for the guard below: the hand drive follows a cursor circling the rim, so the NET angle oscillates and passes near zero, which makes any ratio taken against it meaningless.
 * Measured on production values: the net angle of `Poulie bloqueuse` reaches 1.72° at 120 frames against a 0.38° listing gap — 22 %, on a mechanism that is perfectly deterministic.
 * Cumulative travel only grows.
 */
function spun(
  mechanism: Mechanism,
  frames: number,
  spin?: string,
): { angles: Map<string, number>; travel: Map<string, number> } {
  const model = compile_simulation_model(mechanism);
  const gear = mechanism.mechanicalElements.find((e) => e.id === spin);
  let prev: KinematicSnapshot | null = null;
  const travel = new Map<string, number>();
  for (let i = 0; i < frames; i++) {
    const grab =
      gear && gear.type === "gear"
        ? {
            gearID: gear.id,
            angleOffset: 0,
            radius: gear.radius,
            target: gear.position.add(
              new Point2(
                gear.radius * Math.cos((i + 1) / 20),
                gear.radius * Math.sin((i + 1) / 20),
              ),
            ),
          }
        : undefined;
    const s = step_simulation(model, i / 60, prev, 1 / 60, grab);
    if (prev)
      s.layout.angleKeys.forEach((key, k) => {
        travel.set(key, (travel.get(key) ?? 0) + Math.abs(s.angles[k] - prev!.angles[k]));
      });
    prev = s;
  }
  const out = new Map<string, number>();
  const travelled = new Map<string, number>();
  for (const el of mechanism.mechanicalElements)
    if (el.type === "gear") {
      out.set(el.id, snapshot_angle(prev!, el.id) ?? NaN);
      travelled.set(el.id, travel.get(el.id) ?? 0);
    }
  return { angles: out, travel: travelled };
}

/** Largest angle gap between two listings, in degrees. */
function maxGap(a: Map<string, number>, b: Map<string, number>): number {
  let worst = 0;
  for (const [id, angle] of a)
    worst = Math.max(worst, Math.abs(deg(angle - (b.get(id) ?? NaN))));
  return worst;
}

const MECHANISMS = [
  ["Poulie bloqueuse", poulieJson],
  ["Huygen's chain drive", huygensJson],
] as const;

describe("déterminisme des courroies fermées", () => {
  for (const [name, json] of MECHANISMS) {
    it(`${name} — au repos, rien ne tourne et le listage ne dit rien`, () => {
      const rest = (by: number) => gearAngles(unpowered(rotated(json, by)), 60);
      const reference = rest(0);
      const drift = Math.max(
        ...[...reference.values()].map((a) => Math.abs(deg(a))),
      );
      const gaps = [1, 2].map((by) => maxGap(reference, rest(by)));

      // Nothing drives the mechanism, so nothing may turn — a closed belt that travels on its own is the free mode being excited from outside.
      expect(drift).toBeLessThan(1e-10);
      for (const gap of gaps) expect(gap).toBeLessThan(1e-10);
    }, 60_000);

    it(`${name} — entraîné à la main, le listage ne change pas les angles`, () => {
      const belt = rotated(json, 0).mechanicalElements.find(
        (e) => e.type === "belt",
      );
      if (!belt || belt.type !== "belt") throw new Error("courroie introuvable");
      const driven = belt.attachedGearsIDs[0].id;
      // 120 frames, not 60: the listing gap does not accumulate — it oscillates inside a band of a few tenths of a degree — so the run has to be long enough for the travel to outgrow that band before their ratio means anything.
      // Measured on Huygens: 1.9 % at 60 frames (19° of travel), 0.32 % at 120 (33°), 0.24 % at 480, with the gap itself flat throughout.
      const drive = (by: number) =>
        spun(unpowered(rotated(json, by)), 120, driven);

      const reference = drive(0);
      const travelled = Math.max(
        ...[...reference.travel.values()].map((a) => Math.abs(deg(a))),
      );
      const gaps = [1, 2].map((by) => maxGap(reference.angles, drive(by).angles));

      // What is left is convergence, not indeterminacy: the sub-chains are cut and summed in another order, and the sweeps stop on a tolerance, not on a fixed point.
      // It stays a fraction of a percent of the travel — of the travel actually covered, which is why `travel` and not the net angle (see `spun`).
      expect(travelled).toBeGreaterThan(10);
      for (const gap of gaps) expect(gap).toBeLessThan(travelled / 100);
    }, 60_000);
  }

  it("le nœud de fermeture nu ne pilote rien", () => {
    for (const [, json] of MECHANISMS) {
      const model = compile_simulation_model(rotated(json, 0));
      const pins = model.links.filter((l) => l.type === "BeltPin");
      expect(pins).toHaveLength(1);
      expect(pins[0].type === "BeltPin" && pins[0].passive).toBe(true);
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════
 * The same question, of `step_dynamic_simulation` ════════════════════════════════════════════════════════════════════════ */

const GRAVITY = new Point2(0, -9.81);
const REST = new Point2(0, 0);

/**
 * Final gear angles and cumulative travel after `frames` DYNAMIC frames — the same two readings `spun` takes of the kinematic engine, so the two can be compared directly.
 * Nothing is driven by hand here: dynamic mode has gravity and the motor's own torque to turn a mechanism with, which the kinematic sweep has not.
 */
function fell(
  mechanism: Mechanism,
  frames: number,
  gravity: Point2,
): { angles: Map<string, number>; travel: Map<string, number> } {
  const model = compile_simulation_model(mechanism);
  const gears = mechanism.mechanicalElements.filter((e) => e.type === "gear");
  const travel = new Map<string, number>();
  let snapshot: DynamicSnapshot | null = null;
  let previous: Map<string, number> | null = null;
  for (let i = 0; i < frames; i++) {
    snapshot = step_dynamic_simulation(
      model,
      i * RECORD_DT,
      snapshot,
      RECORD_DT,
      gravity,
    );
    const now = new Map<string, number>();
    for (const gear of gears)
      now.set(gear.id, snapshot_angle(snapshot, gear.id) ?? NaN);
    if (previous)
      for (const [id, angle] of now)
        travel.set(id, (travel.get(id) ?? 0) + Math.abs(angle - previous.get(id)!));
    previous = now;
  }
  return { angles: previous!, travel };
}

/** Largest cumulative travel of any gear, in degrees. */
function maxTravel(travel: Map<string, number>): number {
  return Math.max(...[...travel.values()].map((a) => Math.abs(deg(a))));
}

describe("déterminisme des courroies fermées, en dynamique", () => {
  for (const [name, json] of MECHANISMS) {
    it(`${name} — sans gravité ni moteur, rien ne tourne et le listage ne dit rien`, () => {
      const rest = (by: number) => fell(unpowered(rotated(json, by)), 30, REST).angles;
      const reference = rest(0);
      const drift = Math.max(
        ...[...reference.values()].map((a) => Math.abs(deg(a))),
      );

      // Nothing pushes: no gravity, no motor torque.
      // Same question as the kinematic case above, and the same answer — a belt that travels here travels on its own.
      expect(drift).toBeLessThan(1e-9);
      for (const by of [1, 2]) expect(maxGap(reference, rest(by))).toBeLessThan(1e-9);
    }, 60_000);

    it(`${name} — tombant sous son propre poids, le listage ne change pas les angles`, () => {
      // 60 frames, half a second: `Huygen's chain drive` is a weight-driven clock train with nothing to escape it, so it accelerates for as long as it is left running and its pendulums eventually make it chaotic — which no listing can be held to.
      const fall = (by: number) => fell(unpowered(rotated(json, by)), 60, GRAVITY);
      const reference = fall(0);
      const travelled = maxTravel(reference.travel);

      expect(travelled).toBeGreaterThan(10);
      for (const by of [1, 2])
        expect(maxGap(reference.angles, fall(by).angles)).toBeLessThan(travelled / 100);
    }, 60_000);
  }

  it("Poulie bloqueuse — entraînée par son moteur, le listage ne change pas les angles", () => {
    const driven = (by: number) => fell(rotated(poulieJson, by), 60, GRAVITY);
    const reference = driven(0);
    const travelled = maxTravel(reference.travel);

    expect(travelled).toBeGreaterThan(10);
    for (const by of [1, 2])
      expect(maxGap(reference.angles, driven(by).angles)).toBeLessThan(travelled / 100);
  }, 60_000);

  // Expected to fail: a closed belt carries one strand law more than it has independent ones, and the surplus is shared out differently depending on which strand the listing makes first.
  // The kinematic engine hides it — its motor is a position constraint, which pins the loop back every frame — while dynamic mode drives through a torque and leaves the loop's own travel free, so the mismatch integrates instead.
  // Measured on this mechanism: 0.27 % of the travel kinematic, 17 % dynamic, and it is not a convergence budget (bit-identical from 200 to 3200 sweeps, and from 1 to 64 substeps) nor the alternating sweep order (bit-identical with it off).
  // The signature is a belt-length redistribution, not a circulation: the driven pulley's rim displacement is exactly minus the sum of the others'.
  // See docs/courroie-dynamique.md.
  it.fails("Huygen's chain drive — entraîné par son moteur, le listage ne change pas les angles", () => {
    const driven = (by: number) => fell(rotated(huygensJson, by), 60, GRAVITY);
    const reference = driven(0);
    const travelled = maxTravel(reference.travel);

    expect(travelled).toBeGreaterThan(10);
    for (const by of [1, 2])
      expect(maxGap(reference.angles, driven(by).angles)).toBeLessThan(travelled / 100);
  }, 60_000);
});
