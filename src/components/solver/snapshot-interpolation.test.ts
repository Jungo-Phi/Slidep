import { describe, it, expect } from "vitest";
import coreXY2 from "../../../test-mechanisms/Core XY - 2 moteurs.slidep?raw";
import disconnect from "../../../test-mechanisms/Déconnexion courroie.slidep?raw";
import huygens from "../../../test-mechanisms/Huygen's chain drive.slidep?raw";
import jansen from "../../../test-mechanisms/Jansen's linkage.slidep?raw";
import poulie from "../../../test-mechanisms/Poulie bloqueuse.slidep?raw";
import vilbrequin from "../../../test-mechanisms/Vilbrequin.slidep?raw";
import { Mechanism } from "../../types";
import { load_mechanism } from "../../utils/load-mechanism";
import {
  RECORD_DT,
  apply_snapshot_to_mechanism,
  compile_simulation_model,
  snapshot_at,
  snapshot_index_at,
  step_simulation,
} from "./kinematic-simulation";
import { KinematicSnapshot } from "../../types/runtime-state";
import {
  make_snapshot_layout,
  snapshot_angle,
  snapshot_belt_detached,
  snapshot_point,
} from "./snapshot";

/**
 * Interpolating between two snapshots is a drawing, not a solve: the average of two states
 * that each satisfy the constraints does not satisfy them. What this measures is how much
 * that costs on the one thing it can visibly break — a rigid beam's length — against the
 * error already present in the recorded snapshots themselves.
 */

const loadFixture = (json: string) => load_mechanism(JSON.parse(json)).mechanism;

const MECHANISMS: [string, string][] = [
  ["Core XY - 2 moteurs", coreXY2],
  ["Déconnexion courroie", disconnect],
  ["Huygen's chain drive", huygens],
  ["Jansen's linkage", jansen],
  ["Poulie bloqueuse", poulie],
  ["Vilbrequin", vilbrequin],
];

/** Rest lengths of the rigid edges, read from the edit-time mechanism. */
function beamLengths(m: Mechanism): Map<string, number> {
  const out = new Map<string, number>();
  for (const el of m.mechanicalElements)
    if (el.type === "beam")
      out.set(el.id, el.positionStart.distance_to(el.positionEnd));
  return out;
}

/** Worst |drawn length − rest length| over the rigid edges of a drawn mechanism. */
function worstBeamError(drawn: Mechanism, rest: Map<string, number>): number {
  let worst = 0;
  for (const el of drawn.mechanicalElements) {
    if (el.type !== "beam") continue;
    const target = rest.get(el.id);
    if (target === undefined) continue;
    const d = Math.abs(el.positionStart.distance_to(el.positionEnd) - target);
    if (d > worst) worst = d;
  }
  return worst;
}

function record(json: string, frames: number) {
  const mechanism = loadFixture(json);
  const model = compile_simulation_model(mechanism);
  const snaps: KinematicSnapshot[] = [];
  let prev: KinematicSnapshot | null = null;
  for (let i = 0; i < frames; i++) {
    prev = step_simulation(model, i * RECORD_DT, prev, RECORD_DT);
    snaps.push(prev);
  }
  return { mechanism, snaps };
}

