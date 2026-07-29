import { describe, it, expect } from "vitest";
import poulieJson from "../../../test-mechanisms/Poulie bloqueuse.slidep?raw";
import coreXYJson from "../../../test-mechanisms/Core XY - 2 moteurs.slidep?raw";
import huygensJson from "../../../test-mechanisms/Huygen's chain drive.slidep?raw";
import { Point2 } from "../../types/point2";
import { Link } from "../../types";
import { load_mechanism } from "../../utils/load-mechanism";
import {
  compile_simulation_model,
  step_simulation,
  SimulationModel,
} from "./kinematic-simulation";

/**
 * Guardrails for the three belt reference mechanisms, on a short horizon: they catch a
 * frank regression of belt behaviour in the default test pass. The detailed measurement
 * harnesses live in `belt-*.bench.test.ts` (`npm run test:bench`).
 *
 * The expected values below describe the CURRENT belt model. Several of them are the
 * documented defects it is meant to fix, so they are expected to change — see
 * `docs/belt-kinematic-solver/plan-implementation.md`.
 */

const deg = (r: number) => (r * 180) / Math.PI;
const loadFixture = (json: string) => load_mechanism(JSON.parse(json)).mechanism;

type Motor = Extract<Link, { type: "MotorAngle" }>;
const motorsOf = (m: SimulationModel) =>
  m.links.filter((l): l is Motor => l.type === "MotorAngle");

/** Runs `frames` steps at 60 Hz from the model's rest state, calling `probe` after each. */
function run(
  model: SimulationModel,
  frames: number,
  probe?: (frame: number, angles: Map<string, number>) => void,
) {
  let positions: Map<string, Point2> | null = null;
  let angles: Map<string, number> | null = null;
  for (let i = 0; i < frames; i++) {
    const s = step_simulation(model, i / 60, positions, angles, 1 / 60);
    positions = s.positions;
    angles = s.angles;
    probe?.(i + 1, angles);
  }
  return { positions: positions!, angles: angles! };
}

describe("garde-fous des mécanismes à courroie", () => {
  it("Poulie bloqueuse — le moteur s'arrête, et il reste arrêté", () => {
    const model = compile_simulation_model(loadFixture(poulieJson));
    const motor = motorsOf(model)[0];
    let blocked = NaN;
    const end = run(model, 200, (frame, angles) => {
      if (frame === 100) blocked = deg(angles.get(motor.angleKey) ?? 0);
    });

    // The motor commands 1 rad/s: it would be at 100° by frame 100 if nothing stopped it.
    console.log(`  blocage à ${blocked.toFixed(4)}°`);
    expect(blocked).toBeGreaterThan(45);
    expect(blocked).toBeLessThan(55);
    // A true dead point, not slow creep: nothing moves over the next 100 frames.
    expect(Math.abs(deg(end.angles.get(motor.angleKey) ?? 0) - blocked)).toBeLessThan(0.05);
  }, 60_000);

  it("Core XY - 2 moteurs — un moteur seul, l'autre à ω = 0", () => {
    const model = compile_simulation_model(loadFixture(coreXYJson));
    const motors = motorsOf(model);
    const frozen = motors.find((l) => l.angleKey.startsWith("2aca3c1f"));
    const driver = motors.find((l) => l !== frozen);
    if (!frozen || !driver) throw new Error("les deux moteurs du Core XY sont introuvables");
    frozen.omega = 0;

    const carriage = "1e5193fb-f4de-47a8-a549-c3d3aecc18bd";
    const key = model.keyMap.get(carriage) ?? carriage;
    const start = model.nodes.positions.get(key)!.clone();
    const r = run(model, 60);
    const end = r.positions.get(carriage) ?? r.positions.get(key)!;
    const ratio = (end.y - start.y) / (end.x - start.x);

    // Freezing one motor leaves a single degree of freedom — the diagonal, Δy/Δx ≈ 1 —
    // and the frozen motor must stay put. Both follow from the belt no longer slipping.
    console.log(
      `  Δ = (${(end.x - start.x).toFixed(2)}, ${(end.y - start.y).toFixed(2)})  Δy/Δx = ${ratio.toFixed(4)}  figé = ${deg(r.angles.get(frozen.angleKey) ?? 0).toFixed(4)}°`,
    );
    expect(Math.abs(end.x - start.x)).toBeGreaterThan(10);
    expect(ratio).toBeGreaterThan(0.9);
    expect(ratio).toBeLessThan(1.1);
    expect(Math.abs(deg(r.angles.get(frozen.angleKey) ?? 0))).toBeLessThan(1);
  }, 60_000);

  it("Huygen's chain drive — le moteur suit sa consigne", () => {
    const model = compile_simulation_model(loadFixture(huygensJson));
    const motor = motorsOf(model)[0];
    const frames = 60;
    const r = run(model, frames);
    const tracking =
      (r.angles.get(motor.angleKey) ?? 0) / ((motor.omega * frames) / 60);

    // Nothing on this mechanism should hold the motor back: it must do what it is told.
    console.log(`  suivi = ${(100 * tracking).toFixed(2)} %`);
    expect(tracking).toBeGreaterThan(0.95);
  }, 60_000);
});
