import { ID, MechanicalElement, ProbeMetric } from "../../../types/element";
import { is_node_element, overlay_shown } from "../../../utils/element-queries";
import { Point2 } from "../../../types/point2";
import {
  BeamCohesion,
  DynamicSnapshot,
  KinematicSnapshot,
  SimulationSnapshot,
  SnapshotLayout,
} from "../../../types/runtime-state";

export type ProbeCurveKey = "x" | "y" | "norm" | "value";

export interface ProbeCurve {
  key: ProbeCurveKey;
  values: number[];
}

/** Whether `metric` plots as x/y/norm (a direction in the plane) rather than a single "value" curve — false for the angular and moment metrics, which are scalars. */
export function is_vector_metric(metric: ProbeMetric): boolean {
  return (
    metric !== "angle" &&
    metric !== "angular-velocity" &&
    metric !== "motor-power" &&
    metric !== "moment" &&
    metric !== "moment-start" &&
    metric !== "moment-end" &&
    metric !== "inertia-moment"
  );
}

/** Time series of a probed metric: shared time axis + one array per curve.
 * Empty `t` means no data (no snapshots yet, or metric not computed in the current simulation mode — e.g. force in kinematic). */
export interface ProbeSeries {
  t: number[];
  curves: ProbeCurve[];
  unit: string;
}

/**
 * Where a probe samples an element, as slots into one layout: `a` alone for a node or a body's position, `a` and `b` for an edge — sampled at its midpoint, oriented start → end — and `angle` for a gear's own rotation. −1 where the layout has no such key.
 *
 * Resolved once per layout, not once per snapshot: a series walks the whole recording, and all its snapshots share one layout until an edit.
 */
interface ProbeSlots {
  a: number;
  b: number;
  angle: number;
}

const NO_SLOTS: ProbeSlots = { a: -1, b: -1, angle: -1 };

function probe_slots(
  element: MechanicalElement,
  layout: SnapshotLayout,
): ProbeSlots {
  const slot = (key: string) => layout.index.get(key) ?? -1;
  if ("position" in element)
    return {
      a: slot(element.id),
      b: -1,
      angle:
        element.type === "gear" ? (layout.angleIndex.get(element.id) ?? -1) : -1,
    };
  return { a: slot(`${element.id}:start`), b: slot(`${element.id}:end`), angle: -1 };
}

/** Scratch pair the readers write into, so sampling a whole recording allocates nothing. */
const sampled = new Float64Array(2);

/** The probed point, into `sampled`. False when the snapshot carries no value for it.
 * Generic over `SimulationSnapshot`: a position/angle slot is never out of bounds on either concrete subtype (see `snapshot_point`), so this reads a dynamic-mode trajectory exactly like a kinematic one. */
function read_position<S extends SimulationSnapshot>(
  snapshot: S,
  slots: ProbeSlots,
): boolean {
  if (slots.a < 0) return false;
  const p = snapshot.positions;
  const ax = p[2 * slots.a];
  const ay = p[2 * slots.a + 1];
  if (Number.isNaN(ax)) return false;
  if (slots.b < 0) {
    sampled[0] = ax;
    sampled[1] = ay;
    return true;
  }
  const bx = p[2 * slots.b];
  if (Number.isNaN(bx)) return false;
  sampled[0] = ax + (bx - ax) * 0.5;
  sampled[1] = ay + (p[2 * slots.b + 1] - ay) * 0.5;
  return true;
}

/** Oriented angle of the element (rad): gear own angle, or edge direction. Generic like `read_position`, for the same reason. */
function read_angle<S extends SimulationSnapshot>(
  snapshot: S,
  slots: ProbeSlots,
): number | undefined {
  if (slots.angle >= 0) {
    const a = snapshot.angles[slots.angle];
    return Number.isNaN(a) ? undefined : a;
  }
  if (slots.a < 0 || slots.b < 0) return undefined;
  const p = snapshot.positions;
  const dx = p[2 * slots.b] - p[2 * slots.a];
  if (Number.isNaN(dx)) return undefined;
  return Math.atan2(p[2 * slots.b + 1] - p[2 * slots.a + 1], dx);
}

/** The probed point's velocity, into `sampled` — same edge-midpoint averaging as `read_position`.
 * `DynamicSnapshot`-only: velocity has no meaning where nothing integrates a force (kinematic mode drives position directly). */
function read_velocity(snapshot: DynamicSnapshot, slots: ProbeSlots): boolean {
  if (slots.a < 0) return false;
  const v = snapshot.velocities;
  const ax = v[2 * slots.a];
  const ay = v[2 * slots.a + 1];
  if (Number.isNaN(ax)) return false;
  if (slots.b < 0) {
    sampled[0] = ax;
    sampled[1] = ay;
    return true;
  }
  const bx = v[2 * slots.b];
  if (Number.isNaN(bx)) return false;
  sampled[0] = ax + (bx - ax) * 0.5;
  sampled[1] = ay + (v[2 * slots.b + 1] - ay) * 0.5;
  return true;
}

