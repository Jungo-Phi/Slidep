import { describe, it } from "vitest";
import coreXY2 from "../../../test-mechanisms/Core XY - 2 moteurs.slidep?raw";
import disconnect from "../../../test-mechanisms/Déconnexion courroie.slidep?raw";
import huygens from "../../../test-mechanisms/Huygen's chain drive.slidep?raw";
import jansen from "../../../test-mechanisms/Jansen's linkage.slidep?raw";
import poulie from "../../../test-mechanisms/Poulie bloqueuse.slidep?raw";
import vilbrequin from "../../../test-mechanisms/Vilbrequin.slidep?raw";
import { Point2 } from "../../types/point2";
import { load_mechanism } from "../../utils/load-mechanism";
import {
  RECORD_DT,
  compile_simulation_model,
  step_simulation,
} from "./kinematic-simulation";

/**
 * What the permanent residual collection costs — the `collectDiagnostics` item of
 * `plan-fluidite.md` chantier 5, credited there with ~8 % of a simulation frame.
 *
 * **Measured on frames that advance time**, not on re-solves of a settled state: a warm
 * mechanism re-solved from its own solution exits after a handful of sweeps and reports
 * microseconds, which measures the early exit and nothing else. Each sample therefore steps
 * the simulation forward, exactly as the app does.
 *
 * The two settings alternate inside one process and the order flips every pass, because the
 * dossier forbids comparing timings taken at different moments; the minimum is kept. Both
 * follow the same trajectory — the flag changes what is recorded, never what is computed.
 */

const MECHANISMS: [string, string][] = [
  ["Core XY - 2 moteurs", coreXY2],
  ["Déconnexion courroie", disconnect],
  ["Huygen's chain drive", huygens],
  ["Jansen's linkage", jansen],
  ["Poulie bloqueuse", poulie],
  ["Vilbrequin", vilbrequin],
];

const loadFixture = (json: string) => load_mechanism(JSON.parse(json)).mechanism;

/** Frames stepped before timing starts, so the solve measured is steady-state. */
const WARMUP_FRAMES = 30;
/** Frames timed per sample. */
const FRAMES = 40;
const PASSES = 5;

/** One simulation advancing on its own model, so two can run in lockstep. */
function runner(json: string, collectDiagnostics: boolean) {
  const model = compile_simulation_model(loadFixture(json));
  let positions: Map<string, Point2> | null = null;
  let angles: Map<string, number> | null = null;
  let t = 0;
  return () => {
    t += RECORD_DT;
    const s = step_simulation(
      model,
      t,
      positions,
      angles,
      RECORD_DT,
      undefined,
      undefined,
      collectDiagnostics,
    );
    positions = s.positions;
    angles = s.angles;
  };
}

/**
 * ms per frame for both settings, stepped **alternately, frame by frame**, on two identical
 * models. Anything that drifts during the run — JIT tiers, GC, thermal — then hits both
 * within a frame of each other instead of landing on whichever ran first.
 */
function lockstepMs(json: string): { on: number; off: number } {
  const stepOn = runner(json, true);
  const stepOff = runner(json, false);
  for (let i = 0; i < WARMUP_FRAMES; i++) {
    stepOn();
    stepOff();
  }
  let accOn = 0;
  let accOff = 0;
  for (let i = 0; i < FRAMES; i++) {
    // Which of the two goes first alternates too, so neither is systematically the one
    // that pays for a cache line the other then finds warm.
    const onFirst = i % 2 === 0;
    for (const on of onFirst ? [true, false] : [false, true]) {
      const from = performance.now();
      if (on) stepOn();
      else stepOff();
      const spent = performance.now() - from;
      if (on) accOn += spent;
      else accOff += spent;
    }
  }
  return { on: accOn / FRAMES, off: accOff / FRAMES };
}

describe("coût de la collecte de résidus", () => {
  it("mesure diagnostics on/off, alternés dans le même processus", () => {
    const best = new Map<string, number>();
    const keep = (key: string, got: number) => {
      const b = best.get(key);
      if (b === undefined || got < b) best.set(key, got);
    };

    for (let pass = 0; pass < PASSES; pass++)
      for (const [name, json] of MECHANISMS) {
        const { on, off } = lockstepMs(json);
        keep(`${name}|true`, on);
        keep(`${name}|false`, off);
      }

    console.log("\n  | mécanisme | avec diagnostics | sans | surcoût |");
    console.log("  |---|---|---|---|");
    for (const [name] of MECHANISMS) {
      const on = best.get(`${name}|true`) ?? 0;
      const off = best.get(`${name}|false`) ?? 0;
      const pct = off > 0 ? (100 * (on - off)) / off : 0;
      console.log(
        `  | ${name} | ${on.toFixed(3)} ms | ${off.toFixed(3)} ms | ${pct >= 0 ? "+" : ""}${pct.toFixed(1)} % |`,
      );
    }
    console.log(
      "\n  Seuls les rapports d'une même ligne valent ; les absolus varient d'une exécution à l'autre.",
    );
  }, 900_000);

  /**
   * Which mechanisms carry the three belt links still on the boxed path — the other
   * chantier 5 item. A link absent from a mechanism cannot be optimised for it, so this
   * table decides where the work would land before any of it is done.
   */
  it("recense les liens de courroie restés sur le chemin boxé", () => {
    const BOXED = ["BeltPin", "BeltJunction", "BeltFollowsTangent"] as const;
    console.log(
      `\n  | mécanisme | ${BOXED.join(" | ")} | liens | nœuds | angles | octets/snapshot |`,
    );
    console.log("  |---|---|---|---|---|---|---|");
    for (const [name, json] of MECHANISMS) {
      const model = compile_simulation_model(loadFixture(json));
      const counts = BOXED.map(
        (t) => model.links.filter((l) => l.type === t).length,
      );
      const nodes = model.nodes.positions.size;
      const angles = model.nodes.angles.size;
      // What a snapshot would weigh as raw doubles: 2 per position, 1 per angle.
      const bytes = (2 * nodes + angles) * 8;
      console.log(
        `  | ${name} | ${counts.join(" | ")} | ${model.links.length} | ${nodes} | ${angles} | ${bytes} |`,
      );
    }
  }, 300_000);
});
