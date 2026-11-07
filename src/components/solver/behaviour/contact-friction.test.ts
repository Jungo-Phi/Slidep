import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_METADATA, DEFAULT_SIMULATION, Mechanism } from "../../../types/mechanism";
import { Point2 } from "../../../types/point2";
import { GRAVITY } from "../../../constants/physics-specs";
import type { GearElement, ID, MassElement, MechanicalElement, PivotElement } from "../../../types/element";
import { RECORD_DT, compile_simulation_model, step_dynamic_simulation } from "../dynamics/simulation-engine";
import { DynamicSnapshot } from "../../../types/runtime-state";
import { snapshot_angle_velocity, snapshot_point, snapshot_velocity } from "../snapshot";

/** End-to-end: Coulomb friction between the floor, tilted by `SLOPE`, and a block or a wheel left on it at rest. */

let nextID = 0;
const id = (): ID => `00000000-0000-0000-0000-${String(++nextID).padStart(12, "0")}` as ID;

const SLOPE = (20 * Math.PI) / 180;
const g = GRAVITY.length();
/** The floor's normal, into free space. */
const NORMAL = new Point2(0, 1).rotate(SLOPE);
const SECONDS = 1;
const FRAMES = Math.round(SECONDS / RECORD_DT);

/** Far from the floor, only there to give the mechanism a metre-scale extent. */
const marker = (): PivotElement => ({
  type: "pivot", id: id(), probes: [], overlays: {}, position: new Point2(1, 2), isGrounded: true,
  rotatingEdgesIDs: [], fixedGearsIDs: [], rotationalFriction: 0,
});

function mechanism(elements: MechanicalElement[], staticMu: number, dynamicMu: number): Mechanism {
  return {
    metadata: DEFAULT_METADATA,
    viewport: { scale: 1, pan: new Point2(0, 0) },
    simulation: {
      ...DEFAULT_SIMULATION,
      floor: { enabled: true, height: 0, angle: SLOPE },
      // Inelastic: the parts are let down from just above the floor, and a bounce would carry them down the slope in the air.
      restitution: 0,
      contactFriction: { static: staticMu, dynamic: dynamicMu },
    },
    mechanicalElements: [marker(), ...elements],
    constraintElements: [],
    loads: [],
    materials: [],
    profiles: [],
    history: [],
    future: [],
  };
}

/** Whether the run solves its links directly or leaves them to the sweep, which a mechanism with a belt does. */
let directSolve = true;

/** Every frame over `SECONDS`, the floor on. */
function run(mech: Mechanism): DynamicSnapshot[] {
  const model = compile_simulation_model(mech, true, true);
  model.directSolve = directSolve;
  const frames: DynamicSnapshot[] = [];
  for (let i = 0; i < FRAMES; i++)
    frames.push(
      step_dynamic_simulation(
        model, i * RECORD_DT, frames[frames.length - 1] ?? null, RECORD_DT, GRAVITY,
        undefined, undefined, undefined, false, true,
      ),
    );
  return frames;
}

/** How far a block let down onto the slope travels along it, from frame `from` to the last. */
function block_travel(staticMu: number, dynamicMu: number, from: number = 0): number {
  const BLOCK = id();
  const start = NORMAL.mul(0.01);
  const block: MassElement = {
    type: "mass", id: BLOCK, probes: [], overlays: {}, position: start, isGrounded: false,
    fixedEdgesIDs: [], mass: 1,
  };
  const frames = run(mechanism([block], staticMu, dynamicMu));
  const origin = from === 0 ? start : snapshot_point(frames[from], BLOCK)!;
  return Math.abs(snapshot_point(frames[frames.length - 1], BLOCK)!.sub(origin).dot(NORMAL.perp()));
}

describe.each([
  ["solve direct", true],
  ["balayage", false],
])("frottement aux contacts (%s)", (_, direct) => {
  beforeEach(() => {
    directSolve = direct;
  });

  it("sans frottement, un bloc glisse comme en chute libre le long de la pente", () => {
    const expected = 0.5 * g * Math.sin(SLOPE) * SECONDS * SECONDS;
    expect(block_travel(0, 0)).toBeCloseTo(expected, 1);
  });

  it("un frottement statique supérieur à tan(pente) retient le bloc", () => {
    expect(Math.tan(SLOPE)).toBeLessThan(0.5);
    // From half-way: falling straight down onto a tilted floor shifts the block along it on its own.
    expect(block_travel(0.5, 0.4, FRAMES / 2)).toBeLessThan(1e-5);
  });

  it("un frottement dynamique inférieur à tan(pente) le freine sans l'arrêter", () => {
    const mu = 0.2;
    const expected = 0.5 * g * (Math.sin(SLOPE) - mu * Math.cos(SLOPE)) * SECONDS * SECONDS;
    const travel = block_travel(mu, mu);
    expect(travel).toBeGreaterThan(0.9 * expected);
    expect(travel).toBeLessThan(1.1 * expected);
  });

  it("une roue adhérente roule sans glisser, avec l'accélération d'un disque plein", () => {
    const GEAR = id();
    const AXLE = id();
    const RADIUS = 0.1;
    const center = NORMAL.mul(RADIUS + 0.01);
    const axle: PivotElement = {
      type: "pivot", id: AXLE, probes: [], overlays: {}, position: center, isGrounded: false,
      rotatingEdgesIDs: [], fixedGearsIDs: [GEAR], rotationalFriction: 0,
    };
    const wheel: GearElement = {
      type: "gear", id: GEAR, probes: [], overlays: {}, position: center, angle: 0, radius: RADIUS,
      parentAxleID: AXLE, fixedNodesBodyIDs: [], meshedGearsIDs: [], surfaceMass: 10,
    };
    const frames = run(mechanism([axle, wheel], 0.5, 0.4));
    const snapshot = frames[frames.length - 1];

    const travel = snapshot_point(snapshot, AXLE)!.sub(center).length();
    // A uniform disc rolling: `a = (2/3)·g·sin(slope)`.
    const expected = 0.5 * (2 / 3) * g * Math.sin(SLOPE) * SECONDS * SECONDS;
    expect(travel).toBeGreaterThan(0.85 * expected);
    expect(travel).toBeLessThan(1.15 * expected);

    // Rolling without slipping: the rim's speed at the contact matches the centre's.
    const speed = snapshot_velocity(snapshot, AXLE)!.length();
    const rim = Math.abs(snapshot_angle_velocity(snapshot, GEAR)!) * RADIUS;
    expect(rim).toBeGreaterThan(0.95 * speed);
    expect(rim).toBeLessThan(1.05 * speed);
  });
});
