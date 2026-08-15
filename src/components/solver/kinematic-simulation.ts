import { ID, Link, Mechanism, PivotElement, Point2, KinNodes } from "../../types";
import {
  BeltVia,
  belt_arrivals,
  belt_pieces,
  belt_project,
  belt_wraps,
} from "../../utils/belt-path";
import {
  ConstraintResidual,
  KinematicSnapshot,
  ParameterSnapshot,
  SnapshotLayout,
} from "../../types/runtime-state";
import {
  belt_q_links,
  get_links_simulation,
  get_sim_nodes,
  mark_passive_belt_pins,
  rebuild_belt_q_links,
} from "./parsing";
import { PBD_kinematic_solver } from "./PBD_kinematic_solver";
import {
  BeltShape,
  GRAB_BRIDGE_KEY,
  GRAB_KEYS,
  GRAB_PERIMETER_KEY,
  angles_length,
  make_snapshot_layout,
  snapshot_angle,
  snapshot_belt_arrivals,
  snapshot_belt_detached,
  snapshot_belt_wraps,
  snapshot_point,
} from "./snapshot";
import { sort_links } from "./utils";

/**
 * The step every recorded instant is spaced by, whatever the playback speed and whatever
 * the machine. Speed is a target while recording and a promise on replay; it never buys
 * itself a coarser step, so the same mechanism records the same trajectory everywhere.
 */
const RECORD_DT = 1 / 120; // 120 fps of simulated time

/**
 * Solved instants per instant kept. The solver's step is a fidelity requirement — the
 * disconnection defect of chantier 5 does not even exist at 1/60 — but the display
 * interpolates and draws at 60 Hz, so keeping every step doubles what a session retains for
 * a resolution nothing reads back.
 */
const RETAIN_EVERY = 2;

/** Spacing of the RECORDED instants: what everything downstream of the recorder sees. */
export const RETAIN_DT = RECORD_DT * RETAIN_EVERY;

/** Whether the instant `t` is one of those kept. */
export function is_retained(t: number): boolean {
  return Math.round(t / RECORD_DT) % RETAIN_EVERY === 0;
}

/** Longest a recording may run, in simulated seconds — no mechanism goes past it, however
 *  cheap its instants are. */
export const MAX_RECORDING_TIME = 600;

/**
 * Memory one recording may hold, in bytes.
 *
 * What actually bounds a session: an instant costs 1.67 ko on `Core XY - 2 moteurs`
 * (55 nodes) and ten times that on a mechanism ten times its size, so a duration fixed for
 * everyone is either short for the small ones or fatal for the big ones. The budget is what
 * a tab keeps comfortably alongside the canvas and the undo history.
 */
const RECORDING_MEMORY_BUDGET = 200 * 1024 * 1024;

/** What an instant costs beyond its numbers: two typed arrays with their buffers, the
 *  snapshot object, and its slot in the recording. Around 15 % on a small mechanism. */
const SNAPSHOT_OVERHEAD_BYTES = 256;

/** Bytes one retained instant of this layout costs. */
function snapshot_bytes(layout: SnapshotLayout): number {
  return (
    8 * (2 * layout.keys.length + angles_length(layout)) +
    SNAPSHOT_OVERHEAD_BYTES
  );
}

/**
 * How long a recording of this layout may run, in simulated seconds: whatever the memory
 * budget buys, capped at `MAX_RECORDING_TIME`.
 *
 * Whole minutes, because it is a number the user is told; and never under one, because a
 * mechanism heavy enough to exhaust the budget in seconds is still worth simulating — that
 * floor is the one case where the budget is knowingly overrun.
 */
export function max_recording_time(layout: SnapshotLayout): number {
  const affordable =
    (RECORDING_MEMORY_BUDGET / snapshot_bytes(layout)) * RETAIN_DT;
  return Math.max(
    60,
    Math.min(MAX_RECORDING_TIME, Math.floor(affordable / 60) * 60),
  );
}

/**
 * Whether a recording that has got to `t` has run its full length, `maxTime`.
 *
 * Half a step of tolerance, and it is not decorative: a recorded instant is a running sum of
 * `RECORD_DT`, so the last one lands short of the round number it stands for. Compared with
 * a bare `>=`, the end of the recording is never reached.
 */
export function recording_full(t: number, maxTime: number): boolean {
  return t >= maxTime - RECORD_DT / 2;
}

/**
 * Wall-clock milliseconds the recording loop may spend inside one displayed frame.
 * Under a 16.7 ms frame, so the display keeps its own time; a step that outlasts
 * it on its own still runs to completion, since a partial step is not a state.
 */
export const FRAME_BUDGET_MS = 8;

/**
 * Gauss-Seidel sweeps per simulated frame. Measured (chantier 3 of `plan-ralentissement`):
 * raising it buys a smaller drift slope and nothing the user can see — no constraint is
 * left violated at 200 — while costing real time in proportion. Edition has its own cap
 * and its own exit; the two are not the same number and must not be made one.
 */
const SIMULATION_SWEEPS = 200;

/**
 * The belt's contact band, in belt-px of wrapped arc: a pulley is let go below
 * `detachArc` and taken back above `reattachArc`.
 *
 * `detachArc` is NOT zero, and that is the whole point. The last sliver of wrap before
 * zero is a degenerate band — the no-slip on a pulley the belt barely grazes goes
 * erratic — so waiting for exactly zero means letting the mechanism strain against a
 * pulley that no longer holds anything, then releasing it all at once. Measured on
 * `Déconnexion courroie`: the transition frame lurches **26.1 px** at zero and **1.2 px**
 * at 0.5, and grows again beyond (3.7 px at 2, 18.4 px at 10 — there the pulley still
 * carried belt and dropping it is a real geometric change).
 *
 * The gap between the two is the hysteresis, and it exists for one reason: every flip
 * rebuilds the belt's no-slip links, which resets the `q` origin of the WHOLE belt.
 *
 * Mutable so a bench can sweep it in one process — production never writes it.
 */
export const beltContact = {
  detachArc: 0.5,
  reattachArc: 1.0,
  rebuildQLinks: true,
};

/** A motor is reported blocked when, over the frame, the driven element advanced
 *  by less than this fraction of its commanded increment ω·dt. */
const MOTOR_BLOCK_FRACTION = 0.5;

/** Per-frame motor check: where the driver was before the solve and how far it
 *  was asked to move, so we can compare against what it actually achieved. */
