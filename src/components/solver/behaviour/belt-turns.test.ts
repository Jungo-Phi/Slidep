import { describe, expect, it } from "vitest";
import treuilJson from "../../../../test-mechanisms/Treuil court.slidep?raw";
import { Mechanism, Point2 } from "../../../types";
import type { DynamicSnapshot } from "../../../types/runtime-state";
import { load_mechanism } from "../../../utils/load-mechanism";
import {
  RECORD_DT,
  compile_simulation_model,
  step_dynamic_simulation,
} from "../dynamics/simulation-engine";
import { snapshot_point } from "../snapshot";

const GRAVITY = new Point2(0, -9.81);

/** The winch, its drum wound by `turns` whole turns, its motor turning at `speed`. */
function winch(turns: number, speed: number): Mechanism {
  const mechanism = load_mechanism(JSON.parse(treuilJson)).mechanism;
  for (const el of mechanism.mechanicalElements) {
    if (el.type === "belt" && turns > 0) el.attachedGearsIDs[0].turns = turns;
    if (el.type === "pivot" && el.motor) el.motor = { ...el.motor, speed };
  }
  return mechanism;
}

/** Where the load is, and the wrap tracked on the drum, frame after frame. */
function run(mechanism: Mechanism, frames: number) {
  const model = compile_simulation_model(mechanism);
  const load = mechanism.mechanicalElements.find((e) => e.type === "mass")!.id;
  let snapshot: DynamicSnapshot | null = null;
  const heights: number[] = [];
  const wraps: number[] = [];
  const belt = model.links.find((l) => l.type === "BeltLength");
  for (let i = 0; i < frames; i++) {
    snapshot = step_dynamic_simulation(model, i * RECORD_DT, snapshot, RECORD_DT, GRAVITY);
    heights.push(snapshot_point(snapshot, load)!.y);
    wraps.push(belt?.type === "BeltLength" ? (belt.wraps?.[0] ?? NaN) : NaN);
  }
  return { heights, wraps };
}

describe("a winch whose drum carries whole turns of rope", () => {
  const SPEED = 1.0471975511965976;
  // The sense that lowers the load: the drum pays rope out.
  const paying = [SPEED, -SPEED].find((speed) => {
    const { heights } = run(winch(2, speed), 30);
    return heights[heights.length - 1] < heights[0];
  })!;

  it("starts exactly where it would without them: nothing jumps on the first frame", () => {
    const bare = run(winch(0, paying), 1).heights[0];
    expect(run(winch(2, paying), 1).heights[0]).toBeCloseTo(bare, 9);
  });

  it("moves exactly as it would without them, its tracked wrap ahead by their 2π each", () => {
    const bare = run(winch(0, paying), 240);
    const wound = run(winch(2, paying), 240);
    wound.heights.forEach((h, i) => expect(h).toBeCloseTo(bare.heights[i], 9));
    wound.wraps.forEach((w, i) => expect(w - bare.wraps[i]).toBeCloseTo(4 * Math.PI, 6));
  });
});
