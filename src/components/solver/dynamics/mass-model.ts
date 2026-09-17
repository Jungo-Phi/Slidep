import { Link, Mechanism } from "../../../types";
import { DEFAULT } from "../../../constants/physics-specs";
import { position_keys_of } from "../kinematics/link-slots";
import { beam_linear_mass } from "../../../utils/section-properties";
import { gear_inertia, gear_mass } from "../../../utils/gear-mass";

/**
 * Real inverse masses for the dynamic step, as opposed to the binary 0/1 (`grounded`/`free`) every other mode solves with.
 *
 * Kept OUT of edition and kinematic mode on purpose: a gear's mass grows with its area, so a large gear next to a short beam link is not a 2× or 5× difference but routinely 100×–500× (measured across the bundled test mechanisms) — enough to make the big gear read as pinned in place for a reason that has nothing to do with being grounded.
 * Dynamic mode is the only one whose whole point is that mass matters.
 */
export interface DynamicMassModel {
  /** Inverse mass (1/kg), one per solver position key, fused keys already summed. */
  posMasses: Map<string, number>;
  /** Inverse rotational inertia (1/(kg·m²)), one per gear id — see `SimNodes.wAngle`. */
  angleMasses: Map<string, number>;
  /**
   * Real (non-inverse) mass of each ANCHORED key, lumped the same way as `posMasses` — but unfloored: an anchor with nothing physical attached (a bare grounded pivot/join) is 0 kg, not `MASS_FLOOR`, so it never grows a phantom weight.
   * Absent for a free key, since a free node's own weight already comes out of the predict step's mass-independent acceleration (see `PBD_kinematic_solver`) and needs no force-based restatement.
   */
  groundedMasses: Map<string, number>;
  /**
   * Keys whose `posMasses` entry is `MASS_FLOOR` alone and which no constraint ever projects: a passive follower's node (`mark_passive_belt_pins`) is placed by its belt and has a say in nothing.
   * Readings leave that mass out, since the mechanism does not have it, while the solve keeps it: a collision link appearing mid-run would divide by it.
   */
  phantomKeys: Set<string>;
  /**
   * Position keys whose mass is the floor alone (`MASS_FLOOR_SHARE`), and gear ids whose inertia is (`INERTIA_FLOOR_SHARE`) — the mechanism gave them none.
   * What tells an invented mass from a real one: a motion moving nothing else carries no inertia at all, whatever `posMasses` reads.
   */
  flooredKeys: Set<string>;
  flooredAngles: Set<string>;
  /**
   * One entry per beam with positive mass, giving `dynamics`-only nodes and links the shape needed to reproduce the beam's own rotational inertia — see `BEAM_END_MASS_FRACTION`.
   * `startKey`/`endKey` are already fused (`compile_simulation_model`'s Coincidence pass); `midKey` (`${beamId}:mid`) never is, since nothing else can ever share it.
   * Read only by `step_dynamic_simulation`, which pins `midKey` onto the live segment each frame with a `FixedOnSegment` link — kinematic/edition solves never see it, same reasoning as the rest of this model.
   */
  beamMidpoints: { midKey: string; startKey: string; endKey: string }[];
}

/**
 * Share of a beam's own mass lumped at each of its two endpoints, the rest (`1 − 2×BEAM_END_MASS_FRACTION`) at its midpoint — the split that makes a straight uniform rod's moment of inertia about its centre come out exactly right from three point masses instead of two.
 * Two masses (½ at each end) can only place mass at the extremes, which over-states `J_centre` threefold (`mL²/4` vs the real `mL²/12`); solving `2·f·(L/2)² = L²/12` for `f` gives this fraction, with `1 − 2f = 2/3` left over for the midpoint.
 */
export const BEAM_END_MASS_FRACTION = 1 / 6;

/**
 * Share of what a degree of freedom is rigidly tied to that it is given when it carries nothing of its own — an isolated point, one held only by springs/dampers, a gear with no surface mass — so the solve never divides by zero.
 * One share for masses and inertias alike: both answer the same question, and a gear's rim drags whatever its centre is tied to at `m·r²`.
 * Relative rather than absolute, because what makes a floor harmless is being small next to what it trades momentum with: a kilogram lent to a gram-scale mechanism outweighs the mechanism itself, and its weight and kinetic energy then dominate every reading taken off the solve.
 *
 * Only ever substituted for an EXACT zero (`floor_for` below) — a small but real lumped mass (a light beam's own midpoint, `BEAM_END_MASS_FRACTION`'s share) must stay exactly what it is, however small: flooring it too inflates that beam's own self-weight and inertia, silently, in both the dynamics and anything reading its reactions (`beam-cohesion.ts`).
 *
 * A hundredth is where two measured limits meet, and the room between them is narrower than it looks.
 * Above it, the floor is felt: at a tenth a weightless limb already slows the pendulum carrying it by a tenth of its swing.
 * Below it, the mass ratio outruns the sweep budget: measured on `Test slider`, whose slider rides a rail it is welded across, a hundredth clears every frame at 400 sweeps while a thousandth still leaves a `SlideOnSegment` unsatisfied at eight times that budget.
 */
