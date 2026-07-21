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
export const CURRENT_FORMAT_VERSION = 2;

/** A document mid-migration: its shape belongs to no version in particular. */
type RawDocument = Record<string, unknown>;

export interface MigrationStep {
  /** The version this step produces. Steps run in ascending order. */
  to: number;
  /**
   * Whether undo/redo entries survive the step. `false` empties `history` and
   * `future`: an entry the step cannot convert would undo into a shape no
   * current code can read. There is no default — each step must decide.
   *
   * Aim for `true`: a rename or a reshaping applies to a stored action as well
   * as to the current state, and dropping the stack costs the user their undo
   * for nothing. Reserve `false` for a step that would have to guess — an
   * action whose meaning is gone, not merely spelled differently.
   */
  preservesHistory: boolean;
  apply: (doc: RawDocument) => RawDocument;
}

/**
 * The chain, from the oldest step to the newest. A step converts a document of
 * version `to - 1` into one of version `to`, `history` and `future` included
 * when it claims to preserve them.
 */
const MIGRATIONS: MigrationStep[] = [
  {
    to: 2,
    preservesHistory: true,
    apply: (doc) => ({
      ...doc,
      mechanicalElements: as_array(doc.mechanicalElements).map(close_belt),
      history: close_belt_in_stack(doc.history),
      future: close_belt_in_stack(doc.future),
    }),
  },
];

/** v1 → v2: a belt's `tight` flag becomes `closed`, on the element itself. */
const close_belt = (element: unknown): unknown => {
  if (!is_record(element) || element.type !== "belt") return element;
  const { tight, ...rest } = element;
  return { ...rest, closed: tight === true };
};

/** The same rename where an action names the flag: `TightenBelt` and the belts it carries. */
const close_belt_in_action = (action: unknown): unknown => {
  if (!is_record(action)) return action;
  switch (action.type) {
    case "TightenBelt":
      return {
        type: "CloseBelt",
        id: action.id,
        closed: action.tightened === true,
      };
    case "UpdatePositionsToValidState":
      return action.masterActionType === "TightenBelt"
        ? { ...action, masterActionType: "CloseBelt" }
        : action;
    case "CreateElement":
    case "DeleteElement":
      return { ...action, element: close_belt(action.element) };
    default:
      return action;
  }
};

const close_belt_in_stack = (stack: unknown): unknown[][] =>
  as_array(stack).map((bundle) => as_array(bundle).map(close_belt_in_action));

const is_record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const as_array = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

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
  // Never `CURRENT_FORMAT_VERSION`: that reads a legacy document as already
  // up to date and skips every step it owes.
  let version =
    typeof doc.formatVersion === "number" ? doc.formatVersion : 1;

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
