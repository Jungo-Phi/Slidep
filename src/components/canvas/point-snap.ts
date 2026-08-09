/**
 * Pulling the point a gesture puts down onto something worth landing on: a grid line, a round direction, or both at once.
 *
 * Applied on the hovered position, in world space, so what the gesture puts down is what the cursor showed.
 * Every tolerance is a screen distance: how close one has to aim is a matter of pixels, not of how far the drawing is zoomed.
 *
 * A hover is not always all-or-nothing. Aiming at the body of a beam leaves the point free to slide along it, and that freedom answers to the grid like any other — so a node dropped on a long bar can land where the bar crosses a grid line, on the bar and on the grid at once.
 */

import type { CanvasState, CanvasStateType } from "../../types/canvas-state";
import type {
  EdgeElement,
  HoveredPart,
  MechanicalElement,
  ViewportState,
  WorldPoint,
} from "../../types";
import { Point2 } from "../../types/point2";
import { HIT_TOLERANCE } from "../../constants/rendering-specs";
import {
  grid_snap_step,
  screen2world_length,
  screen2world_vec,
  world2screen_vec,
} from "../../utils";
import {
  SNAP_CORRIDOR,
  angle_ray_count,
  best_ladder_ray,
  type SnapFeedback,
  type SnapGuide,
  type SnapSettings,
} from "./snap-corridor";
import { pinned_edge_terminals } from "./hover-bounds";
import { HOVER_TARGETS } from "./get-hover";

/**
 * States whose point snaps to the grid: those that put a point down, and those that drag one.
 * A tool aiming at an element is not among them.
 */
const GRID_SNAPPED_STATES = new Set<CanvasStateType>([
  "ChangingGearRadius",
  "MovingEdgeStartPoint",
  "MovingEdgeEndPoint",
  "MovingNode",
  "PlacingBeamStart",
  "PlacingBeamEnd",
  "PlacingBeltStart",
  "PlacingBeltEnd",
  "PlacingSpringStart",
  "PlacingSpringEnd",
  "PlacingDamperStart",
  "PlacingDamperEnd",
  "PlacingGearStart",
  "PlacingGearRadius",
  "PlacingGround",
  "PlacingJoin",
  "PlacingMass",
  "PlacingMotor",
  "PlacingPivot",
  "PlacingSlider",
]);

/** `value` pulled onto the nearest grid line, or left alone when none is near enough. */
function snapped(value: number, step: number, tolerance: number): number {
  const target = Math.round(value / step) * step;
  return Math.abs(target - value) < tolerance ? target : value;
}

/**
 * The grid lines a point has come to rest on, both of them when it sits on a crossing.
 *
 * Read off the landed position rather than from whichever rule moved it there. Being on a grid line is a fact about a point, not a claim about what put it there — and a point that reaches a crossing is on **both** lines, however it arrived. Deciding « x or y » from the rule that fired is what made the indicator flip between the two under a cursor that had barely moved.
 *
 * An exact test, not a tolerant one: a point that was never snapped falls on a multiple of the step only by an accident float arithmetic does not have.
 */
function grid_lines_at(
  position: WorldPoint,
  step: number,
): { gridX?: number; gridY?: number } {
  const on = (value: number) =>
    Math.abs(value - Math.round(value / step) * step) < 1e-9 ? value : undefined;
  return { gridX: on(position.x), gridY: on(position.y) };
}

/**
 * A point free in the plane, pulled onto the grid one axis at a time.
 *
 * The two are independent: landing on a vertical line without being near a horizontal one is a perfectly good answer, and the point keeps its other coordinate.
 */
function snap_free(
  position: WorldPoint,
  step: number,
  tolerance: number,
): WorldPoint {
  return new Point2(
    snapped(position.x, step, tolerance),
    snapped(position.y, step, tolerance),
  );
}

/**
 * A point that may only move along a line, pulled onto the nearest thing worth landing on: where the line crosses a grid line, or one of `extras`, which are already on it.
 *
 * `direction` must be a unit vector, so that a distance along the line is a distance in the world and answers to the same tolerance as everything else.
 */
function snap_on_line(
  position: WorldPoint,
  direction: WorldPoint,
  step: number,
  tolerance: number,
  extras: WorldPoint[] = [],
): WorldPoint {
  let best = 0;
  let bestDistance = tolerance;
  const consider = (along: number) => {
    if (Math.abs(along) >= bestDistance) return;
    bestDistance = Math.abs(along);
    best = along;
  };
  // Where the line meets each family of grid lines. One it runs parallel to it meets at infinity, which the tolerance turns away on its own.
  const crossing = (coordinate: number, rate: number) => {
    if (rate === 0) return;
    consider((Math.round(coordinate / step) * step - coordinate) / rate);
  };
  crossing(position.x, direction.x);
  crossing(position.y, direction.y);
  for (const extra of extras) consider(extra.sub(position).dot(direction));

  return best === 0 ? position : position.add(direction.mul(best));
}