const FLOOR_SHARE = 1e-2;

/** Reference for a node tied to no mass at all: nothing in the mechanism says what scale it should answer to, so the point-mass default stands in. */
const MASS_FLOOR_FALLBACK = DEFAULT.MASS;

/**
 * Lightest mass each of `targets` is rigidly tied to, widened link by link until one is found.
 * Springs and dampers are left out: they pull a node without holding it, so the mass at their far end says nothing about what this one has to answer to.
 */
function tied_masses(
  links: Link[],
  lumped: Map<string, number>,
  targets: Iterable<string>,
): Map<string, number> {
  const neighbours = new Map<string, Set<string>>();
  for (const link of links) {
    if (link.type === "Spring") continue;
    const keys = position_keys_of(link);
    for (const key of keys)
      for (const other of keys) {
        if (other === key) continue;
        let set = neighbours.get(key);
        if (!set) neighbours.set(key, (set = new Set()));
        set.add(other);
      }
  }

  const found = new Map<string, number>();
  for (const target of targets) {
    const seen = new Set([target]);
    let frontier = [target];
    while (frontier.length > 0) {
      const next: string[] = [];
      let lightest = Infinity;
      for (const key of frontier)
        for (const other of neighbours.get(key) ?? []) {
          if (seen.has(other)) continue;
          seen.add(other);
          const mass = lumped.get(other) ?? 0;
          if (mass > 0) lightest = Math.min(lightest, mass);
          else next.push(other);
        }
      if (Number.isFinite(lightest)) {
        found.set(target, lightest);
        break;
      }
      frontier = next;
    }
  }
  return found;
}

/**
 * Smallest mass an explicitly integrated spring or damper stays stable on at `dt`: `k·dt²/4` holds `ω·dt ≤ 2`, and `b·dt/2` keeps a damping step from overshooting.
 * A node this light is a model the mechanism cannot answer for, and the reading owes the user a word about it — this bound only keeps the solve from blowing up meanwhile.
 */
function compliance_floors(
  mechanism: Mechanism,
  keyMap: Map<string, string>,
  dt: number,
): Map<string, number> {
  const floors = new Map<string, number>();
  const raise = (key: string, mass: number) => {
    const fused = keyMap.get(key) ?? key;
    floors.set(fused, Math.max(floors.get(fused) ?? 0, mass));
  };
  for (const element of mechanism.mechanicalElements) {
    const mass =
      element.type === "spring"
        ? (element.stiffness * dt * dt) / 4
        : element.type === "damper"
          ? (element.damping * dt) / 2
          : 0;
    if (mass <= 0) continue;
    raise(`${element.id}:start`, mass);
    raise(`${element.id}:end`, mass);
  }
  return floors;
}


/**
 * Lumps each element's mass onto its own solver key(s) — half to each end of a beam, all of it onto a gear's own node, a `MassElement`'s own value onto its node — then folds fused keys together via `keyMap`, exactly like `compile_simulation_model` folded the positions those keys belong to.
 * Has to run AFTER that fusion decision (not on the raw mechanism): three beams meeting at one welded point are one node whose mass is the sum of all three halves, and nothing before fusion knows they are the same node.
 *
 * `anchoredMasses` is the model's own (fused) binary `posMasses` — read only for its zeros: grounded means fixed position, not zero mass, so a grounded key is forced to `w = 0` regardless of what lumps onto it, the same as everywhere else in the solver.
 */
