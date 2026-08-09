/**
 * The motions a chain's mobility is made of, in a form worth showing.
 *
 * The probe returns *a* basis of the motion space — orthonormal, correct, and shaped by the
 * random directions that happened to find it. Two of its vectors are as meaningful to a
 * reader as two random combinations of "the arm swings" and "the slider travels", and they
 * would change shape at the slightest edit.
 *
 * This module re-derives a basis of the same space from directions that mean something: each
 * element's own translations, its rotation about itself, each gear's spin. Pure linear
 * algebra on the space the probe already found — no further solve — so the result depends on
 * the space alone and not on how it was discovered. That is what makes the modes stable
 * enough to name, to hover and to animate.
 */

import { ID } from "../../types";
import {
  AnalysisChain,
  AnalysisModel,
  Variable,
  elements_of_key,
  variable_keys_of,
} from "./analysis-model";
import { ChainMobility, angle_levers, chain_extent } from "./mobility-probe";

/** Share of a mode's motion below which an element is not worth naming as taking part. */
const CONTRIBUTOR_SHARE = 0.02;

/**
 * Share of the mode's widest motion below which a variable counts as still.
 *
 * Relative, because a mode is a unit vector: on a mechanism with many unknowns every
 * component is small, so an absolute cut would silently drop parts that visibly move — the
 * animation scales the whole mode until its widest unknown is legible, and everything else
 * moves in the same proportion.
 */
const MOVING_SHARE = 0.01;

/** A candidate direction must keep this much of itself after projection to enter the basis. */
const INDEPENDENT = 1e-6;

export type ModeContributor = {
  id: ID;
  /** Fraction of the mode's squared amplitude carried by this element, 0…1. */
  share: number;
};

export type MotionMode = {
  /** Unit vector over `variables`, scaled units (millimetres, angles through their lever). */
  vector: Float64Array;
  /**
   * Elements that move, most first — a ranking, for naming and reading.
   *
   * Not the set to highlight: the small shares are trimmed off, and a fused key's weight is
   * split between its elements, so a part that genuinely moves can fall below the cut.
   */
  contributors: ModeContributor[];
  /** Every element the mode moves, plus its motors. This is what a highlight must show. */
  moves: ID[];
  /**
   * The element the mode is named after.
   *
   * A motor that drives the mode when there is one, otherwise the element that moves most.
   * A motor is the handle a reader already has on a freedom — naming the mode after the
   * largest amplitude instead would be arbitrary where naming it after its motor is not.
   */
  dominant: ID;
  /** Set when `dominant` is a motor driving this mode, rather than merely its biggest mover. */
  drivenByMotor: boolean;
  /**
   * The motion touches a single element — a freedom that moves nothing else. Often a gear
   * spinning in the void, which is a design oversight rather than a mechanism.
   */
  localized: boolean;
};

/**
 * Elements to light when the chain itself is pointed at: everything any of its modes moves.
 *
 * Pointing at a chain and then at one of its modes must narrow the highlight, never move it
 * elsewhere. Taking the union is what makes that true in both directions at once — and it
 * drops the free variables no mode moves, which the constraints have pinned: the chain owns
 * them on paper, but nothing about them is a freedom.
 *
 * A chain with no mobility has no union to take. Its own parts are the honest answer there:
 * "this group is the rigid one" is exactly what the card says.
 */
export function chain_highlight(
  chain: AnalysisChain,
  modes: MotionMode[],
): ID[] {
  if (modes.length === 0) return chain.elements;
  const union = new Set<ID>();
  for (const mode of modes) for (const id of mode.moves) union.add(id);
  return [...union].sort();
}

/** A named direction the chain might move in, before it is confronted with the constraints. */
type Candidate = { vector: Float64Array; order: number };

/**
 * Rigid-body and spin directions of every element of the chain, in canonical order.
 *
 * These are what a reader recognises: a part sliding, a part turning, a wheel spinning. None
 * of them need satisfy the constraints — they are only the vocabulary the motion space is
 * then expressed in.
 */
