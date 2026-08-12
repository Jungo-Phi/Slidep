import { describe, expect, it } from "vitest";
import coreXY from "../../../test-mechanisms/Core XY.slidep?raw";
import coreXY2 from "../../../test-mechanisms/Core XY - 2 moteurs.slidep?raw";
import decon from "../../../test-mechanisms/Déconnexion courroie.slidep?raw";
import doubleSlider from "../../../test-mechanisms/Vilbrequin double slider.slidep?raw";
import huygens from "../../../test-mechanisms/Huygen's chain drive.slidep?raw";
import jansen from "../../../test-mechanisms/Jansen's linkage.slidep?raw";
import poulie from "../../../test-mechanisms/Poulie bloqueuse.slidep?raw";
import roues from "../../../test-mechanisms/Roues isolées.slidep?raw";
import slider from "../../../test-mechanisms/Test slider.slidep?raw";
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
} from "../../types";
import { DEFAULT_METADATA } from "../../types/mechanism";
import { load_mechanism } from "../../utils/load-mechanism";
import {
  build_analysis_model,
  canonical_key,
  variable_keys_of,
} from "./analysis-model";
import { keys_of } from "./utils";

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
  };
}

const FOUR_BAR: MechanicalElement[] = [
  pivot("p1", P(0, 0), true, [id("b1")]),
  pivot("p2", P(0, 100), false, [id("b1"), id("b2")]),
  pivot("p3", P(200, 120), false, [id("b2"), id("b3")]),
  pivot("p4", P(200, 0), true, [id("b3")]),
  beam("b1", P(0, 0), P(0, 100), "p1", "p2"),
  beam("b2", P(0, 100), P(200, 120), "p2", "p3"),
  beam("b3", P(200, 120), P(200, 0), "p3", "p4"),
];

const GROUNDED_FRAME = (n: string, y: number): MechanicalElement[] => [
  join(`${n}1`, P(0, y), true, [id(n)]),
  join(`${n}2`, P(100, y), true, [id(n)]),
  beam(n, P(0, y), P(100, y), `${n}1`, `${n}2`),
];

/** Grübler counts per chain, grounded chain first. */
const counts = (els: MechanicalElement[]) =>
  build_analysis_model(mechanism(els)).chains.map((c) => c.grublerCount);

