import { describe, expect, it } from "vitest";
import coreXY from "../../../test-mechanisms/Core XY.slidep?raw";
import decon from "../../../test-mechanisms/Déconnexion courroie.slidep?raw";
import doubleSlider from "../../../test-mechanisms/Vilbrequin double slider.slidep?raw";
import huygens from "../../../test-mechanisms/Huygen's chain drive.slidep?raw";
import jansen from "../../../test-mechanisms/Jansen's linkage.slidep?raw";
import poulie from "../../../test-mechanisms/Poulie bloqueuse.slidep?raw";
import slider from "../../../test-mechanisms/Test slider.slidep?raw";
import vilbrequin from "../../../test-mechanisms/Vilbrequin.slidep?raw";
import {
  BeamElement,
  BeltElement,
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
import { belt_without_gear } from "../../utils/belt-geom";
import { build_analysis_model, variable_keys_of } from "./analysis-model";
import { probe_chain_mobility, probe_mobility } from "./mobility-probe";

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

/** (m, h) of every chain, grounded first. */
function mobility(els: MechanicalElement[]): [number, number][] {
  const model = build_analysis_model(mechanism(els));
  return probe_mobility(model).map((r) => [r.mobility, r.hyperstaticity]);
}

describe("probe_chain_mobility — valeurs connues d'avance", () => {
  it("un quatre-barres a 1 degré de liberté", () => {
    expect(
      mobility([
        pivot("p1", P(0, 0), true, [id("b1")]),
        pivot("p2", P(0, 100), false, [id("b1"), id("b2")]),
        pivot("p3", P(200, 120), false, [id("b2"), id("b3")]),
        pivot("p4", P(200, 0), true, [id("b3")]),
        beam("b1", P(0, 0), P(0, 100), "p1", "p2"),
        beam("b2", P(0, 100), P(200, 120), "p2", "p3"),
        beam("b3", P(200, 120), P(200, 0), "p3", "p4"),
      ]),
    ).toEqual([[1, 0]]);
  });

  it("une poutre sur un pivot groundé tourne, et rien de plus", () => {
    expect(
      mobility([
        pivot("p1", P(0, 0), true, [id("b1")]),
        beam("b1", P(0, 0), P(100, 0), "p1"),
      ]),
    ).toEqual([[1, 0]]);
  });

  it("deux poutres redondantes entre les mêmes pivots : m = 1, h = 1", () => {
    // Le décompte donne G = 0 et ne peut pas dire lequel des deux termes vaut
    // quoi. C'est le cas d'école qui justifie la sonde.
    expect(
      mobility([
        pivot("p1", P(0, 0), true, [id("b1"), id("b2")]),
        pivot("p2", P(100, 0), false, [id("b1"), id("b2")]),
        beam("b1", P(0, 0), P(100, 0), "p1", "p2"),
        beam("b2", P(0, 0), P(100, 0), "p1", "p2"),
      ]),
    ).toEqual([[1, 1]]);
  });

  it("une poutre libre isolée a les 3 DDL d'un corps rigide", () => {
    expect(mobility([beam("z1", P(0, 0), P(100, 0))])).toEqual([[3, 0]]);
  });

  it("une poutre portée par deux sliders d'un même rail translate : m = 1, h = 2", () => {
    // La mobilité est bien 1 (elle coulisse), mais le modèle pose 5 lignes de
    // contrainte pour un rang de 3 : SlideOnSegment ×2 + Distance suffisent, et
    // les deux Angle qu'`add_rigidity_links` ajoute par slider verrouillent une
    // orientation déjà imposée — la poutre portée est colinéaire au rail par
    // construction, ses deux extrémités y glissant.
    expect(
      mobility([
        join("g1", P(0, 0), true, [id("rail")]),
        join("g2", P(400, 0), true, [id("rail")]),
        beam("rail", P(0, 0), P(400, 0), "g1", "g2", [id("s1"), id("s2")]),
        sliderNode("s1", P(100, 0), "rail", [id("carried")]),
        sliderNode("s2", P(300, 0), "rail", [id("carried")]),
        beam("carried", P(100, 0), P(300, 0), "s1", "s2"),
      ]),
    ).toEqual([[1, 2]]);
  });

  it("le même mécanisme dessiné plus petit répond la même chose", () => {
    // La sonde n'a pas d'amplitude plancher, et c'est ce test qui l'interdit : toute
    // valeur absolue finit par dépasser le mécanisme qu'elle sonde, ce qui sort du
    // régime linéaire sur lequel repose toute la projection. Un plancher d'un
    // millimètre faisait répondre 3 à ce double pendule dessiné sur 2 mm — donc un
    // mode et une redondance qui n'existent pas.
    const pendulum = (k: number) => [
      pivot("p1", P(0, 0), true, [id("b1")]),
      pivot("p2", P(k, 0), false, [id("b1"), id("b2")]),
      beam("b1", P(0, 0), P(k, 0), "p1", "p2"),
      beam("b2", P(k, 0), P(k, 2 * k), "p2"),
    ];
    const twins = (k: number) => [
      pivot("t1", P(0, 0), true, [id("d1"), id("d2")]),
      pivot("t2", P(k, 0), false, [id("d1"), id("d2")]),
      beam("d1", P(0, 0), P(k, 0), "t1", "t2"),
      beam("d2", P(0, 0), P(k, 0), "t1", "t2"),
    ];
    for (const k of [1000, 10, 1, 0.01, 0.001]) {
      expect(mobility(pendulum(k))).toEqual([[2, 0]]);
      expect(mobility(twins(k))).toEqual([[1, 1]]);
    }
  });

  it("une pose que le modèle ne satisfait pas n'invente pas de mode", () => {
    // Le quatre-barres, mais la manivelle et la bielle ne se rejoignent pas : la fusion
    // pose le nœud partagé entre les deux, et aucune des deux longueurs cuites n'y tient.
    // Le solveur referme donc la boucle avant même qu'on ait poussé, et ce déplacement-là
    // est le même quelle que soit la direction sondée — une constante, que la sonde compte
    // comme une direction de plus si on ne la lui retire pas.
    const [result] = probe_mobility(
      build_analysis_model(
        mechanism([
          pivot("p1", P(0, 0), true, [id("b1")]),
          pivot("p2", P(0, 100), false, [id("b1"), id("b2")]),
          pivot("p3", P(200, 120), false, [id("b2"), id("b3")]),
          pivot("p4", P(200, 0), true, [id("b3")]),
          beam("b1", P(0, 0), P(0, 100), "p1", "p2"),
          beam("b2", P(0, 100), P(200, 120), "p2", "p3"),
          beam("b3", P(260, 150), P(200, 0), "p3", "p4"),
        ]),
      ),
    );
    // Le garde-fou a bien eu de quoi mordre : la pose est loin de ses contraintes.
    expect(result.restDrift).toBeGreaterThan(1);
    expect([result.mobility, result.hyperstaticity]).toEqual([1, 0]);
  });

  it("chaque chaîne est mesurée pour elle-même", () => {
    const results = mobility([
      pivot("p1", P(0, 0), true, [id("b1")]),
      beam("b1", P(0, 0), P(100, 0), "p1"),
      beam("z9", P(500, 500), P(600, 500)),
    ]);
    expect(results).toEqual([
      [1, 0],
      [3, 0],
    ]);
  });
});

const fixture = (json: string) =>
  build_analysis_model(load_mechanism(JSON.parse(json)).mechanism);

describe("probe_chain_mobility — mécanismes de référence", () => {
  it("Vilbrequin : 1 DDL, piloté par son moteur", () => {
    const model = fixture(vilbrequin);
    const [result] = probe_mobility(model);
    expect(result.mobility).toBe(1);
    expect(result.hyperstaticity).toBe(0);
    expect(model.chains[0].motors).toHaveLength(1);
  });

  it("Test slider : 1 DDL", () => {
    expect(probe_mobility(fixture(slider)).map((r) => r.mobility)).toEqual([1]);
  });

  it("Vilbrequin double slider : trois chaînes mesurées séparément", () => {
    const results = probe_mobility(fixture(doubleSlider));
    expect(results).toHaveLength(3);
    // La masse flottante n'est tenue par rien : ses deux DDL sont entiers.
    expect(results[2].mobility).toBe(2);
    expect(results[2].hyperstaticity).toBe(0);
  });

  it("une poulie que la courroie a lâchée rend son degré de liberté", () => {
    // La déconnexion est un état de simulation : elle vit sur le lien, semée depuis un
    // snapshot, et `compile_simulation_model` reconstruit toujours la courroie entière.
    // L'analyse lit pourtant la pose affichée, où la courroie passe droit devant la poulie.
    // Sans en tenir compte, la loi de brin de cette poulie masque la liberté que la courroie
    // vient de rendre — mesuré 1 au lieu de 2 sur ce mécanisme.
    const { mechanism: mech } = load_mechanism(JSON.parse(decon));
    const belt = mech.mechanicalElements.find((el) => el.type === "belt")!;
    const attached = (belt as { attachedGearsIDs: unknown[] }).attachedGearsIDs;
    expect(attached.length).toBeGreaterThan(2);

    const withDrop = {
      ...mech,
      mechanicalElements: mech.mechanicalElements.map((el) =>
        el.id === belt.id ? { ...el, disconnectedGearIndices: [1] } : el,
      ),
    };
    // Vérité indépendante : la même pose, la poulie retirée de la courroie pour de bon.
    const removed = {
      ...mech,
      mechanicalElements: mech.mechanicalElements.map((el) =>
        el.id === belt.id ? belt_without_gear(belt as BeltElement, 1) : el,
      ),
    };

    const strands = (m: Mechanism) =>
      build_analysis_model(m).links.filter(
        (l) => l.type === "BeltSegmentNoSlip",
      ).length;
    expect(probe_mobility(build_analysis_model(withDrop))).toEqual(
      probe_mobility(build_analysis_model(removed)).map((r) =>
        expect.objectContaining({
          mobility: r.mobility,
          hyperstaticity: r.hyperstaticity,
        }),
      ),
    );
    expect(strands(withDrop)).toBe(strands(removed));
    // Et c'est bien un brin de moins qu'avec la courroie entière.
    expect(strands(withDrop)).toBe(strands(mech) - 1);
  });

  it("le joint relit son s0 sur la boucle amputée, pas sur l'entière", () => {
    // `rewire_belts` mesure le `s0` du joint sur la boucle privée de la poulie lâchée ; le
    // lien qui relit ce `s0` doit parcourir la même. Sinon il pose le joint ailleurs — 316 mm
    // ailleurs, mesuré sur `Déconnexion courroie` à 2,5 s —, la pose de repos du modèle viole
    // sa propre contrainte, et la sonde comptait cet écart comme un troisième mode.
    const { mechanism: mech } = load_mechanism(JSON.parse(decon));
    const belt = mech.mechanicalElements.find((el) => el.type === "belt")!;
    const model = build_analysis_model({
      ...mech,
      mechanicalElements: mech.mechanicalElements.map((el) =>
        el.id === belt.id ? { ...el, disconnectedGearIndices: [1] } : el,
      ),
    });
    const off = model.links.find((l) => l.type === "BeltLength")?.disconnected;
    expect(off).toEqual([false, true, false]);
    const junctions = [...model.links, ...model.pruned.map((p) => p.link)].filter(
      (l) => l.type === "BeltPin" || l.type === "BeltFollowsTangent",
    );
    expect(junctions.length).toBeGreaterThan(0);
    for (const junction of junctions) expect(junction.disconnected).toEqual(off);
  });

  it("m et h de référence", () => {
    // Valeurs mesurées, stables de tolérance 0.5 à 0.9, à amplitude divisée par
    // dix, à 200 balayages et en sortie sur le mouvement. Core XY vaut bien ses
    // deux axes, Jansen son unique DDL — le panneau affichait 6 et −1.
    const mh = (json: string) =>
      probe_mobility(fixture(json)).map((r) => [
        r.mobility,
        r.hyperstaticity,
      ]);
    expect(mh(vilbrequin)).toEqual([[1, 0]]);
    expect(mh(slider)).toEqual([[1, 0]]);
    expect(mh(jansen)).toEqual([[1, 1]]);
    // Les entraînements à boucle fermée sont sains : leur unique hyperstatisme était
    // la loi de brin en trop du modèle, désormais élaguée. Poulie bloqueuse garde le
    // sien, qui lui est réel.
    expect(mh(decon)).toEqual([[1, 0]]);
    expect(mh(poulie)).toEqual([[1, 1]]);
    expect(mh(huygens)).toEqual([[6, 0]]);
    expect(mh(coreXY)).toEqual([[2, 6]]);
    expect(mh(doubleSlider)).toEqual([
      [1, 2],
      [2, 0],
      [2, 0],
    ]);
  });

  it("la loi de brin élaguée ne retenait effectivement rien", () => {
    // Le garde-fou de l'élagage : si la ligne retirée portait une vraie contrainte, la
    // remettre ferait BAISSER la mobilité. Elle doit être rigoureusement sans effet —
    // c'est ce qui autorise à la retrancher sans la mesurer à chaque fois.
    for (const json of [decon, poulie, huygens]) {
      const model = fixture(json);
      const surplus = model.pruned
        .filter((p) => p.link.type === "BeltSegmentNoSlip")
        .map((p) => p.link);
      expect(surplus.length).toBeGreaterThan(0);
      for (const chain of model.chains) {
        const own = new Set(chain.variableKeys);
        const back = surplus.filter((link) =>
          variable_keys_of(link).some((key) => own.has(key)),
        );
        if (back.length === 0) continue;
        const links = [...chain.links, ...back];
        const rows = links.reduce((sum, l) => sum + l.ddl, 0);
        expect(
          probe_chain_mobility(model, {
            ...chain,
            links,
            constraintRows: rows,
            grublerCount: chain.freeVariables - rows,
          }).mobility,
        ).toBe(probe_chain_mobility(model, chain).mobility);
      }
    }
  });

  it("m ≥ G sur tous les mécanismes de référence", () => {
    // Inégalité mathématique (rang ≤ Σddl) : la violer signifie un mode manqué.
    for (const json of [
      vilbrequin,
      slider,
      jansen,
      poulie,
      coreXY,
      huygens,
      decon,
      doubleSlider,
    ]) {
      const model = fixture(json);
      for (const chain of model.chains) {
        const result = probe_chain_mobility(model, chain);
        expect(result.mobility).toBeGreaterThanOrEqual(chain.grublerCount);
        expect(result.hyperstaticity).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("le résultat ne dépend pas de l'ordre des éléments", () => {
    const { mechanism: mech } = load_mechanism(JSON.parse(vilbrequin));
    const reversed = {
      ...mech,
      mechanicalElements: [...mech.mechanicalElements].reverse(),
    };
    const forward = probe_mobility(build_analysis_model(mech));
    const backward = probe_mobility(build_analysis_model(reversed));
    expect(backward.map((r) => [r.mobility, r.hyperstaticity])).toEqual(
      forward.map((r) => [r.mobility, r.hyperstaticity]),
    );
  });

  it("deux mesures successives donnent le même résultat", () => {
    const model = fixture(doubleSlider);
    const once = probe_mobility(model).map((r) => r.mobility);
    const twice = probe_mobility(model).map((r) => r.mobility);
    expect(twice).toEqual(once);
  });
});