function element_candidates(
  model: AnalysisModel,
  variables: Variable[],
  levers: Map<string, number>,
): Candidate[] {
  const n = variables.length;
  /** Variable slots each element owns, and the point each position slot sits at. */
  const slotsOf = new Map<ID, number[]>();
  for (let i = 0; i < n; i++)
    for (const id of elements_of_key(variables[i].key)) {
      const list = slotsOf.get(id);
      if (list) list.push(i);
      else slotsOf.set(id, [i]);
    }

  const candidates: Candidate[] = [];
  let order = 0;
  for (const id of [...slotsOf.keys()].sort()) {
    const slots = slotsOf.get(id)!;
    const positions = slots.filter((i) => variables[i].component !== "angle");
    const angles = slots.filter((i) => variables[i].component === "angle");

    if (positions.length > 0) {
      for (const axis of ["x", "y"] as const) {
        const vector = new Float64Array(n);
        for (const i of positions)
          if (variables[i].component === axis) vector[i] = 1;
        candidates.push({ vector, order: order++ });
      }

      // Rotation about the element's own centre: a point turns about it, and an angle the
      // element carries turns with it — one radian, worth `lever` millimetres at the rim.
      let cx = 0;
      let cy = 0;
      let count = 0;
      for (const i of positions) {
        if (variables[i].component !== "x") continue;
        const p = model.nodes.positions.get(variables[i].key);
        if (!p) continue;
        cx += p.x;
        cy += p.y;
        count++;
      }
      if (count > 0) {
        cx /= count;
        cy /= count;
        const vector = new Float64Array(n);
        for (const i of positions) {
          const p = model.nodes.positions.get(variables[i].key);
          if (!p) continue;
          vector[i] =
            variables[i].component === "x" ? -(p.y - cy) : p.x - cx;
        }
        for (const i of angles) vector[i] = levers.get(variables[i].key) ?? 1;
        candidates.push({ vector, order: order++ });
      }
    }

    // A gear turning on its axle, moving nothing else.
    for (const i of angles) {
      const vector = new Float64Array(n);
      vector[i] = levers.get(variables[i].key) ?? 1;
      candidates.push({ vector, order: order++ });
    }
  }
  // Guarantees a basis is always found, even where no element direction reaches a mode.
  for (let i = 0; i < n; i++) {
    const vector = new Float64Array(n);
    vector[i] = 1;
    candidates.push({ vector, order: order++ });
  }
  return candidates.filter((c) => norm_of(c.vector) > 0);
}

function norm_of(v: Float64Array): number {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
  return Math.sqrt(sum);
}

