import { describe, expect, it } from "vitest";
import json from "../../../../test-mechanisms/Test Poulie sans masse_frottement (Loic).slidep?raw";
import { load_mechanism } from "../../../utils/load-mechanism";
import { Point2 } from "../../../types";
import { DynamicSnapshot } from "../../../types/runtime-state";
import { RECORD_DT, compile_simulation_model, step_dynamic_simulation } from "../dynamics/simulation-engine";
import { snapshot_belt_detached, snapshot_point } from "../snapshot";
import { BeltVia, belt_pieces } from "../../../utils/belt-path";
import { element_reactions } from "../recording/probe-series";
import { compute_force_balance } from "../analysis/force-balance";

// A grounded belt end runs down around a massless movable pulley carrying 2 kg on a massless beam, up over a fixed pulley, and down to 1 kg: balanced, every strand vertical.
// The movable pulley's node has no mass of its own, so the solver floors it; the floor must weigh nothing, or the 2 kg side outweighs the other and the balance creeps.

const GRAVITY = new Point2(0, -9.81);
const HEAVY = "2376acde-d09f-465b-8cbc-e2f13d06493f";
const LIGHT = "a47b7b1f-4456-4c6e-af86-a42f8ac5201b";
const MOVABLE_AXLE = "675fedfd-9ca3-4439-b0e1-fc9b2baadc49";
const FIXED_AXLE = "a9ab5144-1a0d-4521-a4cb-5c06d98cedea";
const ANCHOR = "618c8e93-4018-4a42-aebb-ed7daaf44116";
const BELT = "22392dd1-45ee-4fcd-a9e4-f0088c998fb8";

function simulate(seconds: number, each: (snapshot: DynamicSnapshot) => void): void {
  const model = compile_simulation_model(load_mechanism(JSON.parse(json)).mechanism, true, true);
  let snapshot: DynamicSnapshot | null = null;
  for (let i = 0; i < Math.round(seconds / RECORD_DT); i++) {
    snapshot = step_dynamic_simulation(model, i * RECORD_DT, snapshot, RECORD_DT, GRAVITY);
    each(snapshot);
  }
}

/** The belt's geometric length, over the pulleys it is still on. */
function belt_length(snapshot: DynamicSnapshot): number {
  const detached = snapshot_belt_detached(snapshot, BELT) ?? [];
  const vias: BeltVia[] = [{ pos: snapshot_point(snapshot, ANCHOR)!, radius: 0, clockwise: false }];
  if (!detached.includes(0)) vias.push({ pos: snapshot_point(snapshot, MOVABLE_AXLE)!, radius: 0.05, clockwise: true });
  if (!detached.includes(1)) vias.push({ pos: snapshot_point(snapshot, FIXED_AXLE)!, radius: 0.1, clockwise: true });
  vias.push({ pos: snapshot_point(snapshot, LIGHT)!, radius: 0, clockwise: false });
  return belt_pieces(vias, false).reduce((sum, piece) => sum + piece.length, 0);
}

describe("massless movable pulley (Test Poulie sans masse_frottement)", () => {
  it("stays balanced: the solver's mass floor adds no weight", () => {
    let start: number | undefined;
    let drift = 0;
    simulate(2, (snapshot) => {
      const y = snapshot_point(snapshot, HEAVY)!.y;
      start ??= y;
      drift = Math.max(drift, Math.abs(y - start));
    });
    // An unbalanced 10 g would have moved it 3 cm by now.
    expect(drift).toBeLessThan(1e-6);
  });

  it("keeps its belt length once the belt leaves the fixed pulley", () => {
    // Pulled off balance so the light mass climbs over the fixed pulley and the belt drops it.
    const model = compile_simulation_model(
      (() => {
        const mechanism = load_mechanism(JSON.parse(json)).mechanism;
        return {
          ...mechanism,
          mechanicalElements: mechanism.mechanicalElements.map((e) =>
            e.id === HEAVY && e.type === "mass" ? { ...e, mass: 2.1 } : e,
          ),
        };
      })(),
      true,
      true,
    );
    let snapshot: DynamicSnapshot | null = null;
    let initial: number | undefined;
    let detached = false;
    let worst = 0;
    for (let i = 0; i < Math.round(3 / RECORD_DT); i++) {
      snapshot = step_dynamic_simulation(model, i * RECORD_DT, snapshot, RECORD_DT, GRAVITY);
      const length = belt_length(snapshot);
      initial ??= length;
      const off = snapshot_belt_detached(snapshot, BELT) ?? [];
      if (off.length === 1 && off[0] === 1) {
        detached = true;
        worst = Math.max(worst, Math.abs(length - initial));
      }
    }
    expect(detached).toBe(true);
    expect(worst).toBeLessThan(1e-3 * initial!);
  });

  it("reports both supports' reactions, so the force balance closes", () => {
    // The belt has two grounded vias, its anchored end and the fixed pulley's axle; only the strands touching each one may answer for its reaction.
    const mechanism = load_mechanism(JSON.parse(json)).mechanism;
    let last: DynamicSnapshot | undefined;
    simulate(0.2, (snapshot) => (last = snapshot));
    const reaction = (id: string) => {
      const element = mechanism.mechanicalElements.find((e) => e.id === id)!;
      const [r] = element_reactions(element, last!);
      expect(r?.atAnchor).toBe(true);
      return r!.vector;
    };
    const tension = 9.81;
    expect(reaction(ANCHOR).y).toBeCloseTo(tension, 2);
    expect(reaction(FIXED_AXLE).y).toBeCloseTo(2 * tension, 2);
    const balance = compute_force_balance(mechanism, last!, GRAVITY)!;
    expect(balance.gap.length()).toBeLessThan(1e-2);
    expect(Math.abs(balance.gapMoment)).toBeLessThan(1e-2);
  });
});
