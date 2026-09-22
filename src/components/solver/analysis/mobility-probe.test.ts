import { describe, expect, it } from "vitest";
import coreXY from "../../../../test-mechanisms/Core XY.slidep?raw";
import decon from "../../../../test-mechanisms/Déconnexion courroie.slidep?raw";
import doubleSlider from "../../../../test-mechanisms/Vilbrequin double slider.slidep?raw";
import huygens from "../../../../test-mechanisms/Huygen's chain drive.slidep?raw";
import jansen from "../../../../test-mechanisms/Jansen's linkage.slidep?raw";
import poulie from "../../../../test-mechanisms/Poulie bloqueuse.slidep?raw";
import slider from "../../../../test-mechanisms/Test slider.slidep?raw";
import vilbrequin from "../../../../test-mechanisms/Vilbrequin.slidep?raw";
import {
  BeamElement,
  BeltElement,
  ID,
  JoinElement,
  MaterialDef,
  MechanicalElement,
  Mechanism,
  PivotElement,
  Point2,
  ProfileDef,
  SliderElement,
} from "../../../types";
import { DEFAULT_METADATA, DEFAULT_SIMULATION } from "../../../types/mechanism";
import { load_mechanism } from "../../../utils/load-mechanism";
import { belt_without_gear } from "../../../utils/belt-geom";
import { build_analysis_model, variable_keys_of } from "./analysis-model";
import { probe_chain_mobility, probe_mobility } from "./mobility-probe";

const id = (s: string) =>
  `00000000-0000-0000-0000-${s.padStart(12, "0")}` as ID;
const P = (x: number, y: number) => new Point2(x, y);

const MATERIAL_ID = id("material");
const PROFILE_ID = id("profile");
const MATERIALS: MaterialDef[] = [
  { id: MATERIAL_ID, name: "test", E: 210e9, Re: 1, rho: 1 },
];
const PROFILES: ProfileDef[] = [
  { id: PROFILE_ID, name: "test", shape: { kind: "rect", b: 1, h: 1 } },
];

function mechanism(mechanicalElements: MechanicalElement[]): Mechanism {
  return {
    metadata: DEFAULT_METADATA,
    viewport: { scale: 1, pan: new Point2<"screen">(0, 0) },

    simulation: DEFAULT_SIMULATION,
    mechanicalElements,
    constraintElements: [],
    loads: [],
    materials: MATERIALS,
    profiles: PROFILES,
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
    materialID: MATERIAL_ID,
    profileID: PROFILE_ID,
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
    // The count gives G = 0 and cannot say what either of its two terms is worth.
    // This is the textbook case the probe exists for.
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
    // Mobility really is 1 (it slides), but the model writes 5 constraint rows for a rank of 3: SlideOnSegment ×2 + Distance are enough, and the two Angle links `add_rigidity_links` adds per slider lock an orientation already imposed — the carried beam is collinear with its rail by construction, both of its ends sliding along it.
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
    // The probe has no floor amplitude, and this test is what forbids one: any absolute value eventually outgrows the mechanism it probes, which leaves the linear regime the whole projection rests on.
    // A one-millimetre floor made this double pendulum drawn 2 mm across answer 3 — a mode and a redundancy that do not exist.
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
    // The four-bar, except that crank and rod do not meet: fusing sets the shared node between the two, and neither baked length holds there.
    // The solver therefore closes the loop before anything is pushed, and that displacement is the same whichever direction is probed — a constant, which the probe counts as one more direction unless it is taken out.
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
    // The guard had something to bite on: the pose sits far from its own constraints.
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
    // The floating mass is held by nothing: both of its degrees of freedom are whole.
    expect(results[2].mobility).toBe(2);
    expect(results[2].hyperstaticity).toBe(0);
  });

  it("une poulie que la courroie a lâchée rend son degré de liberté", () => {
    // Disconnection is simulation state: it lives on the link, seeded from a snapshot, and `compile_simulation_model` always rebuilds the whole belt.
    // The analysis reads the pose on screen, though, where the belt runs straight past the pulley.
    // Ignored, that pulley's strand law hides the freedom the belt has just given back — measured 1 instead of 2 on this mechanism.
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
    // An independent truth: the same pose, with the pulley taken off the belt for good.
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
    // And that is one strand fewer than the whole belt carries.
    expect(strands(withDrop)).toBe(strands(mech) - 1);
  });

  it("le joint relit son s0 sur la boucle amputée, pas sur l'entière", () => {
    // `rewire_belts` measures the junction's `s0` on the loop the dropped pulley has left; the link that reads that `s0` back must walk the same one.
    // Otherwise it sets the junction elsewhere — 316 mm elsewhere, measured on `Déconnexion courroie` at 2.5 s — the model's rest pose violates its own constraint, and the probe counted that gap as a third mode.
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
    const junctions = [
      ...model.links,
      ...model.pruned.map((p) => p.link),
    ].filter((l) => l.type === "BeltPin" || l.type === "BeltFollowsTangent");
    expect(junctions.length).toBeGreaterThan(0);
    for (const junction of junctions)
      expect(junction.disconnected).toEqual(off);
  });

  it("m et h de référence", () => {
    // Measured values, stable from tolerance 0.5 to 0.9, at a tenth of the amplitude, at 200 sweeps and when exiting on motion.
    // Core XY is worth its two axes, Jansen its single degree of freedom.
    // Jansen's two redundancies are its two welds: removing either one frees two degrees of mobility and drops one of them.
    const mh = (json: string) =>
      probe_mobility(fixture(json)).map((r) => [r.mobility, r.hyperstaticity]);
    expect(mh(vilbrequin)).toEqual([[1, 0]]);
    expect(mh(slider)).toEqual([[1, 0]]);
    expect(mh(jansen)).toEqual([[1, 2]]);
    // The closed-loop drives are sound: their one redundancy was the model's surplus strand law, pruned since.
    // Poulie bloqueuse keeps its own, which is real.
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
    // The pruning guard: if the row taken out carried a real constraint, putting it back would LOWER the mobility.
    // It must be strictly without effect — which is what allows dropping it without measuring it every time.
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
    // A mathematical inequality (rank ≤ Σdof): violating it means a mode was missed.
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
