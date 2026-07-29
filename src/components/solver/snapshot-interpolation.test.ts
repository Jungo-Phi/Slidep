import { describe, it, expect } from "vitest";
import coreXY2 from "../../../test-mechanisms/Core XY - 2 moteurs.slidep?raw";
import disconnect from "../../../test-mechanisms/Déconnexion courroie.slidep?raw";
import huygens from "../../../test-mechanisms/Huygen's chain drive.slidep?raw";
import jansen from "../../../test-mechanisms/Jansen's linkage.slidep?raw";
import poulie from "../../../test-mechanisms/Poulie bloqueuse.slidep?raw";
import vilbrequin from "../../../test-mechanisms/Vilbrequin.slidep?raw";
import { Point2 } from "../../types/point2";
import { Mechanism } from "../../types";
import { load_mechanism } from "../../utils/load-mechanism";
import {
  RECORD_DT,
  apply_snapshot_to_mechanism,
  compile_simulation_model,
  recording_step,
  snapshot_at,
  snapshot_index_at,
  step_ceiling,
  step_simulation,
} from "./kinematic-simulation";
import { KinematicSnapshot } from "../../types/runtime-state";

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
  let positions: Map<string, Point2> | null = null;
  let angles: Map<string, number> | null = null;
  for (let i = 0; i < frames; i++) {
    const s = step_simulation(model, i * RECORD_DT, positions, angles, RECORD_DT);
    positions = s.positions;
    angles = s.angles;
    snaps.push(s);
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
      JSON.stringify([...(s.disconnectedBeltGears ?? new Map())]);
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
 * Above ×1 the recording steps in coarser jumps, so its time axis is no longer a
 * multiple of `RECORD_DT`. Everything that reads a snapshot by time has to search
 * that axis instead of dividing by the step.
 */
describe("axe de temps non uniforme", () => {
  /** Snapshots at the given times, carrying one node that moves with time. */
  const at = (times: number[]): KinematicSnapshot[] =>
    times.map((t) => ({
      t,
      positions: new Map([["n", new Point2(t, 0)]]),
      angles: new Map([["g", t]]),
    }));

  it("le pas d'enregistrement grossit juste assez pour tenir la vitesse", () => {
    const BUDGET = 8;
    // A cheap step: the whole frame's request fits, so the step stays nominal.
    expect(recording_step(1 / 60, 0.5, BUDGET)).toBe(RECORD_DT);
    // 4 ms a step → 2 affordable → half the request each, coarser than nominal.
    expect(recording_step(1 / 6, 4, BUDGET)).toBeCloseTo(1 / 12, 12);
    // A step that outlasts the budget on its own: one per frame, so it has to
    // carry the entire request. This is the saturated regime.
    expect(recording_step(1 / 6, 40, BUDGET)).toBeCloseTo(1 / 6, 12);
    // Never finer than nominal, however cheap the mechanism or slow the playback.
    expect(recording_step(1 / 600, 0.01, BUDGET)).toBe(RECORD_DT);
    // A cost of zero (not yet measured) must not divide by zero.
    expect(recording_step(1 / 60, 0, BUDGET)).toBe(RECORD_DT);
  });

  it("le plafond ramène le pas au seuil où la contrainte tient", () => {
    // Nothing violated: no cap, and the ceiling opens by a quarter each clean step.
    expect(step_ceiling(1 / 6, 0)).toBeCloseTo(1 / 6 / 0.8, 12);
    // Twice past the threshold ⇒ halve the step. Measured on `Poulie bloqueuse`: 1.94 at
    // a 1/60 step, which this maps back to ~1/116 — the far side of the cliff.
    expect(step_ceiling(1 / 60, 1.94)).toBeCloseTo(1 / 60 / 1.94, 12);
    // From very coarse, one division is enough to land back near nominal.
    expect(step_ceiling(1 / 6, 15.9)).toBeCloseTo(1 / 6 / 15.9, 12);
    // Never finer than nominal, whatever the violation: a real blockage must keep
    // reporting itself instead of being chased below RECORD_DT.
    expect(step_ceiling(1 / 120, 1.8)).toBe(RECORD_DT);
    expect(step_ceiling(1 / 480, 50)).toBe(RECORD_DT);
  });

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
    expect(snapshot_at(snaps, 2)?.positions.get("n")?.x).toBeCloseTo(2, 12);
    expect(snapshot_at(snaps, 4.25)?.positions.get("n")?.x).toBeCloseTo(4.25, 12);
    expect(snapshot_at(snaps, 4.25)?.angles.get("g")).toBeCloseTo(4.25, 12);
    // Recorded instants still hand back the snapshot itself, untouched.
    expect(snapshot_at(snaps, 4)).toBe(snaps[1]);
  });

});
