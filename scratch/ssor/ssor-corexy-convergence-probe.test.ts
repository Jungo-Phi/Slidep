import { describe, it } from "vitest";
import { appendFileSync } from "node:fs";
import coreXyJson from "../../test-mechanisms/Core XY.slidep?raw";
import { Point2 } from "../../src/types";
import { KinematicSnapshot } from "../../src/types/runtime-state";
import { load_mechanism } from "../../src/utils/load-mechanism";
import { compile_simulation_model, step_simulation } from "../../src/components/solver/simulation-engine";
import { collect_solver_trace } from "../../src/components/solver/solver-trace";

/**
 * Core XY has no closed belt, but the un-tightened `perchain` criterion still pinned it
 * whole (see ssor-coverage.test.ts): a real convergence measurement, not just a link
 * count, is needed to show what tightening the criterion actually buys it.
 *
 * `sweeps` — how many sweeps `step_simulation` actually ran before its own "motion" exit
 * fired, read straight off `collect_solver_trace` (max event iteration + 1), the same
 * quantity `PBD_kinematic_solver.ts`'s own early-exit doc uses to talk about convergence
 * speed on this exact mechanism (its reference case for the r ≈ 0.98 spectral radius).
 *
 * It turns out NOT to be the discriminating number here: driven continuously, Core XY
 * already exhausts the 200-sweep production budget (`SIMULATION_SWEEPS`) every frame from
 * frame 1 onward under today's fixed sweep order — r ≈ 0.98 means it was never finishing
 * early to begin with, alternation or not. Frame 0 (a cold start from the exact drawn rest
 * pose) is the one exception and is excluded below as unrepresentative.
 *
 * So the quantity that actually discriminates is `finalMaxResidual` — the worst per-link
 * residual on the LAST sweep run, i.e. what 200 sweeps of budget actually bought this
 * frame. Same budget spent either way, so a smaller number is strictly a better trade.
 */
describe("SSOR Core XY convergence probe", () => {
  it("Core XY.slidep", () => {
    const mechanism = load_mechanism(JSON.parse(coreXyJson)).mechanism;
    const model = compile_simulation_model(mechanism);
    const belt = mechanism.mechanicalElements.find((e) => e.type === "belt");
    if (!belt || belt.type !== "belt") throw new Error("courroie introuvable");
    const driven = mechanism.mechanicalElements.find(
      (e) => e.id === belt.attachedGearsIDs[0].id,
    );
    if (!driven || driven.type !== "gear") throw new Error("engrenage introuvable");

    const MARKS = [1, 5, 10, 15];
    let prev: KinematicSnapshot | null = null;
    const lines = [`### Core XY convergence — SSOR=${process.env.SLIDEP_SSOR ?? "off"}`];
    for (let i = 0; i < Math.max(...MARKS) + 1; i++) {
      const grab = {
        gearID: driven.id,
        angleOffset: 0,
        radius: driven.radius,
        target: driven.position.add(
          new Point2(
            driven.radius * Math.cos((i + 1) / 20),
            driven.radius * Math.sin((i + 1) / 20),
          ),
        ),
      };
      let snapshot: KinematicSnapshot;
      const events = collect_solver_trace(() => {
        snapshot = step_simulation(model, i / 60, prev, 1 / 60, grab);
      });
      const maxIter = Math.max(...events.map((e) => e.iteration));
      // Reading the LAST sweep alone fixes the parity of the sample. Under alternation the
      // forward and backward passes land on two different iterates, so the residual
      // oscillates between them while its envelope decays — sampling one parity of that
      // can report up to the full oscillation amplitude as a degradation that is not one.
      // The last complete forward+backward PAIR is the parity-free comparison.
      const at = (it: number) =>
        Math.max(
          ...events.filter((e) => e.iteration === it).map((e) => e.residual),
        );
      const last = at(maxIter);
      const prevSweep = maxIter > 0 ? at(maxIter - 1) : last;
      if (MARKS.includes(i))
        lines.push(
          `frame=${i}\tsweeps=${maxIter + 1}\tdernier=${last.toExponential(3)}\tavant-dernier=${prevSweep.toExponential(3)}\tmin-de-la-paire=${Math.min(last, prevSweep).toExponential(3)}`,
        );
      prev = snapshot!;
    }
    appendFileSync(process.env.SSOR_OUT!, lines.join("\n") + "\n", "utf8");
  }, 300_000);
});
