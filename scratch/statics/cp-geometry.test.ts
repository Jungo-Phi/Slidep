import { describe, it } from "vitest";
import { writeFileSync, readFileSync } from "node:fs";
import { Point2 } from "../../src/types";
import { DynamicSnapshot } from "../../src/types/runtime-state";
import { load_mechanism } from "../../src/utils/load-mechanism";
import {
  RECORD_DT, compile_simulation_model, step_dynamic_simulation,
} from "../../src/components/solver/dynamics/simulation-engine";
import { snapshot_point } from "../../src/components/solver/snapshot";

const G = new Point2(0, -9.81);
const NL = String.fromCharCode(10);

describe("CP — geometrie", () => {
  it("allongement et glissement", () => {
    const mechanism = load_mechanism(JSON.parse(readFileSync("test-mechanisms/CP.slidep", "utf8"))).mechanism;
    const beams = mechanism.mechanicalElements.filter((e) => e.type === "beam");
    const nodes = mechanism.mechanicalElements.filter((e) => "position" in e && e.type !== "beam");
    const model = compile_simulation_model(mechanism, true);
    const extent = Math.max(
      ...beams.map((b) => b.positionEnd.distance_to(b.positionStart)), 1e-9);

    let snapshot: DynamicSnapshot | null = null;
    const lines: string[] = [`envergure de reference = ${extent.toFixed(5)} m`];
    for (const frames of [30, 200, 600]) {
      while ((snapshot?.t ?? -1) < (frames - 1) * RECORD_DT) {
        const i = snapshot ? Math.round(snapshot.t / RECORD_DT) + 1 : 0;
        snapshot = step_dynamic_simulation(model, i * RECORD_DT, snapshot, RECORD_DT, G);
      }
      lines.push(`--- image ${frames}`);
      for (const b of beams) {
        if (b.type !== "beam") continue;
        const p0 = snapshot_point(snapshot!, `${b.id}:start`)!;
        const p1 = snapshot_point(snapshot!, `${b.id}:end`)!;
        const rest = b.positionEnd.distance_to(b.positionStart);
        const now = p1.distance_to(p0);
        lines.push(`  poutre ${b.id.slice(0, 6)} : repos=${rest.toFixed(5)} actuel=${now.toFixed(5)} ` +
          `allongement=${(((now - rest) / rest) * 100).toFixed(3)} % = ${(((now - rest) / extent) * 100).toFixed(3)} % de l'envergure`);
      }
      for (const n of nodes) {
        if (!("position" in n)) continue;
        const p = snapshot_point(snapshot!, n.id);
        if (!p) continue;
        // Distance from the node to the nearest beam segment: a node welded or sliding on a
        // beam should stay exactly on it.
        let off = Infinity;
        for (const b of beams) {
          if (b.type !== "beam") continue;
          const p0 = snapshot_point(snapshot!, `${b.id}:start`)!;
          const p1 = snapshot_point(snapshot!, `${b.id}:end`)!;
          const t = Math.max(0, Math.min(1, p.parameter_on_segment(p0, p1)));
          off = Math.min(off, p.distance_to(p0.lerp(p1, t)));
        }
        lines.push(`  ${n.type} ${n.id.slice(0, 6)} : ecart a la poutre = ${off.toExponential(3)} m = ${((off / extent) * 100).toFixed(3)} % de l'envergure`);
      }
    }
    writeFileSync("scratch/statics/cp.txt", lines.join(NL) + NL);
  }, 300_000);
});
