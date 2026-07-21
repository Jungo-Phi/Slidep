/**
 * Visual snapping for loads. Applied in MechanicalCanvas on the hovered
 * position, so the placement/drag preview visibly snaps, like the grid does.
 *
 * Two independent snaps ride on the same position:
 * - direction, so a load's aim relative to its base lands on a world axis or on
 *   a connected beam's axial/normal;
 * - length, so the drawn arrow (or arc) lands on one that reads a round value.
 *   Because the display scale is logarithmic, this is done on the drawn length
 *   and not on the value: the tolerance stays a constant number of pixels
 *   whatever the magnitude, exactly like every other snap in the canvas.
 */

import type { CanvasState } from "../../types/canvas-state";
import type {
  DistributedForceElement,
  EdgeElement,
  ForceElement,
  LoadElement,
  MechanicalElement,
  MomentElement,
} from "../../types";
import { names_element } from "../../types/hovered-part";
import { Point2 } from "../../types/point2";
import { HIT_TOLERANCE } from "../../constants/rendering-specs";
import {
  distributed_grab_length,
  distributed_grab_magnitude,
  distributed_tip_length,
  distributed_tip_magnitude,
  force_snap_edges,
  frame2world,
  is_zero_load,
  moment_center_position,
  moment_display_radius,
  nearest_round_load_value,
  radius2moment_value,
  snap_direction,
  stored2world_load,
  world2stored_load,
} from "../../utils/load-geom";

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
 * Return `position` snapped for load placement/drag states; unchanged for any
 * other state. `zoom` keeps the tolerance a fixed distance on screen.
 */
