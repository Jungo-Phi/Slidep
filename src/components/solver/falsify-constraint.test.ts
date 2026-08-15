/**
 * Does falsifying a constraint tell redundant from independent?
 *
 * The bench the design rests on. Leave-one-out already answers by rank; this asks by
 * consequence, and the two must agree — one bench, two independent methods, which is what
 * made the mobility probe trustworthy.
 *
 * What it establishes today: the principle holds, and on every mechanism but Core XY the
 * two verdicts match constraint for constraint. What it also establishes, and pins so it
 * cannot be forgotten: **no single size of lie separates them everywhere**. Told small, the
 * lie misses redundancies; told large, it catches an independent constraint that simply
 * cannot reach its new pose. That is the same scale-dependence the mobility probe's first
 * acceptance criterion died of, and it has to be answered before this becomes a detector.
 */

import { describe, expect, it } from "vitest";
import coreXY from "../../../test-mechanisms/Core XY.slidep?raw";
import huygens from "../../../test-mechanisms/Huygen's chain drive.slidep?raw";
import jansen from "../../../test-mechanisms/Jansen's linkage.slidep?raw";
import poulie from "../../../test-mechanisms/Poulie bloqueuse.slidep?raw";
import vilbrequin from "../../../test-mechanisms/Vilbrequin.slidep?raw";
import doubleSlider from "../../../test-mechanisms/Vilbrequin double slider.slidep?raw";
import {
  BeamElement,
  ID,
  Link,
  MechanicalElement,
  Mechanism,
  PivotElement,
  Point2,
} from "../../types";
import { DEFAULT_METADATA } from "../../types/mechanism";
import { load_mechanism } from "../../utils/load-mechanism";
import {
  AnalysisChain,
  AnalysisModel,
  build_analysis_model,
} from "./analysis-model";
import { chain_extent, probe_chain_mobility } from "./mobility-probe";
import { PBD_solve } from "./PBD_kinematic_solver";
import { solveNodesFromMaps } from "./nodes";
import {
  constraint_lever,
  falsify,
  is_falsifiable,
} from "./falsify-constraint";
import { find_redundant_links } from "./redundant-links";

const id = (s: string) =>
  `00000000-0000-0000-0000-${s.padStart(12, "0")}` as ID;
const P = (x: number, y: number) => new Point2(x, y);

function mechanism(mechanicalElements: MechanicalElement[]): Mechanism {
  return {
    metadata: DEFAULT_METADATA,
    viewport: { scale: 1, pan: new Point2<"screen">(0, 0) },
    mechanicalElements,
    constraintElements: [],
    loads: [],
    history: [],
    future: [],
  };
}

function pivot(n: string, pos: Point2, g: boolean, edges: ID[]): PivotElement {
  return {
    type: "pivot",
    id: id(n),
    probes: [],
    overlays: {},
    position: pos,
    isGrounded: g,
    rotatingEdgesIDs: edges,
    fixedGearsIDs: [],
    rotationalFriction: 0,
  };
}

function beam(
  n: string,
  a: Point2,
  b: Point2,
  s?: string,
  e?: string,
): BeamElement {
  return {
    type: "beam",
    id: id(n),
    probes: [],
    overlays: {},
    positionStart: a,
    positionEnd: b,
    fixedNodeStartID: s ? id(s) : undefined,
    fixedNodeEndID: e ? id(e) : undefined,
    fixedNodesBodyIDs: [],
    linearMass: 1,
  };
}

/** Sizes of lie tried, as a share of the chain's extent. Floored past the 1 mm reporting mark. */
const BIG_LIE = 0.05;
const SMALL_LIE = 0.002;
const MIN_LIE_MM = 3;
const SWEEPS = 3000;

/** Above this share of the lie, the mechanism is judged to have refused it. */
const RESISTED = 0.1;

/**
 * How much of the lie the mechanism refuses to absorb.
 *
 * Near zero the constraint's target was free to move and everything followed. Anything
 * appreciable means the lie stayed on the table — nothing could satisfy the set. Not bounded
 * by one: the residual it leaves behind lands on other constraints, through levers that can
 * multiply it several times over.
 */
function resistance(
  model: AnalysisModel,
  chain: AnalysisChain,
  link: Link,
  ratio: number,
): number {
  const extent = chain_extent(model, chain) || 1;
  const lie = Math.max(ratio * extent, MIN_LIE_MM);
  const lied = falsify(link, lie, constraint_lever(model, link, extent));
  if (!lied) return NaN;

  const nodes = solveNodesFromMaps(
    model.nodes.positions,
    model.nodes.posMasses,
    model.nodes.angles,
    new Map(),
    new Map(),
  );
  const residuals = PBD_solve(
    nodes,
    chain.links.map((l) => (l === link ? lied : l)),
    SWEEPS,
    1e-9,
    true,
    "constraints",
  );
  let worst = 0;
  for (const r of residuals ?? []) worst = Math.max(worst, r.residual);
  return worst / lie;
}

const analysed = (json: string) =>
  build_analysis_model(load_mechanism(JSON.parse(json)).mechanism);

