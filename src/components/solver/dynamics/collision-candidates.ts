import { GearElement, ID, Mechanism } from "../../../types";

/** The floor's fixed anchor node — no backing `MechanicalElement`, injected once in
 * `compile_simulation_model` (see `floor_anchor_and_normal`), like `GRAB_BRIDGE_KEY` but permanent rather than re-injected per frame. */
export const FLOOR_ANCHOR_KEY = "floor_anchor";

/**
 * Every pair collision detection may test each frame, precomputed once when the simulation model is compiled: rebuilding it per frame would mean re-deriving the mechanism's structure every step for something that never changes once the model is fixed (only the GEOMETRY — whether a pair is currently in contact — varies frame to frame; see `step_simulation`).
 *
 * Reduced to point-vs-segment (a node against a beam), point-vs-circle (a node against a gear), circle-vs-segment (a gear against a beam) and circle-vs-circle (two unmeshed gears): a beam is treated as a zero-thickness segment, never as a body two segments can cross without either's endpoint approaching the other — see plan `swift-bouncing-kitten` for why that reduction is sound.
 * Bare point-vs-point contact (two nodes with no segment/circle of their own) is out of scope: nothing in Slidep's element set needs it today, and it would reuse `MinDistance` unchanged if it ever does.
 */
export type CollisionCandidates = {
  pointSegment: { pointKey: string; segKey1: string; segKey2: string }[];
  pointCircle: { pointKey: string; centerKey: string; radius: number }[];
  circleSegment: {
    centerKey: string;
    radius: number;
    segKey1: string;
    segKey2: string;
  }[];
  circleCircle: {
    key1: string;
    radius1: number;
    key2: string;
    radius2: number;
  }[];
  /** Every node/gear against the floor's line — always built, independently of
   * `mechanism.simulation.floor.enabled`: the live flag gates their use at runtime (see `collision_links`), the same way ordinary candidates are always built regardless of `collisions`.
   * A height/angle change only takes effect on the next compile. */
  pointFloor: { pointKey: string }[];
  circleFloor: { centerKey: string; radius: number }[];
};

/**
 * A candidate contact point: its (already fused) solver key, and every raw element id that fused into it — the ids `fixedNodesBodyIDs` lists are written in, so exclusion can be checked before fusion renames anything.
 * More than one when a grounded node and a beam's coincident endpoint land on the same key (fusion merges them): a weld naming either raw id has to exclude the whole fused point, not just whichever one is checked, so the two are merged here rather than kept as separate candidates that share a key.
 */
type CandidatePoint = { key: string; rawIds: ID[] };

function dedupe_points(raw: { key: string; rawId: ID }[]): CandidatePoint[] {
  const byKey = new Map<string, ID[]>();
  for (const { key, rawId } of raw) {
    const ids = byKey.get(key);
    if (ids) ids.push(rawId);
    else byKey.set(key, [rawId]);
  }
  return [...byKey].map(([key, rawIds]) => ({ key, rawIds }));
}

const NODE_TYPES = new Set(["pivot", "slider", "slidep", "join", "mass"]);

/**
 * Builds the candidate pairs for `mechanism`, translating every raw element id through `keyMap` — the same fused-key map `compile_simulation_model` builds for its links and hands to `compile_loads`/`compute_dynamic_mass_model`/`compile_springs_dampers`, so a candidate lands on the exact key `nodes.positions` and every other link use.
 * Structural exclusions (a beam's own extremities, whatever is welded to it or to a gear, meshed gear pairs) are read straight off the elements — see `BeamElement.fixedNodesBodyIDs`/`GearElement. fixedNodesBodyIDs`/`meshedGearsIDs` — rather than re-derived from the compiled links, which is both more direct and immune to link shapes changing under it.
 */
