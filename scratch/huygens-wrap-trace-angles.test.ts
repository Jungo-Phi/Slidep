import { describe, it } from "vitest";
import huygensJson from "../test-mechanisms/Huygen's chain drive.slidep?raw";
import { Point2 } from "../src/types";
import { DynamicSnapshot } from "../src/types/runtime-state";
import { load_mechanism } from "../src/utils/load-mechanism";
import {
  RECORD_DT,
  compile_simulation_model,
  step_dynamic_simulation,
} from "../src/components/solver/dynamics/simulation-engine";
import { snapshot_angle, snapshot_point } from "../src/components/solver/snapshot";
import { belt_pieces, BeltVia } from "../src/utils/belt-path";

describe("wrap + angles, Huygens dynamique entraîné, post-disconnect", () => {
  it("trace frame par frame jusqu'à 150", () => {
    const mechanism = load_mechanism(JSON.parse(huygensJson)).mechanism;
    const belt = mechanism.mechanicalElements.find((e) => e.type === "belt");
    if (!belt || belt.type !== "belt") throw new Error("no belt");
    const gearIDs = belt.attachedGearsIDs.map((g) => g.id);
    const gears = gearIDs.map(
      (id) => mechanism.mechanicalElements.find((e) => e.id === id)!,
    );
    const model = compile_simulation_model(mechanism);
    const beltLink = model.links.find((l) => l.type === "BeltLength");
    if (!beltLink || beltLink.type !== "BeltLength") throw new Error("no belt link");

    let snapshot: DynamicSnapshot | null = null;
    const rows: string[] = [];
    for (let f = 0; f < 150; f++) {
      snapshot = step_dynamic_simulation(
        model,
        f * RECORD_DT,
        snapshot,
        RECORD_DT,
        new Point2(0, -9.81),
      );
      const vias: BeltVia[] = gears.map((g, i) => {
        const p = snapshot_point(snapshot!, g.id) ?? (g as { position: Point2 }).position;
        const dir = belt.attachedGearsIDs[i].direction ?? false;
        return { pos: p, radius: (g as { radius: number }).radius, clockwise: dir };
      });
      const pieces = belt_pieces(vias, true);
      const wraps = gearIDs.map((_, i) => {
        const arc = pieces.find((p) => p.kind === "arc" && p.gearIndex === i);
        return arc && arc.kind === "arc" ? arc.wrap : NaN;
      });
      const angles = gears.map((g) => snapshot_angle(snapshot!, g.id) ?? NaN);
      if (f % 5 === 0 || (f > 50 && f < 70) || f > 140)
        rows.push(
          `frame ${String(f).padStart(3)}: raw=[${wraps.map((w) => w.toFixed(3)).join(", ")}] tracked=[${beltLink.wraps?.map((w) => w.toFixed(3)).join(", ") ?? "?"}] disc=[${beltLink.disconnected?.join(",") ?? "?"}] angles=[${angles.map((a) => a.toFixed(3)).join(", ")}]`,
        );
    }
    // eslint-disable-next-line no-console
    console.log(rows.join("\n"));
  }, 60_000);
});
