import { describe, it, expect } from "vitest";
import poulieJson from "../../../test-mechanisms/Poulie bloqueuse.slidep?raw";
import huygensJson from "../../../test-mechanisms/Huygen's chain drive.slidep?raw";
import { Mechanism, Point2 } from "../../types";
import { load_mechanism } from "../../utils/load-mechanism";
import {
  compile_simulation_model,
  step_simulation,
} from "./kinematic-simulation";

/**
 * A closed belt's travel is a free mode — every pulley turning by as much leaves the
 * geometry unchanged — so nothing outside the belt may excite it, or the answer becomes
 * a function of the order the belt happens to be listed in. Both mechanisms here are
 * driven by hand rather than by their motor: a motor pins the mode outright, and would
 * hide whatever else moves it.
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
 * Final gear angles after `frames` frames, keyed by gear id — the one name no listing
 * order can change. `spin` names a pulley to turn by hand (a tooth grab following a
 * circling cursor), the belt travel it produces being what must not depend on listing.
 */
function gearAngles(
  mechanism: Mechanism,
  frames: number,
  spin?: string,
): Map<string, number> {
  return spun(mechanism, frames, spin).angles;
}

/**
 * Final gear angles, and how far each gear actually travelled — the sum of its per-frame
 * |Δθ|, not its net angle.
 *
 * The distinction is load-bearing for the guard below: the hand drive follows a cursor
 * circling the rim, so the NET angle oscillates and passes near zero, which makes any ratio
 * taken against it meaningless. Measured on production values: the net angle of
 * `Poulie bloqueuse` reaches 1.72° at 120 frames against a 0.38° listing gap — 22 %, on a
 * mechanism that is perfectly deterministic. Cumulative travel only grows.
 */
function spun(
  mechanism: Mechanism,
  frames: number,
  spin?: string,
): { angles: Map<string, number>; travel: Map<string, number> } {
  const model = compile_simulation_model(mechanism);
  const gear = mechanism.mechanicalElements.find((e) => e.id === spin);
  let positions: Map<string, Point2> | null = null;
  let angles: Map<string, number> | null = null;
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
    const s = step_simulation(model, i / 60, positions, angles, 1 / 60, grab);
    s.angles.forEach((a, key) => {
      const before = angles?.get(key);
      if (before !== undefined)
        travel.set(key, (travel.get(key) ?? 0) + Math.abs(a - before));
    });
    positions = s.positions;
    angles = s.angles;
  }
  const out = new Map<string, number>();
  const travelled = new Map<string, number>();
  for (const el of mechanism.mechanicalElements)
    if (el.type === "gear") {
      out.set(el.id, angles!.get(el.id) ?? NaN);
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

      // Nothing drives the mechanism, so nothing may turn — a closed belt that
      // travels on its own is the free mode being excited from outside.
      expect(drift).toBeLessThan(1e-10);
      for (const gap of gaps) expect(gap).toBeLessThan(1e-10);
    }, 60_000);

    it(`${name} — entraîné à la main, le listage ne change pas les angles`, () => {
      const belt = rotated(json, 0).mechanicalElements.find(
        (e) => e.type === "belt",
      );
      if (!belt || belt.type !== "belt") throw new Error("courroie introuvable");
      const driven = belt.attachedGearsIDs[0].id;
      // 120 frames, not 60: the listing gap does not accumulate — it oscillates inside a
      // band of a few tenths of a degree — so the run has to be long enough for the travel
      // to outgrow that band before their ratio means anything. Measured on Huygens: 1.9 %
      // at 60 frames (19° of travel), 0.32 % at 120 (33°), 0.24 % at 480, with the gap
      // itself flat throughout.
      const drive = (by: number) =>
        spun(unpowered(rotated(json, by)), 120, driven);

      const reference = drive(0);
      const travelled = Math.max(
        ...[...reference.travel.values()].map((a) => Math.abs(deg(a))),
      );
      const gaps = [1, 2].map((by) => maxGap(reference.angles, drive(by).angles));

      // What is left is convergence, not indeterminacy: the sub-chains are cut and
      // summed in another order, and the sweeps stop on a tolerance, not on a fixed
      // point. It stays a fraction of a percent of the travel — of the travel actually
      // covered, which is why `travel` and not the net angle (see `spun`).
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
