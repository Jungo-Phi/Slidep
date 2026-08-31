import { describe, it } from "vitest";
import { appendFileSync } from "node:fs";
import vilbrequinJson from "../../test-mechanisms/Vilbrequin + masse lourde.slidep?raw";
import { load_mechanism } from "../../src/utils/load-mechanism";
import { Mechanism, Point2 } from "../../src/types";
import type { ID } from "../../src/types/element";
import { DynamicSnapshot } from "../../src/types/runtime-state";
import {
  RECORD_DT,
  compile_simulation_model,
  step_dynamic_simulation,
} from "../../src/components/solver/simulation-engine";
import { snapshot_point } from "../../src/components/solver/snapshot";

/**
 * Does the mass-ratio pathology exist on a LOOP mechanism at all?
 *
 * `CP.slidep` — the only case ever measured — is a tree, and alternating sweep order solves
 * it exactly. If loops are immune, alternation-on-trees is a COMPLETE answer; if they are
 * not, it is half of one and the other half needs a different tool. This probe answers that
 * on a crank-slider (a closed kinematic loop, no belt) carrying a heavy mass on its rod.
 *
 * Metric: the worst geometric error the solver leaves on constraints whose violation can be
 * read straight off the positions — a beam's own length (`Distance`) and a rigidly attached
 * node's place on its beam (`FixedOnSegment`, the very constraint that fails on CP.slidep).
 * Structure-agnostic, and in metres, so it compares directly with `ssor-mass-probe`.
 */
const GRAVITY = new Point2(0, -9.81);

function with_mass(mech: Mechanism, mass: number): Mechanism {
  return {
    ...mech,
    mechanicalElements: mech.mechanicalElements.map((e) =>
      e.type === "mass" ? { ...e, mass } : e,
    ),
  };
}

/** A fused key names several original keys; any of its parts reads the same position. */
const first_part = (key: string): ID => key.split(",")[0] as ID;

function worst_geometric_error(mech: Mechanism, frames: number): number {
  const model = compile_simulation_model(mech);
  const at = (snapshot: DynamicSnapshot, key: string): Point2 | undefined =>
    snapshot_point(snapshot, first_part(key));
  let snapshot: DynamicSnapshot | null = null;
  let worst = 0;
  for (let i = 0; i < frames; i++) {
    snapshot = step_dynamic_simulation(
      model,
      i * RECORD_DT,
      snapshot,
      RECORD_DT,
      GRAVITY,
    );
    for (const link of model.links) {
      if (link.type === "Distance") {
        const a = at(snapshot, link.key1);
        const b = at(snapshot, link.key2);
        if (!a || !b) continue;
        worst = Math.max(worst, Math.abs(a.distance_to(b) - link.distance));
      } else if (link.type === "FixedOnSegment") {
        const s = at(snapshot, link.key1);
        const e = at(snapshot, link.key2);
        const n = at(snapshot, link.key3);
        if (!s || !e || !n) continue;
        worst = Math.max(worst, n.distance_to(s.lerp(e, link.t)));
      }
    }
  }
  return worst;
}

describe("SSOR loop mass-ratio probe", () => {
  it("Vilbrequin + masse lourde", () => {
    const base = load_mechanism(JSON.parse(vilbrequinJson)).mechanism;
    const lines = [
      `### Vilbrequin + masse lourde (BOUCLE) — SSOR=production`,
    ];
    for (const mass of [1, 100, 300, 1000, 3000]) {
      const worst = worst_geometric_error(with_mass(base, mass), 40);
      lines.push(`mass=${mass}\tworstGeomError=${worst.toExponential(3)}`);
    }
    appendFileSync(process.env.SSOR_OUT!, lines.join("\n") + "\n", "utf8");
  }, 600_000);
});
