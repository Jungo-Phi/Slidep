import { BeamCohesion, Link, Point2 } from "../../../types";
import { position_keys_of } from "../kinematics/link-slots";
import { BeamCohesionSpec } from "./beam-cohesion";
import { BEAM_END_MASS_FRACTION, DynamicMassModel } from "./mass-model";

/**
 * Newton's second law at one solver node, checked against what the beams around it report.
 *
 * This is the check `CohesionField.loopResidual` structurally cannot make. That one compares
 * a beam's own march against its own far-end reading — both derived from the same torsor, so
 * a boundary torsor that is wrong in the same way at both ends closes it perfectly (measured:
 * a beam holding 5 t reads 7.7 N with a residual of 0.002 N). A node balance confronts a beam
 * with everything ELSE coincident there — its neighbours, the loads, the mass lumped on it —
 * and so can only close when the readings agree with the mechanism.
 *
 * See docs/plan-efforts-interieurs.md phase 8.
 */
export interface NodeBalance {
  /** Fused solver key, as `BeamCohesionSpec` carries them. */
  key: string;
  atAnchor: boolean;
  /**
   * `Σ F − m·a` at this node. Zero on a frame whose readings are consistent with the
   * mechanism; anything else is a defect in the readings, not a property of the mechanism.
   * Always zero at an anchored node, where `reaction` absorbs the whole sum instead.
   */
  residual: Point2;
  /** `Σ C` of the couples the welded beams apply here — a point carries no rotational
   *  inertia, so this is zero on a consistent frame. Always zero at an anchored node, where
   *  `reactionMoment` takes it instead. */
  momentResidual: number;
  /** What the frame pushes back with, at an anchored node only. */
  reaction?: Point2;
  /**
   * The couple the frame supplies, at an anchored node only. Whether the support can really
   * supply one is a separate question — a welded support can, a pin cannot — and this says
   * nothing about it: it reports what the beams leave over, which is the support moment
   * exactly when there is a weld to carry it.
   */
  reactionMoment?: number;
  /** Largest single action summed here. `residual` means little in newtons and a lot as a
   *  fraction of this — a 1 N gap is noise next to 100 kN and a defect next to 2 N. */
  scale: number;
  /**
   * False when this node carries a link the balance does not model — a belt strand, a gear
   * mesh, a contact. Its residual then measures what the model leaves out rather than what
   * the readings get wrong, and says nothing about the beams.
   */
  covered: boolean;
}

/**
 * Link types whose action at a node is already accounted for by the beam torsors and the
 * external forces this balance sums. Everything else — belts, gear meshes, contacts, a beam
 * welded to a gear hub — transmits force the balance never sees, and marks its nodes
 * `covered: false` rather than reporting a residual it cannot attribute.
 */
const MODELLED_LINK_TYPES = new Set([
  "Coincidence",
  "Distance",
  "FixedOnSegment",
  "SlideOnSegment",
  "Angle",
  "KeepOrientation",
  // Dropped from the sweep in dynamic mode and applied as real forces instead
  // (`step_dynamic_simulation`), so `externalForceAt` already carries them.
  "Spring",
  "MotorBeam",
  "MotorAngle",
]);

/** Which nodes carry only links this balance models — see `NodeBalance.covered`. */
function covered_keys(links: Link[]): Set<string> {
  const seen = new Set<string>();
  const foreign = new Set<string>();
  for (const link of links)
    for (const key of position_keys_of(link)) {
      seen.add(key);
      if (!MODELLED_LINK_TYPES.has(link.type)) foreign.add(key);
    }
  for (const key of foreign) seen.delete(key);
  return seen;
}

/** What each beam applies at each of the nodes it touches, in the `LinkReaction` sense
 *  `BeamCohesion` already carries — forces as read, couples flipped (`.m` is the couple the
 *  weld applies ONTO the beam, so the node receives its opposite; see `cohesion-field.ts`). */
