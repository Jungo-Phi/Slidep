import { describe, expect, it } from "vitest";
import { Point2 } from "../../../types";
import { DEFAULT_METADATA, DEFAULT_SIMULATION, Mechanism } from "../../../types/mechanism";
import type { ID, MechanicalElement } from "../../../types/element";
import type { DynamicSnapshot } from "../../../types/runtime-state";
import { RECORD_DT, compile_simulation_model, step_dynamic_simulation } from "../dynamics/simulation-engine";
import { dead_points } from "../kinematics/dead-points";
import { snapshot_velocity } from "../snapshot";
import { GRAVITY } from "../../../constants/physics-specs";

/**
 * A motor as a torque-limited speed drive: it holds its commanded speed whatever it drives, until the torque that takes exceeds its limit — then it supplies the limit and the load sets the speed.
 * The rig is a 1 m arm on a grounded motorised pivot carrying a mass at its tip, starting horizontal; without gravity the motor is the only thing turning it.
 */
const M = 10;
const ZERO = new Point2(0, 0);

let nextID = 0;
const id = (): ID => `00000000-0000-0000-0000-${String(++nextID).padStart(12, "0")}` as ID;

function spin(speed: number, torque: number, frames: number, gravity: Point2 = ZERO) {
  const MATERIAL = id();
  const PROFILE = id();
  const ARM = id();
  const PIVOT = id();
  const MASS = id();
  const base = { probes: [], overlays: {} };
  const elements: MechanicalElement[] = [
    { ...base, type: "pivot", id: PIVOT, position: ZERO, isGrounded: true, rotatingEdgesIDs: [ARM], fixedGearsIDs: [], rotationalFriction: 0, motor: { speed, torque } },
    { ...base, type: "beam", id: ARM, positionStart: ZERO, positionEnd: new Point2(1, 0), fixedNodeStartID: PIVOT, fixedNodeEndID: MASS, fixedNodesBodyIDs: [], materialID: MATERIAL, profileID: PROFILE },
    { ...base, type: "mass", id: MASS, position: new Point2(1, 0), isGrounded: false, fixedEdgesIDs: [ARM], mass: M },
  ];
  const mechanism: Mechanism = {
    metadata: DEFAULT_METADATA,
    viewport: { scale: 1, pan: new Point2(0, 0) },
    simulation: DEFAULT_SIMULATION,
    mechanicalElements: elements,
    constraintElements: [],
    loads: [],
    // Nearly weightless arm, so the tip mass is the whole inertia: `J = M·r²`.
    materials: [{ id: MATERIAL, name: "test", E: 210e9, Re: 235e6, rho: 1e-6 }],
    profiles: [{ id: PROFILE, name: "test", shape: { kind: "rect", b: 1, h: 1 } }],
    history: [],
    future: [],
  };
  const model = compile_simulation_model(mechanism, true);
  let snapshot: DynamicSnapshot | null = null;
  const snapshots: DynamicSnapshot[] = [];
  for (let i = 0; i < frames; i++) {
    snapshot = step_dynamic_simulation(model, i * RECORD_DT, snapshot, RECORD_DT, gravity);
    snapshots.push(snapshot);
  }
  return {
    snapshots,
    saturated: snapshot!.motor![0].saturated,
    stalled: (snapshot!.stalledMotors ?? []).includes(PIVOT),
    // The tip sits 1 m out, so its speed is the arm's angular speed.
    omega: snapshot_velocity(snapshot!, MASS)!.length(),
    torque: Math.abs(snapshot!.motor![0].nm),
  };
}

describe("moteur à couple limité", () => {
  it("tient sa vitesse de consigne quand son couple suffit", () => {
    const { omega, torque } = spin(2, 1000, 30);
    expect(omega).toBeCloseTo(2, 3);
    // At speed nothing resists but the integrator's own drag on a turning body, a torque that would change the speed by under 1 % in a second.
    expect(torque).toBeLessThan(0.01 * omega * M);
  }, 30_000);

  it("saturé, il fournit son couple limite et la charge fixe l'accélération", () => {
    const frames = 120;
    const { omega, torque, saturated, stalled } = spin(10, 1, frames);
    expect(torque).toBeCloseTo(1, 6);
    expect(saturated).toBe(true);
    // Short of its speed but gaining on it, the commanded way.
    expect(stalled).toBe(false);
    // α = τ / (M·r²), constant from rest.
    const expected = (1 / M) * frames * RECORD_DT;
    expect(Math.abs(omega - expected)).toBeLessThan(0.02 * expected);
  }, 30_000);
});

describe("moteur calé sous une charge", () => {
  // The tip weighs `M·g·r` ≈ 98 N·m on the pivot: a 1000 N·m motor carries it, a 10 N·m one does not.
  // The data model turns clockwise for a positive speed, so from horizontal a negative one lifts the tip and a positive one lowers it.
  const FRAMES = 30;

  it("trop faible pour lever la charge, il cale et le rail le marque", () => {
    const { snapshots, saturated, stalled } = spin(-2, 10, FRAMES, GRAVITY);
    expect(saturated).toBe(true);
    expect(stalled).toBe(true);
    expect(dead_points(snapshots).map((p) => p.kind)).toEqual(["blocked"]);
  }, 30_000);

  it("assez fort pour la lever, il suit sa consigne sans rien signaler", () => {
    const { snapshots, saturated, stalled } = spin(-2, 1000, FRAMES, GRAVITY);
    expect(saturated).toBe(false);
    expect(stalled).toBe(false);
    expect(dead_points(snapshots)).toEqual([]);
  }, 30_000);

  it("emporté par la charge qui descend, il freine au maximum sans être calé", () => {
    // The load outruns the command: the motor holds it back with all it has, and the joint still turns the commanded way.
    const { snapshots, saturated, stalled } = spin(2, 10, FRAMES, GRAVITY);
    expect(saturated).toBe(true);
    expect(stalled).toBe(false);
    expect(dead_points(snapshots)).toEqual([]);
  }, 30_000);

  it("à vitesse nulle, il tient la charge si son couple suffit", () => {
    const { snapshots, saturated, stalled } = spin(0, 1000, FRAMES, GRAVITY);
    expect(saturated).toBe(false);
    expect(stalled).toBe(false);
    expect(dead_points(snapshots)).toEqual([]);
  }, 30_000);

  it("à vitesse nulle, il cale dès que la charge le fait glisser", () => {
    const { snapshots, saturated, stalled } = spin(0, 10, FRAMES, GRAVITY);
    expect(saturated).toBe(true);
    expect(stalled).toBe(true);
    expect(dead_points(snapshots).map((p) => p.kind)).toEqual(["blocked"]);
  }, 30_000);
});
