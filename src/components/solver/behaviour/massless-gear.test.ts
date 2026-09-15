import { describe, expect, it } from "vitest";
import { DEFAULT_METADATA, DEFAULT_SIMULATION, Mechanism } from "../../../types/mechanism";
import { Point2 } from "../../../types/point2";
import type {
  GearElement,
  ID,
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

/** A moment on the driver of a two-gear train, each gear on its own grounded axle: the driver's acceleration must reflect both inertias through the ratio. */

let nextID = 0;
const id = (): ID =>
  `00000000-0000-0000-0000-${String(++nextID).padStart(12, "0")}` as ID;

const DRIVER_RADIUS = 10;
const IDLER_RADIUS = 5;
const TORQUE = 50;

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

function gear(gearID: ID, axleID: ID, position: Point2, radius: number, surfaceMass: number, meshed: ID): GearElement {
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
    meshedGearsIDs: [meshed],
    surfaceMass,
  };
}

/** Angular velocity and acceleration of both gears after a few frames. */
function run_train(driverSurfaceMass: number, idlerSurfaceMass: number) {
  const DRIVER = id();
  const IDLER = id();
  const driverPosition = new Point2(0, 0);
  const idlerPosition = new Point2(DRIVER_RADIUS + IDLER_RADIUS, 0);
  const driverAxle = axle(driverPosition, DRIVER);
  const idlerAxle = axle(idlerPosition, IDLER);
  const elements: MechanicalElement[] = [
    driverAxle,
    idlerAxle,
    gear(DRIVER, driverAxle.id, driverPosition, DRIVER_RADIUS, driverSurfaceMass, IDLER),
    gear(IDLER, idlerAxle.id, idlerPosition, IDLER_RADIUS, idlerSurfaceMass, DRIVER),
  ];
  const moment: MomentElement = { type: "moment", id: id(), targetID: DRIVER, value: TORQUE };
  const mechanism: Mechanism = {
    metadata: DEFAULT_METADATA,
    viewport: { scale: 1, pan: new Point2(0, 0) },
    simulation: DEFAULT_SIMULATION,
    mechanicalElements: elements,
    constraintElements: [],
    loads: [moment],
    materials: [],
    profiles: [],
    history: [],
    future: [],
  };

  const model = compile_simulation_model(mechanism);
  let snapshot: DynamicSnapshot | null = null;
  for (let i = 0; i < 10; i++)
    snapshot = step_dynamic_simulation(model, i * RECORD_DT, snapshot, RECORD_DT, new Point2(0, 0));
  return {
    driverAlpha: snapshot_angle_acceleration(snapshot!, DRIVER) ?? 0,
    idlerVelocity: snapshot_angle_velocity(snapshot!, IDLER) ?? 0,
  };
}

describe("inertie d'un train d'engrenages en dynamique", () => {
  it("un pignon massif freine la roue menante selon le rapport", () => {
    const ratio = DRIVER_RADIUS / IDLER_RADIUS;
    const reflected = gear_inertia(1, DRIVER_RADIUS) + gear_inertia(1, IDLER_RADIUS) * ratio * ratio;
    const { driverAlpha } = run_train(1, 1);
    // Clockwise moment, negative in the solver's raw angle convention.
    expect(driverAlpha / (-TORQUE / reflected)).toBeCloseTo(1, 2);
  });

  it("un pignon sans masse ne freine pas la roue menante", () => {
    const { driverAlpha } = run_train(1, 0);
    expect(driverAlpha / (-TORQUE / gear_inertia(1, DRIVER_RADIUS))).toBeCloseTo(1, 2);
  });

  it("une roue menante sans masse entraîne un pignon massif", () => {
    const { idlerVelocity } = run_train(0, 1);
    expect(Math.abs(idlerVelocity)).toBeGreaterThan(1e-4);
  });
});