/** The probed point's acceleration, into `sampled` — same edge-midpoint averaging as `read_velocity`. `DynamicSnapshot`-only, same reasoning. */
function read_acceleration(snapshot: DynamicSnapshot, slots: ProbeSlots): boolean {
  if (slots.a < 0) return false;
  const a = snapshot.accelerations;
  const ax = a[2 * slots.a];
  const ay = a[2 * slots.a + 1];
  if (Number.isNaN(ax)) return false;
  if (slots.b < 0) {
    sampled[0] = ax;
    sampled[1] = ay;
    return true;
  }
  const bx = a[2 * slots.b];
  if (Number.isNaN(bx)) return false;
  sampled[0] = ax + (bx - ax) * 0.5;
  sampled[1] = ay + (a[2 * slots.b + 1] - ay) * 0.5;
  return true;
}

/**
 * Angular velocity of the element (rad/s), read directly rather than finite-differenced — `DynamicSnapshot` carries it as real solver state (see `SimNodes.vAngle`), so there is nothing to derive.
 *
 * A gear reads its own `angleVelocities` slot.
 * An edge has no angle DOF of its own to read (its orientation is derived from its two endpoints, never a state variable) — its angular velocity is derived the same way `motor-model.ts`'s `arm_angular_velocity` derives an arm's: the endpoints' relative velocity, tangential component, divided by the edge's length.
 */
function read_angular_velocity(
  snapshot: DynamicSnapshot,
  slots: ProbeSlots,
): number | undefined {
  if (slots.angle >= 0) {
    const v = snapshot.angleVelocities[slots.angle];
    return Number.isNaN(v) ? undefined : v;
  }
  if (slots.a < 0 || slots.b < 0) return undefined;
  const p = snapshot.positions;
  const ax = p[2 * slots.a];
  const ay = p[2 * slots.a + 1];
  const bx = p[2 * slots.b];
  const by = p[2 * slots.b + 1];
  const dx = bx - ax;
  const dy = by - ay;
  const length = Math.hypot(dx, dy);
  if (!(length > 1e-6)) return undefined;
  const v = snapshot.velocities;
  const vax = v[2 * slots.a];
  const vay = v[2 * slots.a + 1];
  const vbx = v[2 * slots.b];
  const vby = v[2 * slots.b + 1];
  if (Number.isNaN(vax) || Number.isNaN(vbx)) return undefined;
  // Tangential component of the relative velocity, over the arm's length — same (end-start) × F / L form as a torque, here with velocity standing in for force.
  const relVx = vbx - vax;
  const relVy = vby - vay;
  return (dx * relVy - dy * relVx) / (length * length);
}

/**
 * The element's own velocity right now, at the point `probe_slots` samples it — the same anchor `get_dynamic_probe_series`'s "velocity" curve reads over time, here for a single frame (the canvas overlay arrow).
 * `undefined` when the snapshot carries none for it.
 */
export function element_velocity(
  element: MechanicalElement,
  snapshot: DynamicSnapshot,
): Point2 | undefined {
  const slots = probe_slots(element, snapshot.layout);
  return read_velocity(snapshot, slots) ? new Point2(sampled[0], sampled[1]) : undefined;
}

/**
 * The element's own linear acceleration right now, at the point `probe_slots` samples it — the same anchor `element_velocity` reads, one derivative up.
 * `undefined` when the snapshot carries none for it.
 */
export function element_acceleration(
  element: MechanicalElement,
  snapshot: DynamicSnapshot,
): Point2 | undefined {
  const slots = probe_slots(element, snapshot.layout);
  return read_acceleration(snapshot, slots) ? new Point2(sampled[0], sampled[1]) : undefined;
}

/**
 * The element's own angular acceleration right now, in rad/s², counter-clockwise positive: the rotational twin of `element_acceleration`.
 * A gear reads its own recorded slot.
 * An edge reads it off its two ends: across a rigid rotation their relative acceleration keeps a tangential part only from `α`, the centripetal part being radial.
 * `undefined` for a point, or when the snapshot carries none for it.
 */
export function element_angular_acceleration(
  element: MechanicalElement,
  snapshot: DynamicSnapshot,
): number | undefined {
  const slots = probe_slots(element, snapshot.layout);
  if (slots.angle >= 0) {
    const alpha = snapshot.angleAccelerations[slots.angle];
    return Number.isNaN(alpha) ? undefined : alpha;
  }
  if (slots.a < 0 || slots.b < 0) return undefined;
  const p = snapshot.positions;
  const dx = p[2 * slots.b] - p[2 * slots.a];
  const dy = p[2 * slots.b + 1] - p[2 * slots.a + 1];
  const lengthSq = dx * dx + dy * dy;
  if (!(lengthSq > 1e-12)) return undefined;
  const acc = snapshot.accelerations;
  const relAx = acc[2 * slots.b] - acc[2 * slots.a];
  const relAy = acc[2 * slots.b + 1] - acc[2 * slots.a + 1];
  if (Number.isNaN(relAx) || Number.isNaN(relAy)) return undefined;
  return (dx * relAy - dy * relAx) / lengthSq;
}

