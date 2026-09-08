/**
 * A gear's mass properties.
 * It is modelled as a solid disk of uniform surface mass: `m = mₛπr²` and `J = ½mr²`.
 * Both the dynamic mass model and the properties panel's editable inertia read the disk from here, so the field and the solver can never disagree.
 */

/** kg */
export const gear_mass = (surfaceMass: number, radius: number): number =>
  surfaceMass * Math.PI * radius * radius;

/** kg·m² */
export const gear_inertia = (surfaceMass: number, radius: number): number =>
  0.5 * gear_mass(surfaceMass, radius) * radius * radius;

/** The surface mass a gear of `radius` needs to reach `inertia` — the inverse of
 * `gear_inertia`, which the panel's J field writes mₛ through. 0 for a degenerate radius, rather than the infinity the division would give. */
export const surface_mass_for_inertia = (inertia: number, radius: number): number =>
  radius > 0 ? (2 * inertia) / (Math.PI * radius ** 4) : 0;
