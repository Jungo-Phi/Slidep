import { ID, MechanicalElement } from "../types/element";

/** How many beams reference `materialID` — only beams ever do; the panel's "used by N beams"
 * counter, and what gates deletion. */
export function material_usage_count(
  mechanicalElements: MechanicalElement[],
  materialID: ID,
): number {
  return mechanicalElements.filter(
    (el) => el.type === "beam" && el.materialID === materialID,
  ).length;
}

/** Same as `material_usage_count`, for a profile. */
export function profile_usage_count(
  mechanicalElements: MechanicalElement[],
  profileID: ID,
): number {
  return mechanicalElements.filter(
    (el) => el.type === "beam" && el.profileID === profileID,
  ).length;
}
