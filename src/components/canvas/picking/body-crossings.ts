/**
 * The nodes a beam being drawn runs over on its way.
 *
 * Aligning several nodes and then drawing one bar through them is the natural way to say « these are all held by this bar » — but the gesture aims at one point, so only the two ends would ever connect, and the nodes under the body would sit on it without being attached to it.
 *
 * What decides the beam's **position** stays a single hover; this only adds who it connects to.
 * Keeping the two apart is what makes the feature small: nothing in the hover system has to learn to name several targets at once.
 */

import type {
  MechanicalElement,
  NodeElement,
  ViewportState,
  WorldPoint,
} from "../../../types";
import { hit_tolerance } from "../../../utils/pointer-kind";
import { is_node_element, world2screen } from "../../../utils";
import { belt_junctions } from "../../../utils/belt-rules";

/**
 * The nodes lying under the segment from `start` to `end`, its two ends excepted.
 *
 * Measured on screen, with the tolerance an edge answers to when hovered: what counts as « under the bar » should be what looks under it.
 * Both ends are left out by a node's worth of margin — they are connected by the gesture's own hovers, and a node claimed twice would be connected to the tip and to the body at once.
 * A closed belt's junction is left out too: nothing but its belt may hold it.
 */
export function nodes_under_segment(
  start: WorldPoint,
  end: WorldPoint,
  mechanicalElements: MechanicalElement[],
  viewport: ViewportState,
): NodeElement[] {
  const from = world2screen(start, viewport);
  const span = world2screen(end, viewport).sub(from);
  const length = span.length();
  if (length <= 2 * hit_tolerance().NODE) return [];
  const along = span.mul(1 / length);

  const junctions = belt_junctions(mechanicalElements);
  const crossed: NodeElement[] = [];
  for (const element of mechanicalElements) {
    if (!is_node_element(element) || junctions.has(element.id)) continue;
    const offset = world2screen(element.position, viewport).sub(from);
    const t = offset.dot(along);
    if (t < hit_tolerance().NODE || t > length - hit_tolerance().NODE) continue;
    if (Math.abs(offset.cross(along)) > hit_tolerance().EDGE) continue;
    crossed.push(element);
  }
  return crossed;
}
