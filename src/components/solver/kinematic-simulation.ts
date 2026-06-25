import { GearElement, ID, Mechanism, Point2 } from "../../types";
import { KinematicSnapshot } from "../../types/runtime-state";
import { get_links, get_nodes } from "./parsing";
import { PBD_kinematic_solver } from "./PBD_kinematic_solver";
import { sort_links } from "./utils";

const RECORD_DT = 1 / 30; // 30 fps of simulated time

/** Compute cumulative gear rotation angles at time t, propagating from motor pivots. */
function compute_gear_angles(mechanism: Mechanism, t: number): Map<ID, number> {
  const angles = new Map<ID, number>();
  const visited = new Set<ID>();
  const queue: { gearId: ID; omega: number }[] = [];

  mechanism.mechanicalElements.forEach((el) => {
    if (el.type !== "pivot" || !el.motor) return;
    const omega = el.motor.speed * ((2 * Math.PI) / 60); // rad/s
    el.fixedGearsIDs.forEach((gearId) => {
      if (!visited.has(gearId)) queue.push({ gearId, omega });
    });
  });

  while (queue.length > 0) {
    const item = queue.shift()!;
    if (visited.has(item.gearId)) continue;
    visited.add(item.gearId);

    angles.set(item.gearId, item.omega * t);

    const gear = mechanism.mechanicalElements.find(
      (e) => e.id === item.gearId && e.type === "gear",
    ) as GearElement | undefined;
    if (!gear) continue;

    gear.meshedGearsIDs.forEach((meshedId) => {
      if (visited.has(meshedId)) return;
      const meshedGear = mechanism.mechanicalElements.find(
        (e) => e.id === meshedId && e.type === "gear",
      ) as GearElement | undefined;
      if (!meshedGear) return;
      const meshedOmega = -item.omega * (gear.radius / meshedGear.radius);
      queue.push({ gearId: meshedId, omega: meshedOmega });
    });
  }

  return angles;
}

/**
 * Compute the kinematic snapshot at pseudo-time t.
 *
 * Mirrors the geometric-solver pipeline:
 *  1. Warm-start positions from the previous snapshot
 *  2. Pin motor-driven beam endpoints
 *  3. Fuse coincidence links (same as resolveGeometricConstraints)
 *  4. Sort links (anchored nodes first)
 *  5. PBD solve
 *  6. Decouple fused keys back to original format
 */
