import {
  Action,
  EdgeElement,
  DEGENERATE_LENGTH,
  Link,
  Point2,
  GeomNodes,
  Mechanism,
} from "../../../types";
import { get_mechanical_element_from_id } from "../../mechanism/connect-actions";
import { keys_of } from "../utils";
import {
  belt_length_link,
  constraint_to_link,
  elements_by_id,
  get_links_geometric,
  get_geom_nodes,
} from "./parsing";
import { belt_terminal_axes, separation_links } from "./disconnect-separation";
import { DIM } from "../../../constants/rendering-specs";
import { screen2world_length } from "../../../utils";
import {
  EditionSolution,
  Preference,
  sketch_extent,
  solve_edition,
} from "./edition-least-squares";

/**
 * Gauss-Newton iterations one edition solve may run.
 * The solve exits as soon as it has converged; this is the guard that keeps an unsatisfiable sketch, a legitimate thing to be drawing, from running forever.
 */
const EDITION_ITERATIONS = 60;

/**
 * The weights of the edition rules, all of them on displacements in metres, so they compare directly.
 *
 * The solve looks for the configuration closest to where the sketch stands, as a CAD sketcher does, and these weights say what "closest" means:
 * - `GRAB`: where the user is pulling. Held exactly whenever the sketch allows it; this weight only settles how close it gets when it does not.
 * - `RIGID`: a beam dragged by its body keeps its length and orientation.
 * - `STAY`: everything else stays where it is, so moving one side of a mechanism leaves the far side alone.
 * - `ORIENTATION`: a beam whose body node is grabbed would rather translate than turn, by a small margin.
 * - `RIDE`: a node on a beam body keeps its place along the beam, but gives way to anything else — sliding is always the cheapest move.
 */
export const EDITION_WEIGHTS = {
  GRAB: 1e6,
  RIGID: 1e2,
  STAY: 1,
  ORIENTATION: 1,
  RIDE: 1e-3,
};

/**
 * Where a radius grab takes hold of the rim: on the bearing of the target it is pulled to, never on the cursor's.
 *
 * Exported so that asking what the grab was granted reads the very handle the solve moved.
 * Rebuilt elsewhere, the two drift, and a hover then measures a bearing where the gesture only ever produced a radius.
 */
export function gear_grab_handle(
  center: Point2,
  radius: number,
  target: Point2,
): Point2 {
  const dir = target.sub(center);
  const unit = dir.length_squared() > 1e-9 ? dir.normalize() : new Point2(1, 0);
  return center.add(unit.mul(radius));
}

/** The two keys of a link, in an order that does not depend on which way it was written. */
const key_pair = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * The floor each straight edge answers to, one link per edge.
 *
 * A length is not a quantity the solver stores — it is the distance between two nodes — so the floor is a one-sided constraint: a bar may be as long as it likes.
 * Never longer than the edge already measures: a resize answers to what one can see *or* to the size in hand, whichever is smaller, and never blows out a bar drawn short at high zoom.
 *
 * Belts are left out: their two ends are meant to meet, and their length is the run around the pulleys, not the span between the terminals.
 */
function min_length_links(
  mechanicalElements: Mechanism["mechanicalElements"],
  floor: number,
): Link[] {
  const links: Link[] = [];
  for (const element of mechanicalElements) {
    if (!("positionStart" in element) || element.type === "belt") continue;
    const edge = element as EdgeElement;
    links.push({
      type: "MinDistance",
      ddl: 0,
      key1: `${edge.id}:start`,
      key2: `${edge.id}:end`,
      distance: Math.min(
        floor,
        edge.positionStart.distance_to(edge.positionEnd),
      ),
    });
  }
  return links;
}

/**
 * How much stiffer each ring of links away from the gesture is than the one before, and the most any part is.
 *
 * Nearly a strict priority: a ring gives way before the next one moves at all, so a disturbance does not leak toward the far side a frame at a time.
 * The ceiling stays below `EDITION_WEIGHTS.GRAB`, so that a grab out of reach still pulls harder than the far side resists.
 */
export const LOCALITY = { RATE: 100, CEILING: 1e5 };

/**
 * The position keys a gesture holds, before fusion: what it grabs or pins, what it carries, or what the element it edits a value of reads.
 * Empty for a bundle that only reshapes the graph, which no part of the mechanism is closer to than another.
 */
