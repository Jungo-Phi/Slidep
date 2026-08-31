import { BeamCohesion, ID, Link, LinkReaction, MechanicalElement, Point2 } from "../../types";

/**
 * Precomputed once at compile time (`compile_simulation_model`): for one beam, its fused
 * endpoint keys, which links are its OWN (as opposed to whatever else happens to be
 * coincident at the same fused key), and which nodes are attached to its span.
 *
 * See docs/plan-efforts-interieurs.md phase 3 for the full reasoning. In short: a beam's
 * interface torsor at a shared node cannot be read off `LinkReaction`/`force_at` alone,
 * since every element fused at that key reports under the same `key` string. The links that
 * ARE the beam's own body are identifiable structurally instead:
 *  - its own rigid-length `Distance` link (`owner === beam.id`);
 *  - any `FixedOnSegment`/`SlideOnSegment` pinning an attached body to its span (`owner` is
 *    the attached node, not the beam, but `key1`/`key2` are the beam's own endpoints);
 *  - any welded-hub rigidity link (`Angle`, `KeepOrientation`, `BeamFollowsAngle`) that
 *    references both its endpoints (`owner` is the hub node).
 */
export interface BeamCohesionSpec {
  beamID: ID;
  /** Fused key of the beam's start — `link1` of its own `Distance` link, post-fusion. */
  k0: string;
  /** Fused key of the beam's end. */
  k1: string;
  /** Indices, into `step_dynamic_simulation`'s per-frame `links` array (see
   *  `filtered_link_indices` below), of every link that is this beam's own. */
  internalLinkIndices: Set<number>;
  /** For an internal rigidity link whose weld end is known STRUCTURALLY rather than from
   *  `LinkReaction.atAnchor` — today only `BeamFollowsAngle`, whose `pivotKey` is by
   *  construction the hub the beam is welded to, `drivenKey` its own free-swinging point,
   *  regardless of whether that hub happens to be grounded. `resolve_beam_cohesion` reads
   *  this instead of `atAnchor` for such a link, so a weld to a MOBILE hub (a beam rigidly
   *  following a non-grounded gear) still gets its moment attributed to the right end
   *  instead of being dropped. Links absent here (`KeepOrientation`) fall back to
   *  `atAnchor`, the only signal available for them — see `resolve_beam_cohesion`. */
  weldKeyOf: Map<number, string>;
  /** Nodes pinned or sliding on this beam's span, and the (already-fused) key each reports
   *  its own reaction at. */
  attachedNodes: { nodeID: ID; nodeKey: string }[];
}

const RIGIDITY_TYPES = new Set(["Angle", "KeepOrientation", "BeamFollowsAngle"]);

/** The position keys a rigidity link (`Angle`/`KeepOrientation`/`BeamFollowsAngle`) itself
 *  references — the small, explicit subset of `Link`'s many shapes phase 3 cares about,
 *  rather than the fully generic field list `rewrite_position_keys` needs. */
function rigidity_link_keys(link: Link): string[] {
  switch (link.type) {
    case "Angle":
      return [link.key1, link.key2, link.key3, link.key4];
    case "KeepOrientation":
      return [link.key1, link.key2];
    case "BeamFollowsAngle":
      return [link.pivotKey, link.drivenKey];
    default:
      return [];
  }
}

/**
 * `step_dynamic_simulation` never hands `PBD_kinematic_solver` `model.links` directly — it
 * drops `Spring`/`MotorBeam`/`MotorAngle` first (dynamic mode applies those as real forces
 * instead) and appends grab/midpoint/collision links after. Dropping shifts every surviving
 * link's index, appending does not — so a link's position among the SURVIVORS of that same
 * filter, computed once here from the frozen `model.links`, stays valid every frame
 * regardless of what a given frame appends. See `LinkReaction.linkIndex`.
 */
function filtered_link_indices(links: Link[]): Map<Link, number> {
  const indexOf = new Map<Link, number>();
  let i = 0;
  for (const link of links) {
    if (link.type === "Spring" || link.type === "MotorBeam" || link.type === "MotorAngle")
      continue;
    indexOf.set(link, i++);
  }
  return indexOf;
}

/** Build every beam's `BeamCohesionSpec` — see the type doc. `links` must be
 *  `model.links` (already fused and sorted). */
export function build_beam_cohesion_specs(
  mechanicalElements: MechanicalElement[],
  links: Link[],
): BeamCohesionSpec[] {
  const indexOf = filtered_link_indices(links);
  const specs: BeamCohesionSpec[] = [];

  for (const beam of mechanicalElements) {
    if (beam.type !== "beam") continue;

    // The beam's own rigid-length link is what fixes k0/k1 — always exactly one, built
    // unconditionally for every beam in `get_links_simulation`.
    const own = links.find((l) => l.type === "Distance" && l.owner === beam.id);
    if (!own || own.type !== "Distance") continue;
    const k0 = own.key1;
    const k1 = own.key2;

    const internalLinkIndices = new Set<number>([indexOf.get(own)!]);
    const weldKeyOf = new Map<number, string>();
    const attachedNodes: { nodeID: ID; nodeKey: string }[] = [];

    for (const link of links) {
      if (link === own) continue;
      if (
        (link.type === "FixedOnSegment" || link.type === "SlideOnSegment") &&
        link.key1 === k0 &&
        link.key2 === k1
      ) {
        const idx = indexOf.get(link);
        if (idx === undefined) continue; // dropped before the solve (Spring/MotorBeam/MotorAngle — never this type)
        internalLinkIndices.add(idx);
        if (link.owner !== undefined) attachedNodes.push({ nodeID: link.owner, nodeKey: link.key3 });
      } else if (RIGIDITY_TYPES.has(link.type)) {
        const keys = rigidity_link_keys(link);
        if (keys.includes(k0) && keys.includes(k1)) {
          const idx = indexOf.get(link);
          if (idx !== undefined) {
            internalLinkIndices.add(idx);
            if (link.type === "BeamFollowsAngle") weldKeyOf.set(idx, link.pivotKey);
          }
        }
      }
    }

    specs.push({ beamID: beam.id, k0, k1, internalLinkIndices, weldKeyOf, attachedNodes });
  }
  return specs;
}

