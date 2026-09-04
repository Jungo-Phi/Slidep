import { describe, it } from "vitest";
import { writeFileSync } from "node:fs";
import { Point2 } from "../../src/types";
import type { BeamElement, ID } from "../../src/types/element";
import { DynamicSnapshot } from "../../src/types/runtime-state";
import { DEFAULT_METADATA, DEFAULT_SIMULATION, Mechanism } from "../../src/types/mechanism";
import type { MaterialDef, ProfileDef } from "../../src/types/material";
import {
  RECORD_DT, compile_simulation_model, step_dynamic_simulation,
} from "../../src/components/solver/dynamics/simulation-engine";
import { compute_cohesion_field } from "../../src/components/solver/recording/cohesion-field";

describe("poutre en rotation libre", () => {
  const NL = String.fromCharCode(10);
  it("profil de N", async () => {
    const BEAM = "b" as ID;
    const materials: MaterialDef[] = [{ id: "m" as ID, name: "t", E: 1, Re: 1, rho: 1 }];
    const profiles: ProfileDef[] = [{ id: "p" as ID, name: "t", shape: { kind: "rect", b: 1, h: 1 } }];
    const beam = {
      type: "beam", id: BEAM, probes: [], overlays: {},
      positionStart: new Point2(-0.5, 0), positionEnd: new Point2(0.5, 0),
      fixedNodesBodyIDs: [], materialID: "m", profileID: "p",
    } as unknown as BeamElement;
    const mech: Mechanism = {
      metadata: DEFAULT_METADATA, viewport: { scale: 1, pan: new Point2(0, 0) },
      simulation: DEFAULT_SIMULATION, mechanicalElements: [beam], constraintElements: [],
      loads: [], materials, profiles, history: [], future: [],
    };
    const model = compile_simulation_model(mech, true);
    const atRest = step_dynamic_simulation(model, 0, null, RECORD_DT, new Point2(0, 0));
    const velocities = new Float64Array(atRest.velocities);
    const setV = (key: string, v: Point2) => {
      const slot = model.layout.index.get(key)!;
      velocities[2 * slot] = v.x; velocities[2 * slot + 1] = v.y;
    };
    setV(`${BEAM}:start`, new Point2(-0.5, 0).perp().mul(2));
    setV(`${BEAM}:end`, new Point2(0.5, 0).perp().mul(2));
    let snapshot: DynamicSnapshot = { ...atRest, velocities };
    for (let i = 0; i < 10; i++)
      snapshot = step_dynamic_simulation(model, (i + 1) * RECORD_DT, snapshot, RECORD_DT, new Point2(0, 0));
    // Rebuild the same system by hand to look inside it.
    const { build_statics_system } = await import("../../src/components/solver/statics/equilibrium-model");
    const { solve_statics } = await import("../../src/components/solver/statics/equilibrium-solve");
    const { statics_frame } = await import("../../src/components/solver/statics/statics-frame");
    const { snapshot_point, snapshot_velocity, snapshot_acceleration } = await import("../../src/components/solver/snapshot");
    const ZERO = new Point2(0, 0);
    const uf = <T,>(k: string, r: (p: string) => T | undefined) => {
      for (const part of k.split(",")) { const v = r(part); if (v !== undefined) return v; }
      return undefined;
    };
    const sys = build_statics_system(model.beamCohesionSpecs, model.links, mech.mechanicalElements,
      (k) => (model.dynamicMasses.posMasses.get(k) ?? 1) <= 0);
    const fr = statics_frame({
      gravity: ZERO,
      positionOf: (k) => uf(k, (p) => snapshot_point(snapshot, p)),
      velocityOf: (k) => uf(k, (p) => snapshot_velocity(snapshot, p)) ?? ZERO,
      accelerationOf: (k) => uf(k, (p) => snapshot_acceleration(snapshot, p)) ?? ZERO,
      externalForceAt: () => ZERO, distributedShareAt: () => ZERO,
      masses: model.dynamicMasses, specs: model.beamCohesionSpecs,
      loads: model.compiledLoads, beams: model.staticsBeams,
    });
    const sol = solve_statics(sys, model.beamCohesionSpecs, fr)!;
    const spec = model.beamCohesionSpecs[0];
    const lines = [
      `interfaces=${sys.interfaces.length} colonnes=${sys.columns} lignes=${sys.rows} h=${sol.indeterminacy} residu=${sol.residual.toExponential(3)} echelle=${sol.scale.toExponential(3)}`,
      `nodeMass(k0)=${fr.nodeMassAt(spec.k0).toExponential(3)} nodeMass(k1)=${fr.nodeMassAt(spec.k1).toExponential(3)} beamMass=${fr.beamMass(spec.beamID).toExponential(3)} spec.mass=${spec.mass.toExponential(3)}`,
      `accel(k0)=${fr.accelerationOf(spec.k0).x.toExponential(3)},${fr.accelerationOf(spec.k0).y.toExponential(3)}  accel(k1)=${fr.accelerationOf(spec.k1).x.toExponential(3)},${fr.accelerationOf(spec.k1).y.toExponential(3)}`,
      ...sol.torsors.map((t) => `  ${t.beamID ? "poutre" : "APPUI "} s=${Number.isNaN(t.s) ? "-" : t.s.toFixed(3)} node=${t.nodeKey.slice(0, 20)} F=(${t.fx.toExponential(3)},${t.fy.toExponential(3)}) M=${t.m.toExponential(3)} det=${t.determined.fx}${t.determined.fy}${t.determined.m} foreign=${t.foreign}`),
    ];
    const c = snapshot.beamCohesion!.find((x) => x.beamID === BEAM)!;
    const f = compute_cohesion_field(beam, materials, profiles, c, [], snapshot, new Point2(0, 0))!;
    const N = f.samples.map((s) => s.N);
    writeFileSync("scratch/statics/spin.txt", lines.join(NL) + NL +
      `start=(${c.start.fx.toExponential(3)}, ${c.start.fy.toExponential(3)}, m=${c.start.m.toExponential(3)})\n` +
      `end=(${c.end.fx.toExponential(3)}, ${c.end.fy.toExponential(3)}, m=${c.end.m.toExponential(3)})\n` +
      `determinate=${c.determinate}\n` +
      `N: min=${Math.min(...N).toExponential(3)} max=${Math.max(...N).toExponential(3)}  ` +
      `extremum s=${f.extremum.N.s.toFixed(3)} v=${f.extremum.N.value.toExponential(3)}\n` +
      `|min|/max = ${(Math.abs(Math.min(...N)) / Math.max(...N)).toExponential(2)}\n` +
      `T max=${Math.max(...f.samples.map((s) => Math.abs(s.T))).toExponential(3)}  Mf max=${Math.max(...f.samples.map((s) => Math.abs(s.Mf))).toExponential(3)}\n`);
  }, 60000);
});
