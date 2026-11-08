import { describe, expect, it } from "vitest";
import coreXY from "../../../test-mechanisms/Core XY - 2 moteurs.slidep?raw";
import huygens from "../../../test-mechanisms/Huygen's chain drive.slidep?raw";
import jansen from "../../../test-mechanisms/Jansen's linkage.slidep?raw";
import poulie from "../../../test-mechanisms/Poulie bloqueuse.slidep?raw";
import treillis from "../../../test-mechanisms/Treillis.slidep?raw";
import {
  ConstraintElement,
  ID,
  MechanicalElement,
  Mechanism,
  Point2,
  ViewportState,
  WorldPoint,
} from "../../types";
import { MIRROR_TOLERANCE_PX } from "../../constants/interaction-specs";
import { KinematicSnapshot } from "../../types/runtime-state";
import { measure_belt_length } from "../../utils";
import { load_mechanism } from "../../utils/load-mechanism";
import { validate_mechanism } from "../../utils/validate-mechanism";
import {
  compile_simulation_model,
  step_simulation,
} from "../solver/dynamics/simulation-engine";
import { actionReducer } from "./action-reducer";
import { apply_actions } from "./apply-actions";
import { elements_center } from "./clipboard";
import { transformed_point } from "./mirror-geometry";
import { min_transform_scale, transform_actions } from "./transform-actions";

const MECHANISMS = { coreXY, huygens, jansen, poulie, treillis };
const load = (json: string): Mechanism => load_mechanism(JSON.parse(json)).mechanism;
const issues = (mechanism: Mechanism) =>
  (validate_mechanism(mechanism) ?? []).map((issue) => issue.code).sort();
const points_of = (el: MechanicalElement): WorldPoint[] =>
  "position" in el ? [el.position] : [el.positionStart, el.positionEnd];
const element_in = (m: Mechanism, id: ID) =>
  m.mechanicalElements.find((el) => el.id === id)!;
const ids_of = (m: Mechanism) => m.mechanicalElements.map((el) => el.id);
const QUARTER = Math.PI / 2;

/** How far a file saved slightly off its constraints settles when nothing else happens: creating anything re-solves it. */
function settling(mechanism: Mechanism): number {
  const after = apply_actions(mechanism, [
    {
      type: "CreateElement",
      element: {
        type: "pivot",
        id: crypto.randomUUID() as ID,
        probes: [],
        overlays: {},
        position: new Point2<"world">(1000, 1000),
        isGrounded: false,
        rotatingEdgesIDs: [],
        fixedGearsIDs: [],
        rotationalFriction: 0,
      },
    },
  ]);
  let worst = 0;
  for (const el of mechanism.mechanicalElements)
    points_of(el).forEach((p, i) => {
      worst = Math.max(worst, points_of(element_in(after, el.id))[i].distance_to(p));
    });
  return worst;
}

