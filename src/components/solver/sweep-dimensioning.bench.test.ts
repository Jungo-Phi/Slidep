import { describe, it } from "vitest";
import coreXY2 from "../../../test-mechanisms/Core XY - 2 moteurs.slidep?raw";
import coreXYMod from "../../../test-mechanisms/Core XY modifié.slidep?raw";
import coreXY from "../../../test-mechanisms/Core XY.slidep?raw";
import disconnect from "../../../test-mechanisms/Déconnexion courroie.slidep?raw";
import huygens from "../../../test-mechanisms/Huygen's chain drive.slidep?raw";
import jansen from "../../../test-mechanisms/Jansen's linkage.slidep?raw";
import poulie from "../../../test-mechanisms/Poulie bloqueuse.slidep?raw";
import slider from "../../../test-mechanisms/Test slider.slidep?raw";
import vilbrequin from "../../../test-mechanisms/Vilbrequin.slidep?raw";
import { Point2 } from "../../types/point2";
import { load_mechanism } from "../../utils/load-mechanism";
import { compile_simulation_model, step_simulation } from "./kinematic-simulation";
import { collect_sweeps, SweepScalars } from "./sweep-probe";

/**
 * TEMPORARY — chantier 2, point 1: how many sweeps does a frame actually need before
 * NOTHING MOVES, against the 300 it is allowed and the residual criterion that decides
 * today? Measures only; it changes no behaviour. Delete once the threshold is chosen.
 */

const MECHANISMS: [string, string][] = [
  ["Core XY - 2 moteurs", coreXY2],
  ["Core XY modifié", coreXYMod],
  ["Core XY", coreXY],
  ["Déconnexion courroie", disconnect],
  ["Huygen's chain drive", huygens],
  ["Jansen's linkage", jansen],
  ["Poulie bloqueuse", poulie],
  ["Test slider", slider],
  ["Vilbrequin", vilbrequin],
];

/** Displacement thresholds, in px, spanning "numerically dead" to "invisible on screen". */
const THRESHOLDS = [1e-12, 1e-9, 1e-6, 1e-3];

const loadFixture = (json: string) => load_mechanism(JSON.parse(json)).mechanism;
const FRAMES = 25;

/** First sweep after which no later sweep ever moves as much as `threshold`. */
function settledAt(samples: SweepScalars[], threshold: number): number {
  let last = -1;
  for (const s of samples) if (s.moved >= threshold) last = s.sweep;
  return last + 1;
}

function firstFreeKey(model: ReturnType<typeof compile_simulation_model>) {
  for (const key of model.nodes.positions.keys())
    if ((model.nodes.posMasses.get(key) ?? 1) === 1) return key;
  return undefined;
}

/** Per-frame sweep samples for one mechanism, optionally while dragging a free node. */
function frames(json: string, withGrab: boolean): SweepScalars[][] {
  const model = compile_simulation_model(loadFixture(json));
  const grabKey = withGrab ? firstFreeKey(model) : undefined;
  const from = grabKey ? model.nodes.positions.get(grabKey)!.clone() : undefined;
  let positions: Map<string, Point2> | null = null;
  let angles: Map<string, number> | null = null;
  const out: SweepScalars[][] = [];
  for (let i = 0; i < FRAMES; i++) {
    const target =
      from &&
      new Point2(from.x + (60 * (i + 1)) / FRAMES, from.y - (40 * (i + 1)) / FRAMES);
    out.push(
      collect_sweeps(() => {
        const s = step_simulation(
          model,
          i / 60,
          positions,
          angles,
          1 / 60,
          target && grabKey ? { key: grabKey, target } : undefined,
        );
        positions = s.positions;
        angles = s.angles;
      }),
    );
  }
  return out;
}

function report(label: string, withGrab: boolean) {
  console.log(`\n=== ${label} ===`);
  console.log(
    "  | mécanisme | balayages exécutés (max) | " +
      THRESHOLDS.map((t) => `figé à ${t.toExponential(0)} px`).join(" | ") +
      " |",
  );
  console.log("  |---|---|" + THRESHOLDS.map(() => "---").join("|") + "|");
  for (const [name, json] of MECHANISMS) {
    const all = frames(json, withGrab);
    const executed = Math.max(...all.map((s) => s.length));
    const settled = THRESHOLDS.map((t) =>
      Math.max(...all.map((s) => settledAt(s, t))),
    );
    console.log(`  | ${name} | ${executed} | ${settled.join(" | ")} |`);
  }
}

describe("chantier 2 / point 1 — dimensionnement de la sortie anticipée", () => {
  it("combien de balayages avant que plus rien ne bouge ?", () => {
    report("Moteurs seuls (pas de saisie)", false);
    report("Avec saisie — le grab s'arrête au balayage 20", true);
  }, 900_000);

  it("un balayage calme peut-il être suivi d'un balayage qui bouge ?", () => {
    // The early exit is only sound if a quiet sweep means a fixed point. A grab that
    // stops at sweep 20 is the known exception; this looks for any other one.
    console.log("\n=== Réveils après un balayage calme (seuil 1e-9 px) ===");
    console.log("  | mécanisme | saisie | pire réveil | balayage du réveil |");
    console.log("  |---|---|---|---|");
    for (const withGrab of [false, true])
      for (const [name, json] of MECHANISMS) {
        let worst = 0;
        let at = -1;
        for (const samples of frames(json, withGrab)) {
          for (let i = 1; i < samples.length; i++) {
            if (samples[i - 1].moved >= 1e-9) continue;
            if (samples[i].moved > worst) {
              worst = samples[i].moved;
              at = samples[i].sweep;
            }
          }
        }
        if (worst > 0)
          console.log(
            `  | ${name} | ${withGrab ? "oui" : "non"} | ${worst.toExponential(2)} px | ${at} |`,
          );
      }
  }, 900_000);
});