/**
 * The fixed points a straight gesture is drawn from.
 *
 * An edge being placed answers to its start; one whose terminal is dragged, to its far end; a node, to the far end of every edge it carries — several anchors, so a node can be brought in line with any one of the bars holding it.
 */
function anchors(
  state: CanvasState,
  mechanicalElements: MechanicalElement[],
): WorldPoint[] {
  switch (state.type) {
    case "PlacingBeamEnd":
    case "PlacingSpringEnd":
    case "PlacingDamperEnd":
      return [state.startHover.position];

    case "MovingEdgeStartPoint":
    case "MovingEdgeEndPoint": {
      const edge = edge_of(state.elementID, mechanicalElements);
      if (!edge) return [];
      return [
        state.type === "MovingEdgeStartPoint"
          ? edge.positionEnd
          : edge.positionStart,
      ];
    }

    case "MovingNode":
      return pinned_edge_terminals(state.elementID, mechanicalElements).map(
        ({ edge, which }) =>
          which === "start" ? edge.positionEnd : edge.positionStart,
      );

    default:
      return [];
  }
}

/**
 * The best round direction each anchor offers, closest first.
 *
 * One ray per anchor, never two: the ladder's own rungs are 15° apart, so a second ray from the same anchor is always the worse reading of the same aim.
 *
 * Measured on screen, across the ray: what one judges is how far the point sits from the line, and a tolerance in degrees would widen its catch with every pixel the edge is pulled — precisely when the aim is getting easier to read.
 */
function angle_hits(
  position: WorldPoint,
  state: CanvasState,
  mechanicalElements: MechanicalElement[],
  viewport: ViewportState,
  rays: number,
): SnapGuide[] {
  const hits: { guide: SnapGuide; distance: number }[] = [];
  for (const anchor of anchors(state, mechanicalElements)) {
    const found = best_ladder_ray(
      world2screen_vec(position.sub(anchor), viewport),
      rays,
    );
    if (!found) continue;
    hits.push({
      guide: {
        anchor,
        direction: screen2world_vec(found.ray, viewport).normalize(),
      },
      distance: found.distance,
    });
  }
  return hits.sort((a, b) => a.distance - b.distance).map((hit) => hit.guide);
}

/** How far, on screen, a point may be moved to land on two rays at once. Beyond that the two are all but parallel and their crossing says nothing about where the cursor was. */
const CROSSING_REACH = 2 * SNAP_CORRIDOR;

/**
 * Where two rays cross, when that is a place the point could reasonably be meant to be.
 *
 * Two bars holding the same node each offer a direction, and the node can honour both at once — the same way the grid's two axes are honoured together rather than one winning. A pair running nearly parallel meets far away, and the reach turns it down.
 */
function rays_crossing(
  position: WorldPoint,
  a: SnapGuide,
  b: SnapGuide,
  viewport: ViewportState,
): WorldPoint | undefined {
  const crossing = Point2.lines_intersection(
    a.anchor,
    a.anchor.add(a.direction),
    b.anchor,
    b.anchor.add(b.direction),
  );
  if (!crossing) return undefined;
  const travel = world2screen_vec(crossing.sub(position), viewport).length();
  return travel <= CROSSING_REACH ? crossing : undefined;
}

/**
 * The centre a state measures a radius from, if it measures one.
 *
 * These gestures do not put down a point but a distance, and snapping their x and y apart would round everything except the one quantity they produce.
 */
function radius_centre(
  state: CanvasState,
  mechanicalElements: MechanicalElement[],
): WorldPoint | undefined {
  if (state.type === "PlacingGearRadius") return state.startHover.position;
  if (state.type !== "ChangingGearRadius") return undefined;
  const gear = mechanicalElements.find((el) => el.id === state.elementID);
  return gear?.type === "gear" ? gear.position : undefined;
}

/** The element `id` names, when it is an edge. */
function edge_of(
  id: string,
  mechanicalElements: MechanicalElement[],
): EdgeElement | undefined {
  const element = mechanicalElements.find((el) => el.id === id);
  return element && "positionStart" in element
    ? (element as EdgeElement)
    : undefined;
}

/**
 * Whether a guide is a grid line under another name.
 *
 * A bar drawn horizontally from a point already on the grid runs *along* a grid line: showing it as a direction holding the point would say « 0° » where what the eye reads — and what the point is genuinely aligned with — is the grid. The grid line says it, and says it better.
 */
function runs_along_grid(guide: SnapGuide, step: number): boolean {
  const on_grid = (value: number) =>
    Math.abs(value - Math.round(value / step) * step) < 1e-9;
  if (Math.abs(guide.direction.y) < 1e-9) return on_grid(guide.anchor.y);
  if (Math.abs(guide.direction.x) < 1e-9) return on_grid(guide.anchor.x);
  return false;
}

/** A snapped position, and what took hold of it. */
export interface PointSnap extends SnapFeedback {
  position: WorldPoint;
}