type MotorCheck = {
  owner: ID;
  type: "MotorBeam" | "MotorAngle";
  cur: number; // angle before the solve (rad)
  expected: number; // commanded increment ω·dt (rad)
  pivotKey?: string;
  drivenKey?: string;
  angleKey?: string;
};

/**
 * Compiled, frozen simulation model. Built once when entering simulation and
 * reused every frame: only the latest positions/angles are fed back in, the
 * masses and links never change until we return to edition.
 */
export type SimulationModel = {
  /** Initial positions/angles + frozen masses (fused keys for coincident points). */
  nodes: KinNodes;
  /** Links: already fused (Coincidence), FixedOnSegment, and sorted. */
  links: Link[];
  /** Maps an original solver key to its fused key (for grab translation). */
  keyMap: Map<string, string>;
  /** Slot layout every snapshot of this model shares. */
  layout: SnapshotLayout;
  /** How a solved state is written into those slots. */
  fill: SnapshotFill;
  /**
   * Radius of each gear, by id. Not a solver input — simulation solves no radius — but the
   * lever arm that turns an angular shortfall into the arc it failed to sweep, so a
   * diagnostic can be stated in millimetres like every other one.
   */
  gearRadii: Map<ID, number>;
};

/** Which snapshot slots each solver node writes to: a fused key feeds one slot per key it
 *  fuses, and `firstParts` is the key a warm start reads its previous position from. */
type SnapshotFill = {
  keys: string[];
  firstParts: string[];
  /** `slots[start[i] … start[i + 1]]` are the slots of `keys[i]`. */
  start: Int32Array;
  slots: Int32Array;
};

/** The junction links a belt topology change rewrites in place. */
type JunctionLink = Extract<Link, { type: "BeltPin" | "BeltFollowsTangent" }>;

/**
 * What a belt topology change rewrites in a compiled model: the link list, whose no-slip
 * links are rebuilt against the new loop, and the junction references baked into it.
 *
 * Handed to `step_simulation`'s `onRewire` BEFORE the change, since the junction links are
 * rewritten in place and there is no reading them back afterwards. Restoring it is what
 * makes a rewind land on the state the recording actually had, rather than on one re-baked
 * from the geometry — `h⁰` is measured, not derived, so the two are not the same.
 */
export type RewireState = {
  links: Link[];
  pins: {
    link: JunctionLink;
    refIndex: number;
    refAngleKey: string;
    s0: number;
    thetaRef0: number;
  }[];
};

function capture_rewire_state(model: SimulationModel): RewireState {
  const pins: RewireState["pins"] = [];
  for (const link of model.links)
    if (link.type === "BeltPin" || link.type === "BeltFollowsTangent")
      pins.push({
        link,
        refIndex: link.refIndex,
        refAngleKey: link.refAngleKey,
        s0: link.s0,
        thetaRef0: link.thetaRef0,
      });
  return { links: model.links, pins };
}

/** Put a captured `RewireState` back on the model it came from. */
export function restore_rewire_state(
  model: SimulationModel,
  state: RewireState,
): void {
  model.links = state.links;
  for (const pin of state.pins) {
    pin.link.refIndex = pin.refIndex;
    pin.link.refAngleKey = pin.refAngleKey;
    pin.link.s0 = pin.s0;
    pin.link.thetaRef0 = pin.thetaRef0;
  }
}

/** A grab during simulation: a node/endpoint key, an edge body at ratio t, or a
 *  gear tooth (rotate the gear so the perimeter point at `angleOffset` follows). */
export type SimGrab =
  | { key: string; target: Point2 }
  | { edgeID: string; t: number; target: Point2 }
  | { gearID: string; angleOffset: number; radius: number; target: Point2 }
  // Grab an arbitrary point of a closed belt: a transient BeltPin (baked at grab
  // start) rides the loop at the grabbed arc-length; pulling it rotates the belt.
  | { beltPin: Extract<Link, { type: "BeltPin" }>; target: Point2 };

function wrap_angle(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a <= -Math.PI) a += 2 * Math.PI;
  return a;
}

/**
 * Per-frame belt-contact update (mutates the BeltLength link's sim state): tracks each
 * still-connected pulley's continuous (unwrapped) wrap angle and, once the arc it wraps
 * falls under `beltContact.detachArc`, marks the pulley disconnected. The belt then runs
 * straight past it (BeltLength skips it; the geometry of the remaining pulleys uses the
 * reduced loop/chain), until `reattach_belt_pulleys` finds it back on the belt.
 *
 * Returns whether the belt's topology changed this frame, which is what the caller re-bakes
 * the junction references and the no-slip links on.
 */
export function update_belt_disconnects(
  link: Extract<Link, { type: "BeltLength" }>,
  positions: Map<string, Point2>,
): boolean {
  const n = link.gearPosKeys.length;
  if (!link.disconnected) link.disconnected = new Array(n).fill(false);
  let newlyDisconnected = false;

  const activeIdx: number[] = [];
  const vias: BeltVia[] = [];
  if (!link.closed) {
    const s = positions.get(link.startKey);
    if (!s) return false;
    vias.push({ pos: s, radius: 0, clockwise: false });
  }
  for (let i = 0; i < n; i++) {
    if (link.disconnected[i]) continue;
    const pos = positions.get(link.gearPosKeys[i]);
    if (!pos) return false;
    activeIdx.push(i);
    vias.push({ pos, radius: link.radii[i], clockwise: link.directions[i] });
  }
  if (!link.closed) {
    const e = positions.get(link.endKey);
    if (!e) return false;
    vias.push({ pos: e, radius: 0, clockwise: false });
  }

  const raw = belt_wraps(vias, link.closed);
  const rawArr = belt_arrivals(vias, link.closed);
  const offset = link.closed ? 0 : 1; // via index of the first pulley
  const seeding = !link.wraps;
  if (!link.wraps) link.wraps = new Array(n).fill(0);
  if (!link.arrivals) link.arrivals = new Array(n).fill(0);
  const TAU = 2 * Math.PI;
  // Unwrap a raw angle onto the branch continuous with its previous value.
  const unwrap = (rawA: number, prev: number) => {
    let delta = rawA - (((prev % TAU) + TAU) % TAU);
    while (delta > Math.PI) delta -= TAU;
    while (delta <= -Math.PI) delta += TAU;
    return prev + delta;
  };
  // A pulley whose continuous wrap reaches 0 has lost belt contact (the belt straightens
  // past it) and detaches. A CLOSED belt keeps its last pulley (a gearless loop is
  // degenerate); a LOOSE belt may shed even its last pulley → an inert free segment.
  activeIdx.forEach((gi, k) => {
    const rawW = raw[offset + k];
    if (seeding) {
      link.wraps![gi] = rawW; // first frame: seed, never disconnect
      link.arrivals![gi] = rawArr[offset + k];
      return;
    }
    // Continuous (unwrapped) wrap = 2π·turns + fractional: a wound end coils past 2π
    // (winch) and unwinds smoothly back through the seam.
    const cont = unwrap(rawW, link.wraps![gi]);
    link.wraps![gi] = cont;
    // The ARRIVAL rim angle, likewise unwrapped. BeltLength's no-slip differential is
    // written in the pulley's frame (fs ± r·ψ), which needs ψ on a continuous branch —
    // a raw atan2 would jump 2π at the ±π seam and inject 2πr of phantom belt.
    link.arrivals![gi] = unwrap(rawArr[offset + k], link.arrivals![gi]);
    if (
      cont * link.radii[gi] <= beltContact.detachArc &&
      !link.disconnected![gi] &&
      (!link.closed || activeIdx.length > 1)
    ) {
      link.disconnected![gi] = true;
      newlyDisconnected = true;
    }
  });
  return newlyDisconnected || reattach_belt_pulleys(link, positions);
}

