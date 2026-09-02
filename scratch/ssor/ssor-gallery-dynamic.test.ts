import { describe, it } from "vitest";
import { appendFileSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { load_mechanism } from "../../src/utils/load-mechanism";
import { Mechanism, Point2 } from "../../src/types";
import type { ID } from "../../src/types/element";
import { DynamicSnapshot } from "../../src/types/runtime-state";
import {
  RECORD_DT,
  compile_simulation_model,
  step_dynamic_simulation,
} from "../../src/components/solver/dynamics/simulation-engine";
import { snapshot_point } from "../../src/components/solver/snapshot";

/**
 * The whole gallery in DYNAMIC mode, judged on the GLOBAL geometric error rather than on one
 * chosen constraint — the mistake that let alternation look like a fix for five passes when
 * it was only moving the error from a `FixedOnSegment` into the `Distance` next to it.
 *
 * Worst over the run of: a beam's own length error, and a rigidly attached node's distance
 * from where it belongs on its beam. Both in metres, and also as a share of the mechanism's
 * own extent so a 3 cm mechanism and a 60 cm one are judged alike.
 */
const GRAVITY = new Point2(0, -9.81);
const first = (k: string): ID => k.split(",")[0] as ID;

function worst(mech: Mechanism, frames: number): { abs: number; rel: number } {
  const model = compile_simulation_model(mech);
  const at = (s: DynamicSnapshot, k: string) => snapshot_point(s, first(k));
  let snap: DynamicSnapshot | null = null;
  let abs = 0;
  for (let i = 0; i < frames; i++) {
    snap = step_dynamic_simulation(model, i * RECORD_DT, snap, RECORD_DT, GRAVITY);
    for (const link of model.links) {
      if (link.type === "Distance") {
        const a = at(snap, link.key1);
        const b = at(snap, link.key2);
        if (!a || !b) continue;
        abs = Math.max(abs, Math.abs(a.distance_to(b) - link.distance));
      } else if (link.type === "FixedOnSegment") {
        const s = at(snap, link.key1);
        const e = at(snap, link.key2);
        const n = at(snap, link.key3);
        if (!s || !e || !n) continue;
        abs = Math.max(abs, n.distance_to(s.lerp(e, link.t)));
      }
    }
  }
  return { abs, rel: abs / (model.extent || 1) };
}

describe("gallery, dynamic mode", () => {
  it("worst geometric error", () => {
    const dir = resolve(__dirname, "../../test-mechanisms");
    const lines = [
      `### galerie en DYNAMIQUE — pire erreur géométrique — alternance=${process.env.SLIDEP_ALT ?? "on"}`,
    ];
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".slidep"))) {
      // Huygens and its kin blow up in dynamic mode for reasons of their own (see the doc's
      // dedicated defect section); their numbers say nothing about sweep order.
      if (/Huygen|Poulie|Déconnexion|Core XY|joint de courroie/.test(file)) continue;
      try {
        const mech = load_mechanism(
          JSON.parse(readFileSync(resolve(dir, file), "utf8")),
        ).mechanism;
        const { abs, rel } = worst(mech, 40);
        lines.push(
          `${file}\tabs=${abs.toExponential(3)}\trel=${(100 * rel).toFixed(4)} %`,
        );
      } catch (e) {
        lines.push(`${file}\tERREUR ${(e as Error).message.slice(0, 50)}`);
      }
    }
    appendFileSync(process.env.SSOR_OUT!, lines.join("\n") + "\n", "utf8");
  }, 900_000);
});
