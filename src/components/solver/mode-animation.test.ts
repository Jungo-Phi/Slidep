import { describe, expect, it } from "vitest";
import coreXY from "../../../test-mechanisms/Core XY.slidep?raw";
import jansen from "../../../test-mechanisms/Jansen's linkage.slidep?raw";
import vilbrequin from "../../../test-mechanisms/Vilbrequin.slidep?raw";
import { BeamElement, Mechanism } from "../../types";
import { load_mechanism } from "../../utils/load-mechanism";
import { build_analysis_model } from "./analysis-model";
import { animate_mode } from "./mode-animation";
import { probe_chain_mobility } from "./mobility-probe";
import { canonical_modes } from "./motion-modes";

/** A 60 Hz frame. */
const DT = 1 / 60;

function first_mode(json: string) {
  const mechanism = load_mechanism(JSON.parse(json)).mechanism;
  const model = build_analysis_model(mechanism);
  const chain = model.chains[0];
  const mode = canonical_modes(
    model,
    chain,
    probe_chain_mobility(model, chain),
  )[0];
  return { mechanism, model, chain, mode };
}

/** Length of every beam, by id — what a rigid motion must leave alone. */
function beam_lengths(mechanism: Mechanism): Map<string, number> {
  const lengths = new Map<string, number>();
  for (const el of mechanism.mechanicalElements)
    if (el.type === "beam") {
      const beam = el as BeamElement;
      lengths.set(
        beam.id,
        beam.positionStart.distance_to(beam.positionEnd),
      );
    }
  return lengths;
}

/** Largest distance any node moved between two poses. */
function max_shift(a: Mechanism, b: Mechanism): number {
  const byId = new Map(b.mechanicalElements.map((el) => [el.id, el]));
  let worst = 0;
  for (const el of a.mechanicalElements) {
    const other = byId.get(el.id);
    if (!other || !("position" in el) || !("position" in other)) continue;
    worst = Math.max(worst, el.position.distance_to(other.position));
  }
  return worst;
}

describe("animate_mode", () => {
  it("bouge le mécanisme", () => {
    const { mechanism, model, chain, mode } = first_mode(vilbrequin);
    const animation = animate_mode(mechanism, model, chain, mode);
    let pose = mechanism;
    for (let i = 0; i < 12; i++) pose = animation.advance(DT);
    expect(max_shift(mechanism, pose)).toBeGreaterThan(1);
  });

  it("ne touche jamais le mécanisme qu'on lui confie", () => {
    const { mechanism, model, chain, mode } = first_mode(vilbrequin);
    const before = JSON.stringify(mechanism.mechanicalElements);
    const animation = animate_mode(mechanism, model, chain, mode);
    for (let i = 0; i < 30; i++) animation.advance(DT);
    expect(JSON.stringify(mechanism.mechanicalElements)).toBe(before);
  });

  it("garde les poutres rigides tout au long du balancement", () => {
    // C'est la raison d'être du solve par pose : suivre la tangente en ligne
    // droite étirerait les barres qu'un mode est censé laisser rigides.
    for (const json of [vilbrequin, jansen, coreXY]) {
      const { mechanism, model, chain, mode } = first_mode(json);
      const rest = beam_lengths(mechanism);
      const animation = animate_mode(mechanism, model, chain, mode);
      for (let i = 0; i < 60; i++) {
        const lengths = beam_lengths(animation.advance(DT));
        for (const [id, length] of lengths) {
          const at_rest = rest.get(id)!;
          if (at_rest < 1) continue; // une barre dégénérée n'a pas de longueur à tenir
          expect(Math.abs(length - at_rest) / at_rest).toBeLessThan(0.01);
        }
      }
    }
  });

  it("repart de la pose de repos : le balancement s'ouvre et se ferme sur elle", () => {
    // sin(0) = 0, donc lâcher le survol ne laisse jamais le dessin ailleurs.
    const { mechanism, model, chain, mode } = first_mode(vilbrequin);
    const animation = animate_mode(mechanism, model, chain, mode);
    const first = animation.advance(1e-6);
    expect(max_shift(mechanism, first)).toBeLessThan(0.5);
  });

  it("n'emporte pas les chaînes voisines", () => {
    const { mechanism, model, chain, mode } = first_mode(coreXY);
    const animation = animate_mode(mechanism, model, chain, mode);
    let pose = mechanism;
    for (let i = 0; i < 20; i++) pose = animation.advance(DT);
    const moved = new Set(chain.elements);
    const byId = new Map(pose.mechanicalElements.map((el) => [el.id, el]));
    for (const el of mechanism.mechanicalElements) {
      if (moved.has(el.id) || !("position" in el)) continue;
      const after = byId.get(el.id);
      if (!after || !("position" in after)) continue;
      expect(el.position.distance_to(after.position)).toBeLessThan(1e-6);
    }
  });

  it("tient le rythme d'une frame", () => {
    // Le budget est de 16 ms à 60 Hz, et l'animation n'est qu'une part de la frame.
    const { mechanism, model, chain, mode } = first_mode(coreXY);
    const animation = animate_mode(mechanism, model, chain, mode);
    for (let i = 0; i < 10; i++) animation.advance(DT); // chauffe
    const t0 = performance.now();
    for (let i = 0; i < 30; i++) animation.advance(DT);
    const perFrame = (performance.now() - t0) / 30;
    expect(perFrame).toBeLessThan(16);
  });
});
