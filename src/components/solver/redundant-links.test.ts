import { describe, expect, it } from "vitest";
import coreXY from "../../../test-mechanisms/Core XY.slidep?raw";
import decon from "../../../test-mechanisms/Déconnexion courroie.slidep?raw";
import doubleSlider from "../../../test-mechanisms/Vilbrequin double slider.slidep?raw";
import huygens from "../../../test-mechanisms/Huygen's chain drive.slidep?raw";
import jansen from "../../../test-mechanisms/Jansen's linkage.slidep?raw";
import poulie from "../../../test-mechanisms/Poulie bloqueuse.slidep?raw";
import vilbrequin from "../../../test-mechanisms/Vilbrequin.slidep?raw";
import {
  BeamElement,
  ID,
  JoinElement,
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
  };
}

/** Every chain of a mechanism, with its mobility and its dispensable links. */
function audit(mech: Mechanism) {
  const model = build_analysis_model(mech);
  return model.chains.map((chain) => {
    const mobility = probe_chain_mobility(model, chain);
    return {
      chain,
      mobility,
      redundancy: find_redundant_links(model, chain, mobility),
    };
  });
}

const audited = (els: MechanicalElement[]) => audit(mechanism(els));
const fixture = (json: string) =>
  audit(load_mechanism(JSON.parse(json)).mechanism);

/**
 * Room for the measurements that audit a real mechanism.
 *
 * An audit is one mobility measurement per link, so a gallery chain costs hundreds of
 * solves — comfortably inside the default alone, not when the suite runs files in
 * parallel. The budget is the suite's contention, not the algorithm's speed.
 */
const SLOW = 30_000;

