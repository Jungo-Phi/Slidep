import { Mechanism, MechanicalElement, Point2 } from "../../../types";
import { ZERO } from "../../../types/point2";
import { arm_angular_velocity } from "./motor-model";

/** One rotating body at a joint. A beam has no angle dof of its own, so its rotation is read off the arm running from the joint to `armKey`; a gear has a real one. */
export type FrictionRotor =
  | { kind: "arm"; armKey: string }
  | { kind: "angle"; angleKey: string };

/**
 * A `slider`/`slidep`/`pivot`'s friction resolved to solver keys, viscous in both cases.
 *
 * Being viscous, a joint resists in proportion to speed and so resists nothing at rest, however large its coefficient: it never sticks, and a part left on a slope creeps down at terminal speed rather than holding.
 */
export type CompiledFriction =
  | {
      kind: "slide";
      /** N·s/m */
      damping: number;
      nodeKey: string;
      railStartKey: string;
      railEndKey: string;
    }
  | {
      kind: "hinge";
      /** N·m·s/rad */
      damping: number;
      pivotKey: string;
      rotor: FrictionRotor;
      /** The body `rotor` rubs against — absent when that body is the ground. */
      housing?: FrictionRotor;
    };

/**
 * The joint's rotating bodies, and which of them is its housing — what the others' rotation is measured against.
 *
 * The housing is the ground when the joint is grounded, the rail on a `slidep`, and otherwise the first body listed.
 * That last case is a convention rather than a reading of the drawing: past two bodies a single drawn pivot stands for a stack of bearings, and no pairing is more correct than another.
 */
function joint_rotors(
  node: Extract<MechanicalElement, { rotationalFriction: number }>,
  byID: Map<string, MechanicalElement>,
  resolve: (key: string) => string,
): { rotors: FrictionRotor[]; housing?: FrictionRotor } {
  const rotors: FrictionRotor[] = [];

  // The rail first: the housing is the first body listed.
  const railID = "parentBeamID" in node ? node.parentBeamID : undefined;
  const rail = railID !== undefined ? byID.get(railID) : undefined;
  if (rail && "positionStart" in rail) {
    // The nearer rail end can sit right on the joint, leaving no arm to read a rotation off.
    const farther =
      node.position.distance_to(rail.positionStart) >
      node.position.distance_to(rail.positionEnd)
        ? "start"
        : "end";
    rotors.push({ kind: "arm", armKey: resolve(`${rail.id}:${farther}`) });
  }

  for (const edgeID of node.rotatingEdgesIDs) {
    const edge = byID.get(edgeID);
    if (!edge || !("positionStart" in edge)) continue;
    const far =
      edge.fixedNodeStartID === node.id
        ? "end"
        : edge.fixedNodeEndID === node.id
          ? "start"
          : undefined;
    if (far === undefined) continue;
    rotors.push({ kind: "arm", armKey: resolve(`${edge.id}:${far}`) });
  }

  // Not resolved through `keyMap`: a gear's angle dof is never fused, unlike the position key that shares its name.
  for (const gearID of node.fixedGearsIDs)
    rotors.push({ kind: "angle", angleKey: gearID });

  if (node.isGrounded) return { rotors };
  return { rotors: rotors.slice(1), housing: rotors[0] };
}

/** Every frictional joint of the mechanism, against the fused keys the dynamic solve uses. A joint whose coefficient is zero is left out, so an ideal mechanism costs nothing per substep. */
export function compile_frictions(
  mechanism: Mechanism,
  keyMap: Map<string, string>,
): CompiledFriction[] {
  const resolve = (key: string) => keyMap.get(key) ?? key;
  const byID = new Map<string, MechanicalElement>(
    mechanism.mechanicalElements.map((el) => [el.id, el]),
  );

  const compiled: CompiledFriction[] = [];
  for (const element of mechanism.mechanicalElements) {
    if (
      "slidingFriction" in element &&
      element.slidingFriction > 0 &&
      element.parentBeamID !== undefined
    ) {
      const rail = byID.get(element.parentBeamID);
      if (rail && "positionStart" in rail)
        compiled.push({
          kind: "slide",
          damping: element.slidingFriction,
          nodeKey: resolve(element.id),
          railStartKey: resolve(`${rail.id}:start`),
          railEndKey: resolve(`${rail.id}:end`),
        });
    }

    if ("rotationalFriction" in element && element.rotationalFriction > 0) {
      const { rotors, housing } = joint_rotors(element, byID, resolve);
      const pivotKey = resolve(element.id);
      for (const rotor of rotors)
        compiled.push({
          kind: "hinge",
          damping: element.rotationalFriction,
          pivotKey,
          rotor,
          housing,
        });
    }
  }
  return compiled;
}