describe("build_analysis_model — cas synthétiques", () => {
  it("un bâti soudé au sol ne compte ni mobilité ni redondance", () => {
    // Un join groundé ancre l'extrémité opposée de sa poutre, et la fusion des
    // Coincidence rend le Distance restant purement inerte. Sans élagage, le
    // décompte brut donnait −5. Il reste une chaîne triviale : le bâti existe.
    const model = build_analysis_model(mechanism(GROUNDED_FRAME("b1", 0)));
    expect(model.links).toHaveLength(0);
    expect(model.pruned.filter((p) => p.reason === "inert")).toHaveLength(1);
    expect(model.chains).toHaveLength(1);
    expect(model.chains[0].freeVariables).toBe(0);
    expect(model.chains[0].grounded).toBe(true);
    expect(model.chains[0].grublerCount).toBe(0);
    expect(new Set(model.chains[0].elements)).toEqual(
      new Set([id("b1"), id("b11"), id("b12")]),
    );
  });

  it("deux bâtis séparés forment deux chaînes triviales, jamais une seule", () => {
    const model = build_analysis_model(
      mechanism([...GROUNDED_FRAME("b1", 0), ...GROUNDED_FRAME("b2", 500)]),
    );
    expect(model.links).toHaveLength(0);
    expect(model.pruned.filter((p) => p.reason === "inert")).toHaveLength(2);
    expect(model.chains).toHaveLength(2);
    expect(model.chains.every((c) => c.freeVariables === 0)).toBe(true);
    expect(model.chains.every((c) => c.grounded)).toBe(true);
    expect(model.chains.every((c) => c.grublerCount === 0)).toBe(true);
    // Rien ne se partage entre les deux : ils ne sont pas soudés l'un à l'autre.
    const seen = new Set<ID>();
    for (const chain of model.chains)
      for (const el of chain.elements) {
        expect(seen.has(el)).toBe(false);
        seen.add(el);
      }
    expect(seen.size).toBe(6);
  });

  it("deux poutres redondantes entre les mêmes pivots : l'élagage ne peut pas le voir", () => {
    // m = 1 (rotation autour de p1), h = 1 (les deux longueurs disent la même
    // chose) → G = 0. Aucun lien n'est inerte : seul le rang peut trancher, ce
    // qui est la raison d'être de la sonde de mobilité.
    const model = build_analysis_model(
      mechanism([
        pivot("p1", P(0, 0), true, [id("b1"), id("b2")]),
        pivot("p2", P(100, 0), false, [id("b1"), id("b2")]),
        beam("b1", P(0, 0), P(100, 0), "p1", "p2"),
        beam("b2", P(0, 0), P(100, 0), "p1", "p2"),
      ]),
    );
    expect(model.pruned.filter((p) => p.reason === "inert")).toHaveLength(0);
    expect(model.links.filter((l) => l.type === "Distance")).toHaveLength(2);
    expect(model.chains.map((c) => c.grublerCount)).toEqual([0]);
  });

  it("deux poutres sur un même pivot groundé sont deux chaînes indépendantes", () => {
    // Elles pivotent chacune de leur côté : les relier par le sol dirait le
    // contraire. Le graphe ne porte que sur les variables libres.
    const model = build_analysis_model(
      mechanism([
        pivot("p1", P(0, 0), true, [id("b1"), id("b2")]),
        beam("b1", P(0, 0), P(100, 0), "p1"),
        beam("b2", P(0, 0), P(0, 100), "p1"),
      ]),
    );
    expect(model.chains.map((c) => c.grublerCount)).toEqual([1, 1]);
    expect(model.chains.every((c) => c.grounded)).toBe(true);
  });

  it("une poutre libre isolée est une chaîne flottante à 3", () => {
    const model = build_analysis_model(
      mechanism([beam("z1", P(0, 0), P(100, 0))]),
    );
    expect(model.chains).toHaveLength(1);
    expect(model.chains[0].grounded).toBe(false);
    expect(model.chains[0].grublerCount).toBe(3);
  });

  it("un nœud groundé sans rien autour produit une chaîne triviale", () => {
    const model = build_analysis_model(
      mechanism([join("j1", P(0, 0), true, [])]),
    );
    expect(model.chains).toHaveLength(1);
    expect(model.chains[0].freeVariables).toBe(0);
    expect(model.chains[0].grounded).toBe(true);
    expect(model.chains[0].grublerCount).toBe(0);
    expect(model.chains[0].elements).toEqual([id("j1")]);
  });

  it("un quatre-barres est une chaîne ancrée à 1", () => {
    const model = build_analysis_model(mechanism(FOUR_BAR));
    expect(model.chains).toHaveLength(1);
    expect(model.chains[0].grounded).toBe(true);
    expect(model.chains[0].grublerCount).toBe(1);
  });

  it("un quatre-barres et une poutre libre sont deux chaînes, jamais une somme", () => {
    // Le panneau affichait 4 pour cet ensemble : 1 + 3, qui ne décrit rien.
    expect(counts([...FOUR_BAR, beam("z9", P(500, 500), P(600, 500))])).toEqual([
      1, 3,
    ]);
  });

  it("la chaîne ancrée passe en premier, les flottantes ensuite", () => {
    const model = build_analysis_model(
      mechanism([beam("z9", P(500, 500), P(600, 500)), ...FOUR_BAR]),
    );
    expect(model.chains.map((c) => c.grounded)).toEqual([true, false]);
  });

  it("le modèle ne dépend pas de l'ordre des éléments", () => {
    const els = [...FOUR_BAR, beam("z9", P(500, 500), P(600, 500))];
    const forward = build_analysis_model(mechanism(els));
    const backward = build_analysis_model(mechanism([...els].reverse()));
    // Les clés fusionnées sont nommées dans l'ordre de parsing : c'est leur forme
    // canonique qui identifie le nœud, pas leur orthographe.
    const order = (m: typeof forward) =>
      m.variableOrder.map((v) => `${canonical_key(v.key)}#${v.component}`);
    expect(order(backward)).toEqual(order(forward));
    expect(backward.chains.map((c) => c.id)).toEqual(
      forward.chains.map((c) => c.id),
    );
    expect(backward.chains.map((c) => c.grublerCount)).toEqual(
      forward.chains.map((c) => c.grublerCount),
    );
    expect(backward.chains.map((c) => c.elements)).toEqual(
      forward.chains.map((c) => c.elements),
    );
  });
});

