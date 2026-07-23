import { Point2 } from "../../../types/point2";
import { Link } from "../../../types";
import { belt_pieces, BeltVia } from "../../../utils/belt-path";
import { PBD_kinematic_solver } from "../PBD_kinematic_solver";
import { collect_solver_trace, SolverTraceEvent } from "../solver-trace";

/**
 * EXPERIMENTAL geometry + measurement helpers for the belt "q" conditioning
 * bench. Jetable — imported only by the belt-q-*.test.ts diagnostics.
 */

export interface BeltRig {
  positions: Map<string, Point2>;
  angles: Map<string, number>;
  posMasses: Map<string, number>;
  gearPosKeys: string[];
  gearAngleKeys: string[];
  radii: number[];
  directions: boolean[];
}

/**
 * A closed belt of `n` pulleys evenly placed on a circle of radius `ring`.
 * Radii jitter deliberately (asymmetric loop); all same wrap sense (convex
 * outer loop). Centres are free (mass 1) unless listed in `anchored`.
 */
export function makeClosedBelt(
  n: number,
  opts: { ring?: number; baseR?: number; jitter?: number; anchored?: number[] } = {},
): BeltRig {
  const ring = opts.ring ?? 200;
  const baseR = opts.baseR ?? 22;
  const jitter = opts.jitter ?? 8;
  const anchored = new Set(opts.anchored ?? []);
  const positions = new Map<string, Point2>();
  const angles = new Map<string, number>();
  const posMasses = new Map<string, number>();
  const gearPosKeys: string[] = [];
  const gearAngleKeys: string[] = [];
  const radii: number[] = [];
  const directions: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const key = `g${i}`;
    const a = (i / n) * 2 * Math.PI;
    positions.set(key, new Point2(ring * Math.cos(a), ring * Math.sin(a)));
    angles.set(key, 0);
    posMasses.set(key, anchored.has(i) ? 0 : 1);
    gearPosKeys.push(key);
    gearAngleKeys.push(key);
    radii.push(baseR + jitter * Math.sin(i * 1.7));
    directions.push(false);
  }
  return {
    positions,
    angles,
    posMasses,
    gearPosKeys,
    gearAngleKeys,
    radii,
    directions,
  };
}

/**
 * An open belt: start terminal → n pulleys in a row → end terminal. Terminals
 * anchored (mass 0), pulleys free. Pulleys are spread on a shallow arc so the
 * strands are non-degenerate.
 */
export function makeOpenBelt(
  n: number,
  opts: { span?: number; baseR?: number; jitter?: number } = {},
): BeltRig & { startKey: string; endKey: string } {
  const span = opts.span ?? 120;
  const baseR = opts.baseR ?? 22;
  const jitter = opts.jitter ?? 8;
  const positions = new Map<string, Point2>();
  const angles = new Map<string, number>();
  const posMasses = new Map<string, number>();
  const gearPosKeys: string[] = [];
  const gearAngleKeys: string[] = [];
  const radii: number[] = [];
  const directions: boolean[] = [];
  const startKey = "start";
  const endKey = "end";
  positions.set(startKey, new Point2(-span * (n + 1), 0));
  posMasses.set(startKey, 0);
  for (let i = 0; i < n; i++) {
    const key = `g${i}`;
    positions.set(key, new Point2(-span * (n - 1 - i) - span, 40 * Math.sin(i)));
    angles.set(key, 0);
    posMasses.set(key, 1);
    gearPosKeys.push(key);
    gearAngleKeys.push(key);
    radii.push(baseR + jitter * Math.sin(i * 1.7));
    directions.push(i % 2 === 1); // mixed wrap sense
  }
  positions.set(endKey, new Point2(span, 0));
  posMasses.set(endKey, 0);
  return {
    positions,
    angles,
    posMasses,
    gearPosKeys,
    gearAngleKeys,
    radii,
    directions,
    startKey,
    endKey,
  };
}

/** The closed BeltLength link for a rig, target = current measured length. It
 *  holds the loop length (so ΣΔh = ΔL = 0, making the no-slip chain compatible)
 *  and, unlike the q-links, moves the centres. */