describe("find_redundant_links", () => {
  it("deux barres qui disent la même chose sont toutes deux signalées", () => {
    // h = 1, et pourtant deux liens sont individuellement retirables : l'un des deux
    // est de trop, et rien ne dit lequel. C'est la formulation honnête.
    const [{ mobility, redundancy }] = audited([
      pivot("p1", P(0, 0), true, [id("b1"), id("b2")]),
      pivot("p2", P(100, 0), false, [id("b1"), id("b2")]),
      beam("b1", P(0, 0), P(100, 0), "p1", "p2"),
      beam("b2", P(0, 0), P(100, 0), "p1", "p2"),
    ]);
    expect(mobility.hyperstaticity).toBe(1);
    expect(redundancy.groups.map((g) => g.owner)).toEqual(
      [id("b1"), id("b2")].sort(),
    );
  });

  it("un groupe montre les deux côtés de sa contrainte", () => {
    // Une contrainte est entre des pièces. L'`owner` n'est que celle sous laquelle le
    // parser l'a rangée : pointer elle seule laissait chercher contre quoi elle lutte.
    const [{ redundancy }] = audited([
      pivot("p1", P(0, 0), true, [id("b1"), id("b2")]),
      pivot("p2", P(100, 0), false, [id("b1"), id("b2")]),
      beam("b1", P(0, 0), P(100, 0), "p1", "p2"),
      beam("b2", P(0, 0), P(100, 0), "p1", "p2"),
    ]);
    for (const group of redundancy.groups) {
      expect(group.elements).toContain(group.owner);
      // La longueur d'une barre tient ses deux pivots, dont l'un est ancré et n'a donc
      // aucune variable libre : c'est bien la contrainte qu'on lit, pas la chaîne.
      expect(group.elements).toContain(id("p2"));
      expect(group.elements.length).toBeGreaterThan(1);
    }
  });

  it("une courroie parle d'une seule voix", () => {
    // Sa loi de non-glissement est un lien par brin : signalés un par un, ils
    // noieraient un lecteur qui n'a dessiné qu'une courroie.
    for (const { redundancy } of fixture(huygens)) {
      const belts = redundancy.links.filter(
        (l) => l.type === "BeltSegmentNoSlip",
      );
      if (belts.length === 0) continue;
      expect(belts.length).toBeGreaterThan(1);
      expect(new Set(belts.map((l) => l.owner)).size).toBe(1);
      expect(
        redundancy.groups.filter((g) =>
          g.links.some((l) => l.type === "BeltSegmentNoSlip"),
        ),
      ).toHaveLength(1);
    }
  }, SLOW);

  it("un mécanisme sain ne signale rien", () => {
    const [{ mobility, redundancy }] = audited([
      pivot("p1", P(0, 0), true, [id("b1")]),
      pivot("p2", P(0, 100), false, [id("b1"), id("b2")]),
      pivot("p3", P(200, 120), false, [id("b2"), id("b3")]),
      pivot("p4", P(200, 0), true, [id("b3")]),
      beam("b1", P(0, 0), P(0, 100), "p1", "p2"),
      beam("b2", P(0, 100), P(200, 120), "p2", "p3"),
      beam("b3", P(200, 120), P(200, 0), "p3", "p4"),
    ]);
    expect(mobility.hyperstaticity).toBe(0);
    expect(redundancy.links).toHaveLength(0);
  });

  it("les verrous d'angle des deux sliders sont les liens de trop", () => {
    // Le défaut trouvé en phase 2 : la poutre portée est colinéaire au rail par
    // construction, donc les deux `Angle` d'`add_rigidity_links` verrouillent une
    // orientation déjà imposée. L'outil doit maintenant les nommer.
    const [{ mobility, redundancy }] = audited([
      join("g1", P(0, 0), true, [id("rail")]),
      join("g2", P(400, 0), true, [id("rail")]),
      beam("rail", P(0, 0), P(400, 0), "g1", "g2", [id("s1"), id("s2")]),
      sliderNode("s1", P(100, 0), "rail", [id("carried")]),
      sliderNode("s2", P(300, 0), "rail", [id("carried")]),
      beam("carried", P(100, 0), P(300, 0), "s1", "s2"),
    ]);
    expect(mobility.hyperstaticity).toBe(2);
    expect(redundancy.links.filter((l) => l.type === "Angle")).toHaveLength(2);
    // Et la mesure de ce qu'un test par lien ne sait pas faire : les deux
    // `SlideOnSegment` sortent aussi, car retirer l'un laisse l'autre plus la
    // distance et les verrous tenir la poutre. Quatre candidats pour h = 2.
    expect(redundancy.links.length).toBeGreaterThan(
      mobility.hyperstaticity,
    );
  });

  it("ne signale jamais rien sur une chaîne isostatique", () => {
    // Les chaînes hyperstatiques sont sautées plutôt que mesurées : l'audit de Core XY
    // coûte 2,6 s à lui seul, et ce n'est pas ce que ce test regarde.
    for (const json of [
      vilbrequin,
      jansen,
      decon,
      poulie,
      huygens,
      coreXY,
      doubleSlider,
    ]) {
      const model = build_analysis_model(
        load_mechanism(JSON.parse(json)).mechanism,
      );
      for (const chain of model.chains) {
        const mobility = probe_chain_mobility(model, chain);
        if (mobility.hyperstaticity !== 0) continue;
        expect(find_redundant_links(model, chain, mobility).links).toHaveLength(
          0,
        );
      }
    }
  }, SLOW);

  it("retirer un lien signalé ne libère effectivement aucun mouvement", () => {
    // La propriété qui définit la sortie, vérifiée sur un mécanisme réel plutôt que
    // sur la seule construction synthétique.
    const model = build_analysis_model(
      load_mechanism(JSON.parse(jansen)).mechanism,
    );
    for (const chain of model.chains) {
      const mobility = probe_chain_mobility(model, chain);
      const { links } = find_redundant_links(model, chain, mobility);
      for (const link of links) {
        const without = {
          ...chain,
          links: chain.links.filter((other) => other !== link),
          constraintRows: chain.constraintRows - link.ddl,
          grublerCount: chain.grublerCount + link.ddl,
        };
        expect(probe_chain_mobility(model, without).mobility).toBe(
          mobility.mobility,
        );
      }
    }
  }, SLOW);
});
