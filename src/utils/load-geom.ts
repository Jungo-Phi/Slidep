/**
 * Where a load sits on screen.
 *
 * Loads are drawn at a fixed screen size: a magnitude becomes a length in px (see `load-scale.ts`), and only the *direction* comes from the world.
 * So every position here is a `ScreenPoint`, and the world→screen y flip is applied once, in the three `*_screen_geometry` builders below.
 *
 * Those builders are the single source of truth: drawing, hit-testing and the on-canvas value editor all read them, so a load is picked exactly where it is drawn and its value is typed exactly where it is written.
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
import { DIM, TEXT_SPECS } from "../constants/rendering-specs";
import { HIT_TOLERANCE } from "../constants/interaction-specs";
import {
  FORCE,
  LOAD_INTENSITY,
  MOMENT,
  QuantityKind,
  format_quantity,
} from "./quantity-format";
import { arial_text_width } from "./text-width";
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
 * World centre a moment's arc is drawn around: the middle of an edge, or a gear's centre.
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
export function force_base_position(
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

// ─── Hit testing ────────────────────────────────────────────────────────────

/**
 * Whether `mouseScreen` is on the arrow from `base` to `tip`: its shaft, or its tip handle.
 * The disc a node claims around `base` is left out: an arrow is planted on a node or a beam end, and is drawn above it, so without this the cursor could never reach what the arrow stands on.
 */
export function arrow_hit(
  mouseScreen: ScreenPoint,
  base: ScreenPoint,
  tip: ScreenPoint,
): boolean {
  if (mouseScreen.distance_to(base) <= HIT_TOLERANCE.NODE) return false;
  return (
    mouseScreen.distance_to(tip) <= HIT_TOLERANCE.NODE ||
    mouseScreen.distance2segment(base, tip) <= HIT_TOLERANCE.EDGE
  );
}

// ─── Value labels ───────────────────────────────────────────────────────────

/** Width of the pill `draw_dimension_text` draws for `value` of `kind`: what `force_label_position_screen` needs to clear it. */
export function value_label_width(value: number, kind: QuantityKind): number {
  return arial_text_width(format_quantity(value, kind), TEXT_SPECS.TEXT_FONT_SIZE);
}

/**
 * How far the centre of a `labelWidth`-wide pill sits from the point it labels, along the unit vector `unit`: a superellipse radius, so the pill clears that point by the same gap on every side, whatever its width.
 */
function label_clearance(unit: ScreenPoint, labelWidth: number): number {
  const N = 4;
  const gap = DIM.LOAD_VALUE_OFFSET - DIM.VALUE_PILL_HEIGHT / 2;
  const width = labelWidth / 2 + gap;
  const height = DIM.LOAD_VALUE_OFFSET;
  return Math.pow(
    Math.pow(unit.x / width, N) + Math.pow(unit.y / height, N),
    -1 / N,
  );
}

/**
 * Position of the value label of an arrow drawn from `base` along `displayVector`, whose pill is `labelWidth` wide (see `value_label_width`): past the tip.
 */
export function force_label_position_screen(
  base: ScreenPoint,
  displayVector: ScreenPoint,
  labelWidth: number,
): ScreenPoint {
  if (displayVector.length() < 1e-9) return base;
  return base.add(
    displayVector.extend_length(
      label_clearance(displayVector.normalize(), labelWidth),
    ),
  );
}

/**
 * Position of the value label of a moment, whose pill is `labelWidth` wide: outside its arc, along `direction` (screen axes) from `center`.
 * `direction` is where the arc sits on its circle; left out, the arc is taken to be a full loop and the label goes above it — screen axes, so up is −y.
 */
export function moment_value_label_position(
  center: ScreenPoint,
  radius: number,
  labelWidth: number,
  direction?: ScreenPoint,
): ScreenPoint {
  const unit = direction ? direction.normalize() : UP.mul(-1);
  return center.add(unit.mul(radius + label_clearance(unit, labelWidth)));
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
    label: force_label_position_screen(
      base,
      vector,
      value_label_width(magnitude, FORCE),
    ),
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
    // Each endpoint arrow is drawn from its own beam end, so its label sits exactly where `draw_force` puts it for that arrow.
    labelStart: force_label_position_screen(
      start,
      vectorStart,
      value_label_width(Math.abs(load.magnitudeStart), LOAD_INTENSITY),
    ),
    labelEnd: force_label_position_screen(
      end,
      vectorEnd,
      value_label_width(Math.abs(load.magnitudeEnd), LOAD_INTENSITY),
    ),
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
    label: moment_value_label_position(
      center,
      radius,
      value_label_width(Math.abs(load.value), MOMENT),
    ),
  };
}

/**
 * Screen position of a load's editable value label — the anchor the on-canvas value editor centers on, and the centre of its hit target in `get-hover.ts`.
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
 * A world drag vector (base→cursor) → the magnitude vector a force stores: same world direction, length the value the drag reads on the display ruler.
 * The viewport is only there to measure that drag in screen px, the unit the ruler is graduated in.
 */
export function drag2stored_force_vector(
  worldDrag: WorldPoint,
  viewport: ViewportState,
): WorldPoint {
  return worldDrag.with_length(
    screen2stored_load(world2screen_length(worldDrag.length(), viewport)),
  );
}
