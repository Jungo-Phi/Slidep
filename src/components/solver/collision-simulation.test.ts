import { describe, expect, it } from "vitest";
import { DEFAULT_METADATA, DEFAULT_SIMULATION, Mechanism } from "../../types/mechanism";
import { Point2 } from "../../types/point2";
import type { BeamElement, ID, MechanicalElement, PivotElement } from "../../types/element";
import {
  RECORD_DT,
  compile_simulation_model,
  step_simulation,
} from "./simulation-engine";
import { KinematicSnapshot } from "../../types/runtime-state";
import { snapshot_point } from "./snapshot";

/**
 * End-to-end wiring of the `collisionsOn` toggle through `step_simulation`: a hammer beam
 * (pivoted, swung by a drag) against a fixed wall beam it is not otherwise connected to.
 */

let nextID = 0;
const id = (): ID =>
  `00000000-0000-0000-0000-${String(++nextID).padStart(12, "0")}` as ID;

const pivot = (
  pid: ID,
  position: Point2,
  extra: Partial<PivotElement> = {},
): PivotElement => ({
  type: "pivot",
  id: pid,
  probes: [],
  overlays: {},
  position,
  isGrounded: true,
  rotatingEdgesIDs: [],
  fixedGearsIDs: [],
  rotationalFriction: 0,
  ...extra,
});

const beam = (
  bid: ID,
  start: Point2,
  end: Point2,
  startID?: ID,
  endID?: ID,
): BeamElement => ({
  type: "beam",
  id: bid,
  probes: [],
  overlays: {},
  positionStart: start,
  positionEnd: end,
  fixedNodeStartID: startID,
  fixedNodeEndID: endID,
  fixedNodesBodyIDs: [],
  linearMass: 1,
});

function mechanism(mechanicalElements: MechanicalElement[]): Mechanism {
  return {
    metadata: DEFAULT_METADATA,
    viewport: { scale: 1, pan: new Point2(0, 0) },
    simulation: DEFAULT_SIMULATION,
    mechanicalElements,
    constraintElements: [],
    loads: [],
    history: [],
    future: [],
  };
}

/** Drags `tipKey` toward `target` for `frames` steps, returning where it ends up. */
function drag(
  before: Mechanism,
  tipKey: string,
  target: Point2,
  collisionsOn: boolean,
  frames = 40,
): Point2 {
  const model = compile_simulation_model(before);
  let snapshot: KinematicSnapshot | null = null;
  for (let i = 0; i < frames; i++) {
    snapshot = step_simulation(
      model,
      i * RECORD_DT,
      snapshot,
      RECORD_DT,
      { key: tipKey, target },
      undefined,
      undefined,
      undefined,
      collisionsOn,
    );
  }
  return snapshot_point(snapshot!, tipKey)!;
}

describe("collisionsOn dans step_simulation", () => {
  it("un marteau pivoté traverse librement un mur non connecté quand désactivé", () => {
    const HP = id();
    const HAMMER = id();
    const WS = id();
    const WE = id();
    const WALL = id();
    const before = mechanism([
      pivot(HP, new Point2(50, -30)),
      beam(HAMMER, new Point2(50, -30), new Point2(70, -30), HP, undefined),
      pivot(WS, new Point2(0, -15)),
      pivot(WE, new Point2(100, -15)),
      beam(WALL, new Point2(0, -15), new Point2(100, -15), WS, WE),
    ]);
    const tip = drag(before, `${HAMMER}:end`, new Point2(50, 10), false);
    // Pulled straight down past the wall (y = -15): without collisions it swings all the
    // way to where the rigid arm points straight down, past the wall.
    expect(tip.y).toBeGreaterThan(-12);
  });

  it("le même marteau est bloqué par le mur quand activé", () => {
    const HP = id();
    const HAMMER = id();
    const WS = id();
    const WE = id();
    const WALL = id();
    const before = mechanism([
      pivot(HP, new Point2(50, -30)),
      beam(HAMMER, new Point2(50, -30), new Point2(70, -30), HP, undefined),
      pivot(WS, new Point2(0, -15)),
      pivot(WE, new Point2(100, -15)),
      beam(WALL, new Point2(0, -15), new Point2(100, -15), WS, WE),
    ]);
    const tip = drag(before, `${HAMMER}:end`, new Point2(50, 10), true);
    // Stopped at the wall (y ≈ -15), well short of the free-swing rest point (y ≈ -10).
    expect(tip.y).toBeLessThan(-13);
  });

  it("bloque même une poutre partie loin du mur, tirée d'un coup dès la 1ère frame", () => {
    // Starts well beyond any fixed activation radius (35 units), so a filter that only
    // includes candidates already close would miss it entirely for this frame — and a hard
    // single-frame grab pull (a fast drag) reaches all the way across in that one frame,
    // with nothing left to catch it on the next.
    const HP = id();
    const HAMMER = id();
    const WS = id();
    const WE = id();
    const WALL = id();
    const before = mechanism([
      pivot(HP, new Point2(50, -60)),
      beam(HAMMER, new Point2(50, -60), new Point2(50, -105), HP, undefined),
      pivot(WS, new Point2(0, -70)),
      pivot(WE, new Point2(100, -70)),
      beam(WALL, new Point2(0, -70), new Point2(100, -70), WS, WE),
    ]);
    const tip = drag(before, `${HAMMER}:end`, new Point2(50, 10), true, 5);
    expect(tip.y).toBeLessThan(-68);
  });
});