/**
 * Belt contact REGAINED: a detached pulley the belt has come back onto. Tested by
 * putting the pulley back into the via list and reading the arc it would then wrap —
 * the exact mirror of the detachment test, which is why the two agree at the tangency.
 *
 * Two guards, and neither is optional:
 *  - the pulley's centre must project INSIDE the strand it would join, not past one of
 *    its ends (same condition the canvas uses to decide a pulley can be dropped on a
 *    run) — otherwise a pulley that has drifted off sideways reads as touching;
 *  - the arc must exceed `BELT_REATTACH_ARC`, in belt-px. Detachment stays at exactly
 *    zero, which is the geometric truth; only the way back waits. Measured on
 *    `Déconnexion courroie`, the belt straightens ACROSS the pulley it just dropped and
 *    would re-take it on the very next frame, forever — and every flip resets the whole
 *    belt's `q` origin, which is what would make the no-slip blind.
 */
function reattach_belt_pulleys(
  link: Extract<Link, { type: "BeltLength" }>,
  positions: Map<string, Point2>,
): boolean {
  if (!link.disconnected?.some(Boolean)) return false;
  let reattached = false;
  for (let gi = 0; gi < link.gearPosKeys.length; gi++) {
    if (!link.disconnected[gi]) continue;
    const vias: BeltVia[] = [];
    let index = -1;
    let ok = true;
    for (let i = 0; i < link.gearPosKeys.length; i++) {
      if (link.disconnected[i] && i !== gi) continue;
      const pos = positions.get(link.gearPosKeys[i]);
      if (!pos) {
        ok = false;
        break;
      }
      if (i === gi) index = vias.length;
      vias.push({ pos, radius: link.radii[i], clockwise: link.directions[i] });
    }
    if (!ok || index < 0 || vias.length < 2) continue;

    const centre = vias[index].pos;
    const onRun = belt_pieces(
      vias.filter((_, v) => v !== index),
      link.closed,
    ).some(
      (p) =>
        p.kind === "segment" &&
        centre.distance2segment(p.from, p.to) <=
          centre.distance2line(p.from, p.to),
    );
    if (!onRun) continue;

    const piece = belt_pieces(vias, link.closed).find(
      (p) => p.kind === "arc" && p.gearIndex === index,
    );
    if (!piece || piece.kind !== "arc") continue;
    // The raw sweep lives in [0, 2π) and cannot say which side of zero it is on: a pulley
    // the belt misses by 0.027 rad reads 6.2558, i.e. 2π − 0.027, and would be taken back
    // wrapped the LONG way round — measured, +409 px of belt out of nowhere. A pulley
    // coming back into contact always starts from a hair of wrap, so the short side is
    // the only readable one.
    if (piece.wrap >= Math.PI) continue;
    if (piece.length < beltContact.reattachArc) continue;

    // Back on the belt: its continuous state is stale by the whole detachment, so
    // re-seed it from the raw geometry exactly as the first frame does.
    link.disconnected[gi] = false;
    if (link.wraps) link.wraps[gi] = belt_wraps(vias, link.closed)[index];
    if (link.arrivals)
      link.arrivals[gi] = belt_arrivals(vias, link.closed)[index];
    reattached = true;
  }
  return reattached;
}

/**
 * Re-bake the closed-belt junction constraints (BeltPin + BeltFollowsTangent) of
 * belts that just lost a pulley. The junction rides the loop at
 * s = s0 + rε·(θ − θ0); s0 is an arc-length on the loop, so when a pulley
 * disconnects the loop shrinks, s0's meaning shifts, and the junction would JUMP.
 * Fix (mirrors how rewire_belt_mesh re-bakes the mesh θ0): re-project the junction
 * onto the REDUCED loop for a fresh s0 and reset θ0 to the current reference angle
 * (so s = s0 at this frame → no jump). If the reference pulley itself disconnected
 * (its θ is no longer coupled to φ), re-elect the first still-connected pulley.
 * Called once per disconnect event; permanent for the run (reset on recompile).
 */
export function rebake_belt_pin_refs(
  links: Link[],
  belts: Extract<Link, { type: "BeltLength" }>[],
  positions: Map<string, Point2>,
  angles: Map<string, number>,
): void {
  for (const belt of belts) {
    if (belt.owner === undefined) continue;
    const disconnected = belt.disconnected;
    // Reduced loop (still-connected pulleys) + active-via → original-gear map.
    const vias: BeltVia[] = [];
    const viaToGear: number[] = [];
    for (let i = 0; i < belt.gearPosKeys.length; i++) {
      if (disconnected?.[i]) continue;
      const pos = positions.get(belt.gearPosKeys[i]);
      if (!pos) continue;
      vias.push({ pos, radius: belt.radii[i], clockwise: belt.directions[i] });
      viaToGear.push(i);
    }
    if (vias.length < 2) continue;
    const activeWraps = belt.wraps
      ? viaToGear.map((g) => belt.wraps![g] ?? 0)
      : undefined;
    for (const link of links) {
      if (
        (link.type !== "BeltPin" && link.type !== "BeltFollowsTangent") ||
        link.beltID !== belt.owner
      )
        continue;
      // Re-elect a reference if the current one just disconnected.
      if (disconnected?.[link.refIndex]) {
        const newRef = viaToGear[0];
        link.refIndex = newRef;
        link.refAngleKey = link.gearAngleKeys[newRef];
      }
      const theta = angles.get(link.refAngleKey);
      if (theta === undefined) continue;
      const J =
        link.type === "BeltPin"
          ? positions.get(link.nodeKey)
          : positions.get(link.pivotKey);
      if (!J) continue;
      // BeltPin's arc-length parametrization includes winding (wraps);
      // BeltFollowsTangent's does not — match each constraint's own usage.
      const projWraps = link.type === "BeltPin" ? activeWraps : undefined;
      link.thetaRef0 = theta;
      link.s0 = belt_project(vias, J, true, projWraps).s;
    }
  }
}

