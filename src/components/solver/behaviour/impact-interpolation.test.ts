import { describe, expect, it } from "vitest";
import json from "../../../../test-mechanisms/Coup de pied.slidep?raw";
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
});
