/**
 * Does a constraint name the parts it holds, and only those?
 *
 * The measure that matters is a negative one: reading every key of a link and taking
 * whatever sits on each node reaches the neighbours of the parts it holds, because a fused
 * node belongs to everything meeting there. These tests pin the narrowing — and pin that it
 * is a narrowing, never a different answer.
 */

import { describe, expect, it } from "vitest";
import coreXY from "../../../test-mechanisms/Core XY.slidep?raw";
import huygens from "../../../test-mechanisms/Huygen's chain drive.slidep?raw";
import jansen from "../../../test-mechanisms/Jansen's linkage.slidep?raw";
import doubleSlider from "../../../test-mechanisms/Vilbrequin double slider.slidep?raw";
import vilbrequin from "../../../test-mechanisms/Vilbrequin.slidep?raw";
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
import {
  build_analysis_model,
  elements_of_key,
  variable_keys_of,
} from "./analysis-model";
import { constraint_elements } from "./constraint-parts";

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

const links_of = (els: MechanicalElement[]): Link[] =>
  build_analysis_model(mechanism(els)).links;

/** What reading each key on its own would have named — the answer this module narrows. */
function every_key_element(link: Link): ID[] {
  const named = new Set<ID>();
  if (link.owner !== undefined) named.add(link.owner);
  for (const key of variable_keys_of(link))
    for (const el of elements_of_key(key)) named.add(el);
  return [...named].sort();
}

describe("constraint_elements", () => {
  it("une longueur ne nomme que sa poutre, pas les voisines de ses nœuds", () => {
    // Le défaut à lever : les deux nœuds de b2 portent aussi b1 et b3, et une lecture
    // clé par clé allumait donc tout le quatre-barres pour la longueur d'une seule barre.
    const links = links_of([
      pivot("p1", P(0, 0), true, [id("b1")]),
      pivot("p2", P(0, 100), false, [id("b1"), id("b2")]),
      pivot("p3", P(200, 120), false, [id("b2"), id("b3")]),
      pivot("p4", P(200, 0), true, [id("b3")]),
      beam("b1", P(0, 0), P(0, 100), "p1", "p2"),
      beam("b2", P(0, 100), P(200, 120), "p2", "p3"),
      beam("b3", P(200, 120), P(200, 0), "p3", "p4"),
    ]);

    const length = links.find(
      (l) => l.type === "Distance" && l.owner === id("b2"),
    );
    expect(length).toBeDefined();
    expect(constraint_elements(length!)).toEqual([id("b2")]);
    // Et la lecture naïve, pour que l'écart soit une mesure et pas une intention.
    expect(every_key_element(length!)).toContain(id("b1"));
  });

  it("un verrou d'angle nomme ses deux poutres et le nœud qui les tient", () => {
    // Là où l'`owner` seul ne suffit pas : la contrainte est entre le rail et la poutre
    // portée, et le slider n'est que la pièce sous laquelle le parser l'a rangée.
    const links = links_of([
      join("g1", P(0, 0), true, [id("rail")]),
      join("g2", P(400, 0), true, [id("rail")]),
      beam("rail", P(0, 0), P(400, 0), "g1", "g2", [id("s1"), id("s2")]),
      sliderNode("s1", P(100, 0), "rail", [id("carried")]),
      sliderNode("s2", P(300, 0), "rail", [id("carried")]),
      beam("carried", P(100, 0), P(300, 0), "s1", "s2"),
    ]);

    const lock = links.find((l) => l.type === "Angle" && l.owner === id("s1"));
    expect(lock).toBeDefined();
    expect(constraint_elements(lock!)).toEqual(
      [id("s1"), id("rail"), id("carried")].sort(),
    );
    // L'autre slider est sur le rail, donc sur les mêmes nœuds — et il n'a rien à voir
    // avec ce verrou-ci.
    expect(constraint_elements(lock!)).not.toContain(id("s2"));
  });

  it("une glissière nomme son rail et le nœud qui y coulisse", () => {
    const links = links_of([
      join("g1", P(0, 0), true, [id("rail")]),
      join("g2", P(400, 0), true, [id("rail")]),
      beam("rail", P(0, 0), P(400, 0), "g1", "g2", [id("s1")]),
      sliderNode("s1", P(100, 0), "rail", []),
    ]);

    const slide = links.find((l) => l.type === "SlideOnSegment");
    expect(slide).toBeDefined();
    expect(constraint_elements(slide!)).toEqual([id("s1"), id("rail")].sort());
  });

  it("deux points sans pièce commune se nomment tous les deux", () => {
    // Le repli, qui est un vrai cas et pas une garde : une cote entre deux pièces
    // étrangères ne traverse rien, et ses deux bouts sont alors ce qu'elle tient.
    const dimension: Link = {
      type: "Distance",
      ddl: 1,
      key1: `${id("a")}:end`,
      key2: `${id("b")}:start`,
      distance: 10,
    };
    expect(constraint_elements(dimension)).toEqual([id("a"), id("b")].sort());
  });

  it("ne nomme jamais une pièce que la lecture clé par clé ne nommait pas", () => {
    // L'invariant qui tient les deux ensemble : c'est un rétrécissement, jamais une
    // autre réponse. Un type de lien ajouté qui se tromperait de clé le dirait ici.
    for (const json of [vilbrequin, jansen, huygens, coreXY, doubleSlider]) {
      const model = build_analysis_model(
        load_mechanism(JSON.parse(json)).mechanism,
      );
      for (const link of model.links) {
        const wide = new Set(every_key_element(link));
        for (const el of constraint_elements(link)) expect(wide).toContain(el);
      }
    }
  });
});
