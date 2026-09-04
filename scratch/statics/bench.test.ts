import { describe, it } from "vitest";
import { appendFileSync, writeFileSync, readdirSync, readFileSync } from "node:fs";
const OUT = "scratch/statics/bench.txt";
const LOG = (s: string) => appendFileSync(OUT, s + String.fromCharCode(10));
import { Point2 } from "../../src/types";
import { DynamicSnapshot } from "../../src/types/runtime-state";
import { load_mechanism } from "../../src/utils/load-mechanism";
import {
  RECORD_DT, compile_simulation_model, step_dynamic_simulation,
} from "../../src/components/solver/dynamics/simulation-engine";
import { resolve_load_forces } from "../../src/components/solver/dynamics/load-model";
import { build_statics_system } from "../../src/components/solver/statics/equilibrium-model";
import { solve_statics } from "../../src/components/solver/statics/equilibrium-solve";
import { build_flexibility } from "../../src/components/solver/statics/flexibility";
import { statics_frame } from "../../src/components/solver/statics/statics-frame";
import { snapshot_point } from "../../src/components/solver/snapshot";

const G = new Point2(0, -9.81);
const ZERO = new Point2(0, 0);

describe("cout de la passe de statique", () => {
  it("sur toute la galerie", () => {
    writeFileSync(OUT, "");
    LOG("mecanisme                        poutres  inconnues x lignes   h   assemblage+solve   +flexibilite");
    for (const file of readdirSync("test-mechanisms").filter((f) => f.endsWith(".slidep")).sort()) {
      let line = file.replace(".slidep", "").padEnd(34);
      try {
        const mechanism = load_mechanism(JSON.parse(readFileSync(`test-mechanisms/${file}`, "utf8"))).mechanism;
        const model = compile_simulation_model(mechanism, true);
        if (model.beamCohesionSpecs.length === 0) { LOG(line + "  (pas de poutre)"); continue; }
        let snapshot: DynamicSnapshot | null = null;
        for (let i = 0; i < 30; i++)
          snapshot = step_dynamic_simulation(model, i * RECORD_DT, snapshot, RECORD_DT, G);
        const system = build_statics_system(
          model.beamCohesionSpecs, model.links, mechanism.mechanicalElements,
          (k) => (model.dynamicMasses.posMasses.get(k) ?? 1) <= 0,
        );
        const positions = new Map<string, Point2>();
        for (const spec of model.beamCohesionSpecs)
          for (const k of [spec.k0, spec.k1, ...spec.attachedNodes.map((n) => n.nodeKey)])
            for (const part of k.split(",")) {
              const p = snapshot_point(snapshot!, part);
              if (p) { positions.set(k, p); break; }
            }
        const loads = resolve_load_forces(model.compiledLoads, positions);
        const frame = statics_frame(
          mechanism, model.beamCohesionSpecs, model.dynamicMasses, snapshot!, G,
          (k) => loads.forces.get(k) ?? ZERO, (k) => loads.distributed.get(k) ?? ZERO,
        );

        const N = 20;
        let t0 = performance.now();
        let sol;
        for (let i = 0; i < N; i++) sol = solve_statics(system, model.beamCohesionSpecs, frame);
        const bare = (performance.now() - t0) / N;
        t0 = performance.now();
        for (let i = 0; i < N; i++) {
          const f = build_flexibility(system, model.beamCohesionSpecs, frame);
          solve_statics(system, model.beamCohesionSpecs, frame, f);
        }
        const withF = (performance.now() - t0) / N;
        line += `${String(model.beamCohesionSpecs.length).padStart(6)}  ${String(system.columns).padStart(6)} x ${String(system.rows).padStart(5)}  ${String(sol!.indeterminacy).padStart(3)}   ${bare.toFixed(2).padStart(9)} ms  ${withF.toFixed(2).padStart(9)} ms`;
        LOG(line);
      } catch (e) {
        LOG(line + "  ERREUR " + String(e).slice(0, 80));
      }
    }
  }, 600_000);
});
