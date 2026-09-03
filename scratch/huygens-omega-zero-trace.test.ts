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

const deg = (r: number) => (r * 180) / Math.PI;

function traceMotorAngle(mechanism: Mechanism, motorGearID: string, frames: number): string[] {
  const model = compile_simulation_model(mechanism);
  let snapshot: DynamicSnapshot | null = null;
  const rows: string[] = [];
  let prev = 0;
  for (let f = 0; f < frames; f++) {
    snapshot = step_dynamic_simulation(
      model,
      f * RECORD_DT,
      snapshot,
      RECORD_DT,
      new Point2(0, -9.81),
    );
    const a = snapshot_angle(snapshot, motorGearID) ?? NaN;
    rows.push(`frame ${String(f).padStart(2)}: angle=${deg(a).toFixed(5)}°  step=${deg(a - prev).toFixed(5)}°`);
    prev = a;
  }
  return rows;
}

describe("moteur ω=0, torque=1 — trace frame par frame", () => {
  it("montre où ça décroche", () => {
    const zeroSpeedMotor = load_mechanism(JSON.parse(huygensJson)).mechanism;
    let motorTorque: number | undefined;
    for (const el of zeroSpeedMotor.mechanicalElements)
      if ("motor" in el && el.motor) {
        motorTorque = el.motor.torque;
        el.motor = { ...el.motor, speed: 0 };
      }
    // eslint-disable-next-line no-console
    console.log("torque compilé (après migration):", motorTorque);

    const motorGearID = "61d94350-fa16-4bf1-b910-009a8b06402b";
    const rows = traceMotorAngle(zeroSpeedMotor, motorGearID, 60);
    // eslint-disable-next-line no-console
    console.log(rows.join("\n"));
  }, 60_000);
});