/** Constraints the two methods disagree about, in both directions. */
function disagreements(model: AnalysisModel, ratio: number) {
  const missed: Link[] = [];
  const invented: Link[] = [];
  for (const chain of model.chains) {
    const mobility = probe_chain_mobility(model, chain);
    const spare = new Set(find_redundant_links(model, chain, mobility).links);
    for (const link of chain.links) {
      if (!is_falsifiable(link)) continue;
      const resisted = resistance(model, chain, link, ratio) > RESISTED;
      if (spare.has(link) && !resisted) missed.push(link);
      if (!spare.has(link) && resisted) invented.push(link);
    }
  }
  return { missed, invented };
}

const SLOW = 120_000;

describe("falsify", () => {
  it("une barre en double refuse le mensonge, une barre indépendante l'encaisse", () => {
    // Deux barres entre les deux mêmes pivots : l'une des deux est de trop. Allonger
    // n'importe laquelle demanderait à l'autre de mentir aussi, ce qu'elle ne peut pas.
    const doubled = build_analysis_model(
      mechanism([
        pivot("p1", P(0, 0), true, [id("b1"), id("b2")]),
        pivot("p2", P(100, 0), false, [id("b1"), id("b2")]),
        beam("b1", P(0, 0), P(100, 0), "p1", "p2"),
        beam("b2", P(0, 0), P(100, 0), "p1", "p2"),
      ]),
    );
    const doubledChain = doubled.chains[0];
    const doubledBars = doubledChain.links.filter((l) => l.type === "Distance");
    expect(doubledBars.length).toBeGreaterThanOrEqual(2);
    for (const link of doubledBars)
      expect(resistance(doubled, doubledChain, link, BIG_LIE)).toBeGreaterThan(
        RESISTED,
      );

    // Le même quatre-barres sain : une barre s'allonge, le mécanisme se réarrange.
    const healthy = build_analysis_model(
      mechanism([
        pivot("p1", P(0, 0), true, [id("b1")]),
        pivot("p2", P(0, 100), false, [id("b1"), id("b2")]),
        pivot("p3", P(200, 120), false, [id("b2"), id("b3")]),
        pivot("p4", P(200, 0), true, [id("b3")]),
        beam("b1", P(0, 0), P(0, 100), "p1", "p2"),
        beam("b2", P(0, 100), P(200, 120), "p2", "p3"),
        beam("b3", P(200, 120), P(200, 0), "p3", "p4"),
      ]),
    );
    const healthyChain = healthy.chains[0];
    for (const link of healthyChain.links.filter((l) => l.type === "Distance"))
      expect(resistance(healthy, healthyChain, link, BIG_LIE)).toBeLessThan(
        RESISTED,
      );
  });

  it(
    "s'accorde avec le leave-one-out, constrainte par contrainte",
    () => {
      // Deux chemins vers la même question — le rang d'un côté, la conséquence de
      // l'autre. Un désaccord voudrait dire que l'une des deux se trompe, et rien ne
      // dirait laquelle sans ce banc.
      for (const json of [vilbrequin, jansen, poulie, huygens, doubleSlider]) {
        const { missed, invented } = disagreements(analysed(json), BIG_LIE);
        expect(missed.map((l) => l.type)).toEqual([]);
        expect(invented.map((l) => l.type)).toEqual([]);
      }
    },
    SLOW,
  );

  it(
    "aucune taille de mensonge ne sépare partout",
    () => {
      // Le point qui bloque, mesuré sur Core XY et figé ici pour qu'il ne se perde pas.
      const model = analysed(coreXY);

      // Gros mensonge : une `Distance` pourtant indépendante résiste. Elle ne peut pas
      // atteindre sa nouvelle pose — une butée de glissière, pas un rang.
      const big = disagreements(model, BIG_LIE);
      expect(big.missed).toEqual([]);
      expect(big.invented.length).toBeGreaterThan(0);

      // Petit mensonge : l'accusation à tort disparaît, mais de vraies redondances
      // passent sous le seuil. Le verrou d'angle en est l'exemple — son bras de levier
      // est celui de la chaîne entière, donc le mensonge qu'il reçoit est minuscule.
      const small = disagreements(model, SMALL_LIE);
      expect(small.invented).toEqual([]);
      expect(small.missed.length).toBeGreaterThan(0);
    },
    SLOW,
  );

  it("couvre tout Core XY, glissières comprises", () => {
    // La couverture est une donnée du chantier, pas une note de bas de page. Une
    // glissière n'a pas de valeur propre : son mensonge est une place, à côté du rail.
    const chain = analysed(coreXY).chains[0];
    expect(chain.links.filter((l) => !is_falsifiable(l))).toEqual([]);
  });

  it("ce qui tient une quantité à zéro n'a rien à décaler", () => {
    // La part qui reste découverte, et pourquoi : falsifier un parallélisme demanderait
    // au solveur un terme qu'il n'a pas.
    const keys = {
      ddl: 1 as const,
      key1: "a",
      key2: "b",
      key3: "c",
      key4: "d",
    };
    expect(is_falsifiable({ type: "Parallel", ...keys })).toBe(false);
    expect(
      is_falsifiable({ type: "Horizontal", ddl: 1, key1: "a", key2: "b" }),
    ).toBe(false);
  });
});
