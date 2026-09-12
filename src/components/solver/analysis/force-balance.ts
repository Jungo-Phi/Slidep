import {
  DynamicSnapshot,
  ID,
  LoadElement,
  MechanicalElement,
  Mechanism,
  Point2,
  WorldPoint,
} from "../../../types";
import { MaterialDef, ProfileDef } from "../../../types/material";
import { element_carries_mass, element_mass } from "../../../utils/element-mass";
import { is_node_element } from "../../../utils/element-queries";
import { frame2world_transform } from "../../../utils/load-frame";
import { force_base_position, moment_center_position } from "../../../utils/load-geom";
import { element_reactions } from "../recording/probe-series";

/**
 * The free body's balance, itemised — one line per action, against the `m·a` the solver publishes.
 *
 * Everything here is derived from the pose on screen and the frame under the cursor, never recorded: a per-term breakdown on every snapshot would cost `O(bodies + loads)` per instant, which is what bounds how long a run can be kept (`max_recording_time`).
 * The totals stay the solver's own (`BalanceSample`), so the itemisation is checked rather than trusted: `gap` closes only if these lines really do add up to what the statics pass computed.
 */

/** Which family a line belongs to — what it is, and what a reader can expect to see of it on the canvas. */
export type BalanceTermKind = "load" | "weight" | "support";

export interface BalanceTerm {
  /** Stable while the mechanism is, so a hovered line stays hovered as the clock moves. */
  id: string;
  kind: BalanceTermKind;
  /** The element the line belongs to: the load itself, or the body/support carrying it. */
  elementID: ID;
  /** Where the action applies, in the pose on screen. */
  at: WorldPoint;
  force: WorldPoint;
  /** Its own couple (N·m, counter-clockwise positive): a moment load, or a support's own. */
  couple: number;
  /** `r × F + couple`, about the world origin — the point every moment here is reduced to. */
  moment: number;
}

/** One line of the balance under the cursor, and which of its two quantities that line reads
 * — a force row points at a vector, a moment row at a couple, and the two are not shown the same way. */
export interface HoveredBalanceTerm {
  term: BalanceTerm;
  quantity: "force" | "moment";
}

export interface ForceBalance {
  /** Every action on the free body: applied loads, weights, support reactions. */
  actions: BalanceTerm[];
  /** Σ of `actions`. */
  sum: WorldPoint;
  sumMoment: number;
  /** Σ m·a over the same free body, straight from `BalanceSample` — the one term the UI does not re-derive, since a gear's own `I·α` cannot be read off a single snapshot. */
  inertia: WorldPoint;
  inertiaMoment: number;
  /** `ΣF − m·a`. Zero on a converged frame whose itemisation is complete; anything else is a reading, not a blemish. */
  gap: WorldPoint;
  gapMoment: number;
}

/** `r × F`, counter-clockwise positive. */
const cross = (r: WorldPoint, f: WorldPoint): number => r.x * f.y - r.y * f.x;

const term = (
  id: string,
  kind: BalanceTermKind,
  elementID: ID,
  at: WorldPoint,
  force: WorldPoint,
  couple: number,
): BalanceTerm => ({
  id,
  kind,
  elementID,
  at,
  force,
  couple,
  moment: cross(at, force) + couple,
});

/** The centre of mass of a body, where its weight and its inertia both act. */
export function body_centre(element: MechanicalElement): WorldPoint | undefined {
  if ("position" in element) return element.position;
  if ("positionStart" in element)
    return element.positionStart.lerp(element.positionEnd, 0.5);
  return undefined;
}

/** Where the panel's own moment-balance point comes from — everything but `"point"` names something on the mechanism, so it moves with the pose the panel is showing rather than staying fixed. The origin is not its own kind: it is simply `{ kind: "point", point: ZERO }`, the default a fresh reference starts at. */
export type MomentBalanceReference =
  | { kind: "node"; nodeID: ID }
  | { kind: "edge-end"; edgeID: ID; which: "start" | "end" }
  | { kind: "center-of-mass" }
  | { kind: "point"; point: WorldPoint };

const ORIGIN = new Point2(0, 0) as WorldPoint;

/** The whole mechanism's own centre of mass — every mass-carrying element's `body_centre`, weighted by `element_mass`. `undefined` where nothing on it carries any (an all-massless mechanism), which reads as the origin at every call site. */
export function mechanism_center_of_mass(
  elements: MechanicalElement[],
  materials: MaterialDef[],
  profiles: ProfileDef[],
): WorldPoint | undefined {
  let weighted = ORIGIN;
  let totalMass = 0;
  for (const element of elements) {
    if (!element_carries_mass(element)) continue;
    const centre = body_centre(element);
    const mass = element_mass(element, materials, profiles);
    if (!centre || mass <= 0) continue;
    weighted = weighted.add(centre.mul(mass)) as WorldPoint;
    totalMass += mass;
  }
  return totalMass > 0 ? (weighted.mul(1 / totalMass) as WorldPoint) : undefined;
}

