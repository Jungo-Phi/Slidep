import { MaterialDef, ProfileDef, ProfileShape } from "../types/material";
import { ID } from "../types/element";

/** A cross-section's derived mechanical properties — never stored, always recomputed from
 *  the profile's shape. */
export interface SectionProperties {
  /** m² */
  A: number;
  /** m⁴ — about the out-of-plane bending axis. */
  I: number;
  /** m — distance from that axis to the extreme fibre. */
  v: number;
  /** m³ — first moment of area of the half-section above the neutral axis, about that axis
   *  (`docs/plan-efforts-interieurs.md` phase 9, chantier 2). Together with `b` below, gives
   *  `τ_max = T·Q/(I·b)` (Jouravski) at the neutral axis, where shear peaks. */
  Q: number;
  /** m — width of material actually present AT the neutral axis, not the section's overall
   *  width: for `box`/`tube` the neutral axis crosses the two hollow side walls only (`2·e`),
   *  for `I` it crosses the web only (`tw`). */
  b: number;
}

/**
 * `{ A, I, v, Q, b }` for `shape`. Every shape here is symmetric about the bending axis, so `v`
 * is always half the in-plane cote (`h` or `d`) — keep that invariant if a `U`/`L` profile is
 * ever added, since those have two distinct `v` and an offset centroid instead.
 */
export function section_properties(shape: ProfileShape): SectionProperties {
  switch (shape.kind) {
    case "rect": {
      const { b, h } = shape;
      return {
        A: b * h,
        I: (b * h ** 3) / 12,
        v: h / 2,
        Q: (b * h ** 2) / 8,
        b,
      };
    }
    case "box": {
      const { b, h, e } = shape;
      const bi = b - 2 * e;
      const hi = h - 2 * e;
      return {
        A: b * h - bi * hi,
        I: (b * h ** 3 - bi * hi ** 3) / 12,
        v: h / 2,
        Q: (b * h ** 2 - bi * hi ** 2) / 8,
        b: 2 * e,
      };
    }
    case "round": {
      const { d } = shape;
      const r = d / 2;
      return {
        A: (Math.PI * d ** 2) / 4,
        I: (Math.PI * d ** 4) / 64,
        v: r,
        Q: (2 / 3) * r ** 3,
        b: d,
      };
    }
    case "tube": {
      const { d, e } = shape;
      const di = d - 2 * e;
      const r = d / 2;
      const ri = di / 2;
      return {
        A: (Math.PI * (d ** 2 - di ** 2)) / 4,
        I: (Math.PI * (d ** 4 - di ** 4)) / 64,
        v: r,
        Q: (2 / 3) * (r ** 3 - ri ** 3),
        b: 2 * e,
      };
    }
    case "I": {
      const { b, h, tw, tf } = shape;
      const hi = h - 2 * tf;
      // Neutral axis at mid-height: the flange contributes its own area at its own centroid's
      // distance, the web only the half of it above the axis, at half ITS OWN distance.
      const Q = b * tf * (h / 2 - tf / 2) + (tw * hi ** 2) / 8;
      return {
        A: b * h - (b - tw) * hi,
        I: (b * h ** 3 - (b - tw) * hi ** 3) / 12,
        v: h / 2,
        Q,
        b: tw,
      };
    }
  }
}

/**
 * Whether `shape`'s cotes describe a physically sound section — every cote strictly
 * positive, and every wall thickness strictly under the half-cote it is cut from. Rejects at
 * the saisie (the properties panel calls this before accepting a typed value) rather than
 * letting `section_properties` produce a negative `I` from a self-intersecting section.
 */
export function validate_profile_shape(shape: ProfileShape): boolean {
  switch (shape.kind) {
    case "rect":
      return shape.b > 0 && shape.h > 0;
    case "box":
      return (
        shape.b > 0 &&
        shape.h > 0 &&
        shape.e > 0 &&
        shape.e < shape.b / 2 &&
        shape.e < shape.h / 2
      );
    case "round":
      return shape.d > 0;
    case "tube":
      return shape.d > 0 && shape.e > 0 && shape.e < shape.d / 2;
    case "I":
      return (
        shape.b > 0 &&
        shape.h > 0 &&
        shape.tw > 0 &&
        shape.tf > 0 &&
        shape.tw < shape.b &&
        shape.tf < shape.h / 2
      );
  }
}

const find_material = (
  id: ID,
  materials: MaterialDef[],
): MaterialDef | undefined => materials.find((m) => m.id === id);

const find_profile = (id: ID, profiles: ProfileDef[]): ProfileDef | undefined =>
  profiles.find((p) => p.id === id);

/** A beam's linear mass (kg/m), `ρ·A` of its assigned material and profile — derived, never
 *  stored on the element itself. 0 for a dangling reference, which validation forbids in a
 *  well-formed mechanism but a mid-edit intermediate state can still momentarily hold. */
export function beam_linear_mass(
  materialID: ID,
  profileID: ID,
  materials: MaterialDef[],
  profiles: ProfileDef[],
): number {
  const material = find_material(materialID, materials);
  const profile = find_profile(profileID, profiles);
  if (!material || !profile) return 0;
  return material.rho * section_properties(profile.shape).A;
}

/** A beam's section properties and yield strength, resolved from its assigned material and
 *  profile — `undefined` for a dangling reference, the same defensive case `beam_linear_mass`
 *  covers for a mid-edit intermediate state. */
export function beam_strength(
  materialID: ID,
  profileID: ID,
  materials: MaterialDef[],
  profiles: ProfileDef[],
): { section: SectionProperties; Re: number } | undefined {
  const material = find_material(materialID, materials);
  const profile = find_profile(profileID, profiles);
  if (!material || !profile) return undefined;
  return { section: section_properties(profile.shape), Re: material.Re };
}

/** The section's worst fibre, `|σ|max(s) = |N|/A + |Mf|·v/I` — folded from the two fibre
 *  stresses `N/A ± Mf·v/I` via `max(|a+b|, |a−b|) = |a|+|b|`, so both are covered without
 *  evaluating them separately. */
export function max_fiber_stress(
  N: number,
  Mf: number,
  section: SectionProperties,
): number {
  return Math.abs(N) / section.A + (Math.abs(Mf) * section.v) / section.I;
}

/** The neutral axis' own shear stress, `τ_max = |T|·Q/(I·b)` (Jouravski) — where shear peaks
 *  across the section, docs/plan-efforts-interieurs.md phase 9 chantier 2. */
export function max_shear_stress(
  T: number,
  section: SectionProperties,
): number {
  return (Math.abs(T) * section.Q) / (section.I * section.b);
}
