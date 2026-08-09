/**
 * Showing an over-constraint by asking one of its joints to hold a value it cannot.
 *
 * A redundant constraint blocks no motion — that is its definition — so there is no mode to
 * swing and nothing to see at rest. What it does mean is that the assembly cannot take up the
 * smallest imperfection, and that IS showable: lie to one of the joints, and the mechanism
 * strains instead of complying. An independent joint would simply have moved.
 *
 * The lie itself stays small — told large, it stops being a strain and becomes a jam, the
 * parts unable to reach the pose asked of them at all. What makes it legible instead is
 * magnifying the ANSWER, the way a stress plot exaggerates a deflection: the displacement
 * field is scaled whole, so what is drawn is the mechanism's own shape at the wrong size
 * rather than a different mechanism at the right one.
 *
 * The lie swings through zero, so letting go of it leaves the drawing exactly where it was.
 *
 * Each pose is solved from the RESTING configuration rather than from the previous frame. A
 * falsified system is inconsistent, and PBD on an inconsistent set creeps: warm-started, the
 * mechanism would wander along its free motions over a few seconds of animation and not come
 * back. Starting cold makes each pose a function of the phase alone, so the swing is
 * repeatable and returns.
 */

import { STRAIN_ANIMATION } from "../../constants/rendering-specs";
import { Link, Mechanism } from "../../types";
import {
  AnalysisChain,
  AnalysisModel,
  canonical_key,
  variable_keys_of,
} from "./analysis-model";
import { mechanism_at, pose_of, rest_nodes } from "./animation-pose";
import { constraint_lever, falsify, is_falsifiable } from "./falsify-constraint";
import { model_extent } from "./mobility-probe";
import { slotOf, SolveNodes } from "./nodes";
import { PBD_solve } from "./PBD_kinematic_solver";

export type StrainAnimation = {
  /** Advance by `dt` seconds and return the pose to draw. */
  advance(dt: number): Mechanism;
};

/**
 * A link's identity as its own geometry and owner write it, independent of any list it sits
 * in. Two links still tied on all three hold the same constraint between the same nodes for
 * the same part, so either one strains the mechanism identically.
 */
const signature = (link: Link) =>
  `${variable_keys_of(link).map(canonical_key).sort().join("|")} ${link.type} ${link.owner ?? ""}`;

/**
 * The link of `links` a lie is told to, or undefined when none of them has a target to shift.
 *
 * Chosen by the geometry it holds rather than by its place in the list: links reach the
 * analysis in parsing order, which moves when the elements are reordered, and the same
 * mechanism must always strain the same way.
 */
export function strained_link(links: Link[]): Link | undefined {
  return links
    .filter(is_falsifiable)
    .map((link) => ({ link, rank: signature(link) }))
    .sort((a, b) => a.rank.localeCompare(b.rank))[0]?.link;
}

/**
 * Strain `chain` against `link`, one pose per call.
 *
 * Undefined when there is nothing to show: either the link holds no target to be wrong
 * about, or the mechanism has no way at all of answering the lie — everything the constraint
 * could push on being anchored.
 *
 * `link` must be one of the chain's own — the lie replaces it in place, and a link from
 * elsewhere would simply be added to the set.
 */