export function closedBeltLengthLink(rig: BeltRig): Link {
  const vias: BeltVia[] = rig.gearPosKeys.map((k, i) => ({
    pos: rig.positions.get(k)!,
    radius: rig.radii[i],
    direction: rig.directions[i],
  }));
  const length = belt_pieces(vias, true).reduce((a, p) => a + p.length, 0);
  return {
    type: "BeltLength",
    ddl: 1,
    startKey: "belt:start", // unread on a closed belt
    endKey: "belt:end",
    gearPosKeys: rig.gearPosKeys,
    gearAngleKeys: rig.gearAngleKeys,
    radii: rig.radii,
    directions: rig.directions,
    length,
    closed: true,
    owner: "belt" as Link["owner"],
  };
}

/** The open BeltLength link for a rig (no phaseKey → pulley-centre projection,
 *  terminals held by their anchors). Holds the open path's total length, i.e.
 *  the surplus compatibility equation ΣΔh = ΔL = 0 the q-chain needs. */
export function openBeltLengthLink(
  rig: BeltRig,
  startKey: string,
  endKey: string,
): Link {
  const vias: BeltVia[] = [
    { pos: rig.positions.get(startKey)!, radius: 0, direction: false },
    ...rig.gearPosKeys.map((k, i) => ({
      pos: rig.positions.get(k)!,
      radius: rig.radii[i],
      direction: rig.directions[i],
    })),
    { pos: rig.positions.get(endKey)!, radius: 0, direction: false },
  ];
  const length = belt_pieces(vias, false).reduce((a, p) => a + p.length, 0);
  return {
    type: "BeltLength",
    ddl: 1,
    startKey,
    endKey,
    gearPosKeys: rig.gearPosKeys,
    gearAngleKeys: rig.gearAngleKeys,
    radii: rig.radii,
    directions: rig.directions,
    length,
    closed: false,
    owner: "belt" as Link["owner"],
  };
}

/** Per-sweep worst residual over the links matching `pick`. Index = sweep. */
export function residualPerSweep(
  events: SolverTraceEvent[],
  pick: (l: Link) => boolean,
): number[] {
  const perIter = new Map<number, number>();
  for (const e of events) {
    if (!pick(e.link)) continue;
    perIter.set(e.iteration, Math.max(perIter.get(e.iteration) ?? 0, e.residual));
  }
  const maxIter = Math.max(-1, ...perIter.keys());
  const out: number[] = [];
  for (let i = 0; i <= maxIter; i++) out.push(perIter.get(i) ?? 0);
  return out;
}

/**
 * Concurrency between the q-links and BeltLength on position DOFs: over all
 * sweeps, how many distinct position keys are written by BOTH a
 * BeltSegmentNoSlip and a BeltLength within the SAME sweep. `sharedSweeps` =
 * number of sweeps with a non-empty overlap; `keys` = the shared keys seen.
 */
export function dofConcurrency(events: SolverTraceEvent[]): {
  sharedSweeps: number;
  keys: string[];
} {
  const qByIter = new Map<number, Set<string>>();
  const lenByIter = new Map<number, Set<string>>();
  for (const e of events) {
    const map =
      e.link.type === "BeltSegmentNoSlip"
        ? qByIter
        : e.link.type === "BeltLength"
          ? lenByIter
          : null;
    if (!map) continue;
    if (!map.has(e.iteration)) map.set(e.iteration, new Set());
    for (const m of e.moves) map.get(e.iteration)!.add(m.key);
  }
  const shared = new Set<string>();
  let sharedSweeps = 0;
  for (const [it, qset] of qByIter) {
    const lset = lenByIter.get(it);
    if (!lset) continue;
    let any = false;
    for (const k of qset)
      if (lset.has(k)) {
        shared.add(k);
        any = true;
      }
    if (any) sharedSweeps++;
  }
  return { sharedSweeps, keys: [...shared] };
}

/** First sweep index whose worst residual is < `threshold`, or -1 if never. */
export function sweepsToConverge(perSweep: number[], threshold = 1e-6): number {
  for (let i = 0; i < perSweep.length; i++)
    if (perSweep[i] < threshold) return i;
  return -1;
}

/**
 * Run the real solver over `links` (in the given order — no sort_links applied
 * here) with tracing on, returning every event. Positions/angles are mutated.
 */
export function traceSolve(
  positions: Map<string, Point2>,
  radii: Map<string, number>,
  posMasses: Map<string, number>,
  links: Link[],
  angles: Map<string, number>,
  nbIterations: number,
  epsilon = 1e-12,
): SolverTraceEvent[] {
  return collect_solver_trace(() => {
    PBD_kinematic_solver(
      positions,
      radii,
      posMasses,
      new Map(),
      links,
      nbIterations,
      epsilon,
      angles,
    );
  });
}
