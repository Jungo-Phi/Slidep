import { describe, expect, it } from "vitest";
import coreXY from "../../../test-mechanisms/Core XY - 2 moteurs.slidep?raw";
import huygens from "../../../test-mechanisms/Huygen's chain drive.slidep?raw";
import jansen from "../../../test-mechanisms/Jansen's linkage.slidep?raw";
import poulie from "../../../test-mechanisms/Poulie bloqueuse.slidep?raw";
import treillis from "../../../test-mechanisms/Treillis.slidep?raw";
import { ID, MechanicalElement, Mechanism, Point2, WorldPoint } from "../../types";
import { load_mechanism } from "../../utils/load-mechanism";
import { validate_mechanism } from "../../utils/validate-mechanism";
import { apply_actions } from "./apply-actions";
import {
  ClipboardContent,
  copied_selection,
  parse_clipboard,
  paste_actions,
  paste_delta,
  serialize_clipboard,
} from "./clipboard";

const MECHANISMS = { coreXY, huygens, jansen, poulie, treillis };
const load = (json: string): Mechanism => load_mechanism(JSON.parse(json)).mechanism;
const DELTA = new Point2<"world">(5, -3);

/** Copies through the serialized form, as the system clipboard does. */
function copied(ids: ID[], mechanism: Mechanism): ClipboardContent {
  const content = copied_selection(ids, mechanism);
  if (!content) throw new Error("nothing copied");
  const parsed = parse_clipboard(serialize_clipboard(content));
  if (!parsed) throw new Error("clipboard refused");
  return parsed;
}

function pasted(ids: ID[], mechanism: Mechanism) {
  const { actions, pastedIDs } = paste_actions(copied(ids, mechanism), DELTA, mechanism);
  return { after: apply_actions(mechanism, actions), pastedIDs };
}

const issues = (mechanism: Mechanism) =>
  (validate_mechanism(mechanism) ?? []).map((issue) => issue.code);

const points_of = (el: MechanicalElement): WorldPoint[] =>
  "position" in el ? [el.position] : [el.positionStart, el.positionEnd];

