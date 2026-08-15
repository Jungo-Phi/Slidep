/**
 * Does each symbol's geometry actually point at the way its constraint yields?
 */

import { describe, expect, it } from "vitest";
import poulie from "../../../test-mechanisms/Poulie bloqueuse.slidep?raw";
import {
  BeamElement,
  ID,
  JoinElement,
  Link,
  MechanicalElement,
  Mechanism,
  PivotElement,
  Point2,
  SliderElement,
} from "../../types";
import { DEFAULT_METADATA } from "../../types/mechanism";
import { load_mechanism } from "../../utils/load-mechanism";
import { build_analysis_model } from "./analysis-model";
import { probe_chain_mobility } from "./mobility-probe";
import { find_redundant_links } from "./redundant-links";
import { redundancy_symbol } from "./redundancy-symbols";

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

function join(n: string, pos: Point2, g: boolean, edges: ID[]): JoinElement {
  return {
    type: "join",
    id: id(n),
    probes: [],
    overlays: {},
    position: pos,
    isGrounded: g,
    fixedEdgesIDs: edges,
  };
}

function sliderNode(
  n: string,
  pos: Point2,
  rail: string,
  edges: ID[],
): SliderElement {
  return {
    type: "slider",
    id: id(n),
    probes: [],
    overlays: {},
    position: pos,
    isGrounded: false,
    parentBeamID: id(rail),
    fixedEdgesIDs: edges,
    slidingFriction: 0,
  };
}

function beam(
  n: string,
  a: Point2,
  b: Point2,
  s?: string,
  e?: string,
  body: ID[] = [],
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
    fixedNodesBodyIDs: body,
    linearMass: 1,
  };
}

describe("redundancy_symbol", () => {
  it("une longueur s'écarte le long de son propre axe", () => {
    const model = build_analysis_model(
      mechanism([
        pivot("p1", P(0, 0), true, [id("b1"), id("b2")]),
        pivot("p2", P(100, 0), false, [id("b1"), id("b2")]),
        beam("b1", P(0, 0), P(100, 0), "p1", "p2"),
        beam("b2", P(0, 0), P(100, 0), "p1", "p2"),
      ]),
    );
    const length = model.links.find(
      (l) => l.type === "Distance" && l.owner === id("b2"),
    );
    expect(length).toBeDefined();
    const symbol = redundancy_symbol(model, length!);
    expect(symbol?.kind).toBe("gap");
    if (symbol?.kind !== "gap") return;
    // Les deux points tenus, exactement — le lien connaît ses pivots par
    // construction dans ce cas synthétique.
    expect([symbol.a.x, symbol.a.y]).toEqual([0, 0]);
    expect([symbol.b.x, symbol.b.y]).toEqual([100, 0]);
  });

  it("un verrou d'angle diverge depuis le nœud partagé, pas depuis un bout arbitraire", () => {
    const model = build_analysis_model(
      mechanism([
        join("g1", P(0, 0), true, [id("rail")]),
        join("g2", P(400, 0), true, [id("rail")]),
        beam("rail", P(0, 0), P(400, 0), "g1", "g2", [id("s1"), id("s2")]),
        sliderNode("s1", P(100, 0), "rail", [id("carried")]),
        sliderNode("s2", P(300, 0), "rail", [id("carried")]),
        beam("carried", P(100, 0), P(300, 0), "s1", "s2"),
      ]),
    );
    const lock = model.links.find(
      (l) => l.type === "Angle" && l.owner === id("s1"),
    );
    expect(lock).toBeDefined();
    const symbol = redundancy_symbol(model, lock!);
    expect(symbol?.kind).toBe("diverge");
    if (symbol?.kind !== "diverge") return;
    // Le sommet est le slider s1 (100, 0), où le rail et la poutre portée se
    // rencontrent — jamais l'autre bout de l'un ou l'autre segment.
    expect(symbol.vertex.x).toBeCloseTo(100);
    expect(symbol.vertex.y).toBeCloseTo(0);
    expect(symbol.arm1.length()).toBeCloseTo(1);
    expect(symbol.arm2.length()).toBeCloseTo(1);
  });

  it("un point sur rail se soulève perpendiculairement au rail", () => {
    const model = build_analysis_model(
      mechanism([
        join("g1", P(0, 0), true, [id("rail")]),
        join("g2", P(400, 0), true, [id("rail")]),
        beam("rail", P(0, 0), P(400, 0), "g1", "g2", [id("s1")]),
        sliderNode("s1", P(100, 0), "rail", []),
      ]),
    );
    const slide = model.links.find((l) => l.type === "SlideOnSegment");
    expect(slide).toBeDefined();
    const symbol = redundancy_symbol(model, slide!);
    expect(symbol?.kind).toBe("off-rail");
    if (symbol?.kind !== "off-rail") return;
    expect(symbol.at.x).toBeCloseTo(100);
    expect(symbol.at.y).toBeCloseTo(0);
    // Perpendiculaire à un rail horizontal : composante x nulle.
    expect(symbol.normal.x).toBeCloseTo(0);
    expect(Math.abs(symbol.normal.y)).toBeCloseTo(1);
  });

  it("une courroie fermée s'écarte entre deux poulies, jamais entre un start et un end fantômes", () => {
    // Sur une courroie fermée, `startKey`/`endKey` ne sont pas absents des positions —
    // ils y résolvent tous les deux, mais vers le MÊME point fusionné : un `??` qui ne
    // teste que l'absence ne tombe donc jamais sur le repli, et l'écart mesuré est nul.
    // "Poulie bloqueuse" est ce cas mesuré : sa seule candidate est `BeltLength`.
    const model = build_analysis_model(
      load_mechanism(JSON.parse(poulie)).mechanism,
    );
    const chain = model.chains.find(
      (c) => probe_chain_mobility(model, c).hyperstaticity > 0,
    );
    expect(chain).toBeDefined();
    const mobility = probe_chain_mobility(model, chain!);
    const { links } = find_redundant_links(model, chain!, mobility);
    const belt = links.find((l) => l.type === "BeltLength");
    expect(belt).toBeDefined();
    const symbol = redundancy_symbol(model, belt!);
    expect(symbol?.kind).toBe("gap");
    if (symbol?.kind !== "gap") return;
    expect(symbol.a.distance_to(symbol.b)).toBeGreaterThan(0);
  });

  it("un type hors du périmètre mesuré ne rend aucun symbole", () => {
    const model = build_analysis_model(
      mechanism([
        pivot("p1", P(0, 0), true, [id("b1")]),
        beam("b1", P(0, 0), P(100, 0), "p1"),
      ]),
    );
    const horizontal: Link = {
      type: "Horizontal",
      ddl: 1,
      key1: `${id("b1")}:start`,
      key2: `${id("b1")}:end`,
    };
    expect(redundancy_symbol(model, horizontal)).toBeUndefined();
  });
});
