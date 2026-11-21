import { describe, expect, it } from "vitest";
import json from "../../../../test-mechanisms/Coup de pied.slidep?raw";
import rebond from "../../../../test-mechanisms/Rebond.slidep?raw";
import { get_dynamic_probe_series } from "../recording/probe-series";
import { load_mechanism } from "../../../utils/load-mechanism";
import { Recorder } from "../recording/recorder";
import { dynamic_snapshot_at } from "../dynamics/simulation-engine";
import type { DynamicSnapshot } from "../../../types/runtime-state";

/** The leg of "Coup de pied" kicks a bar at rest into a clockwise spin at about t = 0.28 s. */
describe("interpolation à travers un choc", () => {
  it("ne fait pas partir la barre frappée à l'envers avant qu'elle tourne", () => {
    const mechanism = load_mechanism(JSON.parse(json)).mechanism;
    const recorder = new Recorder();
    recorder.setCollisions(true);
    recorder.load("dynamic", mechanism, null);
    const snapshots = recorder.advance(0.4, Infinity).snapshots as DynamicSnapshot[];
    const keys = snapshots[0].layout.keys;
    const start = keys.findIndex((key) => key.endsWith("bc64:start"));
    const end = keys.findIndex((key) => key.endsWith("bc64:end"));
    const angle = (q: DynamicSnapshot) =>
      Math.atan2(
        q.positions[2 * end + 1] - q.positions[2 * start + 1],
        q.positions[2 * end] - q.positions[2 * start],
      );

    // Clockwise only: the angle never rises, between drawn frames as at recorded instants.
    let previous = Infinity;
    for (let t = 0.25; t < 0.3; t += 1 / 480) {
      const now = angle(dynamic_snapshot_at(snapshots, t)!);
      expect(now).toBeLessThanOrEqual(previous + 1e-9);
      previous = now;
    }
    expect(previous).toBeLessThan(Math.PI / 4);
  });

  it("montre le point du coup assez longtemps pour qu'une image le voie", () => {
    const mechanism = load_mechanism(JSON.parse(json)).mechanism;
    const recorder = new Recorder();
    recorder.setCollisions(true);
    recorder.load("dynamic", mechanism, null);
    const snapshots = recorder.advance(0.4, Infinity).snapshots as DynamicSnapshot[];
    // The kick is over within one solver step, which ends just after the instant it struck at.
    let shown = 0;
    const dt = 1e-4;
    for (let t = 0.25; t < 0.32; t += dt) if (dynamic_snapshot_at(snapshots, t)!.contacts?.length) shown += dt;
    expect(shown).toBeGreaterThan(1 / 120);
  });

  /** The wheel of "Rebond" falls straight down onto a slanted floor and bounces off it a little after t = 0.20 s. */
  it("fait tomber la roue droit jusqu'au choc, puis la fait repartir d'un coup", () => {
    const mechanism = load_mechanism(JSON.parse(rebond)).mechanism;
    const recorder = new Recorder();
    recorder.setFloor(true);
    recorder.load("dynamic", mechanism, null);
    const snapshots = recorder.advance(0.3, Infinity).snapshots as DynamicSnapshot[];
    const wheel = mechanism.mechanicalElements[0];
    const slot = snapshots[0].layout.index.get(wheel.id)!;

    // Before the bounce the wheel only falls: it does not drift along the floor ahead of touching it.
    let fell = 0;
    for (let t = 0.19; t < 0.22; t += 1 / 2000) {
      const q = dynamic_snapshot_at(snapshots, t)!;
      if (q.velocities[2 * slot + 1] >= 0) break;
      expect(q.positions[2 * slot]).toBeCloseTo(-0.1, 5);
      fell++;
    }
    expect(fell).toBeGreaterThan(30);

    // The velocity curve jumps at one instant, with nothing plotted between the fall and the rebound.
    const series = get_dynamic_probe_series(wheel, "velocity", snapshots);
    const vy = series.curves.find((curve) => curve.key === "y")!.values;
    const k = vy.findIndex((v) => v > 0);
    expect(vy[k - 1]).toBeLessThan(-1.9);
    expect(vy[k]).toBeGreaterThan(1);
    expect(series.t[k]).toBe(series.t[k - 1]);
  });
});
