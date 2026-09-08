import { describe, expect, it } from "vitest";
import cantileverJson from "../../../../test-mechanisms/Double Cantilever.slidep?raw";
import trussJson from "../../../../test-mechanisms/Masse suspendue.slidep?raw";
import { ID, Point2 } from "../../../types";
import { DynamicSnapshot } from "../../../types/runtime-state";
import { load_mechanism } from "../../../utils/load-mechanism";
import { resolve_load_forces } from "../dynamics/load-model";
import {
  RECORD_DT,
  compile_simulation_model,
  step_dynamic_simulation,
} from "../dynamics/simulation-engine";
import { snapshot_acceleration, snapshot_point, snapshot_velocity } from "../snapshot";
import { StaticsSolution, solve_statics } from "../statics/equilibrium-solve";
import { statics_frame } from "../statics/statics-frame";

/**
 * The statics pass against answers computed by hand — see docs/plan-efforts-interieurs.md phase 10.
 * Nothing here reads a solver reaction: the point of these two cases is that the readings which DO (`BeamCohesion`) get them wrong, each in its own way, and that neither failure survives solving equilibrium instead.
 */
const GRAVITY = new Point2(0, -9.81);
const ZERO = new Point2(0, 0);

function solved(json: string, frames: number) {
  const mechanism = load_mechanism(JSON.parse(json)).mechanism;
  const model = compile_simulation_model(mechanism, true);
  let snapshot: DynamicSnapshot | null = null;
  for (let i = 0; i < frames; i++)
    snapshot = step_dynamic_simulation(model, i * RECORD_DT, snapshot, RECORD_DT, GRAVITY);

  // The engine's own layout rather than a second one built here: neither case carries a gear, and rebuilding it would only invite the two to drift apart.
  const system = model.staticsSystem;

  const positions = new Map<string, Point2>();
  for (const spec of model.beamCohesionSpecs)
    for (const key of [spec.k0, spec.k1, ...spec.attachedNodes.map((n) => n.nodeKey)])
      for (const part of key.split(",")) {
        const p = snapshot_point(snapshot!, part);
        if (p) {
          positions.set(key, p);
          break;
        }
      }
  const loads = resolve_load_forces(model.compiledLoads, positions);

  const at = snapshot!;
  const unfused = <T,>(key: string, read: (part: string) => T | undefined) => {
    for (const part of key.split(",")) {
      const value = read(part);
      if (value !== undefined) return value;
    }
    return undefined;
  };
  const frame = statics_frame({
    gravity: GRAVITY,
    positionOf: (key) => unfused(key, (part) => snapshot_point(at, part)),
    velocityOf: (key) => unfused(key, (part) => snapshot_velocity(at, part)) ?? ZERO,
    accelerationOf: (key) => unfused(key, (part) => snapshot_acceleration(at, part)) ?? ZERO,
    externalForceAt: (key) => loads.forces.get(key) ?? ZERO,
    distributedShareAt: (key) => loads.distributed.get(key) ?? ZERO,
    angularAccelerationOf: () => 0, // no gear in either case
    masses: model.dynamicMasses,
    gears: system.gears,
    specs: model.beamCohesionSpecs,
    loads: model.compiledLoads,
    beams: model.staticsBeams,
  });
  return {
    mechanism,
    snapshot: snapshot!,
    solution: solve_statics(system, model.beamCohesionSpecs, frame)!,
  };
}

const cache = new Map<string, ReturnType<typeof solved>>();
function once(json: string, frames: number) {
  const hit = cache.get(json);
  if (hit) return hit;
  const fresh = solved(json, frames);
  cache.set(json, fresh);
  return fresh;
}

const relative = (value: number, reference: number) => Math.abs(value / reference - 1);

/** `N` at the beam's own start: `R_coh(0⁺)·x̂`, the torsor the beam applies at its first node. */
function axial(run: ReturnType<typeof solved>, beamID: ID): number {
  const torsor = run.solution.torsors.find((t) => t.beamID === beamID && t.s === 0)!;
  const p0 = snapshot_point(run.snapshot, `${beamID}:start`)!;
  const p1 = snapshot_point(run.snapshot, `${beamID}:end`)!;
  const xhat = p1.sub(p0).normalize();
  return torsor.fx * xhat.x + torsor.fy * xhat.y;
}