/**
 * Resolve every beam's cohesion torsor for one frame, from the raw reactions
 * `PBD_kinematic_solver` collected and this frame's solved positions (for attached nodes'
 * live abscissas — see `BeamCohesion.attachedNodes`).
 */
export function resolve_beam_cohesion(
  specs: BeamCohesionSpec[],
  reactions: LinkReaction[],
  positions: Map<string, Point2>,
): BeamCohesion[] {
  return specs.map((spec) => {
    const start = { fx: 0, fy: 0, m: 0, atAnchor: false };
    const end = { fx: 0, fy: 0, m: 0, atAnchor: false };
    const attachedForces = new Map<ID, { fx: number; fy: number }>();

    for (const r of reactions) {
      const isInternalLink =
        r.linkIndex !== undefined && spec.internalLinkIndices.has(r.linkIndex);
      // `PBD_kinematic_solver` reports a directly-applied external force at an ANCHORED dof
      // as its own `"External"` reaction (never carrying a `linkIndex` — it belongs to no
      // link), specifically because the ground has to supply it and nothing else would. At
      // k0/k1 this is real support-reaction content `cohesion.start`/`.end` must include: a
      // distributed load's own nodal share landing exactly on a grounded endpoint (see
      // `resolve_load_forces`) is otherwise invisible here, so `compute_cohesion_field`'s
      // march would start from a torsor missing that share — not a rounding error, the WHOLE
      // share, silently. Filtered out for anything but k0/k1: an attached node's own load
      // reaching it directly is a different channel (`attachedForces`, via its own link).
      const isExternalAtEnd =
        r.type === "External" &&
        r.kind === "force" &&
        (r.key === spec.k0 || r.key === spec.k1);
      if (!isInternalLink && !isExternalAtEnd) continue;
      if (r.kind === "force") {
        // Deliberately UNFLIPPED, at both ends alike: this is "what the beam's own rigidity
        // applies onto whatever is coincident there" (the raw `LinkReaction` sense — see its
        // own doc), never `force_at`'s anchor-conditional "classical support reaction". The
        // two ends need OPPOSITE further treatment to become the cut torsor `R_coh` (`k0`'s
        // own raw reading already IS `R_coh(0⁺)`; `k1`'s needs a further Newton's-third-law
        // flip) — an asymmetry inherent to the cut convention itself (verified against the
        // plan's reference case and a two-force-member truss joint), not something a single
        // uniform flip here could absorb correctly for both. `cohesion-field.ts` applies it.
        if (r.key === spec.k0) {
          start.fx += r.fx;
          start.fy += r.fy;
          start.atAnchor = r.atAnchor;
        } else if (r.key === spec.k1) {
          end.fx += r.fx;
          end.fy += r.fy;
          end.atAnchor = r.atAnchor;
        } else {
          const attached = spec.attachedNodes.find((n) => n.nodeKey === r.key);
          if (!attached) continue;
          const acc = attachedForces.get(attached.nodeID) ?? { fx: 0, fy: 0 };
          acc.fx += r.fx;
          acc.fy += r.fy;
          attachedForces.set(attached.nodeID, acc);
        }
      } else {
        // A 2-dof rigidity link's own reaction is reported at BOTH its ends with the SAME
        // value (`PBD_kinematic_solver`: a pure couple is reference-independent) — but the
        // physical weld it represents sits at exactly ONE of them, and R_coh(0)/R_coh(L)
        // must not both claim it. `weldKeyOf` picks it structurally when the link type
        // makes that knowable (`BeamFollowsAngle`'s `pivotKey`, weld end regardless of
        // whether the hub happens to be grounded — the mobile-mobile weld this exists for,
        // e.g. a beam rigidly following a non-grounded gear); otherwise (`KeepOrientation`,
        // whose two ends are just the beam's own start/end, interchangeable labels) the
        // anchored end is the only available signal, when there is one.
        if (r.linkIndex === undefined) continue; // torque only ever comes from an internal link
        const weldKey = spec.weldKeyOf.get(r.linkIndex);
        if (weldKey !== undefined ? r.key !== weldKey : !r.atAnchor) continue;
        if (r.key === spec.k0) start.m += r.torque;
        else if (r.key === spec.k1) end.m += r.torque;
      }
    }

    const beamStart = positions.get(spec.k0);
    const beamEnd = positions.get(spec.k1);
    const attachedNodes = spec.attachedNodes.flatMap(({ nodeID, nodeKey }) => {
      const contribution = attachedForces.get(nodeID);
      if (!contribution) return [];
      const nodePos = positions.get(nodeKey);
      const s =
        beamStart && beamEnd && nodePos
          ? nodePos.parameter_on_segment(beamStart, beamEnd)
          : 0;
      // The link's own reaction is what it applies AT the node; the beam receives the
      // opposite of that (Newton's third law), at the node's current abscissa.
      return [{ nodeID, s, fx: -contribution.fx, fy: -contribution.fy }];
    });

    return { beamID: spec.beamID, start, end, attachedNodes };
  });
}
