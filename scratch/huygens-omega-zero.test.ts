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

function run(mechanism: Mechanism, frames: number): Map<string, number> {
  const model = compile_simulation_model(mechanism);
  const gears = mechanism.mechanicalElements.filter((e) => e.type === "gear");
  let snapshot: DynamicSnapshot | null = null;
  for (let i = 0; i < frames; i++)
    snapshot = step_dynamic_simulation(
      model,
      i * RECORD_DT,
      snapshot,
      RECORD_DT,
      new Point2(0, -9.81),
    );
  const out = new Map<string, number>();
  for (const gear of gears) out.set(gear.id, snapshot_angle(snapshot!, gear.id) ?? NaN);
  return out;
}

describe("moteur à vitesse nulle vs moteur absent", () => {
  it("compare les angles après 30 frames", () => {
    const withoutMotor = load_mechanism(JSON.parse(huygensJson)).mechanism;
    for (const el of withoutMotor.mechanicalElements)
      if ("motor" in el) delete (el as { motor?: unknown }).motor;

    const zeroSpeedMotor = load_mechanism(JSON.parse(huygensJson)).mechanism;
    for (const el of zeroSpeedMotor.mechanicalElements)
      if ("motor" in el && el.motor) el.motor = { ...el.motor, speed: 0 };

    const a = run(withoutMotor, 30);
    const b = run(zeroSpeedMotor, 30);

    const deg = (r: number) => (r * 180) / Math.PI;
    // eslint-disable-next-line no-console
    console.log(
      "sans moteur (supprimé):",
      [...a.entries()].map(([id, v]) => `${id.slice(0, 6)}=${deg(v).toFixed(3)}°`).join(" "),
    );
    // eslint-disable-next-line no-console
    console.log(
      "moteur present, speed=0:",
      [...b.entries()].map(([id, v]) => `${id.slice(0, 6)}=${deg(v).toFixed(3)}°`).join(" "),
    );
  }, 60_000);
});