/** One point of an element where a reaction acts — a node/gear has one, an edge has two (its own start and end), each independent: a beam's root and tip carry unrelated loads. */
export interface ElementReaction {
  at: Point2;
  /** Which of the element's own points this is — the same disambiguator `element_reaction_at` takes, kept on the result so a caller holding several of an edge's readings at once can still tell them apart. */
  which: ReactionPoint;
  vector: Point2;
  /** N·m, signed — at a beam's own end, that beam's cohesion couple (`beam_end_reaction`); anywhere else, the couple a rigid (non-rotating) weld's two-point force pair reduces to (see `PBD_kinematic_solver.ts`'s per-link moment).
   * Absent only where nothing at this point reports one at all — a beam end always reads a figure, `0` at a plain hinge. */
  moment?: number;
  /** From `LinkReaction.atAnchor` — whether this point's dof was immovable in the solve.
   * At a NODE it also says the reading is opposed, i.e. a support reaction rather than an internal one; a BEAM END is never opposed, so there it says only where the end sits. */
  atAnchor: boolean;
}

/** At a support (`atAnchor`), what "reaction" means flips: `LinkReaction` measures what the mechanism itself exerts ON that fixed point (Newton's third law from each link's own perspective, folded together — see PBD_kinematic_solver.ts's dynamics block).
 * The classical support reaction a user expects — what the ground pushes back WITH, opposing the load — is exactly the negative of that.
 * A non-anchored point has no ground to react from, so it keeps the raw member value (e.g. a rod's own tension, felt at either end). */
function oppose_at_support<T>(value: T, atAnchor: boolean, negate: (v: T) => T): T {
  return atAnchor ? negate(value) : value;
}

/** Every `force`-kind `LinkReaction` touching solver key `key`, summed. `key` may itself be plain, but a reaction's own `key` may be a fused (comma-joined) one when the dof it reports at is shared with another element — hence membership, not equality. */
function force_at(
  key: string,
  snapshot: DynamicSnapshot,
): { vector: Point2; atAnchor: boolean } | undefined {
  if (!snapshot.reactions) return undefined;
  let fx = 0;
  let fy = 0;
  let atAnchor = false;
  let any = false;
  for (const r of snapshot.reactions) {
    if (r.kind !== "force" || !r.key.split(",").includes(key)) continue;
    if (Number.isNaN(r.fx) || Number.isNaN(r.fy)) continue;
    fx += r.fx;
    fy += r.fy;
    atAnchor = r.atAnchor;
    any = true;
  }
  if (!any) return undefined;
  return {
    vector: oppose_at_support(new Point2(fx, fy), atAnchor, (v) => v.mul(-1)),
    atAnchor,
  };
}

/**
 * Every `torque`-kind `LinkReaction` touching solver key `key`, summed — same membership as `force_at`, but **never negated**, anchor or not: unlike a force (reported directly at the point it acts, so an anchored one needs flipping to read as "what the support pushes back WITH"), this moment is already computed at the anchor by taking the free end's OWN force — already the "what the support pushes back with" quantity — about the anchor's position (`PBD_kinematic_solver.ts`'s per-link moment: `cross(freeEnd − anchor, forceAtFreeEnd)`, reference-point-independent since a link's own force always sums to zero across its ends).
 * Flipping it again would double the negation and read as the load's own moment, not the support's — verified against a textbook cantilever: a downward tip load produces a *positive* (opposing, counter-clockwise) reaction moment at the fixed end, only correct un-negated.
 */
function moment_at(
  key: string,
  snapshot: DynamicSnapshot,
): { moment: number; atAnchor: boolean } | undefined {
  if (!snapshot.reactions) return undefined;
  let sum = 0;
  let atAnchor = false;
  let any = false;
  for (const r of snapshot.reactions) {
    if (r.kind !== "torque" || !r.key.split(",").includes(key)) continue;
    if (Number.isNaN(r.torque)) continue;
    sum += r.torque;
    atAnchor = r.atAnchor;
    any = true;
  }
  return any ? { moment: sum, atAnchor } : undefined;
}