function gesture_keys(
  triggers: readonly Action[],
  mechanism: Mechanism,
  grabbed: string | undefined,
  pinned: string | undefined,
  carried: Set<string>,
): Set<string> {
  const keys = new Set<string>(carried);
  if (grabbed) keys.add(grabbed);
  if (pinned) keys.add(pinned);
  for (const trigger of triggers) {
    if (!("id" in trigger)) continue;
    const element = mechanism.mechanicalElements.find((el) => el.id === trigger.id);
    if (element) {
      if ("position" in element) keys.add(element.id);
      else keys.add(`${element.id}:start`).add(`${element.id}:end`);
      continue;
    }
    const constraint = mechanism.constraintElements.find((c) => c.id === trigger.id);
    if (constraint && constraint.type !== "dimension-belt")
      for (const key of keys_of(constraint_to_link(constraint))) keys.add(key);
  }
  return keys;
}

/** The key whose distance to the gesture weighs a preference: the part it keeps in place. */
function preference_owner(pref: Preference): string {
  switch (pref.type) {
    case "Target":
    case "Follow":
      return pref.key;
    case "SegmentRatio":
      return pref.key3;
    case "Orientation":
    case "Length":
      return pref.key1;
  }
}

/**
 * How many links separate each position key from `sources` — absent when none lead there — and the stiffness that follows from it: `LOCALITY.RATE` to that power, up to `LOCALITY.CEILING`.
 * Every link counts, a constraint the user drew as much as a beam.
 *
 * A part carried by another — a node on a beam's body, a node on a gear's rim — is as close as its carrier: the link from carrier to carried costs nothing, so a beam moved takes its nodes with it.
 * The way back still costs one: moving a node does not free the beam it rides.
 */
function locality(
  sources: Set<string>,
  links: Link[],
  preferences: Preference[],
): { distance: Map<string, number>; stiffness: (key: string) => number } {
  /** The cost of stepping from one key to another, the cheapest way any link offers. */
  const steps = new Map<string, Map<string, number>>();
  const step = (from: string, to: string, cost: number) => {
    if (from === to) return;
    if (!steps.has(from)) steps.set(from, new Map());
    const known = steps.get(from)!.get(to);
    if (known === undefined || cost < known) steps.get(from)!.set(to, cost);
  };
  const connect = (keys: string[]) => {
    for (const a of keys) for (const b of keys) step(a, b, 1);
  };
  for (const link of links) {
    connect(keys_of(link));
    if (link.type === "SlideOnSegment") {
      step(link.key1, link.key3, 0);
      step(link.key2, link.key3, 0);
    }
  }
  for (const pref of preferences)
    if (pref.type === "Follow") {
      connect([pref.key, pref.origin]);
      step(pref.origin, pref.key, 0);
    } else if (pref.type === "SegmentRatio") connect([pref.key1, pref.key2, pref.key3]);
    else if (pref.type !== "Target") connect([pref.key1, pref.key2]);

  // Breadth-first with free steps: those go to the front of the queue, so every key is settled at its shortest distance.
  const distance = new Map<string, number>();
  const queue: string[] = [];
  for (const key of sources) {
    distance.set(key, 0);
    queue.push(key);
  }
  while (queue.length > 0) {
    const key = queue.shift()!;
    const d = distance.get(key)!;
    for (const [other, cost] of steps.get(key) ?? []) {
      const known = distance.get(other);
      if (known !== undefined && known <= d + cost) continue;
      distance.set(other, d + cost);
      if (cost === 0) queue.unshift(other);
      else queue.push(other);
    }
  }
  return {
    distance,
    stiffness: (key) => Math.min(LOCALITY.CEILING, LOCALITY.RATE ** (distance.get(key) ?? Infinity)),
  };
}

/** How many rings `smallest_region` grows one at a time before searching by halves: most gestures settle within the first. */
const LINEAR_RINGS = 3;

/**
 * The solve of the smallest region around the gesture that does as well as the whole sketch: the grab held, or brought as close as the whole sketch would bring it, every constraint it can reach kept — or, when not even the whole sketch keeps them all, broken no worse.
 * Whatever lies outside that region does not move at all.
 *
 * `solve_within(ring, probe)` solves with only the parts at most `ring` links away free, `Infinity` freeing them all; `probe` only asks whether the grab can be held there.
 * `rings` is the furthest ring there is.
 * A larger region can only do better, which is what lets the search go by halves once the first rings have failed.
 */
