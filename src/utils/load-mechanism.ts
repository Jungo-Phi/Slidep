/**
 * The one way a mechanism enters the app from outside — the library, a file.
 *
 * Migrating, reviving and repairing in that order: the migration chain leaves a
 * document of the current format, deserialization turns it into objects, and the
 * repair guarantees that every reference resolves. Everything downstream may
 * then assume a coherent mechanism.
 */

import { Mechanism } from "../types";
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
  const removed = repairs.filter((r) => r.code === "ELEMENT_REMOVED").length;
  const links = repairs.length - removed;

  const parts: string[] = [];
  if (removed > 0)
    parts.push(
      `${removed} élément${removed > 1 ? "s" : ""} supprimé${removed > 1 ? "s" : ""}`,
    );
  if (links > 0)
    parts.push(
      `${links} liaison${links > 1 ? "s" : ""} cassée${links > 1 ? "s" : ""} retirée${links > 1 ? "s" : ""}`,
    );

  return `Mécanisme réparé : ${parts.join(", ")}. L'historique a été effacé.`;
}
