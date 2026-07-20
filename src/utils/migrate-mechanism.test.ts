import { describe, expect, it } from "vitest";
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
  it("treats a document with no formatVersion as the current one", () => {
    const result = migrate_document(doc());
    expect(result.formatVersion).toBe(CURRENT_FORMAT_VERSION);
    expect(result.history).toEqual([["a"]]);
  });

  it("stamps the current version on a document that already carries one", () => {
    expect(migrate_document(doc({ formatVersion: 1 })).formatVersion).toBe(
      CURRENT_FORMAT_VERSION,
    );
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