function support(solution: StaticsSolution) {
  return solution.torsors.filter((t) => t.beamID === undefined && !t.foreign);
}

describe("statique d'un cantilever soudé en deux tronçons", () => {
  // 10 N at the tip over 15.402 N of self-weight per half.
  // Statics answers the root exactly: 40.804 N and 25.402 N·m, and the mid-span moment is 8.850 N·m.
  it("l'encastrement vaut le calcul, au chiffre près", () => {
    const { solution } = once(cantileverJson, 400);
    expect(solution.indeterminacy).toBe(0);
    expect(solution.residual).toBeLessThan(1e-6 * solution.scale);

    const anchors = support(solution);
    expect(anchors).toHaveLength(1);
    expect(relative(anchors[0].fy, 40.804)).toBeLessThan(0.01);
    expect(relative(anchors[0].m, 25.402)).toBeLessThan(0.01);
  }, 30_000);

  it("la soudure entre deux poutres mobiles est action-réaction", () => {
    // What the reaction reading cannot do: the `Angle` link of a `join` names both beams' endpoints, so both claim it and both count its whole contribution.
    // Solving equilibrium never asks who owns it — the joint's own balance settles it.
    const { solution } = once(cantileverJson, 400);
    const weld = solution.torsors.filter(
      (t) => t.beamID !== undefined && support(solution).every((a) => a.nodeKey !== t.nodeKey),
    );
    const shared = weld.filter(
      (t) => weld.filter((other) => other.nodeKey === t.nodeKey).length === 2,
    );
    expect(shared).toHaveLength(2);
    expect(shared[0].fx + shared[1].fx).toBeCloseTo(0, 9);
    expect(shared[0].fy + shared[1].fy).toBeCloseTo(0, 9);
    expect(shared[0].m + shared[1].m).toBeCloseTo(0, 9);
    // And the couple it passes is the beam's own bending moment there, not zero — which is what the reaction reading loses entirely.
    expect(relative(Math.abs(shared[0].m), 8.85)).toBeLessThan(0.01);
  }, 30_000);
});

describe("statique d'un treillis chargé", () => {
  // Hand-computed, beams' 17.5 kg neglected against the 49.05 kN load:
  //   Epan +114.5   Iqla +34.3   Uslu −59.8   Lukn −119.5   Dode +49.05 kN
  //   Dicu −114.5 kN vertical   Uqin +163.5 kN vertical
  it("chaque barre lit son effort normal", () => {
    const run = once(trussJson, 600);
    expect(run.solution.indeterminacy).toBe(0);

    const beams = run.mechanism.mechanicalElements.filter((e) => e.type === "beam");
    const readings = beams.map((b) => axial(run, b.id)).sort((a, b) => a - b);
    const expected = [-119_500, -59_800, 34_300, 49_050, 114_500];
    expect(readings).toHaveLength(expected.length);
    // 1 % covers the pendulum still swinging and the self-weight the reference drops.
    for (let i = 0; i < expected.length; i++)
      expect(relative(readings[i], expected[i])).toBeLessThan(0.01);
  }, 30_000);

  it("les réactions d'appui bouclent sur la statique", () => {
    const { solution } = once(trussJson, 600);
    const vertical = support(solution)
      .map((t) => t.fy)
      .sort((a, b) => a - b);
    // A support torsor is what the FRAME applies onto its node, so it reads as the classical support reaction directly: `Dicu` pushes down, `Uqin` up.
    expect(vertical).toHaveLength(2);
    expect(relative(vertical[0], -114_500)).toBeLessThan(0.01);
    expect(relative(vertical[1], 163_500)).toBeLessThan(0.01);
  }, 30_000);

  it("rend un résidu, et il est petit devant les efforts", () => {
    // Not zero: the suspended mass is still swinging, so the frame is not in equilibrium and the d'Alembert terms do not close exactly.
    // Reported rather than hidden.
    const { solution } = once(trussJson, 600);
    expect(solution.residual / solution.scale).toBeLessThan(1e-3);
  }, 30_000);
});
