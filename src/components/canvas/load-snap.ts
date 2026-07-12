/**
 * Visual direction snapping for loads: snaps the hovered position (like grid
 * snap) so a load's direction relative to its base aligns with the world axes
 * or the reference beam's axial/normal. Applied in MechanicalCanvas on the
 * hovered position, so the placement/drag preview visibly snaps.
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
import { snap_direction } from "../../utils/load-geom";

/** The reference edge whose axes a load snaps to: its frame edge if edge-framed,
 *  else the given fallback edge. */
function reference_edge(
  frame: ForceElement["frame"],
  fallback: EdgeElement | undefined,
  mechanicalElements: MechanicalElement[],
): EdgeElement | undefined {
  if (frame !== "world") {
    const edge = mechanicalElements.find((e) => e.id === frame.edgeID);
    if (edge && "positionStart" in edge) return edge as EdgeElement;
  }
  return fallback;
}

const as_edge = (
  el: MechanicalElement | LoadElement | undefined,
): EdgeElement | undefined =>
  el && "positionStart" in el ? (el as EdgeElement) : undefined;

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
  const snapAround = (base: Point2, edge: EdgeElement | undefined) =>
    base.add(snap_direction(position.sub(base), edge));

  switch (state.type) {
    case "PlacingForceEnd": {
      const startHover = state.startHover;
      if (startHover.type === "Void") return position;
      const target = mechanicalElements.find((e) => e.id === startHover.id);
      return snapAround(startHover.position, as_edge(target));
    }
    case "PlacingDistributedForceEnd": {
      const startHover = state.startHover;
      if (startHover.type === "Void") return position;
      const beam = as_edge(
        mechanicalElements.find((e) => e.id === startHover.id),
      );
      if (!beam) return position;
      return snapAround(beam.positionStart.lerp(beam.positionEnd, 0.5), beam);
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
        reference_edge(force.frame, as_edge(target), mechanicalElements),
      );
    }
    case "MovingDistributedForce": {
      const df = loadElements.find((l) => l.id === state.elementID) as
        | DistributedForceElement
        | undefined;
      if (!df) return position;
      const beam = as_edge(mechanicalElements.find((e) => e.id === df.beamID));
      if (!beam) return position;
      const edge = reference_edge(df.frame, beam, mechanicalElements);
      const base =
        state.part === "start-tip"
          ? beam.positionStart
          : state.part === "end-tip"
            ? beam.positionEnd
            : position.project_on_line(beam.positionStart, beam.positionEnd);
      return snapAround(base, edge);
    }
  }
  return position;
}