export function compute_dynamic_mass_model(
  mechanism: Mechanism,
  keyMap: Map<string, string>,
  anchoredMasses: Map<string, number>,
  /** Already-fused keys a one-way follower places and nothing else projects — see `phantomKeys`. */
  passiveKeys: ReadonlySet<string> = new Set(),
  /** The fused links, read for what each massless node is rigidly tied to — see `MASS_FLOOR_SHARE`. */
  links: Link[] = [],
  /** One substep of the dynamics, which is what the compliance bound of `compliance_floors` answers to. */
  substepDt: number = 0,
): DynamicMassModel {
  const lumped = new Map<string, number>();
  const add = (key: string, mass: number) => {
    const fused = keyMap.get(key) ?? key;
    lumped.set(fused, (lumped.get(fused) ?? 0) + mass);
  };

  const gearInertias: { id: string; radius: number; inertia: number }[] = [];
  const beamMidpoints: { midKey: string; startKey: string; endKey: string }[] = [];

  for (const element of mechanism.mechanicalElements) {
    if (element.type === "beam") {
      const linearMass = beam_linear_mass(
        element.materialID,
        element.profileID,
        mechanism.materials,
        mechanism.profiles,
      );
      const mass =
        linearMass * element.positionStart.distance_to(element.positionEnd);
      add(`${element.id}:start`, mass * BEAM_END_MASS_FRACTION);
      add(`${element.id}:end`, mass * BEAM_END_MASS_FRACTION);
      if (mass > 0) {
        const midKey = `${element.id}:mid`;
        add(midKey, mass * (1 - 2 * BEAM_END_MASS_FRACTION));
        beamMidpoints.push({
          midKey,
          startKey: keyMap.get(`${element.id}:start`) ?? `${element.id}:start`,
          endKey: keyMap.get(`${element.id}:end`) ?? `${element.id}:end`,
        });
      }
    } else if (element.type === "gear") {
      add(element.id, gear_mass(element.surfaceMass, element.radius));
      // The gear's own node carries the mass; its angle DOF is a separate solver variable and gets the matching inertia.
      gearInertias.push({
        id: element.id,
        radius: element.radius,
        inertia: gear_inertia(element.surfaceMass, element.radius),
      });
    } else if (element.type === "mass") {
      add(element.id, element.mass);
    }
    // Springs, dampers, belts, pivots/slideps/joins carry no mass of their own — see the plan's decisions: they only ever appear as the OTHER end of something that does.
  }

  const massless: string[] = [];
  for (const [key, w] of anchoredMasses)
    if (w !== 0 && (lumped.get(key) ?? 0) === 0) massless.push(key);
  // A gear with no inertia asks the same question of the same graph: what its own centre is tied to is what its rim would have to drag.
  const spinless = gearInertias
    .filter(({ inertia }) => inertia <= 0)
    .map(({ id }) => keyMap.get(id) ?? id);
  const tied = tied_masses(links, lumped, [...massless, ...spinless]);
  const compliance = compliance_floors(mechanism, keyMap, substepDt);

  /** `mass`, unless it is exactly zero (nothing physical lumped there) — see `FLOOR_SHARE`. */
  const floor_for = (key: string, mass: number): number =>
    mass > 0
      ? mass
      : Math.max(
          FLOOR_SHARE * (tied.get(key) ?? MASS_FLOOR_FALLBACK),
          compliance.get(key) ?? 0,
        );

  const angleMasses = new Map<string, number>();
  const flooredAngles = new Set<string>();
  for (const { id, radius, inertia } of gearInertias) {
    // A mass held `r` away weighs `m·r²` against a rotation, which is what reads the tie found in kilograms as the inertia a spin answers to.
    const tiedMass = tied.get(keyMap.get(id) ?? id);
    const reference =
      tiedMass !== undefined
        ? tiedMass * radius * radius
        : gear_inertia(DEFAULT.SURFACE_MASS, radius);
    const floored = inertia > 0 ? inertia : FLOOR_SHARE * reference;
    if (inertia <= 0) flooredAngles.add(id);
    angleMasses.set(id, floored > 0 ? 1 / floored : 0);
  }

  const posMasses = new Map<string, number>();
  const groundedMasses = new Map<string, number>();
  const phantomKeys = new Set<string>();
  const flooredKeys = new Set<string>();
  for (const [key, w] of anchoredMasses) {
    const mass = lumped.get(key) ?? 0;
    if (w === 0) {
      posMasses.set(key, 0);
      groundedMasses.set(key, mass);
      continue;
    }
    if (mass === 0) {
      flooredKeys.add(key);
      if (passiveKeys.has(key)) phantomKeys.add(key);
    }
    posMasses.set(key, 1 / floor_for(key, mass));
  }
  // A beam's midpoint is never a real element key, so it never goes through the anchored branch above — it has nothing to be grounded BY, only mass to resist being moved.
  for (const { midKey } of beamMidpoints)
    posMasses.set(midKey, 1 / floor_for(midKey, lumped.get(midKey) ?? 0));

  return {
    posMasses,
    angleMasses,
    groundedMasses,
    phantomKeys,
    flooredKeys,
    flooredAngles,
    beamMidpoints,
  };
}