function smallest_region(
  solve_within: (ring: number, probe?: boolean) => EditionSolution,
  rings: number,
  extent: number,
): EditionSolution {
  const held = (s: EditionSolution) => region_holds(s, extent);
  for (let ring = 0; ring < Math.min(LINEAR_RINGS, rings); ring++) {
    const s = solve_within(ring, true);
    if (held(s)) return s;
  }
  const whole = solve_within(Infinity);
  /** No further than the whole sketch from `whole`'s value of `measure`. */
  const as_close = (measure: number, wholeMeasure: number) =>
    measure <= wholeMeasure * (1 + REGION_GAP_SLACK) + REGION_TOLERANCE * extent;
  // Held whole but not within the first rings: the smallest ring that holds it, by halves.
  // Out of reach even whole: the smallest ring that gets as close.
  // Unsatisfiable even whole — a typed value the sketch cannot follow: the smallest ring that breaks no more than the whole sketch would, so that what gives way is next to the value, as a drag out of reach would be.
  const enough = !whole.satisfied
    ? (s: EditionSolution) => as_close(s.violation, whole.violation) && as_close(s.gap, whole.gap)
    : held(whole)
      ? held
      : (s: EditionSolution) => s.satisfied && as_close(s.gap, whole.gap);
  let best = whole;
  let low = held(whole) ? Math.min(LINEAR_RINGS, rings) : 0;
  let high = rings;
  while (low < high) {
    const ring = Math.floor((low + high) / 2);
    const s = solve_within(ring, held(whole));
    if (enough(s)) {
      best = s;
      high = ring;
    } else low = ring + 1;
  }
  return best;
}

/** Whether `s` keeps every constraint it can reach and holds its grab. */
function region_holds(s: EditionSolution, extent: number): boolean {
  return s.satisfied && s.gap <= REGION_TOLERANCE * extent;
}

/** Fraction of the extent within which a grab counts as held, and a target's gap as no worse than the whole sketch's. */
const REGION_TOLERANCE = 1e-9;
/** Relative slack on that comparison: a region solve weighs its compromise a little differently, without getting any further from the cursor. */
const REGION_GAP_SLACK = 1e-3;

/** Union-find over position keys, for the coincidences: every key of a group answers to the group's first key. */
class Coincidences {
  private parent = new Map<string, string>();

  find(key: string): string {
    let root = key;
    while (this.parent.has(root)) root = this.parent.get(root)!;
    // Path compression.
    let k = key;
    while (k !== root) {
      const next = this.parent.get(k)!;
      this.parent.set(k, root);
      k = next;
    }
    return root;
  }

  join(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(rb, ra);
  }
}

/** Rewrites every position key a link reads through `rep`; radius keys are left alone, the radii are never fused. */
function relabel(link: Link, rep: (key: string) => string): Link {
  const out = { ...link } as Record<string, unknown>;
  for (const field of ["key1", "key2", "key3", "key4", "grabbedKey", "startKey", "endKey", "nodeKey"])
    if (typeof out[field] === "string") out[field] = rep(out[field] as string);
  if (Array.isArray(out.gearPosKeys)) out.gearPosKeys = (out.gearPosKeys as string[]).map(rep);
  return out as Link;
}

/**
 * Resolves the geometric constraints of a mechanism against the actions that pull on it.
 *
 * The rules are a CAD sketcher's: hard constraints always hold, the grabbed part goes where the cursor is, and everything else changes as little as it can — see `EDITION_WEIGHTS`.
 */
