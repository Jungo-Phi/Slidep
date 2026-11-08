import { describe, expect, it } from "vitest";
import coreXY from "../../../test-mechanisms/Core XY - 2 moteurs.slidep?raw";
import huygens from "../../../test-mechanisms/Huygen's chain drive.slidep?raw";
import jansen from "../../../test-mechanisms/Jansen's linkage.slidep?raw";
import poulie from "../../../test-mechanisms/Poulie bloqueuse.slidep?raw";
import treillis from "../../../test-mechanisms/Treillis.slidep?raw";
import {
  ID,
  MechanicalElement,
  Mechanism,
  MirrorAxis,
  Point2,
  WorldPoint,
} from "../../types";
import { KinematicSnapshot } from "../../types/runtime-state";
import { load_mechanism } from "../../utils/load-mechanism";
import { validate_mechanism } from "../../utils/validate-mechanism";
import { measure_belt_length } from "../../utils";
import {
  compile_simulation_model,
  step_simulation,
} from "../solver/dynamics/simulation-engine";
import { actionReducer } from "./action-reducer";
import { apply_actions } from "./apply-actions";
import { elements_center } from "./clipboard";
import { mirror_actions } from "./mirror-actions";
import { mirrored_point } from "./mirror-geometry";

const MECHANISMS = { coreXY, huygens, jansen, poulie, treillis };
const load = (json: string): Mechanism => load_mechanism(JSON.parse(json)).mechanism;
const issues = (mechanism: Mechanism) =>
  (validate_mechanism(mechanism) ?? []).map((issue) => issue.code).sort();
const points_of = (el: MechanicalElement): WorldPoint[] =>
  "position" in el ? [el.position] : [el.positionStart, el.positionEnd];
const element_in = (m: Mechanism, id: ID) =>
  m.mechanicalElements.find((el) => el.id === id)!;

/** Creating anything re-solves the mechanism: how far a file saved slightly off its constraints settles when nothing else happens. */
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

describe.each(Object.entries(MECHANISMS))("mirroring %s", (_, json) => {
  const mechanism = load(json);
  const allIDs = mechanism.mechanicalElements.map((el) => el.id);
  const center = elements_center(mechanism.mechanicalElements);
  const allowed = settling(mechanism) * 2 + 1e-6;

  describe.each(["horizontal", "vertical"] as MirrorAxis[])("%s", (axis) => {
    it("puts a whole mechanism at its mirrored place, cutting nothing", () => {
      const actions = mirror_actions(allIDs, axis, mechanism);
      expect(actions).toHaveLength(1);
      const after = apply_actions(mechanism, actions);
      expect(issues(after)).toEqual(issues(mechanism));
      for (const el of mechanism.mechanicalElements)
        points_of(el).forEach((point, i) => {
          const expected = mirrored_point(point, axis, center);
          expect(points_of(element_in(after, el.id))[i].distance_to(expected)).toBeLessThan(allowed);
        });
    });

    it("keeps the length of every belt", () => {
      const after = apply_actions(mechanism, mirror_actions(allIDs, axis, mechanism));
      for (const el of mechanism.mechanicalElements) {
        if (el.type !== "belt") continue;
        const before = measure_belt_length(el, mechanism.mechanicalElements);
        const now = measure_belt_length(
          element_in(after, el.id) as typeof el,
          after.mechanicalElements,
        );
        expect(Math.abs(now - before)).toBeLessThan(1e-3 * before);
      }
    });

    it("is undone exactly", () => {
      const after = apply_actions(mechanism, mirror_actions(allIDs, axis, mechanism));
      const undone = actionReducer(
        after,
        [...after.history[after.history.length - 1]].reverse(),
        true,
      );
      // An old file leaves `clockwise` unset where it means false, and the flip writes it out.
      const settled = (elements: MechanicalElement[]) =>
        elements.map((el) =>
          el.type === "belt"
            ? {
                ...el,
                attachedGearsIDs: el.attachedGearsIDs.map((gear) => ({
                  ...gear,
                  clockwise: !!gear.clockwise,
                })),
              }
            : el,
        );
      expect(settled(undone.mechanicalElements)).toEqual(
        settled(mechanism.mechanicalElements),
      );
      expect(undone.loads).toEqual(mechanism.loads);
      expect(undone.constraintElements).toEqual(mechanism.constraintElements);
    });

    it("brings a partial selection to its mirrored place, whatever ties it to the rest", () => {
      const selected = allIDs.filter((_id, index) => index % 2 === 0);
      const expected = elements_center(
        mechanism.mechanicalElements.filter((el) => selected.includes(el.id)),
      );
      const after = apply_actions(mechanism, mirror_actions(selected, axis, mechanism));
      expect(issues(after)).toEqual(issues(mechanism));
      for (const id of selected) {
        const source = element_in(mechanism, id);
        points_of(source).forEach((point, i) => {
          const target = mirrored_point(point, axis, expected);
          expect(points_of(element_in(after, id))[i].distance_to(target)).toBeLessThan(0.05);
        });
      }
    });
  });
});

describe("motion", () => {
  /** Every position after `frames` kinematic frames of `mechanism`, by solver key. */
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
    ["horizontal", jansen],
    ["vertical", jansen],
    ["horizontal", coreXY],
    ["vertical", coreXY],
  ] as [MirrorAxis, string][])(
    "a %s mirror moves as the mirror image of the original",
    (axis, json) => {
      const original = load(json);
      const center = elements_center(original.mechanicalElements);
      // A mechanism that stands still would mirror anything, reversed motors or not.
      const start = run(original, 1);
      let travelled = 0;
      run(original, 60).forEach((position, key) => {
        const from = start.get(key)!;
        if (!Number.isNaN(position.x) && !Number.isNaN(from.x))
          travelled = Math.max(travelled, position.distance_to(from));
      });
      expect(travelled).toBeGreaterThan(0.01);
      const twin = apply_actions(
        original,
        mirror_actions(
          original.mechanicalElements.map((el) => el.id),
          axis,
          original,
        ),
      );
      const before = run(original, 60);
      const after = run(twin, 60);
      let worst = 0;
      let compared = 0;
      before.forEach((position, key) => {
        // NaN: nothing recorded for this key at this instant.
        if (Number.isNaN(position.x)) return;
        compared++;
        worst = Math.max(
          worst,
          mirrored_point(position as WorldPoint, axis, center).distance_to(after.get(key)!),
        );
      });
      expect(compared).toBeGreaterThan(0);
      expect(worst).toBeLessThan(0.01);
    },
  );
});