export function compute_kinematic_snapshot(
  mechanism: Mechanism,
  t: number,
  prevSnapshot: KinematicSnapshot | null,
): KinematicSnapshot {
  const nodes = get_nodes(mechanism.mechanicalElements);
  let links = get_links(
    mechanism.mechanicalElements,
    mechanism.constraintElements,
  );

  // Add a rigid-length constraint for every beam that doesn't already have one.
  // dimension-edge constraints produce Distance links on the same key pair, so
  // we track those first to avoid duplicates.
  const distancePairs = new Set<string>();
  links.forEach((link) => {
    if (link.type === "Distance") {
      distancePairs.add(`${link.key1}|${link.key2}`);
      distancePairs.add(`${link.key2}|${link.key1}`);
    }
  });
  mechanism.mechanicalElements.forEach((el) => {
    if (el.type !== "beam") return;
    const k1 = `${el.id}:start`;
    const k2 = `${el.id}:end`;
    if (!distancePairs.has(`${k1}|${k2}`)) {
      links.push({
        type: "Distance",
        ddl: 1,
        key1: k1,
        key2: k2,
        distance: el.positionEnd.sub(el.positionStart).length(),
      });
    }
  });

  // ── 1. Warm start ─────────────────────────────────────────
  if (prevSnapshot) {
    prevSnapshot.positions.forEach((pos, key) => {
      if (nodes.positions.has(key)) {
        nodes.positions.set(key, new Point2(pos.x, pos.y));
      }
    });
    prevSnapshot.radii.forEach((rad, key) => {
      if (nodes.radii.has(key)) nodes.radii.set(key, rad);
    });
  }

  // ── 2. Motor constraints: pin driven beam endpoints ───────
  // Only grounded motors (parentBeamID === undefined) for now.
  mechanism.mechanicalElements.forEach((el) => {
    if (el.type !== "pivot" || !el.motor) return;
    if (el.motor.parentBeamID !== undefined) return;

    const omega = el.motor.speed * ((2 * Math.PI) / 60); // rad/s

    el.rotatingEdgesIDs.forEach((beamId) => {
      const beam = mechanism.mechanicalElements.find((b) => b.id === beamId);
      if (!beam || !("positionStart" in beam)) return;

      let pivotKey: string;
      let drivenKey: string;
      let initialDir: Point2;

      if (beam.fixedNodeStartID === el.id) {
        pivotKey = `${beamId}:start`;
        drivenKey = `${beamId}:end`;
        initialDir = beam.positionEnd.sub(beam.positionStart);
      } else if (beam.fixedNodeEndID === el.id) {
        pivotKey = `${beamId}:end`;
        drivenKey = `${beamId}:start`;
        initialDir = beam.positionStart.sub(beam.positionEnd);
      } else {
        return;
      }

      const L = initialDir.length();
      if (L < 1e-6) return;

      const theta0 = Math.atan2(initialDir.y, initialDir.x);
      const theta = theta0 + omega * t;

      const pivotPos = nodes.positions.get(pivotKey) ?? el.position;
      const targetPos = pivotPos.add(
        new Point2(Math.cos(theta) * L, Math.sin(theta) * L),
      );

      nodes.positions.set(drivenKey, targetPos);
      nodes.posMasses.set(drivenKey, 0); // pin at motor-computed position
    });
  });

  // ── 3. Fuse coincidence links ──────────────────────────────
  // Critical for connection integrity: merges coincident node/edge-endpoint pairs
  // into a single solver key so they are guaranteed to stay at the same position.
  // Mirrors the Phase B fusion in resolveGeometricConstraints.
  links.forEach((lc) => {
    if (lc.type !== "Coincidence") return;
    const k1 = lc.key1;
    const k2 = lc.key2;
    const k_new = [k1, k2].join(",");

    links.forEach((link) => {
      if ("key1" in link && (link.key1 === k1 || link.key1 === k2))
        link.key1 = k_new;
      if ("key2" in link && (link.key2 === k1 || link.key2 === k2))
        link.key2 = k_new;
      if ("key3" in link && (link.key3 === k1 || link.key3 === k2))
        link.key3 = k_new;
      if ("key4" in link && (link.key4 === k1 || link.key4 === k2))
        link.key4 = k_new;
    });

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
  });
  links = links.filter((link) => link.type !== "Coincidence");

  // ── 4. Sort links (anchored nodes first for better convergence) ──
  links = sort_links(links, nodes.posMasses);

  // ── 5. PBD solve ──────────────────────────────────────────
  const result = PBD_kinematic_solver(
    nodes.positions,
    nodes.radii,
    nodes.posMasses,
    nodes.radMasses,
    links,
    300,
  );

  // ── 6. Decouple fused keys back to original format ────────
  [...result.positions.keys()].forEach((combined) => {
    const keys = combined.split(",");
    if (keys.length > 1) {
      const pos = result.positions.get(combined)!;
      keys.forEach((key) => result.positions.set(key, pos));
      result.positions.delete(combined);
    }
  });

  return {
    t,
    positions: new Map(result.positions),
    radii: new Map(result.radii),
    gearAngles: compute_gear_angles(mechanism, t),
  };
}

/**
 * Apply a kinematic snapshot's positions to a mechanism copy for rendering.
 * Does NOT modify the original mechanism (editing state).
 */
export function apply_snapshot_to_mechanism(
  mechanism: Mechanism,
  snapshot: KinematicSnapshot,
): Mechanism {
  const newElements = mechanism.mechanicalElements.map((el) => {
    if ("position" in el) {
      const pos = snapshot.positions.get(`${el.id}:pos`);
      if (!pos) return el;
      if (el.type === "gear") {
        const rad = snapshot.radii.get(`${el.id}:rad`);
        return {
          ...el,
          position: pos,
          ...(rad !== undefined ? { radius: rad } : {}),
        };
      }
      return { ...el, position: pos };
    } else {
      // Edge element (beam, spring, damper, belt)
      const start = snapshot.positions.get(`${el.id}:start`);
      const end = snapshot.positions.get(`${el.id}:end`);
      return {
        ...el,
        ...(start ? { positionStart: start } : {}),
        ...(end ? { positionEnd: end } : {}),
      };
    }
  });

  return { ...mechanism, mechanicalElements: newElements };
}

export { RECORD_DT };