export function animate_strain(
  mechanism: Mechanism,
  model: AnalysisModel,
  chain: AnalysisChain,
  link: Link,
): StrainAnimation | undefined {
  if (!is_falsifiable(link)) return undefined;

  const extent = model_extent(model);
  const amplitude = Math.max(STRAIN_ANIMATION.LIE_RATIO * extent, 1);
  const lever = constraint_lever(model, link, extent || 1);

  const rest = rest_nodes(model);
  const restX = Float64Array.from(rest.x);
  const restY = Float64Array.from(rest.y);
  const restAngle = Float64Array.from(rest.angle);

  /** Move `nodes` to `rest + gain·(nodes − rest)`, in place. */
  const magnify = (nodes: SolveNodes, gain: number) => {
    for (let i = 0; i < nodes.x.length; i++) {
      nodes.x[i] = restX[i] + (nodes.x[i] - restX[i]) * gain;
      nodes.y[i] = restY[i] + (nodes.y[i] - restY[i]) * gain;
    }
    for (let i = 0; i < nodes.angle.length; i++)
      nodes.angle[i] = restAngle[i] + (nodes.angle[i] - restAngle[i]) * gain;
  };

  const solved = (lie: number): SolveNodes => {
    const nodes = rest_nodes(model);
    PBD_solve(
      nodes,
      chain.links.map((other) =>
        other === link ? falsify(other, lie, lever)! : other,
      ),
      STRAIN_ANIMATION.SWEEPS,
      1e-9,
      false,
      "constraints",
    );
    return nodes;
  };

  // ── What the mechanism does at the peak of the swing sets the magnification for the
  // whole of it, so the drawing does not breathe in and out of legibility as the lie grows.
  const peak = solved(amplitude);
  const peakX = Float64Array.from(peak.x);
  const peakY = Float64Array.from(peak.y);
  const peakAngle = Float64Array.from(peak.angle);
  const unmagnified = () => {
    peak.x.set(peakX);
    peak.y.set(peakY);
    peak.angle.set(peakAngle);
  };

  let travel = 0;
  for (let i = 0; i < peakX.length; i++)
    travel = Math.max(travel, Math.hypot(peakX[i] - restX[i], peakY[i] - restY[i]));
  const stretch = worst_stretch(chain, peak);
  if (
    travel < STRAIN_ANIMATION.DEAD_RESPONSE_RATIO * extent &&
    stretch < STRAIN_ANIMATION.DEAD_RESPONSE_RATIO
  )
    return undefined;

  let gain = Math.min(
    STRAIN_ANIMATION.MAX_GAIN,
    stretch > 0 ? STRAIN_ANIMATION.SHOWN_STRAIN_RATIO / stretch : Infinity,
    travel > 0 ? (STRAIN_ANIMATION.SHOWN_RATIO * extent) / travel : Infinity,
  );
  // A bar's stretch does not follow the magnification proportionally — scaling a
  // displacement field is not scaling the lengths it implies — so the first estimate
  // overshoots. Measuring the magnified pose and correcting lands it.
  for (let i = 0; i < 2; i++) {
    unmagnified();
    magnify(peak, gain);
    const shown = worst_stretch(chain, peak);
    if (shown > STRAIN_ANIMATION.SHOWN_STRAIN_RATIO)
      gain *= STRAIN_ANIMATION.SHOWN_STRAIN_RATIO / shown;
  }

  let phase = 0;

  return {
    advance(dt: number): Mechanism {
      phase += (dt * 2 * Math.PI) / STRAIN_ANIMATION.PERIOD_S;
      const nodes = solved(amplitude * Math.sin(phase));
      magnify(nodes, gain);
      return mechanism_at(mechanism, pose_of(nodes));
    },
  };
}

/**
 * How far the worst-off bar of the chain is from the length it holds, as a share of it.
 *
 * The drawing-level measure of a mechanism fighting itself: a `Distance` names a bar and the
 * length it is meant to keep, so the gap between the two is exactly what a reader sees. Bars
 * shorter than a millimetre are skipped — a degenerate one has no length to be wrong about.
 */
function worst_stretch(chain: AnalysisChain, nodes: SolveNodes): number {
  let worst = 0;
  for (const link of chain.links) {
    if (link.type !== "Distance" || link.distance < 1) continue;
    const a = slotOf(nodes, link.key1);
    const b = slotOf(nodes, link.key2);
    if (a < 0 || b < 0) continue;
    const held = Math.hypot(nodes.x[a] - nodes.x[b], nodes.y[a] - nodes.y[b]);
    worst = Math.max(worst, Math.abs(held - link.distance) / link.distance);
  }
  return worst;
}
