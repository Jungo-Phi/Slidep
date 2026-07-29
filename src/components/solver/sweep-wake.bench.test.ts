import { describe, it } from "vitest";
import jansen from "../../../test-mechanisms/Jansen's linkage.slidep?raw";
import vilbrequin from "../../../test-mechanisms/Vilbrequin.slidep?raw";
import poulie from "../../../test-mechanisms/Poulie bloqueuse.slidep?raw";
import huygens from "../../../test-mechanisms/Huygen's chain drive.slidep?raw";
import { Point2 } from "../../types/point2";
import { load_mechanism } from "../../utils/load-mechanism";
import { compile_simulation_model, step_simulation } from "./kinematic-simulation";
import { collect_sweeps } from "./sweep-probe";

/**
 * TEMPORARY — chantier 2: the dimensioning run found a QUIET sweep followed by one that
 * moves 0.2 px, which would break the fixed-point argument the early exit rests on. This
 * prints the raw first sweeps to see whether it is real or an artefact of the probe.
 */

const loadFixture = (json: string) => load_mechanism(JSON.parse(json)).mechanism;

describe("chantier 2 — le réveil après un balayage calme", () => {
  it("premiers balayages, bruts", () => {
    for (const [name, json] of [
      ["Jansen's linkage", jansen],
      ["Vilbrequin", vilbrequin],
    ] as const) {
      console.log(`\n=== ${name} ===`);
      const model = compile_simulation_model(loadFixture(json));
      let positions: Map<string, Point2> | null = null;
      let angles: Map<string, number> | null = null;
      for (let frame = 0; frame < 3; frame++) {
        const samples = collect_sweeps(() => {
          const s = step_simulation(model, frame / 60, positions, angles, 1 / 60);
          positions = s.positions;
          angles = s.angles;
        });
        console.log(
          `  frame ${frame} (${samples.length} balayages) : ` +
            samples
              .slice(0, 8)
              .map(
                (s) =>
                  `#${s.sweep} bougé=${s.moved.toExponential(2)} tourné=${s.turned.toExponential(2)} rés=${s.maxError.toExponential(2)}`,
              )
              .join("  |  "),
        );
      }
    }
  }, 300_000);

  it("les balayages tardifs convergent-ils, ou cyclent-ils ?", () => {
    // If the late sweeps keep moving by a roughly CONSTANT amount, Gauss-Seidel is not
    // converging on a fixed point — it is going round a limit cycle, and "nothing moves"
    // never becomes true however long we wait.
    for (const [name, json] of [
      ["Poulie bloqueuse", poulie],
      ["Huygen's chain drive", huygens],
      ["Jansen's linkage", jansen],
    ] as const) {
      const model = compile_simulation_model(loadFixture(json));
      let positions: Map<string, Point2> | null = null;
      let angles: Map<string, number> | null = null;
      let samples: ReturnType<typeof collect_sweeps> = [];
      for (let frame = 0; frame < 20; frame++) {
        samples = collect_sweeps(() => {
          const s = step_simulation(model, frame / 60, positions, angles, 1 / 60);
          positions = s.positions;
          angles = s.angles;
        });
      }
      const at = (i: number) =>
        samples[i]
          ? `#${samples[i].sweep}=${samples[i].moved.toExponential(2)}`
          : "—";
      console.log(
        `\n  ${name} (frame 20, ${samples.length} balayages) : ` +
          [50, 100, 150, 200, 250, 295, 296, 297, 298, 299].map(at).join("  "),
      );
    }
  }, 300_000);
});
