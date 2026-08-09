import type { HoveredPart } from "../../types/hovered-part";
import { names_element } from "../../types/hovered-part";
import {
  BeamElement,
  DistributedForceElement,
  ForceElement,
  ID,
  MechanicalElement,
  MomentElement,
  Point2,
  UP,
  ViewportState,
} from "../../types";
import { get_mechanical_element_from_id } from "../mechanism/connect-actions";
import { drag2stored_force_vector } from "../../utils/load-geom";
import {
  screen2stored_load,
  screen2stored_moment,
} from "../../utils/load-scale";
import {
  force_snap_edges,
  world2frame_transform,
} from "../../utils/load-frame";
import { world2screen_length, world2screen_vec } from "../../utils";
import { frame_from_drag } from "./load-snap";

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
  viewport: ViewportState,
): ForceElement | undefined {
  if (!names_element(startHover) || startHover.type === "Constraint")
    return undefined;
  const anchor =
    startHover.type === "Edge" && startHover.part !== "body"
      ? startHover.part
      : undefined;
  // The cursor is already direction-snapped (see snap_load_hover)
  const drag = cursor.sub(startHover.position);
  const frame = frame_from_drag(
    world2screen_vec(drag, viewport),
    force_snap_edges(startHover.id, anchor, mechanicalElements),
    viewport,
  );
  return {
    type: "force",
    id,
    targetID: startHover.id,
    anchor,
    vector: world2frame_transform(
      drag2stored_force_vector(drag, viewport),
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
  viewport: ViewportState,
): DistributedForceElement | undefined {
  if (startHover.type !== "Edge") return undefined;
  const beam = get_mechanical_element_from_id(
    startHover.id,
    mechanicalElements,
  ) as BeamElement;
  const drag = cursor.sub(beam.positionStart.lerp(beam.positionEnd, 0.5));
  const magnitude = screen2stored_load(
    world2screen_length(drag.length(), viewport),
  );
  // The cursor is already direction-snapped (see snap_load_hover): a load that
  // landed on its beam's axial/normal references that beam and follows it.
  const frame = frame_from_drag(
    world2screen_vec(drag, viewport),
    [beam],
    viewport,
  );
  const direction = drag.length() > 1e-6 ? drag.normalize() : new Point2(0, -1);
  return {
    type: "distributed-force",
    id,
    targetID: startHover.id,
    direction: world2frame_transform(direction, frame, mechanicalElements),
    magnitudeStart: magnitude,
    magnitudeEnd: magnitude,
    frame,
  };
}

export function moment_from_drag(
  id: ID,
  startHover: HoveredPart,
  cursor: Point2,
  viewport: ViewportState,
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
      screen2stored_moment(
        world2screen_length(startHover.position.distance_to(cursor), viewport),
      ) * (cursor.sub(startHover.position).cross(UP) >= 0 ? 1 : -1),
  };
}
