/**
 * Does straining against a falsified constraint show what over-constraint means?
 *
 * The claim the panel makes: a joint the leave-one-out already found dispensable, asked for a
 * slightly wrong value, makes the assembly fight itself — and the fight is legible.
 *
 * Two things measured on the gallery are pinned here because they shaped the design. The lie
 * has to stay SMALL: a few per cent of the extent leaves every mechanism in pieces, which is
 * a jam and not a strain. And the answer has to be MAGNIFIED, aimed at the stretching rather
 * than at the travel, because a heavily over-constrained mechanism barely moves at all and
 * puts its whole error into one short bar.
 */

import { describe, expect, it } from "vitest";
import coreXY from "../../../test-mechanisms/Core XY.slidep?raw";
import jansen from "../../../test-mechanisms/Jansen's linkage.slidep?raw";
import poulie from "../../../test-mechanisms/Poulie bloqueuse.slidep?raw";
import { BeamElement, Link, Mechanism } from "../../types";
import { load_mechanism } from "../../utils/load-mechanism";
import {
  AnalysisChain,
  AnalysisModel,
  build_analysis_model,
  canonical_key,
  variable_keys_of,
} from "./analysis-model";
import { animate_strain, strained_link } from "./strain-animation";
import { probe_chain_mobility } from "./mobility-probe";
import { find_redundant_links } from "./redundant-links";
import { PBD_solve } from "./PBD_kinematic_solver";
import { solveNodesFromMaps } from "./nodes";
import { Point2 } from "../../types";

/** A 60 Hz frame, and how many of them a full there-and-back strain takes. */
const DT = 1 / 60;
const PERIOD_FRAMES = 96;

const loaded = (json: string) => load_mechanism(JSON.parse(json)).mechanism;

/** The first constraint the leave-one-out found dispensable, and its chain. */
function first_redundancy(json: string): {
  mechanism: Mechanism;
  model: AnalysisModel;
  chain: AnalysisChain;
  link: Link;
} {
  const mechanism = loaded(json);
  const model = build_analysis_model(mechanism);
  for (const chain of model.chains) {
    const mobility = probe_chain_mobility(model, chain);
    if (mobility.hyperstaticity === 0) continue;
    const audit = find_redundant_links(model, chain, mobility);
    for (const group of audit.groups) {
      const link = strained_link(group.links);
      if (link) return { mechanism, model, chain, link };
    }
  }
  throw new Error("aucune redondance à mettre en scène");
}

