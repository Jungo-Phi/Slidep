import { ID, Link, Mechanism, Point2, KinNodes } from "../../types";
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
} from "../../types/runtime-state";
import {
  belt_q_links,
  get_links_simulation,
  get_sim_nodes,
  mark_passive_belt_pins,
  rebuild_belt_q_links,
} from "./parsing";
import { PBD_kinematic_solver } from "./PBD_kinematic_solver";
import { sort_links } from "./utils";

const RECORD_DT = 1 / 120; // 120 fps of simulated time

/**
 * Wall-clock milliseconds the recording loop may spend inside one displayed frame.
 * Under a 16.7 ms frame, so the display keeps its own time; a step that outlasts
 * it on its own still runs to completion, since a partial step is not a state.
 */
export const FRAME_BUDGET_MS = 8;

/**
 * The simulated step to record, to advance `requestedDt` of simulated time within
 * one frame budget, given what a step currently costs.
 *
 * Real time is what the playback speed promises, so it is the step that gives way,
 * not the clock: the solver being incremental (`ω·dt`), the only way to advance
 * faster than it can afford is to solve fewer, coarser instants. Never finer than
 * `RECORD_DT` — past that the fidelity is free but the memory is not.
 *
 * **This makes the recording machine-dependent**: the same run records coarser
 * snapshots on a slower machine, or under load. That is the accepted price of
 * honouring the requested speed — the trajectory error grows linearly with the
 * step, so a recording produced under load is proportionally less faithful.
 *
 * Saturates on its own: once one step outlasts the budget, `affordable` sticks at
 * 1 and the step stops growing beyond the frame's own request.
 */
export function recording_step(
  requestedDt: number,
  stepCostMs: number,
  budgetMs: number = FRAME_BUDGET_MS,
): number {
  const affordable = Math.max(
    1,
    Math.floor(budgetMs / Math.max(stepCostMs, 1e-3)),
  );
  return Math.max(RECORD_DT, requestedDt / affordable);
}

/**
 * How much of the ceiling a clean step gives back. A quarter per step: a mechanism that
 * stops resisting recovers its fast-forward in a handful of frames instead of staying
 * pinned by one bad moment.
 */
const CEILING_RELAX = 0.8;

/**
 * The coarsest step the recording may take next, from what the last one left violated.
 *
 * A coarse step tears the constraints of a mechanism that **resists** — one at a dead point,
 * or losing a pulley. Measured (`plan-fluidite.md`, chantier 2): the violation is exactly
 * proportional to the step, and it appears between 1/120 and 1/60, which is where the belt
 * links stop holding. So the step that would put the worst constraint back at its reporting
 * threshold is the current one divided by how far past it we are — one division, no search,
 * and it converges in a single frame because the relation is linear.
 *
 * Mechanisms that violate nothing (they follow their motor rather than resisting it) are
 * never capped: they keep the full playback speed however coarse the step gets.
 *
 * Never finer than `RECORD_DT`: past it the step costs more without buying anything, and a
 * mechanism blocked for real must keep reporting the blockage, which is its own signal.
 */
export function step_ceiling(stepDt: number, severity: number): number {
  return Math.max(RECORD_DT, stepDt / Math.max(severity, CEILING_RELAX));
}

