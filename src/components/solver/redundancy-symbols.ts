/**
 * How a redundant constraint would yield, drawn rather than measured.
 *
 * The strain animation this replaces earned its shape from a solve: a lie told to the
 * mechanism, scaled and clamped until the picture read as motion. That whole apparatus —
 * two-pass calibration, a ceiling, a dead-response floor, the choice of stretch over travel —
 * existed to make a *measured* response legible. A symbol has none of that to buy back: its
 * size is a drawing decision, fixed in screen pixels, so there is nothing left to calibrate
 * and no solve to spend. What it keeps from that work is the geometry — which points a
 * constraint holds, and which way it lets go — read once from the resting pose.
 *
 * Three shapes, chosen from what the gallery's redundant links are, not from the full type
 * union: `Distance` / `BeltLength` / `BeltSegmentNoSlip` hold a length, so they show as two
 * points pulled apart. `Angle` holds two arms at a fixed spread, so it shows as arcs coming
 * loose from their shared vertex — as does a `Distance` with `angleLock` set, a triangulation
 * chord standing in for a hub's angle lock rather than a real dimension.
 * `SlideOnSegment` / `FixedOnSegment` / `GearPerimeterPin` pin a point to a rail — straight
 * or, for the perimeter pin, the rim of a gear — so they show as the point lifting off it. A
 * link outside that set gets no symbol; the red highlight it already carries is not lost,
 * only left undecorated.
 */

import { ID, Link, Point2 } from "../../types";
import { AnalysisModel, elements_of_key } from "./analysis-model";

export type RedundancySymbol =
  /** A length constraint: `a` and `b` pull apart along their own axis. */
  | { kind: "gap"; a: Point2; b: Point2 }
  /** An angle lock: two arms swing apart from their shared `vertex`. */
  | { kind: "diverge"; vertex: Point2; arm1: Point2; arm2: Point2 }
  /** A place constraint: the held point lifts off its rail along `normal`. */
  | { kind: "off-rail"; at: Point2; normal: Point2 };

export const EMPTY_REDUNDANCY_SYMBOLS: RedundancySymbol[] = [];

/**
 * The symbol for `link`'s failure mode at the model's current pose, or `undefined` when its
 * type carries none.
 */
export function redundancy_symbol(
  model: AnalysisModel,
  link: Link,
): RedundancySymbol | undefined {
  const at = (key: string) => model.nodes.positions.get(key);

  switch (link.type) {
    case "Distance":
      return link.angleLock
        ? diverge_at_hub(model, link.owner, at(link.key1), at(link.key2))
        : gap(at(link.key1), at(link.key2));
    case "BeltSegmentNoSlip":
      return gap(at(link.posKeyA), at(link.posKeyB));
    case "BeltLength": {
      // An open belt's terminals are real, distinct nodes. A closed belt has none —
      // `startKey`/`endKey` are still set (parsing always fills them), and can even
      // resolve to the SAME fused point, which reads as a zero-length gap rather than
      // a missing one. Two of its own pulleys stand in instead: a location to point
      // at, not a literal strand.
      const [a, b] = link.closed
        ? [at(link.gearPosKeys[0]), at(link.gearPosKeys[1])]
        : [at(link.startKey), at(link.endKey)];
      return gap(a, b);
    }

    case "Angle":
      return diverge(
        model,
        link.owner,
        at(link.key1),
        at(link.key2),
        at(link.key3),
        at(link.key4),
      );

    case "SlideOnSegment":
    case "FixedOnSegment":
      return off_straight_rail(
        at(link.key1),
        at(link.key2),
        at(link.key3),
        link.normalOffset,
      );

    case "GearPerimeterPin":
      return off_rim(at(link.centerKey), at(link.nodeKey));

    default:
      return undefined;
  }
}

function gap(
  a: Point2 | undefined,
  b: Point2 | undefined,
): RedundancySymbol | undefined {
  if (!a || !b || a.distance_to(b) < 1e-9) return undefined;
  return { kind: "gap", a, b };
}

