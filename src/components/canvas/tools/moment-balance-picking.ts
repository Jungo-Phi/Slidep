/**
 * What the moment-balance picker takes hold of where the cursor is — a node, a beam end, the mechanism's own centre of mass (drawn only while this is armed, `draw_moment_balance_marker`'s own doing), or, failing all of those, the free point under the cursor itself.
 */

import type { HoveredPart } from "../../../types/hovered-part";
import type { MechanicalElement, ViewportState, WorldPoint } from "../../../types";
import type { MaterialDef, ProfileDef } from "../../../types/material";
import { HIT_TOLERANCE } from "../../../constants/interaction-specs";
import { world2screen } from "../../../utils";
import {
  MomentBalanceReference,
  mechanism_center_of_mass,
} from "../../solver/analysis/force-balance";

/** The reference a click would report right now, and where its own marker sits — the same pair a live preview draws and a click resolves, so the two never disagree about what is under the cursor. */
export interface MomentBalanceHover {
  reference: MomentBalanceReference;
  point: WorldPoint;
}

export function moment_balance_hover(
  hoveredPart: HoveredPart,
  mechanicalElements: MechanicalElement[],
  materials: MaterialDef[],
  profiles: ProfileDef[],
  viewport: ViewportState,
): MomentBalanceHover {
  if (hoveredPart.type === "Node")
    return {
      reference: { kind: "node", nodeID: hoveredPart.id },
      point: hoveredPart.position,
    };
  if (hoveredPart.type === "Edge" && hoveredPart.part !== "body")
    return {
      reference: {
        kind: "edge-end",
        edgeID: hoveredPart.id,
        which: hoveredPart.part,
      },
      point: hoveredPart.position,
    };
  const centerOfMass = mechanism_center_of_mass(
    mechanicalElements,
    materials,
    profiles,
  );
  if (
    centerOfMass &&
    world2screen(centerOfMass, viewport).distance_to(
      world2screen(hoveredPart.position, viewport),
    ) <= HIT_TOLERANCE.NODE
  )
    return { reference: { kind: "center-of-mass" }, point: centerOfMass };
  return {
    reference: { kind: "point", point: hoveredPart.position },
    point: hoveredPart.position,
  };
}
