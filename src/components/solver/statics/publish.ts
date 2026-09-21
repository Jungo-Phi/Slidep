import { BeamCohesion, BeltStrand, ID } from "../../../types";
import { BeamCohesionSpec } from "../dynamics/beam-cohesion";
import { StaticsFrame } from "./equilibrium-model";
import { StaticsSolution, StaticsTorsor } from "./equilibrium-solve";

/**
 * Turn the solved interface torsors into the `BeamCohesion` the rest of the app reads — see docs/plan-efforts-interieurs.md phase 10.
 *
 * `StaticsTorsor` and `BeamCohesion.start`/`.end` mean the same thing, all three components alike: "what the beam applies onto whatever sits at that node".
 * Turning that into the cut torsor `N`/`T`/`Mf` is `cohesion-field.ts`'s `r_coh_start`/`r_coh_end`, and nothing here anticipates it.
 * **An attached node's** entry is the one exception: it holds what the beam RECEIVES there, the opposite of what it applies, and its abscissa as a fraction of the span rather than in metres.
 */
function components(torsor: StaticsTorsor): { fx: number; fy: number; m: number } {
  return { fx: torsor.fx, fy: torsor.fy, m: torsor.m };
}

const NOTHING = { fx: 0, fy: 0, m: 0 };

export function beam_cohesion_from_statics(
  specs: BeamCohesionSpec[],
  frame: StaticsFrame,
  solution: StaticsSolution | undefined,
): BeamCohesion[] {
  const byBeam = new Map<ID, StaticsTorsor[]>();
  for (const torsor of solution?.torsors ?? []) {
    if (torsor.beamID === undefined) continue;
    const held = byBeam.get(torsor.beamID);
    if (held) held.push(torsor);
    else byBeam.set(torsor.beamID, [torsor]);
  }

  return specs.map((spec) => {
    const torsors = byBeam.get(spec.beamID) ?? [];
    const start = torsors.find((t) => t.nodeKey === spec.k0);
    const end = torsors.find((t) => t.nodeKey === spec.k1);
    const p0 = frame.positionOf(spec.k0);
    const p1 = frame.positionOf(spec.k1);
    const length = p0 && p1 ? p1.distance_to(p0) : 0;

    const attachedNodes = spec.attachedNodes.flatMap(({ nodeID, nodeKey }) => {
      const torsor = torsors.find((t) => t.nodeKey === nodeKey && t !== start && t !== end);
      if (!torsor) return [];
      return [
        {
          nodeID,
          s: length > 1e-9 ? torsor.s / length : 0,
          fx: -torsor.fx,
          fy: -torsor.fy,
        },
      ];
    });

    // A beam is only as good as its worst component: one undetermined share makes the whole field along it indicative, since the march carries that share the entire span.
    // `foreign` counts the same way — a belt or a gear mesh pulling at one of its nodes is not something this model resolved, it is something it declined to describe.
    const settled = (torsor: StaticsTorsor | undefined) =>
      torsor !== undefined &&
      !torsor.foreign &&
      torsor.determined.fx &&
      torsor.determined.fy &&
      torsor.determined.m;

    return {
      beamID: spec.beamID,
      start: start ? components(start) : NOTHING,
      end: end ? components(end) : NOTHING,
      attachedNodes,
      determinate: torsors.length > 0 && torsors.every(settled),
    };
  });
}

/** The solved strands as a snapshot carries them — see `BeltStrand`. */
export function belt_strands_from_statics(solution: StaticsSolution | undefined): BeltStrand[] {
  return (solution?.strands ?? []).map((strand) => ({
    beltID: strand.beltID,
    fromX: strand.from.x,
    fromY: strand.from.y,
    toX: strand.to.x,
    toY: strand.to.y,
    fromGear: strand.fromGear,
    toGear: strand.toGear,
    tension: strand.tension,
    determined: strand.determined,
  }));
}
