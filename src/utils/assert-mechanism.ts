import { Action } from "../types";
import { Mechanism } from "../types/mechanism";
import {
  MechanismValidationError,
  validate_mechanism,
} from "./validate-mechanism";
import { shown_element_name } from "./string-math";

/**
 * Development guard: reports in the console when an action bundle leaves the
 * mechanism referentially broken, naming the actions responsible.
 *
 * Only issues absent from `before` are reported, so an already-broken mechanism
 * does not drown every later edit in noise. Never throws — a diagnostic must not
 * become the crash it is meant to catch.
 */
export function assert_actions_preserve_validity(
  before: Mechanism,
  after: Mechanism,
  actions: Action[],
  label: string,
): void {
  if (!import.meta.env.DEV) return;

  const newIssues = issues_introduced(
    validate_mechanism(before),
    validate_mechanism(after),
  );
  if (newIssues.length === 0) return;

  console.group(
    `%c[mechanism] ${label} a cassé ${newIssues.length} invariant(s)`,
    "color:#e5484d;font-weight:bold",
  );
  // The message names the defect, not its element: the console has to re-attach it.
  const names = new Map(
    [
      ...after.mechanicalElements,
      ...after.constraintElements,
      ...after.loads,
    ].map((el) => [el.id, shown_element_name(el)]),
  );
  for (const issue of newIssues) {
    const name = issue.elementID ? (names.get(issue.elementID) ?? "?") : "?";
    console.error(`${issue.code}: ${name} ${issue.message}`);
  }
  console.log("Actions:", actions);
  console.groupEnd();
}

/**
 * Deliberately excludes `message`: it embeds resolved element names, so a rename
 * would make an untouched issue look new. Two issues sharing code and both IDs
 * but sitting on different fields therefore collapse into one.
 */
function issue_key(issue: MechanismValidationError): string {
  return `${issue.code}|${issue.elementID ?? ""}|${issue.relatedID ?? ""}`;
}

/** The issues present in `after` that `before` did not already have. */
function issues_introduced(
  before: MechanismValidationError[] | null,
  after: MechanismValidationError[] | null,
): MechanismValidationError[] {
  if (!after) return [];
  const known = new Set((before ?? []).map(issue_key));
  return after.filter((issue) => !known.has(issue_key(issue)));
}