/** Gauss-Seidel sweeps per frame. Raise it only from a measurement bench. */
const DEFAULT_SWEEPS = 200;

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
};

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
 * Per-frame belt-contact update (mutates the BeltLength link's sim state):
 * tracks each still-connected pulley's continuous (unwrapped) wrap angle and, as
 * soon as it crosses to ≤ 0 (contact lost), marks the pulley disconnected —
 * irreversibly for the run (reset on recompile). The belt then runs straight
 * past it (BeltLength skips it; the geometry of the remaining pulleys uses the
 * reduced loop/chain).
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
    vias.push({ pos: s, radius: 0, direction: false });
  }
  for (let i = 0; i < n; i++) {
    if (link.disconnected[i]) continue;
    const pos = positions.get(link.gearPosKeys[i]);
    if (!pos) return false;
    activeIdx.push(i);
    vias.push({ pos, radius: link.radii[i], direction: link.directions[i] });
  }
  if (!link.closed) {
    const e = positions.get(link.endKey);
    if (!e) return false;
    vias.push({ pos: e, radius: 0, direction: false });
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
      vias.push({ pos, radius: link.radii[i], direction: link.directions[i] });
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
      vias.push({ pos, radius: belt.radii[i], direction: belt.directions[i] });
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

  return { nodes, links, keyMap };
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
  prevPositions: Map<string, Point2> | null,
  prevAngles: Map<string, number> | null,
  dt: number = RECORD_DT,
  grab?: SimGrab,
  sweeps: number = DEFAULT_SWEEPS,
  /** Off only to measure what the collection itself costs; production reads it. */
  collectDiagnostics: boolean = true,
): KinematicSnapshot {
  const positions = new Map(model.nodes.positions);
  const angles = new Map(model.nodes.angles);

  // ── Warm start (fused keys take the previous position of any of their parts) ──
  if (prevPositions) {
    positions.forEach((_, fusedKey) => {
      const part = fusedKey.split(",")[0];
      const p = prevPositions.get(part) ?? prevPositions.get(fusedKey);
      if (p) positions.set(fusedKey, new Point2(p.x, p.y));
    });
  }
  if (prevAngles) {
    angles.forEach((_, key) => {
      const a = prevAngles.get(key);
      if (a !== undefined) angles.set(key, a);
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
        link.targetAngle = cur + link.omega * dt;
        if (link.owner !== undefined && link.omega * dt !== 0)
          motorChecks.push({
            owner: link.owner,
            type: "MotorBeam",
            cur,
            expected: link.omega * dt,
            pivotKey: link.pivotKey,
            drivenKey: link.drivenKey,
          });
      }
    } else if (link.type === "MotorAngle") {
      const cur = angles.get(link.angleKey);
      if (cur !== undefined) {
        link.targetAngle = cur + link.omega * dt;
        if (link.owner !== undefined && link.omega * dt !== 0)
          motorChecks.push({
            owner: link.owner,
            type: "MotorAngle",
            cur,
            expected: link.omega * dt,
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
  const disconnectedByBelt = new Map<ID, boolean[]>();
  for (const link of model.links)
    if (link.type === "BeltLength" && link.owner !== undefined) {
      if (link.wraps) wrapsByBelt.set(link.owner, link.wraps);
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
    positions.set("grab_bridge", new Point2(grab.target.x, grab.target.y));
    links = [
      ...model.links,
      {
        type: "FixedOnSegment",
        ddl: 2,
        key1: startKey,
        key2: endKey,
        key3: "grab_bridge",
        t: grab.t,
      },
      {
        type: "HandleGrab",
        ddl: 1,
        grabbedKey: "grab_bridge",
        value: grab.target,
      },
    ];
  } else if (grab && "gearID" in grab) {
    // Gear-tooth grab: pin a bridge node on the perimeter (fixed angle offset)
    // and pull it to the mouse — the GearPerimeterPin rotates the gear angle.
    positions.set("grab_perimeter", new Point2(grab.target.x, grab.target.y));
    links = [
      ...model.links,
      {
        type: "GearPerimeterPin",
        ddl: 2,
        nodeKey: "grab_perimeter",
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

  // ── Decouple fused keys back to individual keys ──
  const outPositions = new Map<string, Point2>();
  result.positions.forEach((p, fusedKey) => {
    fusedKey.split(",").forEach((k) => outPositions.set(k, p));
  });

  // ── Motor-block detection ──
  // The motor's own constraint residual stays tiny when blocked (target =
  // current + ω·dt, no backlog), so a generic residual threshold misses it.
  // Instead compare what the driver actually advanced this frame against its
  // commanded increment: well below it ⇒ blocked.
  const motorBlocks: ConstraintResidual[] = [];
  for (const m of motorChecks) {
    let achieved: number | undefined;
    if (m.type === "MotorBeam") {
      const p = result.positions.get(m.pivotKey!);
      const d = result.positions.get(m.drivenKey!);
      if (p && d) achieved = wrap_angle(d.sub(p).angle() - m.cur);
    } else {
      const a = result.angles.get(m.angleKey!);
      if (a !== undefined) achieved = wrap_angle(a - m.cur);
    }
    if (achieved === undefined) continue;
    if (Math.abs(achieved) < Math.abs(m.expected) * MOTOR_BLOCK_FRACTION)
      motorBlocks.push({
        owner: m.owner,
        type: m.type,
        residual: Math.abs(m.expected - achieved),
      });
  }

  const unsatisfied = [...motorBlocks, ...(result.unsatisfied ?? [])];

  // Collect per-belt disconnected pulleys and continuous wrap angles (for drawing).
  let disconnectedBeltGears: Map<ID, number[]> | undefined;
  let beltWraps: Map<ID, number[]> | undefined;
  for (const link of model.links) {
    if (link.type !== "BeltLength" || link.owner === undefined) continue;
    const idx = (link.disconnected ?? [])
      .map((d, i) => (d ? i : -1))
      .filter((i) => i >= 0);
    if (idx.length > 0)
      (disconnectedBeltGears ??= new Map()).set(link.owner, idx);
    if (link.wraps) (beltWraps ??= new Map()).set(link.owner, [...link.wraps]);
  }

  return {
    t,
    positions: outPositions,
    angles: new Map(result.angles),
    unsatisfied: unsatisfied.length > 0 ? unsatisfied : undefined,
    disconnectedBeltGears,
    beltWraps,
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
  if (!same_belt_topology(a, b)) return a;

  const positions = new Map<string, Point2>();
  a.positions.forEach((pa, key) => {
    const pb = b.positions.get(key);
    positions.set(
      key,
      pb
        ? new Point2(pa.x + (pb.x - pa.x) * u, pa.y + (pb.y - pa.y) * u)
        : pa.clone(),
    );
  });
  const angles = new Map<string, number>();
  a.angles.forEach((va, key) => {
    const vb = b.angles.get(key);
    angles.set(key, vb === undefined ? va : va + (vb - va) * u);
  });
  // Wraps are continuous (unwrapped) like the angles, so they interpolate the same way.
  let beltWraps: Map<ID, number[]> | undefined;
  if (a.beltWraps) {
    beltWraps = new Map<ID, number[]>();
    a.beltWraps.forEach((wa, id) => {
      const wb = b.beltWraps?.get(id);
      beltWraps!.set(
        id,
        wb && wb.length === wa.length
          ? wa.map((v, k) => v + (wb[k] - v) * u)
          : wa.slice(),
      );
    });
  }
  return {
    t,
    positions,
    angles,
    // Diagnostics and topology belong to a state the solver actually produced.
    unsatisfied: a.unsatisfied,
    disconnectedBeltGears: a.disconnectedBeltGears,
    beltWraps,
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
  step: number,
): boolean {
  if (snapshots.length === 0) return true;
  return t >= snapshots[snapshots.length - 1].t - step / 2;
}

/**
 * Index of the last snapshot recorded at or before `t`, by binary search — the
 * recording is not uniformly spaced (see `recording_step`), so the time axis has
 * to be searched rather than divided. Clamped to the array.
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

/** Same pulleys detached on both sides, belt by belt. */
function same_belt_topology(
  a: KinematicSnapshot,
  b: KinematicSnapshot,
): boolean {
  const da = a.disconnectedBeltGears;
  const db = b.disconnectedBeltGears;
  if (!da && !db) return true;
  if (!da || !db || da.size !== db.size) return false;
  for (const [id, indices] of da) {
    const other = db.get(id);
    if (!other || other.length !== indices.length) return false;
    for (let k = 0; k < indices.length; k++)
      if (other[k] !== indices[k]) return false;
  }
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
      const pos = snapshot.positions.get(el.id);
      if (!pos) return el;
      if (el.type === "gear") {
        const ang = snapshot.angles.get(el.id);
        return {
          ...el,
          position: pos,
          ...(ang !== undefined ? { angle: ang } : {}),
        };
      }
      return { ...el, position: pos };
    } else {
      const start = snapshot.positions.get(`${el.id}:start`);
      const end = snapshot.positions.get(`${el.id}:end`);
      // Springs/dampers: freeze the natural (rest) length from the edit-time
      // positions so the drawing keeps a fixed coil/piston count while the
      // simulated length stretches or compresses.
      const restLength =
        el.type === "spring" || el.type === "damper"
          ? el.positionStart.distance_to(el.positionEnd)
          : undefined;
      const disconnectedGearIndices =
        el.type === "belt"
          ? snapshot.disconnectedBeltGears?.get(el.id)
          : undefined;
      const gearWraps =
        el.type === "belt" ? snapshot.beltWraps?.get(el.id) : undefined;
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

export { RECORD_DT };
