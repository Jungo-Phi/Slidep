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
import { snapshot_angle } from "../src/components/solver/snapshot";

function unpowered(mechanism: Mechanism): Mechanism {
  for (const el of mechanism.mechanicalElements)
    if ("motor" in el) delete (el as { motor?: unknown }).motor;
  return mechanism;
}

describe("trace: Huygens qui tombe sans moteur", () => {
  it("disconnects + angles frame par frame", () => {
    const mechanism = unpowered(load_mechanism(JSON.parse(huygensJson)).mechanism);
    const model = compile_simulation_model(mechanism);
    const belt = model.links.find((l) => l.type === "BeltLength");
    if (!belt || belt.type !== "BeltLength") throw new Error("no belt");
    const gears = mechanism.mechanicalElements.filter((e) => e.type === "gear");

    let snapshot: DynamicSnapshot | null = null;
    const rows: string[] = [];
    for (let f = 0; f < 100; f++) {
      snapshot = step_dynamic_simulation(model, f * RECORD_DT, snapshot, RECORD_DT, new Point2(0, -9.81));
      const angles = gears.map((g) => (snapshot_angle(snapshot!, g.id) ?? NaN).toFixed(4));
      rows.push(
        `frame ${String(f).padStart(2)}: wraps=[${belt.wraps?.map((w) => w.toFixed(3)).join(", ") ?? "?"}] disc=[${belt.disconnected?.join(",") ?? "?"}] angles=[${angles.join(", ")}]`,
      );
    }
    // eslint-disable-next-line no-console
    console.log(rows.join("\n"));
  }, 60_000);
});