export function resolveGeometricConstraints(
  mechanism: Mechanism,
  /**
   * The actions the solve pulls against — empty when the bundle only reshapes the graph (connections, deletions).
   *
   * Several only ever come from one panel field written to a whole selection at once, where each states its own element's value and the constraints they add compose.
   * A gesture brings exactly one: a grab has a single point and a single pin.
   */
  triggers: readonly Action[],
  /** The whole bundle. Only the separation of what it disconnects reads it — every other rule answers to the triggers alone. */
  bundleActions: Action[],
): GeomNodes {
  const nodes = get_geom_nodes(mechanism.mechanicalElements);
  /** The radii as drawn, before a dimension or a typed value sets any: what tells a radius imposed by this bundle from one left as it was. */
  const drawnRadii = new Map(nodes.radii);
  let links = get_links_geometric(
    mechanism.mechanicalElements,
    mechanism.constraintElements,
  );
  links.push(
    ...min_length_links(
      mechanism.mechanicalElements,
      screen2world_length(DIM.MIN_EDGE_LENGTH, mechanism.viewport),
    ),
  );

  // A dimensioned radius is held at its value: meshing and pins move the gear rather than the number.
  mechanism.constraintElements.forEach((c) => {
    if (c.type === "dimension-radius" && nodes.radii.has(c.gearID)) {
      nodes.radii.set(c.gearID, c.value);
      nodes.radMasses.set(c.gearID, 0);
    }
  });

  /** The key pulled to the cursor, and where. */
  let grab: { key: string; target: Point2 } | undefined;
  /** A key whose value was typed: pinned on it rather than pulled. */
  let pin: { key: string; value: Point2 } | undefined;
  /** A beam dragged by its body. */
  let rigidBeam: EdgeElement | undefined;
  /** Keys a `MoveElements` carries, already at their destination. */
  const carried = new Set<string>();
  // `MoveElements` moves its keys before the solve: the labels are repositioned from where they really were.
  let preMovePositions: Map<string, Point2> | undefined;
  const triggers_of = <T extends Action["type"]>(type: T) =>
    triggers.filter((a): a is Extract<Action, { type: T }> => a.type === type);

  const grab_or_pin = (key: string, position: Point2, committed?: boolean) => {
    if (committed) pin = { key, value: position };
    else grab = { key, target: position };
  };

  for (const trigger of triggers) {
    switch (trigger.type) {
      case "MoveNode":
        grab_or_pin(`${trigger.id}`, trigger.newPosition, trigger.committed);
        break;
      case "MoveEdgeStart":
        grab_or_pin(`${trigger.id}:start`, trigger.newPosition, trigger.committed);
        break;
      case "MoveEdgeEnd":
        grab_or_pin(`${trigger.id}:end`, trigger.newPosition, trigger.committed);
        break;
      case "MoveEdgeBody":
        links.push({
          type: "FixedOnSegment",
          ddl: 2,
          key1: `${trigger.id}:start`,
          key2: `${trigger.id}:end`,
          key3: `grab_bridge`,
          t: trigger.t,
        });
        nodes.positions.set(`grab_bridge`, trigger.newPosition);
        nodes.posMasses.set(`grab_bridge`, 1);
        grab = { key: "grab_bridge", target: trigger.newPosition };
        rigidBeam = get_mechanical_element_from_id(
          trigger.id,
          mechanism.mechanicalElements,
        ) as EdgeElement;
        break;
      case "MoveElements":
        preMovePositions = new Map(nodes.positions);
        trigger.elementIDs.forEach((elementID) => {
          const element = get_mechanical_element_from_id(
            elementID,
            mechanism.mechanicalElements,
          );
          const keys =
            "position" in element
              ? [`${element.id}`]
              : [`${element.id}:start`, `${element.id}:end`];
          for (const key of keys) {
            nodes.positions.set(key, nodes.positions.get(key)!.add(trigger.delta));
            // A grounded node the user carries goes with the selection.
            nodes.posMasses.set(key, 1);
            carried.add(key);
          }
        });
        break;
      case "MirrorElements":
      case "TransformElements":
        // Already at their new place: the bundle applied before this solve.
        trigger.elementIDs.forEach((elementID) => {
          const element = get_mechanical_element_from_id(
            elementID,
            mechanism.mechanicalElements,
          );
          const keys =
            "position" in element
              ? [`${element.id}`]
              : [`${element.id}:start`, `${element.id}:end`];
          for (const key of keys) {
            nodes.posMasses.set(key, 1);
            carried.add(key);
          }
        });
        break;
      case "ChangeGearRadius": {
        if (trigger.committed) {
          nodes.radii.set(`${trigger.id}`, trigger.newRadius);
          nodes.radMasses.set(`${trigger.id}`, 0);
          break;
        }
        // A handle on the rim, pulled toward the mouse: the meshing against a zero-radius bridge keeps it on the rim while the radius stays free.
        const center = nodes.positions.get(`${trigger.id}`);
        const radius = nodes.radii.get(`${trigger.id}`);
        if (center && radius !== undefined) {
          nodes.positions.set(
            "grab_perimeter",
            gear_grab_handle(center, radius, trigger.target),
          );
          nodes.posMasses.set("grab_perimeter", 1);
          nodes.radii.set("grab_perimeter", 0);
          nodes.radMasses.set("grab_perimeter", 0);
          links.push({
            type: "GearMeshing",
            ddl: 1,
            key1: `${trigger.id}`,
            key2: "grab_perimeter",
            radKey1: `${trigger.id}`,
            radKey2: "grab_perimeter",
          });
          grab = { key: "grab_perimeter", target: trigger.target };
        }
        break;
      }
      case "ChangeEdgeLength":
        links.push({
          type: "Distance",
          ddl: 1,
          key1: `${trigger.id}:start`,
          key2: `${trigger.id}:end`,
          distance: trigger.newLength,
        });
        break;
      case "ChangeEdgeAngle":
        links.push({
          type: "KeepOrientation",
          ddl: 1,
          key1: `${trigger.id}:start`,
          key2: `${trigger.id}:end`,
          direction: Point2.from_polar(1, trigger.newAngle),
          oriented: true,
        });
        break;
      case "ChangeBeltLength": {
        const belt = get_mechanical_element_from_id(
          trigger.id,
          mechanism.mechanicalElements,
        );
        if (belt && belt.type === "belt") {
          const link = belt_length_link(
            belt,
            elements_by_id(mechanism.mechanicalElements),
            mechanism.mechanicalElements,
            trigger.newLength,
          );
          if (link) links.push(link);
        }
        break;
      }
      // Every other trigger solves against the mechanism the bundle has already applied, so what it stated is already in the graph read above.
    }
  }

  /** Whether this bundle lands the selection on a place it states, which nothing is to push it off. */
  const landing = triggers.some(
    (t) => t.type === "MirrorElements" || t.type === "TransformElements",
  );

  // Momentary: pushes apart what this bundle detached, unless the bundle has moved it apart itself.
  if (!landing)
    links.push(
      ...separation_links(bundleActions, mechanism, belt_terminal_axes(mechanism)),
    );

  // A grabbed key is free to follow the cursor, grounded or not.
  if (grab) nodes.posMasses.set(grab.key, 1);

  for (const trigger of triggers_of("ChangeGearRadius")) {
    // A free-standing gear grows about its centre; a meshed or dimensioned one has to move to keep its tangency or its radius.
    const gear = get_mechanical_element_from_id(
      trigger.id,
      mechanism.mechanicalElements,
    );
    const meshed = "meshedGearsIDs" in gear && gear.meshedGearsIDs.length > 0;
    const dimensioned = mechanism.constraintElements.some(
      (c) => c.type === "dimension-radius" && c.gearID === trigger.id,
    );
    if (!meshed && !dimensioned) nodes.posMasses.set(`${trigger.id}`, 0);
  }
  // ── Coincidences: each group becomes one position.
  const groups = new Coincidences();
  for (const link of links)
    if (link.type === "Coincidence") groups.join(link.key1, link.key2);
  links = links
    .filter((link) => link.type !== "Coincidence")
    .map((link) => relabel(link, (key) => groups.find(key)));

  const members = new Map<string, string[]>();
  for (const key of nodes.positions.keys()) {
    const rep = groups.find(key);
    if (!members.has(rep)) members.set(rep, []);
    members.get(rep)!.push(key);
  }
  const positions = new Map<string, Point2>();
  const fixedPositions = new Set<string>();
  const inertia = new Map<string, number>();
  for (const [rep, keys] of members) {
    // A group sits where its anchored member is, else where the carried one went, else halfway between its members.
    const anchored = keys.find((k) => nodes.posMasses.get(k) === 0);
    const moving = keys.find((k) => carried.has(k));
    const at = anchored ?? moving;
    positions.set(
      rep,
      at !== undefined
        ? nodes.positions.get(at)!
        : keys
            .map((k) => nodes.positions.get(k)!)
            .reduce((a, b) => a.add(b))
            .mul(1 / keys.length),
    );
    if (anchored !== undefined) fixedPositions.add(rep);
    if (moving !== undefined) inertia.set(rep, EDITION_WEIGHTS.GRAB);
  }
  const rep = (key: string) => groups.find(key);

  // A length the user stated wins over the floor, however short: the two would otherwise settle in between, leaving the dimension silently wrong.
  const dimensioned = new Set(
    links
      .filter((link) => link.type === "Distance")
      .map((link) => key_pair(link.key1, link.key2)),
  );
  links = links.filter(
    (link) =>
      link.type !== "MinDistance" ||
      !dimensioned.has(key_pair(link.key1, link.key2)),
  );
  // A mirror, a rotation or a scale lands the selection where it says, even if that leaves an edge tying it to the rest shorter than the floor: the floor would push the selection off its place.
  if (landing) {
    const landed = new Set([...carried].map(rep));
    links = links.filter(
      (link) =>
        link.type !== "MinDistance" ||
        (!landed.has(link.key1) && !landed.has(link.key2)),
    );
  }

  // A typed value is imposed, not pulled: the rest of the sketch yields, or reports itself violated when it cannot.
  if (pin) {
    positions.set(rep(pin.key), pin.value);
    fixedPositions.add(rep(pin.key));
  }

  // ── Preferences: what "changing as little as possible" means for each part.
  const preferences: Preference[] = [];
  const grabbed = grab ? rep(grab.key) : undefined;
  if (grab && grabbed !== undefined) {
    preferences.push({ type: "Target", key: grabbed, value: grab.target, weight: EDITION_WEIGHTS.GRAB, exact: true });
    inertia.set(grabbed, 0);
    fixedPositions.delete(grabbed);
  }
  /**
   * The part the gesture holds, pulled or pinned alike.
   * A typed value only differs from a drag in that it holds whatever the rest of the sketch can do: the parts around it answer to it the same way.
   */
  const held = grabbed ?? (pin ? rep(pin.key) : undefined);

  // A node on a beam body measures its inertia along the beam, not in the world: it rides the beam when the beam moves, and slides when anything else pulls it.
  for (const link of links) {
    if (link.type !== "SlideOnSegment") continue;
    const start = positions.get(link.key1);
    const end = positions.get(link.key2);
    const node = positions.get(link.key3);
    if (!start || !end || !node) continue;
    if (link.key3 === held) {
      // The beam the held node rides would rather translate than turn.
      preferences.push({
        type: "Orientation",
        key1: link.key1,
        key2: link.key2,
        direction: end.sub(start),
        weight: EDITION_WEIGHTS.ORIENTATION,
      });
      continue;
    }
    if (!carried.has(link.key3)) inertia.set(link.key3, 0);
    preferences.push({
      type: "SegmentRatio",
      key1: link.key1,
      key2: link.key2,
      key3: link.key3,
      t: node.parameter_on_segment(start, end),
      weight: EDITION_WEIGHTS.RIDE,
    });
  }

  // A node fixed on a gear's rim moves with the gear.
  for (const element of mechanism.mechanicalElements) {
    if (element.type !== "gear") continue;
    const centre = rep(element.id);
    for (const nodeId of element.fixedNodesBodyIDs) {
      const node = rep(nodeId);
      if (node === held || node === centre || carried.has(node)) continue;
      const p = positions.get(node);
      const c = positions.get(centre);
      if (!p || !c) continue;
      if (!inertia.has(node)) inertia.set(node, 0);
      preferences.push({
        type: "Follow",
        key: node,
        origin: centre,
        offset: p.sub(c),
        weight: EDITION_WEIGHTS.STAY,
      });
    }
  }

  // A beam dragged by its body moves as a whole, as long as nothing else forces it to bend or stretch.
  if (rigidBeam) {
    const start = rep(`${rigidBeam.id}:start`);
    const end = rep(`${rigidBeam.id}:end`);
    // Its ends answer to the beam's shape, not to where they were: held there as well, a grab off the middle would have them share the move unevenly — less for the end further from the hand — and the beam would turn and stretch a little at every step, drifting off a direction it was drawn on.
    // An end anchored or held by the rest of the sketch still is, through `fixedPositions` and its links.
    if (!carried.has(start)) inertia.set(start, 0);
    if (!carried.has(end)) inertia.set(end, 0);
    preferences.push(
      {
        type: "Orientation",
        key1: start,
        key2: end,
        direction: rigidBeam.positionEnd.sub(rigidBeam.positionStart),
        weight: EDITION_WEIGHTS.RIGID,
      },
      {
        type: "Length",
        key1: start,
        key2: end,
        length: rigidBeam.positionEnd.distance_to(rigidBeam.positionStart),
        weight: EDITION_WEIGHTS.RIGID,
      },
    );
  }

  const fixedRadii = new Set<string>();
  for (const [key, mass] of nodes.radMasses) if (mass === 0) fixedRadii.add(key);

  // ── Locality: the further a part from what the gesture holds, the stiffer it is, so a disturbance is taken up next to the hand.
  const radiusInertiaOf = new Map<string, number>();
  const sources = new Set(
    [...gesture_keys(triggers, mechanism, grab?.key, pin?.key, carried)].map(rep),
  );
  const { distance, stiffness } = locality(sources, links, preferences);
  /**
   * A radius is one ring further than its gear: resizing a gear deforms it, which comes after moving what is nearer.
   * The radius a gesture edits is the exception — it is what the gesture holds.
   */
  const resized = new Set(triggers_of("ChangeGearRadius").map((t) => `${t.id}`));
  const radius_ring = (key: string) =>
    resized.has(key) ? 0 : (distance.get(rep(key)) ?? Infinity) + 1;
  if (sources.size > 0) {
    for (const key of positions.keys())
      inertia.set(key, (inertia.get(key) ?? EDITION_WEIGHTS.STAY) * stiffness(key));
    for (const pref of preferences)
      if (pref.type !== "Target") pref.weight *= stiffness(preference_owner(pref));
    for (const key of nodes.radii.keys())
      radiusInertiaOf.set(
        key,
        EDITION_WEIGHTS.STAY * Math.min(LOCALITY.CEILING, LOCALITY.RATE ** radius_ring(key)),
      );
  }

  const problem = {
    positions,
    radii: new Map(nodes.radii),
    fixedPositions,
    fixedRadii,
    imposedPositions: new Set(pin ? [rep(pin.key)] : []),
    imposedRadii: new Set(
      [...fixedRadii].filter((key) => nodes.radii.get(key) !== drawnRadii.get(key)),
    ),
    inertia,
    defaultInertia: EDITION_WEIGHTS.STAY,
    radiusInertia: EDITION_WEIGHTS.STAY,
    radiusInertiaOf,
    links,
    preferences,
    // The same bound the cursor answers to, in screen px through the viewport, so a gear drawn small at high zoom stays a gear one may keep.
    radiusFloor: screen2world_length(DIM.MIN_GEAR_RADIUS, mechanism.viewport),
    maxIterations: EDITION_ITERATIONS,
  };
  /** The solve with every part more than `ring` links away from the gesture held where it is. */
  const solve_within = (ring: number, probe = false) =>
    solve_edition({
      ...problem,
      fixedPositions: new Set([
        ...fixedPositions,
        ...[...positions.keys()].filter((key) => !((distance.get(key) ?? Infinity) <= ring)),
      ]),
      fixedRadii: new Set([
        ...fixedRadii,
        ...[...nodes.radii.keys()].filter((key) => !(radius_ring(key) <= ring)),
      ]),
    }, probe);
  const solution =
    sources.size > 0
      ? smallest_region(
          solve_within,
          // The furthest ring is a radius's, one beyond the furthest position.
          Math.max(0, ...distance.values()) + 1,
          sketch_extent(positions),
        )
      : solve_within(Infinity);

  const solvedPositions = new Map<string, Point2>();
  for (const [group, keys] of members) {
    const p = solution.positions.get(group)!;
    for (const key of keys) solvedPositions.set(key, p);
  }
  const before = new Map(nodes.positions);
  if (preMovePositions) preMovePositions.forEach((pos, key) => before.set(key, pos));
  place_constraint_labels(mechanism, before, solvedPositions, nodes.radii, solution.radii);

  return {
    positions: solvedPositions,
    radii: solution.radii,
    posMasses: nodes.posMasses,
    radMasses: nodes.radMasses,
  };
}