/** Force and/or moment at one point — `undefined` iff neither reports anything there. */
function point_reaction(
  key: string,
  which: ReactionPoint,
  at: Point2,
  snapshot: DynamicSnapshot,
): ElementReaction | undefined {
  const f = force_at(key, snapshot);
  const m = moment_at(key, snapshot);
  if (!f && !m) return undefined;
  return {
    at,
    which,
    vector: f?.vector ?? new Point2(0, 0),
    moment: m?.moment,
    atAnchor: f?.atAnchor ?? m!.atAnchor,
  };
}

/** Whether the dof at `key` was immovable in the solve — the one thing a beam's own cohesion torsor does not carry, and the only thing `beam_end_reaction` still needs from the raw reactions.
 * Read the way `force_at` reads it, last reporter wins, so one point never answers two different things depending on which of its readings a caller went through. */
function anchored_at(key: string, snapshot: DynamicSnapshot): boolean {
  let atAnchor = false;
  for (const r of snapshot.reactions ?? [])
    if (r.key.split(",").includes(key)) atAnchor = r.atAnchor;
  return atAnchor;
}

/**
 * The reaction at one end of a beam, read from that beam's OWN cohesion torsor rather than from the constraint impulses landing on the shared key.
 * Those impulses belong to everything coincident at a fused node at once, and a couple is filed at BOTH ends of the link reporting it (see `moment_at`), so summing them answers a question about the solve and not about the beam: on two beams welded in line, the weld reads the far encastrement's own couple.
 * `BeamCohesion` is this beam alone, solved from equilibrium.
 *
 * Never opposed at a support, unlike a node's reading: a beam end always says what the beam applies onto whatever sits there, so the two ends of one beam are always each other's opposite and read as one continuous effort along it.
 * The classical "what the ground pushes back with" is the NODE's reading at that same point (`node_reaction_from_beams`), and the two together are the action/reaction pair.
 */
function beam_end_reaction(
  cohesion: BeamCohesion,
  which: "start" | "end",
  at: Point2,
  snapshot: DynamicSnapshot,
): ElementReaction {
  const torsor = which === "start" ? cohesion.start : cohesion.end;
  return {
    at,
    which,
    vector: new Point2(torsor.fx, torsor.fy),
    moment: torsor.m,
    atAnchor: anchored_at(`${cohesion.beamID}:${which}`, snapshot),
  };
}

/**
 * What the beam ends fused into `nodeID`'s dof apply there, summed — `undefined` when no beam reaches it.
 * A node carries no torsor of its own, so this is the honest reading of one: opposed where it is anchored, the sum is the classical support reaction (one beam or several); where it is not, Newton's third law makes it zero, and the transmitted effort lives on the beam ends themselves, one reading per side.
 * The fusion is only visible through `LinkReaction.key`, which is why the parts are read from there rather than from the mechanism.
 *
 * A load applied directly at the node reaches the ground without passing through a beam, so it joins the sum on its own: the solver files exactly it as an `"External"` reaction on every anchored dof carrying one (`PBD_kinematic_solver`), which is the only term a beam torsor cannot see.
 */
function node_reaction_from_beams(
  nodeID: ID,
  at: Point2,
  snapshot: DynamicSnapshot,
): ElementReaction | undefined {
  const cohesions = snapshot.beamCohesion;
  if (!cohesions || cohesions.length === 0) return undefined;
  let parts: string[] | undefined;
  for (const r of snapshot.reactions ?? []) {
    const split = r.key.split(",");
    if (split.includes(nodeID)) {
      parts = split;
      break;
    }
  }
  if (!parts) return undefined;

  let vector = new Point2(0, 0);
  let moment = 0;
  let any = false;
  for (const cohesion of cohesions)
    for (const which of ["start", "end"] as const) {
      if (!parts.includes(`${cohesion.beamID}:${which}`)) continue;
      const end = beam_end_reaction(cohesion, which, at, snapshot);
      vector = vector.add(end.vector);
      moment += end.moment ?? 0;
      any = true;
    }
  if (!any) return undefined;
  for (const r of snapshot.reactions ?? []) {
    if (r.type !== "External" || !r.key.split(",").includes(nodeID)) continue;
    if (r.kind === "force") vector = vector.add(new Point2(r.fx, r.fy));
    else moment += r.torque;
  }
  const atAnchor = anchored_at(nodeID, snapshot);
  return {
    at,
    which: "node",
    vector: oppose_at_support(vector, atAnchor, (v) => v.mul(-1)),
    moment: oppose_at_support(moment, atAnchor, (m) => -m),
    atAnchor,
  };
}

/** Which point of an element a reaction is read at: a node/gear/body has only `"node"`, an edge only `"start"`/`"end"` — `element_reaction_at` returns `undefined` for the shape the element doesn't have. */
export type ReactionPoint = "node" | "start" | "end";

