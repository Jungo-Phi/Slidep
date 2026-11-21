import { describe, expect, it } from "vitest";
import json from "../../../../test-mechanisms/Rebond.slidep?raw";
import { load_mechanism } from "../../../utils/load-mechanism";
import { make_snapshot_layout } from "../snapshot";
import { Recorder } from "../recording/recorder";
import { apply_dynamic_snapshot_to_mechanism } from "../dynamics/simulation-engine";
import { compute_force_balance, contact_terms } from "../analysis/force-balance";
import { gravity_vector } from "../../../constants/physics-specs";
import { Point2 } from "../../../types";
import type { ID } from "../../../types";
import type { DynamicSnapshot } from "../../../types/runtime-state";

/** The wheel of "Rebond" bounces down a floor slanted by 20°, comes to rest on it at about t = 1.75 s, then rolls. */
const SLOPE = 0.3490658503988659;

function record(until: number) {
  const mechanism = load_mechanism(JSON.parse(json)).mechanism;
  const recorder = new Recorder();
  recorder.setFloor(true);
  recorder.load("dynamic", mechanism, null);
  return { mechanism, snapshots: recorder.advance(until, Infinity).snapshots as DynamicSnapshot[] };
}

describe("efforts de contact", () => {
  it("donnent au sol la réaction qui ferme le bilan de la roue qui roule", () => {
    const { mechanism, snapshots } = record(3);
    const wheel = mechanism.mechanicalElements.find((el) => el.type === "gear")!;
    const mass = 10 * Math.PI * 0.05 ** 2;
    const rolling = snapshots.filter((s) => s.t > 2.5);
    expect(rolling.length).toBeGreaterThan(10);
    for (const snapshot of rolling) {
      const [contact] = snapshot.contacts!;
      expect(contact.force!.bodies).toEqual([wheel.id, undefined]);
      // Pressed by the weight across the slope, and held by friction from slipping down it: a disc rolling without slip needs a third of the pull along the slope.
      expect(contact.force!.normal).toBeCloseTo(mass * 9.81 * Math.cos(SLOPE), 3);
      expect(Math.abs(contact.force!.friction)).toBeCloseTo((mass * 9.81 * Math.sin(SLOPE)) / 3, 3);
      const balance = compute_force_balance(
        apply_dynamic_snapshot_to_mechanism(mechanism, snapshot),
        snapshot,
        gravity_vector(mechanism.simulation),
      )!;
      expect(balance.actions.filter((action) => action.kind === "contact")).toHaveLength(1);
      expect(balance.gap.length()).toBeLessThan(1e-6);
    }
  });

  it("ne donnent pas de force à un choc", () => {
    const { snapshots } = record(1.5);
    // Every contact before the wheel settles is a bounce, over within one step.
    const bounces = snapshots.filter((s) => s.contacts);
    expect(bounces.length).toBeGreaterThan(3);
    for (const snapshot of bounces) expect(snapshot.contacts!.every((contact) => !contact.force)).toBe(true);
  });

  it("entre deux pièces, s'opposent, et se décomposent en normale et frottement", () => {
    const layout = make_snapshot_layout([], []);
    const [a, b] = ["a" as ID, "b" as ID];
    const snapshot = {
      t: 0,
      layout,
      contacts: [{ id: 4, x: 1, y: 2, force: { bodies: [a, b], nx: 0, ny: 1, normal: 3, friction: 2 } }],
    } as unknown as DynamicSnapshot;

    const whole = contact_terms(snapshot, false);
    expect(whole.map((term) => term.elementID)).toEqual([a, b]);
    expect(whole[0].force).toEqual(new Point2(-2, 3));
    expect(whole[1].force).toEqual(new Point2(2, -3));
    expect(whole.every((term) => term.contact?.internal)).toBe(true);

    const apart = contact_terms(snapshot, true);
    expect(apart.map((term) => term.contact?.part)).toEqual(["normal", "friction", "normal", "friction"]);
    expect(apart[0].force.add(apart[1].force)).toEqual(whole[0].force);
    // Each term names its own arrow, so no two of them share an id.
    expect(new Set(apart.map((term) => term.id)).size).toBe(4);
  });
});
