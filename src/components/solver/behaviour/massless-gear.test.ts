import { describe, expect, it } from "vitest";
import { DEFAULT_METADATA, DEFAULT_SIMULATION, Mechanism } from "../../../types/mechanism";
import { Point2 } from "../../../types/point2";
import type {
  GearElement,
  ID,
  MassElement,
  MechanicalElement,
  MomentElement,
  PivotElement,
} from "../../../types/element";
import {
  RECORD_DT,
  compile_simulation_model,
  step_dynamic_simulation,
} from "../dynamics/simulation-engine";
import { DynamicSnapshot } from "../../../types/runtime-state";
import { snapshot_angle_acceleration, snapshot_angle_velocity } from "../snapshot";
import { gear_inertia } from "../../../utils/gear-mass";

/** A moment on a gear on a grounded axle: its acceleration must reflect every inertia it drags, through the ratio or the lever that couples it. */

let nextID = 0;
const id = (): ID =>
  `00000000-0000-0000-0000-${String(++nextID).padStart(12, "0")}` as ID;

const DRIVER_RADIUS = 10;
const IDLER_RADIUS = 5;
const TORQUE = 50;

function mechanism(mechanicalElements: MechanicalElement[], loads: MomentElement[]): Mechanism {
  return {
    metadata: DEFAULT_METADATA,
    viewport: { scale: 1, pan: new Point2(0, 0) },
    simulation: DEFAULT_SIMULATION,
    mechanicalElements,
    constraintElements: [],
    loads,
    materials: [],
    profiles: [],
    history: [],
    future: [],
  };
}

function axle(position: Point2, gearID: ID): PivotElement {
  return {
    type: "pivot",
    id: id(),
    probes: [],
    overlays: {},
    position,
    isGrounded: true,
    rotatingEdgesIDs: [],
    fixedGearsIDs: [gearID],
    rotationalFriction: 0,
  };
}

function gear(gearID: ID, axleID: ID, position: Point2, radius: number, surfaceMass: number): GearElement {
  return {
    type: "gear",
    id: gearID,
    probes: [],
    overlays: {},
    position,
    angle: 0,
    radius,
    parentAxleID: axleID,
    fixedNodesBodyIDs: [],
    meshedGearsIDs: [],
    surfaceMass,
  };
}

/** Steps a few frames without gravity and returns the last snapshot. */
function run(mech: Mechanism): DynamicSnapshot {
  const model = compile_simulation_model(mech);
  let snapshot: DynamicSnapshot | null = null;
  for (let i = 0; i < 10; i++)
    snapshot = step_dynamic_simulation(model, i * RECORD_DT, snapshot, RECORD_DT, new Point2(0, 0));
  return snapshot!;
}

/** The driver's angular acceleration and the idler's angular velocity, with the moment on the driver. */
function run_train(driverSurfaceMass: number, idlerSurfaceMass: number) {
  const DRIVER = id();
  const IDLER = id();
  const driverPosition = new Point2(0, 0);
  const idlerPosition = new Point2(DRIVER_RADIUS + IDLER_RADIUS, 0);
  const driverAxle = axle(driverPosition, DRIVER);
  const idlerAxle = axle(idlerPosition, IDLER);
  const driver = gear(DRIVER, driverAxle.id, driverPosition, DRIVER_RADIUS, driverSurfaceMass);
  const idler = gear(IDLER, idlerAxle.id, idlerPosition, IDLER_RADIUS, idlerSurfaceMass);
  driver.meshedGearsIDs = [IDLER];
  idler.meshedGearsIDs = [DRIVER];
  const moment: MomentElement = { type: "moment", id: id(), targetID: DRIVER, value: TORQUE };
  const snapshot = run(mechanism([driverAxle, idlerAxle, driver, idler], [moment]));
  return {
    driverAlpha: snapshot_angle_acceleration(snapshot, DRIVER) ?? 0,
    idlerVelocity: snapshot_angle_velocity(snapshot, IDLER) ?? 0,
  };
}

describe("inertie entraînée par un engrenage en dynamique", () => {
  it("un pignon massif freine la roue menante selon le rapport", () => {
    const ratio = DRIVER_RADIUS / IDLER_RADIUS;
    const reflected = gear_inertia(1, DRIVER_RADIUS) + gear_inertia(1, IDLER_RADIUS) * ratio * ratio;
    const { driverAlpha } = run_train(1, 1);
    // Clockwise moment, negative in the solver's raw angle convention.
    expect(driverAlpha / (-TORQUE / reflected)).toBeCloseTo(1, 2);
  });

  it("un pignon sans masse freine moins qu'un pignon massif, et jamais au-delà de la roue seule", () => {
    const alone = TORQUE / gear_inertia(1, DRIVER_RADIUS);
    const massless = Math.abs(run_train(1, 0).driverAlpha);
    const massive = Math.abs(run_train(1, 1).driverAlpha);
    expect(massless).toBeGreaterThan(massive);
    expect(massless).toBeLessThanOrEqual(alone * (1 + 1e-9));
  });

  it("une roue menante sans masse entraîne un pignon massif", () => {
    const { idlerVelocity } = run_train(0, 1);
    expect(Math.abs(idlerVelocity)).toBeGreaterThan(1e-4);
  });

  it("une masse fixée sur la jante s'ajoute à l'inertie de la roue", () => {
    const GEAR = id();
    const MASS = 100;
    const gearAxle = axle(new Point2(0, 0), GEAR);
    const wheel = gear(GEAR, gearAxle.id, new Point2(0, 0), DRIVER_RADIUS, 1);
    const rim: MassElement = {
      type: "mass",
      id: id(),
      probes: [],
      overlays: {},
      position: new Point2(DRIVER_RADIUS, 0),
      isGrounded: false,
      fixedEdgesIDs: [],
      mass: MASS,
    };
    wheel.fixedNodesBodyIDs = [rim.id];
    const moment: MomentElement = { type: "moment", id: id(), targetID: GEAR, value: TORQUE };
    const snapshot = run(mechanism([gearAxle, wheel, rim], [moment]));
    const inertia = gear_inertia(1, DRIVER_RADIUS) + MASS * DRIVER_RADIUS * DRIVER_RADIUS;
    const alpha = snapshot_angle_acceleration(snapshot, GEAR) ?? 0;
    expect(alpha / (-TORQUE / inertia)).toBeCloseTo(1, 2);
  });
});
