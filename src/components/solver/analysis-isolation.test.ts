/**
 * The analysis panel must not be able to change what the simulation produces.
 *
 * It measures and animates on the pose the recording is stopped on, which means it compiles
 * a model and runs the solver over the same mechanism the recording came from. Any state
 * shared by reference between the two — a snapshot's arrays, a belt's wrap state, a link
 * object — would make looking at a mechanism alter it, and a belt drive is where that would
 * show first, its topology being re-derived from the pose at every reload.
 *
 * Recorded on a belt mechanism for that reason, and compared frame by frame rather than at
 * the end: a divergence that settles back would otherwise pass. The pause falls AFTER the
 * belt has dropped a pulley (frame 96), so the analysis is exercised on the path where it
 * rewires the belt it was given.
 */

import { describe, expect, it } from "vitest";
import decon from "../../../test-mechanisms/Déconnexion courroie.slidep?raw";
import { KinematicSnapshot } from "../../types/runtime-state";
import { Mechanism } from "../../types";
import { load_mechanism } from "../../utils/load-mechanism";
import {
  RECORD_DT,
  apply_snapshot_to_mechanism,
  compile_simulation_model,
  step_simulation,
} from "./kinematic-simulation";
import { build_analysis_model } from "./analysis-model";
import { probe_chain_mobility } from "./mobility-probe";
import { canonical_modes } from "./motion-modes";
import { animate_mode } from "./mode-animation";

const load = () => load_mechanism(JSON.parse(decon)).mechanism;

/** Digest of a snapshot: what the simulation actually produced. */
const digest = (s: KinematicSnapshot) =>
  JSON.stringify({
    p: [...s.positions].map((v) => v.toFixed(9)),
    a: [...s.angles].map((v) => (Number.isNaN(v) ? "nan" : v.toFixed(9))),
  });

/** What the panel does while a mode row is hovered, on the pose shown. */
function hover_a_mode(mechanism: Mechanism, snapshot: KinematicSnapshot) {
  const shown = apply_snapshot_to_mechanism(mechanism, snapshot);
  const model = build_analysis_model(shown);
  for (const chain of model.chains) {
    const mobility = probe_chain_mobility(model, chain);
    const modes = canonical_modes(model, chain, mobility);
    if (modes.length === 0) continue;
    const animation = animate_mode(shown, model, chain, modes[0]);
    for (let i = 0; i < 30; i++) animation.advance(1 / 60);
    break;
  }
}

/** Record `n` frames, optionally hovering a mode at frame `pauseAt`. */
function record(n: number, pauseAt: number, hover: boolean): string[] {
  const mechanism = load();
  const model = compile_simulation_model(mechanism);
  let snapshot: KinematicSnapshot | null = null;
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    snapshot = step_simulation(model, i * RECORD_DT, snapshot);
    if (hover && i === pauseAt) hover_a_mode(mechanism, snapshot);
    out.push(digest(snapshot));
  }
  return out;
}

/** The same, but the pause also recompiles from the shown pose, as `recorder().load` does. */
function record_with_reload(n: number, pauseAt: number, hover: boolean): string[] {
  const mechanism = load();
  let model = compile_simulation_model(mechanism);
  let snapshot: KinematicSnapshot | null = null;
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    snapshot = step_simulation(model, i * RECORD_DT, snapshot);
    out.push(digest(snapshot));
    if (i !== pauseAt) continue;
    if (hover) hover_a_mode(mechanism, snapshot);
    model = compile_simulation_model(
      apply_snapshot_to_mechanism(mechanism, snapshot),
    );
  }
  return out;
}

describe("fuite de l'analyse vers la simulation", () => {
  it("survoler un mode ne change pas la suite de l'enregistrement", () => {
    const plain = record(200, 110, false);
    const hovered = record(200, 110, true);
    expect(hovered).toEqual(plain);
  }, 60_000);

  it("… ni après un rechargement depuis la pose en pause", () => {
    const plain = record_with_reload(200, 110, false);
    const hovered = record_with_reload(200, 110, true);
    expect(hovered).toEqual(plain);
  }, 60_000);
});