describe("interpolation des snapshots", () => {
  it("l'erreur ajoutée reste sous celle déjà présente dans les snapshots", () => {
    const FRAMES = 120;
    console.log(
      "\n  | mécanisme | erreur des snapshots | erreur interpolée (u=0.5) | ajouté |",
    );
    console.log("  |---|---|---|---|");

    let worstAdded = 0;
    for (const [name, json] of MECHANISMS) {
      const { mechanism, snaps } = record(json, FRAMES);
      const rest = beamLengths(mechanism);
      if (rest.size === 0) {
        console.log(`  | ${name} | (aucune poutre) | — | — |`);
        continue;
      }

      let atNodes = 0; // error already carried by the recorded snapshots
      let interpolated = 0; // error of the half-way drawing
      for (let i = 0; i < snaps.length - 1; i++) {
        atNodes = Math.max(
          atNodes,
          worstBeamError(apply_snapshot_to_mechanism(mechanism, snaps[i]), rest),
        );
        const mid = snapshot_at(snaps, (i + 0.5) * RECORD_DT);
        if (!mid) continue;
        interpolated = Math.max(
          interpolated,
          worstBeamError(apply_snapshot_to_mechanism(mechanism, mid), rest),
        );
      }
      const added = Math.max(0, interpolated - atNodes);
      worstAdded = Math.max(worstAdded, added);
      console.log(
        `  | ${name} | ${atNodes.toExponential(2)} px | ${interpolated.toExponential(2)} px | ${added.toExponential(2)} px |`,
      );
    }

    console.log(`\n  pire ajout : ${worstAdded.toExponential(3)} px`);
    // A tenth of a pixel is the scale at which a beam's length change becomes visible on a
    // canvas; the interpolation must stay well under it to be a free smoothing.
    expect(worstAdded).toBeLessThan(0.1);
  }, 300_000);

  it("au pas RÉELLEMENT enregistré, l'erreur reste sous le même seuil", () => {
    // The recorder solves at RECORD_DT and keeps one instant in two, so what the app
    // interpolates across is twice the step measured above — and the error of a linear
    // interpolation is second order in it, so this is where it is expected to quadruple.
    const FRAMES = 120;
    console.log("\n  | mécanisme | pas 1/120 | pas retenu 1/60 | rapport |");
    console.log("  |---|---|---|---|");

    let worstAdded = 0;
    for (const [name, json] of MECHANISMS) {
      const { mechanism, snaps } = record(json, FRAMES);
      const rest = beamLengths(mechanism);
      if (rest.size === 0) continue;
      const kept = snaps.filter((_, i) => i % 2 === 0);

      const added = (series: KinematicSnapshot[], step: number) => {
        let atNodes = 0;
        let interpolated = 0;
        for (let i = 0; i < series.length - 1; i++) {
          atNodes = Math.max(
            atNodes,
            worstBeamError(apply_snapshot_to_mechanism(mechanism, series[i]), rest),
          );
          const mid = snapshot_at(series, (i + 0.5) * step);
          if (!mid) continue;
          interpolated = Math.max(
            interpolated,
            worstBeamError(apply_snapshot_to_mechanism(mechanism, mid), rest),
          );
        }
        return Math.max(0, interpolated - atNodes);
      };

      const fine = added(snaps, RECORD_DT);
      const coarse = added(kept, 2 * RECORD_DT);
      worstAdded = Math.max(worstAdded, coarse);
      console.log(
        `  | ${name} | ${fine.toExponential(2)} px | ${coarse.toExponential(2)} px | ` +
          `${fine > 0 ? (coarse / fine).toFixed(1) : "—"}× |`,
      );
    }
    console.log(`\n  pire ajout au pas retenu : ${worstAdded.toExponential(3)} px`);
    expect(worstAdded).toBeLessThan(0.1);
  }, 300_000);

  it("aux instants enregistrés, elle rend le snapshot lui-même", () => {
    const { snaps } = record(jansen, 20);
    for (let i = 0; i < snaps.length; i++) {
      const got = snapshot_at(snaps, i * RECORD_DT);
      expect(got).toBe(snaps[i]);
    }
  }, 60_000);

  it("ne franchit pas un changement de topologie de courroie", () => {
    // `Déconnexion courroie` drops a pulley mid-run: across that frame the earlier snapshot
    // must be held, never a half-detached belt.
    const { snaps } = record(disconnect, 400);
    const detached = (s: KinematicSnapshot) =>
      s.layout.belts
        .map((id) => `${id}:${snapshot_belt_detached(s, id) ?? ""}`)
        .join("|");
    let transitions = 0;
    for (let i = 0; i < snaps.length - 1; i++) {
      if (detached(snaps[i]) === detached(snaps[i + 1])) continue;
      transitions++;
      expect(snapshot_at(snaps, (i + 0.5) * RECORD_DT)).toBe(snaps[i]);
    }
    console.log(`  ${transitions} transition(s) de topologie traversée(s)`);
    expect(transitions).toBeGreaterThan(0);
  }, 300_000);
});

/**
 * Everything that reads a snapshot by time searches the axis rather than dividing by the
 * step. Recording is uniform today, so these hold nothing up on their own — they are what
 * keeps the readers correct if a variable step ever comes back.
 */
describe("axe de temps non uniforme", () => {
  /** Snapshots at the given times, carrying one node that moves with time. They share one
   *  layout, as the snapshots of a single recording do. */
  const at = (times: number[]): KinematicSnapshot[] => {
    const layout = make_snapshot_layout(["n"], ["g"]);
    return times.map((t) => {
      const positions = new Float64Array(layout.keys.length * 2).fill(NaN);
      positions[0] = t;
      positions[1] = 0;
      return { t, layout, positions, angles: Float64Array.of(t) };
    });
  };

  it("encadre l'instant demandé quel que soit l'espacement", () => {
    const snaps = at([0, 1, 1.25, 5, 5.5]);
    expect(snapshot_index_at(snaps, -3)).toBe(0);
    expect(snapshot_index_at(snaps, 0)).toBe(0);
    expect(snapshot_index_at(snaps, 1.2)).toBe(1);
    expect(snapshot_index_at(snaps, 1.25)).toBe(2);
    expect(snapshot_index_at(snaps, 4.9)).toBe(2);
    expect(snapshot_index_at(snaps, 5.5)).toBe(4);
    expect(snapshot_index_at(snaps, 99)).toBe(4);
  });

  it("interpole sur la durée réelle de l'intervalle, pas sur RECORD_DT", () => {
    // A gap of 4 s followed by one of 0.5 s: half-way across each is the midpoint
    // of that gap, which fixed-step arithmetic would place elsewhere entirely.
    const snaps = at([0, 4, 4.5]);
    const x = (t: number) => snapshot_point(snapshot_at(snaps, t)!, "n")?.x;
    expect(x(2)).toBeCloseTo(2, 12);
    expect(x(4.25)).toBeCloseTo(4.25, 12);
    expect(snapshot_angle(snapshot_at(snaps, 4.25)!, "g")).toBeCloseTo(4.25, 12);
    // Recorded instants still hand back the snapshot itself, untouched.
    expect(snapshot_at(snaps, 4)).toBe(snaps[1]);
  });

});
