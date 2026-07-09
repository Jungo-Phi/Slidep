import { ID, Link, Mechanism, Point2, KinNodes } from "../../types";
import { BeltVia, belt_wraps } from "../../utils/belt-path";
import {
  ConstraintResidual,
  KinematicSnapshot,
} from "../../types/runtime-state";
import { get_links_simulation, get_sim_nodes } from "./parsing";
import { PBD_kinematic_solver } from "./PBD_kinematic_solver";
import { sort_links } from "./utils";

const RECORD_DT = 1 / 120; // 120 fps of simulated time

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
  | { gearID: string; angleOffset: number; radius: number; target: Point2 };

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
function update_belt_disconnects(
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
  const offset = link.closed ? 0 : 1; // via index of the first pulley
  const seeding = !link.wraps;
  if (!link.wraps) link.wraps = new Array(n).fill(0);
  const TAU = 2 * Math.PI;
  // A pulley an end is pinned on can't detach (belt anchored to it), and the
  // last remaining pulley is never dropped (a gearless belt is degenerate).
  const startPos = link.closed ? undefined : positions.get(link.startKey);
  const endPos = link.closed ? undefined : positions.get(link.endKey);
  const pinnedOn = (gi: number): boolean => {
    const gc = positions.get(link.gearPosKeys[gi]);
    if (!gc) return false;
    return [startPos, endPos].some(
      (p) => p && p.distance_to(gc) <= link.radii[gi] + 1,
    );
  };
  activeIdx.forEach((gi, k) => {
    const rawW = raw[offset + k];
    if (seeding) {
      link.wraps![gi] = rawW; // first frame: seed, never disconnect
      return;
    }
    let delta = rawW - (((link.wraps![gi] % TAU) + TAU) % TAU);
    while (delta > Math.PI) delta -= TAU;
    while (delta <= -Math.PI) delta += TAU;
    const cont = link.wraps![gi] + delta;
    link.wraps![gi] = cont;
    if (
      cont <= 0 &&
      !link.disconnected![gi] &&
      activeIdx.length > 1 &&
      !pinnedOn(gi)
    ) {
      link.disconnected![gi] = true;
      newlyDisconnected = true;
    }
  });
  return newlyDisconnected;
}

/**
 * Drop the belt links of pulleys that have just disconnected. With the shared
 * travel φ this is trivial: remove the disconnected pulley's BeltPhaseGear (it
 * stops being driven) — every other pulley (and the belt's free ends) stays
 * coupled to the SAME φ, so transmission continues past it with no rebuild.
 * Reset on recompile.
 */
export function rewire_belt_mesh(
  links: Link[],
  belts: Extract<Link, { type: "BeltLength" }>[],
): Link[] {
  const disconnectedAngleKeys = new Set<string>();
  for (const b of belts)
    b.disconnected?.forEach((d, i) => {
      if (!d) return;
      disconnectedAngleKeys.add(b.gearAngleKeys[i]);
    });
  return links.filter((l) => {
    // A disconnected pulley just loses its no-slip coupling; every other pulley
    // (and the belt's free ends) stays on the same φ, so transmission continues.
    if (l.type === "BeltPhaseGear" && disconnectedAngleKeys.has(l.angleKey))
      return false;
    return true;
  });
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

  // A pulley just lost contact → rebuild the affected belts' transmission chain
  // so it stops being driven while its neighbours stay coupled. Permanent for
  // the run (model mutated; reset on recompile).
  if (beltsToRewire.length > 0)
    model.links = rewire_belt_mesh(model.links, beltsToRewire);

  // Share each belt's continuous wraps (tracked on its BeltLength link) with its
  // BeltPin (tight) / BeltFreeEnds (loose), so a wound pulley/terminal travels
  // around >2π smoothly, not just the fractional arc. gearPosKeys order matches.
  const wrapsByBelt = new Map<ID, number[]>();
  for (const link of model.links)
    if (link.type === "BeltLength" && link.owner !== undefined && link.wraps)
      wrapsByBelt.set(link.owner, link.wraps);
  for (const link of model.links)
    if (
      (link.type === "BeltPin" || link.type === "BeltFreeEnds") &&
      link.owner !== undefined
    )
      link.wraps = wrapsByBelt.get(link.owner);

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
  } else if (grab) {
    links = [
      ...model.links,
      {
        type: "HandleGrab",
        ddl: 1,
        grabbedKey: model.keyMap.get(grab.key) ?? grab.key,
        value: grab.target,
      },
    ];
  }

  // ── PBD solve ──
  const result = PBD_kinematic_solver(
    positions,
    new Map<string, number>(),
    model.nodes.posMasses,
    new Map<string, number>(),
    links,
    300,
    undefined,
    angles,
    true, // collect unsatisfied-constraint diagnostics
  );

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
