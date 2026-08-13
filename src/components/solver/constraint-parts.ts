/**
 * The parts a constraint names directly.
 *
 * `elements_of_key` answers about a node, and a fused node belongs to everything meeting
 * there — asked about a beam's length it hands back the beam's neighbours as well. Reading a
 * link's keys as the SHAPES it holds narrows that to the truth: a pair of keys spanning a
 * part names the part they span and nothing else, while a key held on its own names whatever
 * sits on that node, because there it really is the node that is being held.
 */

import { ID, Link } from "../../types";
import { elements_of_key } from "./analysis-model";

/** A link's keys, split by the shape they form. */
type Held = {
  /** Pairs spanning a part — a bar, a rail, an angle's arm. */
  segments: [string, string][];
  /** Keys with no span to read a part from. */
  points: string[];
};

/**
 * Every element `link` acts on, canonical order, `owner` included.
 *
 * The owner stays in because a constraint is between parts and the owner is only the one the
 * parser filed it under: a joint's angle lock belongs as much to the two beams it holds as to
 * the node holding them.
 */
export function constraint_elements(link: Link): ID[] {
  const named = new Set<ID>();
  if (link.owner !== undefined) named.add(link.owner);

  const { segments, points } = held_shapes(link);
  for (const [a, b] of segments)
    if (a && b) for (const id of spanning(a, b)) named.add(id);
  for (const key of points)
    if (key) for (const id of elements_of_key(key)) named.add(id);

  return [...named].sort();
}

/**
 * The parts both keys belong to, or everything they name when they share none.
 *
 * Sharing none is a real case rather than something to guard against: a dimension between
 * two points of unrelated parts spans nothing, and there its two ends *are* what it holds.
 */
function spanning(a: string, b: string): ID[] {
  const first = elements_of_key(a);
  const second = elements_of_key(b);
  const shared = first.filter((id) => second.includes(id));
  return shared.length > 0 ? shared : [...first, ...second];
}

function held_shapes(link: Link): Held {
  const segment = (a: string, b: string): Held => ({
    segments: [[a, b]],
    points: [],
  });
  const points = (...keys: string[]): Held => ({ segments: [], points: keys });

  switch (link.type) {
    case "Distance":
    case "MinDistance":
    case "Spring":
    case "Horizontal":
    case "Vertical":
    case "KeepOrientation":
      return segment(link.key1, link.key2);

    // Two nodes brought together, or two gear centres: no span between them to read a
    // part from, and each one names its own.
    case "Coincidence":
    case "GearMeshing":
    case "GearRatio":
      return points(link.key1, link.key2);

    // A point held against a rail: `key1`/`key2` are the rail, `key3` the node on it.
    case "DistanceToLine":
    case "SlideOnSegment":
    case "FixedOnSegment":
      return { segments: [[link.key1, link.key2]], points: [link.key3] };

    case "Angle":
    case "Normal":
    case "Parallel":
    case "EqualLength":
      return {
        segments: [
          [link.key1, link.key2],
          [link.key3, link.key4],
        ],
        points: [],
      };

    case "Radius":
      return points(link.key1);

    // Anchored to a beam rather than the ground, a motor holds that beam's arm too —
    // same shape as "Angle", the closest kin: an angle held between two arms of a hub.
    case "MotorBeam":
      return link.anchorKey === undefined
        ? segment(link.pivotKey, link.drivenKey)
        : {
            segments: [
              [link.pivotKey, link.drivenKey],
              [link.pivotKey, link.anchorKey],
            ],
            points: [],
          };
    case "MotorAngle":
      return link.anchorPivotKey === undefined || link.anchorKey === undefined
        ? points(link.angleKey)
        : {
            segments: [[link.anchorPivotKey, link.anchorKey]],
            points: [link.angleKey],
          };

    // Angle keys are bare element ids, so they name the same gears their centres do.
    case "GearMeshAngle":
      return points(link.posKey1, link.posKey2);
    case "CoaxialAngle":
      return points(link.angleKey1, link.angleKey2);
    case "GearPerimeterPin":
      return points(link.nodeKey, link.centerKey);
    case "BeamFollowsAngle":
      return {
        segments: [[link.pivotKey, link.drivenKey]],
        points: [link.angleKey],
      };

    // A belt names its pulleys, each on its own node — it is drawn between them rather
    // than spanning any one of them.
    case "BeltLength":
      return points(link.startKey, link.endKey, ...link.gearPosKeys);
    case "BeltJunction":
      return points(link.nodeKey, ...link.gearPosKeys);
    case "BeltPin":
      return points(link.nodeKey, ...link.gearPosKeys);
    case "BeltFollowsTangent":
      return {
        segments: [[link.pivotKey, link.drivenKey]],
        points: [...link.gearPosKeys],
      };
    // One strand, so two pulleys — never the whole loop the link carries for geometry.
    case "BeltSegmentNoSlip":
      return points(link.posKeyA, link.posKeyB);
    case "BeltSubChainAggregate":
      return points(...link.gearPosKeys);

    case "HandleGrab":
      return points(link.grabbedKey);
  }
}