function dot(a: Float64Array, b: Float64Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

/** Component of `v` inside the span of the orthonormal `space`, with `basis` removed from it. */
function project_into(
  v: Float64Array,
  space: Float64Array[],
  basis: Float64Array[],
): Float64Array {
  const out = new Float64Array(v.length);
  for (const s of space) {
    const c = dot(v, s);
    for (let i = 0; i < out.length; i++) out[i] += c * s[i];
  }
  for (const b of basis) {
    const c = dot(out, b);
    for (let i = 0; i < out.length; i++) out[i] -= c * b[i];
  }
  return out;
}

/**
 * How the mode's motion divides between elements, strongest first.
 *
 * A fused key names several elements at once and its weight is split evenly between them:
 * charging each one the full amount instead would let an element that appears in every key
 * of a linkage collect a share of one, and read as though it moved alone.
 */
function contributors_of(
  vector: Float64Array,
  variables: Variable[],
): ModeContributor[] {
  const weight = new Map<ID, number>();
  let total = 0;
  for (let i = 0; i < variables.length; i++) {
    const w = vector[i] * vector[i];
    if (w === 0) continue;
    total += w;
    const owners = elements_of_key(variables[i].key);
    for (const id of owners)
      weight.set(id, (weight.get(id) ?? 0) + w / owners.length);
  }
  if (total === 0) return [];
  const ranked = [...weight.entries()]
    .map(([id, w]) => ({ id, share: w / total }))
    .sort((a, b) => b.share - a.share || a.id.localeCompare(b.id));
  // The strongest one always stays, however thin its share: spread over enough parts every
  // share falls under the cut, and a mode with no contributor at all would have no name.
  const kept = ranked.filter((c) => c.share >= CONTRIBUTOR_SHARE);
  return kept.length > 0 ? kept : ranked.slice(0, 1);
}

/**
 * Elements the mode actually moves, plus the motors that turn them.
 *
 * Counted as a set rather than weighed: "this freedom touches one part and nothing else" is
 * a statement about which parts move, not about how the motion is shared out. Weighing it
 * would call a linkage's coupler a lone mover, since it belongs to every fused node.
 *
 * Motors are the one still thing kept: the row is named after its motor, and a highlight
 * that omitted it would contradict the name the reader just clicked. Anything else that
 * stays put is left out — a rule reaching for "the frame the motion happens against" spread
 * through the rigidity links and lit up the whole rig, rails and their far joints included.
 *
 * Monotone in the moving set, which is what keeps a mode's highlight inside its chain's.
 */
function moved_elements(
  vector: Float64Array,
  variables: Variable[],
  chain: AnalysisChain,
): Set<ID> {
  let widest = 0;
  for (const value of vector) widest = Math.max(widest, Math.abs(value));
  const floor = widest * MOVING_SHARE;

  const movingKeys = new Set<string>();
  const moved = new Set<ID>();
  for (let i = 0; i < variables.length; i++) {
    if (Math.abs(vector[i]) < floor) continue;
    movingKeys.add(variables[i].key);
    for (const id of elements_of_key(variables[i].key)) moved.add(id);
  }

  for (const motor of chain.motors) {
    if (motor.owner === undefined) continue;
    if (variable_keys_of(motor).some((key) => movingKeys.has(key)))
      moved.add(motor.owner);
  }
  return moved;
}

/**
 * Re-express a chain's motion space in element-shaped directions.
 *
 * Greedy on the strongest remaining projection: the direction the constraints accommodate
 * best comes first, so a Core XY answers with its two axes rather than two mixtures of them.
 * Ties fall back to canonical element order, which keeps the choice deterministic.
 */
export function canonical_modes(
  model: AnalysisModel,
  chain: AnalysisChain,
  mobility: ChainMobility,
): MotionMode[] {
  const { variables, modes: space } = mobility;
  if (space.length === 0) return [];

  const levers = angle_levers(model, variables, chain_extent(model, chain) || 1);
  const candidates = element_candidates(model, variables, levers);

  const basis: Float64Array[] = [];
  while (basis.length < space.length) {
    let best: { vector: Float64Array; norm: number; order: number } | null =
      null;
    for (const candidate of candidates) {
      const projected = project_into(candidate.vector, space, basis);
      const norm = norm_of(projected) / norm_of(candidate.vector);
      if (norm <= INDEPENDENT) continue;
      if (
        !best ||
        norm > best.norm + 1e-9 ||
        (Math.abs(norm - best.norm) <= 1e-9 && candidate.order < best.order)
      )
        best = { vector: projected, norm, order: candidate.order };
    }
    if (!best) break; // Cannot happen: the canonical directions span everything.
    const unit = best.vector;
    const length = norm_of(unit);
    for (let i = 0; i < unit.length; i++) unit[i] /= length;
    basis.push(unit);
  }

  const modes: MotionMode[] = basis.map((vector) => {
    const contributors = contributors_of(vector, variables);
    const moves = moved_elements(vector, variables, chain);
    const named = [...moves].sort();
    return {
      vector,
      contributors,
      moves: named,
      // Replaced by `name_modes` below; a mode always moves something, so there is always
      // a part to fall back on and the name is never absent.
      dominant: contributors[0]?.id ?? named[0],
      drivenByMotor: false,
      localized: moves.size === 1,
    };
  });
  name_modes(chain, variables, modes);
  // Driven freedoms first: they are what the mechanism was built to have, and a reader looks
  // for them before the play left over around them.
  return modes
    .map((mode, order) => ({ mode, order }))
    .sort(
      (a, b) =>
        Number(b.mode.drivenByMotor) - Number(a.mode.drivenByMotor) ||
        a.order - b.order,
    )
    .map(({ mode }) => mode);
}

/**
 * Give every mode a name of its own.
 *
 * Motors first, each claiming the mode it drives; the rest fall back to the element that
 * moves most among those not yet spoken for. Two modes sharing a name would be
 * indistinguishable in the panel, and a mechanism's freedoms are rarely about one same part
 * twice.
 */
function name_modes(
  chain: AnalysisChain,
  variables: Variable[],
  modes: MotionMode[],
): void {
  const taken = new Set<ID>();
  name_after_motors(chain, variables, modes, taken);
  for (const mode of modes) {
    if (mode.drivenByMotor) continue;
    const free =
      mode.contributors.find((c) => !taken.has(c.id))?.id ??
      mode.moves.find((id) => !taken.has(id));
    // Every candidate already spoken for: a repeated name beats none at all.
    mode.dominant = free ?? mode.dominant;
    taken.add(mode.dominant);
  }
}

/**
 * Give each motor the mode it drives, and let that mode take the motor's name.
 *
 * Greedy on the strongest coupling: a motor claims the mode that moves its own driven unknown
 * most, and a mode already claimed is left alone — so more motors than modes, or two motors
 * on one freedom, resolve without either of them silently winning twice.
 */
function name_after_motors(
  chain: AnalysisChain,
  variables: Variable[],
  modes: MotionMode[],
  taken: Set<ID>,
): void {
  const claimed = new Set<number>();
  for (const motor of chain.motors) {
    if (motor.owner === undefined) continue;
    // The unknown the motor acts on: an angle it turns, or the beam end it swings.
    const driven =
      motor.type === "MotorAngle"
        ? motor.angleKey
        : motor.type === "MotorBeam"
          ? motor.drivenKey
          : undefined;
    if (driven === undefined) continue;
    const slots = variables.flatMap((v, i) => (v.key === driven ? [i] : []));
    if (slots.length === 0) continue;

    let best = -1;
    let strongest = 0;
    modes.forEach((mode, index) => {
      if (claimed.has(index)) return;
      let amplitude = 0;
      for (const slot of slots) amplitude += mode.vector[slot] ** 2;
      if (amplitude > strongest) {
        strongest = amplitude;
        best = index;
      }
    });
    if (best < 0 || strongest <= 0) continue;
    claimed.add(best);
    modes[best].dominant = motor.owner;
    modes[best].drivenByMotor = true;
    taken.add(motor.owner);
  }
}