/** The reaction at one specific point of an element — the building block behind both `element_reactions` (all of an element's points, for the canvas overlay) and the probe series/instant readers (one named point at a time, e.g. "force-start"). */
function element_reaction_at(
  element: MechanicalElement,
  which: ReactionPoint,
  snapshot: DynamicSnapshot,
): ElementReaction | undefined {
  if (which === "node") {
    if (!("position" in element)) return undefined;
    return (
      node_reaction_from_beams(element.id, element.position, snapshot) ??
      point_reaction(element.id, "node", element.position, snapshot)
    );
  }
  if (!("positionStart" in element)) return undefined;
  const at = which === "start" ? element.positionStart : element.positionEnd;
  // A beam answers from its own torsor whenever the frame carries one; everything else, and a frame recorded without diagnostics, falls back to the raw impulses at the key.
  if (element.type === "beam") {
    const cohesion = snapshot.beamCohesion?.find((c) => c.beamID === element.id);
    if (cohesion) return beam_end_reaction(cohesion, which, at, snapshot);
  }
  return point_reaction(`${element.id}:${which}`, which, at, snapshot);
}

/**
 * Every reaction acting on this element — the canvas overlay arrow's "force" reading.
 * A node/gear resolves to at most one entry (its own key); an edge to at most two, one per endpoint (`id:start`/`id:end`, same keying `probe_slots` uses elsewhere) — a beam's root reaction and its tip reaction are unrelated quantities, never merged into one arrow.
 */
export function element_reactions(
  element: MechanicalElement,
  snapshot: DynamicSnapshot,
): ElementReaction[] {
  const node = element_reaction_at(element, "node", snapshot);
  if (node) return [node];
  return (["start", "end"] as const)
    .map((which) => element_reaction_at(element, which, snapshot))
    .filter((r): r is ElementReaction => r !== undefined);
}

/** The recorded path of one element (canvas trajectory overlay). */
export interface ProbeTrajectory {
  elementID: ID;
  points: Point2[];
  /** Number of points at or before the playback time `time`. */
  headCount: number;
}

/** One trajectory being accumulated: the path, and the time each point was recorded at (the sampling can skip a snapshot, so the two arrays are not indexed by snapshot). */
interface TrajectoryBuild {
  elementID: ID;
  points: Point2[];
  times: number[];
}

/** Trajectories built so far, plus what they were built from. Opaque: pass it back to `extend_probe_trajectories`, never read it. */
export interface TrajectoryCache {
  elements: MechanicalElement[];
  /** Number of snapshots consumed, and the last one consumed — its identity is what tells an append apart from a rewritten history. */
  consumed: number;
  boundary: SimulationSnapshot | null;
  built: TrajectoryBuild[];
}

export const EMPTY_TRAJECTORY_CACHE: TrajectoryCache = {
  elements: [],
  consumed: 0,
  boundary: null,
  built: [],
};

function sample_into(
  build: TrajectoryBuild[],
  snapshots: SimulationSnapshot[],
  elements: MechanicalElement[],
  from: number,
): void {
  let layout: SnapshotLayout | null = null;
  let slots: ProbeSlots[] = [];
  for (let i = from; i < snapshots.length; i++) {
    const snap = snapshots[i];
    if (snap.layout !== layout) {
      layout = snap.layout;
      slots = elements.map((el) => probe_slots(el, layout!));
    }
    build.forEach((traj, k) => {
      if (!read_position(snap, slots[k])) return;
      traj.points.push(new Point2(sampled[0], sampled[1]));
      traj.times.push(snap.t);
    });
  }
}

/**
 * Trajectories of every node whose `trajectory` overlay is on, in mechanical- element order.
 * The recording only ever grows, so the cache is extended with the new snapshots instead of being rebuilt — pass the returned cache back on the next call.
 * Anything else (elements edited, history truncated or reset) rebuilds from scratch.
 */
export function extend_probe_trajectories(
  cache: TrajectoryCache,
  elements: MechanicalElement[],
  snapshots: SimulationSnapshot[],
): TrajectoryCache {
  const appendable =
    cache.elements === elements &&
    snapshots.length >= cache.consumed &&
    (cache.consumed === 0 || snapshots[cache.consumed - 1] === cache.boundary);

  const tracked = elements.filter(
    (el) => is_node_element(el) && overlay_shown(el, "trajectory"),
  );
  const built = appendable
    ? cache.built
    : tracked.map((el) => ({ elementID: el.id, points: [], times: [] }));
  sample_into(built, snapshots, tracked, appendable ? cache.consumed : 0);

  return {
    elements,
    consumed: snapshots.length,
    boundary: snapshots.length > 0 ? snapshots[snapshots.length - 1] : null,
    built,
  };
}

/** Index of the first point recorded after `time` — the trajectory's head at that playback time.
 * `times` is sorted, so the scan is a binary search. */
function head_count(times: number[], time: number): number {
  let lo = 0;
  let hi = times.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= time) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Reads the accumulated trajectories at a playback time. The point arrays are shared with the cache, not copied: treat them as read-only. */
