import { describe, it } from "vitest";
import huygensJson from "../test-mechanisms/Huygen's chain drive.slidep?raw";
import { Mechanism, Point2 } from "../src/types";
import { DynamicSnapshot } from "../src/types/runtime-state";
import { load_mechanism } from "../src/utils/load-mechanism";
import {
  RECORD_DT,
  compile_simulation_model,
  step_dynamic_simulation,
} from "../src/components/solver/dynamics/simulation-engine";
import { snapshot_point } from "../src/components/solver/snapshot";
import { belt_pieces, BeltVia } from "../src/utils/belt-path";

function rotated(json: string, by: number): Mechanism {
  const mechanism = load_mechanism(JSON.parse(json)).mechanism;
  for (const el of mechanism.mechanicalElements) {
    if (el.type !== "belt" || !el.closed) continue;
    const n = el.attachedGearsIDs.length;
    const k = by % n;
    const rot = <T>(a: T[]) => [...a.slice(k), ...a.slice(0, k)];
    el.attachedGearsIDs = rot(el.attachedGearsIDs);
  }
  return mechanism;
}

describe("wrap réel par poulie — by=1", () => {
  it("trace frame par frame, cherche le décrochage", () => {
    const mechanism = rotated(huygensJson, 1);
    const belt = mechanism.mechanicalElements.find((e) => e.type === "belt");
    if (!belt || belt.type !== "belt") throw new Error("no belt");
    const gearIDs = belt.attachedGearsIDs.map((g) => g.id);
    const gears = gearIDs.map(
      (id) => mechanism.mechanicalElements.find((e) => e.id === id)!,
    );

    const model = compile_simulation_model(mechanism);
    let snapshot: DynamicSnapshot | null = null;
    const rows: string[] = [];
    let prevMin = Infinity;
    for (let f = 0; f < 100; f++) {
      snapshot = step_dynamic_simulation(
        model,
        f * RECORD_DT,
        snapshot,
        RECORD_DT,
        new Point2(0, -9.81),
      );
      const vias: BeltVia[] = gears.map((g, i) => {
        const p = snapshot_point(snapshot!, g.id) ?? (g as { position: Point2 }).position;
        const dir = belt.attachedGearsIDs[i].direction ?? false;
        return { pos: p, radius: (g as { radius: number }).radius, clockwise: dir };
      });
      const pieces = belt_pieces(vias, true);
      const wraps = gearIDs.map((_, i) => {
        const arc = pieces.find((p) => p.kind === "arc" && p.gearIndex === i);
        return arc && arc.kind === "arc" ? arc.wrap : NaN;
      });
      const min = Math.min(...wraps);
      const jump = Math.abs(min - prevMin) > 0.3;
      if (f % 10 === 0 || f > 65 || jump)
        rows.push(
          `frame ${String(f).padStart(2)}: wraps=[${wraps.map((w) => w.toFixed(3)).join(", ")}]${jump ? "  <== SAUT" : ""}`,
        );
      prevMin = min;
    }
    // eslint-disable-next-line no-console
    console.log(rows.join("\n"));
  }, 60_000);
});
