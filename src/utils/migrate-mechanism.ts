/**
 * Brings a stored document up to the file format the code expects.
 *
 * Every mechanism read from outside the app — the library, an imported file —
 * goes through `migrate_document` before anything else looks at it. What comes
 * out is a `SerializedMechanism` of the current version; `deserialize_mechanism`
 * can then assume the shape it knows.
 */

import { SerializedMechanism } from "../types";

/** The format `serialize_mechanism` writes today. */
export const CURRENT_FORMAT_VERSION = 1;

/** A document mid-migration: its shape belongs to no version in particular. */
type RawDocument = Record<string, unknown>;

export interface MigrationStep {
  /** The version this step produces. Steps run in ascending order. */
  to: number;
  /**
   * Whether undo/redo entries survive the step. `false` empties `history` and
   * `future`: an entry the step cannot convert would undo into a shape no
   * current code can read. There is no default — each step must decide.
   */
  preservesHistory: boolean;
  apply: (doc: RawDocument) => RawDocument;
}

/**
 * The chain, from the oldest step to the newest. A step converts a document of
 * version `to - 1` into one of version `to`, `history` and `future` included
 * when it claims to preserve them.
 */
const MIGRATIONS: MigrationStep[] = [];

/**
 * Raises `raw` to `CURRENT_FORMAT_VERSION`. A document without a
 * `formatVersion` is a version 1 that predates the field, not an older format.
 *
 * Throws on a document that is unreadable or too recent — both are cases where
 * carrying on would mean guessing at the user's data.
 */
export function migrate_document(raw: unknown): SerializedMechanism {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw))
    throw new Error("Document illisible");

  let doc = { ...raw } as RawDocument;
  let version =
    typeof doc.formatVersion === "number"
      ? doc.formatVersion
      : CURRENT_FORMAT_VERSION;

  if (version > CURRENT_FORMAT_VERSION)
    throw new Error(
      `Format ${version} : ce mécanisme vient d'une version plus récente de Slidep (format ${CURRENT_FORMAT_VERSION}).`,
    );

  for (const step of MIGRATIONS) {
    if (step.to <= version) continue;
    doc = step.apply(doc);
    if (!step.preservesHistory) doc = { ...doc, history: [], future: [] };
    version = step.to;
  }

  doc.formatVersion = CURRENT_FORMAT_VERSION;
  return doc as unknown as SerializedMechanism;
}

/** The chain, for the test that checks it stays contiguous. */
export const MIGRATION_STEPS: readonly MigrationStep[] = MIGRATIONS;