/**
 * Inverse inertia a rotor opposes to a torque about the joint, 0 for an anchored one.
 *
 * An arm rotor is approximated by its far end's lumped mass at the current radius, which understates a beam's own distributed inertia — only ever read as the stability bound in `resolve_friction_forces`, never as the friction itself.
 */
function rotor_inverse_inertia(
  rotor: FrictionRotor,
  radius: number,
  posMasses: Map<string, number>,
  angleMasses: Map<string, number>,
): number {
  if (rotor.kind === "angle") return angleMasses.get(rotor.angleKey) ?? 0;
  const w = posMasses.get(rotor.armKey) ?? 0;
  return radius > 0 ? w / (radius * radius) : 0;
}

function rotor_omega(
  rotor: FrictionRotor,
  pivotKey: string,
  positions: Map<string, Point2>,
  velocities: Map<string, Point2>,
  angleVelocities: Map<string, number>,
): number | undefined {
  return rotor.kind === "angle"
    ? (angleVelocities.get(rotor.angleKey) ?? 0)
    : arm_angular_velocity(pivotKey, rotor.armKey, positions, velocities);
}

/** Distance from the joint to an arm rotor's far end — 0 for an angle rotor, which needs none. */
function rotor_radius(
  rotor: FrictionRotor,
  pivotKey: string,
  positions: Map<string, Point2>,
): number {
  if (rotor.kind === "angle") return 0;
  const pivot = positions.get(pivotKey);
  const arm = positions.get(rotor.armKey);
  return pivot && arm ? arm.sub(pivot).length() : 0;
}

/**
 * The force and torque each frictional joint exerts this substep, from live positions and pre-predict velocities — call it every substep, like `resolve_load_forces`.
 *
 * Each coefficient is capped at `m_eff / dt` (`J_eff / dt` for a hinge), the value that brings its own relative velocity exactly to zero within the substep.
 * A coefficient above that cap is one an explicit integration would overshoot, growing each step instead of dying out, and nothing stops a user typing one.
 * The cap only ever weakens friction and never reverses a velocity, so it cannot inject energy.
 */