/** `reference` resolved to the pose `mechanism` is in — a stale id (the element it named was deleted since) reads as the origin, the same fallback `"point"` starts at by default. */
export function resolve_moment_balance_point(
  reference: MomentBalanceReference,
  mechanism: Mechanism,
): WorldPoint {
  switch (reference.kind) {
    case "point":
      return reference.point;
    case "center-of-mass":
      return (
        mechanism_center_of_mass(
          mechanism.mechanicalElements,
          mechanism.materials,
          mechanism.profiles,
        ) ?? ORIGIN
      );
    case "node": {
      const node = mechanism.mechanicalElements.find(
        (el) => el.id === reference.nodeID && "position" in el,
      );
      return node && "position" in node ? node.position : ORIGIN;
    }
    case "edge-end": {
      const edge = mechanism.mechanicalElements.find(
        (el) => el.id === reference.edgeID && "positionStart" in el,
      );
      if (!edge || !("positionStart" in edge)) return ORIGIN;
      return reference.which === "start" ? edge.positionStart : edge.positionEnd;
    }
  }
}

/**
 * One line per applied load, resolved into world axes at the pose given.
 * A distributed load is folded into its own resultant, with the moment INTEGRATED along the span rather than taken at a centroid — the same closed form `compute_balance_sample` uses, so the two cannot drift apart on a trapezoidal load.
 */
export function load_terms(
  load: LoadElement,
  elements: MechanicalElement[],
): BalanceTerm | undefined {
  if (load.type === "force") {
    const at = force_base_position(load, elements);
    const force = frame2world_transform(load.vector, load.frame, elements);
    return term(load.id, "load", load.id, at, force, 0);
  }
  if (load.type === "moment")
    // The data model reads a moment clockwise-positive; every moment here is the opposite.
    return term(
      load.id,
      "load",
      load.id,
      moment_center_position(load, elements),
      new Point2(0, 0),
      -load.value,
    );

  const beam = elements.find((e) => e.id === load.targetID);
  if (!beam || !("positionStart" in beam)) return undefined;
  const span = beam.positionEnd.sub(beam.positionStart);
  const length = span.length();
  if (length < 1e-9) return undefined;
  const xhat = span.mul(1 / length);
  const direction = frame2world_transform(load.direction, load.frame, elements);
  const w0 = direction.mul(load.magnitudeStart);
  const slope = direction
    .mul(load.magnitudeEnd - load.magnitudeStart)
    .mul(1 / length);
  const force = w0.mul(length).add(slope.mul(0.5 * length * length));
  const moment =
    cross(beam.positionStart, w0) * length +
    cross(beam.positionStart, slope) * 0.5 * length * length +
    cross(xhat, w0) * 0.5 * length * length +
    (cross(xhat, slope) * length * length * length) / 3;
  const at = beam.positionStart.lerp(beam.positionEnd, 0.5);
  return { id: load.id, kind: "load", elementID: load.id, at, force, couple: 0, moment };
}

/**
 * Every action on the free body at one instant, and what is left over once the solver's own `m·a` is taken off.
 * `mechanism` must be the pose on screen (`analysedMechanism`), not the edited one: a moment arm is read where the body actually is.
 * `referencePoint` is where every moment here is taken about — every term still builds about the origin first (`term`, `load_terms`'s own closed form), then shifts by `cross(referencePoint, force)`, the one identity that holds for a couple built out of any force however it was arrived at.
 */
export function compute_force_balance(
  mechanism: Mechanism,
  snapshot: DynamicSnapshot,
  gravity: Point2,
  referencePoint: WorldPoint = ORIGIN,
): ForceBalance | undefined {
  const sample = snapshot.balance;
  if (!sample) return undefined;
  const elements = mechanism.mechanicalElements;
  const actions: BalanceTerm[] = [];

  for (const load of mechanism.loads) {
    const line = load_terms(load, elements);
    if (line) actions.push(line);
  }

  // Gravity off reads as no weight at all, not as a term sitting at zero: a row nothing carries is noise, not a reading.
  if (gravity.length() > 1e-9)
    for (const element of elements) {
      if (!element_carries_mass(element)) continue;
      const centre = body_centre(element);
      const mass = element_mass(element, mechanism.materials, mechanism.profiles);
      if (!centre || mass <= 0) continue;
      actions.push(
        term(`weight:${element.id}`, "weight", element.id, centre, gravity.mul(mass), 0),
      );
    }

  for (const element of elements) {
    if (!is_node_element(element)) continue;
    for (const reaction of element_reactions(element, snapshot))
      if (reaction.atAnchor)
        actions.push(
          term(
            `support:${element.id}`,
            "support",
            element.id,
            reaction.at,
            reaction.vector,
            reaction.moment ?? 0,
          ),
        );
  }

  let sum = new Point2(0, 0) as WorldPoint;
  let sumMoment = 0;
  for (const action of actions) {
    sum = sum.add(action.force);
    sumMoment += action.moment;
  }
  const inertia = new Point2(sample.inertiaX, sample.inertiaY) as WorldPoint;

  const shift = (moment: number, force: WorldPoint) =>
    moment - cross(referencePoint, force);
  const shiftedActions = actions.map((action) => ({
    ...action,
    moment: shift(action.moment, action.force),
  }));
  const shiftedSumMoment = shift(sumMoment, sum);
  const shiftedInertiaMoment = shift(sample.inertiaM, inertia);
  return {
    actions: shiftedActions,
    sum,
    sumMoment: shiftedSumMoment,
    inertia,
    inertiaMoment: shiftedInertiaMoment,
    gap: sum.sub(inertia),
    gapMoment: shiftedSumMoment - shiftedInertiaMoment,
  };
}
