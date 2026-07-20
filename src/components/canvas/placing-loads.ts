import type { HoveredPart } from "../../types/hovered-part";
import {
  BeamElement,
  DistributedForceElement,
  ForceElement,
  ID,
  MechanicalElement,
  MomentElement,
  Point2,
} from "../../types";
import { get_mechanical_element_from_id } from "../mechanism/connect-actions";
import {
  force_snap_edges,
  force_stored_vector,
  frame_from_snapped_direction,
  moment_sign_from_cursor,
  radius2moment_value,
  world2frame,
  world2stored_load,
} from "../../utils/load-geom";

/**
 * The load a drag would create, from where it started to where the cursor is.
 *
 * The preview and the commit both build it: the ghost is then drawn through the
 * very helpers that draw a placed load, so what the user sees under the cursor is
 * the element they are about to get, not a second guess at it.
 *
 * They return `undefined` when the drag started on something that carries no such
 * load — the tool simply produces nothing.
 */

/** Stands in for the id of a load that only exists as a preview. */
export const GHOST_LOAD_ID = "----" as ID;

export function force_from_drag(
  id: ID,
  startHover: HoveredPart,
  cursor: Point2,
  mechanicalElements: MechanicalElement[],
): ForceElement | undefined {
  if (startHover.type === "Void" || startHover.type === "Constraint")
    return undefined;
  const anchor =
    startHover.type === "Edge" && startHover.part !== "body"
      ? startHover.part
      : undefined;
  // The cursor is already direction-snapped (see snap_load_hover): if it landed
  // on a connected edge's axial/normal, reference that edge.
  const drag = cursor.sub(startHover.position);
  const frame = frame_from_snapped_direction(
    drag,
    force_snap_edges(startHover.id, anchor, mechanicalElements),
  );
  return {
    type: "force",
    id,
    targetID: startHover.id,
    anchor,
    vector: world2frame(
      force_stored_vector(drag),
      frame,
      mechanicalElements,
    ),
    frame,
  };
}

export function distributed_force_from_drag(
  id: ID,
  startHover: HoveredPart,
  cursor: Point2,
  mechanicalElements: MechanicalElement[],
): DistributedForceElement | undefined {
  if (startHover.type !== "Edge") return undefined;
  const beam = get_mechanical_element_from_id(
    startHover.id,
    mechanicalElements,
  ) as BeamElement;
  const drag = cursor.sub(beam.positionStart.lerp(beam.positionEnd, 0.5));
  const magnitude = world2stored_load(drag.length());
  return {
    type: "distributed-force",
    id,
    targetID: startHover.id,
    direction: drag.length() > 1e-6 ? drag.normalize() : new Point2(0, -1),
    magnitudeStart: magnitude,
    magnitudeEnd: magnitude,
    frame: "world",
  };
}

export function moment_from_drag(
  id: ID,
  startHover: HoveredPart,
  cursor: Point2,
  mechanicalElements: MechanicalElement[],
): MomentElement | undefined {
  if (startHover.type !== "Edge" && startHover.type !== "GearTooth")
    return undefined;
  return {
    type: "moment",
    id,
    targetID: startHover.id,
    // The side of the support the cursor ends on picks the rotation sign;
    // afterwards only the panel can flip it, a drag just resizes the arc.
    value:
      radius2moment_value(startHover.position.distance_to(cursor)) *
      moment_sign_from_cursor(
        startHover.id,
        startHover.position,
        cursor,
        mechanicalElements,
      ),
  };
}
