import { describe, it } from "vitest";
import { appendFileSync, writeFileSync } from "node:fs";
const OUT = "scratch/statics/out6.txt";
const LOG = (s: string) => appendFileSync(OUT, s + String.fromCharCode(10));
import trussRaw from "../../test-mechanisms/Masse suspendue.slidep?raw";
import dcRaw from "../../test-mechanisms/Double Cantilever.slidep?raw";
import { Point2 } from "../../src/types";
import { DynamicSnapshot } from "../../src/types/runtime-state";
import { load_mechanism } from "../../src/utils/load-mechanism";
import { shown_element_name } from "../../src/utils/string-math";
import {
  RECORD_DT,
  compile_simulation_model,
  step_dynamic_simulation,
} from "../../src/components/solver/dynamics/simulation-engine";
import { resolve_node_balance } from "../../src/components/solver/dynamics/node-balance";
import { resolve_load_forces } from "../../src/components/solver/dynamics/load-model";
import { snapshot_acceleration, snapshot_point } from "../../src/components/solver/snapshot";

const ZERO = new Point2(0, 0);

function unfused<T>(key: string, read: (part: string) => T | undefined): T | undefined {
  for (const part of key.split(",")) {
    const v = read(part);
    if (v !== undefined) return v;
  }
  return undefined;
}

function run(raw: string, frames: number, label: string) {
  const mechanism = load_mechanism(JSON.parse(raw)).mechanism;
  const names = new Map(mechanism.mechanicalElements.map((e) => [e.id, shown_element_name(e)]));
  const model = compile_simulation_model(mechanism, true);
  let snapshot: DynamicSnapshot | null = null;
  for (let i = 0; i < frames; i++)
    snapshot = step_dynamic_simulation(model, i * RECORD_DT, snapshot, RECORD_DT, new Point2(0, -9.81));

  const positions = new Map<string, Point2>();
  for (const s of model.beamCohesionSpecs)
    for (const k of [s.k0, s.k1, ...s.attachedNodes.map((n) => n.nodeKey)]) {
      const p = unfused(k, (part) => snapshot_point(snapshot!, part));
      if (p) positions.set(k, p);
    }
  const loadForces = resolve_load_forces(model.compiledLoads, positions).forces;

  const balances = resolve_node_balance(
    model.beamCohesionSpecs,
    snapshot!.beamCohesion ?? [],
    model.links,
    model.dynamicMasses,
    new Point2(0, -9.81),
    (key) => unfused(key, (part) => snapshot_acceleration(snapshot!, part)) ?? ZERO,
    (key) => loadForces.get(key) ?? ZERO,
  );

  LOG(`\n===== ${label} =====`);
  for (const b of balances) {
    const label = b.key
      .split(",")
      .map((p) => names.get(p.replace(/:(start|end|mid)$/, "")) ?? p.slice(0, 6))
      .join(" + ");
    LOG(
      `${label.slice(0, 46).padEnd(48)} anchor=${String(b.atAnchor).padEnd(5)} cov=${String(b.covered).padEnd(5)} ` +
        `residu=(${b.residual.x.toFixed(2)}, ${b.residual.y.toFixed(2)}) |r|/echelle=${(b.scale > 0 ? b.residual.length() / b.scale : 0).toFixed(4)} ` +
        `momentResidu=${b.momentResidual.toFixed(3)} ` +
        (b.reaction ? `reaction=(${b.reaction.x.toFixed(2)}, ${b.reaction.y.toFixed(2)}) Mr=${b.reactionMoment!.toFixed(3)}` : ""),
    );
  }
}

describe("bilan aux noeuds", () => {
  it("mesure", () => {
    writeFileSync(OUT, "");
    run(dcRaw, 400, "Double Cantilever");
    run(trussRaw, 600, "Masse suspendue");
  }, 240000);
});
