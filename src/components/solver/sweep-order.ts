import { Link } from "../../types";
import { LinkSlots } from "./link-slots";
import { SolveNodes } from "./nodes";

/**
 * Which constraints a dynamics step may run backwards on its odd sweeps, and in what order.
 *
 * A sweep is Gauss-Seidel, so a correction only travels one way per pass and has to make the
 * round trip to converge; running odd sweeps backwards (symmetric Gauss-Seidel) turns that
 * round trip into a forward/backward substitution, which on a chain the corrections can
 * traverse in both directions is a DIRECT solve. That is what makes a heavy mass hanging off
 * a light chain come out exact instead of leaving a residual that grows with the mass ratio —
 * the whole point of doing this.
 *
 * **Only where the constraints are not redundant.** Reversing the order changes which of
 * several equivalent answers the sweep settles on, so it is safe exactly where there is only
 * one: a chain holding more constraint rows than it has free dofs has a whole family, and the
 * forward and backward passes then pick different members of it. Measured, that ranges from
 * harmless (a hyperstatic truss: the positions are still unique, only the force split is
 * indeterminate) to unbounded drift (a closed belt, whose circulation is a free mode the two
 * directions slide along in opposite ways). Redundancy is counted rather than looked for in
 * the graph on purpose: a beam's own `Distance` plus a `FixedOnSegment` pinning something to
 * it form a triangle, which is a rigid bar carrying a rider and not a loop at all.
 *
 * **Counting is not enough on its own.** It sees a chain holding more rows than unknowns, and
 * misses a chain whose rows are merely DEPENDENT — which is what a belt carries: the surplus
 * strand law of a closed loop, and the aggregate that is the telescoped sum of the laws it
 * spans (both of them what `analysis-model.ts` has to prune before it can count rank). Those
 * add a row and an unknown alike, so no count can tell them apart from a useful constraint;
 * they are named below instead. Left to the count, a closed belt in a dynamics step diverges —
 * measured at 1.8e8 degrees of spread between two listings of the same mechanism.
 *
 * Chains are separated by their free variables alone, so the frame never joins two of them,
 * and a fully anchored link — which cannot carry a correction anywhere — is left where it is.
 *
 * Recomputed per solve rather than once per model, for the same reason `resolve_slots` is:
 * the live link set is what matters, and it moves — a belt drops a pulley, a contact appears
 * and adds a row that was not there when the model was compiled. O(links) against the sweeps
 * that follow.
 *
 * Returns `null` when fewer than two links qualify, i.e. when there is no order to change.
 */
export function reversed_sweep_order(
  links: Link[],
  slots: LinkSlots[],
  nodes: SolveNodes,
): Int32Array | null {
  // One union-find node per free dof, positions then angles, so a link tying a gear's centre
  // to its own angle joins the two the way the mechanism does.
  const angleBase = nodes.count;
  const size = angleBase + nodes.angle.length;
  const parent = new Int32Array(size);
  for (let i = 0; i < size; i++) parent[i] = i;

  const find = (i: number): number => {
    let root = i;
    while (parent[root] !== root) root = parent[root];
    while (parent[i] !== root) {
      const next = parent[i];
      parent[i] = root;
      i = next;
    }
    return root;
  };

  /** Free dofs of one link, as union-find ids. An anchored dof is left out: it cannot carry a
   *  correction, and including it would wire every chain to every other through the frame. */
  const dofs: number[] = [];
  const free_dofs_of = (s: LinkSlots) => {
    dofs.length = 0;
    for (let k = 0; k < s.pos.length; k++) {
      const slot = s.pos[k];
      if (slot >= 0 && nodes.w[slot] > 0) dofs.push(slot);
    }
    for (let k = 0; k < s.ang.length; k++) {
      const slot = s.ang[k];
      if (slot >= 0 && nodes.wAngle[slot] > 0) dofs.push(angleBase + slot);
    }
    return dofs;
  };

  for (const s of slots) {
    const own = free_dofs_of(s);
    for (let k = 1; k < own.length; k++) parent[find(own[0])] = find(own[k]);
  }

  // Per chain: how many scalar unknowns it holds, against how many rows constrain them. A
  // position dof is one unknown, an angle likewise — the same counting `analysis-model.ts`
  // does, minus the pruning it needs to answer about rank rather than about redundancy.
  const unknowns = new Int32Array(size);
  for (let slot = 0; slot < nodes.count; slot++)
    if (nodes.w[slot] > 0) unknowns[find(slot)] += 2;
  for (let slot = 0; slot < nodes.angle.length; slot++)
    if (nodes.wAngle[slot] > 0) unknowns[find(angleBase + slot)] += 1;

  const rows = new Int32Array(size);
  // Chains holding a row that is dependent by construction rather than surplus by count.
  const dependent = new Uint8Array(size);
  for (let i = 0; i < slots.length; i++) {
    const own = free_dofs_of(slots[i]);
    if (own.length === 0) continue;
    const root = find(own[0]);
    rows[root] += links[i].ddl;
    const type = links[i].type;
    if (type === "BeltSubChainAggregate" || type === "BeltSegmentNoSlip")
      dependent[root] = 1;
  }

  const free: number[] = [];
  for (let i = 0; i < slots.length; i++) {
    const own = free_dofs_of(slots[i]);
    if (own.length === 0) continue;
    const root = find(own[0]);
    if (!dependent[root] && rows[root] <= unknowns[root]) free.push(i);
  }
  if (free.length < 2) return null;

  // Reversed among their OWN places in the sweep: a pinned link keeps its slot, so what
  // alternates is the order the others are visited in, never where they sit relative to it.
  const order = new Int32Array(slots.length);
  let taken = 0;
  for (let i = 0; i < slots.length; i++) {
    if (taken < free.length && free[taken] === i) {
      order[i] = free[free.length - 1 - taken];
      taken++;
    } else order[i] = i;
  }
  return order;
}
