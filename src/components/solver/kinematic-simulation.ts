import { ID, Link, Mechanism, Point2, SimNodes } from "../../types";
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
  nodes: SimNodes;
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
  ]) {
    if (typeof l[f] === "string") l[f] = from(l[f] as string);
  }
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
    }
  });

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

  return {
    t,
    positions: outPositions,
    angles: new Map(result.angles),
    unsatisfied: unsatisfied.length > 0 ? unsatisfied : undefined,
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
      return {
        ...el,
        ...(start ? { positionStart: start } : {}),
        ...(end ? { positionEnd: end } : {}),
        ...(restLength !== undefined ? { restLength } : {}),
      };
    }
  });

  return { ...mechanism, mechanicalElements: newElements };
}

export { RECORD_DT };