export function resolve_friction_forces(
  compiled: CompiledFriction[],
  dt: number,
  positions: Map<string, Point2>,
  velocities: Map<string, Point2>,
  angleVelocities: Map<string, number>,
  posMasses: Map<string, number>,
  angleMasses: Map<string, number>,
): { forces: Map<string, Point2>; torques: Map<string, number> } {
  const forces = new Map<string, Point2>();
  const torques = new Map<string, number>();
  const add_force = (key: string, v: Point2) => {
    const prev = forces.get(key);
    forces.set(key, prev ? prev.add(v) : v);
  };
  // A beam has no angle dof, so a torque on one lands as a force couple across its own arm.
  const add_torque = (
    rotor: FrictionRotor,
    radius: number,
    pivotKey: string,
    torque: number,
  ) => {
    if (rotor.kind === "angle") {
      torques.set(rotor.angleKey, (torques.get(rotor.angleKey) ?? 0) + torque);
      return;
    }
    if (radius <= 0) return;
    const pivot = positions.get(pivotKey);
    const arm = positions.get(rotor.armKey);
    if (!pivot || !arm) return;
    const F = arm.sub(pivot).perp().mul(torque / (radius * radius));
    add_force(rotor.armKey, F);
    add_force(pivotKey, F.mul(-1));
  };

  if (dt <= 0) return { forces, torques };

  for (const friction of compiled) {
    if (friction.kind === "slide") {
      const start = positions.get(friction.railStartKey);
      const end = positions.get(friction.railEndKey);
      const node = positions.get(friction.nodeKey);
      if (!start || !end || !node) continue;
      const delta = end.sub(start);
      const length = delta.length();
      if (length < 1e-9) continue;
      const axis = delta.mul(1 / length);
      const t = Math.max(0, Math.min(1, node.parameter_on_segment(start, end)));

      const vStart = velocities.get(friction.railStartKey) ?? ZERO;
      const vEnd = velocities.get(friction.railEndKey) ?? ZERO;
      const vRel = (velocities.get(friction.nodeKey) ?? ZERO)
        .sub(vStart.lerp(vEnd, t))
        .dot(axis);
      if (vRel === 0) continue;

      // The inverse-mass split `projectOnSegment` uses, so friction sees the mass the rail really opposes to a slide.
      const wNode = posMasses.get(friction.nodeKey) ?? 0;
      const wStart = posMasses.get(friction.railStartKey) ?? 0;
      const wEnd = posMasses.get(friction.railEndKey) ?? 0;
      const invMass = wNode + wStart * (1 - t) * (1 - t) + wEnd * t * t;
      if (invMass <= 0) continue; // node and rail both anchored: nothing can slide
      const c = Math.min(friction.damping, 1 / (invMass * dt));

      const F = axis.mul(-c * vRel);
      add_force(friction.nodeKey, F);
      // Split at the contact abscissa, which reproduces the reaction's moment as well as its resultant.
      add_force(friction.railStartKey, F.mul(-(1 - t)));
      add_force(friction.railEndKey, F.mul(-t));
      continue;
    }

    const { rotor, housing, pivotKey } = friction;
    const rotorOmega = rotor_omega(rotor, pivotKey, positions, velocities, angleVelocities);
    if (rotorOmega === undefined) continue;
    const housingOmega = housing
      ? rotor_omega(housing, pivotKey, positions, velocities, angleVelocities)
      : 0;
    if (housingOmega === undefined) continue;
    const omegaRel = rotorOmega - housingOmega;
    if (omegaRel === 0) continue;

    const rotorRadius = rotor_radius(rotor, pivotKey, positions);
    const housingRadius = housing ? rotor_radius(housing, pivotKey, positions) : 0;
    const invInertia =
      rotor_inverse_inertia(rotor, rotorRadius, posMasses, angleMasses) +
      (housing
        ? rotor_inverse_inertia(housing, housingRadius, posMasses, angleMasses)
        : 0);
    if (invInertia <= 0) continue; // both sides anchored: nothing can turn
    const c = Math.min(friction.damping, 1 / (invInertia * dt));

    const torque = -c * omegaRel;
    add_torque(rotor, rotorRadius, pivotKey, torque);
    // Newton's third law; the ground absorbs it instead when there is no housing.
    if (housing) add_torque(housing, housingRadius, pivotKey, -torque);
  }

  return { forces, torques };
}

/**
 * Power every frictional joint bleeds off in the state given — always ≥ 0, energy LEAVING the mechanism, like a damper's own term in `EnergySample`.
 *
 * Read from the coefficients themselves, so a joint whose substep was capped reports what the model asks for rather than what the solve allowed.
 */
export function friction_power(
  compiled: CompiledFriction[],
  positions: Map<string, Point2>,
  velocities: Map<string, Point2>,
  angleVelocities: Map<string, number>,
): number {
  let power = 0;
  for (const friction of compiled) {
    if (friction.kind === "slide") {
      const start = positions.get(friction.railStartKey);
      const end = positions.get(friction.railEndKey);
      const node = positions.get(friction.nodeKey);
      if (!start || !end || !node) continue;
      const delta = end.sub(start);
      const length = delta.length();
      if (length < 1e-9) continue;
      const t = Math.max(0, Math.min(1, node.parameter_on_segment(start, end)));
      const vRel = (velocities.get(friction.nodeKey) ?? ZERO)
        .sub((velocities.get(friction.railStartKey) ?? ZERO).lerp(
          velocities.get(friction.railEndKey) ?? ZERO,
          t,
        ))
        .dot(delta.mul(1 / length));
      power += friction.damping * vRel * vRel;
      continue;
    }
    const { rotor, housing, pivotKey } = friction;
    const rotorOmega = rotor_omega(rotor, pivotKey, positions, velocities, angleVelocities);
    if (rotorOmega === undefined) continue;
    const housingOmega = housing
      ? rotor_omega(housing, pivotKey, positions, velocities, angleVelocities)
      : 0;
    if (housingOmega === undefined) continue;
    const omegaRel = rotorOmega - housingOmega;
    power += friction.damping * omegaRel * omegaRel;
  }
  return power;
}
