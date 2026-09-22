import { Link } from "../../../types";
import { Nodes } from "../nodes";
import { LinkSlots } from "./link-slots";

type Belt = Extract<Link, { type: "BeltLength" }>;

/**
 * How far short of the limit the contact holds, as a share of it.
 * At the limit itself a strand has zero length and no direction, a singular geometry the belt constraints cannot be read on, so the contact never lets it get there.
 */
const GAP_MARGIN = 1e-3;

/** One pulley of the belt as it runs now: its slot, its radius, and which way the belt wraps it. */
interface Pulley {
  slot: number;
  r: number;
  ccw: boolean;
}

// Reused across calls: this runs on every sweep of every substep, where allocation is what costs.
const pulleys: Pulley[] = [];

/**
 * The contact that keeps a strand from ceasing to exist between two pulleys that follow each other along the belt, and does nothing until it is about to.
 *
 * A crossed strand stops existing when the two rims touch (`d = r_a + r_b`), a straight one when one pulley swallows the other (`d = |r_a − r_b|`).
 * Pulleys that merely overlap still carry a valid straight strand, so they are left alone, and so are pulleys that are not neighbours on the belt.
 * A pulley may wind the belt past a full turn: the belt then lies over itself, a state it is allowed to be in.
 * An open belt's free ends are left to `applyBeltLengthConstraint`'s own radial contact: resting on the rim is a valid state it knows how to read, which a margin here would keep nudging off.
 *
 * Simulation only: in edition the radii themselves are what a dimension moves, and the user is shaping the belt.
 * Returns the worst violation met, in metres.
 */
export function applyBeltValidityContacts(nodes: Nodes, s: LinkSlots, link: Belt): number {
  if (link.radKeys) return 0;
  let n = 0;
  for (let i = 0; i < link.gearPosKeys.length; i++) {
    if (link.disconnected?.[i]) continue;
    const slot = s.pos[2 + i];
    if (slot < 0) return 0;
    const pulley = pulleys[n] ?? (pulleys[n] = { slot, r: 0, ccw: false });
    pulley.slot = slot;
    pulley.r = link.radii[i];
    pulley.ccw = link.directions[i] === true;
    n++;
  }
  if (n < 2) return 0;

  let worst = 0;
  // A closed belt also runs from its last pulley back to its first; two pulleys share a single pair either way.
  const pairs = link.closed && n > 2 ? n : n - 1;
  for (let p = 0; p < pairs; p++)
    worst = Math.max(worst, keep_strand(nodes, pulleys[p], pulleys[(p + 1) % n]));
  return worst;
}

/** Hold two neighbouring pulleys far enough apart for the strand between them to exist. */
function keep_strand(nodes: Nodes, a: Pulley, b: Pulley): number {
  const gap = a.ccw === b.ccw ? Math.abs(a.r - b.r) : a.r + b.r;
  if (gap <= 0) return 0;
  const target = gap * (1 + GAP_MARGIN);
  const dx = nodes.x[b.slot] - nodes.x[a.slot];
  const dy = nodes.y[b.slot] - nodes.y[a.slot];
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d >= target || d < 1e-12) return 0;
  const wa = nodes.w[a.slot];
  const wb = nodes.w[b.slot];
  if (wa + wb === 0) return 0;
  const k = (target - d) / (wa + wb);
  const ux = dx / d;
  const uy = dy / d;
  nodes.x[a.slot] -= ux * k * wa;
  nodes.y[a.slot] -= uy * k * wa;
  nodes.x[b.slot] += ux * k * wb;
  nodes.y[b.slot] += uy * k * wb;
  return target - d;
}
