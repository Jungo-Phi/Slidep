import { ID } from "./element";

/**
 * A mechanism's own material.
 * Every catalogue entry (steel, aluminium…) is seeded into `Mechanism.materials` once, at creation or migration — never read live from the catalogue — so a shared mechanism stays self-sufficient even if the app's catalogue changes later.
 */
export interface MaterialDef {
  id: ID;
  /** User data, not translated — frozen in whatever language it was seeded in. */
  name: string;
  /** Pa */
  E: number;
  /** Pa — yield/strength limit, feeds the stress overlay's usage ratio. */
  Re: number;
  /** kg/m³ */
  rho: number;
}

/** A cross-section shape and its cotes, in metres. `h`/`d` sit in the drawing plane — bending
 * is always about the out-of-plane axis in 2D, so that is the cote that resists it. */
export type ProfileShape =
  | { kind: "rect"; b: number; h: number }
  | { kind: "box"; b: number; h: number; e: number }
  | { kind: "round"; d: number }
  | { kind: "tube"; d: number; e: number }
  | { kind: "I"; b: number; h: number; tw: number; tf: number };

/** A mechanism's own copy of a profile — same copy-not-reference relationship to the
 * catalogue as `MaterialDef`. */
export interface ProfileDef {
  id: ID;
  name: string;
  shape: ProfileShape;
}
