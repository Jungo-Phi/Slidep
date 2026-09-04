import { describe, expect, it } from "vitest";
import cantileverJson from "../../../../test-mechanisms/Double Cantilever.slidep?raw";
import trussJson from "../../../../test-mechanisms/Masse suspendue.slidep?raw";
import { Point2 } from "../../../types";
import { DynamicSnapshot } from "../../../types/runtime-state";
import { load_mechanism } from "../../../utils/load-mechanism";
import { resolve_load_forces } from "../dynamics/load-model";
import { NodeBalance, resolve_node_balance } from "../dynamics/node-balance";
import {
  RECORD_DT,
  compile_simulation_model,
  step_dynamic_simulation,
} from "../dynamics/simulation-engine";
import { snapshot_acceleration, snapshot_point } from "../snapshot";

/**
 * A truss holding 5 t on two grounded pivots, against the reference every figure here was
 * hand-computed from: the beams weigh 17.5 kg all told against a 49.05 kN load, so plain
 * statics answers it to a fraction of a percent.
 *
 *   Epan  +114.5 kN   Iqla  +34.3 kN   Uslu  −59.8 kN   Lukn  −119.5 kN   Dode  +49.05 kN
 *   Dicu  −114.5 kN (vertical)         Uqin  +163.5 kN (vertical)
 *
 * What makes it worth a behaviour test rather than an injected torsor: it is a closed loop of
 * links, the case the per-beam readings cannot settle on their own, and it caught both of the
 * defects this guards — a free body that lost everything terminal at the far end (Dode read
 * 7.7 N, its own weight, for the 49 kN it carries) and the two readings disagreeing over which
 * side of the cut a beam's endpoint mass lump falls on.
 */
const GRAVITY = new Point2(0, -9.81);
const ZERO = new Point2(0, 0);

/** Fused keys are comma-joined; a snapshot layout indexes the parts. */
function unfused<T>(key: string, read: (part: string) => T | undefined): T | undefined {
  for (const part of key.split(",")) {
    const value = read(part);
    if (value !== undefined) return value;
  }
  return undefined;
}

/**
 * Frames to run, and how many of the last ones to average over.
 *
 * The start-up vibration damps out inside the first three seconds; what remains is the mass
 * swinging as an undamped pendulum (period ≈ 0.63 s, its own suspension being 0.1 m long),
 * and the statics reference is the MEAN of that swing, not any one frame of it. Averaging
 * over three-odd periods is what makes a percent-level comparison meaningful at all — read
 * one frame and the same figures move by ±6 %.
 */
const FRAMES = 400;
const AVERAGED = 120;

/** One dynamic run per mechanism, shared by every assertion below: each is 400 frames, and
 *  re-simulating them per test is the whole cost of this file. */
const runs = new Map<string, ReturnType<typeof simulate>>();
function run(json: string = trussJson) {
  const cached = runs.get(json);
  if (cached) return cached;
  const fresh = simulate(json);
  runs.set(json, fresh);
  return fresh;
}

function simulate(json: string) {
  const mechanism = load_mechanism(JSON.parse(json)).mechanism;
  const model = compile_simulation_model(mechanism, true);
  const frames: { snapshot: DynamicSnapshot; balances: NodeBalance[] }[] = [];
  let snapshot: DynamicSnapshot | null = null;

  for (let i = 0; i < FRAMES; i++) {
    snapshot = step_dynamic_simulation(model, i * RECORD_DT, snapshot, RECORD_DT, GRAVITY);
    if (i < FRAMES - AVERAGED) continue;

    const positions = new Map<string, Point2>();
    for (const spec of model.beamCohesionSpecs)
      for (const key of [spec.k0, spec.k1, ...spec.attachedNodes.map((n) => n.nodeKey)]) {
        const p = unfused(key, (part) => snapshot_point(snapshot!, part));
        if (p) positions.set(key, p);
      }
    // This mechanism carries neither spring nor damper, so the loads alone are the whole of
    // what `step_dynamic_simulation` itself feeds the balance.
    const loads = resolve_load_forces(model.compiledLoads, positions).forces;
    const at = snapshot;
    frames.push({
      snapshot: at,
      balances: resolve_node_balance(
        model.beamCohesionSpecs,
        at.beamCohesion ?? [],
        model.links,
        model.dynamicMasses,
        GRAVITY,
        (key) => unfused(key, (part) => snapshot_acceleration(at, part)) ?? ZERO,
        (key) => loads.get(key) ?? ZERO,
      ),
    });
  }
  return { mechanism, model, frames };
}

/** The one node no beam starts from and only one beam ends at — a free tip, where the whole
 *  balance is that beam against whatever hangs there and nothing else. */