describe.each(Object.entries(MECHANISMS))("copy and paste in %s", (_, json) => {
  const mechanism = load(json);
  const allIDs = mechanism.mechanicalElements.map((el) => el.id);

  it("keeps the mechanism valid, whichever single element is pasted", () => {
    for (const id of allIDs)
      expect(issues(pasted([id], mechanism).after)).toEqual(issues(mechanism));
  });

  it("pastes a whole mechanism as a moved twin that leaves the original in place", () => {
    const { after, pastedIDs } = pasted(allIDs, mechanism);
    expect(after.mechanicalElements).toHaveLength(2 * allIDs.length);
    expect(after.constraintElements).toHaveLength(2 * mechanism.constraintElements.length);
    expect(after.loads).toHaveLength(2 * mechanism.loads.length);
    expect(issues(after)).toEqual(issues(mechanism));

    // Creating anything re-solves the whole mechanism, which settles a file saved slightly off its constraints: a lone pivot far away measures that.
    const lonePivot = apply_actions(mechanism, [
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
    const element_in = (m: Mechanism, id: ID) =>
      m.mechanicalElements.find((el) => el.id === id)!;
    mechanism.mechanicalElements.forEach((source, index) => {
      const original = element_in(after, source.id);
      const twin = element_in(after, pastedIDs[index]);
      points_of(source).forEach((point, i) => {
        const settled = points_of(element_in(lonePivot, source.id))[i].sub(point).length();
        const allowed = settled + 1e-6;
        expect(points_of(original)[i].sub(point).length()).toBeLessThan(allowed);
        expect(points_of(twin)[i].sub(point).sub(DELTA).length()).toBeLessThan(allowed);
      });
    });
  });

  it("records a single history entry", () => {
    const { after } = pasted(allIDs, mechanism);
    expect(after.history.length).toBe(mechanism.history.length + 1);
  });
});

describe("what a copy takes along", () => {
  const huygensMechanism = load(huygens);
  const of_type = (type: MechanicalElement["type"]) =>
    huygensMechanism.mechanicalElements.filter((el) => el.type === type);

  it("takes a gear's axle", () => {
    const gear = of_type("gear")[0];
    if (gear.type !== "gear") throw new Error("not a gear");
    const content = copied([gear.id], huygensMechanism);
    expect(content.mechanicalElements.map((el) => el.id)).toContain(gear.parentAxleID);
  });

  it("takes a closed belt's pulleys and junction", () => {
    const belt = of_type("belt").find((el) => el.type === "belt" && el.closed);
    if (belt?.type !== "belt") throw new Error("no closed belt");
    const content = copied([belt.id], huygensMechanism);
    const ids = content.mechanicalElements.map((el) => el.id);
    for (const gear of belt.attachedGearsIDs) expect(ids).toContain(gear.id);
    expect(ids).toContain(belt.fixedNodeStartID);
    const copy = content.mechanicalElements.find((el) => el.id === belt.id);
    expect(copy).toMatchObject({ closed: true });
  });

  it("leaves a lone beam's nodes behind and frees its ends", () => {
    const mechanism = load(jansen);
    const beam = mechanism.mechanicalElements.find(
      (el) => el.type === "beam" && el.fixedNodeStartID && el.fixedNodeEndID,
    )!;
    const content = copied([beam.id], mechanism);
    expect(content.mechanicalElements).toHaveLength(1);
    expect(content.mechanicalElements[0]).toMatchObject({
      type: "beam",
      fixedNodeStartID: undefined,
      fixedNodeEndID: undefined,
    });
  });

  it("copies nothing for an ID that names no mechanical element", () => {
    expect(copied_selection(["nope" as ID], load(jansen))).toBeNull();
  });
});

describe("pasting into another mechanism", () => {
  const source = load(treillis);
  const beam = source.mechanicalElements.find((el) => el.type === "beam")!;
  const emptied = (): Mechanism => ({
    ...source,
    mechanicalElements: [],
    constraintElements: [],
    loads: [],
    materials: [],
    profiles: [],
    history: [],
    future: [],
  });

  it("brings along the materials and profiles the destination lacks", () => {
    const { actions } = paste_actions(copied([beam.id], source), DELTA, emptied());
    const after = apply_actions(emptied(), actions);
    expect(after.materials).toHaveLength(1);
    expect(after.profiles).toHaveLength(1);
    expect(issues(after)).toEqual([]);
  });

  it("reuses an identical material under another ID rather than piling up copies", () => {
    const content = copied([beam.id], source);
    const destination: Mechanism = {
      ...emptied(),
      materials: content.materials.map((m) => ({ ...m, id: crypto.randomUUID() as ID })),
      profiles: content.profiles.map((p) => ({ ...p, id: crypto.randomUUID() as ID })),
    };
    const after = apply_actions(destination, paste_actions(content, DELTA, destination).actions);
    expect(after.materials).toHaveLength(1);
    expect(after.mechanicalElements[0]).toMatchObject({
      materialID: destination.materials[0].id,
      profileID: destination.profiles[0].id,
    });
  });
});

describe("names", () => {
  it("renames only a name the destination already uses", () => {
    const source = load(jansen);
    const beam = source.mechanicalElements.find((el) => el.type === "beam")!;
    const named: Mechanism = {
      ...source,
      mechanicalElements: source.mechanicalElements.map((el) =>
        el.id === beam.id ? { ...el, name: "Bielle" } : el,
      ),
    };
    const content = copied([beam.id], named);
    const name_after_paste = (into: Mechanism) =>
      (paste_actions(content, DELTA, into).actions[0] as { element: { name?: string } }).element.name;

    expect(name_after_paste(named)).not.toBe("Bielle");
    expect(name_after_paste(source)).toBe("Bielle");
  });
});

describe("parse_clipboard", () => {
  const valid = serialize_clipboard(copied_selection(
    [load(jansen).mechanicalElements[0].id],
    load(jansen),
  )!);

  it("refuses what is not a Slidep clipboard, or from another format version", () => {
    expect(parse_clipboard("bonjour")).toBeNull();
    expect(parse_clipboard('{"kind":"other"}')).toBeNull();
    expect(parse_clipboard(JSON.stringify({ ...JSON.parse(valid), formatVersion: -1 }))).toBeNull();
  });

  it("refuses a reference that leads nowhere", () => {
    const raw = JSON.parse(valid);
    raw.constraintElements = [
      { id: crypto.randomUUID(), type: "dimension-edge", edgeID: crypto.randomUUID(), value: 1, position: { x: 0, y: 0 } },
    ];
    expect(parse_clipboard(JSON.stringify(raw))).toBeNull();
  });
});

describe("paste_delta", () => {
  const center = new Point2<"world">(1, 1);

  it("carries the content to where it is wanted", () => {
    const delta = paste_delta(center, new Point2<"world">(4, 3), [], 0.5);
    expect(delta.x).toBeCloseTo(3);
    expect(delta.y).toBeCloseTo(2);
  });

  it("steps off every occupied spot", () => {
    const first = paste_delta(center, center, [center], 0.5);
    const second = paste_delta(center, center, [center, center.add(first)], 0.5);
    expect(first.length()).toBeGreaterThan(0);
    expect(second.sub(first).length()).toBeGreaterThan(0);
  });

  it("moves by whole grid steps, even when the offset is finer than the grid", () => {
    const delta = paste_delta(center, center, [center], 0.1, 2);
    expect(Math.abs(delta.x)).toBeCloseTo(2);
    expect(Math.abs(delta.y)).toBeCloseTo(2);
    const rounded = paste_delta(center, new Point2<"world">(4.1, 1), [], 0.1, 2);
    expect(rounded.x).toBeCloseTo(4);
    expect(rounded.y).toBeCloseTo(0);
  });
});
