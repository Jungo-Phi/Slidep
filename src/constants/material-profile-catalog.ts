/**
 * The application-level catalogue of materials and profiles. Constants, translated — as opposed to a mechanism's own library, what a `BeamElement`
 * actually references. `seed_material_catalog` copies every material here into a mechanism's
 * own `materials` once, at creation/migration (a fresh id each, name frozen in whatever
 * language was active, `readOnly: true`) — nothing here is a live reference `BeamElement`
 * reads directly. Profiles carry no such seeding: a shape kind already is their catalogue.
 *
 * Functions, not plain constants, because the name has to read the active language at call
 * time — the same reason `ANGULAR_VELOCITY` in quantity-format.ts is one (see its own doc).
 */

import { t } from "../i18n";
import { MaterialDef, ProfileDef, ProfileShape } from "../types/material";
import { ID } from "../types/element";

export interface CatalogMaterial {
  name: () => string;
  /** Pa */
  E: number;
  /** Pa */
  Re: number;
  /** kg/m³ */
  rho: number;
}

export const MATERIAL_CATALOG: CatalogMaterial[] = [
  { name: () => t("material_acier"), E: 210e9, Re: 235e6, rho: 7850 },
  { name: () => t("material_aluminium"), E: 70e9, Re: 195e6, rho: 2700 },
  { name: () => t("material_inox"), E: 200e9, Re: 215e6, rho: 8000 },
  { name: () => t("material_bois"), E: 11e9, Re: 24e6, rho: 450 },
];

export interface CatalogProfile {
  name: () => string;
  shape: ProfileDef["shape"];
}

export const PROFILE_CATALOG: CatalogProfile[] = [
  {
    name: () => t("profile_rectangle"),
    shape: { kind: "rect", b: 0.02, h: 0.02 },
  },
  { name: () => t("profile_round"), shape: { kind: "round", d: 0.016 } },
  { name: () => t("profile_tube"), shape: { kind: "tube", d: 0.02, e: 0.002 } },
  {
    name: () => t("profile_box"),
    shape: { kind: "box", b: 0.03, h: 0.02, e: 0.002 },
  },
  {
    name: () => "IPE 100", // standard designation, the same word in every language
    shape: { kind: "I", b: 0.055, h: 0.1, tw: 0.0041, tf: 0.0057 },
  },
];

/** A fresh library copy of a catalogue material — a new id, its name frozen in the active
 *  language. */
export const catalog_material_def = (entry: CatalogMaterial, readOnly: boolean): MaterialDef => ({
  id: crypto.randomUUID() as ID,
  name: entry.name(),
  E: entry.E,
  Re: entry.Re,
  rho: entry.rho,
  readOnly,
});

/** Every catalogue material, copied into a mechanism's own library — see this file's own
 *  doc. Always seeded in this order, so `materials[0]` (steel) is what a beam with no other
 *  reference to fall back on takes (`placing-element-actions.ts`). */
export function seed_material_catalog(): MaterialDef[] {
  return MATERIAL_CATALOG.map((entry) => catalog_material_def(entry, true));
}

/** Same as `catalog_material_def`, for a profile. */
export const catalog_profile_def = (entry: CatalogProfile): ProfileDef => ({
  id: crypto.randomUUID() as ID,
  name: entry.name(),
  shape: entry.shape,
});

/** The catalogue's own shape for `kind` — what switching a profile to a new shape kind
 *  resets its cotes to, since the old ones (a different field set entirely) carry no
 *  sensible value across the switch. Every kind the catalogue lists is covered by
 *  construction (`PROFILE_CATALOG` carries all five), so this never falls through. */
export function default_shape_for_kind(kind: ProfileShape["kind"]): ProfileShape {
  const entry = PROFILE_CATALOG.find((p) => p.shape.kind === kind);
  if (!entry) throw new Error(`No catalogue entry for profile kind "${kind}"`);
  return { ...entry.shape };
}

/**
 * A fresh, editable starting point — steel's own values, the plain 20×20 mm rectangle — for
 * "+ Nouveau…": something to rename and tweak rather than an empty, invalid entry. Distinct
 * from `seed_material_catalog`: this one entry is never `readOnly`.
 */
export function default_material(): MaterialDef {
  return catalog_material_def(MATERIAL_CATALOG[0], false);
}

export function default_profile(): ProfileDef {
  return catalog_profile_def(PROFILE_CATALOG[0]);
}
