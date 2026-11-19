/**
 * The canvas driven from the keyboard, where the pointer has no way in: a cursor of its own that the arrows move and Enter clicks with, Tab walking the elements.
 * The gestures themselves are the pointer's: the cursor feeds the very events a mouse would, so every tool, snap and refusal works the same for both.
 */

import {
  MechanicalElement,
  Point2,
  ViewportState,
  WorldPoint,
} from "../../../types";
import type { CanvasState } from "../../../types/canvas-state";
import { screen2world_vec, world2screen } from "../../../utils/viewport";
import { grid_snap_step } from "../../../utils/grid";
import { is_at_rest } from "../context-menu/context-entries";

export type ArrowKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";

export const is_arrow = (key: string): key is ArrowKey =>
  key === "ArrowUp" ||
  key === "ArrowDown" ||
  key === "ArrowLeft" ||
  key === "ArrowRight";

/**
 * How many presses of an arrow make one grid step, Shift making the whole step at once.
 * Fine enough to place a point between the grid's lines, a fifth of a round step being itself round.
 */
export const ARROW_DIVISIONS = 5;

/**
 * A state where the keyboard aims a tool with its cursor: any tool waiting for a click or partway through its clicks.
 * Not the selection, which Tab walks instead, nor the metric box, which holds the focus of its own.
 */
export function aims_with_cursor(state: CanvasState): boolean {
  return (
    !is_at_rest(state) &&
    state.type !== "PlacingProbeMetrics" &&
    state.type !== "SimulationDragging"
  );
}

/** The world step an arrow press moves by, in the direction the arrow points on screen: a fifth of a grid step, the whole step with Shift. */
export function arrow_step(
  key: ArrowKey,
  viewport: ViewportState,
  shift: boolean,
): WorldPoint {
  const screen =
    key === "ArrowUp"
      ? new Point2(0, -1)
      : key === "ArrowDown"
        ? new Point2(0, 1)
        : key === "ArrowLeft"
          ? new Point2(-1, 0)
          : new Point2(1, 0);
  const direction = screen2world_vec(screen.as_space<"screen">(), viewport);
  const length = Math.hypot(direction.x, direction.y);
  const step = grid_snap_step(viewport.scale) / (shift ? 1 : ARROW_DIVISIONS);
  return new Point2<"world">(
    (direction.x / length) * step,
    (direction.y / length) * step,
  );
}

/** `point` brought onto the grid, so that a cursor starting off it lands on round positions as it moves. */
export function on_grid(
  point: WorldPoint,
  viewport: ViewportState,
): WorldPoint {
  const step = grid_snap_step(viewport.scale);
  return new Point2<"world">(
    Math.round(point.x / step) * step,
    Math.round(point.y / step) * step,
  );
}

/** Where an element stands for the keyboard: a point element at its point, an edge at its middle. */
export function element_anchor(element: MechanicalElement): WorldPoint {
  if ("position" in element) return element.position;
  return element.positionStart.lerp(element.positionEnd, 0.5);
}

/** `items` in reading order on screen, top to bottom then left to right, as Tab walks a page. */
export function in_reading_order<T>(
  items: T[],
  at: (item: T) => WorldPoint,
  viewport: ViewportState,
): T[] {
  const placed = items.map((item) => ({
    item,
    screen: world2screen(at(item), viewport),
  }));
  // Within a few pixels, two things stand on the same line and are read left to right.
  const LINE_PX = 4;
  placed.sort((a, b) =>
    Math.abs(a.screen.y - b.screen.y) > LINE_PX
      ? a.screen.y - b.screen.y
      : a.screen.x - b.screen.x,
  );
  return placed.map(({ item }) => item);
}

/**
 * The index Tab goes on to in a list of `count` stops from `current`, or `undefined` past either end: there the focus leaves the canvas, as it leaves any other group of stops.
 * From no stop at all, Tab starts at the first and Shift+Tab at the last.
 */
export function next_stop(
  count: number,
  current: number,
  backwards: boolean,
): number | undefined {
  if (count === 0) return undefined;
  if (current < 0) return backwards ? count - 1 : 0;
  const next = current + (backwards ? -1 : 1);
  return next < 0 || next >= count ? undefined : next;
}

/** The points a placement can start from or end on, every element's own points without repeats, in reading order. */
export function snap_stops(
  elements: MechanicalElement[],
  viewport: ViewportState,
): WorldPoint[] {
  const points: WorldPoint[] = [];
  for (const element of elements) {
    const own =
      "position" in element
        ? [element.position]
        : [element.positionStart, element.positionEnd];
    for (const point of own)
      if (!points.some((known) => known.distance_to(point) < 1e-9))
        points.push(point);
  }
  return in_reading_order(points, (point) => point, viewport);
}