export function build_collision_candidates(
  mechanism: Mechanism,
  keyMap: Map<string, string>,
): CollisionCandidates {
  const remap = (key: string) => keyMap.get(key) ?? key;
  const elements = mechanism.mechanicalElements;

  const rawPoints: { key: string; rawId: ID }[] = [];
  for (const element of elements) {
    if (NODE_TYPES.has(element.type))
      rawPoints.push({ key: remap(element.id), rawId: element.id });
    else if (element.type === "beam") {
      rawPoints.push({ key: remap(`${element.id}:start`), rawId: element.id });
      rawPoints.push({ key: remap(`${element.id}:end`), rawId: element.id });
    }
  }
  const points = dedupe_points(rawPoints);

  const gears = elements.filter((e): e is GearElement => e.type === "gear");

  const weldedTo = new Map<ID, Set<ID>>();
  for (const element of elements) {
    if (element.type !== "beam" && element.type !== "gear") continue;
    weldedTo.set(element.id, new Set(element.fixedNodesBodyIDs));
  }
  // A gear's centre is fused with its axle pivot/slidep (see the "gear axle coincidence" links in `get_links_simulation`), so a beam welding that axle onto its span — an idler mounted mid-beam — reaches the gear too, even though the beam's own `fixedNodesBodyIDs` names only the axle's id, never the gear's.
  const isWeldedGear = (welded: Set<ID>, gear: GearElement) =>
    welded.has(gear.id) || welded.has(gear.parentAxleID);

  const pointSegment: CollisionCandidates["pointSegment"] = [];
  const pointCircle: CollisionCandidates["pointCircle"] = [];
  const circleSegment: CollisionCandidates["circleSegment"] = [];
  for (const element of elements) {
    if (element.type === "beam") {
      const segKey1 = remap(`${element.id}:start`);
      const segKey2 = remap(`${element.id}:end`);
      const welded = weldedTo.get(element.id)!;
      for (const p of points) {
        if (p.key === segKey1 || p.key === segKey2) continue; // the beam's own ends
        if (p.rawIds.some((id) => welded.has(id))) continue; // welded to this beam's span
        pointSegment.push({ pointKey: p.key, segKey1, segKey2 });
      }
      for (const gear of gears) {
        if (isWeldedGear(welded, gear)) continue;
        circleSegment.push({
          centerKey: remap(gear.id),
          radius: gear.radius,
          segKey1,
          segKey2,
        });
      }
    } else if (element.type === "gear") {
      const centerKey = remap(element.id);
      const radius = element.radius;
      const welded = weldedTo.get(element.id)!;
      for (const p of points) {
        if (p.key === centerKey) continue; // fused with its own axle
        if (p.rawIds.some((id) => welded.has(id))) continue; // welded to this gear (rim, e.g.)
        pointCircle.push({ pointKey: p.key, centerKey, radius });
      }
    }
  }

  const circleCircle: CollisionCandidates["circleCircle"] = [];
  for (const g1 of gears)
    for (const g2 of gears) {
      if (g1.id >= g2.id) continue; // unordered pair, visited once
      // Meshed lists may be asymmetric (recorded on either gear) — check both.
      if (g1.meshedGearsIDs.includes(g2.id) || g2.meshedGearsIDs.includes(g1.id))
        continue;
      circleCircle.push({
        key1: remap(g1.id),
        radius1: g1.radius,
        key2: remap(g2.id),
        radius2: g2.radius,
      });
    }

  // Not pairwise like the rest — there is only ever one floor, so every point/gear is a candidate against it, unconditionally (see `CollisionCandidates.pointFloor`).
  const pointFloor: CollisionCandidates["pointFloor"] = points.map((p) => ({
    pointKey: p.key,
  }));
  const circleFloor: CollisionCandidates["circleFloor"] = gears.map((g) => ({
    centerKey: remap(g.id),
    radius: g.radius,
  }));

  return {
    pointSegment,
    pointCircle,
    circleSegment,
    circleCircle,
    pointFloor,
    circleFloor,
  };
}