export function snap_load_hover(
  state: CanvasState,
  position: Point2,
  mechanicalElements: MechanicalElement[],
  loadElements: LoadElement[],
  zoom: number = 1,
): Point2 {
  const tolerance = HIT_TOLERANCE.SNAP_TO_GRID / zoom;

  /** `length` pulled onto the one that draws a round value, within tolerance. */
  const snap_length = (
    length: number,
    value_of: (length: number) => number,
    length_of: (value: number) => number,
  ): number => {
    const magnitude = Math.abs(length);
    const target = length_of(nearest_round_load_value(value_of(magnitude)));
    if (Math.abs(magnitude - target) > tolerance) return length;
    return length < 0 ? -target : target;
  };

  /** An arrow from `base`: aim it, then pull its length onto a round value. */
  const snap_arrow = (base: Point2, edges: EdgeElement[]): Point2 => {
    const aimed = snap_direction(position.sub(base), edges);
    const length = aimed.length();
    if (length < 1e-6) return base.add(aimed);
    const snapped = snap_length(length, world2stored_load, stored2world_load);
    return base.add(aimed.mul(snapped / length));
  };

  /**
   * A handle that only slides along `direction`: snap the projection that sets
   * the magnitude, and shift the position by just that much so the rest of the
   * cursor's offset — which the drag ignores anyway — is left alone.
   *
   * `rungs_of` returns the drawn lengths worth snapping to, **most meaningful
   * first**. A rung landing within `crowding` of one already kept is dropped:
   * the round-value ladder is multiplicative, so towards zero it piles up rungs
   * that end up a fraction of a pixel apart once the load's gain is applied
   * (with a peak of 300 N/m, the rungs at 1 and 2 sit half a pixel from zero).
   * A mouse cannot tell those apart, so only the rung carrying the most meaning
   * survives — which is how zero wins over "1" next to an end at 300.
   */
  const crowding = tolerance / 2;
  const snap_along = (
    base: Point2,
    direction: Point2,
    rungs_of: (projection: number) => number[],
  ): Point2 => {
    const projection = position.sub(base).dot(direction);
    const kept: number[] = [];
    let target = projection;
    let bestDistance = tolerance;
    for (const rung of rungs_of(projection)) {
      if (kept.some((k) => Math.abs(k - rung) < crowding)) continue;
      kept.push(rung);
      const distance = Math.abs(rung - projection);
      if (distance < bestDistance) {
        bestDistance = distance;
        target = rung;
      }
    }
    return position.add(direction.mul(target - projection));
  };

  /** A moment's arc: only its radius carries a value, its aim carries nothing. */
  const snap_arc = (center: Point2): Point2 => {
    const radius = position.sub(center);
    const length = radius.length();
    if (length < 1e-6) return position;
    const snapped = snap_length(
      length,
      radius2moment_value,
      moment_display_radius,
    );
    return center.add(radius.mul(snapped / length));
  };

  switch (state.type) {
    case "PlacingForceEnd": {
      const startHover = state.startHover;
      if (!names_element(startHover)) return position;
      const anchor =
        startHover.type === "Edge" && startHover.part !== "body"
          ? startHover.part
          : undefined;
      return snap_arrow(
        startHover.position,
        force_snap_edges(startHover.id, anchor, mechanicalElements),
      );
    }
    case "PlacingDistributedForce": {
      const startHover = state.startHover;
      if (!names_element(startHover)) return position;
      const beam = as_edge(
        mechanicalElements.find((e) => e.id === startHover.id),
      );
      if (!beam) return position;
      return snap_arrow(beam.positionStart.lerp(beam.positionEnd, 0.5), [beam]);
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
      return snap_arrow(
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
      const beam = as_edge(
        mechanicalElements.find((e) => e.id === df.targetID),
      );
      if (!beam) return position;
      // No handle aims the load any more, so all three are the same gesture:
      // slide along the direction, and pull the length onto one that reads a
      // round value. Only the length↔value mapping differs.
      const direction = frame2world(df.direction, df.frame, mechanicalElements);
      if (state.part === "body") {
        const grabbed =
          df.magnitudeStart +
          (df.magnitudeEnd - df.magnitudeStart) * state.grabT;
        const offsetStart = df.magnitudeStart - grabbed;
        const offsetEnd = df.magnitudeEnd - grabbed;
        return snap_along(
          beam.positionStart.lerp(beam.positionEnd, state.grabT),
          direction,
          (projection) => {
            const magnitude = distributed_grab_magnitude(
              projection,
              offsetStart,
              offsetEnd,
            );
            // Both ends shift together, so either of them landing on a round
            // value is worth a rung — snapping the grabbed point instead would
            // be meaningless, its position along the beam being arbitrary.
            const length_of = (end: number, offset: number) =>
              distributed_grab_length(end - offset, offsetStart, offsetEnd);
            const offsets = [offsetStart, offsetEnd];
            // Both configurations below annul something, so both need the load
            // to have a taper: on a uniform one they would take its two ends to
            // zero at once and snap the whole load away to nothing.
            const tapered = !is_zero_load(offsetEnd - offsetStart);
            // Zeroing an end comes first: it is what makes the load triangular,
            // the round-value ladder never reaches it, and next to a big
            // opposite end it is the only rung down there that means anything.
            const zeros = tapered
              ? offsets.map((offset) => length_of(0, offset))
              : [];
            // Then the load centred on its beam (q at one end, -q at the
            // other), whose crest line crosses at mid-span.
            const antisymmetric = tapered
              ? [
                  distributed_grab_length(
                    -(offsetStart + offsetEnd) / 2,
                    offsetStart,
                    offsetEnd,
                  ),
                ]
              : [];
            const rounds = offsets.map((offset) => {
              const end = magnitude + offset;
              return length_of(
                Math.sign(end) * nearest_round_load_value(end),
                offset,
              );
            });
            return [...zeros, ...antisymmetric, ...rounds];
          },
        );
      }
      const isStart = state.part === "start";
      const other = isStart ? df.magnitudeEnd : df.magnitudeStart;
      return snap_along(
        isStart ? beam.positionStart : beam.positionEnd,
        direction,
        (projection) => {
          const magnitude = distributed_tip_magnitude(projection, other);
          const rungs: number[] = [];
          // Three configurations the round-value ladder never reaches, and
          // which outrank it: zero (the triangular load), matching the opposite
          // end (the uniform one) and its negative (the antisymmetric one,
          // crossing the beam at mid-span). None exists if that end carries
          // nothing.
          if (!is_zero_load(other)) {
            rungs.push(
              0,
              distributed_tip_length(other, other),
              distributed_tip_length(-other, other),
            );
          }
          rungs.push(
            distributed_tip_length(
              Math.sign(magnitude) * nearest_round_load_value(magnitude),
              other,
            ),
          );
          return rungs;
        },
      );
    }
    case "PlacingMomentEnd": {
      if (state.startHover.type === "Void") return position;
      return snap_arc(state.startHover.position);
    }
    case "MovingMoment": {
      const moment = loadElements.find((l) => l.id === state.elementID) as
        | MomentElement
        | undefined;
      if (!moment) return position;
      return snap_arc(moment_center_position(moment, mechanicalElements));
    }
  }
  return position;
}