describe.each(Object.entries(MECHANISMS))("transforming %s", (_, json) => {
  const mechanism = load(json);
  const center = elements_center(mechanism.mechanicalElements);
  const transform = (angle: number, scale: number, ids = ids_of(mechanism)) =>
    transform_actions(ids, center, angle, scale, mechanism);

  it.each([
    ["a rotation", 0.5, 1],
    ["a quarter turn", QUARTER, 1],
    ["a scale", 0, 1.7],
  ])("puts the whole mechanism in place under %s, still valid", (_name, angle, scale) => {
    const allowed = (settling(mechanism) + 1e-6) * Math.max(1, scale) * 2;
    const after = apply_actions(mechanism, transform(angle, scale));
    expect(issues(after)).toEqual(issues(mechanism));
    for (const el of mechanism.mechanicalElements)
      points_of(el).forEach((point, i) => {
        const expected = transformed_point(point, center, angle, scale);
        expect(points_of(element_in(after, el.id))[i].distance_to(expected)).toBeLessThan(allowed);
      });
  });

  it("scales gears, value-held lengths and belts, and leaves loads alone", () => {
    const scale = 1.5;
    const after = apply_actions(mechanism, transform(0, scale));
    for (const el of mechanism.mechanicalElements) {
      const now = element_in(after, el.id);
      if (el.type === "gear" && now.type === "gear")
        expect(now.radius).toBeCloseTo(el.radius * scale, 3);
      if (el.type === "belt" && now.type === "belt")
        expect(measure_belt_length(now, after.mechanicalElements)).toBeCloseTo(
          measure_belt_length(el, mechanism.mechanicalElements) * scale,
          2,
        );
    }
    for (const c of mechanism.constraintElements) {
      if (c.type !== "dimension-edge") continue;
      const now = after.constraintElements.find((o) => o.id === c.id);
      expect(now).toMatchObject({ value: c.value * scale });
    }
    expect(after.loads).toEqual(mechanism.loads);
  });

  it("is undone exactly", () => {
    const after = apply_actions(mechanism, transform(0.5, 1));
    const scaled = apply_actions(mechanism, transform(0, 1.5));
    for (const done of [after, scaled]) {
      const undone = actionReducer(
        done,
        [...done.history[done.history.length - 1]].reverse(),
        true,
      );
      expect(undone.mechanicalElements.length).toBe(mechanism.mechanicalElements.length);
      for (const el of mechanism.mechanicalElements) {
        const back = element_in(undone, el.id);
        points_of(el).forEach((point, i) =>
          expect(points_of(back)[i].distance_to(point)).toBeLessThan(1e-12),
        );
        if (el.type === "gear" && back.type === "gear") {
          expect(back.radius).toBeCloseTo(el.radius, 12);
          expect(back.angle).toBeCloseTo(el.angle, 12);
        }
      }
      // A constraint the rotation removed comes back at the end of the list.
      const by_id = (constraints: ConstraintElement[]) =>
        [...constraints].sort((a, b) => a.id.localeCompare(b.id));
      expect(by_id(undone.constraintElements)).toEqual(
        by_id(mechanism.constraintElements),
      );
    }
  });

  it("brings a partial selection to its place, whatever ties it to the rest", () => {
    const selected = ids_of(mechanism).filter((_id, index) => index % 2 === 0);
    const pivot = elements_center(
      mechanism.mechanicalElements.filter((el) => selected.includes(el.id)),
    );
    const after = apply_actions(
      mechanism,
      transform_actions(selected, pivot, 0.7, 1.3, mechanism),
    );
    expect(issues(after)).toEqual(issues(mechanism));
    // What `holds_in_place` accepts before it cuts anything: a pixel at this zoom, on top of the settling.
    const allowed =
      settling(mechanism) * 2 + (MIRROR_TOLERANCE_PX / mechanism.viewport.scale) * 1.01;
    for (const id of selected)
      points_of(element_in(mechanism, id)).forEach((point, i) => {
        const expected = transformed_point(point, pivot, 0.7, 1.3);
        expect(points_of(element_in(after, id))[i].distance_to(expected)).toBeLessThan(allowed);
      });
  });

  it("scales the dimension of an edge left out of the selection, its two ends being in it", () => {
    const dimension = mechanism.constraintElements.find(
      (c) => c.type === "dimension-edge",
    );
    if (dimension?.type !== "dimension-edge") return;
    const edge = element_in(mechanism, dimension.edgeID);
    if (!("fixedNodeStartID" in edge) || !edge.fixedNodeStartID || !edge.fixedNodeEndID)
      return;
    const after = apply_actions(
      mechanism,
      transform_actions(
        [edge.fixedNodeStartID, edge.fixedNodeEndID],
        center,
        0,
        1.5,
        mechanism,
      ),
    );
    expect(
      after.constraintElements.find((c) => c.id === dimension.id),
    ).toMatchObject({ value: dimension.value * 1.5 });
  });

  it("does nothing for the identity", () => {
    expect(transform(0, 1)).toEqual([]);
  });
});