/**
 * Put every belt's per-frame state — which pulleys it is on, and the continuous wrap and
 * arrival angles it tracks them by — back from `snapshot`.
 *
 * Returns the belts that come back with a pulley off, whose baked topology therefore has to
 * be looked at: `rewire_belts` for a model just compiled, the recorder's own journal for a
 * rewind, which can put back the exact state instead of measuring a new one.
 */
export function restore_belt_state(
  model: SimulationModel,
  snapshot: KinematicSnapshot,
): Extract<Link, { type: "BeltLength" }>[] {
  const detachedBelts: Extract<Link, { type: "BeltLength" }>[] = [];
  for (const link of model.links) {
    if (link.type !== "BeltLength" || link.owner === undefined) continue;
    const detached = snapshot_belt_detached(snapshot, link.owner);
    // Unknown to this snapshot: a belt the edit has just added, which starts fresh.
    if (detached === undefined) continue;
    const dropped = new Set(detached);
    link.disconnected = link.gearPosKeys.map((_, i) => dropped.has(i));
    link.wraps = snapshot_belt_wraps(snapshot, link.owner) ?? link.wraps;
    link.arrivals =
      snapshot_belt_arrivals(snapshot, link.owner) ?? link.arrivals;
    if (dropped.size > 0) detachedBelts.push(link);
  }
  return detachedBelts;
}

/**
 * Hand each belt's disconnected mask to the junction links that ride its loop.
 *
 * `rebake_belt_pin_refs` measures `s0` as an arc-length on the REDUCED loop, so whatever
 * reads that `s0` back has to walk the same loop. Left without the mask, `BeltPin` walks the
 * whole one and lands the junction wherever the two disagree — a violated constraint at the
 * model's own rest state, which the mobility probe then reports as a mode.
 */
function share_belt_disconnections(
  links: Link[],
  belts: Extract<Link, { type: "BeltLength" }>[],
): void {
  const byBelt = new Map<ID, boolean[]>();
  for (const belt of belts)
    if (belt.owner !== undefined && belt.disconnected)
      byBelt.set(belt.owner, belt.disconnected);
  for (const link of links)
    if (link.type === "BeltPin" || link.type === "BeltFollowsTangent") {
      const mask = byBelt.get(link.beltID);
      if (mask) link.disconnected = mask;
    }
}

/**
 * Re-bake what a belt's topology decides — junction references and no-slip links — against
 * the state the model currently holds.
 *
 * For a model compiled from a mechanism: the compile reads the belt's whole pulley list, so
 * everything baked on it describes a loop the belt may have left long ago. `h⁰` is measured
 * rather than derived, so this lands on the geometry it is given and not on whatever the
 * recording had accumulated — close, but not the same state.
 */
export function rewire_belts(
  model: SimulationModel,
  belts: Extract<Link, { type: "BeltLength" }>[],
): void {
  if (belts.length === 0) return;
  const positions = new Map(model.nodes.positions);
  const angles = new Map(model.nodes.angles);
  share_belt_disconnections(model.links, belts);
  rebake_belt_pin_refs(model.links, belts, positions, angles);
  for (const belt of belts)
    model.links = sort_links(
      rebuild_belt_q_links(model.links, belt, positions, angles),
      model.nodes.posMasses,
    );
}

/** Position-bearing key fields are rewritten on coincidence fusion; angle key
 *  fields (angleKey…) are left untouched — angles live in a separate map. */
function rewrite_position_keys(link: Link, from: (k: string) => string): void {
  const l = link as Record<string, unknown>;
  for (const f of [
    "key1",
    "key2",
    "key3",
    "key4",
    "grabbedKey",
    "pivotKey",
    "drivenKey",
    "anchorKey",
    "anchorPivotKey",
    "posKey1",
    "posKey2",
    "nodeKey",
    "centerKey",
    // Belt links carry their position keys in dedicated fields.
    "startKey",
    "endKey",
    "centerKeyA",
    "centerKeyB",
    "gearPosKey",
  ]) {
    if (typeof l[f] === "string") l[f] = from(l[f] as string);
  }
  // BeltLength's wrapped-pulley centres live in an array.
  if (Array.isArray(l.gearPosKeys))
    l.gearPosKeys = (l.gearPosKeys as string[]).map(from);
}

/**
 * Compile the frozen simulation model from a mechanism (called on entering
 * simulation). Parses sim nodes + links, fuses coincidence links, sorts.
 */