export function trajectories_at(
  cache: TrajectoryCache,
  time: number,
): ProbeTrajectory[] {
  return cache.built.map((traj) => ({
    elementID: traj.elementID,
    points: traj.points,
    headCount: head_count(traj.times, time),
  }));
}

/**
 * Extract the plottable time series of one probe metric from the recorded kinematic snapshots.
 * Velocity is derived from positions by central finite differences; edge angles are unwrapped so the curve stays continuous across the ±180° seam.
 */
export function get_probe_series(
  element: MechanicalElement,
  metric: ProbeMetric,
  snapshots: KinematicSnapshot[],
): ProbeSeries {
  switch (metric) {
    case "position":
    case "velocity": {
      const t: number[] = [];
      const xs: number[] = [];
      const ys: number[] = [];
      let layout: SnapshotLayout | null = null;
      let slots = NO_SLOTS;
      for (const snap of snapshots) {
        if (snap.layout !== layout) {
          layout = snap.layout;
          slots = probe_slots(element, layout);
        }
        if (!read_position(snap, slots)) continue;
        t.push(snap.t);
        xs.push(sampled[0]);
        ys.push(sampled[1]);
      }

      let vx = xs;
      let vy = ys;
      if (metric === "velocity") {
        if (xs.length < 2) return { t: [], curves: [], unit: "m/s" };
        vx = new Array<number>(xs.length);
        vy = new Array<number>(ys.length);
        for (let i = 0; i < xs.length; i++) {
          const i0 = Math.max(0, i - 1);
          const i1 = Math.min(xs.length - 1, i + 1);
          const dt = t[i1] - t[i0];
          const inv = dt > 0 ? 1 / dt : 0;
          vx[i] = (xs[i1] - xs[i0]) * inv;
          vy[i] = (ys[i1] - ys[i0]) * inv;
        }
      }

      // Position "norm" is the displacement from the start of the recording (‖p‖ would be the distance to the arbitrary canvas origin); velocity norm is the plain magnitude ‖v‖.
      const position = metric === "position" && xs.length > 0;
      const ox = position ? xs[0] : 0;
      const oy = position ? ys[0] : 0;
      return {
        t,
        curves: [
          { key: "x", values: vx },
          { key: "y", values: vy },
          {
            key: "norm",
            values: vx.map((x, i) =>
              position
                ? Math.sqrt((x - ox) * (x - ox) + (vy[i] - oy) * (vy[i] - oy))
                : Math.hypot(x, vy[i]),
            ),
          },
        ],
        unit: metric === "position" ? "m" : "m/s",
      };
    }

    case "angle":
    case "angular-velocity": {
      const t: number[] = [];
      const angles: number[] = []; // unwrapped, rad
      let prev: number | undefined;
      let layout: SnapshotLayout | null = null;
      let slots = NO_SLOTS;
      for (const snap of snapshots) {
        if (snap.layout !== layout) {
          layout = snap.layout;
          slots = probe_slots(element, layout);
        }
        let a = read_angle(snap, slots);
        if (a === undefined) continue;
        // Unwrap: keep the curve continuous across the ±π seam.
        if (prev !== undefined) {
          while (a - prev > Math.PI) a -= 2 * Math.PI;
          while (a - prev < -Math.PI) a += 2 * Math.PI;
        }
        prev = a;
        t.push(snap.t);
        angles.push(a);
      }

      if (metric === "angle")
        return {
          t,
          curves: [
            { key: "value", values: angles.map((a) => (a * 180) / Math.PI) },
          ],
          unit: "deg",
        };

      // Angular velocity by central differences, in tr/min (motor unit)
      if (angles.length < 2) return { t: [], curves: [], unit: "tr/min" };
      const omega = angles.map((_, i) => {
        const i0 = Math.max(0, i - 1);
        const i1 = Math.min(angles.length - 1, i + 1);
        const dt = t[i1] - t[i0];
        return dt > 0
          ? (((angles[i1] - angles[i0]) / dt) * 60) / (2 * Math.PI)
          : 0;
      });
      return { t, curves: [{ key: "value", values: omega }], unit: "tr/min" };
    }

    case "motor-power":
      // No torque in the kinematic solver (motors drive position directly); dynamic mode fills this in.
      return { t: [], curves: [], unit: "W" };

    case "force":
    case "force-start":
    case "force-end":
      // Not computed by the kinematic solver; dynamic mode fills this in.
      return { t: [], curves: [], unit: "N" };

    case "moment":
    case "moment-start":
    case "moment-end":
      // Not computed by the kinematic solver; dynamic mode fills this in.
      return { t: [], curves: [], unit: "N·m" };

    case "length":
    case "elongation":
    case "elongation-velocity":
    case "axial-force":
    case "belt-tension":
    case "slide-abscissa":
    case "slide-velocity":
    case "motor-torque":
      return unrecorded_series(metric);

    case "weight":
    case "inertia":
      // Never requested through this path: a reading builds its own `MetricSample` directly (`mass_reading_sample`), the way a selected load's own components already do.
      return { t: [], curves: [], unit: "N" };

    case "inertia-moment":
      // Never requested through this path either, see "inertia" above.
      return { t: [], curves: [], unit: "N·m" };
  }
}