/**
 * `vertex` is read from the lock's own owner, never guessed from where the two segments
 * happen to meet — they may not meet at all. `add_rigidity_links` locks a hub's welded beams
 * against its *rail*, and a body node sits partway along that rail's full span rather than at
 * either of its ends: on "poutre sur deux sliders", the rail is `(0,0)–(400,0)` and the carried
 * beam `(100,0)–(300,0)`, sharing no endpoint at all, while the lock is physically at the
 * slider, `(100,0)`. Each arm then points from the vertex along its own segment's direction,
 * signed toward whichever of the segment's two ends is farther — the direction that segment
 * actually extends away from the hub, not necessarily the one either of its own endpoints sit
 * at.
 */
function diverge(
  model: AnalysisModel,
  owner: ID | undefined,
  s1: Point2 | undefined,
  e1: Point2 | undefined,
  s2: Point2 | undefined,
  e2: Point2 | undefined,
): RedundancySymbol | undefined {
  if (!s1 || !e1 || !s2 || !e2) return undefined;
  const vertex =
    (owner !== undefined ? element_position(model, owner) : undefined) ??
    s1.lerp(s2, 0.5);

  const arm1 = arm_from(vertex, s1, e1);
  const arm2 = arm_from(vertex, s2, e2);
  if (!arm1 || !arm2) return undefined;
  return { kind: "diverge", vertex, arm1, arm2 };
}

/** Unit direction from `vertex` toward whichever of a segment's ends sits farther from it. */
function arm_from(
  vertex: Point2,
  start: Point2,
  end: Point2,
): Point2 | undefined {
  const dir = end.sub(start);
  if (dir.length_squared() < 1e-18) return undefined;
  const towardEnd = vertex.distance_to(start) <= vertex.distance_to(end);
  return (towardEnd ? dir : dir.mul(-1)).normalize();
}

/**
 * Diverge symbol for a triangulation chord standing in for a hub's angle lock (see
 * `angleLock` on `Distance` links). `p1`/`p2` are the chord's own endpoints, each already the
 * far end of one welded beam, so the arms need no direction lookup — just the unit vector
 * from the hub to each.
 */
function diverge_at_hub(
  model: AnalysisModel,
  owner: ID | undefined,
  p1: Point2 | undefined,
  p2: Point2 | undefined,
): RedundancySymbol | undefined {
  if (!p1 || !p2) return undefined;
  const vertex =
    (owner !== undefined ? element_position(model, owner) : undefined) ??
    p1.lerp(p2, 0.5);
  const arm1 = p1.sub(vertex);
  const arm2 = p2.sub(vertex);
  if (arm1.length_squared() < 1e-18 || arm2.length_squared() < 1e-18)
    return undefined;
  return {
    kind: "diverge",
    vertex,
    arm1: arm1.normalize(),
    arm2: arm2.normalize(),
  };
}

/** The position of `element`, found by scanning for whichever variable key names it. */
function element_position(
  model: AnalysisModel,
  element: ID,
): Point2 | undefined {
  for (const [key, pos] of model.nodes.positions)
    if (elements_of_key(key).includes(element)) return pos;
  return undefined;
}

/**
 * `bias`, when given, is the constraint's own `normalOffset`: a slider already asked to sit
 * off its rail lifts further the same way it already leans, rather than flipping side.
 */
function off_straight_rail(
  s: Point2 | undefined,
  e: Point2 | undefined,
  node: Point2 | undefined,
  bias: number | undefined,
): RedundancySymbol | undefined {
  if (!s || !e || !node || s.distance_to(e) < 1e-9) return undefined;
  const rail = e.sub(s).normalize();
  const normal =
    bias !== undefined && bias < 0 ? rail.perp().mul(-1) : rail.perp();
  return { kind: "off-rail", at: node, normal };
}

function off_rim(
  center: Point2 | undefined,
  node: Point2 | undefined,
): RedundancySymbol | undefined {
  if (!center || !node || center.distance_to(node) < 1e-9) return undefined;
  return { kind: "off-rail", at: node, normal: node.sub(center).normalize() };
}
