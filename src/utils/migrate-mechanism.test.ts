import { describe, expect, it } from "vitest";
import { DEFAULT } from "../constants/physics-specs";
import {
  CURRENT_FORMAT_VERSION,
  MIGRATION_STEPS,
  migrate_document,
} from "./migrate-mechanism";

/** A document reduced to what the migration chain touches. */
const doc = (extra: Record<string, unknown> = {}) => ({
  metadata: { name: "test" },
  mechanicalElements: [],
  constraintElements: [],
  loads: [],
  history: [["a"]],
  future: [["b"]],
  ...extra,
});

describe("the migration chain", () => {
  it("ends at the current version", () => {
    const last = MIGRATION_STEPS[MIGRATION_STEPS.length - 1];
    expect(last ? last.to : 1).toBe(CURRENT_FORMAT_VERSION);
  });

  it("is contiguous and ascending", () => {
    // A step numbered `to` converts from `to - 1`: a gap would leave documents
    // of the skipped version with no path forward.
    MIGRATION_STEPS.forEach((step, i) => expect(step.to).toBe(i + 2));
  });
});

describe("migrate_document", () => {
  // A missing field means the document predates it, so it owes every step. Read
  // as the current version instead, it would skip them all and keep its old
  // shape under a new version number.
  it("treats a document with no formatVersion as version 1", () => {
    const result = migrate_document(
      doc({ mechanicalElements: [{ type: "belt", id: "b", tight: true }] }),
    );
    expect(result.formatVersion).toBe(CURRENT_FORMAT_VERSION);
    expect(result.mechanicalElements[0]).toMatchObject({ closed: true });
  });

  it("keeps undo history when no step has to run", () => {
    const result = migrate_document(
      doc({ formatVersion: CURRENT_FORMAT_VERSION }),
    );
    expect(result.history).toEqual([["a"]]);
  });

  it("stamps the current version on a document that already carries one", () => {
    expect(migrate_document(doc({ formatVersion: 1 })).formatVersion).toBe(
      CURRENT_FORMAT_VERSION,
    );
  });

  it("renames a belt's tension flag", () => {
    const result = migrate_document(
      doc({
        formatVersion: 1,
        mechanicalElements: [
          { type: "belt", id: "b1", tight: false },
          { type: "beam", id: "m1", tight: true },
        ],
      }),
    );
    const [belt, beam] = result.mechanicalElements as unknown as Record<
      string,
      unknown
    >[];
    expect(belt).toMatchObject({ closed: false });
    expect("tight" in belt).toBe(false);
    // Only belts carry the flag: a like-named field elsewhere is not ours.
    expect(beam).toMatchObject({ tight: true });
  });

  it("renames the flag in the undo stack too", () => {
    const result = migrate_document(
      doc({
        formatVersion: 1,
        history: [
          [
            { type: "TightenBelt", id: "b1", tightened: true },
            { type: "MoveNode", id: "n1" },
          ],
        ],
        future: [
          [
            {
              type: "UpdatePositionsToValidState",
              masterActionType: "TightenBelt",
            },
            {
              type: "CreateElement",
              element: { type: "belt", id: "b2", tight: true },
            },
          ],
        ],
      }),
    );
    expect(result.history).toEqual([
      [
        { type: "CloseBelt", id: "b1", closed: true },
        { type: "MoveNode", id: "n1" },
      ],
    ]);
    expect(result.future).toEqual([
      [
        { type: "UpdatePositionsToValidState", masterActionType: "CloseBelt" },
        {
          type: "CreateElement",
          element: { type: "belt", id: "b2", closed: true },
        },
      ],
    ]);
  });

  it("fills in mass and friction absent from elements saved before they existed", () => {
    const result = migrate_document(
      doc({
        formatVersion: 2,
        mechanicalElements: [
          { type: "pivot", id: "p1" },
          { type: "slider", id: "s1" },
          { type: "slidep", id: "sp1" },
          { type: "gear", id: "g1" },
          { type: "beam", id: "b1" },
        ],
      }),
    );
    expect(result.mechanicalElements).toMatchObject([
      { rotationalFriction: DEFAULT.ROTATIONAL_FRICTION },
      { slidingFriction: DEFAULT.SLIDING_FRICTION },
      {
        slidingFriction: DEFAULT.SLIDING_FRICTION,
        rotationalFriction: DEFAULT.ROTATIONAL_FRICTION,
      },
      { surfaceMass: DEFAULT.SURFACE_MASS },
      { linearMass: DEFAULT.LINEAR_MASS },
    ]);
  });

  it("does not override a value already present", () => {
    const result = migrate_document(
      doc({
        formatVersion: 2,
        mechanicalElements: [
          { type: "beam", id: "b1", linearMass: 42 },
        ],
      }),
    );
    expect(result.mechanicalElements[0]).toMatchObject({ linearMass: 42 });
  });

  it("fills in the same defaults for an element carried by the undo stack", () => {
    const result = migrate_document(
      doc({
        formatVersion: 2,
        history: [
          [{ type: "CreateElement", element: { type: "gear", id: "g1" } }],
        ],
        future: [
          [{ type: "DeleteElement", element: { type: "beam", id: "b1" } }],
        ],
      }),
    );
    expect(result.history).toEqual([
      [
        {
          type: "CreateElement",
          element: { type: "gear", id: "g1", surfaceMass: DEFAULT.SURFACE_MASS },
        },
      ],
    ]);
    expect(result.future).toEqual([
      [
        {
          type: "DeleteElement",
          element: { type: "beam", id: "b1", linearMass: DEFAULT.LINEAR_MASS },
        },
      ],
    ]);
  });

  it("refuses a document from a newer format", () => {
    expect(() =>
      migrate_document(doc({ formatVersion: CURRENT_FORMAT_VERSION + 1 })),
    ).toThrow();
  });

  it("refuses what is not a document at all", () => {
    expect(() => migrate_document(null)).toThrow();
    expect(() => migrate_document([])).toThrow();
    expect(() => migrate_document("{}")).toThrow();
  });

  it("leaves the source untouched", () => {
    const source = doc();
    migrate_document(source);
    expect("formatVersion" in source).toBe(false);
  });
});