const fixture = (json: string) =>
  build_analysis_model(load_mechanism(JSON.parse(json)).mechanism);

describe("build_analysis_model — mécanismes de référence", () => {
  it("Vilbrequin : une chaîne ancrée, 1 moteur, décompte juste", () => {
    const model = fixture(vilbrequin);
    expect(model.chains).toHaveLength(1);
    expect(model.chains[0].motors).toHaveLength(1);
    expect(model.chains[0].grublerCount).toBe(1);
  });

  it("Test slider : le décompte tombe juste après élagage", () => {
    const model = fixture(slider);
    expect(model.chains.map((c) => c.grublerCount)).toEqual([1]);
  });

  it("Vilbrequin double slider : trois parties, dont une non ancrée", () => {
    const model = fixture(doubleSlider);
    expect(model.chains).toHaveLength(3);
    expect(model.chains.filter((c) => !c.grounded)).toHaveLength(1);
    // Les deux ancrées d'abord, la flottante en dernier.
    expect(model.chains.map((c) => c.grounded)).toEqual([true, true, false]);
    expect(model.chains.map((c) => c.grublerCount)).toEqual([-1, 2, 2]);
    // Chacune porte son moteur ; la masse libre n'en a pas.
    expect(model.chains.map((c) => c.motors.length)).toEqual([1, 1, 0]);
    // Chaque chaîne nomme ses propres éléments, sans recouvrement.
    const seen = new Set<ID>();
    for (const chain of model.chains)
      for (const el of chain.elements) {
        expect(seen.has(el)).toBe(false);
        seen.add(el);
      }
  });

  it("un join groundé soudé au milieu d'une barre reste dans la chaîne de cette barre", () => {
    // b93f0555 est fixé par FixedOnSegment au milieu de la barre 096ac8ba, dont les
    // deux bouts sont eux-mêmes ancrés (pris dans le décompte ci-dessus). Son seul
    // lien est donc inerte — mais il reste soudé, via ce lien, au même bloc ancré
    // que la barre, laquelle est réclamée par la chaîne 1 ailleurs. Il ne doit pas
    // se détacher en chaîne triviale à part.
    const model = fixture(doubleSlider);
    const midJoin = "b93f0555-aabd-4c47-ac33-a363a80425fe" as ID;
    expect(model.chains).toHaveLength(3);
    expect(model.chains.some((c) => c.elements.includes(midJoin))).toBe(
      false,
    );
  });

  it("les agrégats de courroie sont élagués comme conditionnement", () => {
    // Un BeltSubChainAggregate est la somme télescopée des BeltSegmentNoSlip qu'il
    // couvre : le compter fabriquerait de l'hyperstatisme inexistant.
    for (const json of [coreXY, coreXY2, huygens, poulie, decon]) {
      const model = fixture(json);
      expect(
        model.pruned.filter((p) => p.reason === "conditioning").length,
      ).toBeGreaterThan(0);
      expect(
        model.links.some((l) => l.type === "BeltSubChainAggregate"),
      ).toBe(false);
    }
  });

  it("un GearMeshAngle entre deux axes groundés n'est pas inerte", () => {
    // Ses deux clés de position sont ancrées, ses deux angles ne le sont jamais.
    // Le déclarer inerte détachait un angle en fausse chaîne flottante.
    const model = fixture(jansen);
    expect(model.links.some((l) => l.type === "GearMeshAngle")).toBe(true);
    expect(model.chains).toHaveLength(1);
  });

  it("Roues isolées : une roue portée reste avec ce qui la porte", () => {
    // Trois roues, dont deux montées l'une sur l'autre. Rien ne relie l'angle d'une
    // roue à son centre, donc le seul graphe des liens éparpillait ce mécanisme en
    // quatre chaînes : le spin de chaque roue partait seul, et le pivot moteur ancré
    // formait en plus un doublon trivial de celui de sa roue.
    const model = fixture(roues);
    expect(model.chains).toHaveLength(2);
    // Aucune n'est flottante : les deux roues portantes sont sur des pivots groundés.
    expect(model.chains.map((c) => c.grounded)).toEqual([true, true]);
    expect(model.chains.map((c) => c.grublerCount)).toEqual([2, 1]);
    expect(model.chains.map((c) => c.motors.length)).toEqual([0, 1]);
  });

  it("deux chaînes ne portent jamais le même identifiant", () => {
    // L'identifiant sert de clé React à la liste du panneau et de clé de cache aux
    // audits de redondance. Une chaîne triviale se nomme d'après son premier élément,
    // lequel peut très bien porter une variable libre ailleurs — d'où le préfixe.
    for (const json of [vilbrequin, jansen, coreXY, doubleSlider, roues]) {
      const ids = fixture(json).chains.map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("décomptes de référence (m − h, borne inférieure de la mobilité)", () => {
    const G = (json: string) =>
      fixture(json).chains.map((c) => c.grublerCount);
    expect(G(vilbrequin)).toEqual([1]);
    expect(G(slider)).toEqual([1]);
    expect(G(jansen)).toEqual([0]);
    // Les trois mécanismes à boucle fermée valent un de plus que le décompte brut :
    // une loi de brin par boucle est élaguée, voir `closed_loop_surplus`.
    expect(G(decon)).toEqual([1]);
    expect(G(poulie)).toEqual([0]);
    expect(G(coreXY)).toEqual([-4]);
    expect(G(coreXY2)).toEqual([-4]);
    expect(G(huygens)).toEqual([6]);
  });

  it("une boucle de courroie fermée perd exactement une loi de brin", () => {
    for (const json of [decon, poulie, huygens]) {
      const model = fixture(json);
      const dropped = model.pruned.filter(
        (p) => p.link.type === "BeltSegmentNoSlip",
      );
      expect(dropped).toHaveLength(1);
      expect(dropped[0].reason).toBe("conditioning");
    }
    // Les courroies de Core XY sont ouvertes : aucune boucle à refermer, rien à retirer.
    expect(
      fixture(coreXY).pruned.filter(
        (p) => p.link.type === "BeltSegmentNoSlip",
      ),
    ).toHaveLength(0);
  });
});

describe("variable_keys_of", () => {
  it("couvre keys_of sur tous les liens des mécanismes de référence", () => {
    // Les deux extracteurs ne doivent pas diverger : keys_of sert le tri du
    // solveur (positions seules), celui-ci sert l'analyse (positions + angles).
    const seen = new Set<Link["type"]>();
    for (const json of [
      vilbrequin,
      slider,
      jansen,
      poulie,
      coreXY,
      coreXY2,
      huygens,
      decon,
      doubleSlider,
    ]) {
      const { mechanism: mech } = load_mechanism(JSON.parse(json));
      const model = build_analysis_model(mech);
      for (const link of [
        ...model.links,
        ...model.pruned.map((p) => p.link),
      ]) {
        seen.add(link.type);
        const complete = new Set(variable_keys_of(link));
        for (const key of keys_of(link)) expect(complete.has(key)).toBe(true);
      }
    }
    expect(seen.size).toBeGreaterThan(5);
  });
});
