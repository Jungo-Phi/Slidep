/**
 * Where a load sits on screen.
 *
 * Loads are drawn at a fixed screen size: a magnitude becomes a length in px
 * (see `load-scale.ts`), and only the *direction* comes from the world. So every
 * position here is a `ScreenPoint`, and the world→screen y flip is applied once,
 * in the three `*_screen_geometry` builders below.
 *
 * Those builders are the single source of truth: drawing, hit-testing and the
 * on-canvas value editor all read them, so a load is picked exactly where it is
 * drawn and its value is typed exactly where it is written.
 */

import type {
  DistributedForceElement,
  DistributedScreenGeometry,
  EdgeElement,
  ForceElement,
  ForceScreenGeometry,
  LoadElement,
  MechanicalElement,
  MomentElement,
  MomentScreenGeometry,
  NodeElement,
  ScreenPoint,
  ViewportState,
  WorldPoint,
} from "../types";
import { UP } from "../types";
import { DIM } from "../constants/rendering-specs";
import { get_mechanical_element_from_id } from "../components/mechanism/connect-actions";
import {
  world2screen,
  world2screen_length,
  world2screen_vec,
} from "./viewport";
import { frame2world_transform } from "./load-frame";
import {
  distributed_display_gain,
  screen2stored_load,
  stored2screen_load,
  stored2screen_moment,
} from "./load-scale";

// ─── Supports ───────────────────────────────────────────────────────────────

/**
 * World centre a moment's arc is drawn around: the middle of an edge, or a
 * gear's centre.
 */
export function moment_center_position(
  load: MomentElement,
  mechanicalElements: MechanicalElement[],
): WorldPoint {
  const support = get_mechanical_element_from_id(
    load.targetID,
    mechanicalElements,
  );
  if ("position" in support) return (support as NodeElement).position;
  const edge = support as EdgeElement;
  return edge.positionStart.lerp(edge.positionEnd, 0.5);
}

/** World position a force is anchored at (node, or an edge endpoint). */
function force_base_position(
  load: ForceElement,
  mechanicalElements: MechanicalElement[],
): WorldPoint {
  const target = get_mechanical_element_from_id(
    load.targetID,
    mechanicalElements,
  );
  if ("position" in target) return (target as NodeElement).position;
  const edge = target as EdgeElement;
  return load.anchor === "end" ? edge.positionEnd : edge.positionStart;
}

// ─── Value labels ───────────────────────────────────────────────────────────

/**
 * Position of the value label of an arrow drawn from `base` along
 * `displayVector`: past the tip, pushed away by a superellipse radius so the
 * text clears the arrowhead by a margin that follows the label's own aspect
 * (wider horizontally than vertically) instead of a constant gap.
 */
export function force_label_position_screen(
  base: ScreenPoint,
  displayVector: ScreenPoint,
): ScreenPoint {
  if (displayVector.length() < 1e-9) return base;
  const N = 4;
  const width = DIM.LOAD_VALUE_OFFSET * 1.66;
  const height = DIM.LOAD_VALUE_OFFSET;
  const unit = displayVector.normalize();
  const radius = Math.pow(
    Math.pow(unit.x / width, N) + Math.pow(unit.y / height, N),
    -1 / N,
  );
  return base.add(displayVector.extend_length(radius));
}

/** Position of the value label of a moment, above its arc — screen axes, so up is −y. */
export function moment_value_label_position(
  center: ScreenPoint,
  radius: number,
): ScreenPoint {
  return center.sub(UP.mul(radius + DIM.LOAD_VALUE_OFFSET));
}

// ─── Screen geometry ────────────────────────────────────────────────────────

export function force_screen_geometry(
  load: ForceElement,
  mechanicalElements: MechanicalElement[],
  viewport: ViewportState,
): ForceScreenGeometry {
  const base = world2screen(
    force_base_position(load, mechanicalElements),
    viewport,
  );
  const worldVec = frame2world_transform(
    load.vector,
    load.frame,
    mechanicalElements,
  );
  const magnitude = worldVec.length();
  const screenVec = world2screen_vec(worldVec, viewport);
  const vector =
    magnitude < 1e-9
      ? screenVec
      : screenVec.with_length(stored2screen_load(magnitude));
  const tip = base.add(vector);
  return {
    base,
    vector,
    tip,
    label: force_label_position_screen(base, vector),
  };
}

export function distributed_screen_geometry(
  load: DistributedForceElement,
  mechanicalElements: MechanicalElement[],
  viewport: ViewportState,
): DistributedScreenGeometry {
  const beam = get_mechanical_element_from_id(
    load.targetID,
    mechanicalElements,
  ) as EdgeElement;
  const gain = distributed_display_gain(load.magnitudeStart, load.magnitudeEnd);
  const arrow = (magnitude: number): ScreenPoint =>
    world2screen_vec(
      frame2world_transform(
        load.direction.mul(magnitude),
        load.frame,
        mechanicalElements,
      ),
      viewport,
    ).with_length(Math.abs(magnitude) * gain);

  const start = world2screen(beam.positionStart, viewport);
  const end = world2screen(beam.positionEnd, viewport);
  const vectorStart = arrow(load.magnitudeStart);
  const vectorEnd = arrow(load.magnitudeEnd);
  return {
    start,
    end,
    vectorStart,
    vectorEnd,
    tipStart: start.add(vectorStart),
    tipEnd: end.add(vectorEnd),
    // Each endpoint arrow is drawn from its own beam end, so its label sits
    // exactly where `draw_force` puts it for that arrow.
    labelStart: force_label_position_screen(start, vectorStart),
    labelEnd: force_label_position_screen(end, vectorEnd),
  };
}

export function moment_screen_geometry(
  load: MomentElement,
  mechanicalElements: MechanicalElement[],
  viewport: ViewportState,
): MomentScreenGeometry {
  const worldCenter = moment_center_position(load, mechanicalElements);
  const center = world2screen(worldCenter, viewport);
  const radius = stored2screen_moment(load.value);
  return {
    center,
    worldCenter,
    radius,
    label: moment_value_label_position(center, radius),
  };
}

/**
 * Screen position of a load's editable value label — the anchor the on-canvas
 * value editor centers on, and the centre of its hit target in `get-hover.ts`.
 * For a distributed force, `part` selects the start or end magnitude label.
 */
export function load_value_anchor(
  load: LoadElement,
  mechanicalElements: MechanicalElement[],
  viewport: ViewportState,
  part?: "start" | "end",
): ScreenPoint {
  switch (load.type) {
    case "force":
      return force_screen_geometry(load, mechanicalElements, viewport).label;
    case "moment":
      return moment_screen_geometry(load, mechanicalElements, viewport).label;
    case "distributed-force": {
      const geometry = distributed_screen_geometry(
        load,
        mechanicalElements,
        viewport,
      );
      return part === "end" ? geometry.labelEnd : geometry.labelStart;
    }
  }
}

// ─── Drags ──────────────────────────────────────────────────────────────────

/**
 * A world drag vector (base→cursor) → the magnitude vector a force stores:
 * same world direction, length the value the drag reads on the display ruler.
 * The viewport is only there to measure that drag in screen px, the unit the
 * ruler is graduated in.
 */
export function drag2stored_force_vector(
  worldDrag: WorldPoint,
  viewport: ViewportState,
): WorldPoint {
  return worldDrag.with_length(
    screen2stored_load(world2screen_length(worldDrag.length(), viewport)),
  );
}