/** The point untouched, held by nothing. */
const free = (position: WorldPoint): PointSnap => ({ position, guides: [] });

/**
 * `hovered.position` snapped, along whatever freedom the hover leaves it.
 *
 * Returns the position unchanged for a hover that names one place and one only — a node's centre, an edge's terminal — where neither the grid nor a direction has anything to say.
 */
export function snap_hover(
  hovered: HoveredPart,
  state: CanvasState,
  mechanicalElements: MechanicalElement[],
  viewport: ViewportState,
  settings: SnapSettings,
): PointSnap {
  if (!GRID_SNAPPED_STATES.has(state.type)) return free(hovered.position);
  const step = grid_snap_step(viewport.scale);
  const tolerance = screen2world_length(HIT_TOLERANCE.SNAP, viewport);
  /** Every landing reports the grid lines it is on, whichever rule brought it there. */
  const landed = (position: WorldPoint, guides: SnapGuide[] = []): PointSnap => ({
    position,
    guides: guides.filter((guide) => !runs_along_grid(guide, step)),
    ...grid_lines_at(position, step),
  });

  if (hovered.type === "Void") {
    if (hovered.rejected) return free(hovered.position);

    const centre = radius_centre(state, mechanicalElements);
    if (centre) {
      const spoke = hovered.position.sub(centre);
      const target = snapped(spoke.length(), step, tolerance);
      // A radius rounded to nothing would collapse the gear onto its own centre; the cursor bound would push it back out, off the grid and no rounder for the trip.
      return free(
        target > 0 ? centre.add(spoke.with_length(target)) : hovered.position,
      );
    }

    const hits = angle_hits(
      hovered.position,
      state,
      mechanicalElements,
      viewport,
      angle_ray_count(settings.angleStep),
    );
    if (hits.length === 0)
      return landed(snap_free(hovered.position, step, tolerance));

    // Two bars holding the same node each offer a direction, and honouring both at once is what puts the node exactly where the two lines meet. Tried best pair first, so a third bar only steps in when a better one has nothing to cross.
    for (let i = 0; i < hits.length; i++)
      for (let j = i + 1; j < hits.length; j++) {
        const crossing = rays_crossing(
          hovered.position,
          hits[i],
          hits[j],
          viewport,
        );
        if (crossing) return landed(crossing, [hits[i], hits[j]]);
      }

    // One direction only: the point drops onto the ray, then slides along it onto a grid crossing if one is within reach — the only way to land on a round angle AND a round place at once.
    const ray = hits[0];
    const along = hovered.position.sub(ray.anchor).dot(ray.direction);
    const onRay = ray.anchor.add(ray.direction.mul(along));
    return landed(snap_on_line(onRay, ray.direction, step, tolerance), [ray]);
  }

  // The bar is drawn past this node, so the point runs along the line joining the two — it is that line's own freedom that the grid answers to.
  if (hovered.type === "Node" && hovered.beamBodyHover) {
    const node = mechanicalElements.find((el) => el.id === hovered.id);
    if (!node || !("position" in node)) return free(hovered.position);
    const along = hovered.position.sub(node.position);
    if (along.length() < 1e-9) return free(hovered.position);
    return landed(
      snap_on_line(hovered.position, along.normalize(), step, tolerance),
    );
  }

  // A point on a rim is characterised by its bearing, not by its x and y: what makes
  // it deliberate is landing on a round angle from the centre, which is the very
  // ladder a drawn edge answers to.
  //
  // Only where the rim follows the cursor. The tangency point of a gear being sized
  // is settled by the two centres, and the top of a rim by the drawing — neither is
  // aimed, so neither is snapped.
  if (hovered.type === "GearTooth" && HOVER_TARGETS[state.type].gear === "rim") {
    const gear = mechanicalElements.find((el) => el.id === hovered.id);
    if (gear?.type !== "gear") return free(hovered.position);
    const spoke = hovered.position.sub(gear.position);
    const radius = spoke.length();
    if (radius < 1e-9) return free(hovered.position);
    const found = best_ladder_ray(
      world2screen_vec(spoke, viewport),
      angle_ray_count(settings.angleStep),
    );
    if (!found) return free(hovered.position);
    const direction = screen2world_vec(found.ray, viewport).normalize();
    return landed(gear.position.add(direction.mul(radius)), [
      { anchor: gear.position, direction },
    ]);
  }

  if (hovered.type === "Edge" && hovered.part === "body") {
    const edge = edge_of(hovered.id, mechanicalElements);
    if (!edge) return free(hovered.position);
    const axis = edge.positionEnd.sub(edge.positionStart);
    if (axis.length() < 1e-9) return free(hovered.position);
    // Mid-span is worth a rung of its own: the grid never falls there except by chance, and it is the one place along a bar that means something without being measured.
    const middle = edge.positionStart.lerp(edge.positionEnd, 0.5);
    return landed(
      snap_on_line(hovered.position, axis.normalize(), step, tolerance, [
        middle,
      ]),
    );
  }

  return free(hovered.position);
}