function terminal_key(specs: { k0: string; k1: string }[]): string {
  const starts = new Set(specs.map((s) => s.k0));
  const ends = specs.map((s) => s.k1).filter((k) => !starts.has(k));
  return ends.find((k) => ends.filter((other) => other === k).length === 1)!;
}

const mean = (values: number[]): number =>
  values.reduce((a, b) => a + b, 0) / values.length;

const relative = (value: number, reference: number): number =>
  Math.abs(value / reference - 1);

const last = <T,>(values: T[]): T => values[values.length - 1];

/** `N` at the beam's own start, in its local frame — `R_coh(0⁺)·x̂`. */
function axial(snapshot: DynamicSnapshot, beamID: string): number {
  const cohesion = (snapshot.beamCohesion ?? []).find((c) => c.beamID === beamID)!;
  const p0 = snapshot_point(snapshot, `${beamID}:start`)!;
  const p1 = snapshot_point(snapshot, `${beamID}:end`)!;
  const xhat = p1.sub(p0).normalize();
  return cohesion.start.fx * xhat.x + cohesion.start.fy * xhat.y;
}

describe("bilan aux nœuds d'un treillis chargé", () => {
  it("chaque nœud ferme Newton avec ce que les poutres y appliquent", () => {
    const { frames } = run();
    expect(last(frames).balances.length).toBeGreaterThan(0);

    for (const balance of last(frames).balances) {
      if (!balance.covered || balance.atAnchor) continue;
      // Relative to the largest single action summed there: a newton means nothing next to
      // the 115 kN some of these nodes carry, and everything next to the 2 N others do.
      expect(balance.residual.length() / balance.scale).toBeLessThan(0.01);
    }
  }, 30_000);

  it("les réactions d'appui valent le calcul de statique", () => {
    const { frames } = run();
    const anchors = frames[0].balances.filter((b) => b.atAnchor).map((b) => b.key);
    expect(anchors).toHaveLength(2);

    // Horizontal components are left out on purpose: statics puts them at ~0, and what the
    // simulation shows there is the pendulum's own swing, not a reaction.
    const vertical = anchors
      .map((key) =>
        mean(frames.map((f) => f.balances.find((b) => b.key === key)!.reaction!.y)),
      )
      .sort((a, b) => a - b);
    expect(relative(vertical[0], -114_500)).toBeLessThan(0.01);
    expect(relative(vertical[1], 163_500)).toBeLessThan(0.01);
  }, 30_000);

  it("la poutre qui porte la masse lit la charge, pas son propre poids", () => {
    const { mechanism, frames } = run();
    // The beam hanging under the free end: the only one whose far end is terminal, so the
    // only one read off a free-body balance rather than off the link reactions. Read its own
    // weight (7.7 N against 49 kN) before the free body was closed.
    const hanger = mechanism.mechanicalElements.find(
      (e) => e.type === "beam" && e.positionEnd.distance_to(e.positionStart) < 0.2,
    )!;
    expect(relative(mean(frames.map((f) => axial(f.snapshot, hanger.id))), 49_050)).toBeLessThan(
      0.01,
    );
  }, 30_000);
});

/**
 * A cantilever cut in two by a `join`, welded to the frame, 10 N at the tip over 15.402 N of
 * self-weight per half. Statics answers its root exactly: 40.804 N and 25.402 N·m.
 *
 * Its free tip is what the truss above cannot check. A beam's endpoint mass lump is a sixth
 * of its own weight — noise beside a 5 t load, and a quarter of everything at this tip, so
 * this is where the two readings' disagreement over which side of the cut that lump falls on
 * actually shows.
 */
describe("bilan aux nœuds d'un cantilever soudé", () => {
  it("le bout libre ferme : le lump d'extrémité appartient à la poutre", () => {
    const { model, frames } = run(cantileverJson);
    const tip = terminal_key(model.beamCohesionSpecs);
    const balance = last(frames).balances.find((b) => b.key === tip)!;
    expect(balance.atAnchor).toBe(false);
    expect(balance.residual.length() / balance.scale).toBeLessThan(0.01);
  }, 30_000);

  it("l'encastrement rend la réaction et le moment de la statique", () => {
    const { frames } = run(cantileverJson);
    const anchors = frames[0].balances.filter((b) => b.atAnchor).map((b) => b.key);
    expect(anchors).toHaveLength(1);
    const of = (read: (b: NodeBalance) => number) =>
      mean(frames.map((f) => read(f.balances.find((b) => b.key === anchors[0])!)));

    expect(relative(of((b) => b.reaction!.y), 40.804)).toBeLessThan(0.02);
    expect(relative(of((b) => b.reactionMoment!), 25.402)).toBeLessThan(0.02);
  }, 30_000);
});