function beam_actions(
  specs: BeamCohesionSpec[],
  cohesions: BeamCohesion[],
): Map<string, { force: Point2; moment: number; largest: number }> {
  const specOf = new Map(specs.map((s) => [s.beamID, s]));
  const acc = new Map<string, { force: Point2; moment: number; largest: number }>();
  const add = (key: string, force: Point2, moment: number) => {
    const at = acc.get(key) ?? { force: new Point2(0, 0), moment: 0, largest: 0 };
    at.force = at.force.add(force);
    at.moment += moment;
    at.largest = Math.max(at.largest, force.length());
    acc.set(key, at);
  };

  for (const cohesion of cohesions) {
    const spec = specOf.get(cohesion.beamID);
    if (!spec) continue;
    add(spec.k0, new Point2(cohesion.start.fx, cohesion.start.fy), -cohesion.start.m);
    add(spec.k1, new Point2(cohesion.end.fx, cohesion.end.fy), -cohesion.end.m);
    for (const attached of cohesion.attachedNodes) {
      const key = spec.attachedNodes.find((n) => n.nodeID === attached.nodeID)?.nodeKey;
      // `BeamCohesion.attachedNodes` holds what the BEAM receives; the node receives its
      // opposite.
      if (key) add(key, new Point2(-attached.fx, -attached.fy), 0);
    }
  }
  return acc;
}

/**
 * Each node's share of the beams' OWN mass, which belongs to the beams and not to it.
 *
 * `mass-model.ts` lumps `BEAM_END_MASS_FRACTION` of a beam onto each of its endpoint nodes,
 * so a node's solver mass holds material that is really the beams'. The cohesion torsor is a
 * cut through a CONTINUUM whose whole linear mass `cohesion-field.ts` marches against, so
 * that material sits inside the beam, on the far side of the cut at `0⁺` — counting it again
 * as the node's own would ask the beams to hold their own endpoints up.
 */
function beam_end_lumps(specs: BeamCohesionSpec[]): Map<string, number> {
  const lumps = new Map<string, number>();
  for (const spec of specs)
    for (const key of [spec.k0, spec.k1])
      lumps.set(key, (lumps.get(key) ?? 0) + spec.mass * BEAM_END_MASS_FRACTION);
  return lumps;
}

/**
 * Balance every node the beams touch, for one frame.
 *
 * Pure, and deliberately fed by accessors rather than a snapshot: the keys here are FUSED
 * ones, which a snapshot layout does not index, and the caller is the only one that knows how
 * its own state resolves them (`step_dynamic_simulation` has the maps, a panel has to unfuse).
 *
 * `externalForceAt` is everything applied at a node that is not a beam and not its own weight:
 * loads, spring/damper forces, a motor's force couple — the same map the dynamics step folds
 * into its predict acceleration. Gravity is added here from `inverseMassOf`, so it must NOT be
 * included (`step_dynamic_simulation`'s own `groundedWeights` restatement is a solver
 * artefact and belongs out of it too — an anchored node's weight comes from `groundedMasses`).
 */
export function resolve_node_balance(
  specs: BeamCohesionSpec[],
  cohesions: BeamCohesion[],
  links: Link[],
  masses: DynamicMassModel,
  gravity: Point2,
  accelerationOf: (key: string) => Point2,
  externalForceAt: (key: string) => Point2,
): NodeBalance[] {
  const actions = beam_actions(specs, cohesions);
  const lumps = beam_end_lumps(specs);
  const covered = covered_keys(links);
  // A beam's own midpoint is internal to it — `resolve_beam_cohesion` folds that link's
  // reaction straight into `start`/`end`, so no beam reports an action there and its balance
  // could only ever read as a phantom gap.
  const internal = new Set(specs.map((s) => s.midKey));

  const balances: NodeBalance[] = [];
  for (const [key, action] of actions) {
    if (internal.has(key)) continue;
    const external = externalForceAt(key);
    const inverseMass = masses.posMasses.get(key) ?? 0;
    const atAnchor = inverseMass <= 0;
    // A free node's mass is floored to `MASS_FLOOR` when nothing physical lumps onto it
    // (`mass-model.ts`), which gives it a weight the mechanism does not have. Read from the
    // same map the solve used all the same: the balance checks the readings against the model
    // that produced them, and that phantom is part of it.
    const lumped = atAnchor ? (masses.groundedMasses.get(key) ?? 0) : 1 / inverseMass;
    const mass = Math.max(0, lumped - (lumps.get(key) ?? 0));
    const weight = gravity.mul(mass);
    const applied = action.force.add(external).add(weight);
    const scale = Math.max(action.largest, external.length(), weight.length());

    balances.push({
      key,
      atAnchor,
      residual: atAnchor ? new Point2(0, 0) : applied.sub(accelerationOf(key).mul(mass)),
      momentResidual: atAnchor ? 0 : action.moment,
      reaction: atAnchor ? applied.mul(-1) : undefined,
      reactionMoment: atAnchor ? -action.moment : undefined,
      scale,
      covered: covered.has(key),
    });
  }
  return balances;
}
