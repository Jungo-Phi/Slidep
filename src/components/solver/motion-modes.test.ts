import { describe, expect, it } from "vitest";
import coreXY from "../../../test-mechanisms/Core XY.slidep?raw";
import coreXY2 from "../../../test-mechanisms/Core XY - 2 moteurs.slidep?raw";
import doubleSlider from "../../../test-mechanisms/Vilbrequin double slider.slidep?raw";
import huygens from "../../../test-mechanisms/Huygen's chain drive.slidep?raw";
import jansen from "../../../test-mechanisms/Jansen's linkage.slidep?raw";
import vilbrequin from "../../../test-mechanisms/Vilbrequin.slidep?raw";
import {
  BeamElement,
  GearElement,
  ID,
  MechanicalElement,
  Mechanism,
  PivotElement,
  Point2,
} from "../../types";
import { DEFAULT_METADATA } from "../../types/mechanism";
import { load_mechanism } from "../../utils/load-mechanism";
import { build_analysis_model } from "./analysis-model";
import { probe_chain_mobility } from "./mobility-probe";
import {
  canonical_modes,
  chain_highlight,
  MotionMode,
  undriven_motors,
} from "./motion-modes";

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

function pivot(
  n: string,
  pos: Point2,
  g: boolean,
  edges: ID[],
  gears: ID[] = [],
): PivotElement {
  return {
    type: "pivot",
    id: id(n),
    probes: [],
    overlays: {},
    position: pos,
    isGrounded: g,
    rotatingEdgesIDs: edges,
    fixedGearsIDs: gears,
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

function gear(n: string, pos: Point2, axle: string, r: number): GearElement {
  return {
    type: "gear",
    id: id(n),
    probes: [],
    overlays: {},
    position: pos,
    angle: 0,
    radius: r,
    parentAxleID: id(axle),
    fixedNodesBodyIDs: [],
    meshedGearsIDs: [],
  };
}

/** Every chain of a mechanism with its modes, in panel order. */
const analyse = (mech: Mechanism) => {
  const model = build_analysis_model(mech);
  return model.chains.map((chain) => ({
    chain,
    modes: canonical_modes(model, chain, probe_chain_mobility(model, chain)),
  }));
};

const analysed = (json: string) =>
  analyse(load_mechanism(JSON.parse(json)).mechanism);

const modes_of = (els: MechanicalElement[]): MotionMode[][] =>
  analyse(mechanism(els)).map((a) => a.modes);

const fixture = (json: string) => analysed(json).map((a) => a.modes);

/** Every mode is a unit vector and lies in the space the probe measured. */
function assert_orthonormal(modes: MotionMode[]) {
  for (let i = 0; i < modes.length; i++) {
    let norm = 0;
    for (const v of modes[i].vector) norm += v * v;
    expect(Math.sqrt(norm)).toBeCloseTo(1, 6);
    for (let j = i + 1; j < modes.length; j++) {
      let d = 0;
      for (let k = 0; k < modes[i].vector.length; k++)
        d += modes[i].vector[k] * modes[j].vector[k];
      expect(Math.abs(d)).toBeLessThan(1e-6);
    }
  }
}

describe("canonical_modes", () => {
  it("rend autant de modes que de mobilités", () => {
    expect(fixture(vilbrequin).map((m) => m.length)).toEqual([1]);
    expect(fixture(jansen).map((m) => m.length)).toEqual([1]);
    expect(fixture(coreXY).map((m) => m.length)).toEqual([2]);
    expect(fixture(huygens).map((m) => m.length)).toEqual([6]);
    expect(fixture(doubleSlider).map((m) => m.length)).toEqual([1, 2, 2]);
  });

  it("la base reste orthonormée", () => {
    for (const chains of [fixture(coreXY), fixture(huygens)])
      for (const modes of chains) assert_orthonormal(modes);
  });

  it("une roue qui tourne dans le vide est un DDL parasite nommé", () => {
    // Le pivot est groundé, la roue n'engrène rien : son angle est libre et ne
    // bouge qu'elle. C'est exactement ce que « localized » doit attraper.
    // L'axe doit lister la roue : sans ça le parser n'émet aucune Coincidence
    // et la roue flotte librement, ce qui n'est pas le cas qu'on teste.
    const [modes] = modes_of([
      pivot("p1", P(0, 0), true, [], [id("g1")]),
      gear("g1", P(0, 0), "p1", 40),
    ]);
    expect(modes).toHaveLength(1);
    expect(modes[0].localized).toBe(true);
    expect(modes[0].dominant).toBe(id("g1"));
  });

  it("le mode d'un quatre-barres nomme une barre, et n'est pas parasite", () => {
    const [modes] = modes_of([
      pivot("p1", P(0, 0), true, [id("b1")]),
      pivot("p2", P(0, 100), false, [id("b1"), id("b2")]),
      pivot("p3", P(200, 120), false, [id("b2"), id("b3")]),
      pivot("p4", P(200, 0), true, [id("b3")]),
      beam("b1", P(0, 0), P(0, 100), "p1", "p2"),
      beam("b2", P(0, 100), P(200, 120), "p2", "p3"),
      beam("b3", P(200, 120), P(200, 0), "p3", "p4"),
    ]);
    expect(modes).toHaveLength(1);
    expect(modes[0].localized).toBe(false);
    expect(modes[0].dominant).toBeDefined();
    // Plusieurs barres bougent ensemble : c'est un mécanisme, pas un jeu.
    expect(modes[0].contributors.length).toBeGreaterThan(1);
  });

  it("une masse libre bouge seule, et selon les deux axes", () => {
    const chains = fixture(doubleSlider);
    const floating = chains[2];
    expect(floating).toHaveLength(2);
    expect(floating.every((m) => m.localized)).toBe(true);
    expect(new Set(floating.map((m) => m.dominant)).size).toBe(1);
  });

  it("les parts d'un mode forment une répartition", () => {
    // Une clé fusionnée partage son poids entre ses éléments, donc la somme vaut
    // au plus 1 — le seuil CONTRIBUTOR_SHARE en retranche les miettes.
    for (const modes of fixture(huygens))
      for (const mode of modes) {
        const sum = mode.contributors.reduce((s, c) => s + c.share, 0);
        expect(sum).toBeGreaterThan(0.5);
        expect(sum).toBeLessThanOrEqual(1 + 1e-9);
      }
  });

  it("ce qui bouge englobe ce qui nomme", () => {
    // `contributors` est un classement, rogné des petites parts et divisé entre
    // les éléments d'une clé fusionnée ; `moves` est l'ensemble à surligner. Les
    // confondre laissait des pièces bouger sans être mises en évidence.
    for (const chains of [fixture(coreXY), fixture(huygens), fixture(jansen)])
      for (const modes of chains)
        for (const mode of modes) {
          expect(mode.moves.length).toBeGreaterThan(0);
          for (const c of mode.contributors)
            expect(mode.moves).toContain(c.id);
        }
  });

  it("les modes pilotés passent devant, et portent leur moteur", () => {
    for (const chains of [fixture(vilbrequin), fixture(coreXY), fixture(huygens)])
      for (const modes of chains) {
        const driven = modes.map((m) => m.drivenByMotor);
        // Une fois passé le premier non-piloté, plus aucun piloté ne suit.
        expect(driven).toEqual([...driven].sort((a, b) => Number(b) - Number(a)));
      }
  });

  it("deux modes d'une chaîne ne portent pas le même nom", () => {
    // Sauf s'il n'y a qu'un élément à nommer : la masse libre a deux modes de
    // translation et une seule pièce. L'indice de rangée les distingue alors.
    for (const chains of [fixture(coreXY), fixture(huygens), fixture(doubleSlider)])
      for (const modes of chains) {
        const named = modes.map((m) => m.dominant).filter(Boolean);
        const distinctElements = new Set(modes.flatMap((m) => m.moves)).size;
        if (distinctElements >= modes.length)
          expect(new Set(named).size).toBe(named.length);
      }
  });

  it("le moteur d'un mode piloté est mis en évidence avec lui", () => {
    // Le pivot moteur est ancré, donc il ne bouge pas : sans exception il sortirait
    // du surlignage, alors que la rangée porte son nom.
    const [modes] = fixture(vilbrequin);
    const driven = modes.find((m) => m.drivenByMotor)!;
    expect(driven.dominant).toBeDefined();
    expect(driven.moves).toContain(driven.dominant);
  });

  it("un moteur n'est mis en évidence que dans le mode qu'il pilote", () => {
    // La clé qu'un moteur pilote bouge dans presque tous les modes de sa chaîne :
    // l'allumer partout où elle bouge le posait sur les rangées voisines, alors qu'il
    // n'y pilote rien. Ce double pendule motorisé a deux modes, le moteur n'en tient
    // qu'un.
    const [modes] = modes_of([
      { ...pivot("p1", P(0, 0), true, [id("b1")]), motor: { speed: 10 } },
      pivot("p2", P(100, 0), false, [id("b1"), id("b2")]),
      beam("b1", P(0, 0), P(100, 0), "p1", "p2"),
      beam("b2", P(100, 0), P(100, 200), "p2"),
    ]);
    expect(modes).toHaveLength(2);
    const lit = modes.filter((m) => m.moves.includes(id("p1")));
    expect(lit).toHaveLength(1);
    expect(lit[0].drivenByMotor).toBe(true);
  });

  it("chaque moteur d'une chaîne à deux moteurs tient sa propre rangée", () => {
    const [modes] = fixture(coreXY2);
    for (const mode of modes.filter((m) => m.drivenByMotor))
      for (const other of modes)
        if (other !== mode) expect(other.moves).not.toContain(mode.dominant);
  });

  it("un moteur sans mobilité à piloter est nommé pour lui-même", () => {
    // Il n'a aucune rangée de mode où figurer : sans cette liste il n'existerait nulle
    // part dans le panneau, qui vient pourtant d'annoncer la chaîne sur-motorisée.
    const [{ chain, modes }] = analyse(
      mechanism([
        { ...pivot("p1", P(0, 0), true, [id("b1")]), motor: { speed: 10 } },
        pivot("p2", P(0, 100), false, [id("b1"), id("b2")]),
        pivot("p3", P(200, 120), false, [id("b2"), id("b3")]),
        { ...pivot("p4", P(200, 0), true, [id("b3")]), motor: { speed: 4 } },
        beam("b1", P(0, 0), P(0, 100), "p1", "p2"),
        beam("b2", P(0, 100), P(200, 120), "p2", "p3"),
        beam("b3", P(200, 120), P(200, 0), "p3", "p4"),
      ]),
    );
    const idle = undriven_motors(chain, modes);
    expect(idle).toHaveLength(1);
    // Celui qui reste est bien l'autre : le mode piloté garde le sien.
    expect(idle[0]).not.toBe(modes[0].dominant);
  });

  it("une chaîne exactement pilotée ne laisse aucun moteur de côté", () => {
    for (const json of [vilbrequin, jansen, coreXY2, doubleSlider])
      for (const { chain, modes } of analysed(json))
        if (chain.motors.length <= modes.filter((m) => m.drivenByMotor).length)
          expect(undriven_motors(chain, modes)).toEqual([]);
  });

  it("le survol d'une chaîne montre aussi ses moteurs sans mode", () => {
    // Une chaîne sur-motorisée a plus de moteurs que de mobilités : celui qui ne
    // revendique aucune rangée sortirait de l'union des modes, alors que la carte de
    // la chaîne parle bien de lui.
    // Un quatre-barres motorisé aux deux bâtis : une seule mobilité pour deux moteurs.
    const [{ chain, modes }] = analyse(
      mechanism([
        { ...pivot("p1", P(0, 0), true, [id("b1")]), motor: { speed: 10 } },
        pivot("p2", P(0, 100), false, [id("b1"), id("b2")]),
        pivot("p3", P(200, 120), false, [id("b2"), id("b3")]),
        { ...pivot("p4", P(200, 0), true, [id("b3")]), motor: { speed: 4 } },
        beam("b1", P(0, 0), P(0, 100), "p1", "p2"),
        beam("b2", P(0, 100), P(200, 120), "p2", "p3"),
        beam("b3", P(200, 120), P(200, 0), "p3", "p4"),
      ]),
    );
    expect(modes).toHaveLength(1);
    expect(chain.motors).toHaveLength(2);
    const highlight = chain_highlight(chain, modes);
    for (const motor of chain.motors)
      expect(highlight).toContain(motor.owner);
    // …et le moteur qui ne pilote rien n'est pas pour autant posé sur la rangée.
    expect(modes[0].moves).not.toContain(
      chain.motors.find((m) => m.owner !== modes[0].dominant)!.owner,
    );
  });

  it("un mode ne met en évidence que des pièces de sa chaîne", () => {
    // Survoler une chaîne puis l'un de ses modes doit restreindre le surlignage, jamais
    // le déplacer ailleurs : sans cette inclusion, un mode allumait le bâti que sa
    // chaîne n'allume pas, et la chaîne taisait le moteur que son mode montrait.
    for (const json of [vilbrequin, jansen, coreXY, huygens, doubleSlider])
      for (const { chain, modes } of analysed(json))
        for (const mode of modes)
          for (const id of mode.moves) expect(chain.elements).toContain(id);
  });

  it("le survol d'une chaîne montre l'union de ses modes, pas plus", () => {
    // L'autre sens de l'inclusion : une variable libre qu'aucun mode ne bouge est une
    // variable que les contraintes ont épinglée, et la chaîne n'a pas à s'en réclamer.
    for (const json of [vilbrequin, coreXY, huygens, doubleSlider])
      for (const { chain, modes } of analysed(json))
        expect(new Set(chain_highlight(chain, modes))).toEqual(
          new Set(modes.flatMap((m) => m.moves)),
        );
  });

  it("une chaîne rigide se rabat sur ses propres pièces", () => {
    // p3 est libre, mais deux barres le tiennent vers des pivots ancrés : la chaîne
    // existe, sa mobilité est nulle, et il n'y a aucune union à prendre.
    const els = [
      pivot("p1", P(0, 0), true, [id("b1")]),
      pivot("p2", P(200, 0), true, [id("b2")]),
      pivot("p3", P(100, 100), false, [id("b1"), id("b2")]),
      beam("b1", P(0, 0), P(100, 100), "p1", "p3"),
      beam("b2", P(200, 0), P(100, 100), "p2", "p3"),
    ];
    const [{ chain, modes }] = analyse(mechanism(els));
    expect(modes).toHaveLength(0);
    expect(chain_highlight(chain, modes)).toEqual(chain.elements);
    expect(chain.elements).toContain(id("p3"));
  });

  it("ne dépend pas de l'ordre des éléments", () => {
    const { mechanism: mech } = load_mechanism(JSON.parse(vilbrequin));
    const run = (els: MechanicalElement[]) => {
      const model = build_analysis_model({ ...mech, mechanicalElements: els });
      return model.chains.map((c) =>
        canonical_modes(model, c, probe_chain_mobility(model, c)).map((m) => ({
          dominant: m.dominant,
          localized: m.localized,
        })),
      );
    };
    expect(run([...mech.mechanicalElements].reverse())).toEqual(
      run(mech.mechanicalElements),
    );
  });
});
