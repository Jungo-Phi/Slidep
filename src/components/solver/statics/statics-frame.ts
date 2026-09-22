import { ID, Point2 } from "../../../types";
import { BeamCohesionSpec } from "../dynamics/beam-cohesion";
import { CompiledLoad } from "../dynamics/load-model";
import { BEAM_END_MASS_FRACTION, DynamicMassModel } from "../dynamics/mass-model";
import { StaticsFrame, StaticsGear } from "./equilibrium-model";

const ZERO = new Point2(0, 0);

/** A beam's section, already resolved against the mechanism's material and profile libraries.
 * Resolved once at compile time rather than looked up per frame — none of it moves, and a dangling reference reads as zero here instead of failing mid-solve. */
export interface StaticsBeam {
  id: ID;
  /** kg/m. The beam's mass is this times its CURRENT span. */
  linearMass: number;
  EA: number;
  EI: number;
}

export interface StaticsFrameInputs {
  gravity: Point2;
  /** All three take FUSED solver keys — `BeamCohesionSpec`'s own. A caller reading a snapshot
   * has to unfuse; the dynamics step already holds its maps in this form. */
  positionOf: (key: string) => Point2 | undefined;
  velocityOf: (key: string) => Point2;
  accelerationOf: (key: string) => Point2;
  /** Everything known applied at a node that is not a beam and not gravity: loads, spring and damper forces, joint friction.
   * Never a motor's force couple: the assembly solves for a motor's torque as a reaction. */
  externalForceAt: (key: string) => Point2;
  /** The distributed-load part of `externalForceAt`, which is subtracted back out — see
   * `distributedDensityOn`. */
  distributedShareAt: (key: string) => Point2;
  /** A gear's angular acceleration (rad/s²), by gear id. */
  angularAccelerationOf: (gearID: ID) => number;
  /** Known torques on a gear's angle, by gear id — see `StaticsFrame.externalTorqueOn`. */
  externalTorqueOn: (gearID: ID) => number;
  masses: DynamicMassModel;
  /** The gears the assembly carries as bodies — `StaticsSystem.gears`, not every gear drawn: only a carried one owns its own mass here rather than leaving it lumped on its axle node. */
  gears: StaticsGear[];
  specs: BeamCohesionSpec[];
  loads: CompiledLoad[];
  beams: StaticsBeam[];
}

/** A load stored in an edge's own frame follows that edge as it turns. */
function to_world(
  vector: Point2,
  edge: { startKey: string; endKey: string } | undefined,
  positionOf: (key: string) => Point2 | undefined,
): Point2 {
  if (!edge) return vector;
  const start = positionOf(edge.startKey);
  const end = positionOf(edge.endKey);
  const delta = start && end ? end.sub(start) : undefined;
  const xhat = delta && delta.length() > 1e-9 ? delta.normalize() : new Point2(1, 0);
  return xhat.mul(vector.x).add(xhat.perp().mul(vector.y));
}

/**
 * Read one frame as the statics assembly needs it.
 *
 * Built from accessors rather than from a snapshot so the dynamics step — which holds exactly these maps mid-solve and has no snapshot yet — and a panel reading a recorded frame can share one construction.
 */
export function statics_frame(inputs: StaticsFrameInputs): StaticsFrame {
  const { positionOf } = inputs;
  const beamOf = new Map(inputs.beams.map((b) => [b.id, b]));
  const specOf = new Map(inputs.specs.map((s) => [s.beamID, s]));

  const length_of = (beamID: ID): number => {
    const spec = specOf.get(beamID);
    const p0 = spec && positionOf(spec.k0);
    const p1 = spec && positionOf(spec.k1);
    return p0 && p1 ? p1.distance_to(p0) : 0;
  };

  // Each node's share of the beams' own mass, which belongs to the beams and not to it — the convention this whole chantier settled on, and the one `node-balance.ts` checks against.
  const lumps = new Map<string, number>();
  for (const spec of inputs.specs)
    for (const key of [spec.k0, spec.k1])
      lumps.set(key, (lumps.get(key) ?? 0) + spec.mass * BEAM_END_MASS_FRACTION);
  // A carried gear's mass moves the same way: `mass-model.ts` lumps a disc onto its axle key, and a gear that has its own equilibrium row must not also be weighed there.
  for (const gear of inputs.gears)
    lumps.set(gear.centreKey, (lumps.get(gear.centreKey) ?? 0) + gear.mass);

  return {
    gravity: inputs.gravity,
    positionOf,
    velocityOf: inputs.velocityOf,
    accelerationOf: inputs.accelerationOf,
    externalForceAt: (key) => inputs.externalForceAt(key).sub(inputs.distributedShareAt(key)),
    nodeMassAt: (key) => {
      const inverse = inputs.masses.posMasses.get(key) ?? 0;
      const lumped = inverse > 0 ? 1 / inverse : (inputs.masses.groundedMasses.get(key) ?? 0);
      return Math.max(0, lumped - (lumps.get(key) ?? 0));
    },
    beamMass: (beamID) => (beamOf.get(beamID)?.linearMass ?? 0) * length_of(beamID),
    gearAngularAcceleration: inputs.angularAccelerationOf,
    externalTorqueOn: inputs.externalTorqueOn,
    /**
     * A distributed load acts on the beam's MATERIAL. The dynamics step has to split it onto the two end nodes (`resolve_load_forces`); here it stays where it physically is, which is also the only form the flexibility integrals can use — hence `distributedShareAt` being subtracted from `externalForceAt` above, or the same load would be carried twice.
     */
    distributedDensityOn: (beamID) => {
      const spec = specOf.get(beamID);
      const length = length_of(beamID);
      let at0 = ZERO;
      let slope = ZERO;
      if (!spec || length < 1e-9) return { at0, slope };
      for (const load of inputs.loads) {
        if (load.kind !== "distributed-force") continue;
        if (load.startKey !== spec.k0 || load.endKey !== spec.k1) continue;
        const direction = to_world(load.direction, load.edge, positionOf);
        at0 = at0.add(direction.mul(load.magnitudeStart));
        slope = slope.add(
          direction.mul((load.magnitudeEnd - load.magnitudeStart) / length),
        );
      }
      return { at0, slope };
    },
    beamStiffness: (beamID) => {
      const beam = beamOf.get(beamID);
      return beam && beam.EA > 0 && beam.EI > 0 ? { EA: beam.EA, EI: beam.EI } : undefined;
    },
  };
}