export function compile_simulation_model(
  mechanism: Mechanism,
): SimulationModel {
  const nodes = get_sim_nodes(mechanism.mechanicalElements);
  let links = get_links_simulation(mechanism.mechanicalElements, nodes);
  const keyMap = new Map<string, string>();

  // ── Fuse coincidence links (guarantees coincident points stay together) ──
  links.forEach((lc) => {
    if (lc.type !== "Coincidence") return;
    const k1 = lc.key1;
    const k2 = lc.key2;
    const k_new = [k1, k2].join(",");

    const remap = (k: string) => (k === k1 || k === k2 ? k_new : k);
    links.forEach((link) => rewrite_position_keys(link, remap));

    const p1 = nodes.positions.get(k1);
    const p2 = nodes.positions.get(k2);
    nodes.positions.set(
      k_new,
      p1 && p2 ? p1.lerp(p2, 0.5) : (p1 ?? p2 ?? new Point2(0, 0)),
    );
    nodes.positions.delete(k1);
    nodes.positions.delete(k2);
    nodes.posMasses.set(
      k_new,
      Math.min(nodes.posMasses.get(k1) ?? 1, nodes.posMasses.get(k2) ?? 1),
    );
    nodes.posMasses.delete(k1);
    nodes.posMasses.delete(k2);

    // Record key → fused key (incl. previously fused keys mapping forward).
    keyMap.set(k1, k_new);
    keyMap.set(k2, k_new);
    keyMap.forEach((v, k) => {
      if (v === k1 || v === k2) keyMap.set(k, k_new);
    });
  });
  links = links.filter((link) => link.type !== "Coincidence");

  // ── Belt no-slip, on the fused geometry and the complete link list ──
  mark_passive_belt_pins(nodes, links);
  links.push(...belt_q_links(nodes, links));

  // ── Sort links (anchored nodes first for better convergence) ──
  links = sort_links(links, nodes.posMasses);

  const gearRadii = new Map<ID, number>();
  for (const element of mechanism.mechanicalElements)
    if (element.type === "gear") gearRadii.set(element.id, element.radius);

  // ── Snapshot slots: one per ORIGINAL key, so a fused node writes to each of its parts ──
  const fusedKeys = [...nodes.positions.keys()];
  const snapshotKeys: string[] = [];
  const firstParts: string[] = [];
  const start = new Int32Array(fusedKeys.length + 1);
  const slotList: number[] = [];
  fusedKeys.forEach((fused, i) => {
    start[i] = slotList.length;
    const parts = fused.split(",");
    firstParts.push(parts[0]);
    for (const part of parts) {
      slotList.push(snapshotKeys.length);
      snapshotKeys.push(part);
    }
  });
  start[fusedKeys.length] = slotList.length;

  // Each belt's pulley count, fixed for the recording: a detachment raises a flag, it never
  // shortens `gearPosKeys`.
  const belts: BeltShape[] = [];
  for (const link of links)
    if (link.type === "BeltLength" && link.owner !== undefined)
      belts.push({ id: link.owner, pulleys: link.gearPosKeys.length });

  return {
    nodes,
    links,
    keyMap,
    gearRadii,
    layout: make_snapshot_layout(snapshotKeys, [...nodes.angles.keys()], belts),
    fill: {
      keys: fusedKeys,
      firstParts,
      start,
      slots: Int32Array.from(slotList),
    },
  };
}

/**
 * Advance the simulation by one frame.
 *
 * Warm-starts from the previous positions/angles, refreshes the motor targets
 * (target = current real angle + ω·dt — no backlog when blocked) and the
 * continuous line-of-centres angle of gear meshes, then runs PBD on the frozen
 * links. The model's motor/mesh links are updated in place (they are simulation
 * state, not pure values).
 */
