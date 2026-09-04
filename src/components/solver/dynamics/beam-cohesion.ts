import { ID, Link, Mechanism } from "../../../types";

/**
 * Precomputed once at compile time (`compile_simulation_model`): for one beam, its fused
 * endpoint keys, the nodes attached to its span, and its own mass.
 *
 * This is the shape of a beam as a BODY, which is what the statics pass needs of it — see
 * docs/plan-efforts-interieurs.md phase 10. A beam's endpoints are fused with whatever else is
 * coincident there, so nothing downstream can recover them from the raw mechanism; they are
 * resolved here, once, from the beam's own rigid-length `Distance` link.
 */
export interface BeamCohesionSpec {
  beamID: ID;
  /** Fused key of the beam's start — `key1` of its own `Distance` link, post-fusion. */
  k0: string;
  /** Fused key of the beam's end. */
  k1: string;
  /** Nodes pinned or sliding on this beam's span, and the (already-fused) key each sits at. */
  attachedNodes: { nodeID: ID; nodeKey: string }[];
  /**
   * `${beamID}:mid` — the virtual rotational-inertia node `mass-model.ts` pins onto this beam's
   * span with a fresh `FixedOnSegment` every dynamics substep (`BEAM_END_MASS_FRACTION`).
   * Named here so the statics pass can leave it out: it is a device for carrying `mL²/12`
   * through a particle solver, not a node of the mechanism, and the statics pass takes that
   * inertia from the continuum figure directly.
   */
  midKey: string;
  /**
   * This beam's own mass in kg, at its REST length.
   *
   * Read only to know each endpoint node's share of it (`BEAM_END_MASS_FRACTION`), which
   * belongs to the beam and not to the node — see `statics-frame.ts`'s `nodeMassAt`.
   */
  mass: number;
}

/** Build every beam's `BeamCohesionSpec` — see the type doc. `links` must be `model.links`
 *  (already fused and sorted). */
export function build_beam_cohesion_specs(
  mechanism: Mechanism,
  links: Link[],
  /** This beam's own mass in kg — `beam_linear_mass` × length, which needs the mechanism's
   *  materials and profiles and so is resolved by the caller. */
  massOf: (beamID: ID) => number,
): BeamCohesionSpec[] {
  const specs: BeamCohesionSpec[] = [];

  for (const beam of mechanism.mechanicalElements) {
    if (beam.type !== "beam") continue;

    // The beam's own rigid-length link is what fixes k0/k1 — always exactly one, built
    // unconditionally for every beam in `get_links_simulation`.
    const own = links.find((l) => l.type === "Distance" && l.owner === beam.id);
    if (!own || own.type !== "Distance") continue;
    const k0 = own.key1;
    const k1 = own.key2;

    const attachedNodes: { nodeID: ID; nodeKey: string }[] = [];
    for (const link of links)
      if (
        link !== own &&
        (link.type === "FixedOnSegment" || link.type === "SlideOnSegment") &&
        link.key1 === k0 &&
        link.key2 === k1 &&
        link.owner !== undefined
      )
        attachedNodes.push({ nodeID: link.owner, nodeKey: link.key3 });

    specs.push({
      beamID: beam.id,
      k0,
      k1,
      mass: massOf(beam.id),
      attachedNodes,
      midKey: `${beam.id}:mid`,
    });
  }
  return specs;
}
