/**
 * Visual direction snapping for loads: snaps the hovered position (like grid
 * snap) so a load's direction relative to its base aligns with the world axes
 * or a connected beam's axial/normal. Applied in MechanicalCanvas on the hovered
 * position, so the placement/drag preview visibly snaps.
 */

import type { CanvasState } from "../../types/canvas-state";
import type {
  DistributedForceElement,
  EdgeElement,
  ForceElement,
  LoadElement,
  MechanicalElement,
} from "../../types";
import { Point2 } from "../../types/point2";
import { force_snap_edges, snap_direction } from "../../utils/load-geom";

const as_edge = (
  el: MechanicalElement | LoadElement | undefined,
): EdgeElement | undefined =>
  el && "positionStart" in el ? (el as EdgeElement) : undefined;

/** The load's own frame edge appended to `edges` (deduped), if any. */
function with_frame_edge(
  edges: EdgeElement[],
  frame: ForceElement["frame"],
  mechanicalElements: MechanicalElement[],
): EdgeElement[] {
  if (frame === "world") return edges;
  const edge = as_edge(mechanicalElements.find((e) => e.id === frame.edgeID));
  if (edge && !edges.some((e) => e.id === edge.id)) return [...edges, edge];
  return edges;
}

/**
 * Return `position` snapped so that (position − base) aligns with a world or beam
 * axis, for load placement/drag states; unchanged for any other state.
 */
export function snap_load_hover(
  state: CanvasState,
  position: Point2,
  mechanicalElements: MechanicalElement[],
  loadElements: LoadElement[],
): Point2 {
  const snapAround = (base: Point2, edges: EdgeElement[]) =>
    base.add(snap_direction(position.sub(base), edges));

  switch (state.type) {
    case "PlacingForceEnd": {
      const startHover = state.startHover;
      if (startHover.type === "Void") return position;
      const anchor =
        startHover.type === "Edge" && startHover.part !== "body"
          ? startHover.part
          : undefined;
      return snapAround(
        startHover.position,
        force_snap_edges(startHover.id, anchor, mechanicalElements),
      );
    }
    case "PlacingDistributedForceEnd": {
      const startHover = state.startHover;
      if (startHover.type === "Void") return position;
      const beam = as_edge(
        mechanicalElements.find((e) => e.id === startHover.id),
      );
      if (!beam) return position;
      return snapAround(beam.positionStart.lerp(beam.positionEnd, 0.5), [beam]);
    }
    case "MovingForce": {
      const force = loadElements.find((l) => l.id === state.elementID) as
        | ForceElement
        | undefined;
      if (!force) return position;
      const target = mechanicalElements.find((e) => e.id === force.targetID);
      if (!target) return position;
      const base =
        "position" in target
          ? target.position
          : force.anchor === "start"
            ? target.positionStart
            : target.positionEnd;
      return snapAround(
        base,
        with_frame_edge(
          force_snap_edges(force.targetID, force.anchor, mechanicalElements),
          force.frame,
          mechanicalElements,
        ),
      );
    }
    case "MovingDistributedForce": {
      const df = loadElements.find((l) => l.id === state.elementID) as
        | DistributedForceElement
        | undefined;
      if (!df) return position;
      const beam = as_edge(mechanicalElements.find((e) => e.id === df.beamID));
      if (!beam) return position;
      const base =
        state.part === "start-tip"
          ? beam.positionStart
          : state.part === "end-tip"
            ? beam.positionEnd
            : position.project_on_line(beam.positionStart, beam.positionEnd);
      return snapAround(base, [beam]);
    }
  }
  return position;
}
