import { Mechanism } from "../../types";
import { DEFAULT } from "../../constants/physics-specs";
import { beam_linear_mass } from "../../utils/section-properties";
import { gear_inertia, gear_mass } from "../../utils/gear-mass";

/**
 * Real inverse masses for the dynamic step, as opposed to the binary 0/1 (`grounded`/`free`)
 * every other mode solves with.
 *
 * Kept OUT of edition and kinematic mode on purpose: a gear's mass grows with its area, so a
 * large gear next to a short beam link is not a 2× or 5× difference but routinely 100×–500×
 * (measured across the bundled test mechanisms) — enough to make the big gear read as
 * pinned in place for a reason that has nothing to do with being grounded. Dynamic mode is
 * the only one whose whole point is that mass matters.
 */
export interface DynamicMassModel {
  /** Inverse mass (1/kg), one per solver position key, fused keys already summed. */
  posMasses: Map<string, number>;
  /** Inverse rotational inertia (1/(kg·m²)), one per gear id — see `SimNodes.wAngle`. */
  angleMasses: Map<string, number>;
  /**
   * Real (non-inverse) mass of each ANCHORED key, lumped the same way as `posMasses` — but
   * unfloored: an anchor with nothing physical attached (a bare grounded pivot/join) is 0 kg,
   * not `MASS_FLOOR`, so it never grows a phantom weight. Absent for a free key, since a free
   * node's own weight already comes out of the predict step's mass-independent acceleration
   * (see `PBD_kinematic_solver`) and needs no force-based restatement.
   */
  groundedMasses: Map<string, number>;
  /**
   * One entry per beam with positive mass, giving `dynamics`-only nodes and links the shape
   * needed to reproduce the beam's own rotational inertia — see `BEAM_END_MASS_FRACTION`.
   * `startKey`/`endKey` are already fused (`compile_simulation_model`'s Coincidence pass);
   * `midKey` (`${beamId}:mid`) never is, since nothing else can ever share it. Read only by
   * `step_dynamic_simulation`, which pins `midKey` onto the live segment each frame with a
   * `FixedOnSegment` link — kinematic/edition solves never see it, same reasoning as the rest
   * of this model.
   */
  beamMidpoints: { midKey: string; startKey: string; endKey: string }[];
}

/**
 * Share of a beam's own mass lumped at each of its two endpoints, the rest (`1 −
 * 2×BEAM_END_MASS_FRACTION`) at its midpoint — the split that makes a straight uniform rod's
 * moment of inertia about its centre come out exactly right from three point masses instead
 * of two. Two masses (½ at each end) can only place mass at the extremes, which over-states
 * `J_centre` threefold (`mL²/4` vs the real `mL²/12`); solving `2·f·(L/2)² = L²/12` for `f`
 * gives this fraction, with `1 − 2f = 2/3` left over for the midpoint.
 */
export const BEAM_END_MASS_FRACTION = 1 / 6;

/**
 * Fallback mass for a node with NOTHING physical lumped onto it — an isolated point, or one
 * connected only to springs/dampers, neither of which carries mass of its own — so it never
 * divides by zero. Reuses the point-mass default rather than inventing a separate constant: a
 * node with nothing to lump onto it behaves like an implicit 1 kg point mass.
 *
 * Only ever substituted for an EXACT zero (`floored_mass` below) — a small but real lumped
 * mass (a light beam's own midpoint, `mass-model.ts`'s `BEAM_END_MASS_FRACTION` share) must
 * stay exactly what it is, however far under 1 kg: flooring it too inflates that beam's own
 * self-weight/inertia by however much 1 kg exceeds its true mass, silently, in both the
 * dynamics itself and anything reading its reactions (`beam-cohesion.ts`).
 */
const MASS_FLOOR = DEFAULT.MASS;

/** `mass`, unless it is exactly zero (nothing physical lumped there) — see `MASS_FLOOR`. */
const floored_mass = (mass: number): number => (mass > 0 ? mass : MASS_FLOOR);

/**
 * Lumps each element's mass onto its own solver key(s) — half to each end of a beam, all of
 * it onto a gear's own node, a `MassElement`'s own value onto its node — then folds fused
 * keys together via `keyMap`, exactly like `compile_simulation_model` folded the positions
 * those keys belong to. Has to run AFTER that fusion decision (not on the raw mechanism):
 * three beams meeting at one welded point are one node whose mass is the sum of all three
 * halves, and nothing before fusion knows they are the same node.
 *
 * `anchoredMasses` is the model's own (fused) binary `posMasses` — read only for its zeros:
 * grounded means fixed position, not zero mass, so a grounded key is forced to `w = 0`
 * regardless of what lumps onto it, the same as everywhere else in the solver.
 */
export function compute_dynamic_mass_model(
  mechanism: Mechanism,
  keyMap: Map<string, string>,
  anchoredMasses: Map<string, number>,
): DynamicMassModel {
  const lumped = new Map<string, number>();
  const add = (key: string, mass: number) => {
    const fused = keyMap.get(key) ?? key;
    lumped.set(fused, (lumped.get(fused) ?? 0) + mass);
  };

  const angleMasses = new Map<string, number>();
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
      // The gear's own node carries the mass; its angle DOF is a separate solver variable and
      // gets the matching inertia.
      const inertia = gear_inertia(element.surfaceMass, element.radius);
      angleMasses.set(element.id, inertia > 0 ? 1 / inertia : 0);
    } else if (element.type === "mass") {
      add(element.id, element.mass);
    }
    // Springs, dampers, belts, pivots/slideps/joins carry no mass of their own — see the
    // plan's decisions: they only ever appear as the OTHER end of something that does.
  }

  const posMasses = new Map<string, number>();
  const groundedMasses = new Map<string, number>();
  for (const [key, w] of anchoredMasses) {
    if (w === 0) {
      posMasses.set(key, 0);
      groundedMasses.set(key, lumped.get(key) ?? 0);
      continue;
    }
    posMasses.set(key, 1 / floored_mass(lumped.get(key) ?? 0));
  }
  // A beam's midpoint is never a real element key, so it never goes through the anchored
  // branch above — it has nothing to be grounded BY, only mass to resist being moved.
  for (const { midKey } of beamMidpoints)
    posMasses.set(midKey, 1 / floored_mass(lumped.get(midKey) ?? 0));

  return { posMasses, angleMasses, groundedMasses, beamMidpoints };
}
