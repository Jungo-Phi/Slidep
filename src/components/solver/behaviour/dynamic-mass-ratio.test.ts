import { describe, expect, it } from "vitest";
import cpJson from "../../../../test-mechanisms/CP.slidep?raw";
import { load_mechanism } from "../../../utils/load-mechanism";
import { Mechanism, Point2 } from "../../../types";
import type { BeamElement, ID, MassElement, PivotElement } from "../../../types/element";
import { DynamicSnapshot } from "../../../types/runtime-state";
import { RECORD_DT, compile_simulation_model, step_dynamic_simulation } from "../dynamics/simulation-engine";
import { snapshot_point } from "../snapshot";

// CP.slidep: a grounded joint carrying a light beam, with a pivot rigidly riding that beam's
// own midpoint (FixedOnSegment) and free to rotate, and a second beam from that pivot to a
// hanging mass. A rigid constraint's position accuracy should not depend on what it is asked
// to hold — only the reaction (force) does — so the pivot straying off the beam's midpoint is
// purely a measure of how well the solver converged, not of anything physical.
//
// Today it does depend on the mass: `DYNAMIC_SWEEPS` runs a FIXED Gauss-Seidel sweep count per
// substep with no residual-based exit (`PBD_kinematic_solver.ts`'s `if (!dynamics)` gate around
// `maxError < epsilon`), unlike kinematic mode, which iterates to that same residual regardless
// of mass ratio. A heavier hanging mass makes the pivot/heavy-mass ratio more extreme, Gauss-
// Seidel converges proportionally slower, and the FIXED budget leaves a proportionally bigger
// residual behind — see the conversation this test comes out of. These tests pin the target:
// residual bounded, and roughly mass-independent, the way kinematic mode already is. They are
// expected to FAIL until dynamics gets an equivalent residual-based exit (with a raised sweep
// ceiling to actually use it) — see PBD_kinematic_solver.ts:900-916.

const GRAVITY = new Point2(0, -9.81);

function load_cp(): Mechanism {
  return load_mechanism(JSON.parse(cpJson)).mechanism;
}

/** CP.slidep's pivot: the one whose beam is attached to it via `fixedNodesBodyIDs`
 *  (rigidly riding that beam's body, free to rotate — see the constraint it owes). */
function find_pivot_and_beam1(mech: Mechanism): { pivot: PivotElement; beam1: BeamElement } {
  const pivot = mech.mechanicalElements.find((e): e is PivotElement => e.type === "pivot")!;
  const beam1 = mech.mechanicalElements.find(
    (e): e is BeamElement => e.type === "beam" && e.fixedNodesBodyIDs.includes(pivot.id),
  )!;
  return { pivot, beam1 };
}

/** CP.slidep's heavy hanging mass: the `mass` element NOT directly on beam1 (it hangs off
 *  the secondary beam attached at the pivot). */
function find_heavy_mass(mech: Mechanism, beam1: BeamElement): MassElement {
  return mech.mechanicalElements.find(
    (e): e is MassElement => e.type === "mass" && !e.fixedEdgesIDs.includes(beam1.id),
  )!;
}

function with_mass(mech: Mechanism, massID: ID, mass: number): Mechanism {
  return {
    ...mech,
    mechanicalElements: mech.mechanicalElements.map((e) =>
      e.id === massID ? { ...e, mass } : e,
    ),
  };
}

/** How far the pivot strays from the midpoint of beam1's own solved segment: the
 *  FixedOnSegment residual the pivot is supposed to hold at (near) zero every frame. */
function pivot_residual(snapshot: DynamicSnapshot, beam1: ID, pivot: ID): number {
  const s = snapshot_point(snapshot, `${beam1}:start`)!;
  const e = snapshot_point(snapshot, `${beam1}:end`)!;
  const p = snapshot_point(snapshot, pivot)!;
  return p.distance_to(s.lerp(e, 0.5));
}

/** Runs CP.slidep (with its hanging mass swapped) under the solver's own DEFAULTS — no
 *  `sweeps`/`substeps` override — and returns the pivot residual's worst frame. */
function worst_pivot_residual(mech: Mechanism, frames: number): number {
  const { pivot, beam1 } = find_pivot_and_beam1(mech);
  const model = compile_simulation_model(mech);
  let snapshot: DynamicSnapshot | null = null;
  let worst = 0;
  for (let i = 0; i < frames; i++) {
    snapshot = step_dynamic_simulation(model, i * RECORD_DT, snapshot, RECORD_DT, GRAVITY);
    worst = Math.max(worst, pivot_residual(snapshot, beam1.id, pivot.id));
  }
  return worst;
}

// Known remaining limit, not asserted below: the sweep budget is a CEILING, not infinite. Past
// roughly 300 kg on this specific mechanism (its lightest member is ~0.005 m, so the mass
// ratio climbs past ~40 000:1) Gauss-Seidel's own convergence rate is slow enough that even
// the raised ceiling no longer closes the gap — at mass=1000 the worst residual is still 1.7e-2,
// well past the 10% tolerance below. Pushing the ceiling further buys some of it back (25 → 200
// sweeps already took mass=1000 from 8.5e-2 to 1.7e-2) but at steep, diminishing-returns cost —
// a genuinely mass-independent solve (pre-conditioning, or a direct solve for the stiff
// sub-chain) is a different, bigger fix than this one.
describe("dynamics-mode pivot residual on a heavy mass ratio (CP.slidep)", () => {
  it("stays within a small fraction of the mechanism's own scale, light or at CP.slidep's own mass", () => {
    const base = load_cp();
    const { beam1 } = find_pivot_and_beam1(base);
    const heavy = find_heavy_mass(base, beam1);
    const model = compile_simulation_model(base);
    const tolerance = model.extent * 0.1; // 10% of the mechanism's own scale — generous, but
    // close to two orders of magnitude tighter than the fixed 25-sweep budget left (1.05e-2
    // at CP.slidep's own 100 kg).

    for (const mass of [1, 100])
      expect(worst_pivot_residual(with_mass(base, heavy.id, mass), 40)).toBeLessThan(tolerance);
  });
});