export function step_simulation(
  model: SimulationModel,
  t: number,
  /** The frame to warm-start from. Read by key, so it may come from another model —
   *  which is what it is after an edit, the snapshot the recording resumes on. */
  prev: KinematicSnapshot | null,
  dt: number = RECORD_DT,
  grab?: SimGrab,
  sweeps: number = SIMULATION_SWEEPS,
  /** Off only to measure what the collection itself costs; production reads it. */
  collectDiagnostics: boolean = true,
  /** Called with the model state a belt topology change is about to overwrite, so a caller
   *  that may rewind can keep it. Only ever called on the frames that change it. */
  onRewire?: (state: RewireState) => void,
): KinematicSnapshot {
  const positions = new Map(model.nodes.positions);
  const angles = new Map(model.nodes.angles);

  // ── Warm start (fused keys take the previous position of any of their parts) ──
  if (prev) {
    const { keys: fusedKeys, firstParts } = model.fill;
    const index = prev.layout.index;
    for (let i = 0; i < fusedKeys.length; i++) {
      const slot = index.get(firstParts[i]) ?? index.get(fusedKeys[i]);
      if (slot === undefined) continue;
      const x = prev.positions[2 * slot];
      if (Number.isNaN(x)) continue;
      positions.set(fusedKeys[i], new Point2(x, prev.positions[2 * slot + 1]));
    }
    const angleIndex = prev.layout.angleIndex;
    angles.forEach((_, key) => {
      const slot = angleIndex.get(key);
      if (slot === undefined) return;
      const a = prev.angles[slot];
      if (!Number.isNaN(a)) angles.set(key, a);
    });
  }

  // ── Refresh per-frame motor targets and gear-mesh line-of-centres angle ──
  const motorChecks: MotorCheck[] = [];
  const beltsToRewire: Extract<Link, { type: "BeltLength" }>[] = [];
  model.links.forEach((link) => {
    if (link.type === "MotorBeam") {
      const pivot = positions.get(link.pivotKey);
      const driven = positions.get(link.drivenKey);
      if (pivot && driven) {
        const cur = driven.sub(pivot).angle();
        // A beam-anchored motor also owes the anchor's own motion this frame, folded in as a
        // one-frame delta on top of `driven`'s ACTUAL current angle — never an independent,
        // ever-advancing target. That keeps it exactly as soft as a grounded motor: it never
        // commands more than one frame's worth of motion ahead of reality, so a blocked/
        // over-constrained mechanism stalls the motor first rather than forcing through it.
        let anchorDelta = 0;
        if (link.anchorKey !== undefined && link.anchorAngle !== undefined) {
          const anchor = positions.get(link.anchorKey);
          if (anchor) {
            const anchorNow = anchor.sub(pivot).angle();
            anchorDelta = wrap_angle(anchorNow - link.anchorAngle);
            link.anchorAngle = anchorNow;
          }
        }
        const expected = anchorDelta + link.omega * dt;
        link.targetAngle = cur + expected;
        if (link.owner !== undefined && expected !== 0)
          motorChecks.push({
            owner: link.owner,
            type: "MotorBeam",
            cur,
            expected,
            pivotKey: link.pivotKey,
            drivenKey: link.drivenKey,
          });
      }
    } else if (link.type === "MotorAngle") {
      const cur = angles.get(link.angleKey);
      if (cur !== undefined) {
        // Same anchor-delta idea as `MotorBeam` above, but the reference beam has no
        // angle node: its orientation comes from its two position keys instead.
        let anchorDelta = 0;
        if (
          link.anchorPivotKey !== undefined &&
          link.anchorKey !== undefined &&
          link.anchorAngle !== undefined
        ) {
          const anchorPivot = positions.get(link.anchorPivotKey);
          const anchor = positions.get(link.anchorKey);
          if (anchorPivot && anchor) {
            const anchorNow = anchor.sub(anchorPivot).angle();
            anchorDelta = wrap_angle(anchorNow - link.anchorAngle);
            link.anchorAngle = anchorNow;
          }
        }
        const expected = anchorDelta + link.omega * dt;
        link.targetAngle = cur + expected;
        if (link.owner !== undefined && expected !== 0)
          motorChecks.push({
            owner: link.owner,
            type: "MotorAngle",
            cur,
            expected,
            angleKey: link.angleKey,
          });
      }
    } else if (link.type === "GearMeshAngle") {
      const p1 = positions.get(link.posKey1);
      const p2 = positions.get(link.posKey2);
      if (p1 && p2) {
        const raw = p2.sub(p1).angle();
        link.alpha = link.alpha + wrap_angle(raw - link.alpha);
      }
    } else if (link.type === "BeltLength") {
      if (update_belt_disconnects(link, positions)) beltsToRewire.push(link);
    }
  });

  // A pulley just left the belt, or came back onto it → re-bake the closed-belt junction
  // refs onto the new loop (its arc-length origin has shifted, and it would otherwise
  // JUMP), then rebuild the belt's no-slip links against the new topology. Both mutate
  // the model, and both are reset on recompile.
  if (beltsToRewire.length > 0) {
    onRewire?.(capture_rewire_state(model));
    rebake_belt_pin_refs(model.links, beltsToRewire, positions, angles);
    // Drop the belt's no-slip links for THIS frame: they describe the belt as it was, so
    // letting them pull against the new topology spoils the very state the rebuild is
    // about to bake against. The frame runs on `BeltLength` alone and the links come back
    // at the end of it — measured, that is what makes the transition frame come out with
    // no violated constraint at all instead of three stuck at 1.3 px forever.
    if (beltContact.rebuildQLinks) {
      const owners = new Set(beltsToRewire.map((b) => b.owner));
      model.links = model.links.filter(
        (l) =>
          !(
            (l.type === "BeltSegmentNoSlip" ||
              l.type === "BeltSubChainAggregate") &&
            owners.has(l.owner)
          ),
      );
    }
  }

  // Share each belt's sim state — continuous wraps (so a wound pulley >2π is
  // traversed smoothly, not just its fractional arc) and the disconnected mask
  // (so the junction rides the same reduced loop the belt is drawn on) — from its
  // BeltLength link with its BeltPin + BeltFollowsTangent links. gearPosKeys order
  // matches (all built from the belt).
  const wrapsByBelt = new Map<ID, number[]>();
  const arrivalsByBelt = new Map<ID, number[]>();
  const disconnectedByBelt = new Map<ID, boolean[]>();
  for (const link of model.links)
    if (link.type === "BeltLength" && link.owner !== undefined) {
      if (link.wraps) wrapsByBelt.set(link.owner, link.wraps);
      if (link.arrivals) arrivalsByBelt.set(link.owner, link.arrivals);
      if (link.disconnected)
        disconnectedByBelt.set(link.owner, link.disconnected);
    }
  for (const link of model.links) {
    if (link.type === "BeltPin") {
      link.wraps = wrapsByBelt.get(link.beltID);
      link.disconnected = disconnectedByBelt.get(link.beltID);
    } else if (link.type === "BeltFollowsTangent") {
      link.disconnected = disconnectedByBelt.get(link.beltID);
    }
  }

  // ── Grab (transient, this frame only) ──
  let links = model.links;
  if (grab && "edgeID" in grab) {
    // Body grab: pull a bridge node sitting at ratio t along the beam.
    const startKey =
      model.keyMap.get(`${grab.edgeID}:start`) ?? `${grab.edgeID}:start`;
    const endKey =
      model.keyMap.get(`${grab.edgeID}:end`) ?? `${grab.edgeID}:end`;
    positions.set(GRAB_BRIDGE_KEY, new Point2(grab.target.x, grab.target.y));
    links = [
      ...model.links,
      {
        type: "FixedOnSegment",
        ddl: 2,
        key1: startKey,
        key2: endKey,
        key3: GRAB_BRIDGE_KEY,
        t: grab.t,
      },
      {
        type: "HandleGrab",
        ddl: 1,
        grabbedKey: GRAB_BRIDGE_KEY,
        value: grab.target,
      },
    ];
  } else if (grab && "gearID" in grab) {
    // Gear-tooth grab: pin a bridge node on the perimeter (fixed angle offset)
    // and pull it to the mouse — the GearPerimeterPin rotates the gear angle.
    positions.set(GRAB_PERIMETER_KEY, new Point2(grab.target.x, grab.target.y));
    links = [
      ...model.links,
      {
        type: "GearPerimeterPin",
        ddl: 2,
        nodeKey: GRAB_PERIMETER_KEY,
        centerKey: model.keyMap.get(grab.gearID) ?? grab.gearID,
        angleKey: grab.gearID,
        radius: grab.radius,
        offset: grab.angleOffset,
      },
      {
        type: "HandleGrab",
        ddl: 1,
        grabbedKey: "grab_perimeter",
        value: grab.target,
      },
    ];
  } else if (grab && "beltPin" in grab) {
    // Grab an arbitrary point of a closed belt: place a bridge node at the mouse,
    // pin it to the loop at the grabbed arc-length (BeltPin), and pull it there —
    // the pin advances the belt travel so the loop rotates with the point under
    // the cursor. gearPosKeys were built unfused (grab start) → remap to the fused
    // sim keys; refresh the per-frame wraps/disconnected from the belt.
    const src = grab.beltPin;
    const remap = (k: string) => model.keyMap.get(k) ?? k;
    const pin: Extract<Link, { type: "BeltPin" }> = {
      ...src,
      gearPosKeys: src.gearPosKeys.map(remap),
      startKey: src.startKey ? remap(src.startKey) : undefined,
      endKey: src.endKey ? remap(src.endKey) : undefined,
      wraps: wrapsByBelt.get(src.beltID),
      disconnected: disconnectedByBelt.get(src.beltID),
    };
    positions.set(pin.nodeKey, new Point2(grab.target.x, grab.target.y));
    links = [
      ...model.links,
      pin,
      {
        type: "HandleGrab",
        ddl: 1,
        grabbedKey: pin.nodeKey,
        value: grab.target,
      },
    ];
  } else if (grab) {
    // A belt terminal that is dragged into its adjacent gear is pushed back out by the
    // BeltLength constraint's radial non-penetration term (symmetric: it moves the gear
    // too) — no pre-clamp of the grab target needed.
    const grabKey = model.keyMap.get(grab.key) ?? grab.key;
    links = [
      ...model.links,
      { type: "HandleGrab", ddl: 1, grabbedKey: grabKey, value: grab.target },
    ];
  }

  // ── PBD solve ──
  const result = PBD_kinematic_solver(
    positions,
    new Map<string, number>(),
    model.nodes.posMasses,
    new Map<string, number>(),
    links,
    sweeps,
    undefined,
    angles,
    collectDiagnostics,
  );

  // ── Belt topology changed this frame → rebuild its no-slip links, AFTER the solve ──
  // The bake has to happen on a state the other constraints agree with. Baking on the
  // warm start, before the solve, freezes into `h⁰` whatever the frame was about to
  // correct: measured on `Déconnexion courroie`, a 26 px lurch on the transition frame
  // and 1.3 px of residual that never went away afterwards.
  if (beltsToRewire.length > 0 && beltContact.rebuildQLinks) {
    for (const belt of beltsToRewire)
      model.links = sort_links(
        rebuild_belt_q_links(
          model.links,
          belt,
          result.positions,
          result.angles,
        ),
        model.nodes.posMasses,
      );
  }

  // ── Into the snapshot's slots, fused keys decoupled back to one slot per original key ──
  const layout = model.layout;
  const { keys: fusedKeys, start, slots } = model.fill;
  const outPositions = new Float64Array(layout.keys.length * 2);
  for (let i = 0; i < fusedKeys.length; i++) {
    const p = result.positions.get(fusedKeys[i]);
    const x = p ? p.x : NaN;
    const y = p ? p.y : NaN;
    for (let s = start[i]; s < start[i + 1]; s++) {
      outPositions[2 * slots[s]] = x;
      outPositions[2 * slots[s] + 1] = y;
    }
  }
  // The reserved grab slots: only the bridge node this frame's own grab added, if any.
  for (const key of GRAB_KEYS) {
    const slot = layout.index.get(key)!;
    const p = result.positions.get(key);
    outPositions[2 * slot] = p ? p.x : NaN;
    outPositions[2 * slot + 1] = p ? p.y : NaN;
  }

  const outAngles = new Float64Array(angles_length(layout));
  for (let i = 0; i < layout.angleKeys.length; i++) {
    const a = result.angles.get(layout.angleKeys[i]);
    outAngles[i] = a === undefined ? NaN : a;
  }
  // Then each belt's per-pulley wrap angles, the pulleys it has lost contact with, and the
  // arrival rim angles. Together they are the belt's whole per-frame state, which is what
  // lets a recording be resumed on any recorded instant.
  layout.belts.forEach((id, r) => {
    const wraps = wrapsByBelt.get(id);
    const arrivals = arrivalsByBelt.get(id);
    const disconnected = disconnectedByBelt.get(id);
    for (let p = layout.beltStart[r]; p < layout.beltStart[r + 1]; p++) {
      const k = p - layout.beltStart[r];
      outAngles[layout.wrapBase + p] = wraps ? wraps[k] : NaN;
      outAngles[layout.detachBase + p] = disconnected?.[k] ? 1 : 0;
      outAngles[layout.arrivalBase + p] = arrivals ? arrivals[k] : NaN;
    }
  });

  // ── Motor-block detection ──
  // The motor's own constraint residual stays tiny when blocked (target =
  // current + ω·dt, no backlog), so a generic residual threshold misses it.
  // Instead compare what the driver actually advanced this frame against its
  // commanded increment: well below it ⇒ blocked.
  const motorBlocks: ConstraintResidual[] = [];
  for (const m of motorChecks) {
    let achieved: number | undefined;
    // How far the driver reaches, so its shortfall can be reported as the arc it failed to
    // sweep rather than as a bare angle — the same scale every other residual is on.
    let lever = 1;
    if (m.type === "MotorBeam") {
      const p = result.positions.get(m.pivotKey!);
      const d = result.positions.get(m.drivenKey!);
      if (p && d) {
        achieved = wrap_angle(d.sub(p).angle() - m.cur);
        lever = d.distance_to(p);
      }
    } else {
      const a = result.angles.get(m.angleKey!);
      if (a !== undefined) {
        achieved = wrap_angle(a - m.cur);
        lever = model.gearRadii.get(m.angleKey as ID) ?? 1;
      }
    }
    if (achieved === undefined) continue;
    if (Math.abs(achieved) < Math.abs(m.expected) * MOTOR_BLOCK_FRACTION)
      motorBlocks.push({
        owner: m.owner,
        type: m.type,
        residual: Math.abs(m.expected - achieved) * lever,
      });
  }

  const unsatisfied = [...motorBlocks, ...(result.unsatisfied ?? [])];

  return {
    t,
    layout,
    positions: outPositions,
    angles: outAngles,
    unsatisfied: unsatisfied.length > 0 ? unsatisfied : undefined,
  };
}