const REACTION_POINT: Record<
  "force" | "force-start" | "force-end" | "moment" | "moment-start" | "moment-end",
  ReactionPoint
> = {
  force: "node",
  "force-start": "start",
  "force-end": "end",
  moment: "node",
  "moment-start": "start",
  "moment-end": "end",
};

/**
 * `get_probe_series`'s dynamic-mode counterpart: same curves, but velocity and angular velocity are read directly off `DynamicSnapshot`'s real solver state (`read_velocity`, `read_angular_velocity`) instead of finite-differenced from position — no differencing noise, since dynamic mode has the actual quantity.
 * Position/angle are otherwise identical to the kinematic case (`read_position`/`read_angle` are already generic), duplicated rather than shared with `get_probe_series`: the two only diverge on velocity, and forcing both through one body costs more indirection than the position/angle cases are worth.
 */
export function get_dynamic_probe_series(
  element: MechanicalElement,
  metric: ProbeMetric,
  snapshots: DynamicSnapshot[],
): ProbeSeries {
  switch (metric) {
    case "position": {
      const t: number[] = [];
      const xs: number[] = [];
      const ys: number[] = [];
      let layout: SnapshotLayout | null = null;
      let slots = NO_SLOTS;
      for (const snap of snapshots) {
        if (snap.layout !== layout) {
          layout = snap.layout;
          slots = probe_slots(element, layout);
        }
        if (!read_position(snap, slots)) continue;
        t.push(snap.t);
        xs.push(sampled[0]);
        ys.push(sampled[1]);
      }
      // Displacement from the start of the recording, like `get_probe_series`'s position norm — ‖p‖ would be the distance to the arbitrary canvas origin.
      const ox = xs.length > 0 ? xs[0] : 0;
      const oy = xs.length > 0 ? ys[0] : 0;
      return {
        t,
        curves: [
          { key: "x", values: xs },
          { key: "y", values: ys },
          { key: "norm", values: xs.map((x, i) => Math.hypot(x - ox, ys[i] - oy)) },
        ],
        unit: "m",
      };
    }

    case "velocity": {
      const t: number[] = [];
      const vx: number[] = [];
      const vy: number[] = [];
      let layout: SnapshotLayout | null = null;
      let slots = NO_SLOTS;
      for (const snap of snapshots) {
        if (snap.layout !== layout) {
          layout = snap.layout;
          slots = probe_slots(element, layout);
        }
        if (!read_velocity(snap, slots)) continue;
        t.push(snap.t);
        vx.push(sampled[0]);
        vy.push(sampled[1]);
      }
      return {
        t,
        curves: [
          { key: "x", values: vx },
          { key: "y", values: vy },
          { key: "norm", values: vx.map((x, i) => Math.hypot(x, vy[i])) },
        ],
        unit: "m/s",
      };
    }

    case "angle": {
      const t: number[] = [];
      const angles: number[] = [];
      let prev: number | undefined;
      let layout: SnapshotLayout | null = null;
      let slots = NO_SLOTS;
      for (const snap of snapshots) {
        if (snap.layout !== layout) {
          layout = snap.layout;
          slots = probe_slots(element, layout);
        }
        let a = read_angle(snap, slots);
        if (a === undefined) continue;
        // Unwrap: keep the curve continuous across the ±π seam.
        if (prev !== undefined) {
          while (a - prev > Math.PI) a -= 2 * Math.PI;
          while (a - prev < -Math.PI) a += 2 * Math.PI;
        }
        prev = a;
        t.push(snap.t);
        angles.push(a);
      }
      return {
        t,
        curves: [{ key: "value", values: angles.map((a) => (a * 180) / Math.PI) }],
        unit: "deg",
      };
    }

    case "angular-velocity": {
      const t: number[] = [];
      const omega: number[] = [];
      let layout: SnapshotLayout | null = null;
      let slots = NO_SLOTS;
      for (const snap of snapshots) {
        if (snap.layout !== layout) {
          layout = snap.layout;
          slots = probe_slots(element, layout);
        }
        const v = read_angular_velocity(snap, slots);
        if (v === undefined) continue;
        t.push(snap.t);
        omega.push((v * 60) / (2 * Math.PI)); // rad/s -> tr/min, same unit as the motor speed
      }
      return { t, curves: [{ key: "value", values: omega }], unit: "tr/min" };
    }

    case "motor-power": {
      const t: number[] = [];
      const watts: number[] = [];
      for (const snap of snapshots) {
        const sample = snap.motorPower?.find((p) => p.pivotID === element.id);
        if (!sample) continue;
        t.push(snap.t);
        watts.push(sample.watts);
      }
      return { t, curves: [{ key: "value", values: watts }], unit: "W" };
    }

    case "force":
    case "force-start":
    case "force-end": {
      const which = REACTION_POINT[metric];
      const t: number[] = [];
      const fx: number[] = [];
      const fy: number[] = [];
      for (const snap of snapshots) {
        const r = element_reaction_at(element, which, snap);
        if (!r) continue;
        t.push(snap.t);
        fx.push(r.vector.x);
        fy.push(r.vector.y);
      }
      return {
        t,
        curves: [
          { key: "x", values: fx },
          { key: "y", values: fy },
          { key: "norm", values: fx.map((x, i) => Math.hypot(x, fy[i])) },
        ],
        unit: "N",
      };
    }

    case "moment":
    case "moment-start":
    case "moment-end": {
      const which = REACTION_POINT[metric];
      const t: number[] = [];
      const values: number[] = [];
      for (const snap of snapshots) {
        const r = element_reaction_at(element, which, snap);
        if (r?.moment === undefined) continue;
        t.push(snap.t);
        // Solver's raw moment is CCW-positive; the data model (and every moment drawn on screen, see `use-simulation-playback.ts`) reads clockwise-positive — negate once.
        values.push(-r.moment);
      }
      return { t, curves: [{ key: "value", values }], unit: "N·m" };
    }

    case "weight":
    case "inertia":
      // Never requested through this path — see `get_probe_series`'s own case.
      return { t: [], curves: [], unit: "N" };

    case "inertia-moment":
      return { t: [], curves: [], unit: "N·m" };

    case "length":
    case "elongation":
    case "elongation-velocity":
    case "axial-force":
    case "belt-tension":
    case "slide-abscissa":
    case "slide-velocity":
    case "motor-torque":
      return unrecorded_series(metric);
  }
}

