/**
 * The one way a mechanism enters the app from outside — the library, a file.
 *
 * Migrating, reviving and repairing in that order: the migration chain leaves a
 * document of the current format, deserialization turns it into objects, and the
 * repair guarantees that every reference resolves. Everything downstream may
 * then assume a coherent mechanism.
 */

import { Mechanism } from "../types";
import { t, tn } from "../i18n";
import { migrate_document } from "./migrate-mechanism";
import { deserialize_mechanism } from "./serialization";
import { Repair, repair_mechanism } from "./repair-mechanism";

export interface LoadedMechanism {
  mechanism: Mechanism;
  /** Empty when the document was already sound. */
  repairs: Repair[];
}

export function load_mechanism(raw: unknown): LoadedMechanism {
  return repair_mechanism(deserialize_mechanism(migrate_document(raw)));
}

/** One line for the user: what was lost, without the field-level detail. */
export function repair_summary(repairs: Repair[]): string {
  const count = (code: Repair["code"]) =>
    repairs.filter((r) => r.code === code).length;
  const removed = count("ELEMENT_REMOVED");
  const points = count("POINT_RESET");
  const framing = count("VIEWPORT_RESET");
  const links = repairs.length - removed - points - framing;

  const parts: string[] = [];
  if (removed > 0) parts.push(tn("repair_elements_removed", removed));
  if (links > 0) parts.push(tn("repair_links_removed", links));
  if (points > 0) parts.push(tn("repair_points_reset", points));

  const summary = t("repair_summary", { parts: parts.join(", ") });
  // `repair_mechanism` keeps the undo stack when the framing was the only fault.
  if (framing === repairs.length) return summary;
  return `${summary} ${t("repair_history_cleared")}`;
}