/** Length of every beam, by id. */
function beam_lengths(m: Mechanism): Map<string, number> {
  const lengths = new Map<string, number>();
  for (const el of m.mechanicalElements)
    if (el.type === "beam") {
      const b = el as BeamElement;
      lengths.set(b.id, b.positionStart.distance_to(b.positionEnd));
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

/** Worst relative length change any beam shows over a full swing. */
function worst_deformation(json: string): number {
  const { mechanism, model, chain, link } = first_redundancy(json);
  const animation = animate_strain(mechanism, model, chain, link)!;
  const rest = beam_lengths(mechanism);
  let worst = 0;
  for (let i = 0; i < PERIOD_FRAMES; i++) {
    for (const [id, held] of beam_lengths(animation.advance(DT))) {
      const at_rest = rest.get(id)!;
      if (at_rest < 1) continue;
      worst = Math.max(worst, Math.abs(held - at_rest) / at_rest);
    }
  }
  return worst;
}

const SLOW = 60_000;

describe("animate_strain", () => {
  it("déforme visiblement, et sans mettre le dessin en pièces", () => {
    // Les deux bornes tiennent ensemble ou pas du tout : trop peu et le mécanisme a
    // l'air de suivre, trop et il a l'air cassé. C'est le grossissement qui les tient,
    // pas la taille du mensonge.
    for (const json of [jansen, coreXY]) {
      const deformation = worst_deformation(json);
      expect(deformation).toBeGreaterThan(0.02);
      expect(deformation).toBeLessThan(0.2);
    }
  }, SLOW);

  it("ne montre rien quand rien ne peut répondre", () => {
    // Une courroie dont toutes les poulies sont ancrées : sa longueur ne peut être
    // fausse dans aucune direction où quoi que ce soit puisse bouger. Le panneau le dit
    // en n'animant pas, plutôt qu'en jouant une image immobile qui aurait l'air en panne.
    const mechanism = loaded(poulie);
    const model = build_analysis_model(mechanism);
    const chain = model.chains.find((c) =>
      c.links.some((l) => l.type === "BeltLength"),
    )!;
    const belt = chain.links.find((l) => l.type === "BeltLength")!;
    expect(animate_strain(mechanism, model, chain, belt)).toBeUndefined();
  });

  it("s'ouvre et se referme sur la pose de repos", () => {
    // sin(0) = 0 aux deux bouts, et chaque pose repart du repos plutôt que de la
    // précédente : un système faux ne converge pas, donc réchauffé il ramperait.
    const { mechanism, model, chain, link } = first_redundancy(jansen);
    const animation = animate_strain(mechanism, model, chain, link)!;
    expect(max_shift(mechanism, animation.advance(1e-6))).toBeLessThan(0.5);
    let pose = mechanism;
    for (let i = 0; i < PERIOD_FRAMES; i++) pose = animation.advance(DT);
    expect(max_shift(mechanism, pose)).toBeLessThan(0.5);
  }, SLOW);

  it("ne touche jamais le mécanisme qu'on lui confie", () => {
    const { mechanism, model, chain, link } = first_redundancy(jansen);
    const before = JSON.stringify(mechanism.mechanicalElements);
    const animation = animate_strain(mechanism, model, chain, link)!;
    for (let i = 0; i < 30; i++) animation.advance(DT);
    expect(JSON.stringify(mechanism.mechanicalElements)).toBe(before);
  }, SLOW);

  it("tient le rythme d'une frame", () => {
    // Un système falsifié ne converge jamais, donc le solve dépense son budget entier à
    // chaque pose : c'est ici que ça se paie, ou nulle part.
    const mechanism = loaded(coreXY);
    const model = build_analysis_model(mechanism);
    const chain = model.chains[0];
    const animation = chain.links
      .map((link) => animate_strain(mechanism, model, chain, link))
      .find((a) => a !== undefined)!;
    for (let i = 0; i < 5; i++) animation.advance(DT); // chauffe
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) animation.advance(DT);
    // La marge est large parce que la mesure l'est : la suite complète tourne en
    // parallèle et le même calcul y met la moitié plus de temps. Ce que ce test
    // attrape est un ordre de grandeur perdu, pas une dérive de quelques pour cent.
    expect((performance.now() - t0) / 20).toBeLessThan(50);
  });
});

describe("strained_link", () => {
  it("choisit le même lien quel que soit l'ordre des éléments", () => {
    // L'ordre de parsing bouge à chaque édition ; le mécanisme, lui, ne change pas, et
    // il doit s'arc-bouter de la même manière.
    const spelling = (link: Link) =>
      `${link.type} ${link.owner} ${variable_keys_of(link)
        .map(canonical_key)
        .sort()
        .join("|")}`;
    const straight = loaded(jansen);
    const reversed: Mechanism = {
      ...straight,
      mechanicalElements: [...straight.mechanicalElements].reverse(),
    };
    const pick = (m: Mechanism) =>
      strained_link(build_analysis_model(m).chains[0].links)!;
    expect(spelling(pick(straight))).toBe(spelling(pick(reversed)));
  });
});

describe("normalOffset", () => {
  it("écarte le nœud de son rail, du côté où il se trouve déjà", () => {
    // La cible que `SlideOnSegment` n'avait pas : un rail ne porte aucune valeur à
    // fausser, donc son mensonge est une place — le point est prié de se tenir à côté.
    const P = (x: number, y: number) => new Point2(x, y);
    const nodes = solveNodesFromMaps(
      new Map([
        ["rail:start", P(0, 0)],
        ["rail:end", P(100, 0)],
        ["node", P(40, 0)],
      ]),
      new Map([
        ["rail:start", 0],
        ["rail:end", 0],
        ["node", 1],
      ]),
      new Map(),
      new Map(),
      new Map(),
    );
    const link: Link = {
      type: "SlideOnSegment",
      ddl: 1,
      key1: "rail:start",
      key2: "rail:end",
      key3: "node",
      normalOffset: 10,
    };
    PBD_solve(nodes, [link], 50, 1e-9, false, "constraints");

    const slot = nodes.index.get("node")!;
    expect(Math.abs(nodes.y[slot])).toBeCloseTo(10, 6);
    // Le glissement reste libre : la contrainte n'agit que perpendiculairement.
    expect(nodes.x[slot]).toBeCloseTo(40, 6);
  });
});