/**
 * The snapshot to draw at time `t`, interpolated between the two it falls between.
 *
 * Recording runs at a fixed `RECORD_DT` whatever the playback speed, so below ×1 the same
 * snapshot would otherwise be drawn several times in a row and the motion reads as
 * stepping. Interpolating decouples smoothness from the recording rate, at no solver cost.
 *
 * Two states that each satisfy the constraints do not average into one that does — a beam
 * gets marginally shorter across the interpolation. The error is second-order in the step
 * and measured in `snapshot-interpolation.test.ts`; it is not a solve, only a drawing.
 *
 * Topology is never interpolated: across a frame where a pulley leaves or rejoins a belt,
 * the earlier snapshot is held rather than drawing a half-detached belt.
 */
export function snapshot_at(
  snapshots: KinematicSnapshot[],
  t: number,
): KinematicSnapshot | null {
  if (snapshots.length === 0) return null;
  const i = snapshot_index_at(snapshots, t);
  if (i >= snapshots.length - 1) return snapshots[snapshots.length - 1];
  const a = snapshots[i];
  const b = snapshots[i + 1];
  const span = b.t - a.t;
  const u = span > 0 ? (t - a.t) / span : 0;
  if (u <= 0) return a;
  // Slot i means one thing on each side of an edit, so two layouts never average.
  if (a.layout !== b.layout) return a;
  if (!same_belt_topology(a, b)) return a;

  const positions = new Float64Array(a.positions.length);
  for (let i = 0; i < positions.length; i++)
    positions[i] = a.positions[i] + (b.positions[i] - a.positions[i]) * u;
  // Belt wraps are continuous like the angles and share their array, so they interpolate in
  // the same pass. The contact flags do too, harmlessly: the topology check above is what
  // guarantees they are equal on both sides, so they come out unchanged.
  const angles = new Float64Array(a.angles.length);
  for (let i = 0; i < angles.length; i++)
    angles[i] = a.angles[i] + (b.angles[i] - a.angles[i]) * u;
  return {
    t,
    layout: a.layout,
    positions,
    angles,
    // Diagnostics belong to a state the solver actually produced.
    unsatisfied: a.unsatisfied,
  };
}