type UnrecordedMetric =
  | "length"
  | "elongation"
  | "elongation-velocity"
  | "axial-force"
  | "belt-tension"
  | "slide-abscissa"
  | "slide-velocity"
  | "motor-torque";

/** The empty series of a metric the recorder does not produce yet (see `ProbeMetric`), in the unit it will read in. */
function unrecorded_series(metric: UnrecordedMetric): ProbeSeries {
  return { t: [], curves: [], unit: UNRECORDED_UNIT[metric] };
}

const UNRECORDED_UNIT: Record<UnrecordedMetric, string> = {
  length: "m",
  elongation: "m",
  "elongation-velocity": "m/s",
  "axial-force": "N",
  "belt-tension": "N",
  "slide-abscissa": "m",
  "slide-velocity": "m/s",
  "motor-torque": "N·m",
};

/** One measured quantity of an element at a given instant. */
export interface MetricSample {
  metric: ProbeMetric;
  unit: string;
  /** One entry per curve of the metric ("x"/"y"/"norm", or "value"). Empty when the metric has no data yet (no snapshots, or not computed in this mode). */
  values: { key: ProbeCurveKey; value: number }[];
}

/**
 * The instantaneous value of `metric` at simulation time `t`: the same series `get_probe_series` plots, sampled at the recorded time closest to `t`.
 */
export function get_metric_at(
  element: MechanicalElement,
  metric: ProbeMetric,
  snapshots: KinematicSnapshot[],
  t: number,
): MetricSample {
  const series = get_probe_series(element, metric, snapshots);
  if (series.t.length === 0) return { metric, unit: series.unit, values: [] };

  // Nearest recorded sample: the series time axis is uniform (RECORD_DT), but scan for the closest rather than assume it — snapshots can start late.
  let best = 0;
  for (let i = 1; i < series.t.length; i++) {
    if (Math.abs(series.t[i] - t) < Math.abs(series.t[best] - t)) best = i;
  }
  return {
    metric,
    unit: series.unit,
    values: series.curves.map((c) => ({ key: c.key, value: c.values[best] })),
  };
}

/** `get_metric_at`'s dynamic-mode counterpart — see `get_dynamic_probe_series`. */
export function get_dynamic_metric_at(
  element: MechanicalElement,
  metric: ProbeMetric,
  snapshots: DynamicSnapshot[],
  t: number,
): MetricSample {
  const series = get_dynamic_probe_series(element, metric, snapshots);
  if (series.t.length === 0) return { metric, unit: series.unit, values: [] };

  let best = 0;
  for (let i = 1; i < series.t.length; i++) {
    if (Math.abs(series.t[i] - t) < Math.abs(series.t[best] - t)) best = i;
  }
  return {
    metric,
    unit: series.unit,
    values: series.curves.map((c) => ({ key: c.key, value: c.values[best] })),
  };
}