/**
 * Carries each constraint label along with the geometry it annotates, writing it into `after` under the constraint's id.
 */
function place_constraint_labels(
  mechanism: Mechanism,
  before: Map<string, Point2>,
  after: Map<string, Point2>,
  radiiBefore: Map<string, number>,
  radiiAfter: Map<string, number>,
): void {
  const pair = (
    a: string,
    b: string,
  ): [Point2, Point2, Point2, Point2] | null => {
    const oa = before.get(a);
    const ob = before.get(b);
    const na = after.get(a);
    const nb = after.get(b);
    return oa && ob && na && nb ? [oa, ob, na, nb] : null;
  };

  mechanism.constraintElements.forEach((constraint) => {
    switch (constraint.type) {
      case "dimension-edge":
      case "dimension-node-to-node": {
        const isEdge = constraint.type === "dimension-edge";
        const ends = pair(
          isEdge ? `${constraint.edgeID}:start` : `${constraint.startNodeID}`,
          isEdge ? `${constraint.edgeID}:end` : `${constraint.endNodeID}`,
        );
        if (!ends) break;
        const [oldStart, oldEnd, newStart, newEnd] = ends;
        after.set(
          `${constraint.id}`,
          constraint.position
            .to_segment_coordinates(oldStart, oldEnd)
            .from_segment_coordinates(newStart, newEnd),
        );
        break;
      }
      case "dimension-edge-to-node": {
        const edge = pair(`${constraint.edgeID}:start`, `${constraint.edgeID}:end`);
        const oldNode = before.get(`${constraint.nodeID}`);
        const newNode = after.get(`${constraint.nodeID}`);
        if (!edge || !oldNode || !newNode) break;
        const [oldEdgeStart, oldEdgeEnd, newEdgeStart, newEdgeEnd] = edge;
        const local = constraint.position.to_segment_coordinates(
          oldEdgeStart,
          oldEdgeEnd,
        );
        // The label rides the gap between edge and node.
        // A node that sat on the edge offers no gap to scale from, so the offset stays as the user left it.
        const oldGap = oldNode.distance2line(oldEdgeStart, oldEdgeEnd);
        if (oldGap > DEGENERATE_LENGTH)
          local.y *= newNode.distance2line(newEdgeStart, newEdgeEnd) / oldGap;
        after.set(
          `${constraint.id}`,
          local.from_segment_coordinates(newEdgeStart, newEdgeEnd),
        );
        break;
      }
      case "dimension-angle": {
        const first = pair(`${constraint.startEdgeID}:start`, `${constraint.startEdgeID}:end`);
        const second = pair(`${constraint.endEdgeID}:start`, `${constraint.endEdgeID}:end`);
        if (!first || !second) break;
        const local = constraint.position.to_segment_coordinates(
          first[0].lerp(first[1], 0.5),
          second[0].lerp(second[1], 0.5),
        );
        if (!local) break;
        const global = local.from_segment_coordinates(
          first[2].lerp(first[3], 0.5),
          second[2].lerp(second[3], 0.5),
        );
        if (!global) break;
        after.set(`${constraint.id}`, global);
        break;
      }
      case "dimension-radius": {
        const oldPos = before.get(`${constraint.gearID}`);
        const newPos = after.get(`${constraint.gearID}`);
        const oldRadius = radiiBefore.get(`${constraint.gearID}`);
        const newRadius = radiiAfter.get(`${constraint.gearID}`);
        if (!oldPos || !oldRadius || !newPos || !newRadius) break;
        after.set(
          `${constraint.id}`,
          newPos.add(constraint.position.sub(oldPos).mul(newRadius / oldRadius)),
        );
        break;
      }
      case "gear-ratio": {
        const centres = pair(`${constraint.startGearID}`, `${constraint.endGearID}`);
        if (!centres) break;
        const [oldStart, oldEnd, newStart, newEnd] = centres;
        const local = constraint.position.to_segment_coordinates(oldStart, oldEnd);
        local.y *= newStart.distance_to(newEnd) / oldStart.distance_to(oldEnd);
        after.set(
          `${constraint.id}`,
          local.from_segment_coordinates(newStart, newEnd),
        );
      }
    }
  });
}