/**
 * Does a cursor placed at `t` sit at the live end of the recording, rather than behind it?
 *
 * This compares times, which the recording loop must never do: while recording, the
 * frontier runs ahead of the cursor by an amount that varies frame to frame. It is sound
 * **here and only here** — it answers at the instant the user drops the cursor, playback
 * stopped and the frontier still.
 */
export function at_recording_end(
  snapshots: KinematicSnapshot[],
  t: number,
): boolean {
  if (snapshots.length === 0) return true;
  return t >= snapshots[snapshots.length - 1].t - RETAIN_DT / 2;
}

/**
 * Index of the last snapshot recorded at or before `t`, by binary search rather than by
 * dividing the time axis — the search is correct whether or not the spacing is uniform,
 * and nothing downstream then has to be revisited if it ever stops being. Clamped to the
 * array.
 */
export function snapshot_index_at(
  snapshots: KinematicSnapshot[],
  t: number,
): number {
  let lo = 0;
  let hi = snapshots.length - 1;
  if (hi < 0 || t <= snapshots[0].t) return 0;
  if (t >= snapshots[hi].t) return hi;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (snapshots[mid].t <= t) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * The parameter snapshot in effect at `t`: the last edit made at or before it. A recording
 * always carries at least the `t: 0` entry seeded when it started, so this only returns
 * `null` outside a simulation (an empty log).
 */
export function parameter_snapshot_at(
  snapshots: ParameterSnapshot[],
  t: number,
): ParameterSnapshot | null {
  if (snapshots.length === 0) return null;
  let lo = 0;
  let hi = snapshots.length - 1;
  if (t <= snapshots[0].t) return snapshots[0];
  if (t >= snapshots[hi].t) return snapshots[hi];
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (snapshots[mid].t <= t) lo = mid;
    else hi = mid;
  }
  return snapshots[lo];
}

/** Same pulleys detached on both sides. Only sound on one layout, where the flags of a
 *  given pulley are the same slot on both sides. */
function same_belt_topology(
  a: KinematicSnapshot,
  b: KinematicSnapshot,
): boolean {
  // The flag block alone. The arrival angles that follow it are continuous like the wraps,
  // so comparing them would find every pair of instants different and never interpolate.
  for (let i = a.layout.detachBase; i < a.layout.arrivalBase; i++)
    if (a.angles[i] !== b.angles[i]) return false;
  return true;
}

/**
 * Apply a kinematic snapshot's positions/angles to a mechanism copy for
 * rendering. Does NOT modify the original mechanism (editing state). Radii are
 * unchanged in simulation, so gears keep their edit-time radius.
 */
export function apply_snapshot_to_mechanism(
  mechanism: Mechanism,
  snapshot: KinematicSnapshot,
): Mechanism {
  const newElements = mechanism.mechanicalElements.map((el) => {
    if ("position" in el) {
      const pos = snapshot_point(snapshot, el.id);
      if (!pos) return el;
      if (el.type === "gear") {
        const ang = snapshot_angle(snapshot, el.id);
        return {
          ...el,
          position: pos,
          ...(ang !== undefined ? { angle: ang } : {}),
        };
      }
      return { ...el, position: pos };
    } else {
      const start = snapshot_point(snapshot, `${el.id}:start`);
      const end = snapshot_point(snapshot, `${el.id}:end`);
      // Springs/dampers: freeze the natural (rest) length — the user's typed
      // value for a spring, else the edit-time positions — so the drawing
      // keeps a fixed coil/piston count while the simulated length stretches
      // or compresses.
      const restLength =
        el.type === "spring" || el.type === "damper"
          ? (el.restLength ?? el.positionStart.distance_to(el.positionEnd))
          : undefined;
      const disconnectedGearIndices =
        el.type === "belt"
          ? snapshot_belt_detached(snapshot, el.id)
          : undefined;
      const gearWraps =
        el.type === "belt" ? snapshot_belt_wraps(snapshot, el.id) : undefined;
      return {
        ...el,
        ...(start ? { positionStart: start } : {}),
        ...(end ? { positionEnd: end } : {}),
        ...(restLength !== undefined ? { restLength } : {}),
        ...(disconnectedGearIndices !== undefined
          ? { disconnectedGearIndices }
          : {}),
        ...(gearWraps !== undefined ? { gearWraps } : {}),
      };
    }
  });

  return { ...mechanism, mechanicalElements: newElements };
}

/**
 * Apply a parameter snapshot's motor/load values to a mechanism copy for rendering — the
 * configuration in effect at that instant, distinct from whatever was last edited. Touches
 * only the fields a parameter edit can change (`SetMotorConfig`, `ChangeForce`,
 * `ChangeDistributedForce`, `ChangeMoment`, `SetLoadFrame`); geometry is untouched, so this
 * composes after `apply_snapshot_to_mechanism` without undoing it.
 */
export function apply_parameter_snapshot_to_mechanism(
  mechanism: Mechanism,
  snapshot: ParameterSnapshot,
): Mechanism {
  const motorByID = new Map(
    snapshot.mechanicalElements
      .filter((el): el is PivotElement => el.type === "pivot")
      .map((el) => [el.id, el.motor]),
  );
  const loadByID = new Map(snapshot.loads.map((load) => [load.id, load]));

  const newElements = mechanism.mechanicalElements.map((el) => {
    if (el.type !== "pivot" || !motorByID.has(el.id)) return el;
    return { ...el, motor: motorByID.get(el.id) };
  });

  const newLoads = mechanism.loads.map((load) => {
    const shown = loadByID.get(load.id);
    if (!shown) return load;
    if (load.type === "force" && shown.type === "force")
      return { ...load, vector: shown.vector, frame: shown.frame };
    if (load.type === "distributed-force" && shown.type === "distributed-force")
      return {
        ...load,
        direction: shown.direction,
        magnitudeStart: shown.magnitudeStart,
        magnitudeEnd: shown.magnitudeEnd,
        frame: shown.frame,
      };
    if (load.type === "moment" && shown.type === "moment")
      return { ...load, value: shown.value };
    return load;
  });

  return { ...mechanism, mechanicalElements: newElements, loads: newLoads };
}

export { RECORD_DT };