describe("alignment constraints", () => {
  /** A mechanism carrying one horizontal constraint on a free beam. */
  function with_horizontal(): { mechanism: Mechanism; beamID: ID } {
    const source = load(treillis);
    const beam = source.mechanicalElements.find((el) => el.type === "beam")!;
    const lone: MechanicalElement = {
      ...beam,
      id: crypto.randomUUID() as ID,
      name: undefined,
      fixedNodeStartID: undefined,
      fixedNodeEndID: undefined,
      positionStart: new Point2<"world">(20, 20),
      positionEnd: new Point2<"world">(22, 20),
    } as MechanicalElement;
    const constraint: ConstraintElement = {
      type: "horizontal-align-edge",
      id: crypto.randomUUID() as ID,
      edgeID: lone.id,
    };
    return {
      mechanism: {
        ...source,
        mechanicalElements: [...source.mechanicalElements, lone],
        constraintElements: [...source.constraintElements, constraint],
        loads: [],
      },
      beamID: lone.id,
    };
  }
  const aligned_on = (m: Mechanism, beamID: ID) =>
    m.constraintElements.flatMap((c) =>
      "edgeID" in c && c.edgeID === beamID ? [c.type] : [],
    );
  const turned = (angle: number) => {
    const { mechanism, beamID } = with_horizontal();
    const center = new Point2<"world">(21, 20);
    const after = apply_actions(
      mechanism,
      transform_actions([beamID], center, angle, 1, mechanism),
    );
    return { types: aligned_on(after, beamID), after, beamID, center };
  };

  it("swaps axis at a quarter turn", () => {
    expect(turned(QUARTER).types).toEqual(["vertical-align-edge"]);
    expect(turned(-QUARTER).types).toEqual(["vertical-align-edge"]);
  });

  it("stays at a half turn", () => {
    expect(turned(2 * QUARTER).types).toEqual(["horizontal-align-edge"]);
  });

  it("goes at any other angle, and the beam really turns", () => {
    const { types, after, beamID, center } = turned(0.5);
    expect(types).toEqual([]);
    const beam = element_in(after, beamID);
    const expected = transformed_point(new Point2<"world">(22, 20), center, 0.5, 1);
    expect(points_of(beam)[1].distance_to(expected)).toBeLessThan(1e-6);
  });
});

describe("min_transform_scale", () => {
  const viewport: ViewportState = { scale: 100, pan: new Point2<"screen">(0, 0) };
  const beam = (length: number): MechanicalElement =>
    ({
      type: "beam",
      id: "a-b-c-d-e" as ID,
      positionStart: new Point2<"world">(0, 0),
      positionEnd: new Point2<"world">(length, 0),
      fixedNodesBodyIDs: [],
    }) as unknown as MechanicalElement;

  it("grows as the elements shrink, and never asks to enlarge them", () => {
    const long = beam(10);
    const short = beam(1);
    expect(min_transform_scale([long.id], [long], viewport)).toBeLessThan(
      min_transform_scale([short.id], [short], viewport),
    );
    const tiny = beam(1e-6);
    expect(min_transform_scale([tiny.id], [tiny], viewport)).toBe(1);
  });
});

describe("motion", () => {
  function run(mechanism: Mechanism, frames: number): Map<string, Point2> {
    const model = compile_simulation_model(mechanism);
    let snapshot: KinematicSnapshot | null = null;
    for (let i = 0; i < frames; i++)
      snapshot = step_simulation(model, i / 60, snapshot, 1 / 60);
    const positions = new Map<string, Point2>();
    snapshot!.layout.keys.forEach((key, k) =>
      positions.set(
        key,
        new Point2(snapshot!.positions[2 * k], snapshot!.positions[2 * k + 1]),
      ),
    );
    return positions;
  }

  it.each([
    ["jansen", jansen],
    ["coreXY", coreXY],
  ])("a turned %s moves as the turned image of the original", (_name, json) => {
    const original = load(json);
    const center = elements_center(original.mechanicalElements);
    const angle = 0.6;
    const twin = apply_actions(
      original,
      transform_actions(ids_of(original), center, angle, 1, original),
    );
    const start = run(original, 1);
    const before = run(original, 60);
    const after = run(twin, 60);
    let worst = 0;
    let travelled = 0;
    before.forEach((position, key) => {
      if (Number.isNaN(position.x)) return;
      travelled = Math.max(travelled, position.distance_to(start.get(key)!));
      worst = Math.max(
        worst,
        transformed_point(position as WorldPoint, center, angle, 1).distance_to(after.get(key)!),
      );
    });
    expect(travelled).toBeGreaterThan(0.01);
    expect(worst).toBeLessThan(0.01);
  });
});
